"use client";

import { useState, useSyncExternalStore } from "react";
import { CloseIcon } from "@/components/icons";
import { originFromInput } from "@/lib/spam/origin-input";
import { btnGhost, btnSecondary, hintClass, inputClass, labelClass } from "@/lib/ui";

function subscribe() {
  return () => undefined;
}

export function OriginsEditor({ initial }: { initial: string[] }) {
  const [origins, setOrigins] = useState(initial);
  const pageOrigin = useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => "",
  );
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const value = draft ?? pageOrigin;

  function add(raw: string) {
    const origin = originFromInput(raw);
    if (!origin) {
      setError("Enter a site like https://yoursite.com");
      return;
    }
    setError(null);
    setOrigins((current) => (current.includes(origin) ? current : [...current, origin]));
    setDraft(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="allowedOrigins" value={origins.join("\n")} />

      {origins.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {origins.map((origin) => (
            <li
              key={origin}
              className="flex items-center gap-1 rounded-lg bg-neutral-50 py-1 ps-2.5 pe-1 text-xs dark:bg-neutral-800"
            >
              <span className="font-mono">{origin}</span>
              <button
                type="button"
                className="press flex h-6 w-6 items-center justify-center rounded-md text-neutral-500"
                aria-label={`Remove ${origin}`}
                onClick={() => setOrigins((current) => current.filter((item) => item !== origin))}
              >
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={hintClass}>
          Empty means any site may submit. Fetch from a browser sends that page’s Origin.
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="originDraft" className={labelClass}>
          Site origin
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="originDraft"
            value={value}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add(value);
              }
            }}
            placeholder="https://yoursite.com"
            className={`${inputClass} min-w-0 flex-1`}
          />
          <button type="button" className={btnSecondary} onClick={() => add(value)}>
            Add
          </button>
          <button type="button" className={btnGhost} onClick={() => add(pageOrigin)}>
            Add this site
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
