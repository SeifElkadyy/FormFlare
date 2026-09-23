import { lt } from "drizzle-orm";
import { createDb } from "../db/client";
import { deleteExpiredSessions } from "../auth/session";
import { emailDeliveries, webhookDeliveries } from "../db/schema";
import { cloudflareQueue } from "../platform/queue";
import { sweepOrphanedObjects } from "../submissions/delete";
import { recoverStuckWork } from "./recovery";

/** Delivery logs are for debugging recent failures, not an archive. */
export const DELIVERY_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Every-15-minutes sweep: re-enqueue work that was stranded.
 *
 * Deliberately cheap — three indexed lookups and some queue sends — because it runs 96
 * times a day. The expensive sweeps stay in the daily job.
 */
export async function runRecoverySweep(env: CloudflareEnv): Promise<void> {
  const db = createDb(env.DB);
  try {
    const result = await recoverStuckWork(db, cloudflareQueue(env.JOBS));
    const total = result.reFannedOut + result.reQueuedEmails + result.reQueuedWebhooks;
    if (total > 0) {
      console.log(
        `recovery: re-enqueued ${result.reFannedOut} fan-out(s), ` +
          `${result.reQueuedEmails} email(s), ${result.reQueuedWebhooks} webhook(s)`,
      );
    }
  } catch (err) {
    console.error("recovery sweep failed", err);
  }
}

/**
 * Is this run of the 15-minute cron the daily one? True for the slot starting 03:00 UTC.
 * A range rather than an exact minute, so a run scheduled late still counts once.
 */
export function isDailySlot(scheduledTime: number): boolean {
  const at = new Date(scheduledTime);
  return at.getUTCHours() === 3 && at.getUTCMinutes() < 15;
}

/**
 * Daily cron maintenance.
 *
 * Each step is independent and failure-isolated: a failing sweep must not stop expired
 * sessions from being deleted, since that is the security-relevant one.
 */
export async function runDailyMaintenance(env: CloudflareEnv): Promise<void> {
  const db = createDb(env.DB);

  try {
    await deleteExpiredSessions(db);
  } catch (err) {
    console.error("maintenance: failed to delete expired sessions", err);
  }

  try {
    await pruneDeliveryLogs(db);
  } catch (err) {
    console.error("maintenance: failed to prune delivery logs", err);
  }

  // Only when a bucket is bound. R2 is opt-in, and with no bucket there is nothing to
  // sweep — the submissions table cannot reference objects that were never stored.
  if (env.BUCKET) {
    try {
      // Catches objects stranded by a crash between the R2 put and the D1 insert; the
      // delete paths handle the normal case.
      const result = await sweepOrphanedObjects(db, env.BUCKET);
      if (result.deleted > 0) {
        console.log(`maintenance: removed ${result.deleted} orphaned object(s)`);
      }
    } catch (err) {
      console.error("maintenance: orphan sweep failed", err);
    }
  }
}

/**
 * Delete delivery rows older than the retention window.
 *
 * Bounded by `updated_at`, not `created_at`, so a delivery still being retried is never
 * pruned out from under its own job.
 */
export async function pruneDeliveryLogs(
  db: ReturnType<typeof createDb>,
  now: number = Date.now(),
): Promise<void> {
  const cutoff = now - DELIVERY_LOG_RETENTION_MS;
  await db.delete(webhookDeliveries).where(lt(webhookDeliveries.updatedAt, cutoff));
  await db.delete(emailDeliveries).where(lt(emailDeliveries.updatedAt, cutoff));
}
