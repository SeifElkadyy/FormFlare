import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, isEncrypted } from "../src/lib/crypto/secrets";

const SECRET = "a-session-secret-32-bytes-or-so!!";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips", async () => {
    const sealed = await encryptSecret("0x4AAAAAAA-turnstile-secret", SECRET);
    await expect(decryptSecret(sealed, SECRET)).resolves.toBe("0x4AAAAAAA-turnstile-secret");
  });

  it("never stores the plaintext", async () => {
    const plaintext = "0x4AAAAAAA-turnstile-secret";
    const sealed = await encryptSecret(plaintext, SECRET);
    expect(sealed).not.toContain(plaintext);
    expect(sealed.startsWith("v1.")).toBe(true);
  });

  /** A fixed IV under one key would leak the key stream; each encryption must differ. */
  it("produces a different ciphertext each time", async () => {
    const a = await encryptSecret("same-input", SECRET);
    const b = await encryptSecret("same-input", SECRET);
    expect(a).not.toBe(b);
    await expect(decryptSecret(a, SECRET)).resolves.toBe("same-input");
    await expect(decryptSecret(b, SECRET)).resolves.toBe("same-input");
  });

  /**
   * The consequence of rotating session_secret: stored secrets become undecryptable.
   * GCM's auth tag makes this a clean failure rather than garbage output.
   */
  it("returns null under a different session secret", async () => {
    const sealed = await encryptSecret("turnstile", SECRET);
    await expect(decryptSecret(sealed, "a-different-session-secret!!!!!!!")).resolves.toBeNull();
  });

  it("returns null for tampered ciphertext", async () => {
    const sealed = await encryptSecret("turnstile", SECRET);
    const [version, iv, ct] = sealed.split(".");
    // Flip a character in the ciphertext.
    const flipped = ct[0] === "A" ? `B${ct.slice(1)}` : `A${ct.slice(1)}`;
    await expect(decryptSecret(`${version}.${iv}.${flipped}`, SECRET)).resolves.toBeNull();
  });

  it("returns null for malformed input instead of throwing", async () => {
    for (const bad of ["", "plaintext", "v1.only-two", "v2.aaa.bbb", "v1...."]) {
      await expect(decryptSecret(bad, SECRET)).resolves.toBeNull();
    }
  });

  it("handles unicode and long values", async () => {
    const value = "clé-secrète-日本語-".repeat(20);
    const sealed = await encryptSecret(value, SECRET);
    await expect(decryptSecret(sealed, SECRET)).resolves.toBe(value);
  });
});

describe("isEncrypted", () => {
  it("recognises this module's output and rejects plaintext", async () => {
    expect(isEncrypted(await encryptSecret("x", SECRET))).toBe(true);
    expect(isEncrypted("0x4AAAAAAA-plaintext-secret")).toBe(false);
    expect(isEncrypted("")).toBe(false);
  });
});
