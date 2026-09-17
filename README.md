# FormFlare

Forms and waitlists for any website — self-hosted on your own Cloudflare account.

> **Status:** in development. The Deploy to Cloudflare button, screenshots and full docs
> land in Phase 6. See [FORMFLARE_PLAN.md](./FORMFLARE_PLAN.md) for the roadmap and
> [docs/DECISIONS.md](./docs/DECISIONS.md) for design decisions.

## What it does

- Add a backend to any HTML form with one line
- Collect waitlist signups with automatic positions ("You're #214")
- Block spam with honeypots, rate limits and Cloudflare Turnstile
- Email alerts and auto-replies
- Signed webhooks to n8n, Slack, or any URL
- Search and CSV export
- File uploads (optional — needs R2, see below)
- All data stays in your own D1 database and R2 bucket

## How it works

One Worker in your Cloudflare account. Submissions go to D1, files to R2, and
emails/webhooks run in the background through Queues.

## Local development

```bash
npm install
npm run db:migrate:local
npm run dev
```

Then open `/setup` to create your admin account.

To run the real Workers runtime instead of `next dev`:

```bash
npm run preview
```

## Commands

| Command                                | Purpose                                                         |
| -------------------------------------- | --------------------------------------------------------------- |
| `npm run dev`                          | Next dev server                                                 |
| `npm run preview`                      | Build and serve on workerd with real bindings                   |
| `npm test`                             | Vitest against Miniflare bindings                               |
| `npm run lint` / `npm run typecheck`   | Static checks                                                   |
| `npm run db:generate`                  | Generate a migration from the schema                            |
| `npm run db:migrate:local` / `:remote` | Apply migrations                                                |
| `npm run cf-typegen`                   | Regenerate `cloudflare-env.d.ts` after editing `wrangler.jsonc` |
| `npm run reset-password`               | Reset an account password from the CLI                          |

## FAQ

### I forgot my admin password. How do I get back in?

There is no password reset email — that would require a configured mailer, and email is
optional in FormFlare by design. Reset it from the command line instead:

```bash
npm run reset-password -- --email you@example.com --remote
```

It prompts for a new password, writes it with the same PBKDF2 hashing the app uses, and
signs out every existing session for that account. Use `--local` for your development
database. You need Wrangler logged in to the account that owns the database.

### Do I need any secrets or API tokens to deploy?

No. FormFlare deploys with zero required secrets. The session key is generated during
`/setup`, and Turnstile keys are entered per form in the dashboard.

There is one **optional** secret, `SETUP_TOKEN`. If you set it, `/setup` additionally
requires that token — useful if you want to close the window between deploying and
creating your account. Without it, the first-run lock still applies: once an owner
exists, `/setup` is permanently disabled.

### Can I rename the Worker, database or bucket?

Yes. Nothing depends on those names.

### Why is my form change not live yet?

Form configuration is cached for up to 30 seconds per Worker isolate. Deactivating or
deleting a form can take that long to apply everywhere.

### Does it work on the Cloudflare free plan?

Yes, and it deploys without a payment method. Forms, waitlists, spam protection,
webhooks, search and exports all run on the free tier.

Two features need more:

- **File uploads** need R2. Cloudflare requires a payment method to activate R2 **even to
  stay inside its free tier**, so FormFlare ships without it — the Deploy button never
  asks. See "How do I enable file uploads?" below.
- **Email alerts to arbitrary recipients** and auto-replies need Cloudflare Email Sending
  on the Workers Paid plan. Sending to verified destination addresses in your own account
  is free.

Without either, forms still work: submissions land in the dashboard and fire webhooks.

### How do I enable file uploads?

FormFlare deploys with no R2 bucket, because activating R2 requires a card on file. A
form with a file field will reject uploads with a clear message until you add one.

1. Cloudflare dashboard → **R2** → **Enable R2** (this asks for a payment method).
2. **Create bucket** — call it `formflare-uploads`.
3. Add it to `wrangler.jsonc`:

   ```jsonc
   "r2_buckets": [{ "binding": "BUCKET", "bucket_name": "formflare-uploads" }]
   ```

4. Commit and push. Workers Builds redeploys, and `/setup` shows R2 as configured.

The free tier covers 10 GB of storage and 1M writes per month, which is far more than a
form backend uses — but the card is required regardless.

### Is the rate limiting a hard guarantee?

No. The Workers rate-limiting binding is per-location and approximate — a speed bump
against brute force, not a strict quota. Add WAF rules if you need a firm limit.

## Documentation

- [Troubleshooting](./docs/troubleshooting.md)
- [Decisions](./docs/DECISIONS.md)

## License

[MIT](./LICENSE) — use it, modify it, host it, sell it. No obligations beyond keeping
the copyright notice.
