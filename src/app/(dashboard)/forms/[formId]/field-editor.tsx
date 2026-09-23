"use client";

import { ChevronDownIcon, ChevronUpIcon, PlusIcon, TrashIcon } from "@/components/icons";
import {
  FIELD_TYPES,
  MAX_FORM_FIELDS,
  effectiveFields,
  type FieldConfig,
  type FieldType,
} from "@/lib/submissions/fields";
import { btnGhost, btnIcon, checkboxClass, cn, hintClass, inputBase } from "@/lib/ui";

/** What people call these, not what HTML calls them. */
const TYPE_LABEL: Record<FieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  email: "Email",
  tel: "Phone",
  number: "Number",
  url: "Link",
  file: "File",
};

type DraftField = FieldConfig & { id: string };

export function seedDraftFields(fieldsJson: string, mode: string): DraftField[] {
  return effectiveFields(fieldsJson, mode).map((field, index) => ({ ...field, id: `f${index}` }));
}

export function FieldEditor({
  fields,
  onChange,
  mode,
  uploadsAvailable,
}: {
  fields: DraftField[];
  onChange: (fields: DraftField[]) => void;
  mode: string;
  uploadsAvailable: boolean;
}) {
  function update(index: number, patch: Partial<FieldConfig>) {
    onChange(fields.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  }

  function move(index: number, delta: number) {
    const next = index + delta;
    if (next < 0 || next >= fields.length) return;
    const copy = fields.slice();
    const [row] = copy.splice(index, 1);
    copy.splice(next, 0, row);
    onChange(copy);
  }

  // A waitlist dedupes on email, so its last email field cannot go.
  const removable = (index: number) =>
    fields.length > 1 &&
    !(
      mode === "waitlist" &&
      fields[index].type === "email" &&
      fields.filter((f) => f.type === "email").length === 1
    );

  function add() {
    if (fields.length >= MAX_FORM_FIELDS) return;
    const taken = new Set(fields.map((field) => field.name.toLowerCase()));
    let name = "field";
    for (let n = 2; taken.has(name); n++) name = `field${n}`;
    onChange([...fields, { name, type: "text", required: false, id: `f${Date.now()}` }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="hidden"
        name="fieldsJson"
        value={JSON.stringify(
          fields.map(({ name, type, required, maxLength }) => ({
            name,
            type,
            required,
            maxLength,
          })),
        )}
      />

      <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl bg-white shadow-[var(--shadow-border)] dark:divide-neutral-800 dark:bg-neutral-900">
        {fields.map((field, index) => (
          <li key={field.id} className="flex flex-wrap items-center gap-2 p-2">
            <input
              aria-label="Field name"
              value={field.name}
              onChange={(event) => update(index, { name: event.target.value })}
              className={cn(inputBase, "min-w-40 flex-1 font-mono text-xs")}
              autoComplete="off"
              spellCheck={false}
            />
            <select
              aria-label="Type"
              value={field.type}
              onChange={(event) => update(index, { type: event.target.value as FieldType })}
              className={cn(inputBase, "w-32 shrink-0")}
            >
              {FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABEL[type]}
                </option>
              ))}
            </select>
            <label className="flex shrink-0 items-center gap-1.5 px-1 text-xs text-neutral-600 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={Boolean(field.required)}
                onChange={(event) => update(index, { required: event.target.checked })}
                className={checkboxClass}
              />
              Required
            </label>
            <div className="flex shrink-0 items-center">
              <button
                type="button"
                className={btnIcon}
                aria-label="Move up"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ChevronUpIcon />
              </button>
              <button
                type="button"
                className={btnIcon}
                aria-label="Move down"
                disabled={index === fields.length - 1}
                onClick={() => move(index, 1)}
              >
                <ChevronDownIcon />
              </button>
              <button
                type="button"
                className={btnIcon}
                aria-label={`Remove ${field.name}`}
                disabled={!removable(index)}
                onClick={() => onChange(fields.filter((_, i) => i !== index))}
              >
                <TrashIcon />
              </button>
            </div>
            {field.type === "file" && !uploadsAvailable ? (
              <p className={`${hintClass} w-full px-1`}>
                File uploads are off on this install, so this field will be rejected.{" "}
                <a href="https://github.com/SeifElkadyy/FormFlare#how-do-i-enable-file-uploads">
                  Turn them on
                </a>
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <button
        type="button"
        className={cn(btnGhost, "self-start")}
        disabled={fields.length >= MAX_FORM_FIELDS}
        onClick={add}
      >
        <PlusIcon />
        Add field
      </button>
    </div>
  );
}
