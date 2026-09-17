import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../src/lib/db/client";
import { emailDeliveries, forms, projects, settings, submissions } from "../src/lib/db/schema";
import { SETTING, setSetting } from "../src/lib/db/settings";
import { encryptSecret } from "../src/lib/crypto/secrets";
import { publicId as newPublicId, ulid } from "../src/lib/ids";
import { fanOutSubmission } from "../src/lib/jobs/fanout";
import { resendMailer } from "../src/lib/platform/resend";
import { resolveMailer } from "../src/lib/platform/resolve-mailer";
import { handleSubmission } from "../src/lib/submissions/handle";
import { clearFormCache } from "../src/lib/submissions/form-cache";
import { getUpdateStatus } from "../src/lib/update/check";
import { APP_VERSION } from "../src/lib/version";
import { confirmSignup } from "../src/lib/waitlist/complete";
import { signConfirmToken } from "../src/lib/waitlist/confirm";
import { publicCount, waitlistRank } from "../src/lib/waitlist/rank";
import { handlePublicCount } from "../src/lib/submissions/count";
import { wipeInstance } from "../src/lib/instance/wipe";
import { r2Storage } from "../src/lib/platform/storage";
import { users } from "../src/lib/db/schema";

const db = createDb(env.DB);
const SECRET = "v02-test-session-secret";

function ctx(): ExecutionContext {
  return { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
}

function jsonPost(url: string, body: unknown, ip = "203.0.113.9") {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "cf-connecting-ip": ip,
    },
  });
}

beforeEach(async () => {
  await db.delete(emailDeliveries);
  await db.delete(submissions);
  await db.delete(forms);
  await db.delete(projects);
  await db.delete(users);
  await db.delete(settings);
  await setSetting(db, SETTING.sessionSecret, SECRET);
  clearFormCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("update check", () => {
  it("ignores pre-release tags and caches a newer stable release", async () => {
    const [major, minor, patch] = APP_VERSION.split(".").map(Number);
    const newer = `v${major}.${minor}.${patch + 1}`;
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ tag_name: newer, html_url: "https://example/rel", prerelease: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const status = await getUpdateStatus(db, { force: true, fetcher, now: 1_000 });
    expect(status.latest).toBe(newer);
    expect(status.newer).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();

    const cached = await getUpdateStatus(db, { fetcher, now: 2_000 });
    expect(cached.latest).toBe(newer);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe("resend mailer", () => {
  it("POSTs to Resend with Bearer auth", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const mailer = resendMailer("re_test");
    const result = await mailer.send({
      to: "a@b.com",
      from: "from@example.com",
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
    });
    expect(result.ok).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toBe("https://api.resend.com/emails");
    const init = spy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test");
  });

  it("uses the Resend key from settings when that provider is selected", async () => {
    await setSetting(db, SETTING.mailProvider, "resend");
    await setSetting(db, SETTING.resendApiKey, await encryptSecret("re_live", SECRET));
    const mailer = await resolveMailer(db, {});
    expect(mailer.available).toBe(true);
  });
});

describe("double opt-in and referrals", () => {
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
      doubleOptIn: true,
      referralBoost: 1,
      createdAt: now,
      updatedAt: now,
    });
    clearFormCache();
    return { formId, publicId: pid };
  }

  it("stores a pending signup with no position and only an opt-in job", async () => {
    const { formId, publicId } = await seedWaitlist();
    const response = await handleSubmission(
      jsonPost(`https://forms.test/f/${publicId}`, { email: "a@example.com" }),
      env,
      ctx(),
    );
    const body = (await response.json()) as { ok: boolean; pending?: boolean; waitlist?: unknown };
    expect(body.ok).toBe(true);
    expect(body.pending).toBe(true);
    expect(body.waitlist).toBeUndefined();

    const [row] = await db.select().from(submissions).where(eq(submissions.formId, formId));
    expect(row.waitlistPosition).toBeNull();
    expect(row.optedInAt).toBeNull();

    const jobs = await fanOutSubmission(db, (await db.select().from(forms).where(eq(forms.id, formId)))[0], row);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ type: "email.send" });
    const [delivery] = await db.select().from(emailDeliveries);
    expect(delivery.kind).toBe("opt_in");
  });

  it("assigns a position and credits the referrer on confirm", async () => {
    const { formId, publicId } = await seedWaitlist();
    await handleSubmission(
      jsonPost(`https://forms.test/f/${publicId}`, { email: "first@example.com" }),
      env,
      ctx(),
    );
    const [first] = await db.select().from(submissions);
    const token = await signConfirmToken(first.id, SECRET, Date.now());
    const confirmed = await confirmSignup(env, first.id, token.exp, token.sig);
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.position).toBe(1);

    await handleSubmission(
      jsonPost(`https://forms.test/f/${publicId}`, {
        email: "second@example.com",
        _ref: first.referralCode,
      }),
      env,
      ctx(),
    );
    const second = (await db.select().from(submissions).where(eq(submissions.email, "second@example.com")))[0];
    const token2 = await signConfirmToken(second.id, SECRET, Date.now());
    await confirmSignup(env, second.id, token2.exp, token2.sig);

    const ranked = await waitlistRank(env.DB, formId, first.id);
    expect(ranked?.referrals).toBe(1);
    expect(ranked?.rank).toBe(1);

    expect(await publicCount(env.DB, publicId)).toBe(2);
  });
});

describe("public count", () => {
  it("404s unknown forms and CORS-allows GET", async () => {
    const response = await handlePublicCount(
      new Request("https://forms.test/f/nope/count", { method: "GET", headers: { origin: "https://x.test" } }),
      env,
      "nope",
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://x.test");
  });
});

describe("wipe instance", () => {
  it("removes users and settings so setup can run again", async () => {
    await db.insert(users).values({
      id: ulid(),
      email: "owner@example.com",
      passwordHash: "pbkdf2$100000$e30=$e30=",
      createdAt: Date.now(),
    });
    await setSetting(db, SETTING.setupCompleted, "true");
    await wipeInstance(db, r2Storage(env.BUCKET));
    expect(await db.select().from(users)).toHaveLength(0);
    expect(await db.select().from(settings)).toHaveLength(0);
  });
});
