import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/lib/db/client";
import { files, forms, projects, settings, submissions } from "../src/lib/db/schema";
import { SETTING, setSetting } from "../src/lib/db/settings";
import { publicId as newPublicId, ulid } from "../src/lib/ids";
import { encryptSecret } from "../src/lib/crypto/secrets";
import { handleSubmission } from "../src/lib/submissions/handle";
import { clearFormCache } from "../src/lib/submissions/form-cache";
import { stubSiteverify, type SiteverifyStub } from "./turnstile-mock";

const db = createDb(env.DB);
const SESSION_SECRET = "test-session-secret-value";

function ctx(): ExecutionContext {
  return { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
}

async function seedForm(overrides: Partial<typeof forms.$inferInsert> = {}) {
  const now = Date.now();
  const projectId = ulid();
  const formId = ulid();
  const pid = newPublicId();

  await db.insert(projects).values({ id: projectId, name: "P", createdAt: now });
  await db.insert(forms).values({
    id: formId,
    publicId: pid,
    projectId,
    name: "Contact",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  clearFormCache();
  return { formId, publicId: pid };
}

function post(publicId: string, body: BodyInit, headers: Record<string, string> = {}) {
  return new Request(`https://forms.test/f/${publicId}`, { method: "POST", body, headers });
}

function jsonPost(publicId: string, data: unknown, headers: Record<string, string> = {}) {
  return post(publicId, JSON.stringify(data), {
    "content-type": "application/json",
    accept: "application/json",
    ...headers,
  });
}

function formPost(
  publicId: string,
  data: Record<string, string>,
  headers: Record<string, string> = {},
) {
  return post(publicId, new URLSearchParams(data), {
    "content-type": "application/x-www-form-urlencoded",
    ...headers,
  });
}

beforeEach(async () => {
  await db.delete(files);
  await db.delete(submissions);
  await db.delete(forms);
  await db.delete(projects);
  await db.delete(settings);
  await setSetting(db, SETTING.sessionSecret, SESSION_SECRET);
  clearFormCache();
});

describe("routing and CORS", () => {
  it("answers preflight", async () => {
    const res = await handleSubmission(
      new Request("https://forms.test/f/abc", { method: "OPTIONS" }),
      env,
      ctx(),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
  });

  it("rejects non-POST", async () => {
    const res = await handleSubmission(
      new Request("https://forms.test/f/abc", { method: "GET" }),
      env,
      ctx(),
    );
    expect(res.status).toBe(405);
  });

  it("404s an unknown form", async () => {
    const res = await handleSubmission(jsonPost("nope123456", { a: "b" }), env, ctx());
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ ok: false, code: "form_not_found" });
  });

  /** An inactive form must look identical to a missing one, or ids can be probed. */
  it("404s an inactive form, not 403", async () => {
    const { publicId } = await seedForm({ active: false });
    const res = await handleSubmission(jsonPost(publicId, { a: "b" }), env, ctx());
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ code: "form_not_found" });
  });
});

