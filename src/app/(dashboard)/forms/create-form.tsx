"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { PlusIcon } from "@/components/icons";
import {
  btnPrimary,
  btnPrimaryLead,
  cn,
  errorClass,
  hintClass,
  inputClass,
  labelClass,
} from "@/lib/ui";
import { createFormAction, type FormState } from "./actions";

const initialState: FormState = {};

const KINDS = [
  {
    mode: "standard",
    title: "Contact form",
    hint: "Messages, quotes, applications. Name, email and message to start.",
    name: "Contact",
  },
  {
    mode: "waitlist",
    title: "Waitlist",
    hint: "Collect emails and tell people their place in line. Referrals optional.",
    name: "Waitlist",
  },
] as const;

/** Header button plus dialog. The action redirects into the new form. */
export function CreateFormDialog({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const router = useRouter();

  function close() {
    setOpen(false);
    if (defaultOpen) router.replace("/forms");
  }

  return (
    <>
      <button type="button" className={btnPrimaryLead} onClick={() => setOpen(true)}>
        <PlusIcon />
        New form
      </button>
      <Modal open={open} onClose={close} title="New form">
        {open ? <CreateFormFields /> : null}
      </Modal>
    </>
  );
}

/** Also rendered inline as the empty state of the forms list. */
export function CreateFormFields() {
  const [state, formAction, pending] = useActionState(createFormAction, initialState);
  const [mode, setMode] = useState<(typeof KINDS)[number]["mode"]>("standard");
  const kind = KINDS.find((k) => k.mode === mode) ?? KINDS[0];

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="mode" value={mode} />
      <div role="radiogroup" aria-label="Kind of form" className="grid gap-2 sm:grid-cols-2">
        {KINDS.map((item) => {
          const selected = item.mode === mode;
          return (
            <button
              key={item.mode}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setMode(item.mode)}
              className={cn(
                "press flex flex-col items-start gap-1 rounded-xl bg-white p-4 text-left dark:bg-neutral-900",
                selected
                  ? "shadow-[0_0_0_2px_var(--ink)] dark:shadow-[0_0_0_2px_var(--mist)]"
                  : "shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
              )}
            >
              <span className="text-sm font-medium">{item.title}</span>
              <span className={hintClass}>{item.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-form-name" className={labelClass}>
          Name
        </label>
        <input
          id="new-form-name"
          name="name"
          key={kind.name}
          placeholder={kind.name}
          className={inputClass}
        />
        <p className={hintClass}>Only you see this. You can change it later.</p>
      </div>

      {state.error ? (
        <p role="alert" className={errorClass}>
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={cn(btnPrimary, "self-start")}>
        {pending ? "Creating…" : "Create form"}
      </button>
    </form>
  );
}
