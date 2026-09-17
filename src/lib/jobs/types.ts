/**
 * Background job payloads (Section 15.1).
 *
 * Jobs carry a **delivery row id**, never the message content. The row is the source of
 * truth and the idempotency key: a redelivered job re-reads the row, sees it is already
 * sent, and stops. Embedding the content would make a retry indistinguishable from a
 * fresh send.
 */
export type Job =
  | { type: "submission.created"; submissionId: string }
  | { type: "webhook.deliver"; deliveryId: string }
  | { type: "email.send"; deliveryId: string };

export type JobType = Job["type"];

/** Backoff between retries: 10s, 1m, 5m, 30m, then the consumer gives up. */
export const RETRY_DELAYS_SECONDS = [10, 60, 300, 1800];

export function retryDelay(attempts: number): number {
  return RETRY_DELAYS_SECONDS[Math.min(attempts, RETRY_DELAYS_SECONDS.length - 1)];
}

/** Matches `max_retries` in wrangler.jsonc. */
export const MAX_ATTEMPTS = 5;
