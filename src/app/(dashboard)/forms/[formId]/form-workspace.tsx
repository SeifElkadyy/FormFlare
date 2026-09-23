"use client";

import Link from "next/link";
import { type ComponentProps, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { parseFields } from "@/lib/submissions/fields";
import { btnGhost } from "@/lib/ui";
import { EmbedSnippets } from "./embed-snippets";
import { seedDraftFields } from "./field-editor";
import { FormPreviewPane } from "./form-preview-pane";
import { FormSettings } from "./form-settings";

export function FormWorkspace({
  form,
  endpoint,
  hosted,
  widget,
  formKey,
  badge,
  honeypot,
}: {
  form: ComponentProps<typeof FormSettings>["form"];
  endpoint: string;
  hosted: string;
  widget: string;
  formKey: string;
  badge: string;
  honeypot: string;
}) {
  const [name, setName] = useState(form.name);
  const [intro, setIntro] = useState(form.hostedDescription);
  const [fields, setFields] = useState(() => seedDraftFields(form.fieldsJson, form.mode));
  const usingDefaults = parseFields(form.fieldsJson).length === 0;
  const fieldsJson = JSON.stringify(
    fields.map(({ name: fieldName, type, required, maxLength }) => ({
      name: fieldName,
      type,
      required,
      maxLength,
    })),
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        title={name.trim() || form.name}
        description={form.active ? "Accepting submissions." : "Paused — not accepting submissions."}
        actions={
          <Link href={`/forms/${form.id}/insights`} className={`${btnGhost} no-underline`}>
            {form.mode === "waitlist" ? "Insights & leaderboard" : "Insights"}
          </Link>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] lg:overflow-hidden">
        <div className="min-w-0 px-5 py-5 lg:min-h-0 lg:overflow-y-auto">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
            <FormSettings
              form={form}
              name={name}
              onNameChange={setName}
              intro={intro}
              onIntroChange={setIntro}
              fields={fields}
              onFieldsChange={setFields}
              usingDefaults={usingDefaults}
              share={
                <EmbedSnippets
                  endpoint={endpoint}
                  honeypot={honeypot}
                  mode={form.mode}
                  fieldsJson={fieldsJson}
                  hosted={hosted}
                  widget={widget}
                  formKey={formKey}
                  badge={badge}
                />
              }
            />
          </div>
        </div>

        <div className="max-lg:order-first max-lg:border-b max-lg:border-neutral-100 lg:min-h-0 lg:overflow-y-auto lg:border-s lg:border-neutral-100 dark:max-lg:border-neutral-800 dark:lg:border-neutral-800">
          <FormPreviewPane
            name={name}
            intro={intro}
            mode={form.mode}
            active={form.active}
            endpoint={endpoint}
            honeypot={honeypot}
            fields={fields}
            turnstileSiteKey={form.turnstileSiteKey}
          />
        </div>
      </div>
    </div>
  );
}
