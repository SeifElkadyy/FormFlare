"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { ExternalIcon } from "@/components/icons";
import { embedSnippets, type EmbedKind } from "@/lib/submissions/embed";
import {
  btnSecondary,
  cn,
  codeBlockClass,
  errorClass,
  hintClass,
  inputBase,
  labelClass,
  segmentItem,
  segmentTrack,
  successClass,
} from "@/lib/ui";
import { updateFormAction, type FormState } from "../../actions";

type Way = "link" | "widget" | "code";

const WAYS: { id: Way; title: string; hint: string }[] = [
  { id: "link", title: "Share a link", hint: "A ready-made page. Nothing to install." },
  { id: "widget", title: "Embed on your site", hint: "One line of code. Sizes itself." },
  { id: "code", title: "Use your own form", hint: "Your HTML and styling, our backend." },
];

const CODE: { id: EmbedKind; label: string }[] = [
  { id: "html", label: "HTML" },
  { id: "fetch", label: "JavaScript" },
  { id: "react", label: "React" },
];

const initialState: FormState = {};

export function SharePanel({
  formId,
  origin,
  publicId,
  slug,
  mode,
  honeypot,
  fieldsJson,
  active,
}: {
  formId: string;
  origin: string;
  publicId: string;
  slug: string;
  mode: string;
  honeypot: string;
  fieldsJson: string;
  active: boolean;
}) {
  const [way, setWay] = useState<Way>("link");
  const [code, setCode] = useState<EmbedKind>("html");
  const [state, formAction, pending] = useActionState(updateFormAction, initialState);

  const key = slug || publicId;
  const pageUrl = `${origin}/p/${key}`;
  const endpoint = `${origin}/f/${publicId}`;
  const widget = `<script src="${origin}/widget.js" data-form="${key}" async></script>`;
  const badge = `<img src="${origin}/f/${publicId}/badge.svg" alt="People on the waitlist" />`;
  const snippets = embedSnippets(endpoint, honeypot, mode, fieldsJson);

  return (
    <div className="flex flex-col gap-6">
      {!active ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          This form is paused. Visitors will see it but can&rsquo;t submit until you resume it.
        </p>
      ) : null}

      <div
        role="radiogroup"
        aria-label="How people reach this form"
        className="grid gap-3 sm:grid-cols-3"
      >
        {WAYS.map((item) => {
          const selected = way === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setWay(item.id)}
              className={cn(
                "press flex flex-col items-start gap-1 rounded-xl bg-white p-4 text-left dark:bg-neutral-900",
                selected
                  ? "shadow-[0_0_0_2px_var(--ink)] dark:shadow-[0_0_0_2px_var(--mist)]"
                  : "shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
              )}
            >
              <span className="text-sm font-medium">{item.title}</span>
              <span className={hintClass}>{item.hint}</span>
            </button>
          );
        })}
      </div>

      {way === "link" ? (
        <section className="flex flex-col gap-5">
          <CopyField label="Page link" value={pageUrl}>
            <a
              href={pageUrl}
              target="_blank"
              rel="noreferrer"
              className={`${btnSecondary} no-underline`}
            >
              Open
              <ExternalIcon />
            </a>
          </CopyField>

          <form action={formAction} className="flex flex-col gap-1.5">
            <input type="hidden" name="id" value={formId} />
            <input type="hidden" name="section" value="share" />
            <label htmlFor="slug" className={labelClass}>
              Custom address <span className="font-normal text-neutral-400">(optional)</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-neutral-500">{origin}/p/</span>
              <input
                id="slug"
                name="slug"
                defaultValue={slug}
                placeholder={publicId}
                className={cn(inputBase, "w-48")}
              />
              <button type="submit" disabled={pending} className={btnSecondary}>
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
            {state.error ? (
              <p role="alert" className={errorClass}>
                {state.error}
              </p>
            ) : state.saved && !pending ? (
              <p role="status" className={`${successClass} self-start`}>
                Saved. The old link still works.
              </p>
            ) : (
              <p className={hintClass}>
                Lowercase letters, numbers and dashes. The original link keeps working.
              </p>
            )}
          </form>

          {mode === "waitlist" ? (
            <CopyField
              label="Signup count badge"
              hint="An image that shows how many people have joined. Put it next to your link."
              value={badge}
            />
          ) : null}
        </section>
      ) : null}

      {way === "widget" ? (
        <section className="flex flex-col gap-5">
          <CopyField
            label="Paste where the form should appear"
            hint="Works in any site builder that allows custom HTML. The form resizes to fit."
            value={widget}
            code
          />
          {mode === "waitlist" ? (
            <p className={hintClass}>
              Referral links work automatically: when someone arrives with <code>?ref=</code> in the
              address, the widget passes it on.
            </p>
          ) : null}
        </section>
      ) : null}

      {way === "code" ? (
        <section className="flex flex-col gap-5">
          <CopyField
            label="Form address"
            hint="Send your form here (POST). No API key needed."
            value={endpoint}
          />
          <div className="flex flex-col gap-2">
            <nav aria-label="Language" className={`${segmentTrack} self-start`}>
              {CODE.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={code === item.id}
                  className={segmentItem(code === item.id)}
                  onClick={() => setCode(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
            <CopyField label="Starter code" value={snippets[code]} code />
            <p className={hintClass}>
              Keep the hidden <code>{honeypot}</code> field: bots fill it in, people don&rsquo;t. To
              accept posts only from your own site, add it under{" "}
              <Link href={`/forms/${formId}/settings#protection`}>Settings → Spam protection</Link>.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function CopyField({
  label,
  hint,
  value,
  code = false,
  children,
}: {
  label: string;
  hint?: string;
  value: string;
  code?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className={labelClass}>{label}</p>
      {hint ? <p className={hintClass}>{hint}</p> : null}
      <div className="flex items-start gap-2">
        <pre
          className={cn(
            codeBlockClass,
            "min-w-0 flex-1",
            code ? "max-h-72 overflow-auto whitespace-pre-wrap" : "",
          )}
        >
          <code>{value}</code>
        </pre>
        <div className="flex shrink-0 flex-col gap-2">
          <CopyButton text={value} />
          {children}
        </div>
      </div>
    </div>
  );
}
