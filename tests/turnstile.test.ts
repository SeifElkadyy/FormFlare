import { afterEach, describe, expect, it } from "vitest";
import { verifyTurnstile } from "../src/lib/spam/turnstile";
import {
  LIVE_TESTS,
  stubSiteverify,
  stubSiteverifyNetworkError,
  type SiteverifyStub,
} from "./turnstile-mock";

let stub: SiteverifyStub | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

describe("verifyTurnstile", () => {
  it("passes when siteverify reports success", async () => {
    stub = stubSiteverify(true);
    await expect(verifyTurnstile("token", "secret")).resolves.toMatchObject({ ok: true });
  });

  it("fails when siteverify rejects the token", async () => {
    stub = stubSiteverify(false, ["invalid-input-response"]);
    const result = await verifyTurnstile("bad-token", "secret");
    expect(result.ok).toBe(false);
    expect(result.errorCodes).toContain("invalid-input-response");
  });

  it("sends the secret, token and remote IP", async () => {
    stub = stubSiteverify(true);
    await verifyTurnstile("tok-123", "sec-456", "203.0.113.7");

    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]).toMatchObject({
      secret: "sec-456",
      response: "tok-123",
      remoteip: "203.0.113.7",
    });
  });

  it("omits remoteip when the IP is unknown", async () => {
    stub = stubSiteverify(true);
    await verifyTurnstile("tok", "sec");
    expect(stub.calls[0].remoteip).toBeUndefined();
  });

  /** A missing token is a failure without a network call — the widget did not run. */
  it("fails a missing token without calling siteverify", async () => {
    stub = stubSiteverify(true);
    const result = await verifyTurnstile(undefined, "secret");

    expect(result.ok).toBe(false);
    expect(result.errorCodes).toContain("missing-input-response");
    expect(stub.calls).toHaveLength(0);
  });

  /**
   * Fails closed. Letting submissions through when the verifier is unreachable would
   * turn any Cloudflare outage into an open spam window — exactly when a flood is most
   * likely.
   */
  it("fails closed when siteverify is unreachable", async () => {
    stub = stubSiteverifyNetworkError();
    const result = await verifyTurnstile("tok", "secret");

    expect(result.ok).toBe(false);
    expect(result.errorCodes?.[0]).toMatch(/verify-(network|timeout)/);
  });

  it("fails on a non-2xx response", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("siteverify")) return new Response("nope", { status: 503 });
      return realFetch(input as RequestInfo, init);
    };

    try {
      const result = await verifyTurnstile("tok", "secret");
      expect(result.ok).toBe(false);
      expect(result.errorCodes).toContain("http-503");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

/**
 * Opt-in live check against Cloudflare's documented test secrets.
 *
 * Skipped by default so CI does not depend on the network. Run with:
 *   LIVE_TESTS=1 npm test
 *
 * Worth keeping: it is the only thing that would catch Cloudflare changing the
 * siteverify contract out from under the stub.
 */
describe.runIf(LIVE_TESTS)("verifyTurnstile (live)", () => {
  // 2x... always fails; 1x... always passes. Using 1x for a negative test would
  // silently assert nothing.
  const ALWAYS_FAILS = "2x0000000000000000000000000000000AA";
  const ALWAYS_PASSES = "1x0000000000000000000000000000000AA";

  it("rejects against the always-fails secret", async () => {
    await expect(verifyTurnstile("dummy-token", ALWAYS_FAILS)).resolves.toMatchObject({
      ok: false,
    });
  });

  it("accepts against the always-passes secret", async () => {
    await expect(verifyTurnstile("dummy-token", ALWAYS_PASSES)).resolves.toMatchObject({
      ok: true,
    });
  });
});
