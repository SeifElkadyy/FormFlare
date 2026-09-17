"use client";

import { useActionState } from "react";
import {
  deleteWebhookAction,
  testWebhookAction,
  toggleWebhookAction,
  type WebhookState,
} from "./actions";

const initialState: WebhookState = {};

interface Props {
  hook: { id: string; url: string; active: boolean; formName: string };
  deliveries: {
    id: string;
    status: string;
    attempts: number;
    lastStatusCode: number | null;
    lastError: string | null;
    updatedAt: number;
  }[];
}

const STATUS_MARK: Record<string, string> = { success: "✅", failed: "❌", pending: "⏳" };

export function WebhookRow({ hook, deliveries }: Props) {
  const [testState, testAction, testing] = useActionState(testWebhookAction, initialState);

  return (
    <li className="rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-xs break-all">{hook.url}</span>
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          {hook.formName}
          {!hook.active && " · disabled"}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <form action={testAction}>
          <input type="hidden" name="id" value={hook.id} />
          <button
            type="submit"
            disabled={testing}
            className="rounded-md border border-black/[.12] px-3 py-1 text-xs disabled:opacity-60 dark:border-white/[.18]"
          >
            {testing ? "Sending…" : "Send test"}
          </button>
        </form>

        <form action={toggleWebhookAction}>
          <input type="hidden" name="id" value={hook.id} />
          <button type="submit" className="text-xs text-zinc-600 underline dark:text-zinc-400">
            {hook.active ? "Disable" : "Enable"}
          </button>
        </form>

        <form
          action={deleteWebhookAction}
          onSubmit={(event) => {
            if (!confirm("Delete this webhook?")) event.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={hook.id} />
          <button type="submit" className="text-xs text-red-600 underline dark:text-red-400">
            Delete
          </button>
        </form>
      </div>

      {testState.error && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          Test failed: {testState.error}
        </p>
      )}

      {deliveries.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Recent deliveries</p>
          <ul className="mt-1 space-y-1">
            {deliveries.map((delivery) => (
              <li
                key={delivery.id}
                className="flex flex-wrap gap-2 text-xs text-zinc-600 dark:text-zinc-400"
              >
                <span aria-hidden>{STATUS_MARK[delivery.status] ?? "·"}</span>
                <span>{delivery.status}</span>
                {delivery.lastStatusCode !== null && <span>HTTP {delivery.lastStatusCode}</span>}
                {delivery.attempts > 1 && <span>{delivery.attempts} attempts</span>}
                <span>
                  {new Date(delivery.updatedAt).toISOString().slice(0, 19).replace("T", " ")}
                </span>
                {delivery.lastError && (
                  <span className="text-red-600 dark:text-red-400">{delivery.lastError}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
