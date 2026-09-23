"use client";

import { useState } from "react";
import { CloseIcon } from "@/components/icons";
import { originFromInput } from "@/lib/spam/origin-input";
import { btnSecondary, cn, errorClass, inputBase } from "@/lib/ui";

/**
 * Sites allowed to post from a browser. No "add this site" shortcut: the dashboard's own
 * address is never what the owner means, and hosted pages are always allowed anyway.
 */
export function OriginsEditor({ initial }: { initial: string[] }) {
  const [origins, setOrigins] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const origin = originFromInput(draft);
    if (!origin) {
      setError("Enter a site like https://yoursite.com");
      return;
    }
    setError(null);
    setOrigins((current) => (current.includes(origin) ? current : [...current, origin]));
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="allowedOrigins" value={origins.join("\n")} />
      {origins.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {origins.map((origin) => (
            <li
              key={origin}
              className="flex items-center gap-1 rounded-md bg-neutral-100 py-1 ps-2.5 pe-1 text-xs dark:bg-neutral-800"
            >
              <span className="font-mono">{origin}</span>
              <button
                type="button"
                className="press flex size-5 items-center justify-center rounded text-neutral-500"
                aria-label={`Remove ${origin}`}
                onClick={() => setOrigins((current) => current.filter((item) => item !== origin))}
              >
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <input
          aria-label="Add a website"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="https://yoursite.com"
          className={cn(inputBase, "min-w-0 flex-1")}
        />
        <button type="button" className={btnSecondary} onClick={add}>
          Add
        </button>
      </div>
      {error ? (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
