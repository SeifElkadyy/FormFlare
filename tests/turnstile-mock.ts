import { env } from "cloudflare:workers";
import { vi } from "vitest";

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Tests that hit the real siteverify endpoint make CI depend on the network and on
 * Cloudflare being reachable — a flaky, slow dependency for logic that is ours.
 * So the endpoint is stubbed by default and the live check is opt-in.
 *
 * Run with `LIVE_TESTS=1 npm test` to exercise the real API instead.
 *
 * Read from the Miniflare binding, not `process.env`: Worker sandboxes get an empty
 * `process.env`, so vitest.config.mts forwards the flag as a binding.
 */
export const LIVE_TESTS = (env as unknown as { LIVE_TESTS?: string }).LIVE_TESTS === "1";

export interface SiteverifyStub {
  /** Every request captured, so a test can assert what was sent. */
  calls: { secret: string; response: string; remoteip?: string }[];
  restore: () => void;
}

/**
 * Intercept siteverify and answer with `success`.
 *
 * Only that URL is intercepted; anything else falls through to real fetch, so a stub
 * cannot silently mask an unrelated request.
 */
export function stubSiteverify(
  success: boolean,
  errorCodes: string[] = success ? [] : ["invalid-input-response"],
): SiteverifyStub {
  const calls: SiteverifyStub["calls"] = [];
  const realFetch = globalThis.fetch;

  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (!url.startsWith(SITEVERIFY_URL)) {
        return realFetch(input as RequestInfo, init);
      }

      const body = init?.body ?? (input instanceof Request ? await input.formData() : undefined);
      if (body instanceof FormData) {
        calls.push({
          secret: String(body.get("secret") ?? ""),
          response: String(body.get("response") ?? ""),
          remoteip: body.get("remoteip") ? String(body.get("remoteip")) : undefined,
        });
      }

      return Response.json({ success, "error-codes": errorCodes });
    });

  return { calls, restore: () => spy.mockRestore() };
}

/** Simulate siteverify being unreachable, to prove verification fails closed. */
export function stubSiteverifyNetworkError(): SiteverifyStub {
  const calls: SiteverifyStub["calls"] = [];
  const realFetch = globalThis.fetch;

  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith(SITEVERIFY_URL)) return realFetch(input as RequestInfo, init);
      throw new TypeError("network failure");
    });

  return { calls, restore: () => spy.mockRestore() };
}
