"use client";

import { useActionState } from "react";
import { createKeyAction, revokeKeyAction, type ApiKeyState } from "./actions";

const initialState: ApiKeyState = {};

interface Props {
  keys: {
    id: string;
    name: string;
    prefix: string;
    lastUsedAt: number | null;
    createdAt: number;
  }[];
}

export function ApiKeyManager({ keys }: Props) {
  const [state, formAction, pending] = useActionState(createKeyAction, initialState);

  return (
    <div className="space-y-6">
      <form
        action={formAction}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]"
      >
        <div className="min-w-48 flex-1 space-y-1">
          <label htmlFor="name" className="block text-sm font-medium">
            New key
          </label>
          <input
            id="name"
            name="name"
            required
            placeholder="Zapier integration"
            className="w-full rounded-md border border-black/[.12] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/[.18]"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create key"}
        </button>

        {state.error && (
          <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}
      </form>

      {state.created && (
        <div
          role="status"
          className="rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]"
        >
          <p className="text-sm font-medium">Your new API key</p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Shown once. Store it now — only a hash is kept, so it cannot be shown again.
          </p>
          <code className="mt-2 block rounded bg-black/[.06] p-2 font-mono text-xs break-all dark:bg-white/[.08]">
            {state.created.plaintext}
          </code>
        </div>
      )}

      {keys.length === 0 ? (
        <p className="rounded-lg border border-black/[.08] p-6 text-sm text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
          No API keys yet. Create one to read submissions from your own code.
        </p>
      ) : (
        <ul className="space-y-3">
          {keys.map((key) => (
            <li
              key={key.id}
              className="flex flex-wrap items-baseline justify-between gap-3 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]"
            >
              <div>
                <p className="text-sm font-medium">{key.name}</p>
                <p className="mt-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  {key.prefix}…
                </p>
              </div>

              <div className="flex items-center gap-4">
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  {key.lastUsedAt
                    ? `Last used ${new Date(key.lastUsedAt).toISOString().slice(0, 10)}`
                    : "Never used"}
                </p>
                <form
                  action={revokeKeyAction}
                  onSubmit={(event) => {
                    if (!confirm(`Revoke "${key.name}"? Anything using it will stop working.`)) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="id" value={key.id} />
                  <button
                    type="submit"
                    className="text-xs text-red-600 underline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-red-400"
                  >
                    Revoke
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
