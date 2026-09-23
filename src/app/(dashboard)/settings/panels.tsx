"use client";

import { useState, useActionState } from "react";
import {
  changePasswordAction,
  checkUpdatesAction,
  deleteAccountAction,
  saveEmailSettingsAction,
  type SettingsState,
} from "./actions";
import { LocalTime } from "../inbox/local-time";
import { Notice } from "@/components/notice";
import { Section } from "@/components/section";
import {
  alertClass,
  btnDanger,
  btnGhost,
  btnPrimary,
  btnSecondary,
  cn,
  errorClass,
  hintClass,
  inputClass,
  labelClass,
  successClass,
} from "@/lib/ui";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

const empty: SettingsState = {};

export function EmailSettingsForm({
  notifyFrom,
  provider,
  hasResendKey,
  cloudflareBound,
  mailerAvailable,
  instanceUrl,
}: {
  notifyFrom: string;
  provider: string;
  hasResendKey: boolean;
  cloudflareBound: boolean;
  mailerAvailable: boolean;
  instanceUrl: string;
}) {
  const [state, action, pending] = useActionState(saveEmailSettingsAction, empty);
  const [setup, setSetup] = useState(false);
  const [choice, setChoice] = useState<"resend" | "cloudflare">(
    provider === "cloudflare" && cloudflareBound ? "cloudflare" : "resend",
  );

  return (
    <Section
      id="email"
      title="Email"
      description="Optional. Turn it on to get alerts, send auto-replies and waitlist confirmations. Submissions always land in Inbox either way."
    >
      {setup ? (
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="mailProvider" value={choice} />

          <p className="text-sm text-neutral-700 dark:text-neutral-300">
            FormFlare sends mail out. Pick a sender — Resend is the usual choice. Skip this if Inbox
            is enough.
          </p>

          <div className="rounded-2xl bg-neutral-50 p-1 dark:bg-neutral-950/40">
            <div className={cn("grid gap-1", cloudflareBound ? "sm:grid-cols-2" : "grid-cols-1")}>
              <ProviderCard
                title="Resend"
                hint="Paste a key from resend.com. Verify a domain there, then use that From address."
                active={choice === "resend"}
                onClick={() => setChoice("resend")}
              />
              {cloudflareBound ? (
                <ProviderCard
                  title="Cloudflare"
                  hint="Uses the EMAIL binding on this Worker. Arbitrary recipients need Workers Paid."
                  active={choice === "cloudflare"}
                  onClick={() => setChoice("cloudflare")}
                />
              ) : null}
            </div>
          </div>

          {choice === "resend" ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="resendApiKey" className={labelClass}>
                Resend API key
              </label>
              <input
                id="resendApiKey"
                name="resendApiKey"
                type="password"
                autoComplete="off"
                placeholder={hasResendKey ? "•••••••• (leave blank to keep)" : "re_…"}
                className={inputClass}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <label htmlFor="notifyFrom" className={labelClass}>
              From address
            </label>
            <input
              id="notifyFrom"
              name="notifyFrom"
              type="email"
              defaultValue={notifyFrom}
              placeholder="forms@yourdomain.com"
              className={inputClass}
            />
            <p className={hintClass}>A domain you already verified with the provider.</p>
          </div>

          <details className="rounded-xl bg-neutral-50 px-3 py-2 dark:bg-neutral-950/40">
            <summary className="cursor-pointer text-xs font-medium text-neutral-500">
              Advanced — instance URL
            </summary>
            <div className="mt-3 flex flex-col gap-1">
              <label htmlFor="instanceUrl" className={labelClass}>
                Instance URL
              </label>
              <input
                id="instanceUrl"
                name="instanceUrl"
                type="url"
                defaultValue={instanceUrl}
                placeholder="https://forms.example.com"
                className={inputClass}
              />
              <p className={hintClass}>
                Links inside confirmation emails. Filled in from this dashboard if you leave it.
              </p>
            </div>
          </details>

          <FormMessage state={state} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={pending} className={btnPrimary}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" className={btnGhost} onClick={() => setSetup(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : mailerAvailable ? (
        <>
          <Notice tone="success">
            Sending is on
            {notifyFrom ? ` from ${notifyFrom}` : ""} via{" "}
            {provider === "cloudflare" ? "Cloudflare" : "Resend"}.
          </Notice>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} onClick={() => setSetup(true)}>
              Edit
            </button>
            <form action={action}>
              <input type="hidden" name="mailProvider" value="off" />
              <input type="hidden" name="notifyFrom" value={notifyFrom} />
              <input type="hidden" name="instanceUrl" value={instanceUrl} />
              <button type="submit" disabled={pending} className={btnGhost}>
                Turn sending off
              </button>
            </form>
          </div>
          <FormMessage state={state} />
        </>
      ) : (
        <>
          <Notice tone="info">
            Leave this off if you only want Inbox. Turn it on to get an alert when someone submits,
            or to send waitlist confirmations.
          </Notice>
          <button
            type="button"
            className={`${btnPrimary} self-start`}
            onClick={() => setSetup(true)}
          >
            Turn on sending
          </button>
          <FormMessage state={state} />
        </>
      )}
    </Section>
  );
}

