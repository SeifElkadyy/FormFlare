# FormFlare — Build Plan & Agent Execution Guide

> **What this file is:** the complete product spec, architecture, reference config, and step-by-step execution plan for building **FormFlare**, an open-source, self-hosted form and waitlist backend that deploys to a user's own Cloudflare account with one **Deploy to Cloudflare** button.
>
> **Who it's for:** an AI coding agent and the project maintainer.
>
> **How to use it (agent):** read the whole file once. Then execute **Section 17 (Execution phases)** in order. Do not start a phase until the previous phase's acceptance criteria pass. When something in this file conflicts with current official docs, **the official docs win** — update this file and note the change in `docs/DECISIONS.md`.

> **Name:** "FormFlare" is a working name. Keep the name in one constant (`src/lib/brand.ts`) and in `wrangler.jsonc` / `package.json` so it can be renamed in one pass.

---

## Table of contents

1. Vision & pitch
2. How "Deploy to Cloudflare" actually works
3. Design principles
4. Scope: v1 / v2 / later
5. Architecture
6. Tech stack
7. Repository structure
8. Cloudflare configuration (`wrangler.jsonc`)
9. `package.json` scripts & deploy-button metadata
10. Worker entry point (`worker.ts`)
11. Data model (Drizzle / D1)
12. Public submission endpoint (the core)
13. Spam protection
14. Waitlist mode
15. Notifications, queue jobs & webhooks
16. Auth, first-run setup & dashboard
17. **Execution phases (agent task list)**
18. Testing strategy
19. Security checklist
20. README template
21. Launch checklist
22. Gotchas & troubleshooting
23. References

---

## 1. Vision & pitch

**One line:** Give any static site or landing page a backend in one click. Forms, waitlists, and spam protection, running free on your own Cloudflare account.

**Problem:** Every landing page needs a contact form or a waitlist. Developers either pay for Formspree/Tally/Viral Loops, hack a Google Sheet, or rebuild a backend each time.

**Solution:** A self-hosted app the user deploys into _their_ Cloudflare account. They create a form in a dashboard, get an endpoint, and point any HTML form at it:

```html
<form action="https://forms.example.com/f/abc123" method="POST">
  <input name="email" type="email" required />
  <button>Join the waitlist</button>
</form>
```

Submissions land in the dashboard, trigger email alerts and webhooks, and can be exported.

**Use cases:** contact forms, coming-soon/waitlist pages, newsletter signups, quote/lead requests, feedback widgets, job applications (with CV upload), event RSVPs, beta applications.

**Not for:** app authentication, payments, app business data, complex multi-step logic (v1).

**Why it can spread:**

- Replaces a paid SaaS.
- One-click deploy, near-zero cost.
- Data stays in the user's own account.
- Clear README with screenshot and cost breakdown.

---

## 2. How "Deploy to Cloudflare" actually works

This is the part that makes the project feel magical. It is mostly configuration, not code.

### 2.1 The button

Put this in the README (must be a **public** GitHub or GitLab repo):

```md
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/SeifElkadyy/FormFlare)
```

### 2.2 What Cloudflare does when a user clicks it

1. **Clones the repo** into the user's own GitHub/GitLab account, so they can keep developing and receive updates.
2. **Shows a setup page** where the user can change the repo name, Worker name, and resource names.
3. **Reads `wrangler.jsonc`** to see which resources the app needs, then **creates them automatically**. Supported resources include D1, R2, KV, Queues, Durable Objects, Workers AI, Hyperdrive, Vectorize, and Secrets Store secrets. It writes the new IDs back into the cloned repo's config.
4. **Reads `.dev.vars.example`** (or `.env.example`) and **prompts the user for every uncommented entry as a secret**.
5. **Reads `package.json`**:
   - `scripts.build` and `scripts.deploy` are pre-filled as the build and deploy commands. If no deploy script exists, it uses `npx wrangler deploy`.
   - `cloudflare.bindings.<NAME>.description` is shown as help text next to each binding/secret (supports inline markdown).
6. **Builds and deploys** with Workers Builds. Every later push to the production branch redeploys automatically.

The setup page's "Select D1 database → new", "Select R2 bucket → new" and "Select Queue → new" prompts, and any secret fields, are all generated from those three files.

### 2.3 Rules that make the button work

| Rule                                                                                                         | Why                                                                                                         |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Give every binding a **default name** (`database_name`, `bucket_name`, `queue`)                              | Cloudflare needs defaults to provision resources                                                            |
| Run D1 migrations inside the `deploy` script, referencing the **binding name** (`DB`), not the database name | Users may rename the database on the setup page                                                             |
| Keep the app in the **repo root**                                                                            | Monorepo/subdirectory support is limited                                                                    |
| Only list **truly required** secrets uncommented in `.dev.vars.example`                                      | Every uncommented line becomes a required, deployed secret, and example values can be shipped to production |
| Never put dev shortcuts (auth bypass, localhost URLs) in `.dev.vars.example`                                 | Deployers who accept defaults will ship them to production                                                  |
| Workers only (not Pages)                                                                                     | The button doesn't support Pages projects                                                                   |

---

## 3. Design principles

These come from real problems seen in one-click Cloudflare deployments. They are hard requirements.

1. **Zero required secrets.** FormFlare must deploy and work with no manual secret. Requiring a hand-created scoped API token is the step that loses most one-click deployers; FormFlare does not need the Cloudflare API at all, because it never edits DNS or routing.
   - Session signing key: generated at first-run setup and stored in D1 (`settings` table).
   - Turnstile keys: entered per form in the dashboard and stored in D1 (not env vars), which also avoids the `NEXT_PUBLIC_*` build-time variable problem.
2. **No hard dependency on the Worker name.** A deployer can rename the Worker on the setup page, so anything that hard-codes the name — a self-referencing service binding, or a name held in an env var — breaks the install. FormFlare must work under any Worker name. Do not add a service binding to itself.
3. **Setup wizard with health checks** at `/setup` that verifies each binding (DB, BUCKET, QUEUE, EMAIL optional) and shows clear fixes.
4. **First-run lock.** After the admin is created, `/setup` is disabled and **public sign-up is off by default**. A self-hosted instance that leaves "Create account" open lets a stranger who finds the URL join someone else's dashboard.
5. **Graceful degradation.** If Email Sending isn't enabled or the user is on the free plan, the app still works; the UI explains what's unavailable and why.
6. **Clear error messages** that name the fix. An error that says what to run or which setting to change is worth more than a correct-but-opaque one.
7. **Runtime vs build config documented.** Explain in the README which values are runtime secrets and which are build variables.

