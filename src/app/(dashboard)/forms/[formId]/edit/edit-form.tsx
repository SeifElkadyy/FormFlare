"use client";

import { startTransition, useActionState, useState } from "react";
import { FormFields } from "@/components/form-fields";
import {
  authCardClass,
  btnPrimary,
  errorClass,
  hintClass,
  inputClass,
  labelClass,
  successClass,
  textareaClass,
} from "@/lib/ui";
import { updateFormAction, type FormState } from "../../actions";
import { FieldEditor, seedDraftFields } from "../field-editor";

const initialState: FormState = {};

/** Everything a visitor sees, with a live preview beside it. */
export function EditForm({
  form,
  uploadsAvailable,
}: {
  form: { id: string; name: string; mode: string; fieldsJson: string; hostedDescription: string };
  uploadsAvailable: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateFormAction, initialState);
  const [name, setName] = useState(form.name);
  const [intro, setIntro] = useState(form.hostedDescription);
  const [fields, setFields] = useState(() => seedDraftFields(form.fieldsJson, form.mode));
  const waitlist = form.mode === "waitlist";

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <form
        // Not `action={formAction}`: React 19 resets a <form action> after it succeeds,
        // snapping controlled inputs back to their first-render defaults while state
        // keeps the saved values. Submitting by hand skips that reset.
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => formAction(data));
        }}
        className="flex flex-col gap-6"
      >
        <input type="hidden" name="id" value={form.id} />
        <input type="hidden" name="section" value="edit" />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className={labelClass}>
            Title
          </label>
          <input
            id="name"
            name="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="hostedDescription" className={labelClass}>
            Description <span className="font-normal text-neutral-400">(optional)</span>
          </label>
          <textarea
            id="hostedDescription"
            name="hostedDescription"
            rows={2}
            value={intro}
            placeholder={waitlist ? "Join the waitlist." : "A line under the title."}
            onChange={(event) => setIntro(event.target.value)}
            className={textareaClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <p className={labelClass}>Fields</p>
          <p className={hintClass}>
            The field name is what arrives in your inbox and webhooks. Your own HTML can send extra
            fields too; they&rsquo;re kept.
          </p>
          <FieldEditor
            fields={fields}
            onChange={setFields}
            mode={form.mode}
            uploadsAvailable={uploadsAvailable}
          />
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className={btnPrimary}>
            {pending ? "Saving…" : "Save"}
          </button>
          {state.error ? (
            <p role="alert" className={errorClass}>
              {state.error}
            </p>
          ) : state.saved && !pending ? (
            <p role="status" className={successClass}>
              Saved
            </p>
          ) : null}
        </div>
      </form>

      <aside aria-label="Preview" className="xl:sticky xl:top-6 xl:self-start">
        <p className={`${hintClass} mb-2`}>Preview</p>
        <div className={authCardClass}>
          <h2 className="text-xl font-semibold tracking-tight">{name.trim() || "Untitled"}</h2>
          {intro.trim() || waitlist ? (
            <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-400">
              {intro.trim() || "Join the waitlist."}
            </p>
          ) : null}
          {/* Inert: typing here should not create real submissions. Share → View page does. */}
          <div className="mt-6 flex flex-col gap-4" inert>
            <FormFields fields={fields} idPrefix="preview-" />
            <span className={btnPrimary}>{waitlist ? "Join waitlist" : "Send"}</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
