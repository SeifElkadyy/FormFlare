"use client";

import { useActionState, useState, type ReactNode } from "react";
import { deleteFormAction, updateFormAction, type FormState } from "../actions";
import { Notice } from "@/components/notice";
import {
  btnDanger,
  btnPrimary,
  cardClass,
  errorClass,
  hintClass,
  inputClass,
  labelClass,
  sectionTitle,
  successClass,
  textareaClass,
} from "@/lib/ui";
import { FieldEditor, seedDraftFields } from "./field-editor";
import { FormFold } from "./form-fold";
import { OriginsEditor } from "./origins-editor";

const initialState: FormState = {};

interface Props {
  form: {
    id: string;
    name: string;
    mode: string;
    active: boolean;
    redirectUrl: string | null;
    allowedOrigins: string[];
    fieldsJson: string;
    turnstileSiteKey: string | null;
    hasTurnstileSecret: boolean;
    notifyEmails: string;
    autoReplyEnabled: boolean;
    autoReplySubject: string | null;
    autoReplyBody: string | null;
    slug: string;
    hostedPath: string;
    hostedDescription: string;
    doubleOptIn: boolean;
    referralBoost: number;
    uploadsAvailable: boolean;
    mailerAvailable: boolean;
  };
  name: string;
  onNameChange: (name: string) => void;
  intro: string;
  onIntroChange: (intro: string) => void;
  fields: ReturnType<typeof seedDraftFields>;
  onFieldsChange: (fields: ReturnType<typeof seedDraftFields>) => void;
  usingDefaults: boolean;
  share: ReactNode;
}