---

## 4. Scope

### v1 (launch, target 2–3 weeks)

**Collect**

- Projects → forms hierarchy.
- Public endpoint `POST /f/:formId` accepting `application/x-www-form-urlencoded`, `multipart/form-data`, and `application/json`.
- File uploads to R2 with per-form size/type limits.
- Per-form field validation (required, email, max length) configured in the dashboard.
- Redirect to a custom thank-you URL, or JSON response for `fetch` users.
- Allowed-origins list per form.

**Protect**

- Honeypot field, Turnstile (optional per form), rate limiting per IP, max body size, allowed origins.

**Waitlist mode**

- Toggle per form; duplicate-email detection; position number ("You're #214") returned in the response and shown on the default thank-you page.

**Notify**

- Email alert to the owner (Cloudflare Email Sending).
- Optional auto-reply to the submitter.
- Webhooks with HMAC signatures and retries via Queues.

**Dashboard**

- Inbox-style submission list: search, filter by form, read/unread, archive, spam, delete.
- Submission detail view with file download.
- CSV and JSON export.
- Copy-paste embed snippets (HTML, React, Next.js, fetch).
- Settings: account, forms, webhooks, API keys.

**Developer**

- REST API with API keys (read submissions, list forms).

**Ops**

- Deploy to Cloudflare button, `/setup` wizard, admin account, public sign-up disabled.

### v2

- Workers AI spam scoring.
- Double opt-in for waitlists; referral links and leaderboard; public counter badge (Durable Object or cached D1 count).
- Hosted form pages (`/p/:slug`) and an embeddable `<script>` widget.
- Slack / Discord / Telegram presets; n8n and Zapier templates.
- Per-form analytics (views, submissions, conversion) without cookies.
- Tags, notes, and a lead status pipeline.
- Scheduled D1 → R2 backups (Cron) and GDPR delete-by-email.
- TypeScript SDK and `<FormFlareForm />` React component on npm.
- Team members and roles; view-only client logins.

### Later

- Drag-and-drop form builder, conditional and multi-step forms.
- Invite batches for waitlists.
- Digest emails.
- A/B tests.
- Docker + Postgres/S3 version (keep adapters in mind from day one; see 6.2).
- CLI (`npx formflare create contact`).

---

## 5. Architecture

```
            ┌──────────────────────────┐
            │  Any website / landing   │
            │  <form action=".../f/x"> │
            └────────────┬─────────────┘
                         │ POST
            ┌────────────▼─────────────┐
            │   Worker (Next.js via    │
            │   OpenNext + worker.ts)  │
            │  validate → spam checks  │
            └──┬──────────┬─────────┬──┘
               │          │         │
        ┌──────▼───┐ ┌────▼────┐ ┌──▼──────────┐
        │ D1  (DB) │ │ R2      │ │ Queue       │
        │ forms,   │ │ uploads │ │ JOBS        │
        │ submiss. │ │         │ └──┬──────────┘
        └──────▲───┘ └─────────┘    │ consumer (same Worker)
               │                    ├──► Email Sending (EMAIL)
        ┌──────┴───────┐            └──► Webhooks (fetch + HMAC)
        │  Dashboard   │
        │  (Next.js)   │
        └──────────────┘
```

**Request flow for a submission**

1. Browser posts to `/f/:formId`.
2. Worker loads the form config from D1 (cache in memory per isolate for ~30s).
3. Checks: form exists and is active → origin allowed → body size → rate limit → honeypot → Turnstile (if enabled) → field validation.
4. Stores files to R2, inserts the submission into D1 (and assigns waitlist position if enabled).
5. Enqueues one `submission.created` job to `JOBS`.
6. Responds immediately: redirect (303) or JSON.
7. Queue consumer sends owner alert, auto-reply, and webhook deliveries, with retries.

**Why a Queue:** the visitor never waits for email or webhooks, and failures retry automatically.

---

## 6. Tech stack

### 6.1 Choices

| Layer              | Choice                                                                    | Notes                                  |
| ------------------ | ------------------------------------------------------------------------- | -------------------------------------- |
| Framework          | Next.js (App Router) + TypeScript                                         | Owner's core stack                     |
| Cloudflare adapter | `@opennextjs/cloudflare`                                                  | Runs Next.js on Workers                |
| Database           | Cloudflare D1 + Drizzle ORM (`drizzle-orm/d1`) + `drizzle-kit`            | Migrations in `drizzle/migrations`     |
| Files              | Cloudflare R2                                                             |                                        |
| Background jobs    | Cloudflare Queues                                                         | Producer + consumer in the same Worker |
| Email              | Cloudflare Email Sending (`send_email` binding)                           | Optional at runtime                    |
| Rate limiting      | Workers Rate Limiting binding                                             |                                        |
| Bot protection     | Cloudflare Turnstile (server-side verify)                                 | Keys stored in D1                      |
| UI                 | Tailwind CSS + shadcn/ui                                                  |                                        |
| Validation         | Zod                                                                       |                                        |
| Auth               | Custom: PBKDF2 (WebCrypto) password hashing + session cookie stored in D1 | No external auth service               |
| Tests              | Vitest 4.1.x (pinned) + `@cloudflare/vitest-plugin`                       | `cloudflareTest()` plugin; see note below |
| Lint               | ESLint + Prettier                                                         |                                        |

**Agent instruction:** install the latest stable versions at scaffold time and pin them. Set `compatibility_date` to the scaffold date. Check `@opennextjs/cloudflare` docs for the current setup command and config shape before writing files.

> **Verified 2026-09-17 (Phase 0).** Corrections to this section:
>
> - **Testing package renamed.** `@cloudflare/vitest-pool-workers` became
>   `@cloudflare/vitest-plugin` for Vitest 4. `defineWorkersConfig()` no longer exists;
>   use a `cloudflareTest()` plugin inside a normal `defineConfig({ plugins: [...] })`.
>   The plugin requires `vitest@^4.1.0` — plain `vitest` installs v5, which is
>   unsupported, so **pin Vitest to 4.1.x**. The config file must be `.mts` (the plugin
>   is ESM-only and the project is not `"type": "module"`).
> - **Next.js 16 is supported** from `@opennextjs/cloudflare@1.20.3`
>   (peer: `>=15.5.24 <16 || >=16.3.3`). Two caveats: Node middleware is now `proxy.ts`,
>   not `middleware.ts` (experimental, requires `nodejs_compat`), and the adapter stubs
>   the instrumentation hook because workerd cannot do dynamic requires.
> - **`compatibility_date` must not exceed the installed workerd's supported date**, or
>   local runs fail with `ERR_FUTURE_COMPATIBILITY_DATE`. Local and production use the
>   same date — no per-environment overrides.

