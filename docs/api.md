# API

## Submitting a form

`POST https://your-instance/f/<publicId>`

Accepts `application/x-www-form-urlencoded`, `multipart/form-data` and
`application/json`. No API key — see [embedding.md](embedding.md) for HTML, fetch,
and React snippets. API keys are for **reading** submissions.

Responds with JSON when the request was JSON or `Accept: application/json` was sent;
otherwise `303 See Other` to the form's redirect URL or the built-in `/thanks` page.

### Success

```json
{ "ok": true, "id": "01M2P...", "waitlist": { "position": 214 } }
```

`waitlist` appears only for waitlist forms. A repeat signup returns the **original**
position with `"duplicate": true` and does not create a second row.

### Errors

| HTTP | `code`                   | Meaning                                         |
| ---- | ------------------------ | ----------------------------------------------- |
| 404  | `form_not_found`         | Unknown **or inactive** form                    |
| 403  | `origin_not_allowed`     | Origin is not in the form's allow-list          |
| 413  | `payload_too_large`      | Body, a field, or a file exceeded the limit     |
| 415  | `unsupported_media_type` | Content-Type is not one of the three above      |
| 400  | `malformed_body`         | Body could not be parsed                        |
| 422  | `validation_failed`      | Includes `fields: { name: "message" }`          |
| 422  | `captcha_failed`         | Turnstile rejected the token                    |
| 429  | `rate_limited`           | Too many submissions from this IP for this form |

A honeypot hit returns a normal success response and stores nothing.

### Reserved fields

Stripped before storage: the form's honeypot field (default `_gotcha`),
`cf-turnstile-response`, `_redirect`, and `_ref` (waitlist referral code).

`_redirect` is honoured **only** when it matches one of the form's allowed origins. A
form with no allow-list cannot use it, otherwise any form would be an open redirect.

Waitlist JSON may include `"pending": true` when double opt-in is on and the email is
not confirmed yet. `GET /f/<publicId>/count` returns `{ "ok": true, "count": N }`
(confirmed waitlist signups only). `GET /f/<publicId>/badge.svg` is the same number as
an image.

## Hosted pages

`/p/<slug-or-publicId>` renders the form. `?ref=` is copied into `_ref`. Embed with:

```html
<script src="https://your-instance/widget.js" data-form="PUBLIC_ID" async></script>
```

## Webhooks

Generic webhooks send this JSON with HMAC headers. Slack and Discord presets send
incoming-webhook bodies (`text` / `content` + embed) and skip HMAC — those receivers
reject unknown JSON.


### Headers

| Header                  | Value                                            |
| ----------------------- | ------------------------------------------------ |
| `Content-Type`          | `application/json`                               |
| `X-FormFlare-Event`     | `submission.created`                             |
| `X-FormFlare-Delivery`  | Unique per delivery; safe to use for idempotency |
| `X-FormFlare-Timestamp` | Unix seconds                                     |
| `X-FormFlare-Signature` | `sha256=<hex>`                                   |

### Payload

```json
{
  "event": "submission.created",
  "form": { "id": "abc123", "name": "Contact" },
  "submission": {
    "id": "01M2P...",
    "createdAt": 1789600000000,
    "data": { "email": "a@b.com", "message": "Hi" },
    "files": [],
    "waitlist": { "position": 214 }
  }
}
```

### Verifying the signature

The HMAC is computed over `"<timestamp>.<raw body>"` — **not the body alone**. Signing
the timestamp too means a captured request cannot be replayed later with a fresh
timestamp, because the signature would no longer match.

> **Reject anything older than 5 minutes.** FormFlare's own verifier uses a 300-second
> tolerance: wide enough for clock skew, narrow enough that a captured request expires
> quickly. Without this check the signature alone permits unlimited replay.

Compare with a **constant-time** function. `===` returns early at the first differing
byte, which leaks enough to forge a signature one byte at a time.

```js
import crypto from "node:crypto";

const TOLERANCE_SECONDS = 300;

export function verify(rawBody, headers, secret) {
  const timestamp = Number(headers["x-formflare-timestamp"]);
  const signature = headers["x-formflare-signature"];

  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) return false;

  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature ?? "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

Verify against the **raw request body**, before any JSON parsing. Re-serialising changes
whitespace and key order, and the signature will not match.

### Delivery and retries

- 10-second timeout.
- `2xx` is success.
- `5xx`, `408` and `429` are retried with backoff (10s, 1m, 5m, 30m), up to 5 attempts.
- Other `4xx` are **not** retried: the receiver rejected this payload, and resending an
  identical one to an identical endpoint fails identically.
- Deliveries are recorded per webhook per submission, so a redelivered internal job
  never sends the same payload twice.
- Spam submissions never trigger webhooks or email.
- Only `https` URLs pointing at public hosts are accepted. Private, loopback and
  link-local targets are rejected, since the request originates inside Cloudflare's
  network.

Delivery logs are pruned after 30 days.

## Email notifications

Owner alerts set `Reply-To` to the submitter's address, but only when it passes strict
validation — anything containing a newline or other header-breaking character is
dropped rather than sanitised.

Auto-replies contain **owner-configured text only**. Nothing the submitter typed is
echoed back, so the instance cannot be used to relay attacker-authored content, and are
limited to one per address per 24 hours.

Email is optional. Without Cloudflare Email Sending configured, submissions still
succeed and delivery rows are recorded as `skipped_unavailable`.
