import { and, eq, lt, not } from "drizzle-orm";
import type { Database } from "../db/client";
import { sessions, users, type User } from "../db/schema";
import { sha256Hex, token } from "../ids";

export const SESSION_COOKIE = "ff_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Cookie attributes.
 *
 * - HttpOnly: JavaScript cannot read the token, so an XSS bug cannot exfiltrate it.
 * - Secure: never sent over plaintext HTTP.
 * - SameSite=Lax: the cookie is withheld from cross-site POSTs, which is the first
 *   layer of CSRF defence (dashboard mutations also check Origin).
 * - Path=/: the dashboard and its API routes share one session.
 */
export function sessionCookie(value: string, maxAgeSeconds: number): string {
  return [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

export function clearedSessionCookie(): string {
  return sessionCookie("", 0);
}

/**
 * Create a session and return the plaintext token for the cookie.
 *
 * Only the SHA-256 of the token is stored, so a database leak does not hand over
 * usable sessions. The plaintext exists just long enough to be set as a cookie.
 */
export async function createSession(
  db: Database,
  userId: string,
  now: number = Date.now(),
): Promise<{ cookieValue: string; expiresAt: number }> {
  const plaintext = token(32);
  const expiresAt = now + SESSION_TTL_MS;

  await db.insert(sessions).values({
    id: await sha256Hex(plaintext),
    userId,
    expiresAt,
    createdAt: now,
  });

  return { cookieValue: plaintext, expiresAt };
}

/**
 * Resolve a cookie value to its user.
 *
 * Returns null for unknown, expired or disabled accounts. Expired rows are deleted
 * on sight so a stolen-but-stale token cannot be reused, without waiting for the
 * daily sweep.
 */
export async function resolveSession(
  db: Database,
  cookieValue: string | undefined,
  now: number = Date.now(),
): Promise<User | null> {
  if (!cookieValue) return null;

  const id = await sha256Hex(cookieValue);
  const rows = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (row.expiresAt <= now) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  if (row.user.disabled) return null;

  return row.user;
}

/** Delete one session (logout). */
export async function destroySession(db: Database, cookieValue: string | undefined): Promise<void> {
  if (!cookieValue) return;
  await db.delete(sessions).where(eq(sessions.id, await sha256Hex(cookieValue)));
}

/**
 * Drop every other session for a user.
 *
 * Called on login so a fresh sign-in invalidates older sessions — if a token leaked,
 * signing in again ends it.
 */
export async function rotateSessions(
  db: Database,
  userId: string,
  keepSessionId: string,
): Promise<void> {
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), not(eq(sessions.id, keepSessionId))));
}

/** Delete expired sessions. Called by the daily cron. */
export async function deleteExpiredSessions(db: Database, now: number = Date.now()): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
}

/** Read one cookie from a request's Cookie header. */
export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}