### 6.2 Portability (for the future Docker version)

Keep all platform access behind small interfaces in `src/lib/platform/`:

```ts
export interface Storage {
  put(key: string, body: ReadableStream | ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream; contentType: string } | null>;
  delete(key: string): Promise<void>;
}
export interface JobQueue {
  send(job: Job, opts?: { delaySeconds?: number }): Promise<void>;
}
export interface Mailer {
  send(msg: MailMessage): Promise<{ ok: boolean; error?: string }>;
  readonly available: boolean;
}
```

v1 ships only the Cloudflare implementations. Business logic must never call `env.BUCKET`, `env.JOBS`, or `env.EMAIL` directly.

---

## 7. Repository structure

```
formflare/
├── .github/workflows/ci.yml          # lint, typecheck, tests
├── docs/
│   ├── DECISIONS.md                  # agent logs deviations from this plan
│   ├── deployment.md
│   ├── api.md
│   ├── embedding.md
│   └── troubleshooting.md
├── drizzle/migrations/               # generated SQL migrations
├── public/                           # icons, screenshot.png
├── src/
│   ├── app/
│   │   ├── (marketing)/page.tsx      # landing page for the instance
│   │   ├── setup/                    # first-run wizard
│   │   ├── login/
│   │   ├── (dashboard)/
│   │   │   ├── inbox/                # all submissions
│   │   │   ├── forms/                # list, create, [formId]/settings, embed
│   │   │   ├── projects/
│   │   │   ├── webhooks/
│   │   │   ├── api-keys/
│   │   │   └── settings/
│   │   ├── thanks/page.tsx           # default thank-you page (shows waitlist position)
│   │   └── api/
│   │       ├── v1/                   # public REST API (API key auth)
│   │       ├── setup/                # health checks, create admin
│   │       └── files/[id]/route.ts   # authenticated file download
│   ├── lib/
│   │   ├── brand.ts
│   │   ├── env.ts                    # typed access to bindings via getCloudflareContext()
│   │   ├── db/{client.ts,schema.ts}
│   │   ├── auth/{password.ts,session.ts,guard.ts}
│   │   ├── submissions/{parse.ts,validate.ts,handle.ts}
│   │   ├── spam/{honeypot.ts,turnstile.ts,ratelimit.ts,origin.ts}
│   │   ├── waitlist/position.ts
│   │   ├── jobs/{types.ts,consumer.ts}
│   │   ├── notify/{email.ts,templates.ts}
│   │   ├── webhooks/{sign.ts,deliver.ts}
│   │   ├── platform/{storage.ts,queue.ts,mailer.ts}
│   │   └── ids.ts                    # short public IDs
│   └── components/
├── tests/
├── .dev.vars.example
├── CLAUDE.md                         # agent rules for this repo
├── LICENSE                           # AGPL-3.0 or MIT (decide before launch)
├── README.md
├── cloudflare-env.d.ts               # generated by `wrangler types`
├── drizzle.config.ts
├── next.config.ts
├── open-next.config.ts
├── package.json
├── worker.ts                         # custom Worker entry (fetch + queue + scheduled)
└── wrangler.jsonc
```

---

## 8. Cloudflare configuration (`wrangler.jsonc`)

