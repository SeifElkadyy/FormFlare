import { ulid } from "../ids";

export type CheckStatus = "ok" | "warn" | "fail";

export interface SystemCheck {
  name: string;
  status: CheckStatus;
  detail: string;
  /** Shown when the check is not ok — always names the concrete next step. */
  fix?: string;
}

/**
 * Verify each binding before the owner account is created (Section 16.1).
 *
 * Every failure message names the fix rather than just reporting the error
 * (design principle 6).
 */
export async function runSystemChecks(env: CloudflareEnv): Promise<SystemCheck[]> {
  return [await checkDatabase(env), await checkBucket(env), checkQueue(env), checkEmail(env)];
}

async function checkDatabase(env: CloudflareEnv): Promise<SystemCheck> {
  if (!env.DB) {
    return {
      name: "Database (D1)",
      status: "fail",
      detail: "The DB binding is missing.",
      fix: "Add a d1_databases entry named DB in wrangler.jsonc, then redeploy.",
    };
  }

  try {
    // Hits a table that only exists once migrations have run, so this checks both
    // reachability and schema state in one query.
    await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
    return { name: "Database (D1)", status: "ok", detail: "Connected and migrated." };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const missingTable = /no such table/i.test(message);
    return {
      name: "Database (D1)",
      status: "fail",
      detail: missingTable ? "Connected, but migrations have not run." : message,
      fix: missingTable
        ? "Run `npm run db:migrate:remote` (the deploy script does this automatically)."
        : "Check that the DB binding points at a real database in your account.",
    };
  }
}

async function checkBucket(env: CloudflareEnv): Promise<SystemCheck> {
  if (!env.BUCKET) {
    // Optional, not broken. R2 activation requires a payment method on the Cloudflare
    // account even within the free tier, so the default deploy ships without it and
    // everything except file uploads works.
    return {
      name: "File storage (R2) — optional",
      status: "warn",
      detail: "Not configured. Forms work; file uploads are unavailable.",
      fix: "To accept uploads: enable R2 in the Cloudflare dashboard, create a bucket, add it to wrangler.jsonc as BUCKET, and redeploy. Enabling R2 requires a payment method even on the free tier.",
    };
  }

  // Round-trip a throwaway object: a bucket that exists but cannot be written to
  // would otherwise only fail at the first real upload.
  const key = `_healthcheck/${ulid()}`;
  try {
    await env.BUCKET.put(key, "ok");
    const got = await env.BUCKET.get(key);
    if (!got) throw new Error("wrote an object but could not read it back");
    return { name: "File storage (R2)", status: "ok", detail: "Readable and writable." };
  } catch (err) {
    return {
      name: "File storage (R2)",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
      fix: "Check that the BUCKET binding points at a real bucket in your account.",
    };
  } finally {
    // Never leave health-check objects behind, even when the read failed.
    await env.BUCKET.delete(key).catch(() => {});
  }
}

function checkQueue(env: CloudflareEnv): SystemCheck {
  if (!env.JOBS) {
    return {
      name: "Background jobs (Queues)",
      status: "fail",
      detail: "The JOBS binding is missing.",
      fix: "Add a queues producer named JOBS in wrangler.jsonc, then redeploy. Email alerts and webhooks need it.",
    };
  }
  // Not sending a probe message: the consumer would process it as a real job.
  return { name: "Background jobs (Queues)", status: "ok", detail: "Bound." };
}

function checkEmail(env: CloudflareEnv): SystemCheck {
  if (!env.EMAIL) {
    return {
      name: "Email sending",
      status: "warn",
      detail: "Not configured. Forms still work; owner alerts and auto-replies are off.",
      fix: "Enable Cloudflare Email Sending for your domain. Sending to arbitrary recipients needs the Workers Paid plan.",
    };
  }
  return {
    name: "Email sending",
    status: "ok",
    detail: "Bound. Verify your sender address in Settings.",
  };
}
