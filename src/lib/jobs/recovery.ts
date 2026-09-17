import { and, eq, isNull, lt, ne, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { emailDeliveries, forms, submissions, webhookDeliveries } from "../db/schema";
import type { JobQueue } from "../platform/queue";

/**
 * Recovery sweep for work that fell through the cracks.
 *
 * Queues guarantee at-*least*-once delivery of messages they accepted — they do not
 * guarantee that a message was ever accepted. Several things leave durable state with no
 * live job behind it:
 *
 * - The Worker is evicted between writing a delivery row and enqueuing its job.
 * - `ctx.waitUntil` is cut short, so `submission.created` never reaches the queue.
 * - A consumer marks a row `pending` for retry, then that retry is lost.
 *
 * None of these are visible as failures: the row simply sits at `pending` forever, and
 * an owner never gets their alert. This sweep finds them and re-enqueues.
 *
 * Re-enqueuing is safe precisely because the pipeline is idempotent — a delivery already
 * `sent` is skipped by the consumer, and a re-run of fan-out creates no duplicate rows.
 */

/** How long a row may sit untouched before it counts as stuck. */
export const STUCK_AFTER_MS = 15 * 60 * 1000;

export interface RecoveryResult {
  reFannedOut: number;
  reQueuedEmails: number;
  reQueuedWebhooks: number;
}

export async function recoverStuckWork(
  db: Database,
  queue: JobQueue,
  now: number = Date.now(),
  limit = 100,
): Promise<RecoveryResult> {
  const cutoff = now - STUCK_AFTER_MS;

  const result: RecoveryResult = {
    reFannedOut: 0,
    reQueuedEmails: 0,
    reQueuedWebhooks: 0,
  };

  // 1. Submissions whose fan-out never completed.
  //    Spam is excluded: fan-out deliberately produces nothing for it, so those rows
  //    legitimately have no fanned_out_at and would be swept forever.
  const unfanned = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        isNull(submissions.fannedOutAt),
        ne(submissions.status, "spam"),
        // Only old ones: a submission from two seconds ago may still be fanning out.
        lt(submissions.createdAt, cutoff),
      ),
    )
    .limit(limit);

  for (const row of unfanned) {
    await queue.send({ type: "submission.created", submissionId: row.id });
    result.reFannedOut++;
  }

  // Confirmed waitlist signups whose opt-in fan-out finished (fanned_out_at set) but
  // the post-confirm fan-out did not (fanned_out_at is still earlier than opted_in_at).
  const unnotified = await db
    .select({ id: submissions.id })
    .from(submissions)
    .innerJoin(forms, eq(forms.id, submissions.formId))
    .where(
      and(
        sql`${submissions.optedInAt} is not null`,
        sql`${submissions.fannedOutAt} is not null`,
        sql`${submissions.fannedOutAt} < ${submissions.optedInAt}`,
        ne(submissions.status, "spam"),
        lt(submissions.optedInAt, cutoff),
      ),
    )
    .limit(limit);

  for (const row of unnotified) {
    await queue.send({ type: "submission.created", submissionId: row.id });
    result.reFannedOut++;
  }

  // 2. Delivery rows still pending well past their last update.
  const stuckEmails = await db
    .select({ id: emailDeliveries.id })
    .from(emailDeliveries)
    .where(and(eq(emailDeliveries.status, "pending"), lt(emailDeliveries.updatedAt, cutoff)))
    .limit(limit);

  for (const row of stuckEmails) {
    await queue.send({ type: "email.send", deliveryId: row.id });
    result.reQueuedEmails++;
  }

  const stuckWebhooks = await db
    .select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.status, "pending"), lt(webhookDeliveries.updatedAt, cutoff)))
    .limit(limit);

  for (const row of stuckWebhooks) {
    await queue.send({ type: "webhook.deliver", deliveryId: row.id });
    result.reQueuedWebhooks++;
  }

  // Touch the rows so a sweep that runs again before the retry lands does not re-enqueue
  // the same work every 15 minutes. The consumer overwrites this on its next update.
  await touch(db, stuckEmails, stuckWebhooks, now);

  return result;
}

async function touch(
  db: Database,
  emails: { id: string }[],
  hooks: { id: string }[],
  now: number,
): Promise<void> {
  for (const row of emails) {
    await db.update(emailDeliveries).set({ updatedAt: now }).where(eq(emailDeliveries.id, row.id));
  }
  for (const row of hooks) {
    await db
      .update(webhookDeliveries)
      .set({ updatedAt: now })
      .where(eq(webhookDeliveries.id, row.id));
  }
}
