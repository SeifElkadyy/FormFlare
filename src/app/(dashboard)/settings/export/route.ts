import { NextResponse } from "next/server";
import { requireUserForMutation } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/login";
import { forms, submissions, webhooks } from "@/lib/db/schema";
import { getServices } from "@/lib/env";

export const dynamic = "force-dynamic";

/** POST so a stray GET (or a crafted link) cannot download every submission. */
export async function POST(): Promise<Response> {
  const user = await requireUserForMutation();
  const { db } = await getServices();

  const formRows = await db
    .select({
      id: forms.id,
      publicId: forms.publicId,
      name: forms.name,
      mode: forms.mode,
      slug: forms.slug,
      fieldsJson: forms.fieldsJson,
      createdAt: forms.createdAt,
    })
    .from(forms);

  const submissionRows = await db
    .select({
      id: submissions.id,
      formId: submissions.formId,
      dataJson: submissions.dataJson,
      email: submissions.email,
      status: submissions.status,
      waitlistPosition: submissions.waitlistPosition,
      country: submissions.country,
      createdAt: submissions.createdAt,
    })
    .from(submissions);

  const webhookRows = await db
    .select({
      id: webhooks.id,
      url: webhooks.url,
      preset: webhooks.preset,
      active: webhooks.active,
      formId: webhooks.formId,
    })
    .from(webhooks);

  await audit(db, user.id, "settings.export", { submissions: submissionRows.length });

  const body = JSON.stringify(
    {
      exportedAt: Date.now(),
      forms: formRows,
      submissions: submissionRows.map((row) => ({
        ...row,
        data: safeParse(row.dataJson),
        dataJson: undefined,
      })),
      webhooks: webhookRows,
    },
    null,
    2,
  );

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="formflare-export.json"`,
    },
  });
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return json;
  }
}
