import { eq } from "drizzle-orm";
import { createDb, type Database } from "../db/client";
import { emailDeliveries, forms, submissions, webhookDeliveries, webhooks } from "../db/schema";
import { SETTING, getSetting } from "../db/settings";
import { decryptSecret } from "../crypto/secrets";
import { resolveMailer } from "../platform/resolve-mailer";
import type { Mailer } from "../platform/mailer";
import { cloudflareQueue } from "../platform/queue";
import { autoReply, ownerAlert } from "../notify/templates";
import { optInEmail } from "../notify/opt-in";
import { safeReplyTo, sanitiseHeader } from "../notify/sanitise";
import { getInstanceUrl } from "../instance/url";
import { confirmPath, signConfirmToken } from "../waitlist/confirm";
import { parsePreset } from "../webhooks/presets";
import { buildPayload, deliverWebhook } from "../webhooks/deliver";
import { fanOutSubmission } from "./fanout";
import { MAX_ATTEMPTS, retryDelay, type Job } from "./types";

/**
 * Queue consumer.
 *
 * Two invariants, both of which the tests pin:
 *
 * 1. **Never throw out of the loop.** An exception here fails the entire batch, so
 *    messages that already succeeded get redelivered. Every message is wrapped.
 * 2. **Ack or retry exactly once per message**, deciding from the delivery row rather
 *    than from the job payload, because queues are at-least-once.
 */
/**
 * Overrides for tests. Email cannot be exercised locally, so the mailer is injectable;
 * production always uses the EMAIL binding.
 */
export interface ConsumerDeps {
  mailer?: Mailer;
}

export async function consumeJobs(
  batch: MessageBatch<unknown>,
  env: CloudflareEnv,
  deps: ConsumerDeps = {},
): Promise<void> {
  const db = createDb(env.DB);

  for (const message of batch.messages) {
    try {
      const job = message.body as Job;
      const outcome = await handleJob(db, env, job, message.attempts, deps);

      if (outcome === "retry") {
        message.retry({ delaySeconds: retryDelay(message.attempts) });
      } else {
        message.ack();
      }
    } catch (err) {
      // A crash in one handler must not take the batch with it. Retry this message
      // only; on the final attempt, ack so it stops going round.
      console.error("job failed", err);
      if (message.attempts >= MAX_ATTEMPTS) {
        message.ack();
      } else {
        message.retry({ delaySeconds: retryDelay(message.attempts) });
      }
    }
  }
}

type Outcome = "ack" | "retry";

async function handleJob(
  db: Database,
  env: CloudflareEnv,
  job: Job,
  attempts: number,
  deps: ConsumerDeps,
): Promise<Outcome> {
  switch (job.type) {
    case "submission.created":
      return handleSubmissionCreated(db, env, job.submissionId);
    case "email.send":
      return handleEmailSend(db, env, job.deliveryId, attempts, deps);
    case "webhook.deliver":
      return handleWebhookDeliver(db, env, job.deliveryId, attempts);
    default:
      // Unknown job type: ack rather than retry forever. Likely a rollback.
      console.error("unknown job type", job);
      return "ack";
  }
}

async function handleSubmissionCreated(
  db: Database,
  env: CloudflareEnv,
  submissionId: string,
): Promise<Outcome> {
  const rows = await db
    .select({ submission: submissions, form: forms })
    .from(submissions)
    .innerJoin(forms, eq(forms.id, submissions.formId))
    .where(eq(submissions.id, submissionId))
    .limit(1);

  // Deleted between enqueue and delivery: nothing to do, and retrying will not bring
  // it back.
  if (!rows[0]) return "ack";

  const { submission, form } = rows[0];

  // Idempotent by construction: the delivery rows carry unique constraints, so a second
  // run of this job creates none and returns no jobs.
  const jobs = await fanOutSubmission(db, form, submission);

  const queue = cloudflareQueue(env.JOBS);
  for (const next of jobs) await queue.send(next);

  return "ack";
}