export function FormSettings({
  form,
  name,
  onNameChange,
  intro,
  onIntroChange,
  fields,
  onFieldsChange,
  usingDefaults,
  share,
}: Props) {
  const [state, formAction, pending] = useActionState(updateFormAction, initialState);
  const [reply, setReply] = useState(form.autoReplyEnabled);

  const originStatus =
    form.allowedOrigins.length === 0
      ? "Any site"
      : form.allowedOrigins.length === 1
        ? "1 site"
        : `${form.allowedOrigins.length} sites`;

  const emailStatus = form.autoReplyEnabled
    ? "Alerts + auto-reply"
    : form.notifyEmails.trim()
      ? "Alerts on"
      : "Off";

  const waitlistStatus = form.doubleOptIn ? "Confirm email on" : "No email confirm";

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={form.id} />

        <section id="fields" className={`${cardClass} flex scroll-mt-6 flex-col gap-4`}>
          <h2 className={sectionTitle}>This form</h2>

          <div className="flex flex-col gap-1">
            <label htmlFor="name" className={labelClass}>
              Name
            </label>
            <input
              id="name"
              name="name"
              required
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              className={inputClass}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={form.active} className="accent-flare" />
            Accepting submissions
          </label>

          <div>
            <h3 className={sectionTitle}>Fields</h3>
            <p className={`${hintClass} mt-1`}>
              What visitors type. The snippet and hosted page follow this list.
            </p>
          </div>
          <FieldEditor
            fields={fields}
            onChange={onFieldsChange}
            mode={form.mode}
            uploadsAvailable={form.uploadsAvailable}
            usingDefaults={usingDefaults}
          />
        </section>

        {form.mode === "waitlist" ? (
          <FormFold title="Waitlist" status={waitlistStatus}>
            {form.mailerAvailable ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="doubleOptIn"
                  defaultChecked={form.doubleOptIn}
                  className="accent-flare"
                />
                Confirm email before assigning a position
              </label>
            ) : (
              <>
                {form.doubleOptIn ? <input type="hidden" name="doubleOptIn" value="on" /> : null}
                <label className="flex items-center gap-2 text-sm text-neutral-400">
                  <input type="checkbox" disabled checked={form.doubleOptIn} className="accent-flare" />
                  Confirm email before assigning a position
                </label>
                <Notice tone="warning">
                  {form.doubleOptIn ? (
                    <>
                      Email is off, so confirmations are not sending. Copy the link from Inbox.{" "}
                      <a href="/settings#email" className="font-medium underline">
                        Turn on sending
                      </a>
                    </>
                  ) : (
                    <>
                      Needs sending in{" "}
                      <a href="/settings#email" className="font-medium underline">
                        Settings
                      </a>
                      .
                    </>
                  )}
                </Notice>
              </>
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor="referralBoost" className={labelClass}>
                Places per referral
              </label>
              <input
                id="referralBoost"
                name="referralBoost"
                type="number"
                min={0}
                max={100}
                defaultValue={form.referralBoost}
                className={inputClass}
              />
              <p className={hintClass}>0 records referrals without moving anyone.</p>
            </div>
          </FormFold>
        ) : null}

        <FormFold title="After they submit" status={form.redirectUrl ? "Custom page" : "Built-in thanks"}>
          <div className="flex flex-col gap-1">
            <label htmlFor="redirectUrl" className={labelClass}>
              Redirect URL
            </label>
            <input
              id="redirectUrl"
              name="redirectUrl"
              type="url"
              placeholder="https://yoursite.com/thanks"
              defaultValue={form.redirectUrl ?? ""}
              className={inputClass}
            />
            <p className={hintClass}>Empty uses FormFlare’s thank-you page.</p>
          </div>
        </FormFold>

        <FormFold title="Email alerts" status={emailStatus}>
          {!form.mailerAvailable ? (
            <Notice tone="info">
              Inbox already collects. Sending mail needs a provider in{" "}
              <a href="/settings#email" className="font-medium underline">
                Settings
              </a>
              .
            </Notice>
          ) : null}

          <div className="flex flex-col gap-1">
            <label htmlFor="notifyEmails" className={labelClass}>
              Email me at
            </label>
            <textarea
              id="notifyEmails"
              name="notifyEmails"
              rows={2}
              placeholder="you@yourdomain.com"
              defaultValue={form.notifyEmails}
              className={`${textareaClass} font-mono text-xs`}
            />
            <p className={hintClass}>One address per line.</p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="autoReplyEnabled"
              defaultChecked={form.autoReplyEnabled}
              className="accent-flare"
              onChange={(event) => setReply(event.target.checked)}
            />
            Send a reply to the submitter
          </label>

          <div className={reply ? "flex flex-col gap-4" : "hidden"}>
            <Notice tone="warning">
              Turn on the bot check below first. Without it, anyone can use your domain to mail
              strangers. One auto-reply per address per 24 hours.
            </Notice>
            <div className="flex flex-col gap-1">
              <label htmlFor="autoReplySubject" className={labelClass}>
                Subject
              </label>
              <input
                id="autoReplySubject"
                name="autoReplySubject"
                defaultValue={form.autoReplySubject ?? ""}
                placeholder="Thanks — we got your message"
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="autoReplyBody" className={labelClass}>
                Message
              </label>
              <textarea
                id="autoReplyBody"
                name="autoReplyBody"
                rows={3}
                defaultValue={form.autoReplyBody ?? ""}
                placeholder="Thanks for getting in touch. We'll be in contact soon."
                className={textareaClass}
              />
              <p className={hintClass}>Your text only — nothing they typed is echoed back.</p>
            </div>
          </div>
        </FormFold>

        <FormFold title="Allowed websites" status={originStatus}>
          <p className={hintClass}>
            Only these sites may POST from a browser. Empty allows any site.
          </p>
          <OriginsEditor initial={form.allowedOrigins} />
        </FormFold>

        <FormFold title="Hosted page" status={form.hostedPath}>
          <div className="flex flex-col gap-1">
            <label htmlFor="slug" className={labelClass}>
              Slug
            </label>
            <input
              id="slug"
              name="slug"
              defaultValue={form.slug}
              placeholder="waitlist"
              className={inputClass}
            />
            <p className={hintClass}>
              Optional nicer URL. The form id always works too.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="hostedDescription" className={labelClass}>
              Intro
            </label>
            <textarea
              id="hostedDescription"
              name="hostedDescription"
              rows={2}
              value={intro}
              onChange={(event) => onIntroChange(event.target.value)}
              className={textareaClass}
            />
          </div>
        </FormFold>

        <FormFold
          title="Bot check"
          status={form.hasTurnstileSecret || form.turnstileSiteKey ? "Turnstile on" : "Off"}
        >
          <p className={hintClass}>Cloudflare Turnstile. Needed before auto-replies.</p>
          <div className="flex flex-col gap-1">
            <label htmlFor="turnstileSiteKey" className={labelClass}>
              Site key
            </label>
            <input
              id="turnstileSiteKey"
              name="turnstileSiteKey"
              defaultValue={form.turnstileSiteKey ?? ""}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="turnstileSecret" className={labelClass}>
              Secret
            </label>
            <input
              id="turnstileSecret"
              name="turnstileSecret"
              type="password"
              autoComplete="off"
              placeholder={form.hasTurnstileSecret ? "•••••••• (leave blank to keep)" : ""}
              className={inputClass}
            />
            <p className={hintClass}>Encrypted before it is stored.</p>
          </div>
        </FormFold>

        {share}

        <div className="sticky bottom-3 z-10 flex flex-col items-start gap-2">
          {state.error ? (
            <p
              role="alert"
              className={`${errorClass} rounded-xl bg-white/90 px-3 py-2 shadow-[var(--shadow-border)] dark:bg-neutral-900/90`}
            >
              {state.error}
            </p>
          ) : null}
          {state.saved ? (
            <p className={`${successClass} shadow-[var(--shadow-border)]`}>
              Saved. Snippet and preview now match these fields.
            </p>
          ) : null}
          <button type="submit" disabled={pending} className={btnPrimary}>
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      <details className={`${cardClass} border-0`}>
        <summary className="flex cursor-pointer items-center justify-between gap-3 text-[13px] font-medium text-red-700 dark:text-red-400">
          <span>Delete this form</span>
          <span className="font-normal text-neutral-400">Cannot be undone</span>
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className={hintClass}>Removes the form, its submissions and uploaded files.</p>
          <form
            action={deleteFormAction}
            onSubmit={(event) => {
              if (!confirm("Delete this form, all its submissions and uploaded files?")) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="id" value={form.id} />
            <button type="submit" className={btnDanger}>
              Delete form
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}