Reference config. Verify every key against current Wrangler docs at build time.

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "formflare",
  "main": "./worker.ts",
  "compatibility_date": "2026-09-16", // scaffold date, capped at installed workerd's max
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "keep_vars": true, // don't wipe dashboard-set vars on deploy

  "assets": {
    "binding": "ASSETS",
    "directory": ".open-next/assets",
  },

  "observability": { "enabled": true },
  "upload_source_maps": true,

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "formflare",
      "migrations_dir": "drizzle/migrations",
    },
  ],

  "r2_buckets": [{ "binding": "BUCKET", "bucket_name": "formflare-uploads" }],

  "queues": {
    "producers": [{ "binding": "JOBS", "queue": "formflare-jobs" }],
    "consumers": [
      {
        "queue": "formflare-jobs",
        "max_batch_size": 10,
        "max_retries": 5,
      },
    ],
  },

  "send_email": [{ "name": "EMAIL" }],

  "ratelimits": [
    {
      "name": "SUBMIT_RATE_LIMIT",
      "namespace_id": "2001",
      "simple": { "limit": 10, "period": 60 },
    },
    {
      "name": "LOGIN_RATE_LIMIT",
      "namespace_id": "2002",
      "simple": { "limit": 10, "period": 60 },
    },
  ],

  "vars": {
    "APP_NAME": "FormFlare",
  },

  "triggers": { "crons": ["0 3 * * *"] }, // daily cleanup (expired sessions, old rate data); backups in v2

  // v2: "ai": { "binding": "AI" }
  // v2: durable_objects for live counters
}
```

Notes:

- ~~Check whether the `send_email` entry needs a `"remote"` field.~~
  **Verified 2026-09-17: there is no documented `remote` field.** The `send_email` schema is
  `name`, `destination_address`, `allowed_destination_addresses` only. Omit it.
- No `database_id` is needed in the source repo for the button flow; Cloudflare provisions and writes it. For local development, `wrangler d1 migrations apply DB --local` works without an ID. If Wrangler complains, follow its current guidance and record it in `docs/DECISIONS.md`.
- No `services` self-binding (see principle 2).

---

## 9. `package.json` scripts & deploy-button metadata

```jsonc
{
  "name": "formflare",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "deploy": "opennextjs-cloudflare build && npm run db:migrate:remote && wrangler deploy",
    "upload": "opennextjs-cloudflare build && wrangler versions upload",
    "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
    "cf-typegen": "wrangler types --env-interface CloudflareEnv ./cloudflare-env.d.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate:local": "wrangler d1 migrations apply DB --local",
    "db:migrate:remote": "wrangler d1 migrations apply DB --remote",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
  },
  "cloudflare": {
    "bindings": {
      "DB": {
        "description": "D1 database for forms, submissions, and users. Leave as **new** to create it automatically.",
      },
      "BUCKET": {
        "description": "R2 bucket for uploaded files. Leave as **new**.",
      },
      "JOBS": {
        "description": "Queue for sending emails and webhooks in the background. Leave as **new**.",
      },
      "EMAIL": {
        "description": "Cloudflare Email Sending. Optional: owner alerts and auto-replies need Email Sending enabled, and sending to arbitrary recipients needs the **Workers Paid** plan. The app works without it.",
      },
    },
  },
}
```

### `.dev.vars.example`

Every uncommented line becomes a **required** deploy prompt. FormFlare needs none, so everything is commented:

```ini
# FormFlare needs no secrets to deploy.
# Session keys are generated during /setup and stored in D1.
# Turnstile keys are configured per form in the dashboard.
#
# Optional (local development only — never set in production):
# FORMFLARE_DEV_SEED=1
```

> Agent: verify how the deploy button treats a file with only comments. If it still prompts, delete the file and document local dev vars in `docs/deployment.md` instead.

---

## 10. Worker entry point (`worker.ts`)

One Worker handles HTTP, queue messages, and cron:

```ts
// @ts-ignore — generated at build time by OpenNext
import { default as nextHandler } from "./.open-next/worker.js";
import { consumeJobs } from "./src/lib/jobs/consumer";
import { runDailyMaintenance } from "./src/lib/jobs/maintenance";
import { handleSubmission } from "./src/lib/submissions/handle";

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Hot path: public submissions bypass Next.js for speed and full control of CORS/redirects.
    if (url.pathname.startsWith("/f/")) {
      return handleSubmission(request, env, ctx);
    }

    return nextHandler.fetch(request, env, ctx);
  },

  async queue(batch: MessageBatch, env: CloudflareEnv) {
    await consumeJobs(batch, env); // ack/retry per message
  },

  async scheduled(_event: ScheduledController, env: CloudflareEnv, ctx: ExecutionContext) {
    ctx.waitUntil(runDailyMaintenance(env));
  },
};
```

Inside Next.js route handlers and server components, access bindings through `getCloudflareContext()` from `@opennextjs/cloudflare`, wrapped in `src/lib/env.ts`.

---

## 11. Data model (Drizzle / D1)

IDs: internal `id` = UUID/ULID text. Public form IDs = short random strings (10 chars, URL-safe) in `forms.public_id`. Timestamps = integer milliseconds.

```ts
// src/lib/db/schema.ts (sketch — agent completes types, indexes, and relations)
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(), // e.g. "session_secret", "setup_completed", "signup_enabled", "notify_from"
  value: text("value").notNull(),
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(), // pbkdf2$iterations$salt$hash
    role: text("role", { enum: ["owner", "admin", "viewer"] })
      .notNull()
      .default("owner"),
    disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), // store SHA-256 of the token, not the token
  userId: text("user_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const forms = sqliteTable(
  "forms",
  {
    id: text("id").primaryKey(),
    publicId: text("public_id").notNull(),
    projectId: text("project_id").notNull(),
    name: text("name").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    mode: text("mode", { enum: ["standard", "waitlist"] })
      .notNull()
      .default("standard"),
    fieldsJson: text("fields_json").notNull().default("[]"), // [{name,type,required,maxLength}]
    allowedOriginsJson: text("allowed_origins_json").notNull().default("[]"),
    redirectUrl: text("redirect_url"),
    honeypotField: text("honeypot_field").notNull().default("_gotcha"),
    turnstileSiteKey: text("turnstile_site_key"),
    turnstileSecret: text("turnstile_secret"), // encrypted at rest (see 19)
    notifyEmailsJson: text("notify_emails_json").notNull().default("[]"),
    autoReplyEnabled: integer("auto_reply_enabled", { mode: "boolean" }).notNull().default(false),
    autoReplySubject: text("auto_reply_subject"),
    autoReplyBody: text("auto_reply_body"),
    fileMaxBytes: integer("file_max_bytes")
      .notNull()
      .default(5 * 1024 * 1024),
    fileTypesJson: text("file_types_json")
      .notNull()
      .default('["application/pdf","image/png","image/jpeg"]'),
    submissionCount: integer("submission_count").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("forms_public_id_uq").on(t.publicId)],
);

export const submissions = sqliteTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    formId: text("form_id").notNull(),
    dataJson: text("data_json").notNull(),
    email: text("email"), // extracted when a field named/typed email exists
    status: text("status", { enum: ["new", "read", "archived", "spam"] })
      .notNull()
      .default("new"),
    waitlistPosition: integer("waitlist_position"),
    ipHash: text("ip_hash"), // SHA-256(ip + session_secret), never raw IP
    country: text("country"), // from request.cf
    userAgent: text("user_agent"),
    referrer: text("referrer"),
    spamReason: text("spam_reason"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("submissions_form_created_idx").on(t.formId, t.createdAt),
    index("submissions_status_idx").on(t.status),
    // waitlist dedupe: unique (form_id, email) enforced in code + partial unique index via raw SQL migration
  ],
);

export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id").notNull(),
  fieldName: text("field_name").notNull(),
  r2Key: text("r2_key").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const webhooks = sqliteTable("webhooks", {
  id: text("id").primaryKey(),
  formId: text("form_id"), // null = all forms
  url: text("url").notNull(),
  secret: text("secret").notNull(), // for HMAC signing
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
});

