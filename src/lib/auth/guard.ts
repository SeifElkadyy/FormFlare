import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServices } from "../env";
import type { User } from "../db/schema";
import { SESSION_COOKIE, resolveSession } from "./session";

/**
 * Auth guards.
 *
 * Deliberately NOT implemented as middleware/`proxy.ts`. Edge middleware is easy to
 * bypass — a matcher typo, a route added outside the pattern, or a rewrite can skip
 * it entirely, and Next has shipped CVEs where middleware auth could be skipped with
 * a crafted header. Auth is therefore checked where the data is actually touched:
 *
 * 1. the `(dashboard)` server layout, so no page renders unauthenticated, and
 * 2. `requireUser()` in EVERY server action and route handler that reads or mutates.
 *
 * (2) is not redundant with (1): server actions are independently addressable POST
 * endpoints. They do not re-run the layout, so a layout-only check leaves every
 * action open.
 */

/** Resolve the current user, or null. Does not redirect. */
export async function currentUser(): Promise<User | null> {
  const { db } = await getServices();
  const cookieStore = await cookies();
  return resolveSession(db, cookieStore.get(SESSION_COOKIE)?.value);
}

/** Require a session in a server component or layout; redirect to /login otherwise. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Guard a mutation (server action or route handler).
 *
 * Also enforces the CSRF origin check, because SameSite=Lax alone is not sufficient:
 * it still permits top-level cross-site POST navigations in some browsers, and a
 * user on an older browser gets no protection at all.
 *
 * Throws rather than redirecting: a mutation should fail loudly, not silently
 * 302 to a login page that the caller may treat as success.
 */
export async function requireUserForMutation(): Promise<User> {
  await assertSameOrigin();
  const user = await currentUser();
  if (!user) throw new Error("unauthorized");
  return user;
}

/**
 * Reject cross-site mutations.
 *
 * Compares Origin against the request's own Host. Requests with neither Origin nor
 * Referer are rejected: every browser sends Origin on POST, so a missing one means a
 * non-browser client, which should be using the API-key endpoints instead.
 */
export async function assertSameOrigin(): Promise<void> {
  const headerList = await headers();
  const host = headerList.get("host");
  const origin = headerList.get("origin") ?? originOf(headerList.get("referer"));

  if (!host || !origin) throw new Error("forbidden: missing origin");

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new Error("forbidden: malformed origin");
  }

  if (originHost !== host) throw new Error("forbidden: cross-origin request");
}

function originOf(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}
