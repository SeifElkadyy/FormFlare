import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../src/lib/db/client";
import {
  emailDeliveries,
  forms,
  projects,
  settings,
  submissions,
  webhookDeliveries,
  webhooks,
} from "../src/lib/db/schema";
import { SETTING, setSetting } from "../src/lib/db/settings";
import { encryptSecret } from "../src/lib/crypto/secrets";
import { publicId as newPublicId, ulid } from "../src/lib/ids";
import { consumeJobs } from "../src/lib/jobs/consumer";
import { fanOutSubmission, AUTO_REPLY_WINDOW_MS } from "../src/lib/jobs/fanout";
import { pruneDeliveryLogs, DELIVERY_LOG_RETENTION_MS } from "../src/lib/jobs/maintenance";
import type { Job } from "../src/lib/jobs/types";
import { fakeMailer } from "./fake-mailer";

const db = createDb(env.DB);
const SESSION_SECRET = "jobs-test-session-secret";

/** A MessageBatch whose ack/retry calls are recorded. */
function batchOf(jobs: Job[], attempts = 1) {
  const acked: number[] = [];
  const retried: { index: number; delaySeconds?: number }[] = [];

  const messages = jobs.map((body, index) => ({
    id: `msg-${index}`,
    timestamp: new Date(),
    body,
    attempts,
    ack: () => acked.push(index),
    retry: (opts?: { delaySeconds?: number }) =>
      retried.push({ index, delaySeconds: opts?.delaySeconds }),
  }));

  return {
    batch: {
      messages,
      queue: "test",
      ackAll: () => {},
      retryAll: () => {},
    } as unknown as MessageBatch<unknown>,
    acked,
    retried,
  };
}

async function seed(
  formOverrides: Partial<typeof forms.$inferInsert> = {},
  submissionOverrides: Partial<typeof submissions.$inferInsert> = {},
) {
  const now = Date.now();
  const projectId = ulid();
  const formId = ulid();
  const submissionId = ulid();

  await db.insert(projects).values({ id: projectId, name: "P", createdAt: now });
  await db.insert(forms).values({
    id: formId,
    publicId: newPublicId(),
    projectId,
    name: "Contact",
    createdAt: now,
    updatedAt: now,
    ...formOverrides,
  });
  await db.insert(submissions).values({
    id: submissionId,
    formId,
    dataJson: JSON.stringify({ email: "visitor@example.com", message: "hello" }),
    email: "visitor@example.com",
    createdAt: now,
    ...submissionOverrides,
  });

  const [form] = await db.select().from(forms).where(eq(forms.id, formId));
  const [submission] = await db.select().from(submissions).where(eq(submissions.id, submissionId));
  return { form, submission };
}

beforeEach(async () => {
  await db.delete(emailDeliveries);
  await db.delete(webhookDeliveries);
  await db.delete(webhooks);
  await db.delete(submissions);
  await db.delete(forms);
  await db.delete(projects);
  await db.delete(settings);
  await setSetting(db, SETTING.sessionSecret, SESSION_SECRET);
  await setSetting(db, SETTING.notifyFrom, "forms@example.com");
  vi.restoreAllMocks();
});

