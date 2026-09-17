import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  emailDeliveries,
  submissions,
  webhookDeliveries,
  webhooks,
  type Form,
  type Submission,
} from "../db/schema";
import { ulid } from "../ids";
import { safeReplyTo } from "../notify/sanitise";
import type { Job } from "./types";

/** One auto-reply per address per form per 24h. */
export const AUTO_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function parseRecipients(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Turn one `submission.created` into durable delivery rows, then the jobs to send them.
 *
 * Rows first, jobs second, and the rows carry unique constraints — that ordering is what
 * makes the fan-out idempotent. Queues are at-least-once, so this whole function can run
 * twice for the same submission; the second run's inserts collide with the unique index
 * and produce no new work.
 *
 * Returns the jobs to enqueue. The caller enqueues them, so this stays testable without
 * a queue.
 */
export async function fanOutSubmission(
  db: Database,
  form: Form,
  submission: Submission,
  now: number = Date.now(),
): Promise<Job[]> {
  // Spam never triggers notifications or webhooks (Section 13). Checked here rather than
  // at each sender, so there is one place this can be got wrong.
  if (submission.status === "spam") return [];

  const jobs: Job[] = [];

  for (const recipient of parseRecipients(form.notifyEmailsJson)) {
    const id = await createEmailDelivery(db, submission.id, "owner_alert", recipient, now);
    if (id) jobs.push({ type: "email.send", deliveryId: id });
  }

  if (form.autoReplyEnabled) {
    const to = safeReplyTo(submission.email);
    if (to && (await autoReplyAllowed(db, to, submission.id, now))) {
      const id = await createEmailDelivery(db, submission.id, "auto_reply", to, now);
      if (id) jobs.push({ type: "email.send", deliveryId: id });
    }
  }

  // Webhooks scoped to this form, plus those with no form (all forms).
  const hooks = await db
    .select()
    .from(webhooks)
    .where(
      and(eq(webhooks.active, true), or(eq(webhooks.formId, form.id), isNull(webhooks.formId))),
    );

  for (const hook of hooks) {
    const id = await createWebhookDelivery(db, hook.id, submission.id, now);
    if (id) jobs.push({ type: "webhook.deliver", deliveryId: id });
  }

  // Marks fan-out complete. A submission left without this is one whose
  // `submission.created` job never finished, and the recovery sweep re-runs it.
  await db.update(submissions).set({ fannedOutAt: now }).where(eq(submissions.id, submission.id));

  return jobs;
}

/**
 * Create a delivery row, or return the existing one when it is still pending.
 *
 * The unique index does the work: a duplicate insert throws, and that throw is the
 * idempotency signal. Checking first with a SELECT would reintroduce a race between two
 * concurrent runs of the same job.
 *
 * ⚠️ "Already exists" is **not** "already queued". A row can exist because a previous
 * fan-out inserted it and then died before enqueuing the job, or because the message was
 * lost. Returning null for every collision would strand that delivery forever. So a
 * collision returns the existing id when the row is still `pending`, and null only when
 * it has actually been resolved (sent/failed/skipped).
 */
async function createEmailDelivery(
  db: Database,
  submissionId: string,
  kind: "owner_alert" | "auto_reply",
  recipient: string,
  now: number,
): Promise<string | null> {
  const id = ulid(now);
  try {
    await db.insert(emailDeliveries).values({
      id,
      submissionId,
      kind,
      recipient,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    return id;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;

    const existing = await db
      .select({ id: emailDeliveries.id, status: emailDeliveries.status })
      .from(emailDeliveries)
      .where(
        and(
          eq(emailDeliveries.submissionId, submissionId),
          eq(emailDeliveries.kind, kind),
          eq(emailDeliveries.recipient, recipient),
        ),
      )
      .limit(1);

    // Re-enqueue a stranded pending row; leave resolved ones alone.
    return existing[0]?.status === "pending" ? existing[0].id : null;
  }
}

async function createWebhookDelivery(
  db: Database,
  webhookId: string,
  submissionId: string,
  now: number,
): Promise<string | null> {
  const id = ulid(now);
  try {
    await db.insert(webhookDeliveries).values({
      id,
      webhookId,
      submissionId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    return id;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;

    const existing = await db
      .select({ id: webhookDeliveries.id, status: webhookDeliveries.status })
      .from(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.webhookId, webhookId),
          eq(webhookDeliveries.submissionId, submissionId),
        ),
      )
      .limit(1);

    return existing[0]?.status === "pending" ? existing[0].id : null;
  }
}

/**
 * Throttle auto-replies per recipient.
 *
 * Without this, a form with auto-reply on is a free email relay: submit repeatedly with
 * someone else's address and the instance mails them from the owner's domain each time.
 * The cap turns a flood into a single message.
 */
async function autoReplyAllowed(
  db: Database,
  recipient: string,
  submissionId: string,
  now: number,
): Promise<boolean> {
  const since = now - AUTO_REPLY_WINDOW_MS;

  const recent = await db
    .select({ id: emailDeliveries.id, submissionId: emailDeliveries.submissionId })
    .from(emailDeliveries)
    .where(
      and(
        eq(emailDeliveries.recipient, recipient),
        eq(emailDeliveries.kind, "auto_reply"),
        gt(emailDeliveries.createdAt, since),
      ),
    )
    .limit(1);

  // A row from *this* submission is a retry of the same job, not a new send, so it must
  // not count against the limit.
  if (recent.length === 0) return true;
  return recent[0].submissionId === submissionId;
}

export function isUniqueViolation(err: unknown): boolean {
  const cause = (err as { cause?: { message?: string } }).cause?.message ?? "";
  return /UNIQUE constraint failed/i.test(cause);
}
