import { describe, expect, it } from "vitest";
import { PBKDF2_ITERATIONS, hashPassword, verifyPassword } from "../src/lib/auth/password";

describe("PBKDF2_ITERATIONS", () => {
  /**
   * Pinned deliberately. Production workerd rejects anything above 100,000, but
   * Miniflare and Node accept higher values — so a raised constant would pass every
   * other test here and only fail once deployed. This test is the guard.
   */
  it("is exactly the production workerd ceiling", () => {
    expect(PBKDF2_ITERATIONS).toBe(100_000);
  });

  it("is actually accepted by the runtime at that value", async () => {
    // Would throw NotSupportedError if the constant ever exceeded the cap.
    await expect(hashPassword("a-sufficiently-long-password")).resolves.toMatch(/^pbkdf2\$/);
  });
});

describe("hashPassword", () => {
  it("produces the documented format", async () => {
    const hash = await hashPassword("correct horse battery staple");
    const [scheme, iterations, salt, digest] = hash.split("$");

    expect(scheme).toBe("pbkdf2");
    expect(Number(iterations)).toBe(PBKDF2_ITERATIONS);
    expect(salt.length).toBeGreaterThan(0);
    expect(digest.length).toBeGreaterThan(0);
  });

  it("uses a fresh salt each time, so identical passwords differ", async () => {
    const a = await hashPassword("same-password-here");
    const b = await hashPassword("same-password-here");
    expect(a).not.toBe(b);
  });
});

describe("verifyPassword", () => {
  it("accepts the right password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("Correct horse battery staple", hash)).resolves.toBe(false);
    await expect(verifyPassword("", hash)).resolves.toBe(false);
  });

  it("verifies against the iteration count stored in the record, not the constant", async () => {
    // A hash written when the cost was lower must still verify, so the cost can be
    // raised later without locking everyone out.
    const legacy = await hashPassword("legacy-password-long");
    const downgraded = legacy.replace(`$${PBKDF2_ITERATIONS}$`, "$1000$");

    // Same password, different iterations → must NOT verify (digest differs)...
    await expect(verifyPassword("legacy-password-long", downgraded)).resolves.toBe(false);
    // ...but the original still does.
    await expect(verifyPassword("legacy-password-long", legacy)).resolves.toBe(true);
  });

  it("returns false for malformed records instead of throwing", async () => {
    for (const bad of [
      "",
      "not-a-hash",
      "pbkdf2$100000$only-three-parts",
      "bcrypt$100000$c2FsdA==$aGFzaA==",
      "pbkdf2$abc$c2FsdA==$aGFzaA==",
      "pbkdf2$-1$c2FsdA==$aGFzaA==",
      "pbkdf2$100000$$",
      "pbkdf2$100000$!!!not-base64!!!$aGFzaA==",
    ]) {
      await expect(verifyPassword("anything", bad)).resolves.toBe(false);
    }
  });
});
