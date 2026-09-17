import { authenticateApiKey, readBearer } from "../auth/api-key";
import type { ApiKey } from "../db/schema";
import { getServices, type Services } from "../env";

/**
 * Guard for `/api/v1/*`.
 *
 * Returns either the authenticated key plus services, or a Response to return directly.
 */
export type ApiAuth =
  { ok: true; key: ApiKey; services: Services } | { ok: false; response: Response };

export async function requireApiKey(request: Request): Promise<ApiAuth> {
  const services = await getServices();
  const presented = readBearer(request);

  const key = await authenticateApiKey(services.db, presented);
  if (!key) {
    return {
      ok: false,
      response: apiError(
        401,
        "unauthorized",
        "Provide a valid API key as `Authorization: Bearer ff_live_...`.",
      ),
    };
  }

  // Keyed per key, not per IP: one noisy integration must not exhaust another's budget,
  // and an IP is meaningless for server-to-server callers behind shared egress.
  const { success } = await services.rateLimit.api.limit({ key: `api:${key.id}` });
  if (!success) {
    return {
      ok: false,
      response: apiError(429, "rate_limited", "Too many requests for this API key."),
    };
  }

  return { ok: true, key, services };
}

export function apiError(status: number, code: string, message: string): Response {
  return Response.json(
    { ok: false, code, message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function apiJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      // API responses carry submission data; never let a shared cache hold them.
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * 404 for anything outside this instance.
 *
 * Deliberately not 403: a distinct "forbidden" confirms the id exists, letting a caller
 * with a valid key for one instance probe for ids belonging to another. An id that is
 * not yours is indistinguishable from one that does not exist.
 */
export function apiNotFound(): Response {
  return apiError(404, "not_found", "No such resource.");
}
