import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { forms } from "@/lib/db/schema";
import { getServices } from "@/lib/env";
import { parseOrigins } from "@/lib/spam/origin";
import { effectiveFields } from "@/lib/submissions/fields";
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
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{form.name}</h1>
        <p className="mt-1 font-mono text-xs break-all text-zinc-600 dark:text-zinc-400">
          {endpoint}
        </p>
      </div>

      <p>
        <a href={`/forms/${form.id}/preview`} className="text-sm underline">
          Preview this form &rarr;
        </a>
      </p>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Embed</h2>
        <pre className="overflow-x-auto rounded-lg border border-black/[.08] p-4 text-xs dark:border-white/[.145]">
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
