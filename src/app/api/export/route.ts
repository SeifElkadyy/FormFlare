import { currentUser, assertSameOrigin } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/login";
import { getServices } from "@/lib/env";
import {
  META_COLUMNS,
  buildFieldColumns,
  exportDateStamp,
  flattenRow,
  streamCsv,
} from "@/lib/export/csv";
import { parseFields } from "@/lib/submissions/fields";
import { listSubmissions, parseFilters } from "@/lib/submissions/query";
import { eq } from "drizzle-orm";
import { forms } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * GET /api/export?format=csv|json — export submissions matching the inbox filters.
 *
 * Streamed rather than assembled: an instance with 100k submissions would otherwise have
 * to hold the whole export in Worker memory before sending a byte.
 */
export async function GET(request: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // An export is a bulk read of every submission, so it gets the same origin check as a
  // mutation — a cross-site <img src="/api/export"> should not be able to trigger one.
  await assertSameOrigin();

  const { db } = await getServices();
  const url = new URL(request.url);
  const filters = parseFilters(url.searchParams);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";

  // Exports are the most sensitive read in the product: one request can remove every
  // submission from the instance's control.
  await audit(db, user.id, "submission.export", { format, ...filters });

  const stamp = exportDateStamp();

  if (format === "json") {
    const page = await listSubmissions(db, filters, null, 200);
    return Response.json(
      { exportedAt: Date.now(), submissions: page.items.map(serialise) },
      {
        headers: {
          "Content-Disposition": `attachment; filename="formflare-${stamp}.json"`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  /*
   * A single-form export gets one column per field, which is what anyone actually wants
   * to open in a spreadsheet. Across forms the union of keys is arbitrary and mostly
   * empty, so that export keeps the raw JSON column.
   *
   * The columns have to be fixed before the first byte is written, and the header is
   * emitted before any row is read — so they are derived from the first page plus the
   * form's configured fields. A field that appears only in a later page is therefore not
   * a column; its values are preserved in the trailing `data` column so nothing is lost.
   */
  let header: string[];
  let toRow: (row: Awaited<ReturnType<typeof listSubmissions>>["items"][number]) => unknown[];

  if (filters.formId) {
    const formRows = await db.select().from(forms).where(eq(forms.id, filters.formId)).limit(1);
    const configured = parseFields(formRows[0]?.fieldsJson ?? "[]")
      .filter((f) => f.type !== "file")
      .map((f) => f.name);

    const firstPage = await listSubmissions(db, filters, null, 200);
    const fieldColumns = buildFieldColumns(configured, firstPage.items);

    header = [...META_COLUMNS, ...fieldColumns, "data"];
    toRow = (row) => [...flattenRow(row, fieldColumns), row.dataJson];
  } else {
    header = [
      "id",
      "form",
      "email",
      "status",
      "waitlist_position",
      "country",
      "created_at",
      "data",
    ];
    toRow = (row) => [
      row.id,
      row.formName,
      row.email ?? "",
      row.status,
      row.waitlistPosition ?? "",
      row.country ?? "",
      new Date(row.createdAt).toISOString(),
      row.dataJson,
    ];
  }

  const stream = streamCsv({
    header,
    rows: async (cursor) => {
      const page = await listSubmissions(db, filters, cursor, 200);
      return { items: page.items, nextCursor: page.nextCursor };
    },
    toRow,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="formflare-${stamp}.csv"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}

function serialise(row: {
  id: string;
  formName: string;
  dataJson: string;
  email: string | null;
  status: string;
  waitlistPosition: number | null;
  country: string | null;
  createdAt: number;
}) {
  return {
    id: row.id,
    form: row.formName,
    data: safeParse(row.dataJson),
    email: row.email,
    status: row.status,
    waitlistPosition: row.waitlistPosition,
    country: row.country,
    createdAt: row.createdAt,
  };
}

function safeParse(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
