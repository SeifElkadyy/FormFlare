"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUserForMutation } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/login";
import { encryptSecret } from "@/lib/crypto/secrets";
import { forms, projects } from "@/lib/db/schema";
import { SETTING, getSetting } from "@/lib/db/settings";
import { getServices } from "@/lib/env";
import { publicId as newPublicId, ulid } from "@/lib/ids";
import { deleteForm as deleteFormWithFiles } from "@/lib/submissions/delete";
import { invalidateForm } from "@/lib/submissions/form-cache";

export type FormState = { error?: string; created?: boolean };

/**
 * Every action here calls requireUserForMutation(), which checks the session AND the
 * request origin. The dashboard layout's guard does not cover these: server actions are
 * separately addressable POST endpoints and never re-run the layout.
 */

export async function createFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUserForMutation();
  const { db } = await getServices();

  const name = String(formData.get("name") ?? "").trim();
  const mode = String(formData.get("mode") ?? "standard") === "waitlist" ? "waitlist" : "standard";
  if (!name) return { error: "Give the form a name." };

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
    fieldsJson:
      mode === "waitlist"
        ? JSON.stringify([{ name: "email", type: "email", required: true }])
        : "[]",
    createdAt: now,
    updatedAt: now,
  });

  revalidatePath("/forms");
  return { created: true };
}

export async function updateFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUserForMutation();
  const { db } = await getServices();

  const id = String(formData.get("id") ?? "");
  const rows = await db.select().from(forms).where(eq(forms.id, id)).limit(1);
  const form = rows[0];
  if (!form) return { error: "Form not found." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the form a name." };

  const redirectUrl = String(formData.get("redirectUrl") ?? "").trim();
  const allowedOrigins = String(formData.get("allowedOrigins") ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const notifyEmails = String(formData.get("notifyEmails") ?? "")
    .split(/[\n,]/)
    .map((e) => e.trim())
    .filter(Boolean);

  const autoReplyEnabled = formData.get("autoReplyEnabled") === "on";
  const autoReplySubject = String(formData.get("autoReplySubject") ?? "").trim();
  const autoReplyBody = String(formData.get("autoReplyBody") ?? "").trim();

  const turnstileSiteKey = String(formData.get("turnstileSiteKey") ?? "").trim();
  const turnstileSecretInput = String(formData.get("turnstileSecret") ?? "").trim();

  // Only re-encrypt when a new secret was typed; an empty field means "leave it".
  let turnstileSecret = form.turnstileSecret;
  if (turnstileSecretInput) {
    const sessionSecret = (await getSetting(db, SETTING.sessionSecret)) ?? "";
    turnstileSecret = await encryptSecret(turnstileSecretInput, sessionSecret);
  }

  await db
    .update(forms)
    .set({
      name,
      active: formData.get("active") === "on",
      redirectUrl: redirectUrl || null,
      allowedOriginsJson: JSON.stringify(allowedOrigins),
      notifyEmailsJson: JSON.stringify(notifyEmails),
      autoReplyEnabled,
      autoReplySubject: autoReplySubject || null,
      autoReplyBody: autoReplyBody || null,
      turnstileSiteKey: turnstileSiteKey || null,
      turnstileSecret,
      updatedAt: Date.now(),
    })
    .where(eq(forms.id, id));

  // Clear this isolate's cache so the change is visible here immediately; other
  // isolates expire within 30s.
  invalidateForm(form.publicId);

  await audit(db, user.id, "form.update", { formId: id });
  revalidatePath("/forms");
  revalidatePath(`/forms/${id}`);
  return {};
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
  revalidatePath("/forms");
}
