---
name: formflare
description: Add contact forms, waitlists and signup forms to any website using FormFlare, a self-hosted form backend on Cloudflare. Use when the user wants a form or waitlist on their site, mentions FormFlare, has a FormFlare endpoint (…/f/<id>) or hosted page (…/p/<slug>), wants to verify FormFlare webhooks, read submissions through its API, or deploy, update or configure a FormFlare instance.
---

# FormFlare

FormFlare is a form and waitlist backend the user runs on their own Cloudflare account.
Every form has a public endpoint. A website posts to it, and submissions land in the
user's dashboard, trigger email alerts and webhooks, and can be exported. The endpoint
needs no API key and no server code on the website.

Repository and docs: https://github.com/SeifElkadyy/FormFlare

## First, find out where the user is

1. **They have a form already.** They have an endpoint like
   `https://<instance>/f/<publicId>`, or the dashboard's **Share → "Copy prompt"** text.
   Go to *Add a form to a website*.
2. **They have FormFlare but no form yet.** Tell them: dashboard → **Forms → New form**
   (Contact form or Waitlist) → **Share** tab. Copy the endpoint or the prompt from
   there. You cannot create forms for them: posting needs no key, but creating a form
   happens in the dashboard only.
3. **They don't have FormFlare.** Go to *Deploy FormFlare*.

Never invent an endpoint. If you don't have the real `/f/<publicId>` address, ask for it.

## Add a form to a website

### The contract

- `POST https://<instance>/f/<publicId>`
- Body: `application/json`, `application/x-www-form-urlencoded`, or `multipart/form-data`
  (the last is required for file fields).
- Send `Accept: application/json` to get JSON back. Without it, a browser form post gets
  a `303` redirect to the form's thank-you page or the owner's redirect URL.
- Field names must match the form's fields (shown on the dashboard's **Edit** tab).
  Extra fields are kept, not rejected.
- **Honeypot:** include a hidden text input named `_gotcha` (or the name shown in the
  dashboard) that stays empty. Hide it visually, with `tabindex="-1"` and
  `autocomplete="off"`. Never fill it or remove it: it is how bots get caught.
- Reserved names, never use them for your own fields: anything starting with `_`, and
  `cf-turnstile-response`.

### Responses

Success (`200`):

```json
{ "ok": true, "id": "01J…", "waitlist": { "position": 214, "rank": 214, "referralCode": "k3j9d0a1bc" } }
```

`waitlist` appears only on waitlist forms. Also possible:

- `"duplicate": true`: this email already signed up. Treat it as success and show their
  current place.
- `"pending": true`: double opt-in is on. Say "Check your email to confirm your spot".

Failure (`4xx`), always `{ "ok": false, "code": "…" }`:

| code | status | show the visitor |
| --- | --- | --- |
| `validation_failed` | 422 | each message from `fields: { name: message }` next to its field |
| `rate_limited` | 429 | "Too many tries, wait a minute" |
| `captcha_failed` | 422 | let them retry the bot check |
| `payload_too_large` | 413 | "Too large, try a smaller file" |
| `origin_not_allowed` | 403 | this is a setup problem: tell the *user* to add the site under Settings → Spam protection |
| `form_not_found` | 404 | form paused or deleted |

A submission caught as spam also returns a normal success. That is deliberate; don't try
to detect it.

### Recipe: React / Next.js (client component)

```tsx
"use client";
import { useState } from "react";

const ENDPOINT = "https://<instance>/f/<publicId>";

export function ContactForm() {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    setErrors({});
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.ok) return setState("done");
    setState("idle");
    if (json.fields) setErrors(json.fields);
    else setMessage(json.code === "rate_limited" ? "Too many tries, wait a minute." : "Something went wrong. Please try again.");
  }

  if (state === "done") return <p>Thanks, we got it.</p>;
  return (
    <form onSubmit={onSubmit}>
      <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" style={{ display: "none" }} aria-hidden />
      <label>Email <input name="email" type="email" required /></label>
      {errors.email && <p role="alert">{errors.email}</p>}
      <label>Message <textarea name="message" required /></label>
      {errors.message && <p role="alert">{errors.message}</p>}
      {message && <p role="alert">{message}</p>}
      <button disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send"}</button>
    </form>
  );
}
```

Adapt the fields and styling to the project. Use its existing components (shadcn/ui,
Tailwind classes, CSS modules) rather than bare elements.

### Recipe: plain HTML (static sites, Astro, Webflow/Framer custom code)

