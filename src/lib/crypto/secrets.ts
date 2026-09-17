/**
 * Encryption for secrets stored in D1 (Section 19).
 *
 * Turnstile secrets and webhook signing keys are credentials a form owner pasted in.
 * Stored in plaintext, a database dump would hand them over, so they are sealed with
 * AES-GCM under a key derived from `session_secret`.
 *
 * ⚠️ `session_secret` is therefore load-bearing beyond signing: rotating it makes every
 * stored secret undecryptable. See docs/DECISIONS.md.
 *
 * Format: `v1.<ivBase64>.<ciphertextBase64>`
 * The version prefix leaves room to change algorithm later without guessing at the
 * shape of existing values.
 */

const VERSION = "v1";
const IV_BYTES = 12; // 96 bits, the size AES-GCM is specified for.
const KEY_BITS = 256;
const HKDF_INFO = "formflare:secret-encryption:v1";

/**
 * Derive the encryption key from `session_secret`.
 *
 * HKDF rather than using the secret directly, so the encryption key is domain-separated
 * from any other use of `session_secret` (IP hashing, signing). Compromising one derived
 * use does not hand over the others.
 */
async function deriveKey(sessionSecret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret),
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      // Static salt: `session_secret` is already 32 random bytes, so the salt adds
      // nothing here. The info string provides the domain separation.
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(HKDF_INFO),
    },
    base,
    { name: "AES-GCM", length: KEY_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

export async function encryptSecret(plaintext: string, sessionSecret: string): Promise<string> {
  const key = await deriveKey(sessionSecret);

  // A fresh IV per encryption. Reusing one under the same key breaks AES-GCM badly
  // enough to leak the key stream, so this must never be derived from the plaintext.
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(iv);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  );

  return `${VERSION}.${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

/**
 * Decrypt a stored secret.
 *
 * Returns null instead of throwing when the value is malformed or the key is wrong —
 * the caller (a form load on the submission hot path) should degrade rather than
 * 500 on one bad row. GCM's authentication tag means a wrong key fails here rather
 * than returning garbage.
 */
export async function decryptSecret(stored: string, sessionSecret: string): Promise<string | null> {
  const parts = stored.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;

  try {
    const key = await deriveKey(sessionSecret);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(parts[1]) as BufferSource },
      key,
      fromBase64(parts[2]) as BufferSource,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

/** True when a value looks like this module's output rather than a plaintext secret. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}.`) && value.split(".").length === 3;
}
