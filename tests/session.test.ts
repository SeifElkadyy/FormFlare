import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/lib/db/client";
import { auditLog, sessions, users } from "../src/lib/db/schema";
import { sha256Hex, ulid } from "../src/lib/ids";
import { hashPassword } from "../src/lib/auth/password";
import { login } from "../src/lib/auth/login";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  clearedSessionCookie,
  createSession,
  deleteExpiredSessions,
  destroySession,
  readCookie,
  resolveSession,
  sessionCookie,
} from "../src/lib/auth/session";

const db = createDb(env.DB);

async function seedUser(email = "owner@example.com", password = "a-very-long-password") {
  const id = ulid();
  await db.insert(users).values({
    id,
    email,
    passwordHash: await hashPassword(password),
    createdAt: Date.now(),
  });
  return id;
}

beforeEach(async () => {
  await db.delete(sessions);
  await db.delete(auditLog);
  await db.delete(users);
});

describe("session cookie", () => {
  it("is HttpOnly, Secure, SameSite=Lax and path-wide", () => {
    const cookie = sessionCookie("abc", 3600);
    expect(cookie).toContain(`${SESSION_COOKIE}=abc`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=3600");
  });

  it("clears with Max-Age=0", () => {
    expect(clearedSessionCookie()).toContain("Max-Age=0");
  });

  it("parses a cookie out of a header", () => {
    expect(readCookie("a=1; ff_session=tok; b=2", SESSION_COOKIE)).toBe("tok");
    expect(readCookie("other=1", SESSION_COOKIE)).toBeUndefined();
    expect(readCookie(null, SESSION_COOKIE)).toBeUndefined();
  });
});

describe("createSession", () => {
  it("stores only the SHA-256 of the token, never the token itself", async () => {
    const userId = await seedUser();
    const { cookieValue } = await createSession(db, userId);

    const rows = await db.select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(await sha256Hex(cookieValue));
    // The plaintext must appear nowhere in the row.
    expect(JSON.stringify(rows[0])).not.toContain(cookieValue);
  });

  it("expires 30 days out", async () => {
    const userId = await seedUser();
    const now = 1_700_000_000_000;
    const { expiresAt } = await createSession(db, userId, now);
    expect(expiresAt).toBe(now + SESSION_TTL_MS);
  });
});

describe("resolveSession", () => {
  it("resolves a valid cookie to its user", async () => {
    const userId = await seedUser();
    const { cookieValue } = await createSession(db, userId);
    await expect(resolveSession(db, cookieValue)).resolves.toMatchObject({ id: userId });
  });

  it("returns null for missing or unknown tokens", async () => {
    await expect(resolveSession(db, undefined)).resolves.toBeNull();
    await expect(resolveSession(db, "not-a-real-token")).resolves.toBeNull();
  });

  it("rejects an expired session and deletes the row", async () => {
    const userId = await seedUser();
    const now = 1_700_000_000_000;
    const { cookieValue } = await createSession(db, userId, now);

    const afterExpiry = now + SESSION_TTL_MS + 1;
    await expect(resolveSession(db, cookieValue, afterExpiry)).resolves.toBeNull();
    expect(await db.select().from(sessions)).toHaveLength(0);
  });

  it("rejects a session whose user has been disabled", async () => {
    const userId = await seedUser();
    const { cookieValue } = await createSession(db, userId);
    await db.update(users).set({ disabled: true }).where(eq(users.id, userId));
    await expect(resolveSession(db, cookieValue)).resolves.toBeNull();
  });
});

describe("destroySession", () => {
  it("deletes the session so the cookie stops working", async () => {
    const userId = await seedUser();
    const { cookieValue } = await createSession(db, userId);

    await destroySession(db, cookieValue);

    expect(await db.select().from(sessions)).toHaveLength(0);
    await expect(resolveSession(db, cookieValue)).resolves.toBeNull();
  });
});

describe("deleteExpiredSessions", () => {
  it("removes only expired rows", async () => {
    const userId = await seedUser();
    const now = 1_700_000_000_000;

    await createSession(db, userId, now - SESSION_TTL_MS - 1000); // expired
    const { cookieValue: live } = await createSession(db, userId, now);

    await deleteExpiredSessions(db, now);

    const rows = await db.select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(await sha256Hex(live));
  });
});

describe("login", () => {
  it("succeeds with the right password and issues a working session", async () => {
    const userId = await seedUser();
    const result = await login({ db }, "owner@example.com", "a-very-long-password");

    expect(result).toMatchObject({ ok: true, userId });
    if (!result.ok) return;
    await expect(resolveSession(db, result.cookieValue)).resolves.toMatchObject({ id: userId });
  });

  it("is case-insensitive on the email", async () => {
    await seedUser();
    await expect(
      login({ db }, "  OWNER@Example.com  ", "a-very-long-password"),
    ).resolves.toMatchObject({ ok: true });
  });

  it("rejects a wrong password and an unknown account identically", async () => {
    await seedUser();
    await expect(login({ db }, "owner@example.com", "wrong-password")).resolves.toMatchObject({
      ok: false,
      code: "invalid_credentials",
    });
    await expect(
      login({ db }, "nobody@example.com", "a-very-long-password"),
    ).resolves.toMatchObject({ ok: false, code: "invalid_credentials" });
  });

  it("rejects a disabled account", async () => {
    const userId = await seedUser();
    await db.update(users).set({ disabled: true }).where(eq(users.id, userId));
    await expect(login({ db }, "owner@example.com", "a-very-long-password")).resolves.toMatchObject(
      { ok: false, code: "invalid_credentials" },
    );
  });

  /** A fresh sign-in must end older sessions, so a leaked token dies on next login. */
  it("rotates: an older session stops working after a new login", async () => {
    const userId = await seedUser();
    const first = await login({ db }, "owner@example.com", "a-very-long-password");
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await login({ db }, "owner@example.com", "a-very-long-password");
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    await expect(resolveSession(db, first.cookieValue)).resolves.toBeNull();
    await expect(resolveSession(db, second.cookieValue)).resolves.toMatchObject({ id: userId });
    expect(await db.select().from(sessions)).toHaveLength(1);
  });

  it("writes an audit entry for success and for failure", async () => {
    await seedUser();
    await login({ db }, "owner@example.com", "wrong-password");
    await login({ db }, "owner@example.com", "a-very-long-password");

    const entries = await db.select().from(auditLog);
    const actions = entries.map((e) => e.action);
    expect(actions).toContain("login.failed");
    expect(actions).toContain("login.success");
  });

  it("stops at the rate limit and records it", async () => {
    await seedUser();

    // Exhaust the limiter: configured at 10 per 60s.
    for (let i = 0; i < 10; i++) {
      await login(
        { db, limiter: env.LOGIN_RATE_LIMIT, ip: "203.0.113.5" },
        "owner@example.com",
        "wrong-password",
      );
    }

    const blocked = await login(
      { db, limiter: env.LOGIN_RATE_LIMIT, ip: "203.0.113.5" },
      "owner@example.com",
      "a-very-long-password", // correct password, still refused
    );

    expect(blocked).toMatchObject({ ok: false, code: "rate_limited" });

    const actions = (await db.select().from(auditLog)).map((e) => e.action);
    expect(actions).toContain("login.rate_limited");
  });
});
