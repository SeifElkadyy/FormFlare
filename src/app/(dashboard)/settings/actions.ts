"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUserForMutation } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/login";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, SESSION_TTL_MS, createSession, rotateSessions } from "@/lib/auth/session";
import { encryptSecret } from "@/lib/crypto/secrets";
import { users } from "@/lib/db/schema";
import { SETTING, getSetting, setSetting } from "@/lib/db/settings";
import { getEnv, getServices } from "@/lib/env";
import { sha256Hex } from "@/lib/ids";
import { wipeInstance } from "@/lib/instance/wipe";
import { type MailProvider } from "@/lib/platform/resolve-mailer";
import { isEmail } from "@/lib/submissions/fields";
import { getUpdateStatus } from "@/lib/update/check";

export type SettingsState = { error?: string; ok?: string };

function parseProvider(raw: string): MailProvider {
  return raw === "resend" || raw === "cloudflare" || raw === "off" ? raw : "off";
}

export async function saveEmailSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUserForMutation();
  const { db } = await getServices();
  const env = await getEnv();

  const from = String(formData.get("notifyFrom") ?? "").trim();
  if (from && !isEmail(from)) return { error: "Enter a valid sender address." };

  const provider = parseProvider(String(formData.get("mailProvider") ?? "off"));
  const resendKey = String(formData.get("resendApiKey") ?? "").trim();
  const instanceUrl = String(formData.get("instanceUrl") ?? "")
    .trim()
    .replace(/\/$/, "");

  if (instanceUrl) {
    try {
      const url = new URL(instanceUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { error: "Instance URL must be http or https." };
      }
    } catch {
      return { error: "Enter a valid instance URL." };
    }
  }

  if (provider === "cloudflare" && !env.EMAIL) {
    return { error: "Cloudflare Email Sending is not bound on this Worker." };
  }

  const sessionSecret = (await getSetting(db, SETTING.sessionSecret)) ?? "";
  const storedKey = await getSetting(db, SETTING.resendApiKey);
  if (provider === "resend" && !resendKey && !storedKey) {
    return { error: "Paste a Resend API key to use Resend." };
  }

  if (resendKey) {
    if (!sessionSecret) return { error: "Session secret is missing; cannot store the key." };
    await setSetting(db, SETTING.resendApiKey, await encryptSecret(resendKey, sessionSecret));
  }

  await setSetting(db, SETTING.notifyFrom, from);
  await setSetting(db, SETTING.mailProvider, provider);
  if (instanceUrl) await setSetting(db, SETTING.instanceUrl, instanceUrl);

  await audit(db, user.id, "settings.email", { provider });
  revalidatePath("/settings");
  revalidatePath("/forms", "layout");
  return { ok: "Email settings saved." };
}

export async function changePasswordAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUserForMutation();
  const { db } = await getServices();

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!(await verifyPassword(current, user.passwordHash))) {
    return { error: "Current password is incorrect." };
  }
  if (next.length < MIN_PASSWORD_LENGTH) {
    return { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (next !== confirm) return { error: "New passwords do not match." };

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(users.id, user.id));

  const session = await createSession(db, user.id);
  await rotateSessions(db, user.id, await sha256Hex(session.cookieValue));

  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE,
    value: session.cookieValue,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });

  await audit(db, user.id, "settings.password", {});
  revalidatePath("/settings");
  return { ok: "Password changed. Other sessions were signed out." };
}

export async function checkUpdatesAction(
  _prev?: SettingsState,
  _formData?: FormData,
): Promise<SettingsState> {
  await requireUserForMutation();
  const { db } = await getServices();
  const status = await getUpdateStatus(db, { force: true });
  revalidatePath("/settings");
  if (status.error && !status.latest) return { error: status.error };
  if (status.newer) return { ok: `FormFlare ${status.latest} is available.` };
  return { ok: `You are on ${status.current}, the latest stable release.` };
}

export async function deleteAccountAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUserForMutation();
  const { db, storage } = await getServices();

  const typed = String(formData.get("confirmEmail") ?? "")
    .trim()
    .toLowerCase();
  if (typed !== user.email) {
    return { error: "Type your account email to confirm." };
  }

  await audit(db, user.id, "settings.wipe", { email: user.email });
  await wipeInstance(db, storage);

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/setup");
}