describe("content types", () => {
  it("accepts JSON and returns JSON", async () => {
    const { publicId } = await seedForm();
    const res = await handleSubmission(
      jsonPost(publicId, { email: "a@example.com", message: "hi" }),
      env,
      ctx(),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
  });

  it("accepts urlencoded and redirects to /thanks", async () => {
    const { publicId } = await seedForm();
    const res = await handleSubmission(formPost(publicId, { email: "a@example.com" }), env, ctx());

    expect(res.status).toBe(303);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/thanks");
    expect(location.searchParams.get("form")).toBe(publicId);
  });

  it("accepts multipart", async () => {
    const { publicId } = await seedForm();
    const body = new FormData();
    body.append("email", "a@example.com");

    const res = await handleSubmission(
      new Request(`https://forms.test/f/${publicId}`, {
        method: "POST",
        body,
        headers: { accept: "application/json" },
      }),
      env,
      ctx(),
    );
    expect(res.status).toBe(200);
  });

  it("415s an unsupported content type", async () => {
    const { publicId } = await seedForm();
    const res = await handleSubmission(
      post(publicId, "plain", { "content-type": "text/plain", accept: "application/json" }),
      env,
      ctx(),
    );
    expect(res.status).toBe(415);
    await expect(res.json()).resolves.toMatchObject({ code: "unsupported_media_type" });
  });
});

describe("size limits", () => {
  /** Rejected on the declared length, before the body is read. */
  it("413s on an oversized Content-Length", async () => {
    const { publicId } = await seedForm();
    const res = await handleSubmission(
      post(publicId, JSON.stringify({ a: "b" }), {
        "content-type": "application/json",
        accept: "application/json",
        "content-length": String(50 * 1024 * 1024),
      }),
      env,
      ctx(),
    );
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({ code: "payload_too_large" });
  });

  /** Content-Length is client-supplied, so the running total must catch a lie. */
  it("413s on oversized field data even when Content-Length understates it", async () => {
    const { publicId } = await seedForm();
    const huge = "x".repeat(600 * 1024);
    const res = await handleSubmission(formPost(publicId, { message: huge }), env, ctx());
    expect(res.status).toBe(413);
  });

  it("413s a file over the form's limit", async () => {
    const { publicId } = await seedForm({ fileMaxBytes: 1024, fileTypesJson: '["text/plain"]' });
    const body = new FormData();
    body.append("cv", new File(["y".repeat(4096)], "cv.txt", { type: "text/plain" }));

    const res = await handleSubmission(
      new Request(`https://forms.test/f/${publicId}`, {
        method: "POST",
        body,
        headers: { accept: "application/json" },
      }),
      env,
      ctx(),
    );
    expect(res.status).toBe(413);
  });

  /**
   * R2 is opt-in, so an instance without a bucket must refuse files with a message
   * rather than accept the submission and silently drop the attachment.
   */
  it("rejects a file upload when no bucket is bound", async () => {
    const { publicId } = await seedForm({ fileTypesJson: '["text/plain"]' });
    const body = new FormData();
    body.append("email", "a@example.com");
    body.append("cv", new File(["hello"], "cv.txt", { type: "text/plain" }));

    // Same env, minus the bucket.
    const noBucket = { ...env, BUCKET: undefined } as unknown as CloudflareEnv;

    const res = await handleSubmission(
      new Request(`https://forms.test/f/${publicId}`, {
        method: "POST",
        body,
        headers: { accept: "application/json" },
      }),
      noBucket,
      ctx(),
    );

    expect(res.status).toBe(422);
    const json = (await res.json()) as { code: string; fields: Record<string, string> };
    expect(json.code).toBe("validation_failed");
    expect(json.fields.cv).toMatch(/cannot accept files/i);
  });

  it("rejects a disallowed file type", async () => {
    const { publicId } = await seedForm({ fileTypesJson: '["application/pdf"]' });
    const body = new FormData();
    body.append("cv", new File(["x"], "evil.exe", { type: "application/x-msdownload" }));

    const res = await handleSubmission(
      new Request(`https://forms.test/f/${publicId}`, {
        method: "POST",
        body,
        headers: { accept: "application/json" },
      }),
      env,
      ctx(),
    );
    expect(res.status).toBe(422);
  });
});

describe("origin allow-list", () => {
  it("allows any origin when the list is empty", async () => {
    const { publicId } = await seedForm();
    const res = await handleSubmission(
      jsonPost(publicId, { a: "b" }, { origin: "https://anywhere.example" }),
      env,
      ctx(),
    );
    expect(res.status).toBe(200);
  });

  it("allows a listed origin and rejects others", async () => {
    const { publicId } = await seedForm({
      allowedOriginsJson: JSON.stringify(["https://site.example"]),
    });

    const ok = await handleSubmission(
      jsonPost(publicId, { a: "b" }, { origin: "https://site.example" }),
      env,
      ctx(),
    );
    expect(ok.status).toBe(200);

    const blocked = await handleSubmission(
      jsonPost(publicId, { a: "b" }, { origin: "https://evil.example" }),
      env,
      ctx(),
    );
    expect(blocked.status).toBe(403);
    await expect(blocked.json()).resolves.toMatchObject({ code: "origin_not_allowed" });
  });
});

describe("honeypot", () => {
  it("looks like success but stores nothing and creates no job", async () => {
    const { publicId, formId } = await seedForm();
    let jobs = 0;
    const countingCtx = {
      waitUntil: () => {
        jobs++;
      },
      passThroughOnException: () => {},
    } as unknown as ExecutionContext;

    const res = await handleSubmission(
      jsonPost(publicId, { email: "bot@example.com", _gotcha: "i am a bot" }),
      env,
      countingCtx,
    );

    // Indistinguishable from a real success, so the bot learns nothing.
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });

    expect(await db.select().from(submissions).where(eq(submissions.formId, formId))).toHaveLength(
      0,
    );
    expect(jobs).toBe(0);
  });

  it("uses the form's configured honeypot field name", async () => {
    const { publicId, formId } = await seedForm({ honeypotField: "website_url" });

    await handleSubmission(jsonPost(publicId, { website_url: "http://spam" }), env, ctx());
    expect(await db.select().from(submissions).where(eq(submissions.formId, formId))).toHaveLength(
      0,
    );

    // The default name is no longer special for this form.
    await handleSubmission(jsonPost(publicId, { _gotcha: "x", email: "a@b.com" }), env, ctx());
    expect(await db.select().from(submissions).where(eq(submissions.formId, formId))).toHaveLength(
      1,
    );
  });

  it("strips reserved fields from stored data", async () => {
    const { publicId, formId } = await seedForm();
    await handleSubmission(
      jsonPost(publicId, {
        email: "a@example.com",
        _gotcha: "",
        "cf-turnstile-response": "tok",
        _redirect: "https://x.example",
      }),
      env,
      ctx(),
    );

    const [row] = await db.select().from(submissions).where(eq(submissions.formId, formId));
    const data = JSON.parse(row.dataJson);
    expect(data).toHaveProperty("email");
    expect(data).not.toHaveProperty("_gotcha");
    expect(data).not.toHaveProperty("cf-turnstile-response");
    expect(data).not.toHaveProperty("_redirect");
  });
});

