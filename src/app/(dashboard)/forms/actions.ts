"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserForMutation } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/login";
import { encryptSecret } from "@/lib/crypto/secrets";
import { forms, projects, type Form } from "@/lib/db/schema";
import { SETTING, getSetting } from "@/lib/db/settings";
import { publicId as newPublicId, ulid } from "@/lib/ids";
import { deleteForm as deleteFormWithFiles } from "@/lib/submissions/delete";
import { invalidateForm } from "@/lib/submissions/form-cache";
import { getEnv, getServices } from "@/lib/env";
import { mailerStatus } from "@/lib/platform/resolve-mailer";
import { originFromInput } from "@/lib/spam/origin-input";
import { defaultFields, parseFieldsPayload } from "@/lib/submissions/fields";
import { refuseDoubleOptIn } from "@/lib/waitlist/opt-in";
import { parseSlug } from "@/lib/waitlist/slug";

export type FormState = { error?: string; saved?: boolean };

/**
 * Every action here calls requireUserForMutation(), which checks the session AND the
 * request origin. The dashboard layout's guard does not cover these: server actions are
 * separately addressable POST endpoints and never re-run the layout.
 */

export async function createFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUserForMutation();
  const { db } = await getServices();

  const mode = String(formData.get("mode") ?? "standard") === "waitlist" ? "waitlist" : "standard";
  const name =
    String(formData.get("name") ?? "").trim() || (mode === "waitlist" ? "Waitlist" : "Contact");

  const now = Date.now();

  // Reuse the default project, or create it on first use.
  const existing = await db.select().from(projects).limit(1);
  let projectId = existing[0]?.id;
  if (!projectId) {
    projectId = ulid();
    await db.insert(projects).values({ id: projectId, name: "My website", createdAt: now });
  }

  const id = ulid();
  await db.insert(forms).values({
    id,
    publicId: newPublicId(),
    projectId,
    name,
    mode,
    // Waitlists need an email to dedupe on, so seed the field for them.
    fieldsJson: JSON.stringify(defaultFields(mode)),
    createdAt: now,
    updatedAt: now,
  });

  revalidatePath("/forms", "layout");
  // Straight to Share: the defaults already work, and getting it on a site is the goal.
  redirect(`/forms/${id}/share?created=1`);
}

/**
 * Save one tab of the form page. Each tab submits only its own inputs, so each section
 * updates only its own columns; a missing checkbox in another tab must not read as "off".
 */
export async function updateFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUserForMutation();
  const { db } = await getServices();

  const id = String(formData.get("id") ?? "");
  const rows = await db.select().from(forms).where(eq(forms.id, id)).limit(1);
  const form = rows[0];
  if (!form) return { error: "Form not found." };

  const section = String(formData.get("section") ?? "");
  const patch =
    section === "edit"
      ? editPatch(form, formData)
      : section === "share"
        ? await sharePatch(form, formData)
        : section === "settings"
          ? await settingsPatch(form, formData)
          : { error: "Unknown section." };
  if ("error" in patch) return { error: patch.error };

  try {
    await db
      .update(forms)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(forms.id, id));
  } catch (err) {
    const cause = (err as { cause?: { message?: string } }).cause?.message ?? "";
    if (/UNIQUE constraint failed/i.test(cause))
      return { error: "That address is already in use." };
    throw err;
  }

  // Clear this isolate's cache so the change is visible here immediately; other
  // isolates expire within 30s.
  invalidateForm(form.publicId, form.slug);
  if ("slug" in patch) invalidateForm(form.publicId, patch.slug ?? null);

  await audit(db, user.id, "form.update", { formId: id, section });
  revalidatePath("/forms", "layout");
  return { saved: true };
}

type Patch = Partial<typeof forms.$inferInsert> | { error: string };

function editPatch(form: Form, formData: FormData): Patch {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the form a name." };

  let fieldsJson = form.fieldsJson;
  const fieldsRaw = String(formData.get("fieldsJson") ?? "");
  if (fieldsRaw) {
    const parsed = parseFieldsPayload(fieldsRaw, form.mode, form.honeypotField);
    if (!parsed.ok) return { error: parsed.error };
    fieldsJson = JSON.stringify(parsed.fields);
  }

  const hostedDescription = String(formData.get("hostedDescription") ?? "").trim();
  return { name, fieldsJson, hostedDescription: hostedDescription || null };
}

