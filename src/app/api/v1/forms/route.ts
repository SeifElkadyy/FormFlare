import { desc } from "drizzle-orm";
import { apiJson, requireApiKey } from "@/lib/api/guard";
import { forms } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** GET /api/v1/forms — list forms. */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireApiKey(request);
  if (!auth.ok) return auth.response;

  const rows = await auth.services.db
    .select({
      id: forms.publicId,
      name: forms.name,
      mode: forms.mode,
      active: forms.active,
      submissionCount: forms.submissionCount,
      createdAt: forms.createdAt,
    })
    .from(forms)
    .orderBy(desc(forms.createdAt));

  return apiJson({ ok: true, forms: rows });
}
