"use client";

import { ChevronDownIcon, ChevronUpIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import {
  FIELD_TYPES,
  MAX_FORM_FIELDS,
  effectiveFields,
  type FieldConfig,
  type FieldType,
} from "@/lib/submissions/fields";
import { btnGhost, btnSecondary, cn, hintClass, inputClass, labelClass, selectClass } from "@/lib/ui";

const SUGGESTIONS: FieldConfig[] = [
  { name: "company", type: "text", required: false },
  { name: "phone", type: "tel", required: false },
];

type DraftField = FieldConfig & { id: string };

export function seedDraftFields(fieldsJson: string, mode: string): DraftField[] {
  return effectiveFields(fieldsJson, mode).map((field, index) => ({ ...field, id: `f${index}` }));
}

export function FieldEditor({
  fields,
  onChange,
  mode,
  uploadsAvailable,
  usingDefaults,
}: {
  fields: DraftField[];
  onChange: (fields: DraftField[]) => void;
  mode: string;
  uploadsAvailable: boolean;
  usingDefaults: boolean;
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

  function remove(index: number) {
    if (fields.length <= 1) return;
    const next = fields.filter((_, i) => i !== index);
    if (mode === "waitlist" && !next.some((field) => field.type === "email")) return;
    onChange(next);
  }

  function add(field: FieldConfig) {
    if (fields.length >= MAX_FORM_FIELDS) return;
    if (fields.some((existing) => existing.name.toLowerCase() === field.name.toLowerCase())) {
      return;
    }
    onChange([...fields, { ...field, id: `f${Date.now()}` }]);
  }

  const missingSuggestions = SUGGESTIONS.filter(
    (suggestion) => !fields.some((field) => field.name.toLowerCase() === suggestion.name),
  );

  return (
    <div className="flex flex-col gap-3">
      <input
        type="hidden"
        name="fieldsJson"
        value={JSON.stringify(
          fields.map(({ name, type, required, maxLength }) => ({ name, type, required, maxLength })),
        )}
      />

      {usingDefaults ? (
        <Notice tone="info">Defaults. Add or rename fields, then save so the snippet matches.</Notice>
      ) : null}

      <div className="rounded-2xl bg-neutral-50 p-1 dark:bg-neutral-950/40">
        <ul className="flex flex-col gap-1">
          {fields.map((field, index) => (
            <li
              key={field.id}
              className="rounded-xl bg-white p-3 shadow-[var(--shadow-border)] dark:bg-neutral-900"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem_auto]">
                <div className="flex flex-col gap-1">
                  <label className={labelClass} htmlFor={`field-name-${index}`}>
                    Field name
                  </label>
                  <input
                    id={`field-name-${index}`}
                    value={field.name}
                    onChange={(event) => update(index, { name: event.target.value })}
                    className={inputClass}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass} htmlFor={`field-type-${index}`}>
                    Type
                  </label>
                  <select
                    id={`field-type-${index}`}
                    value={field.type}
                    onChange={(event) => update(index, { type: event.target.value as FieldType })}
                    className={selectClass}
                  >
                    {FIELD_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end justify-between gap-3 sm:justify-end">
                  <label className="flex h-9 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(field.required)}
                      onChange={(event) => update(index, { required: event.target.checked })}
                      className="accent-flare"
                    />
                    Required
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className={btnGhost}
                      aria-label="Move up"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ChevronUpIcon />
                    </button>
                    <button
                      type="button"
                      className={btnGhost}
                      aria-label="Move down"
                      disabled={index === fields.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ChevronDownIcon />
                    </button>
                    <button
                      type="button"
                      className={cn(btnGhost, "text-red-700 dark:text-red-400")}
                      aria-label={`Remove ${field.name}`}
                      disabled={fields.length <= 1}
                      onClick={() => remove(index)}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              </div>
              {field.type === "file" && !uploadsAvailable ? (
                <p className={`mt-2 ${hintClass}`}>
                  This instance has no R2 bucket, so a file field will reject the upload.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btnSecondary}
          disabled={fields.length >= MAX_FORM_FIELDS}
          onClick={() => add({ name: uniqueName(fields, "field"), type: "text", required: false })}
        >
          <PlusIcon />
          Add field
        </button>
        {missingSuggestions.map((suggestion) => (
          <button
            key={suggestion.name}
            type="button"
            className={btnGhost}
            onClick={() => add(suggestion)}
          >
            Add {suggestion.name}
          </button>
        ))}
      </div>
      <p className={hintClass}>Names you add only in your own HTML still reach the endpoint.</p>
    </div>
  );
}

function uniqueName(fields: DraftField[], base: string): string {
  const taken = new Set(fields.map((field) => field.name.toLowerCase()));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
}
