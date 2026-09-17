import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/lib/db/client";
import { forms, projects, settings, submissions } from "../src/lib/db/schema";
import { SETTING, setSetting } from "../src/lib/db/settings";
import { publicId as newPublicId, ulid } from "../src/lib/ids";
import { handleSubmission } from "../src/lib/submissions/handle";
import { clearFormCache } from "../src/lib/submissions/form-cache";
import { claimPosition } from "../src/lib/waitlist/position";

const db = createDb(env.DB);

function ctx(): ExecutionContext {
  return { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
}

async function seedWaitlist() {
  const now = Date.now();
  const projectId = ulid();
  const formId = ulid();
  const pid = newPublicId();

  await db.insert(projects).values({ id: projectId, name: "P", createdAt: now });
  await db.insert(forms).values({
    id: formId,
    publicId: pid,
    projectId,
    name: "Waitlist",
    mode: "waitlist",
    createdAt: now,
    updatedAt: now,
  });

  clearFormCache();
  return { formId, publicId: pid };
}

/**
 * `ip` matters: SUBMIT_RATE_LIMIT is keyed on `formId:ip` and allows 10/60s, so a burst
 * of concurrent signups from one address is correctly throttled. Real signups arrive
 * from many addresses, so the concurrency test gives each request its own.
 */
function signup(publicId: string, email: string, ip = "203.0.113.1") {
  return new Request(`https://forms.test/f/${publicId}`, {
    method: "POST",
    body: JSON.stringify({ email }),
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "cf-connecting-ip": ip,
    },
  });
}

beforeEach(async () => {
  await db.delete(submissions);
  await db.delete(forms);
  await db.delete(projects);
  await db.delete(settings);
  await setSetting(db, SETTING.sessionSecret, "waitlist-test-secret");
  clearFormCache();
});

describe("waitlist positions", () => {
  it("numbers signups from 1", async () => {
    const { publicId } = await seedWaitlist();

    const first = await handleSubmission(signup(publicId, "a@example.com"), env, ctx());
    await expect(first.json()).resolves.toMatchObject({ ok: true, waitlist: { position: 1 } });

    const second = await handleSubmission(signup(publicId, "b@example.com"), env, ctx());
    await expect(second.json()).resolves.toMatchObject({ ok: true, waitlist: { position: 2 } });
  });

  /**
   * The acceptance criterion: 20 simultaneous signups must get 1..20, each exactly once.
   *
   * A SELECT-then-UPDATE counter fails this — several requests read the same value and
   * collide. The single `UPDATE ... RETURNING` cannot be split that way, and D1
   * serialises writes because each database is one Durable Object.
   *
   * Verified here in Miniflare; re-checked against a real deployment in Phase 6, since
   * Miniflare's scheduling is not identical to production's.
   */
  it("gives 20 concurrent signups unique, gap-free positions 1..20", async () => {
    const { publicId, formId } = await seedWaitlist();

    const responses = await Promise.all(
      // Distinct IPs: 20 signups from one address would (correctly) hit the rate limit.
      Array.from({ length: 20 }, (_, i) =>
        handleSubmission(
          signup(publicId, `racer${i}@example.com`, `203.0.113.${i + 10}`),
          env,
          ctx(),
        ),
      ),
    );

    for (const res of responses) expect(res.status).toBe(200);

    const bodies = (await Promise.all(responses.map((r) => r.json()))) as {
      waitlist: { position: number };
    }[];
    const reported = bodies.map((b) => b.waitlist.position).sort((a, b) => a - b);

    expect(reported).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));

    // The database must agree with what the submitters were told.
    const rows = await db.select().from(submissions).where(eq(submissions.formId, formId));
    expect(rows).toHaveLength(20);

    const stored = rows.map((r) => r.waitlistPosition).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(stored).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));

    // And the counter must match, so the next signup continues at 21.
    const [form] = await db.select().from(forms).where(eq(forms.id, formId));
    expect(form.submissionCount).toBe(20);
  });

  it("claimPosition alone is unique under concurrency", async () => {
    const { formId } = await seedWaitlist();

    const positions = await Promise.all(
      Array.from({ length: 50 }, () => claimPosition(env.DB, formId)),
    );

    expect(new Set(positions).size).toBe(50);
    expect([...positions].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
  });
});

describe("waitlist dedupe", () => {
  it("returns the original position for a duplicate, without a new row", async () => {
    const { publicId, formId } = await seedWaitlist();

    await handleSubmission(signup(publicId, "dup@example.com"), env, ctx());
    await handleSubmission(signup(publicId, "other@example.com"), env, ctx());

    const again = await handleSubmission(signup(publicId, "dup@example.com"), env, ctx());

    // Not an error (Section 12.1): success, the original position, flagged duplicate.
    expect(again.status).toBe(200);
    await expect(again.json()).resolves.toMatchObject({
      ok: true,
      duplicate: true,
      waitlist: { position: 1 },
    });

    expect(await db.select().from(submissions).where(eq(submissions.formId, formId))).toHaveLength(
      2,
    );
  });

  it("treats differently cased emails as the same person", async () => {
    const { publicId, formId } = await seedWaitlist();

    await handleSubmission(signup(publicId, "Person@Example.com"), env, ctx());
    const again = await handleSubmission(signup(publicId, "person@example.com"), env, ctx());

    await expect(again.json()).resolves.toMatchObject({
      duplicate: true,
      waitlist: { position: 1 },
    });
    expect(await db.select().from(submissions).where(eq(submissions.formId, formId))).toHaveLength(
      1,
    );
  });

  it("does not create a job for a duplicate signup", async () => {
    const { publicId } = await seedWaitlist();
    let jobs = 0;
    const countingCtx = {
      waitUntil: () => {
        jobs++;
      },
      passThroughOnException: () => {},
    } as unknown as ExecutionContext;

    await handleSubmission(signup(publicId, "dup@example.com"), env, countingCtx);
    expect(jobs).toBe(1);

    // The owner has already been told about this person.
    await handleSubmission(signup(publicId, "dup@example.com"), env, countingCtx);
    expect(jobs).toBe(1);
  });

  it("keeps positions consecutive when duplicates are interleaved", async () => {
    const { publicId, formId } = await seedWaitlist();

    await handleSubmission(signup(publicId, "a@example.com"), env, ctx()); // 1
    await handleSubmission(signup(publicId, "a@example.com"), env, ctx()); // duplicate
    await handleSubmission(signup(publicId, "b@example.com"), env, ctx()); // 2

    const rows = await db.select().from(submissions).where(eq(submissions.formId, formId));
    expect(rows.map((r) => r.waitlistPosition).sort()).toEqual([1, 2]);

    // A duplicate must not consume a position, or the list would develop gaps.
    const [form] = await db.select().from(forms).where(eq(forms.id, formId));
    expect(form.submissionCount).toBe(2);
  });

  it("redirects to /thanks with the position for a browser submission", async () => {
    const { publicId } = await seedWaitlist();

    const res = await handleSubmission(
      new Request(`https://forms.test/f/${publicId}`, {
        method: "POST",
        body: new URLSearchParams({ email: "a@example.com" }),
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
      env,
      ctx(),
    );

    expect(res.status).toBe(303);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/thanks");
    expect(location.searchParams.get("pos")).toBe("1");
  });
});