async function sharePatch(form: Form, formData: FormData): Promise<Patch> {
  const slugResult = parseSlug(String(formData.get("slug") ?? ""));
  if (!slugResult.ok) return { error: slugResult.error };
  if (slugResult.slug && slugResult.slug === form.publicId) {
    return { error: "That address is already this form's id." };
  }
  if (slugResult.slug) {
    const { db } = await getServices();
    const clash = await db
      .select({ id: forms.id })
      .from(forms)
      .where(eq(forms.publicId, slugResult.slug))
      .limit(1);
    if (clash[0] && clash[0].id !== form.id) return { error: "That address is already in use." };
  }
  return { slug: slugResult.slug };
}

async function settingsPatch(form: Form, formData: FormData): Promise<Patch> {
  const { db } = await getServices();
  const env = await getEnv();
  const mail = await mailerStatus(db, env);

  const redirectUrl = String(formData.get("redirectUrl") ?? "").trim();
  const origins = String(formData.get("allowedOrigins") ?? "")
    .split(/[\n,]/)
    .map((s) => originFromInput(s))
    .filter((origin): origin is string => Boolean(origin));

  const notifyEmails = String(formData.get("notifyEmails") ?? "")
    .split(/[\n,]/)
    .map((e) => e.trim())
    .filter(Boolean);

  const autoReplySubject = String(formData.get("autoReplySubject") ?? "").trim();
  const autoReplyBody = String(formData.get("autoReplyBody") ?? "").trim();
  const turnstileSiteKey = String(formData.get("turnstileSiteKey") ?? "").trim();
  const turnstileSecretInput = String(formData.get("turnstileSecret") ?? "").trim();

  const wantsDoubleOptIn = form.mode === "waitlist" && formData.get("doubleOptIn") === "on";
  const doubleOptInError = refuseDoubleOptIn({
    mode: form.mode,
    enable: wantsDoubleOptIn,
    alreadyOn: form.doubleOptIn,
    mailerAvailable: mail.available,
  });
  if (doubleOptInError) return { error: doubleOptInError };
  // Turning it on needs a mailer (refused above). Turning it off is always allowed: with
  // email gone, off is the only way to stop signups piling up unconfirmed.
  const doubleOptIn = wantsDoubleOptIn;

  const boostRaw = Number(formData.get("referralBoost") ?? form.referralBoost);
  const referralBoost =
    Number.isInteger(boostRaw) && boostRaw >= 0 && boostRaw <= 100 ? boostRaw : 0;

  // Only re-encrypt when a new secret was typed; an empty field means "leave it".
  let turnstileSecret = form.turnstileSecret;
  if (turnstileSecretInput) {
    const sessionSecret = (await getSetting(db, SETTING.sessionSecret)) ?? "";
    turnstileSecret = await encryptSecret(turnstileSecretInput, sessionSecret);
  }
  // Explicit off switch. Blank inputs mean "keep": a secret with no site key is valid
  // (the owner's own HTML carries the site key).
  if (formData.get("turnstileClear") === "on") turnstileSecret = null;

  return {
    redirectUrl: redirectUrl || null,
    allowedOriginsJson: JSON.stringify([...new Set(origins)]),
    notifyEmailsJson: JSON.stringify(notifyEmails),
    autoReplyEnabled: formData.get("autoReplyEnabled") === "on",
    autoReplySubject: autoReplySubject || null,
    autoReplyBody: autoReplyBody || null,
    turnstileSiteKey: formData.get("turnstileClear") === "on" ? null : turnstileSiteKey || null,
    turnstileSecret,
    doubleOptIn,
    referralBoost,
  };
}

/** Pause or resume from the form header. */
export async function setFormActiveAction(formData: FormData): Promise<void> {
  const user = await requireUserForMutation();
  const { db } = await getServices();
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";

  const rows = await db.select().from(forms).where(eq(forms.id, id)).limit(1);
  const form = rows[0];
  if (!form) return;

  await db.update(forms).set({ active, updatedAt: Date.now() }).where(eq(forms.id, id));
  invalidateForm(form.publicId, form.slug);
  await audit(db, user.id, active ? "form.resume" : "form.pause", { formId: id });
  revalidatePath("/forms", "layout");
}

export async function deleteFormAction(formData: FormData): Promise<void> {
  const user = await requireUserForMutation();
  const { db, storage } = await getServices();

  const id = String(formData.get("id") ?? "");
  const rows = await db.select().from(forms).where(eq(forms.id, id)).limit(1);
  const form = rows[0];
  if (!form) return;

  // Deletes R2 objects too: a cascade only removes rows and would orphan the files.
  await deleteFormWithFiles(db, storage, form.id, form.publicId);

  await audit(db, user.id, "form.delete", { formId: id, name: form.name });
  revalidatePath("/forms", "layout");
  redirect("/forms");
}
