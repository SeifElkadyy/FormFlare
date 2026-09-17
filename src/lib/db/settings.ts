import { eq } from "drizzle-orm";
import type { Database } from "./client";
import { settings } from "./schema";

/** Well-known keys in the `settings` table. */
export const SETTING = {
  sessionSecret: "session_secret",
  setupCompleted: "setup_completed",
  signupEnabled: "signup_enabled",
  notifyFrom: "notify_from",
} as const;

export async function getSetting(db: Database, key: string): Promise<string | null> {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

export async function setSetting(db: Database, key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

/** Setup is locked once this is set; `/setup` then 404s. */
export async function isSetupCompleted(db: Database): Promise<boolean> {
  return (await getSetting(db, SETTING.setupCompleted)) === "true";
}

/** Public sign-up is off unless explicitly enabled (design principle 4). */
export async function isSignupEnabled(db: Database): Promise<boolean> {
  return (await getSetting(db, SETTING.signupEnabled)) === "true";
}
