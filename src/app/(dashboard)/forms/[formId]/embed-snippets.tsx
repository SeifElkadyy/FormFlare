"use client";

import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { embedSnippets, type EmbedKind } from "@/lib/submissions/embed";
import { cn, codeBlockClass, hintClass, segmentTrack } from "@/lib/ui";
import { FormFold } from "./form-fold";

type SharePath = "site" | "page" | "widget";

const PATHS: { id: SharePath; title: string; hint: string }[] = [
  { id: "site", title: "My website", hint: "Your HTML, CSS, or React. We take the POST." },
  { id: "page", title: "A link", hint: "FormFlare hosts the page. No CSS of yours." },
  { id: "widget", title: "A widget", hint: "One script tag. We draw the form." },
];

const CODE_TABS: { id: EmbedKind; label: string; blurb: string }[] = [
  { id: "html", label: "HTML", blurb: "A form tag. Style it on your site." },
  { id: "fetch", label: "fetch", blurb: "POST JSON. No API key." },
  { id: "react", label: "React", blurb: "A client component on the same URL." },
];

export function EmbedSnippets({
  endpoint,
  honeypot,
  mode,
  fieldsJson,
  hosted,
  widget,
  formKey,
  badge,
}: {
  endpoint: string;
  honeypot: string;
  mode: string;
  fieldsJson: string;
  hosted: string;
  widget: string;
  formKey: string;
  badge: string;
}) {
  const [path, setPath] = useState<SharePath>("site");
  const [tab, setTab] = useState<EmbedKind>("html");
  const snippets = embedSnippets(endpoint, honeypot, mode, fieldsJson);
  const widgetSnippet = `<script src="${widget}" data-form="${formKey}" async></script>`;

  return (
    <FormFold title="Share" status={path === "site" ? "My website" : path === "page" ? "A link" : "A widget"}>
      <p className={hintClass}>Pick one way. You can switch later.</p>

      <div className="rounded-2xl bg-neutral-50 p-1 dark:bg-neutral-950/40">
        <div className="grid gap-1 sm:grid-cols-3">
          {PATHS.map((item) => {
            const active = path === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "press flex flex-col items-start gap-1 rounded-xl p-3 text-left",
                  active
                    ? "bg-white shadow-[var(--shadow-border)] dark:bg-neutral-800"
                    : "text-neutral-600 dark:text-neutral-400",
                )}
                aria-pressed={active}
                onClick={() => setPath(item.id)}
              >
                <span className="text-sm font-medium text-neutral-950 dark:text-white">{item.title}</span>
                <span className="text-xs leading-5">{item.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {path === "site" ? (
        <div className="flex flex-col gap-3">
          <CopyRow label="Endpoint" value={endpoint} />
          <div className={segmentTrack}>
            {CODE_TABS.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "flex h-7 flex-1 items-center justify-center rounded-lg px-2.5 text-xs font-medium",
                    active
                      ? "bg-white text-neutral-900 shadow-[var(--shadow-border)] dark:bg-neutral-700 dark:text-neutral-50"
                      : "text-neutral-500",
                  )}
                  aria-pressed={active}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <p className={hintClass}>{CODE_TABS.find((item) => item.id === tab)?.blurb}</p>
          {tab === "fetch" ? (
            <p className={hintClass}>
              The browser sends this page’s Origin. Lock sites under Allowed websites if you use
              that list.
            </p>
          ) : null}
          <Snippet text={snippets[tab]} />
        </div>
      ) : null}

      {path === "page" ? (
        <div className="flex flex-col gap-3">
          <p className={hintClass}>
            Share this URL. Change the slug under Hosted page if you want a nicer path.
          </p>
          <CopyRow label="Hosted page" value={hosted} />
          {mode === "waitlist" ? (
            <CopyRow label="Count badge" value={`<img src="${badge}" alt="waitlist count" />`} />
          ) : null}
        </div>
      ) : null}

      {path === "widget" ? (
        <div className="flex flex-col gap-3">
          <p className={hintClass}>Paste this on any page. We render the fields you set below.</p>
          <Snippet text={widgetSnippet} />
          {mode === "waitlist" ? (
            <CopyRow label="Count badge" value={`<img src="${badge}" alt="waitlist count" />`} />
          ) : null}
        </div>
      ) : null}
    </FormFold>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className={hintClass}>{label}</p>
        <CopyButton text={value} />
      </div>
      <pre className={codeBlockClass}>
        <code>{value}</code>
      </pre>
    </div>
  );
}

function Snippet({ text }: { text: string }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-end">
        <CopyButton text={text} />
      </div>
      <pre className={`${codeBlockClass} max-h-40 overflow-auto`}>
        <code>{text}</code>
      </pre>
    </div>
  );
}
