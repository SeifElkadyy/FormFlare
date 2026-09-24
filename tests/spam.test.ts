import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/lib/db/client";
import { forms, projects, settings, submissions } from "../src/lib/db/schema";
import { SETTING, setSetting } from "../src/lib/db/settings";
import { publicId as newPublicId, ulid } from "../src/lib/ids";
import {
  MIN_FILL_MS,
  blocklistReason,
  fillTimeReason,
  parseBlocklist,
  signFillToken,
} from "../src/lib/spam/filter";
import { clearFormCache } from "../src/lib/submissions/form-cache";
import { handleSubmission } from "../src/lib/submissions/handle";

const db = createDb(env.DB);
const SECRET = "test-session-secret-value";

function countingCtx() {
  const state = { jobs: 0 };
  const ctx = {
    waitUntil: () => {
      state.jobs++;
    },
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;
  return { ctx, state };
}

async function seedForm(overrides: Partial<typeof forms.$inferInsert> = {}) {
  const now = Date.now();
  const projectId = ulid();
  const id = ulid();
  const publicId = newPublicId();
  await db.insert(projects).values({ id: projectId, name: "P", createdAt: now });
  await db.insert(forms).values({
    id,
    publicId,
    projectId,
    name: "F",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  clearFormCache();
  return { id, publicId };
}

function post(publicId: string, data: Record<string, string>) {
  return new Request(`https://forms.test/f/${publicId}`, {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "content-type": "application/json", accept: "application/json" },
  });
}

beforeEach(async () => {
  await db.delete(submissions);
  await db.delete(forms);
  await db.delete(projects);
  await db.delete(settings);
  await setSetting(db, SETTING.sessionSecret, SECRET);
  clearFormCache();
});

describe("fill-time token", () => {
  it("accepts a missing token: forms on the owner's own site never have one", async () => {
    expect(await fillTimeReason(undefined, SECRET)).toBeNull();
  });

  it("flags a submit faster than a person can type", async () => {
    const token = await signFillToken(SECRET, 1_000);
    expect(await fillTimeReason(token, SECRET, 1_000 + MIN_FILL_MS - 1)).toBe("Submitted too fast");
    expect(await fillTimeReason(token, SECRET, 1_000 + MIN_FILL_MS)).toBeNull();
  });

  it("flags a forged or edited token", async () => {
    const token = await signFillToken(SECRET, 1_000);
    const edited = token.replace(/^1000/, "1");
    expect(await fillTimeReason(edited, SECRET, 99_999)).toBe("Tampered form token");
    expect(await fillTimeReason("garbage", SECRET)).toBe("Tampered form token");
  });
});

describe("blocklist", () => {
  const list = parseBlocklist("  SEO Services \n@spam.test\n\n");

  it("normalises entries", () => {
    expect(list).toEqual(["seo services", "@spam.test"]);
  });

  it("matches phrases case-insensitively anywhere in the submission", () => {
    expect(blocklistReason({ message: "Cheap seo SERVICES here" }, null, list)).toBe(
      "Blocked phrase: seo services",
    );
  });

  it("matches an email domain and its subdomains, not lookalikes", () => {
    expect(blocklistReason({}, "a@spam.test", list)).toBe("Blocked domain: @spam.test");
    expect(blocklistReason({}, "a@mail.spam.test", list)).toBe("Blocked domain: @spam.test");
    expect(blocklistReason({}, "a@notspam.test", list)).toBeNull();
  });
});

describe("caught submissions", () => {
  it("are kept as spam, get a normal success, and create no job", async () => {
    const form = await seedForm({ spamWords: "casino" });
    const { ctx, state } = countingCtx();

    const res = await handleSubmission(
      post(form.publicId, { email: "a@example.com", message: "best casino" }),
      env,
      ctx,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(state.jobs).toBe(0);

    const rows = await db.select().from(submissions).where(eq(submissions.formId, form.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "spam", spamReason: "Blocked phrase: casino" });
  });

  it("do not take a waitlist place or block the real person's signup", async () => {
    const form = await seedForm({ mode: "waitlist", spamWords: "casino" });

    await handleSubmission(
      post(form.publicId, { email: "a@example.com", note: "casino" }),
      env,
      countingCtx().ctx,
    );
    clearFormCache();
    const real = await handleSubmission(
      post(form.publicId, { email: "a@example.com" }),
      env,
      countingCtx().ctx,
    );

    const body = (await real.json()) as { duplicate?: boolean; waitlist?: { position: number } };
    expect(body.duplicate).toBeUndefined();
    expect(body.waitlist?.position).toBe(1);
  });

  it("catches a too-fast submit from the hosted page", async () => {
    const form = await seedForm();
    const token = await signFillToken(SECRET);

    await handleSubmission(
      post(form.publicId, { email: "a@example.com", _ts: token }),
      env,
      countingCtx().ctx,
    );

    const [row] = await db.select().from(submissions).where(eq(submissions.formId, form.id));
    expect(row).toMatchObject({ status: "spam", spamReason: "Submitted too fast" });
    // The token is control data, never stored.
    expect(JSON.parse(row.dataJson)).not.toHaveProperty("_ts");
  });
});
