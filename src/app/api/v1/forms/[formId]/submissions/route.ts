import { eq } from "drizzle-orm";
import { apiJson, apiNotFound, requireApiKey } from "@/lib/api/guard";
import { forms } from "@/lib/db/schema";
import { clampPageSize, listSubmissions, parseFilters } from "@/lib/submissions/query";

export const dynamic = "force-dynamic";

/** GET /api/v1/forms/:formId/submissions?cursor=&limit= */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ formId: string }> },
): Promise<Response> {
  const auth = await requireApiKey(request);
  if (!auth.ok) return auth.response;

  const { formId } = await params;
  const url = new URL(request.url);

  // The public id is what callers see; the internal id never leaves the instance.
  const rows = await auth.services.db
    .select({ id: forms.id })
    .from(forms)
    .where(eq(forms.publicId, formId))
    .limit(1);

  if (!rows[0]) return apiNotFound();

  const page = await listSubmissions(
    auth.services.db,
    { ...parseFilters(url.searchParams), formId: rows[0].id },
    url.searchParams.get("cursor"),
    clampPageSize(Number(url.searchParams.get("limit")) || undefined),
  );

  return apiJson({
    ok: true,
    submissions: page.items.map(serialise),
    nextCursor: page.nextCursor,
  });
}

function serialise(row: {
  id: string;
  dataJson: string;
  email: string | null;
  status: string;
  waitlistPosition: number | null;
  country: string | null;
  createdAt: number;
}) {
  return {
    id: row.id,
    data: safeParse(row.dataJson),
    email: row.email,
    status: row.status,
    ...(row.waitlistPosition !== null ? { waitlist: { position: row.waitlistPosition } } : {}),
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
