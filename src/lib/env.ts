import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createDb, type Database } from "./db/client";
import { cloudflareMailer, type Mailer } from "./platform/mailer";
import { cloudflareQueue, type JobQueue } from "./platform/queue";
import { r2Storage, type Storage } from "./platform/storage";

/**
 * The only place Cloudflare bindings are turned into application services.
 *
 * Everything downstream depends on `Services`, never on `CloudflareEnv`, so the
 * platform stays swappable and nothing reaches for `process.env` (which is empty
 * for bindings at runtime — see Section 22).
 */
export interface Services {
  db: Database;
  storage: Storage;
  jobs: JobQueue;
  mailer: Mailer;
  rateLimit: {
    submit: RateLimit;
    login: RateLimit;
    api: RateLimit;
  };
}

/** Build services from an explicit env — used by the Worker hot path and by tests. */
export function servicesFrom(env: CloudflareEnv): Services {
  return {
    db: createDb(env.DB),
    storage: r2Storage(env.BUCKET),
    jobs: cloudflareQueue(env.JOBS),
    // EMAIL is optional: the app degrades to "email alerts off" rather than failing.
    mailer: cloudflareMailer(env.EMAIL),
    rateLimit: {
      submit: env.SUBMIT_RATE_LIMIT,
      login: env.LOGIN_RATE_LIMIT,
      api: env.API_RATE_LIMIT,
    },
  };
}

/** Build services inside Next.js route handlers and server components. */
export async function getServices(): Promise<Services> {
  const { env } = await getCloudflareContext({ async: true });
  return servicesFrom(env as CloudflareEnv);
}

/** Raw env access, for the rare case that needs a binding directly. */
export async function getEnv(): Promise<CloudflareEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env as CloudflareEnv;
}
