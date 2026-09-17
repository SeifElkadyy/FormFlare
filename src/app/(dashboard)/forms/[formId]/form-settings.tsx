"use client";

import { useActionState } from "react";
import { deleteFormAction, updateFormAction, type FormState } from "../actions";
import {
  alertClass,
  btnDanger,
  btnPrimary,
  cardClass,
  errorClass,
  hintClass,
  inputClass,
  labelClass,
  sectionTitle,
  textareaClass,
} from "@/lib/ui";

const initialState: FormState = {};

interface Props {
  form: {
    id: string;
    name: string;
    active: boolean;
    redirectUrl: string | null;
    allowedOrigins: string;
    turnstileSiteKey: string | null;
    hasTurnstileSecret: boolean;
    notifyEmails: string;
    autoReplyEnabled: boolean;
    autoReplySubject: string | null;
    autoReplyBody: string | null;
    /** False when no R2 bucket is bound, so file fields cannot work. */
    uploadsAvailable: boolean;
  };
}

export function FormSettings({ form }: Props) {
  const [state, formAction, pending] = useActionState(updateFormAction, initialState);

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-6">
        <input type="hidden" name="id" value={form.id} />

        <section className={`${cardClass} flex flex-col gap-4`}>
          <h2 className={sectionTitle}>Form</h2>

          <div className="flex flex-col gap-1">
            <label htmlFor="name" className={labelClass}>
              Name
            </label>
            <input id="name" name="name" required defaultValue={form.name} className={inputClass} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={form.active} className="accent-blue-600" />
            Accepting submissions
          </label>
          <p className={hintClass}>Turning this off can take up to 30 seconds to apply everywhere.</p>

          <div className="flex flex-col gap-1">
            <label htmlFor="redirectUrl" className={labelClass}>
              Redirect after submit
            </label>
            <input
              id="redirectUrl"
              name="redirectUrl"
              type="url"
              placeholder="https://yoursite.com/thanks"
              defaultValue={form.redirectUrl ?? ""}
              className={inputClass}
            />
            <p className={hintClass}>Leave empty to use the built-in thank-you page.</p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="allowedOrigins" className={labelClass}>
              Allowed origins
            </label>
            <textarea
              id="allowedOrigins"
              name="allowedOrigins"
              rows={3}
              placeholder={"https://yoursite.com\nhttps://www.yoursite.com"}
              defaultValue={form.allowedOrigins}
              className={`${textareaClass} font-mono text-xs`}
            />
            <p className={hintClass}>
              One per line. Empty means any site may submit. Required before a custom
              <code className="mx-1">_redirect</code> is honoured.
            </p>
          </div>

          {!form.uploadsAvailable ? (
            <p className={alertClass}>
              File uploads are off. This instance has no R2 bucket, so a form with a file field will
              reject the upload. To enable it: turn on R2 in the Cloudflare dashboard, create a
              bucket, bind it as <code>BUCKET</code> in <code>wrangler.jsonc</code>, and redeploy.
              Cloudflare asks for a payment method to activate R2, even on the free tier.
            </p>
          ) : null}
        </section>

        <section className={`${cardClass} flex flex-col gap-4`}>
          <h2 className={sectionTitle}>Notifications</h2>

          <div className="flex flex-col gap-1">
            <label htmlFor="notifyEmails" className={labelClass}>
              Email alerts to
            </label>
            <textarea
              id="notifyEmails"
              name="notifyEmails"
              rows={2}
              placeholder={"you@yourdomain.com"}
              defaultValue={form.notifyEmails}
              className={`${textareaClass} font-mono text-xs`}
            />
            <p className={hintClass}>
              One per line. Needs Cloudflare Email Sending; the app works without it.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="autoReplyEnabled"
              defaultChecked={form.autoReplyEnabled}
              className="accent-blue-600"
            />
            Send a reply to the submitter
          </label>

          {/*
            Auto-reply mails an address a stranger typed into a public form, from the
            owner's domain. Turnstile is the difference between that being a courtesy
            and being an open relay for a spammer.
          */}
          <p className={alertClass}>
            Turn on Turnstile before enabling this. Auto-replies are sent to whatever address was
            submitted, so without a bot check your domain can be used to mail strangers. FormFlare
            also limits one auto-reply per address per 24 hours.
          </p>

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
            <p className={hintClass}>
              Your text only — nothing the submitter typed is echoed back, so the message cannot be
              used to relay someone else&rsquo;s content.
            </p>
          </div>
        </section>

        <section className={`${cardClass} flex flex-col gap-4`}>
          <h2 className={sectionTitle}>Spam protection</h2>

          <div className="flex flex-col gap-1">
            <label htmlFor="turnstileSiteKey" className={labelClass}>
              Turnstile site key
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
              Turnstile secret
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

          {state.error ? (
            <p role="alert" className={errorClass}>
              {state.error}
            </p>
          ) : null}

          <button type="submit" disabled={pending} className={`${btnPrimary} self-start`}>
            {pending ? "Saving…" : "Save settings"}
          </button>
        </section>
      </form>

      <section className={`${cardClass} border-0`}>
        <h2 className="text-[13px] font-medium text-red-700 dark:text-red-400">Danger zone</h2>
        <p className={`mt-1 ${hintClass}`}>
          Deletes the form, its submissions and every uploaded file. Cannot be undone.
        </p>
        <form
          action={deleteFormAction}
          className="mt-3"
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
      </section>
    </div>
  );
}
