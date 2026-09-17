"use client";

import { useActionState } from "react";
import { deleteFormAction, updateFormAction, type FormState } from "../actions";

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
  };
}

export function FormSettings({ form }: Props) {
  const [state, formAction, pending] = useActionState(updateFormAction, initialState);

  return (
    <>
      <form action={formAction} className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Settings</h2>
        <input type="hidden" name="id" value={form.id} />

        <div className="space-y-1">
          <label htmlFor="name" className="block text-sm font-medium">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={form.name}
            className="w-full rounded-md border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={form.active} />
          Accepting submissions
        </label>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Turning this off can take up to 30 seconds to apply everywhere.
        </p>

        <div className="space-y-1">
          <label htmlFor="redirectUrl" className="block text-sm font-medium">
            Redirect after submit
          </label>
          <input
            id="redirectUrl"
            name="redirectUrl"
            type="url"
            placeholder="https://yoursite.com/thanks"
            defaultValue={form.redirectUrl ?? ""}
            className="w-full rounded-md border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]"
          />
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Leave empty to use the built-in thank-you page.
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="allowedOrigins" className="block text-sm font-medium">
            Allowed origins
          </label>
          <textarea
            id="allowedOrigins"
            name="allowedOrigins"
            rows={3}
            placeholder={"https://yoursite.com\nhttps://www.yoursite.com"}
            defaultValue={form.allowedOrigins}
            className="w-full rounded-md border border-black/[.12] bg-transparent px-3 py-2 font-mono text-xs dark:border-white/[.18]"
          />
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            One per line. Empty means any site may submit. Required before a custom
            <code className="mx-1">_redirect</code> is honoured.
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="notifyEmails" className="block text-sm font-medium">
            Email alerts to
          </label>
          <textarea
            id="notifyEmails"
            name="notifyEmails"
            rows={2}
            placeholder={"you@yourdomain.com"}
            defaultValue={form.notifyEmails}
            className="w-full rounded-md border border-black/[.12] bg-transparent px-3 py-2 font-mono text-xs dark:border-white/[.18]"
          />
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            One per line. Needs Cloudflare Email Sending; the app works without it.
          </p>
        </div>

        <fieldset className="space-y-2 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
          <legend className="px-1 text-sm font-medium">Auto-reply</legend>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="autoReplyEnabled" defaultChecked={form.autoReplyEnabled} />
            Send a reply to the submitter
          </label>

          {/*
            Auto-reply mails an address a stranger typed into a public form, from the
            owner's domain. Turnstile is the difference between that being a courtesy
            and being an open relay for a spammer.
          */}
          <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
            ⚠️ Turn on Turnstile before enabling this. Auto-replies are sent to whatever address was
            submitted, so without a bot check your domain can be used to mail strangers. Formflare
            also limits one auto-reply per address per 24 hours.
          </p>

          <div className="space-y-1">
            <label htmlFor="autoReplySubject" className="block text-sm font-medium">
              Subject
            </label>
            <input
              id="autoReplySubject"
              name="autoReplySubject"
              defaultValue={form.autoReplySubject ?? ""}
              placeholder="Thanks — we got your message"
              className="w-full rounded-md border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="autoReplyBody" className="block text-sm font-medium">
              Message
            </label>
            <textarea
              id="autoReplyBody"
              name="autoReplyBody"
              rows={3}
              defaultValue={form.autoReplyBody ?? ""}
              placeholder="Thanks for getting in touch. We'll be in contact soon."
              className="w-full rounded-md border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]"
            />
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Your text only — nothing the submitter typed is echoed back, so the message cannot be
              used to relay someone else&rsquo;s content.
            </p>
          </div>
        </fieldset>

        <div className="space-y-1">
          <label htmlFor="turnstileSiteKey" className="block text-sm font-medium">
            Turnstile site key
          </label>
          <input
            id="turnstileSiteKey"
            name="turnstileSiteKey"
            defaultValue={form.turnstileSiteKey ?? ""}
            className="w-full rounded-md border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="turnstileSecret" className="block text-sm font-medium">
            Turnstile secret
          </label>
          <input
            id="turnstileSecret"
            name="turnstileSecret"
            type="password"
            autoComplete="off"
            placeholder={form.hasTurnstileSecret ? "•••••••• (leave blank to keep)" : ""}
            className="w-full rounded-md border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]"
          />
          <p className="text-xs text-zinc-600 dark:text-zinc-400">Encrypted before it is stored.</p>
        </div>

        {state.error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
      </form>

      <form
        action={deleteFormAction}
        className="rounded-lg border border-red-500/30 p-4"
        onSubmit={(event) => {
          if (!confirm("Delete this form, all its submissions and uploaded files?")) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={form.id} />
        <h2 className="text-sm font-medium text-red-600 dark:text-red-400">Danger zone</h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Deletes the form, its submissions and every uploaded file. Cannot be undone.
        </p>
        <button type="submit" className="mt-3 text-sm text-red-600 underline dark:text-red-400">
          Delete form
        </button>
      </form>
    </>
  );
}
