import { createDb } from "../db/client";
import { files as filesTable, submissions, type Form } from "../db/schema";
import { SETTING, getSetting } from "../db/settings";
import { sha256Hex, ulid } from "../ids";
import { cloudflareQueue } from "../platform/queue";
import { r2Storage } from "../platform/storage";
import { decryptSecret } from "../crypto/secrets";
import { isHoneypotHit, stripReserved } from "../spam/honeypot";
import { FILL_TOKEN_FIELD, blocklistReason, fillTimeReason, parseBlocklist } from "../spam/filter";
import { originAllowed, resolveRedirect } from "../spam/origin";
import { verifyTurnstile } from "../spam/turnstile";
import { claimPosition, findExistingSignup, bumpSubmissionCount } from "../waitlist/position";
import { findReferrer, newReferralCode, creditReferral } from "../waitlist/referral";
import { waitlistRank } from "../waitlist/rank";
import { extractEmail, parseFields, validateFields } from "./fields";
import { loadForm } from "./form-cache";
import { MAX_FIELDS_BYTES, parseBody, type ParsedFile } from "./parse";
import { errorPageHtml } from "./error-page";

/** Error codes from Section 12.1. */
type ErrorCode =
  | "form_not_found"
  | "origin_not_allowed"
  | "payload_too_large"
  | "unsupported_media_type"
  | "malformed_body"
  | "validation_failed"
  | "captcha_failed"
  | "rate_limited"
  | "method_not_allowed";

const STATUS: Record<ErrorCode, number> = {
  form_not_found: 404,
  origin_not_allowed: 403,
  payload_too_large: 413,
  unsupported_media_type: 415,
  malformed_body: 400,
  validation_failed: 422,
  captcha_failed: 422,
  rate_limited: 429,
  method_not_allowed: 405,
};

