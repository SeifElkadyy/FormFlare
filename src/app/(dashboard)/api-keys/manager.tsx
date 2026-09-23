"use client";

import { useActionState, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Section } from "@/components/section";
import {
  btnDanger,
  btnPrimary,
  btnSecondary,
  btnToolbar,
  cn,
  codeBlockClass,
  errorClass,
  hintClass,
  inputClass,
  labelClass,
} from "@/lib/ui";
import { createKeyAction, revokeKeyAction, type ApiKeyState } from "./actions";

const initialState: ApiKeyState = {};

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: number | null;
}

/** For reading submissions from code. Posting to a form never needs one. */
export function ApiKeysPanel({ keys }: { keys: KeyRow[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <Section
      id="api"
      title="API keys"
      description={
        <>
          For reading submissions from your own code or tools like Zapier. Forms don&rsquo;t need a
          key. <a href="https://github.com/SeifElkadyy/FormFlare/blob/main/docs/api.md">API docs</a>
        </>
      }
    >
      {keys.length > 0 ? (
        <ul className="divide-y divide-neutral-100 rounded-xl bg-white shadow-[var(--shadow-border)] dark:divide-neutral-800 dark:bg-neutral-900">
          {keys.map((key) => (
            <li
              key={key.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{key.name}</p>
                <p className={`font-mono ${hintClass}`}>
                  {key.prefix}… ·{" "}
                  {key.lastUsedAt
                    ? `used ${new Date(key.lastUsedAt).toISOString().slice(0, 10)}`
                    : "never used"}
                </p>
              </div>
              <form
                action={revokeKeyAction}
                onSubmit={(event) => {
                  if (!confirm(`Revoke "${key.name}"? Anything using it stops working.`)) {
                    event.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="id" value={key.id} />
                <button type="submit" className={btnDanger}>
                  Revoke
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <CreateKey onDone={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          className={cn(btnSecondary, "self-start")}
          onClick={() => setAdding(true)}
        >
          Create a key
        </button>
      )}
    </Section>
  );
}

function CreateKey({ onDone }: { onDone: () => void }) {
  const [state, formAction, pending] = useActionState(createKeyAction, initialState);

  if (state.created) {
    return (
      <div className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-[var(--shadow-border)] dark:bg-neutral-900">
        <p className="text-sm font-medium">Copy your key now. It won&rsquo;t be shown again</p>
        <div className="flex items-start gap-2">
          <code className={cn(codeBlockClass, "min-w-0 flex-1")}>{state.created.plaintext}</code>
          <CopyButton text={state.created.plaintext} />
        </div>
        <p className={hintClass}>
          Send it as <code>Authorization: Bearer …</code>
        </p>
        <button type="button" className={cn(btnSecondary, "self-start")} onClick={onDone}>
          Done
        </button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-[var(--shadow-border)] dark:bg-neutral-900"
    >
      <label htmlFor="key-name" className={labelClass}>
        What is it for?
      </label>
      <input id="key-name" name="name" required placeholder="Zapier" className={inputClass} />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Creating…" : "Create key"}
        </button>
        <button type="button" className={btnToolbar} onClick={onDone}>
          Cancel
        </button>
        {state.error ? (
          <p role="alert" className={errorClass}>
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
