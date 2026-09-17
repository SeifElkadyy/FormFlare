import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/lib/db/client";
import { forms, projects, submissions, users } from "../src/lib/db/schema";
import { publicId, ulid } from "../src/lib/ids";
import { expectUniqueViolation } from "./helpers";

const db = createDb(env.DB);

async function seedForm(mode: "standard" | "waitlist" = "waitlist") {
  const now = Date.now();
  const projectId = ulid();
  const formId = ulid();

  await db.insert(projects).values({ id: projectId, name: "Test project", createdAt: now });
  await db.insert(forms).values({
    id: formId,
    publicId: publicId(),
    projectId,
    name: "Waitlist",
    mode,
    createdAt: now,
    updatedAt: now,
  });

  return formId;
}

beforeEach(async () => {
  // Order matters: children before parents, though cascades cover most of it.
  await db.delete(submissions);
  await db.delete(forms);
  await db.delete(projects);
  await db.delete(users);
});

describe("migrations", () => {
  it("creates every table", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf%'",
    ).all<{ name: string }>();
    const names = results.map((r) => r.name);

    for (const table of [
      "settings",
      "users",
      "sessions",
      "projects",
      "forms",
      "submissions",
      "files",
      "webhooks",
      "webhook_deliveries",
      "api_keys",
      "audit_log",
    ]) {
      expect(names).toContain(table);
    }
  });
});

describe("defaults", () => {
  it("applies form defaults without specifying them", async () => {
    const formId = await seedForm("standard");
    const [form] = await db.select().from(forms).where(eq(forms.id, formId));

    expect(form.active).toBe(true);
    expect(form.mode).toBe("standard");
    expect(form.honeypotField).toBe("_gotcha");
    expect(form.fieldsJson).toBe("[]");
    expect(form.submissionCount).toBe(0);
    expect(form.autoReplyEnabled).toBe(false);
    expect(form.doubleOptIn).toBe(false);
    expect(form.referralBoost).toBe(0);
    expect(form.fileMaxBytes).toBe(5 * 1024 * 1024);
  });

  it("stores booleans as real booleans through Drizzle", async () => {
    const now = Date.now();
    const id = ulid();
    await db.insert(users).values({
      id,
      email: "owner@example.com",
      passwordHash: "pbkdf2$100000$salt$hash",
      createdAt: now,
    });

    const [user] = await db.select().from(users).where(eq(users.id, id));
    expect(user.disabled).toBe(false);
    expect(user.role).toBe("owner");
  });
});

describe("unique constraints", () => {
  it("rejects a duplicate user email", async () => {
    const now = Date.now();
    const row = {
      email: "dup@example.com",
      passwordHash: "pbkdf2$100000$salt$hash",
      createdAt: now,
    };

    await db.insert(users).values({ id: ulid(), ...row });
    await expectUniqueViolation(db.insert(users).values({ id: ulid(), ...row }), "users.email");
  });

  it("rejects a duplicate form public id", async () => {
    const now = Date.now();
    const projectId = ulid();
    await db.insert(projects).values({ id: projectId, name: "p", createdAt: now });

    const shared = publicId();
    const base = { projectId, name: "f", createdAt: now, updatedAt: now };

    await db.insert(forms).values({ id: ulid(), publicId: shared, ...base });
    await expectUniqueViolation(
      db.insert(forms).values({ id: ulid(), publicId: shared, ...base }),
      "forms.public_id",
    );
  });
});

describe("waitlist dedupe (partial unique index)", () => {
  it("rejects the same email twice on one form", async () => {
    const formId = await seedForm();
    const base = { formId, dataJson: "{}", createdAt: Date.now() };

    await db.insert(submissions).values({ id: ulid(), email: "a@example.com", ...base });
    // Either dedupe index may report first for a byte-identical duplicate, so this
    // asserts the constraint fired without pinning which one.
    await expectUniqueViolation(
      db.insert(submissions).values({ id: ulid(), email: "a@example.com", ...base }),
    );
  });

  it("allows the same email on different forms", async () => {
    const formA = await seedForm();
    const formB = await seedForm();
    const now = Date.now();

    await db.insert(submissions).values({
      id: ulid(),
      formId: formA,
      email: "a@example.com",
      dataJson: "{}",
      createdAt: now,
    });
    await expect(
      db.insert(submissions).values({
        id: ulid(),
        formId: formB,
        email: "a@example.com",
        dataJson: "{}",
        createdAt: now,
      }),
    ).resolves.toBeDefined();
  });

  /**
   * The index is partial (WHERE email IS NOT NULL), so contact forms that collect
   * no email are unaffected. A plain UNIQUE index would also permit this, since
   * SQLite treats NULLs as distinct — but the partial form makes the intent explicit
   * and keeps the index small.
   */
  it("allows many submissions with no email on the same form", async () => {
    const formId = await seedForm("standard");
    const base = { formId, dataJson: "{}", createdAt: Date.now() };

    for (let i = 0; i < 3; i++) {
      await db.insert(submissions).values({ id: ulid(), email: null, ...base });
    }

    const rows = await db.select().from(submissions).where(eq(submissions.formId, formId));
    expect(rows).toHaveLength(3);
  });

  /**
   * SQLite's default collation is case-sensitive, so the raw-email index in 0001 would
   * let "A@Example.com" through as a second signup. The lower(email) expression index
   * in 0002 closes that hole at the database level, so a caller that forgets to
   * normalise still cannot create a duplicate.
   */
  it("rejects the same email in different casing", async () => {
    const formId = await seedForm();
    const base = { formId, dataJson: "{}", createdAt: Date.now() };

    await db.insert(submissions).values({ id: ulid(), email: "a@example.com", ...base });
    await expectUniqueViolation(
      db.insert(submissions).values({ id: ulid(), email: "A@Example.com", ...base }),
      "submissions_form_email_ci_uq",
    );
  });

  it("rejects mixed casing in either insertion order", async () => {
    const formId = await seedForm();
    const base = { formId, dataJson: "{}", createdAt: Date.now() };

    await db.insert(submissions).values({ id: ulid(), email: "MiXeD@Example.COM", ...base });
    await expectUniqueViolation(
      db.insert(submissions).values({ id: ulid(), email: "mixed@example.com", ...base }),
      "submissions_form_email_ci_uq",
    );
  });

  it("still allows different emails that differ by more than case", async () => {
    const formId = await seedForm();
    const base = { formId, dataJson: "{}", createdAt: Date.now() };

    await db.insert(submissions).values({ id: ulid(), email: "a@example.com", ...base });
    await expect(
      db.insert(submissions).values({ id: ulid(), email: "b@example.com", ...base }),
    ).resolves.toBeDefined();
  });
});

describe("cascades", () => {
  it("deletes submissions when their form is deleted", async () => {
    const formId = await seedForm();
    await db.insert(submissions).values({
      id: ulid(),
      formId,
      email: "x@example.com",
      dataJson: "{}",
      createdAt: Date.now(),
    });

    await db.delete(forms).where(eq(forms.id, formId));

    const rows = await db.select().from(submissions).where(eq(submissions.formId, formId));
    expect(rows).toHaveLength(0);
  });
});
