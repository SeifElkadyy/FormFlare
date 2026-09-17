# Formflare — agent rules

Guidance for AI coding agents working in this repository.

Source of truth: `FORMFLARE_PLAN.md`. Log every deviation in `docs/DECISIONS.md`
(date, what, why).

## Stack

- **Framework:** Next.js (App Router) + `@opennextjs/cloudflare`
- **Language:** TypeScript
- **Package manager:** npm
- **Styling:** Tailwind CSS
- **Data:** Cloudflare D1 + Drizzle · R2 (files) · Queues (jobs) · Email Sending
- **Tests:** Vitest + `@cloudflare/vitest-plugin`

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next dev server |
| `npm run preview` | Build with OpenNext and serve on workerd (real bindings) |
| `npm test` | Vitest against Miniflare bindings |
| `npm run typecheck` | `tsc` over the app **and** `tests` |
| `npm run lint` | ESLint |
| `npm run cf-typegen` | Regenerate `cloudflare-env.d.ts` — rerun after editing `wrangler.jsonc` |
| `npm run db:generate` | Generate a migration from `schema.ts` |
| `npm run db:migrate:local` | Apply migrations locally |

`legacy-peer-deps=true` is set in the committed `.npmrc` (npm 10 arborist bug — see
`docs/DECISIONS.md`), so plain `npm install` / `npm ci` works everywhere. Because that
flag suppresses real peer conflicts too, confirm resolved versions after adding a
dependency.

`cloudflare-env.d.ts` is **committed**. Rerun `npm run cf-typegen` after editing
`wrangler.jsonc` and commit the result, or CI fails on drift.

## Hard rules

- **Never require a secret to deploy.** Session keys are generated at `/setup` and stored
  in D1; Turnstile keys are per-form in the dashboard. Every uncommented line in
  `.dev.vars.example` becomes a required deploy prompt whose example value ships to
  production — keep them all commented.
- **Never add a self-referencing service binding**, and never hard-code the Worker name.
  The app must work under any name a deployer picks.
- **Never call `env.BUCKET` / `env.JOBS` / `env.EMAIL` outside `src/lib/platform/`.**
  Business logic goes through the `Storage` / `JobQueue` / `Mailer` interfaces so a
  Postgres/S3 build stays possible.
- **Access bindings via `getCloudflareContext()`** (wrapped in `src/lib/env.ts`), never
  `process.env`.
- **The public endpoint lives in `worker.ts` → `src/lib/submissions/handle.ts`**, not a
  Next.js route, so it keeps control of CORS, redirects and status codes.
- **Queue consumers ack/retry per message.** Never throw out of the batch loop.
- **PBKDF2 iterations are capped at 100,000** in production workerd. Local dev allows
  more and will silently hide an over-limit value until it 500s in production.
- **Never trust user input:** validate with zod, escape in emails and HTML, store hashed
  IPs only.
- **Migrations:** edit `schema.ts` → `npm run db:generate` → commit the SQL. Never edit a
  migration that has already been applied. Migrate by binding name (`DB`), never the
  database name — deployers can rename the database.
- **Migrations must be backward-compatible with the currently deployed code.** The
  deploy script runs `db:migrate:remote` *before* `wrangler deploy`, and the upload can
  fail (it does, intermittently, on this bundle) — leaving the new schema live under the
  old code. Workers Builds can also serve the old version while a rollout finishes. So:
  **additive only** — new tables, new nullable columns, new indexes. No renaming or
  dropping anything current code reads, and no adding a NOT NULL column without a
  default. Removing a column is a two-deploy operation: stop reading it, deploy, then
  drop it in a later migration.
- **Hand-written SQL goes through `npx drizzle-kit generate --custom --name <name>`,**
  never a manually created file. Drizzle numbers migrations from its own
  `meta/_journal.json`, which does not know about files you add yourself — it will happily
  reuse a number you already used. Wrangler applies migrations by **filename order**, so a
  collision silently runs them in the wrong order. `--custom` creates an empty, correctly
  numbered, journal-registered file for you to fill in.

## Conventions

- Keep the app at the repo root; the deploy button's monorepo support is limited.
- Product name lives in `src/lib/brand.ts`, `wrangler.jsonc` and `package.json` only.
- Keep the UI quiet and minimal; every empty state explains the next step.
- Before committing: `npm run lint && npm run typecheck && npm test`.

## Ask the human before

Choosing the license, renaming the project, adding a paid dependency, or changing any
design principle in Section 3 of the plan.
