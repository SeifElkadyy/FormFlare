import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { forms } from "@/lib/db/schema";
import { getEnv, getServices } from "@/lib/env";
import { mailerStatus } from "@/lib/platform/resolve-mailer";
import { parseOrigins } from "@/lib/spam/origin";
import { hostedPath } from "@/lib/waitlist/slug";
import { FormWorkspace } from "./form-workspace";

export const dynamic = "force-dynamic";

export default async function FormDetailPage({ params }: { params: Promise<{ formId: string }> }) {
  await requireUser();
  const { formId } = await params;
  const { db, storage } = await getServices();
  const env = await getEnv();
  const mail = await mailerStatus(db, env);

  const rows = await db.select().from(forms).where(eq(forms.id, formId)).limit(1);
  const form = rows[0];
  if (!form) notFound();

  // Built from the live Host so the snippet is correct under any Worker name or
  // custom domain (design principle 2).
  const headerList = await headers();
  const host = headerList.get("host") ?? "your-worker.workers.dev";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const endpoint = `${proto}://${host}/f/${form.publicId}`;
  const hosted = `${proto}://${host}${hostedPath(form)}`;
  const widget = `${proto}://${host}/widget.js`;
  const badge = `${proto}://${host}/f/${form.publicId}/badge.svg`;

  return (
    <FormWorkspace
      endpoint={endpoint}
      hosted={hosted}
      widget={widget}
      formKey={form.slug ?? form.publicId}
      badge={badge}
      honeypot={form.honeypotField}
      form={{
        id: form.id,
        name: form.name,
        mode: form.mode,
        active: form.active,
        redirectUrl: form.redirectUrl,
        allowedOrigins: parseOrigins(form.allowedOriginsJson),
        fieldsJson: form.fieldsJson,
        turnstileSiteKey: form.turnstileSiteKey,
        hasTurnstileSecret: Boolean(form.turnstileSecret),
        notifyEmails: parseOrigins(form.notifyEmailsJson).join("\n"),
        autoReplyEnabled: form.autoReplyEnabled,
        autoReplySubject: form.autoReplySubject,
        autoReplyBody: form.autoReplyBody,
        slug: form.slug ?? "",
        hostedPath: hostedPath(form),
        hostedDescription: form.hostedDescription ?? "",
        doubleOptIn: form.doubleOptIn,
        referralBoost: form.referralBoost,
        uploadsAvailable: storage.available,
        mailerAvailable: mail.available,
      }}
    />
  );
}
