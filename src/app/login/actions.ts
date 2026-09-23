"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { assertSameOrigin } from "@/lib/auth/guard";
import { login } from "@/lib/auth/login";
import { SESSION_COOKIE, SESSION_TTL_MS, destroySession } from "@/lib/auth/session";
import { getServices } from "@/lib/env";

/** `email` is echoed back so a failed attempt does not clear the field. */
export type LoginState = { error?: string; email?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  await assertSameOrigin();

  const { db, rateLimit } = await getServices();
  const headerList = await headers();

  const email = String(formData.get("email") ?? "");

  const result = await login(
    {
      db,
      limiter: rateLimit.login,
      ip: headerList.get("cf-connecting-ip") ?? undefined,
    },
    email,
    String(formData.get("password") ?? ""),
  );

  if (!result.ok) {
    // One message for both causes: a distinct "no such account" would let an
    // attacker enumerate registered addresses.
    return {
      email,
      error:
        result.code === "rate_limited"
          ? "Too many attempts. Wait a minute and try again."
          : "Incorrect email or password.",
    };
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE,
    value: result.cookieValue,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });

  redirect("/forms");
}

export async function logoutAction(): Promise<void> {
  await assertSameOrigin();

  const { db } = await getServices();
  const cookieStore = await cookies();

  // Delete the row first: clearing the cookie alone would leave a usable token.
  await destroySession(db, cookieStore.get(SESSION_COOKIE)?.value);
  cookieStore.delete(SESSION_COOKIE);

  redirect("/login");
}
