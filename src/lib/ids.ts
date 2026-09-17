/**
 * ID generation.
 *
 * - `ulid()` — internal primary keys. Time-ordered, so they sort by creation and
 *   keep D1 index inserts append-mostly instead of scattering through the B-tree.
 * - `publicId()` — the id in `POST /f/:publicId`. Unguessable: enumeration would
 *   expose other people's forms.
 * - `token()` — session tokens and API keys.
 *
 * All randomness comes from `crypto.getRandomValues`. Never `Math.random`.
 */

/** Crockford base32: no I, L, O or U, so ids avoid ambiguous characters. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ULID_TIME_LEN = 10;
const ULID_RANDOM_LEN = 16;

/** URL-safe and unambiguous: no look-alike pairs (0/O, 1/l/I). */
const PUBLIC_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const PUBLIC_ID_LEN = 10;

/**
 * Draw `count` values uniformly from an alphabet.
 *
 * Rejection sampling, because `byte % alphabet.length` would bias toward the first
 * `256 % length` characters and shrink the effective keyspace.
 */
function randomChars(alphabet: string, count: number): string {
  const len = alphabet.length;
  // Largest multiple of len that fits in a byte; values at or above it are rejected.
  const limit = Math.floor(256 / len) * len;

  let out = "";
  const buf = new Uint8Array(count);

  while (out.length < count) {
    crypto.getRandomValues(buf);
    for (const byte of buf) {
      if (byte < limit) {
        out += alphabet[byte % len];
        if (out.length === count) break;
      }
    }
  }

  return out;
}

function encodeTime(ms: number, len: number): string {
  let out = "";
  let t = ms;
  for (let i = len - 1; i >= 0; i--) {
    out = CROCKFORD[t % 32] + out;
    t = Math.floor(t / 32);
  }
  return out;
}

/**
 * ULID: 48-bit timestamp + 80 bits of randomness, Crockford base32, 26 chars.
 *
 * Sortable to the millisecond. Ordering within a single millisecond is arbitrary —
 * fine for primary keys, but never use ULID order where exact sequence matters
 * (waitlist positions come from a counter, not from id order).
 */
export function ulid(now: number = Date.now()): string {
  return encodeTime(now, ULID_TIME_LEN) + randomChars(CROCKFORD, ULID_RANDOM_LEN);
}

/**
 * Short public form id (10 chars over a 56-char alphabet ≈ 58 bits).
 *
 * Not sequential and not derived from the internal id, so forms cannot be
 * enumerated from a single known endpoint.
 */
export function publicId(): string {
  return randomChars(PUBLIC_ALPHABET, PUBLIC_ID_LEN);
}

/**
 * High-entropy token for session cookies and API keys.
 *
 * Only the SHA-256 of these is stored; the plaintext is shown to the user once.
 */
export function token(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256, lowercase hex. Used for session ids, API key lookups and IP hashing. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