describe("turnstile", () => {
  // siteverify is stubbed so these assert our handling, not Cloudflare's availability.
  // The real endpoint is exercised by the opt-in live test in turnstile.test.ts.
  let stub: SiteverifyStub | undefined;
  afterEach(() => {
    stub?.restore();
    stub = undefined;
  });

  it("rejects with 422 and creates no submission or job when verification fails", async () => {
    stub = stubSiteverify(false);
    const encrypted = await encryptSecret("0x-a-real-looking-secret", SESSION_SECRET);
    const { publicId, formId } = await seedForm({ turnstileSecret: encrypted });

    let jobs = 0;
    const countingCtx = {
      waitUntil: () => {
        jobs++;
      },
      passThroughOnException: () => {},
    } as unknown as ExecutionContext;

    const res = await handleSubmission(
      jsonPost(publicId, { email: "a@example.com", "cf-turnstile-response": "invalid" }),
      env,
      countingCtx,
    );

    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ code: "captcha_failed" });
    expect(await db.select().from(submissions).where(eq(submissions.formId, formId))).toHaveLength(
      0,
    );
    expect(jobs).toBe(0);
  });

  it("accepts the submission when verification passes", async () => {
    stub = stubSiteverify(true);
    const encrypted = await encryptSecret("0x-a-real-looking-secret", SESSION_SECRET);
    const { publicId, formId } = await seedForm({ turnstileSecret: encrypted });

    const res = await handleSubmission(
      jsonPost(publicId, { email: "a@example.com", "cf-turnstile-response": "valid-token" }),
      env,
      ctx(),
    );

    expect(res.status).toBe(200);
    expect(await db.select().from(submissions).where(eq(submissions.formId, formId))).toHaveLength(
      1,
    );
  });

  it("decrypts the stored secret before verifying", async () => {
    stub = stubSiteverify(true);
    const plaintext = "0x-the-owners-actual-secret";
    const encrypted = await encryptSecret(plaintext, SESSION_SECRET);
    const { publicId } = await seedForm({ turnstileSecret: encrypted });

    await handleSubmission(
      jsonPost(publicId, { email: "a@example.com", "cf-turnstile-response": "tok" }),
      env,
      ctx(),
    );

    // Cloudflare must receive the plaintext secret, not the stored ciphertext.
    expect(stub.calls[0].secret).toBe(plaintext);
  });
});

describe("validation", () => {
  it("422s with per-field errors", async () => {
    const { publicId } = await seedForm({
      fieldsJson: JSON.stringify([
        { name: "email", type: "email", required: true },
        { name: "message", type: "text", required: true, maxLength: 10 },
      ]),
    });

    const res = await handleSubmission(
      jsonPost(publicId, { email: "not-an-email", message: "way too long to fit" }),
      env,
      ctx(),
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; fields: Record<string, string> };
    expect(body.code).toBe("validation_failed");
    expect(body.fields.email).toMatch(/valid email/i);
    expect(body.fields.message).toMatch(/10 characters/i);
  });

  it("reports a missing required field", async () => {
    const { publicId } = await seedForm({
      fieldsJson: JSON.stringify([{ name: "email", type: "email", required: true }]),
    });
    const res = await handleSubmission(jsonPost(publicId, {}), env, ctx());
    const body = (await res.json()) as { fields: Record<string, string> };
    expect(body.fields.email).toMatch(/required/i);
  });
});

