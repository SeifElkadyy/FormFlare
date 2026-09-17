/**
 * Request body parsing for the public submission endpoint.
 *
 * Size is enforced in two places, because neither alone is sufficient:
 *
 * 1. `Content-Length`, checked before reading a byte. Cheap, and rejects the common
 *    case without buffering anything.
 * 2. A running total while parsing. `Content-Length` is client-supplied and absent on
 *    chunked requests, so a malicious client can understate or omit it.
 *
 * Cloudflare also caps request body size per plan (100 MB on Free at the time of
 * writing, higher on paid plans), which is the outer bound; these limits are the
 * per-form ones the owner configures, always well below it.
 */

export type ParsedBody =
  | { ok: true; values: Record<string, string>; files: ParsedFile[]; wasJson: boolean }
  | { ok: false; code: "payload_too_large" | "unsupported_media_type" | "malformed_body" };

export interface ParsedFile {
  fieldName: string;
  filename: string;
  contentType: string;
  size: number;
  data: ArrayBuffer;
}

/** Hard ceiling on non-file form data, independent of per-form file limits. */
export const MAX_FIELDS_BYTES = 512 * 1024;

/** Reject early using the declared length. Returns true when definitely too large. */
export function declaredTooLarge(request: Request, maxBytes: number): boolean {
  const header = request.headers.get("content-length");
  if (!header) return false; // Absent or chunked: caught by the running total instead.
  const length = Number(header);
  return Number.isFinite(length) && length > maxBytes;
}

export function contentTypeOf(request: Request): string {
  return (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
}

/**
 * Parse a submission body.
 *
 * `maxTotalBytes` bounds everything: field values plus file bytes. Files are additionally
 * checked against the form's own limits by the caller.
 */
export async function parseBody(request: Request, maxTotalBytes: number): Promise<ParsedBody> {
  const type = contentTypeOf(request);

  if (declaredTooLarge(request, maxTotalBytes)) {
    return { ok: false, code: "payload_too_large" };
  }

  try {
    if (type === "application/json") {
      // JSON carries no files, so it is bounded by the field budget alone — not by the
      // form's file allowance, which would let a JSON body be megabytes of text.
      return await parseJson(request, Math.min(maxTotalBytes, MAX_FIELDS_BYTES));
    }

    if (type === "application/x-www-form-urlencoded" || type === "multipart/form-data") {
      return await parseForm(request, maxTotalBytes);
    }

    return { ok: false, code: "unsupported_media_type" };
  } catch {
    return { ok: false, code: "malformed_body" };
  }
}

async function parseJson(request: Request, maxTotalBytes: number): Promise<ParsedBody> {
  const text = await readCapped(request, maxTotalBytes);
  if (text === null) return { ok: false, code: "payload_too_large" };

  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, code: "malformed_body" };
  }

  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    // Flatten scalars; nested objects and arrays are not part of the v1 contract.
    if (value === null || value === undefined) continue;
    if (typeof value === "object") continue;
    values[key] = String(value);
  }

  // JSON bodies cannot carry files.
  return { ok: true, values, files: [], wasJson: true };
}

async function parseForm(request: Request, maxTotalBytes: number): Promise<ParsedBody> {
  const form = await request.formData();

  const values: Record<string, string> = {};
  const files: ParsedFile[] = [];
  let total = 0;
  let fieldBytes = 0;

  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      // Text fields are bounded separately from files: a generous per-form file
      // allowance must not also license megabytes of text in a single field.
      fieldBytes += key.length + value.length;
      total += key.length + value.length;
      if (fieldBytes > MAX_FIELDS_BYTES || total > maxTotalBytes) {
        return { ok: false, code: "payload_too_large" };
      }
      // Last value wins for repeated keys (checkbox groups are not v1).
      values[key] = value;
      continue;
    }

    total += value.size;
    if (total > maxTotalBytes) return { ok: false, code: "payload_too_large" };

    // Empty file inputs are submitted by browsers even when nothing was chosen.
    if (value.size === 0 && !value.name) continue;

    files.push({
      fieldName: key,
      filename: value.name || "upload",
      contentType: value.type || "application/octet-stream",
      size: value.size,
      data: await value.arrayBuffer(),
    });
  }

  return { ok: true, values, files, wasJson: false };
}

/**
 * Read a body as text, stopping as soon as the cap is exceeded.
 *
 * Streams rather than calling `request.text()`, so an oversized body is abandoned
 * instead of being fully buffered first.
 */
async function readCapped(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) return null;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(joined);
}