export async function handleSubmission(
  request: Request,
  env: CloudflareEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method === "OPTIONS") return preflight(request);
  if (request.method !== "POST") {
    return errorResponse(request, null, "method_not_allowed");
  }

  const publicId = publicIdFrom(request);
  if (!publicId) return errorResponse(request, null, "form_not_found");

  const db = createDb(env.DB);
  const form = await loadForm(db, publicId);

  // Inactive forms are indistinguishable from missing ones: a 403 would confirm the id
  // exists to anyone probing.
  if (!form || !form.active) return errorResponse(request, null, "form_not_found");

  if (!originAllowed(request, form.allowedOriginsJson)) {
    return errorResponse(request, form, "origin_not_allowed");
  }

  // Cheapest rejection first: the declared length, before a byte is read.
  const maxTotalBytes = MAX_FIELDS_BYTES + form.fileMaxBytes;

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success } = await env.SUBMIT_RATE_LIMIT.limit({ key: `${form.id}:${ip}` });
  if (!success) return errorResponse(request, form, "rate_limited");

  const parsed = await parseBody(request, maxTotalBytes);
  if (!parsed.ok) return errorResponse(request, form, parsed.code);

  // Honeypot: respond exactly as a success would, store nothing, enqueue nothing.
  // A bot that can tell it was caught learns to skip the field — so on waitlist forms
  // the decoy carries the same fields a real signup gets, with a plausible next
  // position (from the cached counter, so no extra query).
  if (isHoneypotHit(parsed.values, form.honeypotField)) {
    return decoyResponse(request, form, parsed.wasJson, parsed.values._redirect);
  }

  if (form.turnstileSecret) {
    const sessionSecret = (await getSetting(db, SETTING.sessionSecret)) ?? "";
    const secret = (await decryptSecret(form.turnstileSecret, sessionSecret)) ?? "";
    const result = await verifyTurnstile(
      parsed.values["cf-turnstile-response"],
      secret,
      ip === "unknown" ? undefined : ip,
    );
    // No job, no row: a failed challenge must not reach the queue.
    if (!result.ok) return errorResponse(request, form, "captcha_failed");
  }

  const fields = parseFields(form.fieldsJson);
  const validation = validateFields(stripReserved(parsed.values, form.honeypotField), fields);
  if (!validation.ok) {
    return errorResponse(request, form, "validation_failed", validation.errors);
  }

  // R2 is opt-in, so an instance without a bucket cannot accept files. Reject clearly
  // rather than dropping them silently — a submitter who attached a CV should be told
  // it did not arrive.
  if (parsed.files.length > 0 && !r2Storage(env.BUCKET).available) {
    return errorResponse(request, form, "validation_failed", {
      [parsed.files[0].fieldName]:
        "This form cannot accept files. The site owner needs to enable file uploads.",
    });
  }

  for (const file of parsed.files) {
    if (file.size > form.fileMaxBytes) return errorResponse(request, form, "payload_too_large");
    const allowed = parseJsonArray(form.fileTypesJson);
    if (allowed.length > 0 && !allowed.includes(file.contentType)) {
      return errorResponse(request, form, "validation_failed", {
        [file.fieldName]: "This file type is not allowed.",
      });
    }
  }

  // Cheap content checks. A hit is kept (Spam tab) but gets the same decoy as the
  // honeypot: no notification, no webhook, no waitlist place, nothing for a bot to learn.
  const sessionSecret = (await getSetting(db, SETTING.sessionSecret)) ?? "";
  const spamReason =
    (await fillTimeReason(parsed.values[FILL_TOKEN_FIELD], sessionSecret)) ??
    blocklistReason(
      validation.data,
      extractEmail(validation.data, fields),
      parseBlocklist(form.spamWords),
    );
  if (spamReason) {
    await saveSpam(db, form, validation.data, request, spamReason);
    return decoyResponse(request, form, parsed.wasJson, parsed.values._redirect);
  }

  const saved = await saveSubmission(
    env,
    db,
    form,
    validation.data,
    parsed.files,
    request,
    ip,
    parsed.values._ref,
  );

  // Duplicate waitlist signups are not new submissions, so they create no job — the
  // owner has already been notified about this person. Pending double-opt-in duplicates
  // also skip: the confirmation email was already sent.
  if (!saved.duplicate) {
    const jobs = cloudflareQueue(env.JOBS);
    ctx.waitUntil(jobs.send({ type: "submission.created", submissionId: saved.id }));
  }

  return successResponse(request, form, parsed.wasJson, {
    id: saved.id,
    duplicate: saved.duplicate,
    pending: saved.pending,
    position: saved.position,
    rank: saved.rank,
    referralCode: saved.referralCode,
    redirectOverride: parsed.values._redirect,
  });
}

/**
 * What a caught submission gets back: exactly what a real one would. On waitlist forms
 * the decoy carries the same fields a real signup gets, with a plausible next position
 * from the cached counter, so a bot cannot tell it was caught.
 */
function decoyResponse(
  request: Request,
  form: Form,
  wasJson: boolean,
  redirectOverride: string | undefined,
): Response {
  const waitlist = form.mode === "waitlist";
  const pending = waitlist && form.doubleOptIn;
  const position = waitlist && !pending ? form.submissionCount + 1 : null;
  return successResponse(request, form, wasJson, {
    id: ulid(),
    duplicate: false,
    pending,
    position,
    rank: position,
    referralCode: waitlist ? newReferralCode() : null,
    redirectOverride,
  });
}

/**
 * Keep a caught submission for review. Files are dropped, no counter moves, and email is
 * left out of the indexed column so a spam row never blocks a real waitlist signup with
 * the same address (dedupe keys on it).
 */
async function saveSpam(
  db: ReturnType<typeof createDb>,
  form: Form,
  data: Record<string, string>,
  request: Request,
  reason: string,
): Promise<void> {
  const now = Date.now();
  await db.insert(submissions).values({
    id: ulid(now),
    formId: form.id,
    dataJson: JSON.stringify(data),
    email: null,
    status: "spam",
    spamReason: reason,
    // Not "unconfirmed": that state offers a confirm link in the inbox.
    optedInAt: now,
    fannedOutAt: now,
    country: (request as { cf?: { country?: string } }).cf?.country ?? null,
    userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
    referrer: request.headers.get("referer")?.slice(0, 512) ?? null,
    createdAt: now,
  });
}

