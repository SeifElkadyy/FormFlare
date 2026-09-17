/**
 * Webhook signatures.
 *
 * Signed over `"<timestamp>.<body>"`, not the body alone, so a captured request cannot
 * be replayed indefinitely: the receiver checks the timestamp is recent and the
 * signature covers it, so an attacker cannot move a valid signature onto a new time.
 *
 * Receivers should reject anything outside a **5-minute** tolerance — wide enough for
 * clock skew, narrow enough that a captured request expires quickly. Documented for
 * integrators in docs/api.md.
 */

export const SIGNATURE_TOLERANCE_SECONDS = 300;

export async function signPayload(
  secret: string,
  timestamp: number,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );

  const hex = [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256=${hex}`;
}

/**
 * Verify a signature. Used by the "send test" flow and documented for receivers.
 *
 * Constant-time comparison: `===` would leak how much of a forged signature matched,
 * which is enough to forge one byte at a time.
 */
export async function verifySignature(
  secret: string,
  timestamp: number,
  body: string,
  signature: string,
  now: number = Date.now(),
): Promise<boolean> {
  const ageSeconds = Math.abs(now / 1000 - timestamp);
  if (ageSeconds > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = await signPayload(secret, timestamp, body);
  if (expected.length !== signature.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Only https, and only public hosts.
 *
 * A webhook URL is owner-supplied but points outward from our Worker, so an unchecked
 * one is an SSRF primitive: `http://192.168.1.1/admin` or a cloud metadata endpoint
 * would be fetched from inside Cloudflare's network. The `global_fetch_strictly_public`
 * compatibility flag blocks private ranges at the platform level; this rejects them
 * earlier, with a message the owner can act on.
 */
export function validateWebhookUrl(
  raw: string,
): { ok: true; url: string } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Enter a valid URL." };
  }

  if (url.protocol !== "https:") {
    return { ok: false, error: "Webhook URLs must use https." };
  }

  const host = url.hostname.toLowerCase();

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    // Link-local, including the cloud metadata address.
    /^169\.254\./.test(host) ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    return { ok: false, error: "Webhook URLs must point at a public host." };
  }

  return { ok: true, url: url.toString() };
}
