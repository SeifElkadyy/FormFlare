// Generated at build time by OpenNext (`opennextjs-cloudflare build`), so it is absent
// on a clean checkout. @ts-ignore (not @ts-expect-error) because the module *does*
// resolve once built, and an expect-error directive would then itself be an error.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { default as nextHandler } from "./.open-next/worker.js";
import { consumeJobs } from "./src/lib/jobs/consumer";
import { runDailyMaintenance, runRecoverySweep } from "./src/lib/jobs/maintenance";
import { handleSubmission } from "./src/lib/submissions/handle";

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Hot path: public submissions bypass Next.js for speed and full control
    // over CORS headers, redirects and status codes.
    if (url.pathname.startsWith("/f/")) {
      return handleSubmission(request, env, ctx);
    }

    return nextHandler.fetch(request, env, ctx);
  },

  async queue(batch: MessageBatch<unknown>, env: CloudflareEnv): Promise<void> {
    await consumeJobs(batch, env);
  },

  async scheduled(
    event: ScheduledController,
    env: CloudflareEnv,
    ctx: ExecutionContext,
  ): Promise<void> {
    // Two schedules, different jobs. The frequent one only re-enqueues stranded work;
    // the daily one does the expensive sweeps.
    if (event.cron === "0 3 * * *") {
      ctx.waitUntil(runDailyMaintenance(env));
    } else {
      ctx.waitUntil(runRecoverySweep(env));
    }
  },
} satisfies ExportedHandler<CloudflareEnv>;
