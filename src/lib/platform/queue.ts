import type { Job } from "../jobs/types";

/**
 * Background job queue behind a narrow interface (Section 6.2).
 *
 * Business logic depends on `JobQueue`, never on `env.JOBS`.
 */
export interface JobQueue {
  send(job: Job, opts?: { delaySeconds?: number }): Promise<void>;
}

export function cloudflareQueue(queue: Queue): JobQueue {
  return {
    async send(job, opts) {
      await queue.send(job, opts?.delaySeconds ? { delaySeconds: opts.delaySeconds } : undefined);
    },
  };
}
