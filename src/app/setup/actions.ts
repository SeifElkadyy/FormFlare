"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { anyUserExists, createFirstOwner, MIN_PASSWORD_LENGTH } from "@/lib/auth/setup";
import { setupTokenOk } from "@/lib/auth/setup-token";
import { createSession, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth/session";
import { audit } from "@/lib/auth/login";
import { isSetupCompleted } from "@/lib/db/settings";
import { assertSameOrigin } from "@/lib/auth/guard";
import { getEnv, getServices } from "@/lib/env";

export type SetupState = { error?: string };

/**
 * Create the owner account.
 *
 * Server actions are independently addressable POST endpoints, so every guard the
 * page performs is re-checked here. A caller can invoke this directly without ever
 * rendering /setup.
 */
export async function createOwnerAction(
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  await assertSameOrigin();

  const env = await getEnv();
  const { db } = await getServices();

  // Re-check the first-run lock and the optional token here, not just in the page.
  if ((await isSetupCompleted(db)) || (await anyUserExists(env.DB))) {
    return { error: "Setup has already been completed." };
  }

  const token = formData.get("token");
  if (!setupTokenOk(env.SETUP_TOKEN, typeof token === "string" ? token : undefined)) {
    return { error: "Invalid setup token." };
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password !== confirm) return { error: "Passwords do not match." };

  const result = await createFirstOwner(db, env.DB, email, password);

  if (!result.ok) {
    const message =
      result.code === "weak_password"
        ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
        : result.code === "invalid_email"
          ? "Enter a valid email address."
          : "Setup has already been completed.";
    return { error: message };
  }

  await audit(db, result.userId, "setup.completed", { email: email.trim().toLowerCase() });

  const { cookieValue } = await createSession(db, result.userId);
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE,
    value: cookieValue,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });

  redirect("/inbox");
}
