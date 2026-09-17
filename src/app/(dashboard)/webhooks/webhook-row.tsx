"use client";

import { useActionState } from "react";
import {
  deleteWebhookAction,
  testWebhookAction,
  toggleWebhookAction,
  type WebhookState,
} from "./actions";
import { btnDanger, btnToolbar, errorClass, hintClass, pillClass } from "@/lib/ui";

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

export function WebhookRow({ hook, deliveries }: Props) {
  const [testState, testAction, testing] = useActionState(testWebhookAction, initialState);

  return (
    <li className="row-hover px-6 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="break-all font-mono text-xs text-neutral-800 dark:text-neutral-200">{hook.url}</span>
          <p className={`mt-1 ${hintClass}`}>
            {hook.formName}
            {!hook.active ? " · disabled" : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <form action={testAction}>
            <input type="hidden" name="id" value={hook.id} />
            <button type="submit" disabled={testing} className={btnToolbar}>
              {testing ? "Sending…" : "Send test"}
            </button>
          </form>

          <form action={toggleWebhookAction}>
            <input type="hidden" name="id" value={hook.id} />
            <button type="submit" className={btnToolbar}>
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
            <button type="submit" className={btnDanger}>
              Delete
            </button>
          </form>
        </div>
      </div>

      {testState.error ? (
        <p role="alert" className={`mt-2 ${errorClass}`}>
          Test failed: {testState.error}
        </p>
      ) : null}

      {deliveries.length > 0 ? (
        <div className="mt-3">
          <p className={`font-medium ${hintClass}`}>Recent deliveries</p>
          <ul className="mt-1 flex flex-col gap-1">
            {deliveries.map((delivery) => (
              <li key={delivery.id} className={`flex flex-wrap items-center gap-2 ${hintClass}`}>
                <span className={pillClass}>{delivery.status}</span>
                {delivery.lastStatusCode !== null ? <span>HTTP {delivery.lastStatusCode}</span> : null}
                {delivery.attempts > 1 ? <span>{delivery.attempts} attempts</span> : null}
                <span className="tabular-nums">
                  {new Date(delivery.updatedAt).toISOString().slice(0, 19).replace("T", " ")}
                </span>
                {delivery.lastError ? (
                  <span className="text-red-700 dark:text-red-400">{delivery.lastError}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}
