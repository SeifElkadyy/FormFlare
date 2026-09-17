import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { r2Storage } from "../src/lib/platform/storage";
import { cloudflareQueue } from "../src/lib/platform/queue";
import { cloudflareMailer, unavailableMailer } from "../src/lib/platform/mailer";
import { servicesFrom } from "../src/lib/env";

describe("r2Storage", () => {
  const storage = r2Storage(env.BUCKET);

  it("round-trips an object with its content type", async () => {
    await storage.put("test/hello.txt", new TextEncoder().encode("hello").buffer, "text/plain");

    const got = await storage.get("test/hello.txt");
    expect(got).not.toBeNull();
    expect(got!.contentType).toBe("text/plain");
    expect(got!.size).toBe(5);
    await expect(new Response(got!.body).text()).resolves.toBe("hello");
  });

  it("returns null for a missing key rather than throwing", async () => {
    await expect(storage.get("test/does-not-exist")).resolves.toBeNull();
  });

  it("deletes", async () => {
    await storage.put("test/gone.txt", new TextEncoder().encode("x").buffer, "text/plain");
    await storage.delete("test/gone.txt");
    await expect(storage.get("test/gone.txt")).resolves.toBeNull();
  });

  it("falls back to a generic content type when R2 has no metadata", async () => {
    await env.BUCKET.put("test/raw.bin", new TextEncoder().encode("x"));
    const got = await storage.get("test/raw.bin");
    expect(got!.contentType).toBe("application/octet-stream");
  });
});

describe("cloudflareQueue", () => {
  it("accepts a job without throwing", async () => {
    const jobs = cloudflareQueue(env.JOBS);
    await expect(
      jobs.send({ type: "submission.created", submissionId: "sub_test" }),
    ).resolves.toBeUndefined();
  });

  it("accepts a delayed job", async () => {
    const jobs = cloudflareQueue(env.JOBS);
    await expect(
      jobs.send({ type: "webhook.deliver", deliveryId: "del_test" }, { delaySeconds: 30 }),
    ).resolves.toBeUndefined();
  });
});

describe("mailer availability", () => {
  it("reports unavailable and fails softly with no binding", async () => {
    const mailer = cloudflareMailer(undefined);
    expect(mailer.available).toBe(false);
    expect(mailer).toBe(unavailableMailer);

    // Must not throw: a queue consumer would otherwise retry forever.
    const result = await mailer.send({
      to: "a@example.com",
      from: "b@example.com",
      subject: "s",
      html: "<p>h</p>",
      text: "h",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not configured/i);
  });

  it("reports available when the binding exists", () => {
    expect(cloudflareMailer(env.EMAIL).available).toBe(true);
  });
});

describe("servicesFrom", () => {
  it("builds every service from the env", () => {
    const services = servicesFrom(env as CloudflareEnv);
    expect(services.db).toBeDefined();
    expect(services.storage).toBeDefined();
    expect(services.jobs).toBeDefined();
    expect(services.mailer.available).toBe(true);
    expect(services.rateLimit.submit).toBeDefined();
    expect(services.rateLimit.login).toBeDefined();
  });
});
