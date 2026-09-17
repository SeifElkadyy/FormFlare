"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { PlusIcon } from "@/components/icons";
import { btnPrimary, btnPrimaryLead, errorClass, inputClass, labelClass, selectClass } from "@/lib/ui";
import { createFormAction, type FormState } from "./actions";

const initialState: FormState = {};

export function CreateFormDialog({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const router = useRouter();

  function close() {
    setOpen(false);
    if (defaultOpen) router.replace("/forms");
  }

  function onCreated() {
    close();
    router.refresh();
  }

  return (
    <>
      <button type="button" className={btnPrimaryLead} onClick={() => setOpen(true)}>
        <PlusIcon />
        New form
      </button>
      <Modal
        open={open}
        onClose={close}
        title="New form"
        description="You’ll get fields you can edit, an endpoint, and snippets to paste into your site."
      >
        <CreateFormFields onCreated={onCreated} />
      </Modal>
    </>
  );
}

function CreateFormFields({ onCreated }: { onCreated: () => void }) {
  const [state, formAction, pending] = useActionState(createFormAction, initialState);

  useEffect(() => {
    if (state.created) onCreated();
  }, [state.created, onCreated]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className={labelClass}>
          Name
        </label>
        <input id="name" name="name" required placeholder="Contact" className={inputClass} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="mode" className={labelClass}>
          Type
        </label>
        <select id="mode" name="mode" className={selectClass}>
          <option value="standard">Standard</option>
          <option value="waitlist">Waitlist</option>
        </select>
      </div>

      {state.error ? (
        <p role="alert" className={errorClass}>
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end pt-1">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Creating…" : "Create form"}
        </button>
      </div>
    </form>
  );
}
