import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/lib/db/client";
import { settings, users } from "../src/lib/db/schema";
import { SETTING, getSetting, isSetupCompleted } from "../src/lib/db/settings";
import { anyUserExists, createFirstOwner } from "../src/lib/auth/setup";
import { readSetupToken, setupTokenOk } from "../src/lib/auth/setup-token";
import { verifyPassword } from "../src/lib/auth/password";

const db = createDb(env.DB);

beforeEach(async () => {
  await db.delete(users);
  await db.delete(settings);
});

describe("createFirstOwner", () => {
  it("creates the owner and initialises instance settings", async () => {
    const result = await createFirstOwner(db, env.DB, "Owner@Example.com", "a-very-long-password");
    expect(result).toMatchObject({ ok: true });

    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("owner@example.com"); // normalised
    expect(rows[0].role).toBe("owner");
    await expect(verifyPassword("a-very-long-password", rows[0].passwordHash)).resolves.toBe(true);

    // Sign-up must be off by default (design principle 4), and the session secret
    // must exist before any form can store an encrypted Turnstile key.
    await expect(getSetting(db, SETTING.signupEnabled)).resolves.toBe("false");
    await expect(isSetupCompleted(db)).resolves.toBe(true);
    expect((await getSetting(db, SETTING.sessionSecret))?.length).toBeGreaterThan(0);
  });

  it("rejects a short password and a malformed email", async () => {
    await expect(createFirstOwner(db, env.DB, "a@b.com", "short")).resolves.toMatchObject({
      ok: false,
      code: "weak_password",
    });
    await expect(
      createFirstOwner(db, env.DB, "not-an-email", "a-very-long-password"),
    ).resolves.toMatchObject({ ok: false, code: "invalid_email" });

    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("refuses a second owner once one exists", async () => {
    await createFirstOwner(db, env.DB, "first@example.com", "a-very-long-password");
    await expect(
      createFirstOwner(db, env.DB, "second@example.com", "a-very-long-password"),
    ).resolves.toMatchObject({ ok: false, code: "owner_exists" });

    expect(await db.select().from(users)).toHaveLength(1);
  });

  /**
   * The race the plan calls out: two tabs POSTing /setup at the same moment.
   *
   * A read-then-write guard would let several requests pass the "any users?" check
   * before any of them inserts. The INSERT ... SELECT ... WHERE NOT EXISTS is
   * evaluated atomically by SQLite, so exactly one caller can win.
   */
  it("creates exactly one owner under parallel setup requests", async () => {
    const attempts = 20;
    const results = await Promise.all(
      Array.from({ length: attempts }, (_, i) =>
        createFirstOwner(db, env.DB, `racer${i}@example.com`, "a-very-long-password"),
      ),
    );

    const winners = results.filter((r) => r.ok);
    const losers = results.filter((r) => !r.ok);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(attempts - 1);
    for (const loser of losers) {
      expect(loser).toMatchObject({ ok: false, code: "owner_exists" });
    }

    // The database is the real check: one row, and it is the winner's.
    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(winners[0]).toMatchObject({ ok: true, userId: rows[0].id });
  });
});

describe("anyUserExists", () => {
  it("is false before setup and true afterwards", async () => {
    await expect(anyUserExists(env.DB)).resolves.toBe(false);
    await createFirstOwner(db, env.DB, "owner@example.com", "a-very-long-password");
    await expect(anyUserExists(env.DB)).resolves.toBe(true);
  });
});

describe("setup token", () => {
  it("allows setup when no token is configured (default deploy)", () => {
    expect(setupTokenOk(undefined, undefined)).toBe(true);
    expect(setupTokenOk(undefined, "anything")).toBe(true);
    expect(setupTokenOk("", undefined)).toBe(true);
  });

  it("requires a matching token when one is configured", () => {
    expect(setupTokenOk("s3cret", "s3cret")).toBe(true);
    expect(setupTokenOk("s3cret", "wrong")).toBe(false);
    expect(setupTokenOk("s3cret", undefined)).toBe(false);
    expect(setupTokenOk("s3cret", "s3cret-with-suffix")).toBe(false);
    expect(setupTokenOk("s3cret", "s3cre")).toBe(false);
  });

  it("reads the token from a header or the query string", () => {
    expect(
      readSetupToken(new Request("https://x.test/setup", { headers: { "x-setup-token": "h" } })),
    ).toBe("h");
    expect(readSetupToken(new Request("https://x.test/setup?token=q"))).toBe("q");
    expect(readSetupToken(new Request("https://x.test/setup"))).toBeUndefined();
  });
});
