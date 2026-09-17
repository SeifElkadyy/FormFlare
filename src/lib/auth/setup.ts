import type { Database } from "../db/client";
import { SETTING, setSetting } from "../db/settings";
import { ulid, token } from "../ids";
import { hashPassword } from "./password";

export const MIN_PASSWORD_LENGTH = 12;

export type CreateOwnerResult =
  | { ok: true; userId: string }
  | { ok: false; code: "owner_exists" | "weak_password" | "invalid_email" };

/**
 * Create the first owner account, exactly once.
 *
 * Two browser tabs (or a bot) hitting POST /setup simultaneously must not produce
 * two owners. A read-then-write ("SELECT count(*) … then INSERT") cannot guarantee
 * that: both requests can pass the check before either inserts.
 *
 * Instead the guard lives inside a single statement —
 * `INSERT INTO users SELECT … WHERE NOT EXISTS (SELECT 1 FROM users)` — which SQLite
 * evaluates atomically. `meta.changes` then says whether *this* caller won:
 * 1 = created, 0 = someone else already had. The loser is told the owner exists.
 *
 * This is deliberately raw SQL: Drizzle's insert builder cannot express
 * INSERT ... SELECT ... WHERE NOT EXISTS, and splitting it would reintroduce the race.
 */
export async function createFirstOwner(
  db: Database,
  d1: D1Database,
  email: string,
  password: string,
  now: number = Date.now(),
): Promise<CreateOwnerResult> {
  const normalisedEmail = email.trim().toLowerCase();

  if (!normalisedEmail || !normalisedEmail.includes("@")) {
    return { ok: false, code: "invalid_email" };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, code: "weak_password" };
  }

  const userId = ulid();
  const passwordHash = await hashPassword(password);

  const result = await d1
    .prepare(
      `INSERT INTO users (id, email, password_hash, role, disabled, created_at)
       SELECT ?1, ?2, ?3, 'owner', 0, ?4
       WHERE NOT EXISTS (SELECT 1 FROM users)`,
    )
    .bind(userId, normalisedEmail, passwordHash, now)
    .run();

  if (result.meta.changes !== 1) {
    return { ok: false, code: "owner_exists" };
  }

  // Only the winner initialises instance settings.
  // session_secret also keys AES-GCM encryption for Turnstile/webhook secrets and
  // salts submission IP hashes, so it must exist before any form can be created.
  await setSetting(db, SETTING.sessionSecret, token(32));
  await setSetting(db, SETTING.signupEnabled, "false");
  await setSetting(db, SETTING.setupCompleted, "true");

  return { ok: true, userId };
}

/** True when at least one user exists. Used by the setup guard. */
export async function anyUserExists(d1: D1Database): Promise<boolean> {
  const row = await d1
    .prepare("SELECT 1 AS present FROM users LIMIT 1")
    .first<{ present: number }>();
  return row !== null;
}
