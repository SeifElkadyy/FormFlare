import { desc, eq, inArray, isNull, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { forms, webhookDeliveries, webhooks } from "@/lib/db/schema";
import { getEnv, getServices } from "@/lib/env";
import { mailerStatus } from "@/lib/platform/resolve-mailer";
import { parseOrigins } from "@/lib/spam/origin";
import { PageBody } from "@/components/page-header";
import { hintClass } from "@/lib/ui";
import { DeleteFormButton, SettingsForm } from "./settings-form";
import { Section } from "@/components/section";
import { FormWebhooks } from "./webhooks";

export const dynamic = "force-dynamic";

export default async function FormSettingsPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  await requireUser();
  const { formId } = await params;
  const { db } = await getServices();
  const env = await getEnv();

  const rows = await db.select().from(forms).where(eq(forms.id, formId)).limit(1);
  const form = rows[0];
  if (!form) notFound();

  const [mail, hooks] = await Promise.all([
    mailerStatus(db, env),
    // This form's webhooks, plus the all-forms ones, which fire for it too.
    db
      .select()
      .from(webhooks)
      .where(or(eq(webhooks.formId, form.id), isNull(webhooks.formId)))
      .orderBy(desc(webhooks.createdAt)),
  ]);
  const deliveries = hooks.length
    ? await db
        .select()
        .from(webhookDeliveries)
        .where(
          inArray(
            webhookDeliveries.webhookId,
            hooks.map((h) => h.id),
          ),
        )
        .orderBy(desc(webhookDeliveries.updatedAt))
        .limit(100)
    : [];

  return (
    <PageBody narrow>
      <SettingsForm
        id={form.id}
        mode={form.mode}
        mailerAvailable={mail.available}
        notifyEmails={parseOrigins(form.notifyEmailsJson).join("\n")}
        autoReplyEnabled={form.autoReplyEnabled}
        autoReplySubject={form.autoReplySubject ?? ""}
        autoReplyBody={form.autoReplyBody ?? ""}
        redirectUrl={form.redirectUrl ?? ""}
        doubleOptIn={form.doubleOptIn}
        referralBoost={form.referralBoost}
        allowedOrigins={parseOrigins(form.allowedOriginsJson)}
        turnstileSiteKey={form.turnstileSiteKey ?? ""}
        hasTurnstileSecret={Boolean(form.turnstileSecret)}
      />

      <Section id="webhooks" title="Webhooks">
        <FormWebhooks
          formId={form.id}
          hooks={hooks.map((hook) => ({
            id: hook.id,
            url: hook.url,
            active: hook.active,
            preset: hook.preset,
            allForms: hook.formId === null,
            deliveries: deliveries
              .filter((d) => d.webhookId === hook.id)
              .slice(0, 1)
              .map((d) => ({
                id: d.id,
                status: d.status,
                lastStatusCode: d.lastStatusCode,
                lastError: d.lastError,
                updatedAt: d.updatedAt,
              })),
          }))}
        />
      </Section>

      <Section id="delete" title="Delete form">
        <p className={hintClass}>
          Removes the form, every submission and every uploaded file. This can&rsquo;t be undone. To
          stop new submissions but keep the data, pause the form instead.
        </p>
        <DeleteFormButton id={form.id} />
      </Section>
    </PageBody>
  );
}
