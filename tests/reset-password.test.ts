import { describe, expect, it } from "vitest";
import { PBKDF2_ITERATIONS, verifyPassword } from "../src/lib/auth/password";

/**
 * The reset script hashes passwords in Node, outside the Worker, so it duplicates the
 * derivation from src/lib/auth/password.ts. If the two ever drift, a reset would write
 * a hash the app cannot verify and lock the owner out permanently — with no other
 * recovery path.
 *
 * This reimplements the script's algorithm exactly and checks the app accepts it.
 */
const SALT_BYTES = 16;
const KEY_BITS = 256;

async function hashLikeResetScript(password: string, iterations = PBKDF2_ITERATIONS) {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);

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

  const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

describe("reset-password hash compatibility", () => {
  it("produces a hash the app can verify", async () => {
    const hash = await hashLikeResetScript("a-new-long-password");
    await expect(verifyPassword("a-new-long-password", hash)).resolves.toBe(true);
    await expect(verifyPassword("the-wrong-password", hash)).resolves.toBe(false);
  });

  it("uses the same field layout as the app", async () => {
    const hash = await hashLikeResetScript("a-new-long-password");
    const [scheme, iterations, salt, digest] = hash.split("$");

    expect(scheme).toBe("pbkdf2");
    expect(Number(iterations)).toBe(PBKDF2_ITERATIONS);
    // 16 raw bytes and 32 raw bytes, base64-encoded.
    expect(atob(salt)).toHaveLength(SALT_BYTES);
    expect(atob(digest)).toHaveLength(KEY_BITS / 8);
  });

  it("pins the iteration count the script hard-codes", async () => {
    // The script cannot import the app constant (it runs in Node, outside the bundle),
    // so this asserts the literal value both sides must agree on.
    expect(PBKDF2_ITERATIONS).toBe(100_000);
    const hash = await hashLikeResetScript("a-new-long-password", 100_000);
    expect(hash).toContain("$100000$");
    await expect(verifyPassword("a-new-long-password", hash)).resolves.toBe(true);
  });
});
