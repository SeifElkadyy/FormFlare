import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../src/lib/db/client";
import {
  forms,
  projects,
  settings,
  submissions,
  webhookDeliveries,
  webhooks,
} from "../src/lib/db/schema";
import { SETTING, setSetting } from "../src/lib/db/settings";
import { encryptSecret } from "../src/lib/crypto/secrets";
import { publicId as newPublicId, ulid } from "../src/lib/ids";
import { consumeJobs } from "../src/lib/jobs/consumer";
import { fanOutSubmission } from "../src/lib/jobs/fanout";
import type { Job } from "../src/lib/jobs/types";
import {
  SIGNATURE_TOLERANCE_SECONDS,
  signPayload,
  validateWebhookUrl,
  verifySignature,
} from "../src/lib/webhooks/sign";
import { buildPayload, deliverWebhook } from "../src/lib/webhooks/deliver";
import { fakeMailer } from "./fake-mailer";

const db = createDb(env.DB);
const SESSION_SECRET = "webhook-test-session-secret";

function batchOf(jobs: Job[], attempts = 1) {
  const acked: number[] = [];
  const retried: { index: number; delaySeconds?: number }[] = [];
  const messages = jobs.map((body, index) => ({
    id: `msg-${index}`,
    timestamp: new Date(),
    body,
    attempts,
    ack: () => acked.push(index),
    retry: (opts?: { delaySeconds?: number }) =>
      retried.push({ index, delaySeconds: opts?.delaySeconds }),
  }));
  return {
    batch: {
      messages,
      queue: "test",
      ackAll: () => {},
      retryAll: () => {},
    } as unknown as MessageBatch<unknown>,
    acked,
    retried,
  };
}

/** Intercept only the webhook host, so unrelated fetches still work. */
function stubReceiver(handler: (request: Request) => Response | Promise<Response>): {
  calls: Request[];
  restore: () => void;
} {
  const calls: Request[] = [];
  const realFetch = globalThis.fetch;

  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes("receiver.example")) return realFetch(input as RequestInfo, init);

      const request = new Request(url, init);
      // Clone so the test can read the body after the handler consumes it.
      calls.push(new Request(url, init) as unknown as Request);
      return handler(request);
    });

  return { calls, restore: () => spy.mockRestore() };
}

async function seedWithWebhook(url = "https://receiver.example/hook") {
  const now = Date.now();
  const projectId = ulid();
  const formId = ulid();
  const submissionId = ulid();
  const webhookId = ulid();

  await db.insert(projects).values({ id: projectId, name: "P", createdAt: now });
  await db.insert(forms).values({
    id: formId,
    publicId: newPublicId(),
    projectId,
    name: "Contact",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(submissions).values({
    id: submissionId,
    formId,
    dataJson: JSON.stringify({ email: "visitor@example.com", message: "hello" }),
    email: "visitor@example.com",
    createdAt: now,
  });
  await db.insert(webhooks).values({
    id: webhookId,
    formId,
    url,
    secret: await encryptSecret("whsec-test", SESSION_SECRET),
    createdAt: now,
  });

  const [form] = await db.select().from(forms).where(eq(forms.id, formId));
  const [submission] = await db.select().from(submissions).where(eq(submissions.id, submissionId));
  return { form, submission };
}

beforeEach(async () => {
  await db.delete(webhookDeliveries);
  await db.delete(webhooks);
  await db.delete(submissions);
  await db.delete(forms);
  await db.delete(projects);
  await db.delete(settings);
  await setSetting(db, SETTING.sessionSecret, SESSION_SECRET);
  await setSetting(db, SETTING.notifyFrom, "forms@example.com");
});

afterEach(() => vi.restoreAllMocks());

describe("signPayload / verifySignature", () => {
  it("round-trips", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = await signPayload("secret", ts, '{"a":1}');

    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    await expect(verifySignature("secret", ts, '{"a":1}', sig)).resolves.toBe(true);
  });

  it("rejects a wrong secret, body or signature", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = await signPayload("secret", ts, '{"a":1}');

    await expect(verifySignature("other", ts, '{"a":1}', sig)).resolves.toBe(false);
    await expect(verifySignature("secret", ts, '{"a":2}', sig)).resolves.toBe(false);
    await expect(
      verifySignature("secret", ts, '{"a":1}', "sha256=" + "0".repeat(64)),
    ).resolves.toBe(false);
  });

  /**
   * The timestamp is inside the signed string, so a captured request cannot be replayed
   * with a fresh timestamp — the signature would no longer match.
   */
  it("signs over the timestamp, so it cannot be moved", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = await signPayload("secret", ts, "{}");
    await expect(verifySignature("secret", ts + 1, "{}", sig)).resolves.toBe(false);
  });

  it("rejects signatures outside the 5-minute tolerance", async () => {
    const now = Date.now();
    const old = Math.floor(now / 1000) - SIGNATURE_TOLERANCE_SECONDS - 10;
    const sig = await signPayload("secret", old, "{}");

    await expect(verifySignature("secret", old, "{}", sig, now)).resolves.toBe(false);

    const recent = Math.floor(now / 1000) - 60;
    const recentSig = await signPayload("secret", recent, "{}");
    await expect(verifySignature("secret", recent, "{}", recentSig, now)).resolves.toBe(true);
  });

  it("documents a 5-minute tolerance", () => {
    expect(SIGNATURE_TOLERANCE_SECONDS).toBe(300);
  });
});

