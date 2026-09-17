"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Modal } from "@/components/modal";
import { PlusIcon } from "@/components/icons";
import {
  btnPrimary,
  btnPrimaryLead,
  codeBlockClass,
  errorClass,
  hintClass,
  inputClass,
  labelClass,
  selectClass,
} from "@/lib/ui";
import { createWebhookAction, type WebhookState } from "./actions";

const initialState: WebhookState = {};

export function CreateWebhookDialog({ forms }: { forms: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={btnPrimaryLead} onClick={() => setOpen(true)}>
        <PlusIcon />
        Add webhook
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add webhook"
        description="Each Slack, Discord or generic endpoint receives new submissions."
      >
        <CreateWebhookForm forms={forms} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function CreateWebhookForm({
  forms,
  onDone,
}: {
  forms: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(createWebhookAction, initialState);

  if (state.created) {
    const generic = state.created.preset === "generic";
    return (
      <div className="flex flex-col gap-3">
        {generic ? (
          <>
            <p className="text-sm font-medium">Signing secret</p>
            <p className={hintClass}>
              Shown once. Store it in your receiver to verify the <code>X-FormFlare-Signature</code>{" "}
              header.
            </p>
            <code className={codeBlockClass}>{state.created.secret}</code>
          </>
        ) : (
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            {state.created.preset === "slack" ? "Slack" : "Discord"} incoming webhook saved. No
            signing secret is needed — those receivers use their own URL token.
          </p>
        )}
        <div className="flex justify-end pt-1">
          <button type="button" className={btnPrimary} onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="preset" className={labelClass}>
          Destination
        </label>
        <select id="preset" name="preset" defaultValue="generic" className={selectClass}>
          <option value="generic">Generic (signed JSON)</option>
          <option value="slack">Slack incoming webhook</option>
          <option value="discord">Discord incoming webhook</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="url" className={labelClass}>
          Endpoint URL
        </label>
        <input
          id="url"
          name="url"
          type="url"
          required
          placeholder="https://example.com/hooks/formflare"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="formId" className={labelClass}>
          Form
        </label>
        <select id="formId" name="formId" className={selectClass}>
          <option value="">All forms</option>
          {forms.map((form) => (
            <option key={form.id} value={form.id}>
              {form.name}
            </option>
          ))}
        </select>
      </div>

      {state.error ? (
        <p role="alert" className={errorClass}>
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end pt-1">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Adding…" : "Add webhook"}
        </button>
      </div>
    </form>
  );
}
