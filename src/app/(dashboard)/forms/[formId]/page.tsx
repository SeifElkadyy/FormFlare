import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { forms } from "@/lib/db/schema";
import { getServices } from "@/lib/env";
import { parseOrigins } from "@/lib/spam/origin";
import { effectiveFields } from "@/lib/submissions/fields";
import { PageHeader } from "@/components/page-header";
import { ChevronRightIcon } from "@/components/icons";
import { btnSecondary, cardClass, codeBlockClass, sectionTitle } from "@/lib/ui";
import { FormSettings } from "./form-settings";

export const dynamic = "force-dynamic";

export default async function FormDetailPage({ params }: { params: Promise<{ formId: string }> }) {
  await requireUser();
  const { formId } = await params;
  const { db, storage } = await getServices();

  const rows = await db.select().from(forms).where(eq(forms.id, formId)).limit(1);
  const form = rows[0];
  if (!form) notFound();

  // Built from the live Host so the snippet is correct under any Worker name or
  // custom domain (design principle 2).
  const headerList = await headers();
  const host = headerList.get("host") ?? "your-worker.workers.dev";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const endpoint = `${proto}://${host}/f/${form.publicId}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={form.name}
        description={<span className="font-mono text-xs break-all">{endpoint}</span>}
        actions={
          <Link href={`/forms/${form.id}/preview`} className={`${btnSecondary} no-underline`}>
            Preview
            <span className="translate-x-px">
              <ChevronRightIcon />
            </span>
          </Link>
        }
      />

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-6">
      <section className={cardClass}>
        <h2 className={sectionTitle}>Embed</h2>
        <pre className={`${codeBlockClass} mt-3`}>
          <code>{embedSnippet(endpoint, form.honeypotField, form.mode, form.fieldsJson)}</code>
        </pre>
      </section>

      <FormSettings
        form={{
          id: form.id,
          name: form.name,
          active: form.active,
          redirectUrl: form.redirectUrl,
          allowedOrigins: parseOrigins(form.allowedOriginsJson).join("\n"),
          turnstileSiteKey: form.turnstileSiteKey,
          hasTurnstileSecret: Boolean(form.turnstileSecret),
          notifyEmails: parseOrigins(form.notifyEmailsJson).join("\n"),
          autoReplyEnabled: form.autoReplyEnabled,
          autoReplySubject: form.autoReplySubject,
          autoReplyBody: form.autoReplyBody,
          uploadsAvailable: storage.available,
        }}
      />
      </div>
    </div>
  );
}

function embedSnippet(
  endpoint: string,
  honeypot: string,
  mode: string,
  fieldsJson: string,
): string {
  // Built from the same field list the preview renders, so the snippet and the preview
  // can never drift apart.
  const fields = effectiveFields(fieldsJson, mode)
    .filter((f) => f.type !== "file")
    .map((field) => {
      const required = field.required ? " required" : "";
      if (field.type === "textarea") {
        return `  <textarea name="${field.name}"${required}></textarea>`;
      }
      const type =
        field.type === "email" ? ' type="email"' : field.type === "number" ? ' type="number"' : "";
      return `  <input name="${field.name}"${type}${required} />`;
    })
    .join("\n");

  return `<form action="${endpoint}" method="POST">
  <!-- Hidden from people, filled by bots. Leave it in. -->
  <input type="text" name="${honeypot}" style="display:none" tabindex="-1" autocomplete="off" />
${fields}
  <button type="submit">Send</button>
</form>`;
}
