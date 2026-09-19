"use client";

import Script from "next/script";
import { BRAND } from "@/lib/brand";
import { fieldLabel, type FieldConfig } from "@/lib/submissions/fields";
import {
  authCardClass,
  btnPrimary,
  hintClass,
  inputClass,
  labelClass,
  sectionTitle,
  textareaClass,
} from "@/lib/ui";

export function FormPreviewPane({
  name,
  intro,
  mode,
  active,
  endpoint,
  honeypot,
  fields,
  turnstileSiteKey,
}: {
  name: string;
  intro: string;
  mode: string;
  active: boolean;
  endpoint: string;
  honeypot: string;
  fields: FieldConfig[];
  turnstileSiteKey: string | null;
}) {
  const title = name.trim() || "Untitled";
  const blurb =
    intro.trim() ||
    (mode === "waitlist" ? "Join the waitlist." : `A ${BRAND.name} form.`);

  return (
    <aside className="flex h-full min-h-0 flex-col bg-mist dark:bg-ink">
      <div className="shrink-0 px-5 py-4">
        <h2 className={sectionTitle}>Preview</h2>
        <p className={`${hintClass} mt-1`}>
          How the hosted page looks. Send is a real Inbox submission.
        </p>
      </div>

      <div className="flex flex-1 justify-center px-5 pb-8">
        <div className={`w-full max-w-md ${authCardClass}`}>
          {!active ? (
            <p className={`${hintClass} mb-4`}>Paused — visitors cannot submit.</p>
          ) : null}
          <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-400">{blurb}</p>

          <form action={endpoint} method="POST" className="mt-6 flex flex-col gap-4">
            <input
              type="text"
              name={honeypot}
              className="hidden"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
            />

            {fields.map((field, index) => (
              <PreviewField key={`${field.name}-${index}`} field={field} />
            ))}

            {turnstileSiteKey ? (
              <>
                <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />
                <Script
                  src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                  strategy="afterInteractive"
                />
              </>
            ) : null}

            <button type="submit" className={btnPrimary} disabled={!active}>
              {mode === "waitlist" ? "Join waitlist" : "Send"}
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function PreviewField({ field }: { field: FieldConfig }) {
  const id = `side-preview-${field.name}`;
  const label = `${fieldLabel(field.name || "field")}${field.required ? "" : " (optional)"}`;

  if (field.type === "file") {
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        <input id={id} name={field.name} type="file" required={field.required} className={inputClass} />
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        <textarea
          id={id}
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
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        name={field.name}
        type={type}
        required={field.required}
        className={inputClass}
      />
    </div>
  );
}