export const webhookDeliveries = sqliteTable("webhook_deliveries", {
  id: text("id").primaryKey(),
  webhookId: text("webhook_id").notNull(),
  submissionId: text("submission_id").notNull(),
  status: text("status", { enum: ["pending", "success", "failed"] }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastStatusCode: integer("last_status_code"),
  lastError: text("last_error"),
  updatedAt: integer("updated_at").notNull(),
});

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(), // first 8 chars shown in UI
  keyHash: text("key_hash").notNull(), // SHA-256 of full key
  lastUsedAt: integer("last_used_at"),
  createdAt: integer("created_at").notNull(),
});

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  action: text("action").notNull(), // "form.create", "submission.export", "login.failed", ...
  metadataJson: text("metadata_json"),
  createdAt: integer("created_at").notNull(),
});
```

**Waitlist position:** assign inside a D1 `batch()` that increments `forms.submission_count` and inserts the submission with the new value, so concurrent signups get unique positions. Verify D1 batch semantics (batches run as a single transaction) in current docs.

---

## 12. Public submission endpoint (the core)

### 12.1 Contract

`POST /f/:publicId`

**Accepted content types:** `application/x-www-form-urlencoded`, `multipart/form-data`, `application/json`.

**Reserved fields** (stripped from stored data):

- `_gotcha` (honeypot, name configurable)
- `cf-turnstile-response` (Turnstile token)
- `_redirect` (ignored unless it matches an allowed origin, to prevent open redirects)

**Response rules:**

- If `Accept` includes `application/json` or the body was JSON → JSON response.
- Otherwise → `303 See Other` to `form.redirectUrl`, or to the built-in `/thanks?form=...&pos=...` page.

**JSON success:**

```json
{ "ok": true, "id": "sub_01H...", "waitlist": { "position": 214 } }
```

**JSON errors** (always `ok: false`, stable `code`):

| HTTP | code                     | When                                                                                                                                |
| ---- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 404  | `form_not_found`         | Unknown or inactive form                                                                                                            |
| 403  | `origin_not_allowed`     | Origin not in allow-list                                                                                                            |
| 413  | `payload_too_large`      | Body or file too big                                                                                                                |
| 415  | `unsupported_media_type` | Unsupported content type                                                                                                            |
| 422  | `validation_failed`      | Include `fields: { name: "message" }`                                                                                               |
| 422  | `captcha_failed`         | Turnstile failed                                                                                                                    |
| 429  | `rate_limited`           | Rate limit hit                                                                                                                      |
| 200  | —                        | Waitlist duplicate: **not an error**. Return `ok: true` with the existing position and `"duplicate": true`. Do not create a new row |

**Honeypot hit:** return a normal success response (don't tell bots), store nothing (or store as spam if "keep spam" is on).

### 12.2 CORS

- Handle `OPTIONS` preflight on `/f/*`.
- If the form has allowed origins, echo the matching `Origin`; otherwise allow `*` for JSON requests (no credentials ever).
- Allowed methods: `POST, OPTIONS`. Allowed headers: `Content-Type, Accept`.

### 12.3 Handler outline

```ts
export async function handleSubmission(req: Request, env: CloudflareEnv, ctx: ExecutionContext) {
  if (req.method === "OPTIONS") return preflight(req, env);
  if (req.method !== "POST") return json({ ok: false, code: "method_not_allowed" }, 405);

  const form = await loadForm(env, publicIdFrom(req)); // cached ~30s
  if (!form?.active) return reply(req, 404, "form_not_found");

  if (!originAllowed(req, form)) return reply(req, 403, "origin_not_allowed");
  if (tooLarge(req, form)) return reply(req, 413, "payload_too_large");

  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const { success } = await env.SUBMIT_RATE_LIMIT.limit({ key: `${form.id}:${ip}` });
  if (!success) return reply(req, 429, "rate_limited");

  const parsed = await parseBody(req); // fields + File objects
  if (isHoneypotHit(parsed, form)) return fakeSuccess(req, form);
  if (form.turnstileSecret && !(await verifyTurnstile(parsed, ip, form)))
    return reply(req, 422, "captcha_failed");

  const result = validate(parsed, form); // zod schema built from fieldsJson
  if (!result.ok) return reply(req, 422, "validation_failed", { fields: result.errors });

  const submission = await saveSubmission(env, form, result.data, parsed.files, req); // R2 + D1 batch
  ctx.waitUntil(jobs(env).send({ type: "submission.created", submissionId: submission.id }));

  return success(req, form, submission);
}
```

---

## 13. Spam protection

Order of checks (cheapest first): active form → origin → size → rate limit → honeypot → Turnstile → validation.

| Layer                    | v1  | Detail                                                                                                                     |
| ------------------------ | --- | -------------------------------------------------------------------------------------------------------------------------- |
| Honeypot                 | ✅  | Hidden field; any value = bot                                                                                              |
| Rate limit               | ✅  | `SUBMIT_RATE_LIMIT` keyed by `formId:ip`                                                                                   |
| Allowed origins          | ✅  | Compare `Origin` header (and `Referer` fallback)                                                                           |
| Turnstile                | ✅  | Server-side verify: `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` with `secret`, `response`, `remoteip` |
| Size limits              | ✅  | Reject by `Content-Length` early; re-check while parsing                                                                   |
| Minimum fill time        | v2  | Signed timestamp field; reject if submitted in < 2s                                                                        |
| Keyword/domain blocklist | v2  | Mark as spam                                                                                                               |
| Workers AI scoring       | v2  | Classify message text; mark as spam above threshold, never hard-drop                                                       |

Spam-marked submissions go to a Spam folder and never trigger notifications or webhooks.

---

## 14. Waitlist mode

- Form setting `mode = "waitlist"` requires an email field.
- Normalize email (trim, lowercase) before dedupe.
- New signup → position = next counter value (atomic, see 11).
- Duplicate → return the existing position (default) without creating a new row.
- `/thanks` page shows "You're #214 on the list" when `pos` is present.
- Dashboard: waitlist view sorted by position, with total count and CSV export.
- v2: double opt-in (`pending` status until confirmed via signed link), referral codes (`?ref=`), each referral moves the referrer up N places, public count badge endpoint `GET /f/:publicId/count` (cached).

---

## 15. Notifications, queue jobs & webhooks

### 15.1 Job types

```ts
type Job =
  | { type: "submission.created"; submissionId: string }
  | { type: "webhook.deliver"; deliveryId: string }
  | {
      type: "email.send";
      to: string;
      subject: string;
      html: string;
      text: string;
      replyTo?: string;
    };
```

`submission.created` fans out: one `email.send` per owner recipient, one optional auto-reply, and one `webhook.deliver` per active webhook.

### 15.2 Consumer rules

- Process messages one by one; call `msg.ack()` on success and `msg.retry({ delaySeconds })` on failure with exponential backoff (e.g. 10s, 60s, 5m, 30m).
- Record attempts in `webhook_deliveries`.
- Never let one failing message fail the whole batch.

### 15.3 Email

- Uses the `EMAIL` binding. Check the current Email Sending API for the exact field shape (html/text) before implementing.
- `from` address is configured in Settings (must be on a domain onboarded to Email Sending).
- **Availability detection:** if `env.EMAIL` is missing or a test send fails, show a banner: "Email alerts are off. Enable Cloudflare Email Sending for your domain (Workers Paid plan needed to email arbitrary recipients)."
- Note for the UI: sending to **verified destination addresses** in the user's own Cloudflare account is free on all plans, so owner alerts to a verified address can work even on the free plan. Auto-replies to submitters need the Paid plan.
- Escape all user content in templates. Set `Reply-To` on owner alerts to the submitter's email so the owner can reply directly.

### 15.4 Webhooks

- `POST` JSON to the webhook URL:

```json
{
  "event": "submission.created",
  "form": { "id": "abc123", "name": "Contact" },
  "submission": {
    "id": "sub_...",
    "createdAt": 1789600000000,
    "data": { "email": "a@b.com", "message": "Hi" },
    "files": []
  }
}
```

- Headers: `Content-Type: application/json`, `X-FormFlare-Event`, `X-FormFlare-Delivery`, `X-FormFlare-Timestamp`, `X-FormFlare-Signature: sha256=<hex HMAC of "timestamp.body">`.
- Timeout 10s. Success = 2xx. Retry otherwise.
- Block private/internal targets (the `global_fetch_strictly_public` flag helps; also validate the URL scheme is `https:`).
- Document signature verification in `docs/api.md` with a Node example.

---

## 16. Auth, first-run setup & dashboard

### 16.1 Setup wizard (`/setup`)

Available only while `settings.setup_completed` is not set.

1. **System check** — verifies:
   - `DB` reachable and migrations applied (query a known table).
   - `BUCKET` writable (put + delete a test object).
   - `JOBS` present.
   - `EMAIL` present (optional, warning only).
   - Show each as ✅ / ⚠️ / ❌ with a specific fix.
2. **Create owner account** — email + password (min 12 chars). Generate `session_secret` (32 random bytes, base64) and store it. Set `signup_enabled = false`.
3. **Create first project and form** — prefilled "My website → Contact", then show the embed snippet.
4. Mark `setup_completed = true`. `/setup` now returns 404.

Protect the setup POST against races: create the owner inside a transaction that fails if any user already exists.

### 16.2 Auth

- Passwords: PBKDF2-SHA-256 via WebCrypto with a random 16-byte salt.
  **Hard-code iterations to exactly `100_000`** as a named constant. Do not detect the
  maximum at runtime.

  > **Verified 2026-09-17.** Production workerd caps PBKDF2 at 100,000 per
  > `deriveBits()` call and throws
  > `NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported`.
  > The cap exists because workerd's CPU limiter cannot interrupt BoringSSL
  > mid-derivation.
  >
  > ⚠️ **Miniflare, `wrangler dev` and Node all accept higher counts.** An over-limit
  > value therefore passes every local test and only fails once deployed. This is the
  > single most likely way to ship a broken login.
  >
  > 100,000 is below OWASP's 2023 guidance (600,000 for PBKDF2-SHA-256). It is a
  > platform ceiling, not a choice; revisit if workerd raises it.
- Sessions: random 32-byte token in an `HttpOnly; Secure; SameSite=Lax` cookie; store its SHA-256 in `sessions`; 30-day expiry; rotate on login.
- `LOGIN_RATE_LIMIT` per IP + email. Log failed logins in `audit_log`.
- CSRF: same-site cookies plus an origin check on all dashboard mutations.
- API keys: `ff_live_<random>`; show once; store SHA-256; send as `Authorization: Bearer`.

### 16.3 Dashboard pages

| Page          | Contents                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Inbox         | All submissions, filters (form, status, date), search, bulk actions, unread count                                                 |
| Submission    | Fields, files (download via authenticated route), metadata (country, referrer), mark spam/archive, delete                         |
| Forms         | List with counts; create form                                                                                                     |
| Form settings | Name, mode, fields, allowed origins, redirect, honeypot name, Turnstile keys, notifications, auto-reply, file limits, danger zone |
| Embed         | Tabs: HTML, React, Next.js, fetch/JSON, with the form's real endpoint filled in                                                   |
| Waitlist      | Position-sorted list and count (waitlist forms only)                                                                              |
| Webhooks      | Add, test-send, delivery log                                                                                                      |
| API keys      | Create, revoke                                                                                                                    |
| Settings      | Account, password, notification sender address, email status, instance info, export all data                                      |

UX: clean and quiet. Empty states explain the next step. Every settings page has a "What's this?" hint.

### 16.4 Embed snippets (generated)

**HTML**

```html
<form action="https://YOUR_HOST/f/FORM_ID" method="POST" enctype="multipart/form-data">
  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off" />
  <input name="name" required />
  <input name="email" type="email" required />
  <textarea name="message" required></textarea>
  <button type="submit">Send</button>
</form>
```

**fetch**

```js
const res = await fetch("https://YOUR_HOST/f/FORM_ID", {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({ email, message }),
});
const data = await res.json();
```

**With Turnstile:** include the Turnstile script and widget with the form's site key; the widget adds `cf-turnstile-response` automatically.

---

## 17. Execution phases (agent task list)

Rules for the agent:

- Work phase by phase. Commit at the end of each phase with a clear message.
- Run `npm run lint && npm run typecheck && npm test` before each commit.
- Log every deviation from this plan in `docs/DECISIONS.md` (date, what, why).
- Ask the human before: choosing the license, renaming the project, adding a paid dependency, or changing a design principle in Section 3.

### Phase 0 — Research & scaffold

Tasks

1. Read current docs: Deploy to Cloudflare buttons, OpenNext for Cloudflare, D1 + Drizzle, Queues, Rate Limiting binding, Email Sending, Turnstile server-side validation (links in Section 23).
2. Scaffold Next.js (App Router, TypeScript, Tailwind) with `@opennextjs/cloudflare` using the officially recommended command.
3. Add `wrangler.jsonc` from Section 8, `worker.ts` from Section 10, scripts from Section 9.
4. Add Drizzle, `drizzle.config.ts`, empty schema, shadcn/ui, ESLint, Prettier, Vitest.
5. Create `CLAUDE.md` (see below), `docs/DECISIONS.md`, and a CI workflow.

Acceptance

- `npm run preview` serves a placeholder page locally.
- `npm run cf-typegen` produces `CloudflareEnv` with `DB`, `BUCKET`, `JOBS`, `EMAIL`, rate limiters.
- CI passes.

### Phase 1 — Data layer

Tasks

1. Implement the schema from Section 11 with indexes; generate the first migration.
2. Add the partial unique index for waitlist dedupe via a raw SQL migration.
3. `src/lib/db/client.ts` returning a Drizzle client from `env.DB`.
4. Platform adapters (`storage`, `queue`, `mailer`) from Section 6.2.
5. ID helpers (ULID + short public IDs).

Acceptance

- `npm run db:migrate:local` succeeds.
- Unit tests for adapters and ID helpers pass.

### Phase 2 — Setup & auth

Tasks

1. `/setup` wizard with system checks (16.1).
2. Password hashing, sessions, login/logout, route guard for `(dashboard)`.
3. Login rate limiting and audit logging.
4. Public sign-up disabled; `/setup` returns 404 after completion.

Acceptance

- Fresh local DB → `/setup` → owner created → redirected to dashboard.
- Second visit to `/setup` → 404.
- Wrong password 11 times in a minute → rate limited.
- Tests cover hashing, session expiry, and the setup race.

### Phase 3 — Forms & submission endpoint

Tasks

1. Projects and forms CRUD in the dashboard.
2. `handleSubmission` exactly per Section 12, including CORS, all content types, redirects vs JSON, and error codes.
3. File uploads to R2 with limits; authenticated download route.
4. Honeypot, rate limit, origin checks, Turnstile verification (Section 13).
5. Waitlist positions and dedupe (Section 14); `/thanks` page.

Acceptance

- A plain HTML page served from another port can submit and is redirected to `/thanks`.
- `fetch` JSON submission returns `{ ok: true, id }`.
- Honeypot submissions return success but are not stored.
- 20 concurrent waitlist signups get 20 unique, consecutive positions.
- Duplicate email returns the original position.
- Integration tests cover every error code in 12.1.

### Phase 4 — Jobs, email & webhooks

Tasks

1. Job types and consumer with ack/retry/backoff (15.1, 15.2).
2. Owner alert and auto-reply templates; email availability detection and dashboard banner.
3. Webhooks CRUD, HMAC signing, delivery log, "send test" button.
4. Daily cron: delete expired sessions, prune old delivery logs.

Acceptance

- Submission creates exactly one `submission.created` job.
- Webhook receives a correctly signed payload (test verifies signature).
- A failing webhook is retried with backoff and marked `failed` after max attempts.
- With no `EMAIL` binding, submissions still succeed and the banner shows.

### Phase 5 — Dashboard UX & API

Tasks

1. Inbox, submission detail, bulk actions, search, filters.
2. Embed page with generated snippets (16.4).
3. CSV/JSON export (stream large exports).
4. API keys and `GET /api/v1/forms`, `GET /api/v1/forms/:id/submissions?cursor=` (cursor pagination), `GET /api/v1/submissions/:id`.
5. Empty states, loading states, responsive layout, dark mode.

Acceptance

- A non-technical user can create a form, copy a snippet, submit, and see the submission without reading docs.
- API returns 401 without a key and paginates correctly.
- Lighthouse accessibility score ≥ 90 on dashboard pages.

### Phase 6 — Deploy button & docs

Tasks

1. Push to a **public** GitHub repo.
2. Add the Deploy to Cloudflare button to the README (Section 20).
3. Test the full button flow on a **clean Cloudflare account** (or a second account): resources are auto-created, migrations run, `/setup` works.
4. Test renaming the Worker, database, and bucket on the deploy page → app still works.
5. Write `docs/deployment.md`, `docs/embedding.md`, `docs/api.md`, `docs/troubleshooting.md`.
6. Add screenshot, cost section, and FAQ.
7. **Confirm the deploy button never sees the dev config.** `wrangler.dev.jsonc` holds
   account-specific IDs (`database_id`) and `formflare-dev` resource names. Cloudflare
   reads `wrangler.jsonc` only, so it should be ignored — verify on the clean-account
   run that:
   - the setup page offers to create **new** D1/R2/Queue resources (not this account's),
   - nothing named `formflare-dev` appears anywhere in the flow,
   - `wrangler.jsonc` still contains no `database_id` or account id.
   If the button does pick it up, move the file out of the repo root or gitignore it and
   document local setup in `docs/deployment.md` instead.
8. **Send a real email alert from the deployed instance.** Email cannot be exercised
   locally — tests use a fake mailer — so confirm on a real deploy that an owner alert
   arrives, the `Reply-To` is the submitter, and the body renders. Also confirm the
   "email unavailable" banner appears when the binding is absent.

Acceptance

- Someone who has never used Cloudflare Workers can go from button click to a working form in under 10 minutes following the README only.
- No manual secret or API token is required.

### Phase 7 — Hardening & release

Tasks

1. Walk through the Security checklist (Section 19) and fix gaps.
2. Load test the endpoint (e.g. 50 req/s for 1 minute locally/preview) and check D1 write behavior.
3. Tag `v0.1.0`, write the changelog, prepare launch posts (Section 21).

Acceptance

- All checklist items checked or explicitly deferred in `docs/DECISIONS.md`.

### `CLAUDE.md` (create in the repo root)

```md
# FormFlare — agent rules

- Source of truth: FORMFLARE_PLAN.md. Log deviations in docs/DECISIONS.md.
- Stack: Next.js App Router + @opennextjs/cloudflare, D1 + Drizzle, R2, Queues, Email Sending.
- Never call env.BUCKET / env.JOBS / env.EMAIL outside src/lib/platform/.
- Never require a secret to deploy. Never add a self-referencing service binding.
- Never trust user input: validate with zod, escape in emails/HTML.
- Public endpoint lives in worker.ts → src/lib/submissions/handle.ts (not a Next.js route).
- Before committing: npm run lint && npm run typecheck && npm test.
- Migrations: edit schema.ts → npm run db:generate → commit SQL. Never edit applied migrations.
- Keep UI quiet and minimal; every empty state explains the next step.
```

---

## 18. Testing strategy

- **Unit (Vitest):** validation builder, honeypot, origin matching, HMAC signing, password hashing, ID generation, email templates (escaping).
- **Integration (`@cloudflare/vitest-plugin`):** real D1/R2/Queue bindings in Miniflare; submission handler end to end; waitlist concurrency; queue retry behavior.
- **E2E (optional, Playwright):** setup wizard → create form → submit from a static page → see in inbox.
- **Manual deploy test:** Phase 6 steps on a clean account before every release.

---

## 19. Security checklist

- [ ] `/setup` locked after first run; owner creation is race-safe.
- [ ] Public sign-up disabled by default.
- [ ] Passwords hashed (PBKDF2-SHA-256, exactly 100,000 iterations, unique 16-byte salt).
- [ ] Session tokens hashed at rest; `HttpOnly`, `Secure`, `SameSite=Lax`.
- [ ] CSRF: origin check on all dashboard mutations.
- [ ] Rate limits on submissions and logins.
- [ ] No raw IPs stored (salted hash only).
- [ ] Turnstile secrets and webhook secrets encrypted at rest with AES-GCM using a key derived from `session_secret`.
- [ ] Files: served only through the authenticated route with `Content-Disposition: attachment`; content type allow-list; size limits.
- [ ] No open redirects (`_redirect` only to allowed origins).
- [ ] Webhooks: `https:` only, public targets only, signed, timeout.
- [ ] All user content escaped in dashboard and emails.
- [ ] Waitlist duplicates don't reveal whether an email exists beyond what the owner enables.
- [ ] Security headers on dashboard pages (CSP, `X-Frame-Options: DENY`, `Referrer-Policy`).
- [ ] `.dev.vars.example` contains no dev bypasses.
- [ ] GDPR: delete-by-email (v2) and full data export.

---

## 20. README template

```md
# FormFlare

Forms and waitlists for any website — self-hosted on your own Cloudflare account.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/SeifElkadyy/FormFlare)

![FormFlare dashboard](./public/screenshot.png)

## What you can do

- Add a backend to any HTML form with one line
- Collect waitlist signups with automatic positions ("You're #214")
- Block spam with honeypots, rate limits, and Cloudflare Turnstile
- Get email alerts and send auto-replies
- Send submissions to n8n, Slack, or any URL with signed webhooks
- Store file uploads, search, and export to CSV
- Keep all data in your own D1 database and R2 bucket

## How it works

FormFlare runs as a single Worker in your Cloudflare account. Submissions are saved to D1,
files to R2, and emails/webhooks are sent in the background through Cloudflare Queues.

## Deploy (3 steps)

1. Click **Deploy to Cloudflare** and leave the resources set to **new**.
2. Open your app URL and follow `/setup` to create your admin account.
3. Create a form and paste the snippet into your site.

No API tokens or secrets needed.

## Cost

- Free Workers plan: forms, waitlists, storage, and webhooks.
- Email alerts to arbitrary recipients and auto-replies need Cloudflare Email Sending on the Workers Paid plan ($5/month).

## Use it in your site

<HTML and fetch examples>

## Docs

- Deployment · Embedding · API · Troubleshooting

## Local development

cp .dev.vars.example .dev.vars
npm install
npm run db:migrate:local
npm run dev

## License

<license>
```

> Agent: re-check pricing statements against Cloudflare's current pricing pages before release.

---

## 21. Launch checklist

- [ ] Name, domain, GitHub, npm, and X handle checked and secured.
- [ ] Public repo with README, screenshot, license, and topics (`cloudflare`, `cloudflare-workers`, `forms`, `waitlist`, `self-hosted`).
- [ ] Demo instance and a demo landing page using it.
- [ ] 30–60s demo video/GIF: click deploy → setup → paste snippet → submission appears.
- [ ] Build-in-public thread on X; posts on r/selfhosted, r/CloudFlare, Hacker News (Show HN), dev.to.
- [ ] Used on the maintainer's own sites as real proof.
- [ ] Sponsor/"support" section.
- [ ] Issue templates and a roadmap in GitHub Projects.

---

## 22. Gotchas & troubleshooting

| Symptom                                                    | Cause                                                                                          | Fix                                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| App works locally but bindings are undefined in production | Accessing `process.env` instead of Cloudflare bindings                                         | Use `getCloudflareContext().env` via `src/lib/env.ts`                        |
| Migrations fail during deploy                              | Migration command uses database name                                                           | Use binding name: `wrangler d1 migrations apply DB --remote`                 |
| Updated a secret but app still uses the old one            | No new deployment; or a build-time variable with the same name overwrites it                   | Redeploy; keep runtime secrets out of build variables; avoid duplicate names |
| `NEXT_PUBLIC_*` value missing                              | These are inlined at build time, not runtime                                                   | Avoid them for per-instance config; store in D1 and pass from the server     |
| Deploy button asks for unexpected secrets                  | Uncommented lines in `.dev.vars.example`                                                       | Comment them out or remove the file                                          |
| App breaks after renaming the Worker                       | Code or config references the Worker name                                                      | Never hard-code the name (principle 2)                                       |
| workers.dev URL shows nothing                              | workers.dev route disabled                                                                     | Enable it in Worker → Domains, or add a custom domain                        |
| Emails not sending                                         | Email Sending not enabled, domain not onboarded, or free plan sending to unverified recipients | Show the email status banner with these exact steps                          |
| Queue messages retried forever                             | Throwing inside the batch loop                                                                 | Ack/retry per message; cap retries                                           |
| GitHub build won't start                                   | Cloudflare GitHub app authorization expired                                                    | Reinstall the Cloudflare GitHub app                                          |

---

## 23. References

**Cloudflare**

- Deploy to Cloudflare buttons: https://developers.cloudflare.com/workers/platform/deploy-buttons/
- Workers docs index (LLM-friendly): https://developers.cloudflare.com/workers/llms.txt
- All Cloudflare docs (LLM-friendly): https://developers.cloudflare.com/llms.txt
- OpenNext for Cloudflare: https://opennext.js.org/cloudflare
- D1: https://developers.cloudflare.com/d1/
- R2: https://developers.cloudflare.com/r2/
- Queues: https://developers.cloudflare.com/queues/
- Rate limiting binding: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Email Service (sending + routing): https://developers.cloudflare.com/email-service/
- Email Service pricing: https://developers.cloudflare.com/email-service/platform/pricing/
- Turnstile server-side validation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Workers secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/

**Tools**

- Drizzle ORM with D1: https://orm.drizzle.team/docs/connect-cloudflare-d1
- Vitest pool for Workers: https://developers.cloudflare.com/workers/testing/vitest-integration/

**Known pitfalls**

- Uncommented `.dev.vars.example` entries become required deployed secrets:
  https://github.com/cloudflare/workers-sdk/discussions/14639

> Agent: some reference URLs may move. If a link 404s, search the Cloudflare docs index above.

---

_Plan version 1.0 — September 2026._
