import { apiJson, apiNotFound, requireApiKey } from "@/lib/api/guard";
import { getSubmission } from "@/lib/submissions/query";

export const dynamic = "force-dynamic";

/** GET /api/v1/submissions/:id */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiKey(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const row = await getSubmission(auth.services.db, id);

  // 404 rather than 403 for an id outside this instance: see apiNotFound().
  if (!row) return apiNotFound();

  return apiJson({
    ok: true,
    submission: {
      id: row.id,
      form: { id: row.formPublicId, name: row.formName },
      data: safeParse(row.dataJson),
      email: row.email,
      status: row.status,
      ...(row.waitlistPosition !== null ? { waitlist: { position: row.waitlistPosition } } : {}),
      country: row.country,
      createdAt: row.createdAt,
    },
  });
}

function safeParse(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