describe("validateWebhookUrl", () => {
  it("accepts public https URLs", () => {
    expect(validateWebhookUrl("https://example.com/hook")).toMatchObject({ ok: true });
  });

  it("rejects http", () => {
    const result = validateWebhookUrl("http://example.com/hook");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/https/i);
  });

  /**
   * An unchecked webhook URL is an SSRF primitive: it is fetched from inside
   * Cloudflare's network, so a private or link-local target could reach internal
   * services or a metadata endpoint.
   */
  it("rejects private, loopback and link-local hosts", () => {
    for (const url of [
      "https://localhost/hook",
      "https://127.0.0.1/hook",
      "https://10.0.0.5/hook",
      "https://192.168.1.1/admin",
      "https://172.16.0.1/hook",
      "https://169.254.169.254/latest/meta-data/",
      "https://service.internal/hook",
      "https://box.local/hook",
    ]) {
      expect(validateWebhookUrl(url).ok, url).toBe(false);
    }
  });

  it("rejects malformed URLs", () => {
    expect(validateWebhookUrl("not a url").ok).toBe(false);
  });
});

describe("deliverWebhook", () => {
  it("posts a signed payload with the documented headers", async () => {
    const stub = stubReceiver(() => new Response("ok", { status: 200 }));

    const payload = buildPayload(
      { id: "f1", publicId: "abc", name: "Contact" } as never,
      { id: "s1", createdAt: 1_700_000_000_000, waitlistPosition: null } as never,
      { email: "a@example.com" },
    );

    const result = await deliverWebhook("https://receiver.example/hook", "whsec", payload, "del-1");

    expect(result.ok).toBe(true);
    expect(stub.calls).toHaveLength(1);

    const request = stub.calls[0];
    expect(request.headers.get("X-Formflare-Event")).toBe("submission.created");
    expect(request.headers.get("X-Formflare-Delivery")).toBe("del-1");

    const timestamp = Number(request.headers.get("X-Formflare-Timestamp"));
    const signature = request.headers.get("X-Formflare-Signature")!;
    const body = await request.text();

    // The receiver's verification must succeed against exactly what was sent.
    await expect(verifySignature("whsec", timestamp, body, signature)).resolves.toBe(true);
  });

  it("treats 5xx as retryable and 4xx as permanent", async () => {
    let stub = stubReceiver(() => new Response("err", { status: 500 }));
    let result = await deliverWebhook("https://receiver.example/h", "s", {} as never, "d");
    expect(result).toMatchObject({ ok: false, statusCode: 500, retryable: true });
    stub.restore();

    // A 400 means the receiver rejected this payload; resending it changes nothing.
    stub = stubReceiver(() => new Response("bad", { status: 400 }));
    result = await deliverWebhook("https://receiver.example/h", "s", {} as never, "d");
    expect(result).toMatchObject({ ok: false, statusCode: 400, retryable: false });
    stub.restore();

    // 429 explicitly invites a retry.
    stub = stubReceiver(() => new Response("slow down", { status: 429 }));
    result = await deliverWebhook("https://receiver.example/h", "s", {} as never, "d");
    expect(result).toMatchObject({ ok: false, retryable: true });
    stub.restore();
  });

  it("treats a network failure as retryable", async () => {
    stubReceiver(() => {
      throw new TypeError("connection refused");
    });

    const result = await deliverWebhook("https://receiver.example/h", "s", {} as never, "d");
    expect(result).toMatchObject({ ok: false, retryable: true });
  });

  it("refuses a non-public URL without making a request", async () => {
    const stub = stubReceiver(() => new Response("ok"));
    const result = await deliverWebhook("http://127.0.0.1/h", "s", {} as never, "d");

    expect(result).toMatchObject({ ok: false, retryable: false });
    expect(stub.calls).toHaveLength(0);
  });
});

