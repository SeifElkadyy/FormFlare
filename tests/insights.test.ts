import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/lib/db/client";
import { formViews, forms, projects, submissions } from "../src/lib/db/schema";
import { publicId, ulid } from "../src/lib/ids";
import { waitlistRank } from "../src/lib/waitlist/rank";
import { eq } from "drizzle-orm";
import {
  DAY_MS,
  formActivity,
  formSources,
  recordView,
  referrerHost,
  waitlistSummary,
} from "../src/lib/insights/form";

const db = createDb(env.DB);
const NOW = Date.UTC(2026, 8, 23, 12);
let formId: string;

async function sub(overrides: Partial<typeof submissions.$inferInsert> = {}) {
  const id = ulid();
  await db.insert(submissions).values({
    id,
    formId,
    dataJson: "{}",
    createdAt: NOW,
    ...overrides,
  });
  return id;
}

beforeEach(async () => {
  await db.delete(formViews);
  await db.delete(submissions);
  await db.delete(forms);
  await db.delete(projects);
  const projectId = ulid();
  formId = ulid();
  await db.insert(projects).values({ id: projectId, name: "P", createdAt: NOW });
  await db.insert(forms).values({
    id: formId,
    publicId: publicId(),
    projectId,
    name: "List",
    mode: "waitlist",
    createdAt: NOW,
    updatedAt: NOW,
  });
});

describe("formActivity", () => {
  it("buckets by UTC day, zero-fills gaps, skips spam, and divides by views", async () => {
    await sub();
    await sub();
    await sub({ createdAt: NOW - 2 * DAY_MS });
    await sub({ status: "spam" });
    await sub({ createdAt: NOW - 40 * DAY_MS }); // outside the window
    for (let i = 0; i < 6; i++) await recordView(env.DB, formId, NOW);

    const activity = await formActivity(env.DB, formId, 30, NOW);

    expect(activity.days).toHaveLength(30);
    expect(activity.days.at(-1)).toMatchObject({ submissions: 2, views: 6 });
    expect(activity.days.at(-3)?.submissions).toBe(1);
    expect(activity.totals).toEqual({ submissions: 3, views: 6 });
    expect(activity.conversion).toBe(0.5);
  });

  it("has no conversion without views", async () => {
    await sub();
    expect((await formActivity(env.DB, formId, 30, NOW)).conversion).toBeNull();
  });
});

describe("formSources", () => {
  it("merges referrers by host and treats missing as Direct", async () => {
    await sub({ referrer: "https://www.example.com/a" });
    await sub({ referrer: "https://example.com/b" });
    await sub({ referrer: null, country: "EG" });

    const { referrers, countries } = await formSources(env.DB, formId, 30, NOW);
    expect(referrers).toEqual([
      { label: "example.com", count: 2 },
      { label: "Direct", count: 1 },
    ]);
    expect(countries).toEqual([{ label: "EG", count: 1 }]);
  });

  it("never throws on a junk referrer", () => {
    expect(referrerHost("not a url")).toBe("Direct");
  });
});

describe("waitlistSummary", () => {
  /** Must order exactly like waitlistRank, or the leaderboard contradicts what signups were told. */
  it("ranks by position minus referral boost, then signup order", async () => {
    await sub({ email: "a@x.test", waitlistPosition: 1 });
    await sub({ email: "b@x.test", waitlistPosition: 2 });
    await sub({ email: "c@x.test", waitlistPosition: 3, referralCount: 1 });
    await sub({ email: "d@x.test", waitlistPosition: null }); // unconfirmed
    await sub({ email: "e@x.test", waitlistPosition: 4, referredById: "someone" });

    const board = await waitlistSummary(env.DB, formId, 2);

    // c scores 3 - 2 = 1 and ties a (1); a has the earlier id, so a stays first.
    expect(board.top.map((r) => [r.rank, r.email])).toEqual([
      [1, "a@x.test"],
      [2, "c@x.test"],
      [3, "b@x.test"],
      [4, "e@x.test"],
    ]);
    expect(board).toMatchObject({ confirmed: 4, pending: 1, referred: 1 });

    await db.update(forms).set({ referralBoost: 2 }).where(eq(forms.id, formId));
    for (const row of board.top) {
      expect((await waitlistRank(env.DB, formId, row.id))?.rank).toBe(row.rank);
    }
  });
});
