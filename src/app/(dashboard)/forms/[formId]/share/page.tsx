import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { forms } from "@/lib/db/schema";
import { getServices } from "@/lib/env";
import { originFromHost } from "@/lib/instance/url";
import { PageBody } from "@/components/page-header";
import { successClass } from "@/lib/ui";
import { agentPrompt } from "@/lib/submissions/agent-prompt";
import { parseOrigins } from "@/lib/spam/origin";
import { SharePanel } from "./share-panel";

export const dynamic = "force-dynamic";

export default async function FormSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ formId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  await requireUser();
  const { formId } = await params;
  const { created } = await searchParams;
  const { db } = await getServices();
  const rows = await db.select().from(forms).where(eq(forms.id, formId)).limit(1);
  const form = rows[0];
  if (!form) notFound();

  // From the live Host, so links are right under any Worker name or custom domain.
  const headerList = await headers();
  const origin = originFromHost(headerList.get("host") ?? "") ?? "";

  return (
    <PageBody className="flex flex-col gap-6">
      {created ? (
        <p className={successClass}>
          Your form is ready and already accepting submissions. Choose how people will reach it.
        </p>
      ) : null}
      <SharePanel
        formId={form.id}
        origin={origin}
        publicId={form.publicId}
        slug={form.slug ?? ""}
        mode={form.mode}
        honeypot={form.honeypotField}
        fieldsJson={form.fieldsJson}
        active={form.active}
        prompt={agentPrompt({
          name: form.name,
          mode: form.mode,
          endpoint: `${origin}/f/${form.publicId}`,
          pageUrl: `${origin}/p/${form.slug ?? form.publicId}`,
          honeypot: form.honeypotField,
          fieldsJson: form.fieldsJson,
          allowedOrigins: parseOrigins(form.allowedOriginsJson),
          turnstileSiteKey: form.turnstileSiteKey,
          turnstileRequired: Boolean(form.turnstileSecret),
        })}
      />
    </PageBody>
  );
}
