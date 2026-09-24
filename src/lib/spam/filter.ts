import { hmacHex, safeEqual } from "../crypto/hmac";

/**
 * Spam checks that need no setup, no binding and no third party. A hit stores the
 * submission as spam (visible in the Spam tab, never notified) and answers the sender
 * with a normal success, like the honeypot: a bot told it was caught adapts.
 */

/** A person cannot read a form and fill it in faster than this. */
export const MIN_FILL_MS = 2000;

/** Reserved field carrying `<rendered-at ms>.<hmac>`. Only pages we render have it. */
export const FILL_TOKEN_FIELD = "_ts";

export async function signFillToken(secret: string, now = Date.now()): Promise<string> {
  return `${now}.${await hmacHex(secret, `fill:${now}`)}`;
}

/**
 * Null when fine. A missing token is fine: forms on the owner's own site never had one,
 * so its absence proves nothing. A present one must be genuine and old enough.
 */
export async function fillTimeReason(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<string | null> {
  if (token === undefined || token === "") return null;
  const [rendered, sig] = token.split(".");
  const at = Number(rendered);
  if (!Number.isSafeInteger(at) || !sig || !secret) return "Tampered form token";
  if (!safeEqual(await hmacHex(secret, `fill:${at}`), sig)) return "Tampered form token";
  if (now - at < MIN_FILL_MS) return "Submitted too fast";
  return null;
}

/** One entry per line. `@domain.com` blocks an email domain; anything else is a phrase. */
export function parseBlocklist(text: string | null | undefined): string[] {
  if (!text) return [];
  return [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((line) => line.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 200);
}

export function blocklistReason(
  values: Record<string, string>,
  email: string | null,
  blocklist: string[],
): string | null {
  if (blocklist.length === 0) return null;
  const text = Object.values(values).join("\n").toLowerCase();
  const domain = email?.toLowerCase().split("@")[1];
  for (const entry of blocklist) {
    if (entry.startsWith("@")) {
      if (domain && (domain === entry.slice(1) || domain.endsWith(`.${entry.slice(1)}`))) {
        return `Blocked domain: ${entry}`;
      }
    } else if (text.includes(entry)) {
      return `Blocked phrase: ${entry}`;
    }
  }
  return null;
}