describe("open redirect", () => {
  it("ignores _redirect when the form has no allow-list", async () => {
    const { publicId } = await seedForm();
    const res = await handleSubmission(
      formPost(publicId, { email: "a@example.com", _redirect: "https://phishing.example/steal" }),
      env,
      ctx(),
    );

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).not.toContain("phishing.example");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/thanks");
  });

  it("ignores _redirect to an origin outside the allow-list", async () => {
    const { publicId } = await seedForm({
      allowedOriginsJson: JSON.stringify(["https://site.example"]),
      redirectUrl: "https://site.example/thanks",
    });

    const res = await handleSubmission(
      formPost(
        publicId,
        { email: "a@example.com", _redirect: "https://phishing.example/steal" },
        { origin: "https://site.example" },
      ),
      env,
      ctx(),
    );

    expect(res.status).toBe(303);
    // Falls back to the owner-configured redirect, never the attacker's.
    expect(res.headers.get("location")).toBe("https://site.example/thanks");
  });

  it("honours _redirect to an allow-listed origin", async () => {
    const { publicId } = await seedForm({
      allowedOriginsJson: JSON.stringify(["https://site.example"]),
    });

    const res = await handleSubmission(
      formPost(
        publicId,
        { email: "a@example.com", _redirect: "https://site.example/custom-thanks" },
        { origin: "https://site.example" },
      ),
      env,
      ctx(),
    );

    expect(res.headers.get("location")).toBe("https://site.example/custom-thanks");
  });
});

describe("stored submission", () => {
  it("records metadata without the raw IP", async () => {
    const { publicId, formId } = await seedForm();
    await handleSubmission(
      jsonPost(
        publicId,
        { email: "a@example.com" },
        {
          "cf-connecting-ip": "203.0.113.9",
          "user-agent": "TestAgent/1.0",
          referer: "https://site.example/page",
        },
      ),
      env,
      ctx(),
    );

    const [row] = await db.select().from(submissions).where(eq(submissions.formId, formId));
    expect(row.userAgent).toBe("TestAgent/1.0");
    expect(row.referrer).toBe("https://site.example/page");
    expect(row.status).toBe("new");

    // Hashed, never the address itself.
    expect(row.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain("203.0.113.9");
  });

  it("extracts and normalises the email", async () => {
    const { publicId, formId } = await seedForm();
    await handleSubmission(jsonPost(publicId, { email: "  Owner@Example.COM " }), env, ctx());

    const [row] = await db.select().from(submissions).where(eq(submissions.formId, formId));
    expect(row.email).toBe("owner@example.com");
  });

  it("stores an uploaded file in R2 and records the row", async () => {
    const { publicId, formId } = await seedForm({ fileTypesJson: '["text/plain"]' });
    const body = new FormData();
    body.append("email", "a@example.com");
    body.append("cv", new File(["hello cv"], "cv.txt", { type: "text/plain" }));

    const res = await handleSubmission(
      new Request(`https://forms.test/f/${publicId}`, {
        method: "POST",
        body,
        headers: { accept: "application/json" },
      }),
      env,
      ctx(),
    );
    expect(res.status).toBe(200);

    const [row] = await db.select().from(submissions).where(eq(submissions.formId, formId));
    const [file] = await db.select().from(files).where(eq(files.submissionId, row.id));

    expect(file.filename).toBe("cv.txt");
    expect(file.contentType).toBe("text/plain");

    const object = await env.BUCKET.get(file.r2Key);
    expect(object).not.toBeNull();
    await expect(object!.text()).resolves.toBe("hello cv");
  });
});

describe("jobs", () => {
  it("enqueues exactly one job per accepted submission", async () => {
    const { publicId } = await seedForm();
    let jobs = 0;
    const countingCtx = {
      waitUntil: () => {
        jobs++;
      },
      passThroughOnException: () => {},
    } as unknown as ExecutionContext;

    await handleSubmission(jsonPost(publicId, { email: "a@example.com" }), env, countingCtx);
    expect(jobs).toBe(1);
  });
});
