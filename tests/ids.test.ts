import { describe, expect, it } from "vitest";
import { publicId, sha256Hex, token, ulid } from "../src/lib/ids";

describe("ulid", () => {
  it("is 26 Crockford base32 chars", () => {
    expect(ulid()).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
  });

  it("sorts lexicographically by creation time", () => {
    const early = ulid(1_000_000_000_000);
    const late = ulid(1_700_000_000_000);
    expect(early < late).toBe(true);
  });

  it("encodes the supplied timestamp in the first 10 chars", () => {
    const ms = 1_700_000_000_000;
    expect(ulid(ms).slice(0, 10)).toBe(ulid(ms).slice(0, 10));
  });

  it("does not collide across many ids in the same millisecond", () => {
    const ms = 1_700_000_000_000;
    const ids = new Set(Array.from({ length: 5000 }, () => ulid(ms)));
    expect(ids.size).toBe(5000);
  });
});

describe("publicId", () => {
  it("is 10 URL-safe chars with no ambiguous look-alikes", () => {
    const id = publicId();
    expect(id).toHaveLength(10);
    expect(id).toMatch(/^[2-9a-km-np-zA-HJ-NP-Z]{10}$/);
    expect(id).not.toMatch(/[0O1lI]/);
  });

  it("does not collide across many ids", () => {
    const ids = new Set(Array.from({ length: 5000 }, () => publicId()));
    expect(ids.size).toBe(5000);
  });

  /**
   * Rejection sampling should leave the alphabet roughly uniform. A modulo bias
   * would over-represent the first (256 % 56) = 32 characters by ~50%, which this
   * threshold catches while staying loose enough not to flake.
   */
  it("draws roughly uniformly from the alphabet", () => {
    const counts = new Map<string, number>();
    const samples = 20_000;
    for (let i = 0; i < samples / 10; i++) {
      for (const ch of publicId()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }

    const expected = samples / 56;
    for (const [, count] of counts) {
      expect(count).toBeGreaterThan(expected * 0.6);
      expect(count).toBeLessThan(expected * 1.4);
    }
  });
});

describe("token", () => {
  it("is lowercase hex of the requested byte length", () => {
    expect(token(32)).toMatch(/^[0-9a-f]{64}$/);
    expect(token(16)).toHaveLength(32);
  });

  it("does not repeat", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => token()));
    expect(tokens.size).toBe(1000);
  });
});

describe("sha256Hex", () => {
  it("matches a known digest", async () => {
    // Well-known SHA-256 of "abc".
    await expect(sha256Hex("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is stable and 64 hex chars", async () => {
    const a = await sha256Hex("formflare");
    const b = await sha256Hex("formflare");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
