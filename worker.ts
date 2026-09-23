// Generated at build time by OpenNext (`opennextjs-cloudflare build`), so it is absent
// on a clean checkout. @ts-ignore (not @ts-expect-error) because the module *does*
// resolve once built, and an expect-error directive would then itself be an error.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { default as nextHandler } from "./.open-next/worker.js";
import { consumeJobs } from "./src/lib/jobs/consumer";
import { isDailySlot, runDailyMaintenance, runRecoverySweep } from "./src/lib/jobs/maintenance";
import { handlePublicBadge, handlePublicCount } from "./src/lib/submissions/count";
import { handleSubmission } from "./src/lib/submissions/handle";

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Hot path: public submissions bypass Next.js for speed and full control
    // over CORS headers, redirects and status codes.
    if (url.pathname.startsWith("/f/")) {
      const countMatch = url.pathname.match(/^\/f\/([^/]+)\/count\/?$/);
      if (countMatch) {
        return handlePublicCount(request, env, decodeURIComponent(countMatch[1]));
      }
      const badgeMatch = url.pathname.match(/^\/f\/([^/]+)\/badge\.svg$/);
      if (badgeMatch) {
        return handlePublicBadge(request, env, decodeURIComponent(badgeMatch[1]));
      }
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
    // One schedule (every 15 minutes) to stay inside the free plan's per-account cron
    // limit. Every run re-enqueues stranded work; the one in the 03:00 UTC slot also
    // does the expensive daily sweeps.
    ctx.waitUntil(runRecoverySweep(env));
    if (isDailySlot(event.scheduledTime)) ctx.waitUntil(runDailyMaintenance(env));
  },
} satisfies ExportedHandler<CloudflareEnv>;
