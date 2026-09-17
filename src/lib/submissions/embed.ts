import { effectiveFields, type FieldConfig } from "./fields";

export type EmbedKind = "html" | "fetch" | "react";

export interface EmbedSnippets {
  html: string;
  fetch: string;
  react: string;
}

/**
 * Snippets shown on the form page. Built from the same field list as the preview
 * and hosted page, so adding `company` in the editor is what the owner copies.
 */
export function embedSnippets(
  endpoint: string,
  honeypot: string,
  mode: string,
  fieldsJson: string,
): EmbedSnippets {
  const fields = effectiveFields(fieldsJson, mode).filter((field) => field.type !== "file");
  return {
    html: htmlSnippet(endpoint, honeypot, fields),
    fetch: fetchSnippet(endpoint, fields),
    react: reactSnippet(endpoint, honeypot, fields),
  };
}

function htmlSnippet(endpoint: string, honeypot: string, fields: FieldConfig[]): string {
  const inputs = fields.map((field) => htmlInput(field)).join("\n");
  return `<form action="${endpoint}" method="POST">
  <!-- Hidden from people, filled by bots. Leave it in. -->
  <input type="text" name="${honeypot}" style="display:none" tabindex="-1" autocomplete="off" />
${inputs}
  <button type="submit">Send</button>
</form>`;
}

function htmlInput(field: FieldConfig): string {
  const required = field.required ? " required" : "";
  if (field.type === "textarea") {
    return `  <textarea name="${field.name}"${required}></textarea>`;
  }
  const type = htmlType(field.type);
  const typeAttr = type === "text" ? "" : ` type="${type}"`;
  return `  <input name="${field.name}"${typeAttr}${required} />`;
}

function fetchSnippet(endpoint: string, fields: FieldConfig[]): string {
  const body = fields.map((field) => `    ${field.name}: ${exampleValue(field)},`).join("\n");
  return `const res = await fetch(${JSON.stringify(endpoint)}, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({
${body}
  }),
});
const json = await res.json();
if (!json.ok) throw new Error(json.code);`;
}

function reactSnippet(endpoint: string, honeypot: string, fields: FieldConfig[]): string {
  const inputs = fields
    .map((field) => {
      const required = field.required ? " required" : "";
      if (field.type === "textarea") {
        return `      <textarea name="${field.name}"${required} />`;
      }
      const type = htmlType(field.type);
      const typeAttr = type === "text" ? "" : ` type="${type}"`;
      return `      <input name="${field.name}"${typeAttr}${required} />`;
    })
    .join("\n");

  return `"use client";

export function Form() {
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const res = await fetch(${JSON.stringify(endpoint)}, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.code);
  }

  return (
    <form onSubmit={onSubmit}>
      <input type="text" name="${honeypot}" style={{ display: "none" }} tabIndex={-1} autoComplete="off" />
${inputs}
      <button type="submit">Send</button>
    </form>
  );
}`;
}

function htmlType(type: FieldConfig["type"]): string {
  if (type === "email" || type === "number" || type === "url" || type === "tel") return type;
  return "text";
}

function exampleValue(field: FieldConfig): string {
  if (field.type === "email") return '"ada@example.com"';
  if (field.type === "number") return "1";
  if (field.type === "url") return '"https://example.com"';
  if (field.type === "tel") return '"+1 555 0100"';
  if (field.name === "company") return '"Acme"';
  if (field.name === "message") return '"Hello"';
  return '"Ada"';
}
