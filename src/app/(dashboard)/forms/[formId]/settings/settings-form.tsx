"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type ReactNode } from "react";
import {
  btnDanger,
  btnPrimary,
  checkboxClass,
  errorClass,
  hintClass,
  inputBase,
  inputClass,
  labelClass,
  successClass,
  textareaClass,
} from "@/lib/ui";
import { deleteFormAction, updateFormAction, type FormState } from "../../actions";
import { OriginsEditor } from "../origins-editor";
import { Section } from "@/components/section";

const initialState: FormState = {};

export interface SettingsFormProps {
  id: string;
  mode: string;
  mailerAvailable: boolean;
  notifyEmails: string;
  autoReplyEnabled: boolean;
  autoReplySubject: string;
  autoReplyBody: string;
  redirectUrl: string;
  doubleOptIn: boolean;
  referralBoost: number;
  allowedOrigins: string[];
  turnstileSiteKey: string;
  hasTurnstileSecret: boolean;
  spamWords: string;
}

/** Behaviour after a submission arrives. Visual things live on Edit. */
export function SettingsForm(props: SettingsFormProps) {
  const [state, formAction, pending] = useActionState(updateFormAction, initialState);
  const [reply, setReply] = useState(props.autoReplyEnabled);
  const turnstileOn = Boolean(props.turnstileSiteKey || props.hasTurnstileSecret);

  return (
    <form
      // Submitting by hand: React 19 resets a <form action> after success, which would
      // snap the checkboxes back to their first-render state.
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="flex flex-col"
    >
      <input type="hidden" name="id" value={props.id} />
      <input type="hidden" name="section" value="settings" />

      <Section id="notifications" title="Email notifications">
        {!props.mailerAvailable ? (
          <p className={hintClass}>
            Sending email is off, so nothing below will send yet.{" "}
            <Link href="/settings#email">Turn on email</Link>
          </p>
        ) : null}
        <Field
          htmlFor="notifyEmails"
          label="Email me at"
          hint="One address per line. Leave empty for no alerts."
        >
          <textarea
            id="notifyEmails"
            name="notifyEmails"
            rows={2}
            placeholder="you@example.com"
            defaultValue={props.notifyEmails}
            className={textareaClass}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="autoReplyEnabled"
            defaultChecked={props.autoReplyEnabled}
            className={checkboxClass}
            onChange={(event) => setReply(event.target.checked)}
          />
          Send an automatic reply to the person who submitted
        </label>
        <div className={reply ? "flex flex-col gap-4 ps-6" : "hidden"}>
          {!turnstileOn ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Turn on the bot check below too. Without it, anyone can make your address email
              strangers. Replies are limited to one per address per day.
            </p>
          ) : null}
          <Field htmlFor="autoReplySubject" label="Subject">
            <input
              id="autoReplySubject"
              name="autoReplySubject"
              defaultValue={props.autoReplySubject}
              placeholder="Thanks, we got your message"
              className={inputClass}
            />
          </Field>
          <Field
            htmlFor="autoReplyBody"
            label="Message"
            hint="Only your text is sent. Nothing they typed is repeated back."
          >
            <textarea
              id="autoReplyBody"
              name="autoReplyBody"
              rows={3}
              defaultValue={props.autoReplyBody}
              placeholder="We'll get back to you soon."
              className={textareaClass}
            />
          </Field>
        </div>
      </Section>

      <Section id="after" title="After someone submits">
        <Field
          htmlFor="redirectUrl"
          label="Send them to"
          hint="Leave empty to show a simple thank-you page."
        >
          <input
            id="redirectUrl"
            name="redirectUrl"
            type="url"
            placeholder="https://yoursite.com/thanks"
            defaultValue={props.redirectUrl}
            className={inputClass}
          />
        </Field>
      </Section>

      {props.mode === "waitlist" ? (
        <Section id="waitlist" title="Waitlist">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="doubleOptIn"
              defaultChecked={props.doubleOptIn}
              className={`${checkboxClass} mt-0.5`}
            />
            <span>
              Confirm emails before giving a place
              <span className={`${hintClass} block`}>
                Signups get an email with a link. Keeps fake addresses off your list.
                {!props.mailerAvailable ? " Needs email turned on." : ""}
              </span>
            </span>
          </label>
          <Field
            htmlFor="referralBoost"
            label="Places to move up per referral"
            hint="When someone's link brings in a confirmed signup, they move up this many places. 0 turns it off."
          >
            <input
              id="referralBoost"
              name="referralBoost"
              type="number"
              min={0}
              max={100}
              defaultValue={props.referralBoost}
              className={`${inputBase} w-28`}
            />
          </Field>
        </Section>
      ) : null}

      <Section id="protection" title="Spam protection">
        <p className={hintClass}>
          Always on: a hidden bot trap, a rate limit, and (on your form&rsquo;s page and widget)
          rejecting anything sent faster than a person could type. Caught submissions go to the Spam
          tab.
        </p>
        <Field
          htmlFor="spamWords"
          label="Block submissions containing"
          hint="One per line. Words or phrases, or @domain.com to block an email domain. Matches go to Spam."
        >
          <textarea
            id="spamWords"
            name="spamWords"
            rows={3}
            defaultValue={props.spamWords}
            placeholder={"crypto\nseo services\n@spam-domain.com"}
            className={`${textareaClass} font-mono text-xs`}
          />
        </Field>
        <Field
          label="Only accept from these websites"
          hint="Leave empty to accept from anywhere. Your form's own page always works."
        >
          <OriginsEditor initial={props.allowedOrigins} />
        </Field>
        <details className="group" open={turnstileOn}>
          <summary className="cursor-pointer text-sm font-medium">
            Bot check (Cloudflare Turnstile){turnstileOn ? " · on" : ""}
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            <p className={hintClass}>
              Create a free widget in the Cloudflare dashboard under Turnstile, then paste both
              keys.
            </p>
            <Field htmlFor="turnstileSiteKey" label="Site key">
              <input
                id="turnstileSiteKey"
                name="turnstileSiteKey"
                defaultValue={props.turnstileSiteKey}
                className={inputClass}
              />
            </Field>
            <Field htmlFor="turnstileSecret" label="Secret key" hint="Stored encrypted.">
              <input
                id="turnstileSecret"
                name="turnstileSecret"
                type="password"
                autoComplete="off"
                placeholder={props.hasTurnstileSecret ? "Saved. Leave blank to keep it" : ""}
                className={inputClass}
              />
            </Field>
            {turnstileOn ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="turnstileClear" className={checkboxClass} />
                Turn the bot check off
              </label>
            ) : null}
          </div>
        </details>
      </Section>

      <div className="sticky bottom-0 -mx-6 flex items-center gap-3 border-t border-neutral-200 bg-white/90 px-6 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : "Save settings"}
        </button>
        {state.error ? (
          <p role="alert" className={errorClass}>
            {state.error}
          </p>
        ) : state.saved && !pending ? (
          <p role="status" className={successClass}>
            Saved
          </p>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  /** The input's id. Omit when the child labels itself. */
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={labelClass}>
          {label}
        </label>
      ) : (
        <span className={labelClass}>{label}</span>
      )}
      {children}
      {hint ? <p className={hintClass}>{hint}</p> : null}
    </div>
  );
}

export function DeleteFormButton({ id }: { id: string }) {
  return (
    <form
      action={deleteFormAction}
      onSubmit={(event) => {
        if (!confirm("Delete this form and all its submissions? This can't be undone.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={`${btnDanger} self-start`}>
        Delete this form
      </button>
    </form>
  );
}