function ProviderCard({
  title,
  hint,
  active,
  onClick,
}: {
  title: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "press flex flex-col items-start gap-1 rounded-xl p-3 text-left",
        active
          ? "bg-white shadow-[var(--shadow-border)] dark:bg-neutral-800"
          : "text-neutral-600 dark:text-neutral-400",
      )}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="text-sm font-medium text-neutral-950 dark:text-white">{title}</span>
      <span className="text-xs leading-5">{hint}</span>
    </button>
  );
}

export function AccountPanel({ email }: { email: string }) {
  const [state, action, pending] = useActionState(changePasswordAction, empty);

  return (
    <Section id="account" title="Account" description={`Signed in as ${email}.`}>
      <details>
        <summary className="cursor-pointer text-sm font-medium">Change password</summary>
        <form action={action} className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="currentPassword" className={labelClass}>
              Current password
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="newPassword" className={labelClass}>
              New password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="confirmPassword" className={labelClass}>
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          <FormMessage state={state} />
          <button type="submit" disabled={pending} className={`${btnPrimary} self-start`}>
            {pending ? "Saving…" : "Change password"}
          </button>
        </form>
      </details>
    </Section>
  );
}

export function InstancePanel({
  current,
  latest,
  newer,
  htmlUrl,
  error,
  checkedAt,
}: {
  current: string;
  latest: string | null;
  newer: boolean;
  htmlUrl: string | null;
  error?: string;
  checkedAt: number;
}) {
  const [state, action, pending] = useActionState(checkUpdatesAction, empty);

  return (
    <Section id="updates" title="Updates and data">
      <p className="text-sm text-neutral-700 dark:text-neutral-300">
        FormFlare {current}
        {newer && latest ? ` — ${latest} is available` : latest ? ", up to date" : ""}
      </p>
      {newer ? (
        <p className={alertClass}>
          Pull the new tag in your clone and redeploy.
          {htmlUrl ? (
            <>
              {" "}
              <a href={htmlUrl} className="underline" rel="noreferrer">
                Release notes
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      {error ? <p className={hintClass}>{error}</p> : null}
      {checkedAt ? (
        <p className={hintClass}>
          Last checked <LocalTime timestamp={checkedAt} />
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <form action={action}>
          <button type="submit" disabled={pending} className={btnSecondary}>
            {pending ? "Checking…" : "Check for updates"}
          </button>
        </form>
        <form action="/settings/export" method="POST">
          <button type="submit" className={btnGhost}>
            Download all data (JSON)
          </button>
        </form>
      </div>
      <FormMessage state={state} />
    </Section>
  );
}

export function DangerZone({ email }: { email: string }) {
  const [state, action, pending] = useActionState(deleteAccountAction, empty);

  return (
    <Section id="delete" title="Delete everything">
      <details>
        <summary className="cursor-pointer text-sm font-medium text-red-700 dark:text-red-400">
          Delete this instance
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className={hintClass}>
            Removes the account, every form, submission, file, webhook, API key and setting.{" "}
            <code>/setup</code> works again. This cannot be undone.
          </p>
          <form action={action} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="confirmEmail" className={labelClass}>
                Type {email} to confirm
              </label>
              <input
                id="confirmEmail"
                name="confirmEmail"
                type="email"
                required
                autoComplete="off"
                className={inputClass}
              />
            </div>
            <FormMessage state={state} />
            <button type="submit" disabled={pending} className={`${btnDanger} self-start`}>
              {pending ? "Deleting…" : "Delete account and all data"}
            </button>
          </form>
        </div>
      </details>
    </Section>
  );
}

function FormMessage({ state }: { state: SettingsState }) {
  if (state.error) {
    return (
      <p role="alert" className={errorClass}>
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return <p className={successClass}>{state.ok}</p>;
  }
  return null;
}
