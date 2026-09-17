/**
 * Password hashing: PBKDF2-SHA-256 via WebCrypto.
 *
 * Stored format: `pbkdf2$<iterations>$<saltB64>$<hashB64>`
 * The iteration count is stored per-hash so the cost can be raised later without
 * invalidating existing passwords — verification uses the value from the record,
 * not the current constant.
 */

/**
 * Fixed at the production workerd ceiling.
 *
 * ⚠️ Do NOT raise this and do NOT try to detect a maximum at runtime. Production
 * workerd rejects anything above 100,000 with
 * `NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported`,
 * because its CPU limiter cannot interrupt BoringSSL mid-derivation. Miniflare,
 * `wrangler dev` and Node all accept higher counts, so an over-limit value passes
 * every local test and only fails once deployed.
 *
 * This is below OWASP's 2023 guidance (600,000 for PBKDF2-SHA-256). It is a platform
 * ceiling, not a choice; revisit only if workerd raises the cap.
 */
export const PBKDF2_ITERATIONS = 100_000;

const SALT_BYTES = 16;
const KEY_BITS = 256;

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    KEY_BITS,
  );

  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);

  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

/**
 * Verify a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed record: a corrupted row should
 * deny access, not crash the login route.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;

  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;

  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromBase64(parts[2]);
    expected = fromBase64(parts[3]);
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = await derive(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

/**
 * Constant-time comparison.
 *
 * `===` on the base64 strings would short-circuit at the first differing byte and
 * leak how much of a guess was correct.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
