"use client";

import { useActionState } from "react";
import { createOwnerAction, type SetupState } from "./actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/setup";

const initialState: SetupState = {};

export function SetupForm({ token }: { token?: string }) {
  const [state, formAction, pending] = useActionState(createOwnerAction, initialState);

  return (
    <form action={formAction} className="mt-3 space-y-4">
      {token && <input type="hidden" name="token" value={token} />}

      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="w-full rounded-md border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          aria-describedby="password-hint"
          className="w-full rounded-md border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]"
        />
        <p id="password-hint" className="text-xs text-zinc-600 dark:text-zinc-400">
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>
      </div>

      <div className="space-y-1">
        <label htmlFor="confirm" className="block text-sm font-medium">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          className="w-full rounded-md border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]"
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
      >
        {pending ? "Creating account…" : "Create admin account"}
      </button>
    </form>
  );
}
