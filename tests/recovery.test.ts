import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
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
import { fanOutSubmission } from "../src/lib/jobs/fanout";
import { recoverStuckWork, STUCK_AFTER_MS } from "../src/lib/jobs/recovery";
import type { JobQueue } from "../src/lib/platform/queue";
import type { Job } from "../src/lib/jobs/types";

const db = createDb(env.DB);
const SESSION_SECRET = "recovery-test-secret";

/** A queue that records instead of sending. */
function recordingQueue(): JobQueue & { sent: Job[] } {
  const sent: Job[] = [];
  return {
    sent,
    async send(job: Job) {
      sent.push(job);
    },
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
    dataJson: JSON.stringify({ message: "hi" }),
    email: `s-${submissionId}@example.com`,
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
});

describe("fan-out marks completion", () => {
  it("sets fannedOutAt when fan-out finishes", async () => {
    const { form, submission } = await seed({
      notifyEmailsJson: JSON.stringify(["owner@example.com"]),
    });
    expect(submission.fannedOutAt).toBeNull();

    const now = Date.now();
    await fanOutSubmission(db, form, submission, now);

    const [row] = await db.select().from(submissions).where(eq(submissions.id, submission.id));
    expect(row.fannedOutAt).toBe(now);
  });

  it("marks even a form with no recipients, so it is not swept forever", async () => {
    const { form, submission } = await seed();
    await fanOutSubmission(db, form, submission);

    const [row] = await db.select().from(submissions).where(eq(submissions.id, submission.id));
    expect(row.fannedOutAt).not.toBeNull();
  });
});

describe("already exists is not already queued", () => {
  /**
   * The gap this closes: a previous fan-out inserted the delivery row and then died
   * before enqueuing the job. Treating every unique-violation as "already handled"
   * would strand that delivery permanently.
   */
  it("returns the existing id when a pending row is found", async () => {
    const { form, submission } = await seed({
      notifyEmailsJson: JSON.stringify(["owner@example.com"]),
    });

    const first = await fanOutSubmission(db, form, submission);
    expect(first).toHaveLength(1);

    // The row exists and is still pending — re-running must hand it back so the job
    // can be enqueued again.
    const second = await fanOutSubmission(db, form, submission);
    expect(second).toHaveLength(1);
    expect(second[0]).toEqual(first[0]);

    // Still exactly one row: re-enqueuing is not re-creating.
    expect(await db.select().from(emailDeliveries)).toHaveLength(1);
  });

  it("does not re-enqueue a delivery that already resolved", async () => {
    const { form, submission } = await seed({
      notifyEmailsJson: JSON.stringify(["owner@example.com"]),
    });

    await fanOutSubmission(db, form, submission);
    await db.update(emailDeliveries).set({ status: "sent" });

    expect(await fanOutSubmission(db, form, submission)).toHaveLength(0);
  });

  it("applies the same rule to webhooks", async () => {
    const { form, submission } = await seed();
    await db.insert(webhooks).values({
      id: ulid(),
      formId: form.id,
      url: "https://receiver.example/hook",
      secret: await encryptSecret("whsec", SESSION_SECRET),
      createdAt: Date.now(),
    });

    const first = await fanOutSubmission(db, form, submission);
    expect(first).toHaveLength(1);

    // Pending: handed back.
    expect(await fanOutSubmission(db, form, submission)).toHaveLength(1);

    // Resolved: not handed back.
    await db.update(webhookDeliveries).set({ status: "success" });
    expect(await fanOutSubmission(db, form, submission)).toHaveLength(0);

    expect(await db.select().from(webhookDeliveries)).toHaveLength(1);
  });
});