describe("webhook consumer", () => {
  it("delivers once and records success", async () => {
    const { form, submission } = await seedWithWebhook();
    const [job] = await fanOutSubmission(db, form, submission);
    const stub = stubReceiver(() => new Response("ok", { status: 200 }));

    const { batch, acked } = batchOf([job]);
    await consumeJobs(batch, env, { mailer: fakeMailer() });

    expect(stub.calls).toHaveLength(1);
    expect(acked).toEqual([0]);

    const [row] = await db.select().from(webhookDeliveries);
    expect(row.status).toBe("success");
    expect(row.lastStatusCode).toBe(200);
  });

  /** Acceptance criterion: processing the same job twice delivers once. */
  it("delivers once when the same job is processed twice", async () => {
    const { form, submission } = await seedWithWebhook();
    const [job] = await fanOutSubmission(db, form, submission);
    const stub = stubReceiver(() => new Response("ok", { status: 200 }));

    await consumeJobs(batchOf([job]).batch, env, { mailer: fakeMailer() });
    await consumeJobs(batchOf([job]).batch, env, { mailer: fakeMailer() });

    expect(stub.calls).toHaveLength(1);
  });

  it("retries a failing webhook with backoff, then marks it failed", async () => {
    const { form, submission } = await seedWithWebhook();
    const [job] = await fanOutSubmission(db, form, submission);
    stubReceiver(() => new Response("err", { status: 500 }));

    const first = batchOf([job], 1);
    await consumeJobs(first.batch, env, { mailer: fakeMailer() });

    expect(first.retried).toHaveLength(1);
    expect(first.retried[0].delaySeconds).toBeGreaterThan(0);
    expect((await db.select().from(webhookDeliveries))[0].status).toBe("pending");

    // Final attempt: stop retrying and record the failure.
    const last = batchOf([job], 5);
    await consumeJobs(last.batch, env, { mailer: fakeMailer() });

    expect(last.acked).toEqual([0]);
    expect(last.retried).toHaveLength(0);

    const [row] = await db.select().from(webhookDeliveries);
    expect(row.status).toBe("failed");
    expect(row.lastStatusCode).toBe(500);
  });

  it("does not retry a 4xx", async () => {
    const { form, submission } = await seedWithWebhook();
    const [job] = await fanOutSubmission(db, form, submission);
    stubReceiver(() => new Response("bad request", { status: 400 }));

    const { batch, acked, retried } = batchOf([job], 1);
    await consumeJobs(batch, env, { mailer: fakeMailer() });

    expect(acked).toEqual([0]);
    expect(retried).toHaveLength(0);
    expect((await db.select().from(webhookDeliveries))[0].status).toBe("failed");
  });

  it("never delivers for a spam submission", async () => {
    const { form, submission } = await seedWithWebhook();
    const [job] = await fanOutSubmission(db, form, submission);

    await db.update(submissions).set({ status: "spam" }).where(eq(submissions.id, submission.id));

    const stub = stubReceiver(() => new Response("ok"));
    const { batch, acked } = batchOf([job]);
    await consumeJobs(batch, env, { mailer: fakeMailer() });

    expect(stub.calls).toHaveLength(0);
    expect(acked).toEqual([0]);
  });

  it("sends the submission data in the payload", async () => {
    const { form, submission } = await seedWithWebhook();
    const [job] = await fanOutSubmission(db, form, submission);
    const stub = stubReceiver(() => new Response("ok"));

    await consumeJobs(batchOf([job]).batch, env, { mailer: fakeMailer() });

    const body = (await stub.calls[0].json()) as {
      event: string;
      form: { name: string };
      submission: { data: Record<string, string> };
    };
    expect(body.event).toBe("submission.created");
    expect(body.form.name).toBe("Contact");
    expect(body.submission.data.message).toBe("hello");
  });
});