describe("fan-out idempotency", () => {
  /**
   * The headline requirement. Queues are at-least-once, so the same submission.created
   * job can be delivered twice. The unique constraints mean the second run creates no
   * new rows — the invariant that matters, since the consumer then skips any delivery
   * that is no longer pending.
   *
   * A still-pending row IS handed back for re-enqueuing: "already exists" is not
   * "already queued", and a row whose job was lost must not be stranded.
   */
  it("creates delivery rows once even when the job runs twice", async () => {
    const { form, submission } = await seed({
      notifyEmailsJson: JSON.stringify(["owner@example.com"]),
    });

    const first = await fanOutSubmission(db, form, submission);
    const second = await fanOutSubmission(db, form, submission);

    expect(first).toHaveLength(1);
    // Same delivery, re-offered for enqueue — not a duplicate.
    expect(second).toEqual(first);
    expect(await db.select().from(emailDeliveries)).toHaveLength(1);

    // Once resolved, it is not offered again.
    await db.update(emailDeliveries).set({ status: "sent" });
    expect(await fanOutSubmission(db, form, submission)).toHaveLength(0);
  });

  it("creates one delivery per recipient", async () => {
    const { form, submission } = await seed({
      notifyEmailsJson: JSON.stringify(["a@example.com", "b@example.com"]),
    });

    const jobs = await fanOutSubmission(db, form, submission);
    expect(jobs).toHaveLength(2);
    expect(await db.select().from(emailDeliveries)).toHaveLength(2);
  });

  it("creates a webhook delivery per active webhook, once", async () => {
    const { form, submission } = await seed();
    const secret = await encryptSecret("whsec", SESSION_SECRET);

    await db.insert(webhooks).values({
      id: ulid(),
      formId: form.id,
      url: "https://receiver.example/hook",
      secret,
      createdAt: Date.now(),
    });
    // A webhook with no form fires for every form.
    await db.insert(webhooks).values({
      id: ulid(),
      formId: null,
      url: "https://receiver.example/all",
      secret,
      createdAt: Date.now(),
    });

    expect(await fanOutSubmission(db, form, submission)).toHaveLength(2);
    // Both rows are still pending, so they are re-offered rather than stranded.
    expect(await fanOutSubmission(db, form, submission)).toHaveLength(2);
    expect(await db.select().from(webhookDeliveries)).toHaveLength(2);

    await db.update(webhookDeliveries).set({ status: "success" });
    expect(await fanOutSubmission(db, form, submission)).toHaveLength(0);
  });

  it("skips inactive webhooks", async () => {
    const { form, submission } = await seed();
    await db.insert(webhooks).values({
      id: ulid(),
      formId: form.id,
      url: "https://receiver.example/hook",
      secret: await encryptSecret("whsec", SESSION_SECRET),
      active: false,
      createdAt: Date.now(),
    });

    expect(await fanOutSubmission(db, form, submission)).toHaveLength(0);
  });

  /** Spam never triggers notifications or webhooks (Section 13). */
  it("creates nothing for a spam submission", async () => {
    const { form, submission } = await seed(
      { notifyEmailsJson: JSON.stringify(["owner@example.com"]) },
      { status: "spam" },
    );
    await db.insert(webhooks).values({
      id: ulid(),
      formId: form.id,
      url: "https://receiver.example/hook",
      secret: await encryptSecret("whsec", SESSION_SECRET),
      createdAt: Date.now(),
    });

    expect(await fanOutSubmission(db, form, submission)).toHaveLength(0);
    expect(await db.select().from(emailDeliveries)).toHaveLength(0);
    expect(await db.select().from(webhookDeliveries)).toHaveLength(0);
  });
});

describe("auto-reply safety", () => {
  it("is off by default", async () => {
    const { form, submission } = await seed();
    const jobs = await fanOutSubmission(db, form, submission);
    expect(jobs).toHaveLength(0);
  });

  it("sends one when enabled", async () => {
    const { form, submission } = await seed({ autoReplyEnabled: true });
    const jobs = await fanOutSubmission(db, form, submission);

    expect(jobs).toHaveLength(1);
    const [row] = await db.select().from(emailDeliveries);
    expect(row.kind).toBe("auto_reply");
    expect(row.recipient).toBe("visitor@example.com");
  });

  /**
   * Without this cap, a form with auto-reply on is a free email relay: submit
   * repeatedly with someone else's address and the instance mails them each time,
   * from the owner's domain.
   */
  it("sends at most one per address per 24 hours", async () => {
    const now = Date.now();
    const first = await seed({ autoReplyEnabled: true });

    // A different form, because the same address cannot sign up twice on one form —
    // the waitlist dedupe index blocks that. The throttle is per address, so this is
    // the case that matters: one person hit by several of the owner's forms.
    const second = await seed({ autoReplyEnabled: true });

    await fanOutSubmission(db, first.form, first.submission, now);
    const jobs = await fanOutSubmission(db, second.form, second.submission, now + 60_000);

    expect(jobs).toHaveLength(0);
    expect(await db.select().from(emailDeliveries)).toHaveLength(1);
  });

  it("allows another after the window passes", async () => {
    const now = Date.now();
    const first = await seed({ autoReplyEnabled: true });
    const second = await seed({ autoReplyEnabled: true });

    await fanOutSubmission(db, first.form, first.submission, now);
    const jobs = await fanOutSubmission(
      db,
      second.form,
      second.submission,
      now + AUTO_REPLY_WINDOW_MS + 1000,
    );

    expect(jobs).toHaveLength(1);
  });

  /** A retry of the same submission must not be throttled by its own earlier row. */
  it("still retries the same submission within the window", async () => {
    const { form, submission } = await seed({ autoReplyEnabled: true });
    const now = Date.now();

    const first = await fanOutSubmission(db, form, submission, now);
    expect(first).toHaveLength(1);

    // The throttle must not block this submission's own retry, and the unique index
    // must not create a second row.
    expect(await fanOutSubmission(db, form, submission, now + 1000)).toEqual(first);
    expect(await db.select().from(emailDeliveries)).toHaveLength(1);
  });

  it("does not auto-reply without a usable submitter address", async () => {
    const { form, submission } = await seed({ autoReplyEnabled: true }, { email: null });
    expect(await fanOutSubmission(db, form, submission)).toHaveLength(0);
  });
});

