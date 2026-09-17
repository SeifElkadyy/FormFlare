import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { BRAND } from "../src/lib/brand";
import { handleSubmission } from "../src/lib/submissions/handle";

describe("phase 0 scaffold", () => {
  it("exposes the brand name from a single constant", () => {
    expect(BRAND.name).toBe("Formflare");
  });

  it("binds D1, R2 and the job queue", () => {
    expect(env.DB).toBeDefined();
    expect(env.BUCKET).toBeDefined();
    expect(env.JOBS).toBeDefined();
  });

  it("binds both rate limiters", () => {
    expect(env.SUBMIT_RATE_LIMIT).toBeDefined();
    expect(env.LOGIN_RATE_LIMIT).toBeDefined();
  });

  it("answers CORS preflight on the submission path", async () => {
    const res = await handleSubmission(
      new Request("https://example.com/f/abc123", { method: "OPTIONS" }),
      env,
      {} as ExecutionContext,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
  });

  it("rejects non-POST submissions", async () => {
    const res = await handleSubmission(
      new Request("https://example.com/f/abc123", { method: "GET" }),
      env,
      {} as ExecutionContext,
    );
    expect(res.status).toBe(405);
    await expect(res.json()).resolves.toMatchObject({ code: "method_not_allowed" });
  });
});