async function handleEmailSend(
  db: Database,
  env: CloudflareEnv,
  deliveryId: string,
  attempts: number,
  deps: ConsumerDeps = {},
): Promise<Outcome> {
  const rows = await db
    .select()
    .from(emailDeliveries)
    .where(eq(emailDeliveries.id, deliveryId))
    .limit(1);

  const delivery = rows[0];
  if (!delivery) return "ack";

  // The idempotency check: a redelivered job finds the row already resolved and stops.
  if (delivery.status !== "pending") return "ack";

  const mailer: Mailer = deps.mailer ?? (await resolveMailer(db, env));

  // Unavailable is not a transient failure — retrying cannot conjure a binding, and
  // doing so would burn the retry budget and delay nothing useful. Record and stop.
  if (!mailer.available) {
    await markEmail(
      db,
      deliveryId,
      "skipped_unavailable",
      attempts,
      "Email Sending is not configured.",
    );
    return "ack";
  }

  const context = await loadEmailContext(db, delivery.submissionId);
  if (!context) {
    await markEmail(db, deliveryId, "failed", attempts, "Submission no longer exists.");
    return "ack";
  }

  const { form, submission } = context;

  // Spam must never trigger email, even if the row predates the classification.
  if (submission.status === "spam") {
    await markEmail(db, deliveryId, "failed", attempts, "Submission marked as spam.");
    return "ack";
  }

  const from = (await getSetting(db, SETTING.notifyFrom)) ?? "";
  if (!from) {
    await markEmail(
      db,
      deliveryId,
      "skipped_unavailable",
      attempts,
      "No sender address configured.",
    );
    return "ack";
  }

  const data = safeParse(submission.dataJson);
  let rendered: { subject: string; html: string; text: string };

  if (delivery.kind === "opt_in") {
    const sessionSecret = (await getSetting(db, SETTING.sessionSecret)) ?? "";
    const origin = await getInstanceUrl(db);
    if (!origin || !sessionSecret) {
      await markEmail(
        db,
        deliveryId,
        "skipped_unavailable",
        attempts,
        "Instance URL or session secret missing; cannot build a confirm link.",
      );
      return "ack";
    }
    const token = await signConfirmToken(submission.id, sessionSecret);
    rendered = optInEmail(form.name, `${origin}${confirmPath(submission.id, token.exp, token.sig)}`);
  } else if (delivery.kind === "owner_alert") {
    rendered = ownerAlert(form, submission, data, dashboardUrl(env));
  } else {
    rendered = autoReply(form);
  }

  // Reply-To is only set from a submitted address that passes strict validation, so a
  // crafted value cannot inject headers.
  const replyTo = delivery.kind === "owner_alert" ? safeReplyTo(submission.email) : undefined;

  const result = await mailer.send({
    to: delivery.recipient,
    from,
    subject: sanitiseHeader(rendered.subject, 200),
    html: rendered.html,
    text: rendered.text,
    ...(replyTo ? { replyTo } : {}),
  });

  if (result.ok) {
    await markEmail(db, deliveryId, "sent", attempts, null);
    return "ack";
  }

  // Transient: retry with backoff until the attempt budget is spent, then record the
  // failure and stop so the message does not circulate forever.
  if (attempts >= MAX_ATTEMPTS) {
    await markEmail(db, deliveryId, "failed", attempts, result.error ?? "Send failed.");
    return "ack";
  }

  await markEmail(db, deliveryId, "pending", attempts, result.error ?? "Send failed.");
  return "retry";
}

async function handleWebhookDeliver(
  db: Database,
  env: CloudflareEnv,
  deliveryId: string,
  attempts: number,
): Promise<Outcome> {
  const rows = await db
    .select({ delivery: webhookDeliveries, hook: webhooks })
    .from(webhookDeliveries)
    .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
    .where(eq(webhookDeliveries.id, deliveryId))
    .limit(1);

  if (!rows[0]) return "ack";
  const { delivery, hook } = rows[0];

  if (delivery.status !== "pending") return "ack";
  if (!hook.active) {
    await markWebhook(db, deliveryId, "failed", attempts, null, "Webhook is disabled.");
    return "ack";
  }

  const context = await loadEmailContext(db, delivery.submissionId);
  if (!context) {
    await markWebhook(db, deliveryId, "failed", attempts, null, "Submission no longer exists.");
    return "ack";
  }

  const { form, submission } = context;

  if (submission.status === "spam") {
    await markWebhook(db, deliveryId, "failed", attempts, null, "Submission marked as spam.");
    return "ack";
  }

  const sessionSecret = (await getSetting(db, SETTING.sessionSecret)) ?? "";
  const secret = (await decryptSecret(hook.secret, sessionSecret)) ?? "";
  if (!secret) {
    await markWebhook(
      db,
      deliveryId,
      "failed",
      attempts,
      null,
      "Could not decrypt the signing secret.",
    );
    return "ack";
  }

  const payload = buildPayload(form, submission, safeParse(submission.dataJson));
  const result = await deliverWebhook(
    hook.url,
    secret,
    payload,
    deliveryId,
    Date.now(),
    parsePreset(hook.preset),
  );

  if (result.ok) {
    await markWebhook(db, deliveryId, "success", attempts, result.statusCode ?? null, null);
    return "ack";
  }

  // A 4xx is the receiver rejecting the request itself; retrying sends an identical
  // payload to an identical endpoint and fails identically.
  if (!result.retryable || attempts >= MAX_ATTEMPTS) {
    await markWebhook(
      db,
      deliveryId,
      "failed",
      attempts,
      result.statusCode ?? null,
      result.error ?? null,
    );
    return "ack";
  }

  await markWebhook(
    db,
    deliveryId,
    "pending",
    attempts,
    result.statusCode ?? null,
    result.error ?? null,
  );
  return "retry";
}

async function loadEmailContext(db: Database, submissionId: string) {
  const rows = await db
    .select({ submission: submissions, form: forms })
    .from(submissions)
    .innerJoin(forms, eq(forms.id, submissions.formId))
    .where(eq(submissions.id, submissionId))
    .limit(1);
  return rows[0] ?? null;
}

async function markEmail(
  db: Database,
  id: string,
  status: "pending" | "sent" | "failed" | "skipped_unavailable" | "skipped_rate_limited",
  attempts: number,
  error: string | null,
): Promise<void> {
  await db
    .update(emailDeliveries)
    .set({ status, attempts: attempts + 1, lastError: error, updatedAt: Date.now() })
    .where(eq(emailDeliveries.id, id));
}

async function markWebhook(
  db: Database,
  id: string,
  status: "pending" | "success" | "failed",
  attempts: number,
  statusCode: number | null,
  error: string | null,
): Promise<void> {
  await db
    .update(webhookDeliveries)
    .set({
      status,
      attempts: attempts + 1,
      lastStatusCode: statusCode,
      lastError: error,
      updatedAt: Date.now(),
    })
    .where(eq(webhookDeliveries.id, id));
}

function safeParse(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Best-effort dashboard link for the alert email. */
function dashboardUrl(env: CloudflareEnv): string {
  const configured = (env as { APP_URL?: string }).APP_URL;
  return configured ? `${configured.replace(/\/$/, "")}/inbox` : "/inbox";
}
