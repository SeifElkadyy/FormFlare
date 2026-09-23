# Troubleshooting

## The first build fails with "Could not read package.json"

This hits a new deployment before you have changed anything, and it is not a problem
with your repository.

Cloudflare creates your repository and starts a build in parallel with importing the
source into it. The first build can therefore start against an empty
`Uploading template` commit, before the `source repo import` commit that carries the
actual code has landed — so the build looks for `package.json` and finds nothing.

**Fix: make any small commit in your new repository.** Editing the README on GitHub and
committing is enough. That triggers a fresh build against a commit that has the code,
and it succeeds.

**"Retry build" does not work.** The retry runs against the same empty commit and fails
the same way, however many times you press it.

Nothing in FormFlare can prevent this — the empty commit is created and built by
Cloudflare before our code exists in your repository. Once you are past it, subsequent
builds are unaffected.

## Deploy fails with "already has a consumer" or "limit of 5 cron triggers"

You are deploying a **second** FormFlare into an account that already has one, and kept
the default resource names on the Deploy page.

- **"Queue 'formflare-jobs' … already has a consumer"** — a queue can feed only one
  Worker, and the existing install owns it.
- **The database is shared too, silently.** The new install reuses the existing
  `formflare` D1 database, so it sees the other install's owner and data, and `/setup`
  reports that setup is already complete.
- **"reached the Workers Free limit of 5 cron triggers per account"** — each install
  uses one cron trigger, and the free plan allows five per account, shared with every
  other Worker you run.

**Fix:** deploy again and, on the Deploy page, give the **database** and the **queue**
new names (for example `formflare-2` and `formflare-2-jobs`). Or, in the new repository,
change `database_name` and `queue` in `wrangler.jsonc` and remove the `database_id`
line so a fresh database is created, then push. If you hit the cron limit, delete an
unused Worker or move to Workers Paid.

## I'm locked out of my admin account

FormFlare has no "forgot password" email flow — that would require a configured mailer,
and email is optional by design. Recovery is a command line reset, which anyone with
access to the Cloudflare account can run:

```bash
npm run reset-password -- --email you@example.com --remote
```

Use `--local` for your local development database.

The script:

1. checks the account exists (a typo fails loudly rather than doing nothing),
2. prompts twice for a new password (minimum 12 characters), without echoing it,
3. hashes it with PBKDF2-SHA-256 at 100,000 iterations — the same format the app uses,
4. writes the hash with `wrangler d1 execute`, and
5. **deletes every session for that user**, so any stolen cookie stops working.

You need Wrangler authenticated against the account that owns the database
(`npx wrangler login`).

## Setup page returns 404

`/setup` is disabled permanently once an owner account exists — this is the first-run
lock. If you need to start over, delete the user rows and the `setup_completed` setting:

```bash
npx wrangler d1 execute DB --remote --command "DELETE FROM users; DELETE FROM sessions; DELETE FROM settings WHERE key='setup_completed';"
```

> ⚠️ Do **not** delete `session_secret`. It is also the key source for encrypting stored
> Turnstile and webhook secrets — removing it makes existing encrypted values
> undecryptable. See "Rotating session_secret" below.

If you set `SETUP_TOKEN`, open `/setup?token=YOUR_TOKEN`; a missing or wrong token also
returns 404 (it is indistinguishable from a disabled page on purpose).

## Rotating session_secret

`session_secret` is not only used for signing. It also:

- derives the AES-GCM key that encrypts Turnstile secrets and webhook signing secrets
  at rest, and
- salts the hashes of submitter IP addresses.

Changing it therefore **breaks decryption of every stored secret** and makes old IP
hashes incomparable. Do not rotate it casually. If you must (for example after a
database leak), plan to re-enter every Turnstile secret and webhook secret afterwards.

## Emails are not sending

Email is optional; forms keep working without it. Check, in order:

1. The `EMAIL` binding exists in `wrangler.jsonc` and you have redeployed.
2. Cloudflare Email Sending is enabled and your domain is onboarded.
3. Your sender address in Settings is on that domain.
4. **Plan limits:** sending to verified destination addresses in your own account is
   free, but sending to arbitrary recipients (auto-replies to submitters) needs the
   Workers Paid plan.

The dashboard shows a banner with the specific cause when it can detect one.

## Rate limiting looks inconsistent

The Workers rate-limiting binding is **per-location and approximate**. Counters are not
shared globally, so a determined attacker spread across regions can exceed the nominal
limit. It is a speed bump against brute force and floods, not a hard quota. Layer
Cloudflare WAF rules in front if you need a firm limit.

## A form change hasn't taken effect

Form configuration is cached in memory for up to 30 seconds per Worker isolate, so
deactivating or deleting a form can take that long to apply everywhere. The isolate that
made the change clears its own cache immediately; other isolates expire on their own.
Wait 30 seconds before concluding a change did not save.

## Migrations fail during deploy

Migrate by **binding name**, never the database name — deployers can rename the database
on the setup page:

```bash
npx wrangler d1 migrations apply DB --remote
```

## Bindings are undefined in production but fine locally

You are reading `process.env` instead of the Cloudflare bindings. Use
`getCloudflareContext().env` via `src/lib/env.ts`.

## The app breaks after renaming the Worker

It should not — nothing references the Worker name, and the CSRF check compares against
the live `Host` header. If you hit this, please open an issue with the name you used.