describe("recoverStuckWork", () => {
  it("re-enqueues a submission whose fan-out never completed", async () => {
    const now = Date.now();
    // Old enough to count as stuck, and never fanned out.
    const { submission } = await seed({}, { createdAt: now - STUCK_AFTER_MS - 1000 });

    const queue = recordingQueue();
    const result = await recoverStuckWork(db, queue, now);

    expect(result.reFannedOut).toBe(1);
    expect(queue.sent).toEqual([{ type: "submission.created", submissionId: submission.id }]);
  });

  /** A submission from seconds ago may still be fanning out in a live request. */
  it("leaves recent submissions alone", async () => {
    const now = Date.now();
    await seed({}, { createdAt: now - 1000 });

    const queue = recordingQueue();
    const result = await recoverStuckWork(db, queue, now);

    expect(result.reFannedOut).toBe(0);
    expect(queue.sent).toHaveLength(0);
  });

  it("ignores submissions that already fanned out", async () => {
    const now = Date.now();
    await seed({}, { createdAt: now - STUCK_AFTER_MS - 1000, fannedOutAt: now - 60_000 });

    const queue = recordingQueue();
    expect((await recoverStuckWork(db, queue, now)).reFannedOut).toBe(0);
  });

  /**
   * Spam deliberately produces no deliveries, so it never gets a fannedOutAt. Without
   * this exclusion the sweep would re-enqueue every spam submission every 15 minutes,
   * forever.
   */
  it("ignores spam submissions", async () => {
    const now = Date.now();
    await seed({}, { createdAt: now - STUCK_AFTER_MS - 1000, status: "spam" });

    const queue = recordingQueue();
    expect((await recoverStuckWork(db, queue, now)).reFannedOut).toBe(0);
  });

  it("re-enqueues a pending email delivery that has gone quiet", async () => {
    const now = Date.now();
    const { form, submission } = await seed({
      notifyEmailsJson: JSON.stringify(["owner@example.com"]),
    });
    await fanOutSubmission(db, form, submission, now);

    // Age the row past the threshold.
    await db.update(emailDeliveries).set({ updatedAt: now - STUCK_AFTER_MS - 1000 });

    const queue = recordingQueue();
    const result = await recoverStuckWork(db, queue, now);

    expect(result.reQueuedEmails).toBe(1);
    expect(queue.sent.some((j) => j.type === "email.send")).toBe(true);
  });

  it("re-enqueues a pending webhook delivery that has gone quiet", async () => {
    const now = Date.now();
    const { form, submission } = await seed();
    await db.insert(webhooks).values({
      id: ulid(),
      formId: form.id,
      url: "https://receiver.example/hook",
      secret: await encryptSecret("whsec", SESSION_SECRET),
      createdAt: now,
    });
    await fanOutSubmission(db, form, submission, now);

    await db.update(webhookDeliveries).set({ updatedAt: now - STUCK_AFTER_MS - 1000 });

    const queue = recordingQueue();
    const result = await recoverStuckWork(db, queue, now);

    expect(result.reQueuedWebhooks).toBe(1);
    expect(queue.sent.some((j) => j.type === "webhook.deliver")).toBe(true);
  });

  it("leaves resolved deliveries alone", async () => {
    const now = Date.now();
    const { form, submission } = await seed({
      notifyEmailsJson: JSON.stringify(["owner@example.com"]),
    });
    await fanOutSubmission(db, form, submission, now);

    await db
      .update(emailDeliveries)
      .set({ status: "sent", updatedAt: now - STUCK_AFTER_MS - 1000 });

    const queue = recordingQueue();
    expect((await recoverStuckWork(db, queue, now)).reQueuedEmails).toBe(0);
  });

  it("does not re-enqueue a delivery that is retrying normally", async () => {
    const now = Date.now();
    const { form, submission } = await seed({
      notifyEmailsJson: JSON.stringify(["owner@example.com"]),
    });
    await fanOutSubmission(db, form, submission, now);

    // Updated a minute ago: a live retry, not a stranded row.
    await db.update(emailDeliveries).set({ updatedAt: now - 60_000 });

    const queue = recordingQueue();
    expect((await recoverStuckWork(db, queue, now)).reQueuedEmails).toBe(0);
  });

  /**
   * Without touching the rows, every sweep would re-enqueue the same delivery until the
   * retry finally lands — four times an hour, multiplying the work it is trying to fix.
   */
  it("touches rows so a second sweep does not re-enqueue them", async () => {
    const now = Date.now();
    const { form, submission } = await seed({
      notifyEmailsJson: JSON.stringify(["owner@example.com"]),
    });
    await fanOutSubmission(db, form, submission, now);
    await db.update(emailDeliveries).set({ updatedAt: now - STUCK_AFTER_MS - 1000 });

    const first = recordingQueue();
    expect((await recoverStuckWork(db, first, now)).reQueuedEmails).toBe(1);

    const second = recordingQueue();
    expect((await recoverStuckWork(db, second, now)).reQueuedEmails).toBe(0);
  });

  it("reports nothing when everything is healthy", async () => {
    const now = Date.now();
    const { form, submission } = await seed({
      notifyEmailsJson: JSON.stringify(["owner@example.com"]),
    });
    await fanOutSubmission(db, form, submission, now);

    const queue = recordingQueue();
    expect(await recoverStuckWork(db, queue, now)).toEqual({
      reFannedOut: 0,
      reQueuedEmails: 0,
      reQueuedWebhooks: 0,
    });
    expect(queue.sent).toHaveLength(0);
  });
});
