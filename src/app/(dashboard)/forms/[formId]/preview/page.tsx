import Script from "next/script";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { forms } from "@/lib/db/schema";
import { getServices } from "@/lib/env";
import { parseFields } from "@/lib/submissions/fields";

export const dynamic = "force-dynamic";

/**
 * Live preview of a form, rendered by FormFlare itself.
 *
 * This is the first page we serve that embeds the Turnstile widget, which makes it the
 * thing that actually exercises the `challenges.cloudflare.com` entries in the CSP. The
 * embed snippet runs on the owner's own site under their policy, so until this page
 * existed our allowance was untested.
 *
 * It also gives the owner a way to confirm their Turnstile keys work before pointing a
 * real site at the endpoint.
 */
export default async function FormPreviewPage({ params }: { params: Promise<{ formId: string }> }) {
  await requireUser();
  const { formId } = await params;
  const { db } = await getServices();

  const rows = await db.select().from(forms).where(eq(forms.id, formId)).limit(1);
  const form = rows[0];
  if (!form) notFound();

  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:8788";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const endpoint = `${proto}://${host}/f/${form.publicId}`;

  const fields = parseFields(form.fieldsJson).filter((f) => f.type !== "file");
  const visible =
    fields.length > 0 ? fields : [{ name: "email", type: "email" as const, required: true }];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Preview — {form.name}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          A real submission. Use it to check your fields and Turnstile keys before pointing a site
          at the endpoint.
        </p>
      </div>

      <form
        action={endpoint}
        method="POST"
        className="max-w-md space-y-4 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]"
      >
        {/* Hidden from people, filled by bots. */}
        <input
          type="text"
          name={form.honeypotField}
          style={{ display: "none" }}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />

        {visible.map((field) => (
          <div key={field.name} className="space-y-1">
            <label htmlFor={`preview-${field.name}`} className="block text-sm font-medium">
              {field.name}
            </label>
            {field.type === "textarea" ? (
              <textarea
                id={`preview-${field.name}`}
                name={field.name}
                required={field.required}
                rows={3}
                className="w-full rounded-md border border-black/[.12] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/[.18]"
              />
            ) : (
              <input
                id={`preview-${field.name}`}
                name={field.name}
                type={
                  field.type === "email" ? "email" : field.type === "number" ? "number" : "text"
                }
                required={field.required}
                className="w-full rounded-md border border-black/[.12] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/[.18]"
              />
            )}
          </div>
        ))}

        {form.turnstileSiteKey && (
          <>
            <div className="cf-turnstile" data-sitekey={form.turnstileSiteKey} />
            <Script
              src="https://challenges.cloudflare.com/turnstile/v0/api.js"
              strategy="afterInteractive"
            />
          </>
        )}

        <button
          type="submit"
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Send test submission
        </button>
      </form>
    </div>
  );
}
