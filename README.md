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
- File uploads, search, CSV export
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

Forms, waitlists, storage and webhooks do. Email alerts to arbitrary recipients and
auto-replies need Cloudflare Email Sending on the Workers Paid plan. Sending to verified
destination addresses in your own account is free.

### Is the rate limiting a hard guarantee?

No. The Workers rate-limiting binding is per-location and approximate — a speed bump
against brute force, not a strict quota. Add WAF rules if you need a firm limit.

## Documentation

- [Troubleshooting](./docs/troubleshooting.md)
- [Decisions](./docs/DECISIONS.md)

## License

[MIT](./LICENSE) — use it, modify it, host it, sell it. No obligations beyond keeping
the copyright notice.