interface SavedSubmission {
  id: string;
  duplicate: boolean;
  pending: boolean;
  position: number | null;
  rank: number | null;
  referralCode: string | null;
}

async function saveSubmission(
  env: CloudflareEnv,
  db: ReturnType<typeof createDb>,
  form: Form,
  data: Record<string, string>,
  parsedFiles: ParsedFile[],
  request: Request,
  ip: string,
  refCode: string | undefined,
): Promise<SavedSubmission> {
  const fields = parseFields(form.fieldsJson);
  const email = extractEmail(data, fields);
  const now = Date.now();

  if (form.mode === "waitlist" && email) {
    const existing = await findExistingSignup(env.DB, form.id, email);
    if (existing) {
      const pending = form.doubleOptIn && !existing.optedInAt;
      const rank =
        existing.position !== null ? await waitlistRank(env.DB, form.id, existing.id) : null;
      return {
        id: existing.id,
        duplicate: true,
        pending,
        position: rank?.rank ?? existing.position,
        rank: rank?.rank ?? null,
        referralCode: null,
      };
    }
  }

  const pending = form.mode === "waitlist" && form.doubleOptIn;
  const position =
    form.mode === "waitlist" && !pending ? await claimPosition(env.DB, form.id) : null;
  if (form.mode !== "waitlist") await bumpSubmissionCount(env.DB, form.id);

  const submissionId = ulid(now);
  const referralCode = form.mode === "waitlist" ? newReferralCode() : null;
  const referrer =
    form.mode === "waitlist" && refCode ? await findReferrer(env.DB, form.id, refCode) : null;

  // Files go to R2 before the row is written, so a submission never references an object
  // that does not exist. The reverse (object with no row) is cleaned up by the daily sweep.
  const storage = r2Storage(env.BUCKET);
  const stored: { key: string; file: ParsedFile }[] = [];
  for (const file of parsedFiles) {
    const key = `${form.id}/${submissionId}/${ulid()}`;
    await storage.put(key, file.data, file.contentType);
    stored.push({ key, file });
  }

  // IP is salted with session_secret and hashed: enough to rate-limit and spot abuse,
  // never the raw address (Section 19).
  const sessionSecret = (await getSetting(db, SETTING.sessionSecret)) ?? "";
  const ipHash = ip === "unknown" ? null : await sha256Hex(`${ip}:${sessionSecret}`);

  try {
    await db.insert(submissions).values({
      id: submissionId,
      formId: form.id,
      dataJson: JSON.stringify(data),
      email,
      status: "new",
      waitlistPosition: position,
      optedInAt: pending ? null : now,
      referralCode,
      referredById: referrer && referrer.id !== submissionId ? referrer.id : null,
      ipHash,
      country: (request as { cf?: { country?: string } }).cf?.country ?? null,
      userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
      referrer: request.headers.get("referer")?.slice(0, 512) ?? null,
      createdAt: now,
    });
  } catch (err) {
    // The dedupe index can still fire if two identical signups race past the lookup
    // above. Treat it as the duplicate it is rather than surfacing a 500.
    if (isUniqueViolation(err) && email) {
      const existing = await findExistingSignup(env.DB, form.id, email);
      if (existing) {
        // Roll back the objects this attempt uploaded; the winning row owns its own.
        for (const { key } of stored) await storage.delete(key).catch(() => {});
        const dupPending = form.doubleOptIn && !existing.optedInAt;
        return {
          id: existing.id,
          duplicate: true,
          pending: dupPending,
          position: existing.position,
          rank: existing.position,
          referralCode: null,
        };
      }
    }
    for (const { key } of stored) await storage.delete(key).catch(() => {});
    throw err;
  }

  if (stored.length > 0) {
    await db.insert(filesTable).values(
      stored.map(({ key, file }) => ({
        id: ulid(),
        submissionId,
        fieldName: file.fieldName,
        r2Key: key,
        filename: file.filename.slice(0, 255),
        contentType: file.contentType,
        size: file.size,
        createdAt: now,
      })),
    );
  }

  if (referrer && !pending) {
    await creditReferral(db, referrer.id);
  }

  const rank = position !== null ? await waitlistRank(env.DB, form.id, submissionId) : null;

  return {
    id: submissionId,
    duplicate: false,
    pending,
    position: rank?.rank ?? position,
    rank: rank?.rank ?? null,
    referralCode,
  };
}

