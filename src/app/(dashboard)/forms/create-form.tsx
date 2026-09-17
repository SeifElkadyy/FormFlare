"use client";

import { useActionState } from "react";
import { createFormAction, type FormState } from "./actions";

const initialState: FormState = {};

export function CreateFormForm() {
  const [state, formAction, pending] = useActionState(createFormAction, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]"
    >
      <div className="flex-1 space-y-1">
        <label htmlFor="name" className="block text-sm font-medium">
          New form
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder="Contact"
          className="w-full rounded-md border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="mode" className="block text-sm font-medium">
          Type
        </label>
        <select
          id="mode"
          name="mode"
          className="rounded-md border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]"
        >
          <option value="standard">Standard</option>
          <option value="waitlist">Waitlist</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create form"}
      </button>

      {state.error && (
        <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
