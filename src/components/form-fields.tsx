import { fieldLabel, type FieldConfig } from "@/lib/submissions/fields";
import { inputClass, labelClass, textareaClass } from "@/lib/ui";

const INPUT_TYPE: Partial<Record<FieldConfig["type"], string>> = {
  email: "email",
  number: "number",
  url: "url",
  tel: "tel",
  file: "file",
};

/**
 * The visitor-facing inputs for a form. Used by the hosted page and the dashboard
 * preview, so the preview cannot drift from what visitors see.
 */
export function FormFields({
  fields,
  idPrefix = "",
}: {
  fields: FieldConfig[];
  idPrefix?: string;
}) {
  return (
    <>
      {fields.map((field, index) => {
        const id = `${idPrefix}${field.name || "field"}-${index}`;
        const label = `${fieldLabel(field.name || "field")}${field.required ? "" : " (optional)"}`;
        return (
          <div key={id} className="flex flex-col gap-1.5">
            <label htmlFor={id} className={labelClass}>
              {label}
            </label>
            {field.type === "textarea" ? (
              <textarea
                id={id}
                name={field.name}
                required={field.required}
                rows={4}
                className={textareaClass}
              />
            ) : (
              <input
                id={id}
                name={field.name}
                type={INPUT_TYPE[field.type] ?? "text"}
                required={field.required}
                className={inputClass}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