```html
<form action="https://<instance>/f/<publicId>" method="POST">
  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off" />
  <input name="email" type="email" required />
  <textarea name="message" required></textarea>
  <button type="submit">Send</button>
</form>
```

This works without JavaScript. On success the browser goes to the thank-you page (or
the redirect URL set in Settings). On error the visitor sees a readable error page.

### Recipe: no code

Link to the hosted page `https://<instance>/p/<slug-or-publicId>`, or embed the
self-sizing widget:

```html
<script src="https://<instance>/widget.js" data-form="<slug-or-publicId>" async></script>
```

### Waitlists

- Show `You're #${waitlist.position} on the list`.
- **Referrals:** if the page URL has `?ref=CODE`, send it as the field `_ref`. After
  signup, offer `<page URL>?ref=${waitlist.referralCode}` to share. Confirmed referrals
  move the referrer up if the owner enabled it. The widget passes `?ref=` automatically.
- **Live count:** `GET https://<instance>/f/<publicId>/count` returns `{ "ok": true, "count": 123 }`.
  As an image: `<img src="https://<instance>/f/<publicId>/badge.svg" alt="People on the waitlist">`.

### Bot check (optional)

If the owner turned on Cloudflare Turnstile for the form, include the widget. Its token
field `cf-turnstile-response` is added to the form automatically:

```html
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<div class="cf-turnstile" data-sitekey="<site key from the user>"></div>
```

## Receive submissions elsewhere

- **Webhooks** are added per form: dashboard → form → **Settings → Webhooks**. They
  support Slack, Discord, or any URL (n8n, Zapier, Make).
- **Verifying a generic webhook** (Node). The signature covers `"<timestamp>.<raw body>"`,
  not the body alone:

  ```js
  import crypto from "node:crypto";
  export function verify(rawBody, headers, secret) {
    const ts = Number(headers["x-formflare-timestamp"]);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
    const a = Buffer.from(expected), b = Buffer.from(headers["x-formflare-signature"] ?? "");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  ```

  Verify against the raw body, before JSON parsing. Each delivery has a unique
  `X-FormFlare-Delivery` id for idempotency.
- **REST API (read-only).** The user creates a key under **Settings → API keys** and
  sends `Authorization: Bearer ff_live_…`. Keep the key server-side, never in browser
  code.
  - `GET /api/v1/forms`
  - `GET /api/v1/forms/<publicId>/submissions?limit=50&cursor=…&status=new&q=…`
  - `GET /api/v1/submissions/<id>`

## Deploy FormFlare

1. Open https://github.com/SeifElkadyy/FormFlare and click **Deploy to Cloudflare**. It
   needs no payment card and no secrets. Leave resources as **new**. If this Cloudflare
   account already has a FormFlare, rename the database and queue on that page (for
   example `formflare-2`).
2. When it finishes, open the Worker URL and complete `/setup` (admin account).
3. Create a form, then use *Add a form to a website* above.

Optional, only if the user wants them:

- **Email alerts:** Settings → Email (Cloudflare Email Sending or a Resend key).
- **File uploads:** needs R2. Enable R2 in Cloudflare (it asks for a card), then add
  `"r2_buckets": [{ "binding": "BUCKET", "bucket_name": "formflare-uploads" }]` to
  `wrangler.jsonc` in *their* repo and push.
- **Custom domain:** add `"routes": [{ "pattern": "forms.example.com", "custom_domain": true }]`
  to `wrangler.jsonc` and push. See `docs/custom-domain.md`.

## Update an existing instance

The Deploy button made a **copy** of the repo in the user's GitHub, not a fork. In a
clone of *their* copy (not the upstream repo):

```bash
node scripts/check-update.mjs --dry-run
node scripts/check-update.mjs
git checkout main && git merge upstream-update && git push
```

Cloudflare rebuilds on push and applies database migrations itself. Files the updater
could not merge are listed in `.formflare/pending-updates.json`. Merge each by hand,
then remove its entry. Don't push to their repository without asking: a push deploys
to production.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `origin_not_allowed` | Add the site's origin under the form's Settings → Spam protection, or empty the list |
| Nothing arrives, no error | The form may be paused (header shows "Paused"), or submissions are in the Spam tab |
| Email alerts don't send | Settings → Email; a verified sender domain is required |
| First deploy failed: "Could not read package.json" | Make any commit in their new repo (edit the README) to trigger a fresh build |
| Deploy failed: "already has a consumer" | A second copy in the same account: rename the queue and database |

More: `docs/api.md`, `docs/embedding.md`, `docs/troubleshooting.md`,
`docs/custom-domain.md` and `docs/backups.md` in the repository.
