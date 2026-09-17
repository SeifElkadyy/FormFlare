import { createDb } from "../db/client";
import { files as filesTable, submissions, type Form } from "../db/schema";
import { SETTING, getSetting } from "../db/settings";
import { sha256Hex, ulid } from "../ids";
import { cloudflareQueue } from "../platform/queue";
import { r2Storage } from "../platform/storage";
import { decryptSecret } from "../crypto/secrets";
import { isHoneypotHit, stripReserved } from "../spam/honeypot";
import { originAllowed, resolveRedirect } from "../spam/origin";
import { verifyTurnstile } from "../spam/turnstile";
import { claimPosition, findExistingSignup, bumpSubmissionCount } from "../waitlist/position";
import { extractEmail, parseFields, validateFields } from "./fields";
import { loadForm } from "./form-cache";
import { MAX_FIELDS_BYTES, parseBody, type ParsedFile } from "./parse";

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
  // A bot that can tell it was caught learns to skip the field.
  if (isHoneypotHit(parsed.values, form.honeypotField)) {
    return successResponse(request, form, parsed.wasJson, {
      id: ulid(),
      duplicate: false,
      position: null,
      redirectOverride: parsed.values._redirect,
    });
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

  const saved = await saveSubmission(env, db, form, validation.data, parsed.files, request, ip);

  // Duplicate waitlist signups are not new submissions, so they create no job — the
  // owner has already been notified about this person.
  if (!saved.duplicate) {
    const jobs = cloudflareQueue(env.JOBS);
    ctx.waitUntil(jobs.send({ type: "submission.created", submissionId: saved.id }));
  }

  return successResponse(request, form, parsed.wasJson, {
    id: saved.id,
    duplicate: saved.duplicate,
    position: saved.position,
    redirectOverride: parsed.values._redirect,
  });
}

interface SavedSubmission {
  id: string;
  duplicate: boolean;
  position: number | null;
}

async function saveSubmission(
  env: CloudflareEnv,
  db: ReturnType<typeof createDb>,
  form: Form,
  data: Record<string, string>,
  parsedFiles: ParsedFile[],
  request: Request,
  ip: string,
): Promise<SavedSubmission> {
  const fields = parseFields(form.fieldsJson);
  const email = extractEmail(data, fields);
  const now = Date.now();

  if (form.mode === "waitlist" && email) {
    const existing = await findExistingSignup(env.DB, form.id, email);
    if (existing) {
      // Idempotent: return the original position rather than creating a second row.
      return { id: existing.id, duplicate: true, position: existing.position };
    }
  }

  const position = form.mode === "waitlist" ? await claimPosition(env.DB, form.id) : null;
  if (form.mode !== "waitlist") await bumpSubmissionCount(env.DB, form.id);

  const submissionId = ulid(now);

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
        return { id: existing.id, duplicate: true, position: existing.position };
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

  return { id: submissionId, duplicate: false, position };
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
    position: number | null;
    redirectOverride?: string;
  },
): Response {
  if (wantsJson(request, wasJson)) {
    return Response.json(
      {
        ok: true,
        id: result.id,
        ...(result.duplicate ? { duplicate: true } : {}),
        ...(result.position !== null ? { waitlist: { position: result.position } } : {}),
      },
      { headers: corsHeaders(request) },
    );
  }

  // `_redirect` is only honoured when it matches an allow-listed origin (open redirect).
  const target = resolveRedirect(result.redirectOverride, form);
  const location = target ?? thanksUrl(request, form, result.position);

  return new Response(null, {
    status: 303,
    headers: { ...corsHeaders(request), Location: location },
  });
}

function thanksUrl(request: Request, form: Form, position: number | null): string {
  const url = new URL("/thanks", request.url);
  url.searchParams.set("form", form.publicId);
  if (position !== null) url.searchParams.set("pos", String(position));
  return url.toString();
}
