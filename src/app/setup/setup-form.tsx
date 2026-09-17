"use client";

import { useActionState } from "react";
import { createOwnerAction, type SetupState } from "./actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/setup";
import { btnPrimary, errorClass, hintClass, inputClass, labelClass } from "@/lib/ui";

const initialState: SetupState = {};

export function SetupForm({ token }: { token?: string }) {
  const [state, formAction, pending] = useActionState(createOwnerAction, initialState);

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      {token ? <input type="hidden" name="token" value={token} /> : null}

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className={labelClass}>
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
          className={inputClass}
        />
        <p id="password-hint" className={hintClass}>
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="confirm" className={labelClass}>
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>

      {state.error ? (
        <p role="alert" className={errorClass}>
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Creating account…" : "Create admin account"}
      </button>
    </form>
  );
}
