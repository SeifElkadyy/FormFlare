import { BRAND } from "../brand";
import type { Form, Submission } from "../db/schema";
import { webhookBody, type WebhookPreset } from "./presets";
import { signPayload, validateWebhookUrl } from "./sign";

const TIMEOUT_MS = 10_000;

export interface WebhookPayload {
  event: string;
  form: { id: string; name: string };
  submission: {
    id: string;
    createdAt: number;
    data: Record<string, unknown>;
    files: { filename: string; contentType: string; size: number }[];
    waitlist?: { position: number };
  };
}

export function buildPayload(
  form: Form,
  submission: Submission,
  data: Record<string, unknown>,
  files: { filename: string; contentType: string; size: number }[] = [],
): WebhookPayload {
  return {
    event: "submission.created",
    form: { id: form.publicId, name: form.name },
    submission: {
      id: submission.id,
      createdAt: submission.createdAt,
      data,
      files,
      ...(submission.waitlistPosition !== null
        ? { waitlist: { position: submission.waitlistPosition } }
        : {}),
    },
  };
}

export interface DeliveryResult {
  ok: boolean;
  statusCode?: number;
  error?: string;
  /** False for permanent failures, so the consumer does not burn retries on them. */
  retryable: boolean;
}

/**
 * POST a signed payload to a webhook URL.
 *
 * Never throws: the caller is a queue consumer that must decide ack-vs-retry per
 * message, and an exception escaping here would fail the whole batch.
 */
export async function deliverWebhook(
  url: string,
  secret: string,
  payload: WebhookPayload,
  deliveryId: string,
  now: number = Date.now(),
  preset: WebhookPreset = "generic",
): Promise<DeliveryResult> {
  // Re-validated at delivery time, not just when saved: the row may predate the check,
  // or DNS may now resolve the host somewhere private.
  const validated = validateWebhookUrl(url);
  if (!validated.ok) {
    return { ok: false, error: validated.error, retryable: false };
  }

  const encoded = webhookBody(preset, payload);
  const timestamp = Math.floor(now / 1000);
  const signature = encoded.signed ? await signPayload(secret, timestamp, encoded.body) : null;

  try {
    const response = await fetch(validated.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `${BRAND.name}/1.0`,
        "X-FormFlare-Event": payload.event,
        "X-FormFlare-Delivery": deliveryId,
        ...(signature
          ? {
              "X-FormFlare-Timestamp": String(timestamp),
              "X-FormFlare-Signature": signature,
            }
          : {}),
      },
      body: encoded.body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.ok) return { ok: true, statusCode: response.status, retryable: false };

    // 4xx means the receiver rejected the request itself — retrying sends the identical
    // payload to the identical endpoint, so it will fail identically. 408 and 429 are
    // the exceptions: both explicitly invite a retry.
    const retryable = response.status >= 500 || response.status === 408 || response.status === 429;

    return {
      ok: false,
      statusCode: response.status,
      error: `Receiver returned ${response.status}`,
      retryable,
    };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      ok: false,
      error: timedOut ? `No response within ${TIMEOUT_MS / 1000}s` : "Could not reach the URL",
      retryable: true,
    };
  }
}
