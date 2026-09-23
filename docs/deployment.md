# Deployment

## Deploy to Cloudflare

Click the button in the README. Cloudflare clones the repository into your own GitHub
account, creates the resources it needs, builds and deploys.

**No secrets are required.** The session key is generated during `/setup`, and Turnstile
keys are entered per form in the dashboard.

Resources created automatically:

| Resource      | Binding | Purpose                            |
| ------------- | ------- | ---------------------------------- |
| D1 database   | `DB`    | Forms, submissions, users          |
| Queue         | `JOBS`  | Email and webhook delivery         |
| Email Sending | `EMAIL` | Owner alerts (optional at runtime) |

Email is optional. After `/setup`, Settings can use the Cloudflare binding **or** a
Resend API key stored in D1 (never a deploy secret). Forms still work with email off.


You can rename the Worker, the database and the queue on the setup page — nothing
depends on those names.

After it deploys, open your Worker URL and follow `/setup`. To serve it from your own
domain, see [custom-domain.md](custom-domain.md). For backups and restores, see
[backups.md](backups.md).

## What is deliberately not included

### R2 (file uploads)

`wrangler.jsonc` has **no `r2_buckets` entry**, so the Deploy page never asks for one.

Cloudflare requires a payment method to activate R2 **even to stay inside its free
tier**. Including the binding would mean every deployer hits a card prompt before they
could finish, for a feature most contact forms and waitlists never use.

Everything except file uploads works without it. A form with a file field rejects the
upload with a message telling the submitter it could not be accepted, and `/setup` shows
R2 as an optional warning rather than a failure.

To enable uploads, see the README's "How do I enable file uploads?".

## Worker URL settings

Both are set explicitly in `wrangler.jsonc` rather than left to defaults:

```jsonc
"workers_dev": true,
"preview_urls": false
```

**`workers_dev: true`** — the documented default is already `true`, but a fresh account
deployed through the button came up with the subdomain disabled and no URL at all.
Setting it explicitly means a deployer always gets a reachable Worker.

**`preview_urls: false`** — preview URLs are public and hit the **same D1 database** as
production. An older version of your instance would stay reachable, with real
submissions, on a URL that never expires and misses any later fix. Turn them on if you
want to test a version before promoting it, and be aware they are not isolated.

## Local development

```bash
npm install
npm run db:migrate:local
npm run dev
```

Then open `/setup`. To run the real Workers runtime instead of `next dev`:

```bash
npm run preview
```

## A second instance for testing

Copy `wrangler.dev.example.jsonc` to `wrangler.dev.jsonc` (gitignored, because it holds
a database id specific to your account), fill in your own ids, then:

```bash
npm run deploy:dev
```

## Upgrading

Cloudflare's Workers Builds redeploys on every push to the production branch.

Migrations run before the upload, and the upload can fail — so migrations are always
backward compatible with the previous version's code. A failed deploy leaves the new
schema under old code, which keeps working.