describe("email consumer", () => {
  it("sends once and acks", async () => {
    const { form, submission } = await seed({
      notifyEmailsJson: JSON.stringify(["owner@example.com"]),
    });
    const [job] = await fanOutSubmission(db, form, submission);
    const mailer = fakeMailer();

    const { batch, acked, retried } = batchOf([job]);
    await consumeJobs(batch, env, { mailer });

    expect(mailer.sent).toHaveLength(1);
    expect(acked).toEqual([0]);
    expect(retried).toHaveLength(0);

    const [row] = await db.select().from(emailDeliveries);
    expect(row.status).toBe("sent");
  });

  /** The acceptance criterion: processing the same job twice sends once. */
  it("sends once when the same job is processed twice", async () => {
    const { form, submission } = await seed({
      notifyEmailsJson: JSON.stringify(["owner@example.com"]),
    });
    const [job] = await fanOutSubmission(db, form, submission);
    const mailer = fakeMailer();

    await consumeJobs(batchOf([job]).batch, env, { mailer });
    await consumeJobs(batchOf([job]).batch, env, { mailer });

    expect(mailer.sent).toHaveLength(1);
  });

  /**
   * Unavailable is not transient: retrying cannot conjure a binding, so it would burn
   * the retry budget for nothing.
   */
  it("acks and records skipped_unavailable when email is not configured", async () => {
    const { form, submission } = await seed({
      notifyEmailsJson: JSON.stringify(["owner@example.com"]),
    });
    const [job] = await fanOutSubmission(db, form, submission);

    const { batch, acked, retried } = batchOf([job]);
    await consumeJobs(batch, env, { mailer: fakeMailer(false) });

    expect(acked).toEqual([0]);
    expect(retried).toHaveLength(0);

    const [row] = await db.select().from(emailDeliveries);
    expect(row.status).toBe("skipped_unavailable");
  });

  it("retries with backoff on a transient failure", async () => {
    const { form, submission } = await seed({
      notifyEmailsJson: JSON.stringify(["owner@example.com"]),
    });
    const [job] = await fanOutSubmission(db, form, submission);

    const mailer = fakeMailer();
    mailer.failNext(1, "smtp timeout");

    const { batch, acked, retried } = batchOf([job], 1);
    await consumeJobs(batch, env, { mailer });

    expect(acked).toHaveLength(0);
    expect(retried).toHaveLength(1);
    expect(retried[0].delaySeconds).toBeGreaterThan(0);

    const [row] = await db.select().from(emailDeliveries);
    expect(row.status).toBe("pending");
    expect(row.lastError).toBe("smtp timeout");
  });

  it("marks failed and acks on the final attempt", async () => {
    const { form, submission } = await seed({
      notifyEmailsJson: JSON.stringify(["owner@example.com"]),
    });
    const [job] = await fanOutSubmission(db, form, submission);

    const mailer = fakeMailer();
    mailer.failNext(1, "permanent");

    // attempts >= MAX_ATTEMPTS: stop retrying.
    const { batch, acked, retried } = batchOf([job], 5);
    await consumeJobs(batch, env, { mailer });

    expect(acked).toEqual([0]);
    expect(retried).toHaveLength(0);

    const [row] = await db.select().from(emailDeliveries);
    expect(row.status).toBe("failed");
  });

  it("sets Reply-To from the submitter on owner alerts", async () => {
    const { form, submission } = await seed({
      notifyEmailsJson: JSON.stringify(["owner@example.com"]),
    });
    const [job] = await fanOutSubmission(db, form, submission);

    const mailer = fakeMailer();
    await consumeJobs(batchOf([job]).batch, env, { mailer });

    expect(mailer.sent[0].replyTo).toBe("visitor@example.com");
  });

  /** A crafted address must not reach the header at all. */
  it("omits Reply-To when the submitted address could inject a header", async () => {
    const { form, submission } = await seed(
      { notifyEmailsJson: JSON.stringify(["owner@example.com"]) },
      { email: "evil@example.com\nBcc: victim@example.com" },
    );
    const [job] = await fanOutSubmission(db, form, submission);

    const mailer = fakeMailer();
    await consumeJobs(batchOf([job]).batch, env, { mailer });

    expect(mailer.sent[0].replyTo).toBeUndefined();
  });

  it("escapes submitted content in the HTML body", async () => {
    const { form, submission } = await seed(
      { notifyEmailsJson: JSON.stringify(["owner@example.com"]) },
      { dataJson: JSON.stringify({ message: '<script>alert("xss")</script>' }) },
    );
    const [job] = await fanOutSubmission(db, form, submission);

    const mailer = fakeMailer();
    await consumeJobs(batchOf([job]).batch, env, { mailer });

    const html = mailer.sent[0].html;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  /**
   * Auto-replies go to an address a stranger typed in, so echoing their input would
   * make the instance a relay for attacker-authored text.
   */
  it("never echoes submitted content in an auto-reply", async () => {
    const { form, submission } = await seed(
      { autoReplyEnabled: true, autoReplyBody: "Thanks, we will be in touch." },
      { dataJson: JSON.stringify({ message: "ATTACKER-CONTROLLED-TEXT" }) },
    );
    const [job] = await fanOutSubmission(db, form, submission);

    const mailer = fakeMailer();
    await consumeJobs(batchOf([job]).batch, env, { mailer });

    const sent = mailer.sent[0];
    expect(sent.html).not.toContain("ATTACKER-CONTROLLED-TEXT");
    expect(sent.text).not.toContain("ATTACKER-CONTROLLED-TEXT");
    expect(sent.text).toBe("Thanks, we will be in touch.");
  });

  it("does not send for a submission later marked spam", async () => {
    const { form, submission } = await seed({
      notifyEmailsJson: JSON.stringify(["owner@example.com"]),
    });
    const [job] = await fanOutSubmission(db, form, submission);

    await db.update(submissions).set({ status: "spam" }).where(eq(submissions.id, submission.id));

    const mailer = fakeMailer();
    const { batch, acked } = batchOf([job]);
    await consumeJobs(batch, env, { mailer });

    expect(mailer.sent).toHaveLength(0);
    expect(acked).toEqual([0]);
  });
});

describe("batch isolation", () => {
  /**
   * If one handler throws and the exception escapes the loop, the whole batch is
   * retried — including messages that already succeeded, which would send twice.
   */
  it("one failing message does not fail the batch", async () => {
    const { form, submission } = await seed({
      notifyEmailsJson: JSON.stringify(["owner@example.com"]),
    });
    const [good] = await fanOutSubmission(db, form, submission);

    // A job referencing a row that does not exist, plus a malformed one.
    const jobs: Job[] = [
      { type: "email.send", deliveryId: "does-not-exist" },
      good,
      { type: "bogus" } as unknown as Job,
    ];

    const mailer = fakeMailer();
    const { batch, acked, retried } = batchOf(jobs);

    await expect(consumeJobs(batch, env, { mailer })).resolves.toBeUndefined();

    // Every message resolved exactly once.
    expect([...acked].sort()).toEqual([0, 1, 2]);
    expect(retried).toHaveLength(0);
    expect(mailer.sent).toHaveLength(1);
  });

  it("acks an unknown job type rather than retrying forever", async () => {
    const { batch, acked, retried } = batchOf([{ type: "nope" } as unknown as Job]);
    await consumeJobs(batch, env, { mailer: fakeMailer() });

    expect(acked).toEqual([0]);
    expect(retried).toHaveLength(0);
  });
});

describe("pruneDeliveryLogs", () => {
  it("deletes rows older than the retention window and keeps recent ones", async () => {
    const { form, submission } = await seed({
      notifyEmailsJson: JSON.stringify(["owner@example.com"]),
    });
    await fanOutSubmission(db, form, submission);

    const now = Date.now();

    // Age the single row beyond retention.
    await db.update(emailDeliveries).set({ updatedAt: now - DELIVERY_LOG_RETENTION_MS - 1000 });

    await pruneDeliveryLogs(db, now);
    expect(await db.select().from(emailDeliveries)).toHaveLength(0);
  });

  it("keeps rows inside the window", async () => {
    const { form, submission } = await seed({
      notifyEmailsJson: JSON.stringify(["owner@example.com"]),
    });
    await fanOutSubmission(db, form, submission);

    await pruneDeliveryLogs(db, Date.now());
    expect(await db.select().from(emailDeliveries)).toHaveLength(1);
  });
});
