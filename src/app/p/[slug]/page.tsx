import { notFound } from "next/navigation";
import { getServices } from "@/lib/env";
import { loadHostedForm } from "@/lib/submissions/form-cache";
import { effectiveFields, fieldLabel } from "@/lib/submissions/fields";
import { BrandMark } from "@/components/brand-mark";
import { authCardClass, btnPrimary, hintClass, inputClass, labelClass, textareaClass } from "@/lib/ui";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function HostedFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string; embed?: string }>;
}) {
  const { slug } = await params;
  const { ref, embed } = await searchParams;
  const { db } = await getServices();
  const form = await loadHostedForm(db, slug);

  if (!form || !form.active) notFound();

  const fields = effectiveFields(form.fieldsJson, form.mode);
  const endpoint = `/f/${form.publicId}`;
  const framed = embed === "1";

  return (
    <div className={framed ? "min-h-0 bg-white p-4 dark:bg-ink" : "min-h-dvh bg-mist dark:bg-ink"}>
      {framed ? null : (
        <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
          <BrandMark href="/" />
        </header>
      )}
      <main className={framed ? "" : "flex justify-center px-4 py-12"}>
        <div className={`w-full max-w-md ${framed ? "" : authCardClass}`}>
          <h1 className="text-xl font-semibold tracking-tight">{form.name}</h1>
          {form.hostedDescription ? (
            <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-400">
              {form.hostedDescription}
            </p>
          ) : (
            <p className={`mt-2 ${hintClass}`}>
              {form.mode === "waitlist" ? "Join the waitlist." : `A ${BRAND.name} form.`}
            </p>
          )}

          <form action={endpoint} method="POST" className="mt-6 flex flex-col gap-4">
            <input
              type="text"
              name={form.honeypotField}
              className="hidden"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
            />
            {ref ? <input type="hidden" name="_ref" value={ref} /> : null}

            {fields.map((field) => {
              if (field.type === "file") {
                return (
                  <div key={field.name} className="flex flex-col gap-1">
                    <label htmlFor={field.name} className={labelClass}>
                      {fieldLabel(field.name)}
                      {field.required ? "" : " (optional)"}
                    </label>
                    <input
                      id={field.name}
                      name={field.name}
                      type="file"
                      required={field.required}
                      className={inputClass}
                    />
                  </div>
                );
              }
              if (field.type === "textarea") {
                return (
                  <div key={field.name} className="flex flex-col gap-1">
                    <label htmlFor={field.name} className={labelClass}>
                      {fieldLabel(field.name)}
                      {field.required ? "" : " (optional)"}
                    </label>
                    <textarea
                      id={field.name}
                      name={field.name}
                      required={field.required}
                      rows={4}
                      className={textareaClass}
                    />
                  </div>
                );
              }
              const type =
                field.type === "email"
                  ? "email"
                  : field.type === "number"
                    ? "number"
                    : field.type === "url"
                      ? "url"
                      : field.type === "tel"
                        ? "tel"
                        : "text";
              return (
                <div key={field.name} className="flex flex-col gap-1">
                  <label htmlFor={field.name} className={labelClass}>
                    {fieldLabel(field.name)}
                    {field.required ? "" : " (optional)"}
                  </label>
                  <input
                    id={field.name}
                    name={field.name}
                    type={type}
                    required={field.required}
                    className={inputClass}
                  />
                </div>
              );
            })}

            {form.turnstileSiteKey ? (
              <>
                <script
                  src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                  async
                  defer
                />
                <div className="cf-turnstile" data-sitekey={form.turnstileSiteKey} />
              </>
            ) : null}

            <button type="submit" className={btnPrimary}>
              {form.mode === "waitlist" ? "Join waitlist" : "Send"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
