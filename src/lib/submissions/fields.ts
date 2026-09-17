import { z } from "zod";

/** A field as configured in the dashboard and stored in `forms.fields_json`. */
export interface FieldConfig {
  name: string;
  type: "text" | "email" | "textarea" | "number" | "url" | "file";
  required?: boolean;
  maxLength?: number;
}

export const fieldConfigSchema = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(["text", "email", "textarea", "number", "url", "file"]),
  required: z.boolean().optional(),
  maxLength: z.number().int().positive().max(100_000).optional(),
});

export function parseFields(json: string): FieldConfig[] {
  try {
    const parsed = z.array(fieldConfigSchema).safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/**
 * Fields a form starts with when the owner has not configured any.
 *
 * One source of truth, because the preview page and the embed snippet must agree: if
 * the snippet shows name/email/message but the preview only shows email, the owner
 * tests a different form from the one their visitors will see.
 *
 * A form with no configured fields still accepts anything — this only decides what the
 * UI offers, not what the endpoint allows.
 */
export function defaultFields(mode: "standard" | "waitlist"): FieldConfig[] {
  return mode === "waitlist"
    ? [{ name: "email", type: "email", required: true }]
    : [
        { name: "name", type: "text", required: true },
        { name: "email", type: "email", required: true },
        { name: "message", type: "textarea", required: true },
      ];
}

/** The fields to show for a form: its own if configured, otherwise the defaults. */
export function effectiveFields(fieldsJson: string, mode: string): FieldConfig[] {
  const configured = parseFields(fieldsJson);
  return configured.length > 0
    ? configured
    : defaultFields(mode === "waitlist" ? "waitlist" : "standard");
}

/** Default cap on any single text value, so one field cannot carry a megabyte. */
const DEFAULT_MAX_LENGTH = 5000;

export interface ValidationResult {
  ok: boolean;
  data: Record<string, string>;
  errors: Record<string, string>;
}

/**
 * Validate submitted values against the form's configured fields.
 *
 * Built by hand rather than composing a zod object per request: the error shape is
 * per-field (`{ fields: { email: "..." } }` in the API contract), and field configs come
 * from the database, so a schema would be rebuilt on every submission anyway.
 *
 * Unconfigured fields are kept as-is. A form with no configured fields therefore accepts
 * anything, which is what makes the "point any HTML form at it" promise work.
 */
export function validateFields(
  values: Record<string, string>,
  fields: FieldConfig[],
): ValidationResult {
  const errors: Record<string, string> = {};
  const data: Record<string, string> = { ...values };

  for (const field of fields) {
    // File inputs are validated separately, against R2 limits.
    if (field.type === "file") continue;

    const raw = values[field.name];
    const value = typeof raw === "string" ? raw.trim() : "";

    if (!value) {
      if (field.required) errors[field.name] = "This field is required.";
      continue;
    }

    const maxLength = field.maxLength ?? DEFAULT_MAX_LENGTH;
    if (value.length > maxLength) {
      errors[field.name] = `Must be ${maxLength} characters or fewer.`;
      continue;
    }

    if (field.type === "email" && !isEmail(value)) {
      errors[field.name] = "Enter a valid email address.";
      continue;
    }

    if (field.type === "number" && !Number.isFinite(Number(value))) {
      errors[field.name] = "Enter a number.";
      continue;
    }

    if (field.type === "url" && !isHttpUrl(value)) {
      errors[field.name] = "Enter a valid URL.";
      continue;
    }

    data[field.name] = value;
  }

  return { ok: Object.keys(errors).length === 0, data, errors };
}

/**
 * Pragmatic email check.
 *
 * Deliberately not RFC 5322: a full parser rejects addresses that work in practice and
 * accepts ones that do not. One @, no spaces, a dot in the domain covers real input;
 * deliverability is proven by sending, not by a regex.
 */
export function isEmail(value: string): boolean {
  if (value.length > 254) return false;
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return false;
  const [local, domain] = [value.slice(0, at), value.slice(at + 1)];
  if (!local || !domain || domain.length > 253) return false;
  if (/\s/.test(value)) return false;
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Normalise an email for storage and dedupe. Must match migration 0002's lower(). */
export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Pick the email to store on the submission.
 *
 * Prefers a field the form declares as an email, then a field literally named "email",
 * so waitlist dedupe works even on forms that were never configured.
 */
export function extractEmail(values: Record<string, string>, fields: FieldConfig[]): string | null {
  const configured = fields.find((f) => f.type === "email");
  const candidate = configured ? values[configured.name] : (values.email ?? values.Email);
  if (!candidate) return null;
  const normalised = normaliseEmail(candidate);
  return isEmail(normalised) ? normalised : null;
}
