import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * `assertSameOrigin` reads `next/headers`, which only exists inside a request
 * scope, so the header source is mocked here. The logic under test is the
 * comparison itself — the CSRF check behind every dashboard mutation.
 */
const headerStore = { values: new Map<string, string>() };

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => headerStore.values.get(name.toLowerCase()) ?? null,
  }),
  cookies: async () => ({ get: () => undefined }),
}));

// `next/navigation` needs a request scope that does not exist in the workers pool,
// and importing guard.ts pulls it in. `assertSameOrigin` never calls redirect().
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

function setHeaders(values: Record<string, string>) {
  headerStore.values = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]));
}

beforeEach(() => setHeaders({}));
afterEach(() => vi.clearAllMocks());

const { assertSameOrigin } = await import("../src/lib/auth/guard");

describe("assertSameOrigin", () => {
  it("allows a same-origin request", async () => {
    setHeaders({ host: "forms.example.com", origin: "https://forms.example.com" });
    await expect(assertSameOrigin()).resolves.toBeUndefined();
  });

  it("rejects a cross-origin request", async () => {
    setHeaders({ host: "forms.example.com", origin: "https://evil.example" });
    await expect(assertSameOrigin()).rejects.toThrow(/cross-origin/);
  });

  /**
   * A subdomain is a different origin. Without this, an XSS on any sibling
   * subdomain could drive dashboard mutations.
   */
  it("rejects a sibling subdomain", async () => {
    setHeaders({ host: "forms.example.com", origin: "https://other.example.com" });
    await expect(assertSameOrigin()).rejects.toThrow(/cross-origin/);
  });

  it("rejects a request with no Origin or Referer", async () => {
    setHeaders({ host: "forms.example.com" });
    await expect(assertSameOrigin()).rejects.toThrow(/missing origin/);
  });

  it("falls back to Referer when Origin is absent", async () => {
    setHeaders({ host: "forms.example.com", referer: "https://forms.example.com/inbox" });
    await expect(assertSameOrigin()).resolves.toBeUndefined();
  });

  it("rejects a malformed Origin", async () => {
    setHeaders({ host: "forms.example.com", origin: "not a url" });
    await expect(assertSameOrigin()).rejects.toThrow(/malformed origin/);
  });

  /** The Worker name is not fixed, so the check must compare against the live Host. */
  it("works under any hostname", async () => {
    setHeaders({
      host: "renamed-worker.workers.dev",
      origin: "https://renamed-worker.workers.dev",
    });
    await expect(assertSameOrigin()).resolves.toBeUndefined();
  });
});
