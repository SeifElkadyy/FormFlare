# FormFlare

Forms and waitlists for any website — self-hosted on your own Cloudflare account.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/SeifElkadyy/FormFlare)

Deploys on the Cloudflare **free plan**, with **no payment method** and **no secrets** to
configure. Cloudflare copies this repository into your GitHub account, creates the
database and queue, and deploys. Then open `/setup` to create your admin account.

<!-- TODO(screenshots): dashboard inbox + form settings, before announcing. -->

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

### My first build failed with "Could not read package.json"

Make any small commit in your new repository — editing the README on GitHub is enough —
and the next build succeeds. Retrying the failed build does not help: Cloudflare
sometimes builds the empty commit it creates before your code arrives, and a retry
rebuilds that same commit. See
[Troubleshooting](./docs/troubleshooting.md#the-first-build-fails-with-could-not-read-packagejson).

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

### How do I get FormFlare updates after deploying?

The Deploy button gives you a **copy** of this repository, not a fork, so GitHub's
"Sync fork" button does not exist for it. FormFlare ships a script that closes the gap:
it works out which release you are on, fetches the newer one, and replays the changes
onto your own `main`.

Your commits stay the base, so anything you customised is kept, and nothing is applied
without you merging it.

> **⚠️ Cloudflare does not copy `.github/` when it clones.** We ship
> `.github/workflows/update-check.yml`, but it will **not** be in your repository —
> Cloudflare strips the whole directory, so there is no automatic weekly check unless
> you add one yourself (option B below). `scripts/check-update.mjs` *is* copied, so
> option A works out of the box.

#### A. Check for updates yourself (works immediately)

From the root of your copy, on a clean working tree:

```bash
git pull
node scripts/check-update.mjs --dry-run
```

`--dry-run` reports what would change without touching your repository. To prepare the
update for real, drop the flag:

```bash
node scripts/check-update.mjs
```

That commits the changes to a local `upstream-update` branch and stops — nothing is
pushed. Review and apply it:

```bash
git show upstream-update
git checkout main && git merge upstream-update
```

Then push, and Workers Builds redeploys. Add `--push` instead if you would rather push
the branch and open a pull request on GitHub. `--help` lists the flags.

The output lists every release you are skipping past, flags new database migrations, and
warns you when `wrangler.jsonc` is involved.

#### B. Automate it (optional)

To get the weekly check and an automatic pull request, copy
[`.github/workflows/update-check.yml`](https://github.com/SeifElkadyy/FormFlare/blob/main/.github/workflows/update-check.yml)
from this repository into your own at the same path, and commit it.

Adding that file needs the `workflow` permission on whatever you commit it with — the
GitHub web editor is easiest, since it uses your own account. Once it is in place the
check runs weekly, and on demand from the Actions tab → **Check for FormFlare updates**
→ **Run workflow**.

**⚠️ The schedule can switch itself off.** GitHub disables scheduled workflows in public
repositories after 60 days without repository activity. Each update PR counts as
activity, but after a quiet stretch you may need to re-enable the workflow in the
Actions tab. Running the script by hand works regardless.

#### Files the updater cannot apply

Files you changed that the update also changes are left out and recorded in
`.formflare/pending-updates.json`. Merging them is a judgement call, so FormFlare keeps
your version and leaves the decision to you.

Anything in that file is reported again on **every** later update until you deal with
it. To clear an entry: apply the change by hand, then delete the entry from
`.formflare/pending-updates.json`. The output includes the exact `git diff` command to
see what upstream changed.

Note that a file left unresolved will keep conflicting with later updates, since your
copy drifts further from upstream each release.

If you took option B, one more kind of file is skipped: **workflow files**. GitHub
refuses to let a workflow push changes to `.github/workflows/`, so those updates are
excluded rather than failing the whole run. To apply them automatically, create a
[fine-grained personal access token](https://github.com/settings/personal-access-tokens)
scoped to your FormFlare repository with **Contents: read and write**, **Pull requests:
read and write** and **Workflows: read and write**, then add it as a repository secret
named `UPDATE_PAT` (Settings → Secrets and variables → Actions). Running the script
locally has no such restriction.

### Is the rate limiting a hard guarantee?

No. The Workers rate-limiting binding is per-location and approximate — a speed bump
against brute force, not a strict quota. Add WAF rules if you need a firm limit.

## Documentation

- [Embedding](./docs/embedding.md) — HTML, fetch/JSON, and React on your own site
- [API](./docs/api.md)
- [Troubleshooting](./docs/troubleshooting.md)
- [Decisions](./docs/DECISIONS.md)

## License

[MIT](./LICENSE) — use it, modify it, host it, sell it. No obligations beyond keeping
the copyright notice.
