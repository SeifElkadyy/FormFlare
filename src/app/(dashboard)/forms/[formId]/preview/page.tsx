import Script from "next/script";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { forms } from "@/lib/db/schema";
import { getServices } from "@/lib/env";
import { effectiveFields, fieldLabel } from "@/lib/submissions/fields";
import { PageHeader } from "@/components/page-header";
import { btnPrimary, cardClass, inputClass, labelClass, textareaClass } from "@/lib/ui";

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

  // Same fields the embed snippet shows, so the owner tests the form their visitors
  // will actually see.
  const visible = effectiveFields(form.fieldsJson, form.mode).filter((f) => f.type !== "file");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={`Preview — ${form.name}`}
        description="A real submission. The form page also shows this beside settings."
      />

      <form action={endpoint} method="POST" className={`${cardClass} mx-6 my-6 flex max-w-md flex-col gap-4`}>
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
          <div key={field.name} className="flex flex-col gap-1">
            <label htmlFor={`preview-${field.name}`} className={labelClass}>
              {fieldLabel(field.name)}
              {field.required ? "" : " (optional)"}
            </label>
            {field.type === "textarea" ? (
              <textarea
                id={`preview-${field.name}`}
                name={field.name}
                required={field.required}
                rows={3}
                className={textareaClass}
              />
            ) : (
              <input
                id={`preview-${field.name}`}
                name={field.name}
                type={
                  field.type === "email"
                    ? "email"
                    : field.type === "number"
                      ? "number"
                      : field.type === "url"
                        ? "url"
                        : field.type === "tel"
                          ? "tel"
                          : "text"
                }
                required={field.required}
                className={inputClass}
              />
            )}
          </div>
        ))}

        {form.turnstileSiteKey ? (
          <>
            <div className="cf-turnstile" data-sitekey={form.turnstileSiteKey} />
            <Script
              src="https://challenges.cloudflare.com/turnstile/v0/api.js"
              strategy="afterInteractive"
            />
          </>
        ) : null}

        <button type="submit" className={`${btnPrimary} self-start`}>
          Send test submission
        </button>
      </form>
    </div>
  );
}
