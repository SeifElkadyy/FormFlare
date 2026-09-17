"use client";

import { useActionState } from "react";
import { createWebhookAction, type WebhookState } from "./actions";

const initialState: WebhookState = {};

export function CreateWebhookForm({ forms }: { forms: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createWebhookAction, initialState);

  return (
    <div className="space-y-3">
      <form
        action={formAction}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]"
      >
        <div className="min-w-64 flex-1 space-y-1">
          <label htmlFor="url" className="block text-sm font-medium">
            Endpoint URL
          </label>
          <input
            id="url"
            name="url"
            type="url"
            required
            placeholder="https://example.com/hooks/formflare"
            className="w-full rounded-md border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="formId" className="block text-sm font-medium">
            Form
          </label>
          <select
            id="formId"
            name="formId"
            className="rounded-md border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]"
          >
            <option value="">All forms</option>
            {forms.map((form) => (
              <option key={form.id} value={form.id}>
                {form.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add webhook"}
        </button>

        {state.error && (
          <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}
      </form>

      {state.created && (
        <div className="rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
          <p className="text-sm font-medium">Signing secret</p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Shown once. Store it in your receiver to verify the <code>X-FormFlare-Signature</code>{" "}
            header.
          </p>
          <code className="mt-2 block rounded bg-black/[.06] p-2 font-mono text-xs break-all dark:bg-white/[.08]">
            {state.created.secret}
          </code>
        </div>
      )}
    </div>
  );
}
