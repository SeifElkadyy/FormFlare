import { hmacHex, safeEqual } from "../crypto/hmac";

/**
 * Signed confirmation links for waitlist double opt-in.
 *
 * HMAC over `submissionId.exp`, not a random token stored in D1: there is nothing
 * to leak from a database dump, and expiry lives in the URL so an old email dies
 * without a sweep. 7 days is long enough for a slow inbox and short enough that a
 * forwarded mail does not confirm a signup months later.
 */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function signConfirmToken(
  submissionId: string,
  sessionSecret: string,
  now: number = Date.now(),
): Promise<{ exp: number; sig: string }> {
  const exp = now + TTL_MS;
  const sig = await hmacHex(sessionSecret, `${submissionId}.${exp}`);
  return { exp, sig };
}

export async function verifyConfirmToken(
  submissionId: string,
  exp: number,
  sig: string,
  sessionSecret: string,
  now: number = Date.now(),
): Promise<boolean> {
  if (!Number.isFinite(exp) || exp <= now) return false;
  if (!/^[0-9a-f]+$/i.test(sig)) return false;
  const expected = await hmacHex(sessionSecret, `${submissionId}.${exp}`);
  return safeEqual(expected, sig);
}

export function confirmPath(submissionId: string, exp: number, sig: string): string {
  const params = new URLSearchParams({ s: submissionId, exp: String(exp), sig });
  return `/confirm?${params.toString()}`;
}
