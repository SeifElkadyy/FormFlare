import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { auditLog, users } from "../db/schema";
import { sha256Hex, ulid } from "../ids";
import { verifyPassword } from "./password";
import { createSession, rotateSessions } from "./session";

export type LoginResult =
  | { ok: true; cookieValue: string; userId: string }
  | { ok: false; code: "invalid_credentials" | "rate_limited" };

/**
 * A hash of a throwaway password, used to spend roughly the same CPU when the
 * account does not exist. Without this, "unknown email" returns fast while "known
 * email, wrong password" takes a full PBKDF2 derivation — a timing difference that
 * enumerates valid accounts.
 */
const DUMMY_HASH =
  "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

export interface LoginDeps {
  db: Database;
  /** Rate limiter, keyed per IP+email by the caller. */
  limiter?: RateLimit;
  ip?: string;
}

export async function login(
  { db, limiter, ip }: LoginDeps,
  email: string,
  password: string,
  now: number = Date.now(),
): Promise<LoginResult> {
  const normalisedEmail = email.trim().toLowerCase();

  if (limiter) {
    // Keyed on both IP and email so one attacker cannot lock out a victim's account
    // from many IPs, nor spray many accounts from one IP.
    const { success } = await limiter.limit({ key: `login:${ip ?? "unknown"}:${normalisedEmail}` });
    if (!success) {
      await audit(db, null, "login.rate_limited", { email: normalisedEmail }, now);
      return { ok: false, code: "rate_limited" };
    }
  }

  const rows = await db.select().from(users).where(eq(users.email, normalisedEmail)).limit(1);
  const user = rows[0];

  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

  // Disabled accounts fail identically to wrong passwords, so the response does not
  // disclose that an address is registered.
  if (!user || !valid || user.disabled) {
    await audit(db, user?.id ?? null, "login.failed", { email: normalisedEmail }, now);
    return { ok: false, code: "invalid_credentials" };
  }

  const { cookieValue } = await createSession(db, user.id, now);

  // Rotate: a successful sign-in invalidates this user's other sessions, so a leaked
  // token stops working as soon as the owner logs in again.
  await rotateSessions(db, user.id, await sha256Hex(cookieValue));

  await audit(db, user.id, "login.success", { email: normalisedEmail }, now);
  return { ok: true, cookieValue, userId: user.id };
}

export async function audit(
  db: Database,
  userId: string | null,
  action: string,
  metadata: Record<string, unknown> | null,
  now: number = Date.now(),
): Promise<void> {
  await db.insert(auditLog).values({
    id: ulid(),
    userId,
    action,
    metadataJson: metadata ? JSON.stringify(metadata) : null,
    createdAt: now,
  });
}