function isUniqueViolation(err: unknown): boolean {
  const cause = (err as { cause?: { message?: string } }).cause?.message ?? "";
  return /UNIQUE constraint failed/i.test(cause);
}

function parseJsonArray(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function publicIdFrom(request: Request): string | null {
  const match = new URL(request.url).pathname.match(/^\/f\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** JSON when the client asked for it or sent it; a redirect otherwise. */
function wantsJson(request: Request, wasJson: boolean): boolean {
  if (wasJson) return true;
  return (request.headers.get("accept") ?? "").includes("application/json");
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  return {
    // Credentials are never used, so echoing the origin is safe and works for
    // allow-listed forms; "*" covers the no-origin case.
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    Vary: "Origin",
  };
}

function preflight(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: { ...corsHeaders(request), "Access-Control-Max-Age": "86400" },
  });
}

function errorResponse(
  request: Request,
  form: Form | null,
  code: ErrorCode,
  fields?: Record<string, string>,
): Response {
  // A plain HTML form navigated here, so the visitor would otherwise see raw JSON.
  // Keyed on the browser's own navigation header rather than Accept: fetch() callers
  // that never set Accept keep getting the JSON they already parse.
  if (request.headers.get("sec-fetch-mode") === "navigate") {
    return new Response(errorPageHtml(code, fields), {
      status: STATUS[code],
      headers: {
        ...corsHeaders(request),
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  }
  return Response.json(
    { ok: false, code, ...(fields ? { fields } : {}) },
    { status: STATUS[code], headers: corsHeaders(request) },
  );
}

function successResponse(
  request: Request,
  form: Form,
  wasJson: boolean,
  result: {
    id: string;
    duplicate: boolean;
    pending: boolean;
    position: number | null;
    rank: number | null;
    referralCode: string | null;
    redirectOverride?: string;
  },
): Response {
  if (wantsJson(request, wasJson)) {
    return Response.json(
      {
        ok: true,
        id: result.id,
        ...(result.duplicate ? { duplicate: true } : {}),
        ...(result.pending ? { pending: true } : {}),
        ...(result.position !== null
          ? {
              waitlist: {
                position: result.position,
                ...(result.rank !== null ? { rank: result.rank } : {}),
                ...(result.referralCode ? { referralCode: result.referralCode } : {}),
              },
            }
          : {}),
      },
      { headers: corsHeaders(request) },
    );
  }

  // `_redirect` is only honoured when it matches an allow-listed origin (open redirect).
  const target = resolveRedirect(result.redirectOverride, form);
  const location = target ?? thanksUrl(request, form, result.position, result.pending);

  return new Response(null, {
    status: 303,
    headers: { ...corsHeaders(request), Location: location },
  });
}

function thanksUrl(
  request: Request,
  form: Form,
  position: number | null,
  pending: boolean,
): string {
  const url = new URL("/thanks", request.url);
  url.searchParams.set("form", form.publicId);
  if (pending) url.searchParams.set("pending", "1");
  if (position !== null) url.searchParams.set("pos", String(position));
  // Set by the hosted page when it is inside the embed widget's iframe.
  if (new URL(request.url).searchParams.get("embed") === "1") url.searchParams.set("embed", "1");
  return url.toString();
}
