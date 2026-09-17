"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Modal } from "@/components/modal";
import { PlusIcon } from "@/components/icons";
import {
  btnDanger,
  btnPrimary,
  btnPrimaryLead,
  codeBlockClass,
  emptyClass,
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
  createdAt: number;
}

export function CreateKeyDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={btnPrimaryLead} onClick={() => setOpen(true)}>
        <PlusIcon />
        New key
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New API key"
        description="Read submissions programmatically. The secret is shown once."
      >
        <CreateKeyForm onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function CreateKeyForm({ onDone }: { onDone: () => void }) {
  const [state, formAction, pending] = useActionState(createKeyAction, initialState);

  if (state.created) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">Your new API key</p>
        <p className={hintClass}>
          Shown once. Store it now — only a hash is kept, so it cannot be shown again.
        </p>
        <code className={codeBlockClass}>{state.created.plaintext}</code>
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
        <label htmlFor="name" className={labelClass}>
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder="Zapier integration"
          className={inputClass}
        />
      </div>

      {state.error ? (
        <p role="alert" className={errorClass}>
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end pt-1">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Creating…" : "Create key"}
        </button>
      </div>
    </form>
  );
}

export function ApiKeyList({ keys }: { keys: KeyRow[] }) {
  if (keys.length === 0) {
    return (
      <p className={emptyClass}>No API keys yet. Press <strong>New key</strong> to create one.</p>
    );
  }

  return (
    <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
      {keys.map((key) => (
        <li
          key={key.id}
          className="row-hover flex flex-wrap items-center justify-between gap-3 px-6 py-3.5"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{key.name}</p>
            <p className={`mt-0.5 font-mono ${hintClass}`}>{key.prefix}…</p>
          </div>
          <div className="flex items-center gap-3">
            <p className={hintClass}>
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
              <button type="submit" className={btnDanger}>
                Revoke
              </button>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}
