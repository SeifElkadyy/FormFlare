"use client";

import { useActionState, useState } from "react";
import {
  createWebhookAction,
  deleteWebhookAction,
  testWebhookAction,
  toggleWebhookAction,
  type WebhookState,
} from "../../../webhooks/actions";
import { LocalTime } from "../../../inbox/local-time";
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
  selectClass,
} from "@/lib/ui";

const initialState: WebhookState = {};

const PRESET_LABEL: Record<string, string> = {
  generic: "Any URL",
  slack: "Slack",
  discord: "Discord",
};

export interface HookRow {
  id: string;
  url: string;
  active: boolean;
  preset: string;
  allForms: boolean;
  deliveries: {
    id: string;
    status: string;
    lastStatusCode: number | null;
    lastError: string | null;
    updatedAt: number;
  }[];
}

/** Send each submission somewhere else: Slack, Discord, n8n, Zapier, your server. */
export function FormWebhooks({ formId, hooks }: { formId: string; hooks: HookRow[] }) {
  const [adding, setAdding] = useState(hooks.length === 0);

  return (
    <div className="flex flex-col gap-4">
      <p className={hintClass}>
        Send every new submission to Slack, Discord, or any URL (n8n, Zapier, Make, your own
        server). Retried automatically if it fails.
      </p>

      {hooks.length > 0 ? (
        <ul className="divide-y divide-neutral-100 rounded-xl bg-white shadow-[var(--shadow-border)] dark:divide-neutral-800 dark:bg-neutral-900">
          {hooks.map((hook) => (
            <HookItem key={hook.id} hook={hook} />
          ))}
        </ul>
      ) : null}

      {adding ? (
        <AddHook formId={formId} onDone={() => setAdding(false)} canCancel={hooks.length > 0} />
      ) : (
        <button
          type="button"
          className={cn(btnSecondary, "self-start")}
          onClick={() => setAdding(true)}
        >
          Add a webhook
        </button>
      )}
    </div>
  );
}

function HookItem({ hook }: { hook: HookRow }) {
  const [testState, testAction, testing] = useActionState(testWebhookAction, initialState);
  const last = hook.deliveries[0];

  return (
    <li className="flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs">{hook.url}</p>
          <p className={hintClass}>
            {PRESET_LABEL[hook.preset] ?? hook.preset}
            {hook.allForms ? " · all forms" : ""}
            {!hook.active ? " · paused" : ""}
            {last ? (
              <>
                {" · last "}
                <span className={last.status === "failed" ? "text-red-700 dark:text-red-400" : ""}>
                  {last.status === "success" ? "delivered" : last.status}
                  {last.lastStatusCode ? ` (${last.lastStatusCode})` : ""}
                </span>{" "}
                <LocalTime timestamp={last.updatedAt} />
              </>
            ) : null}
          </p>
          {last?.status === "failed" && last.lastError ? (
            <p className="mt-1 text-xs text-red-700 dark:text-red-400">{last.lastError}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <form action={testAction}>
            <input type="hidden" name="id" value={hook.id} />
            <button type="submit" disabled={testing} className={btnToolbar}>
              {testing ? "Sending…" : "Send test"}
            </button>
          </form>
          <form action={toggleWebhookAction}>
            <input type="hidden" name="id" value={hook.id} />
            <button type="submit" className={btnToolbar}>
              {hook.active ? "Pause" : "Resume"}
            </button>
          </form>
          <form
            action={deleteWebhookAction}
            onSubmit={(event) => {
              if (
                !confirm(
                  hook.allForms ? "Delete this webhook for all forms?" : "Delete this webhook?",
                )
              ) {
                event.preventDefault();
              }
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
        <p role="alert" className={errorClass}>
          Test failed: {testState.error}
        </p>
      ) : null}
    </li>
  );
}

function AddHook({
  formId,
  onDone,
  canCancel,
}: {
  formId: string;
  onDone: () => void;
  canCancel: boolean;
}) {
  const [state, formAction, pending] = useActionState(createWebhookAction, initialState);

  if (state.created) {
    return (
      <div className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-[var(--shadow-border)] dark:bg-neutral-900">
        {state.created.preset === "generic" ? (
          <>
            <p className="text-sm font-medium">Webhook added. Copy its signing secret now</p>
            <p className={hintClass}>
              It&rsquo;s shown once. Your server uses it to check a request really came from here
              (the <code>X-FormFlare-Signature</code> header). Skip it if you don&rsquo;t verify.
            </p>
            <code className={codeBlockClass}>{state.created.secret}</code>
          </>
        ) : (
          <p className="text-sm">Webhook added. New submissions will post there.</p>
        )}
        <button type="button" className={cn(btnSecondary, "self-start")} onClick={onDone}>
          Done
        </button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-[var(--shadow-border)] dark:bg-neutral-900"
    >
      <input type="hidden" name="formId" value={formId} />
      <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="preset" className={labelClass}>
            Send to
          </label>
          <select id="preset" name="preset" defaultValue="generic" className={selectClass}>
            <option value="generic">Any URL</option>
            <option value="slack">Slack</option>
            <option value="discord">Discord</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="url" className={labelClass}>
            Webhook URL
          </label>
          <input
            id="url"
            name="url"
            type="url"
            required
            placeholder="https://hooks.slack.com/services/…"
            className={inputClass}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Adding…" : "Add webhook"}
        </button>
        {canCancel ? (
          <button type="button" className={btnToolbar} onClick={onDone}>
            Cancel
          </button>
        ) : null}
        {state.error ? (
          <p role="alert" className={errorClass}>
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
