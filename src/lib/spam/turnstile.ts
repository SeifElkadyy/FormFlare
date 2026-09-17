const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Give up rather than hold the submission open if Cloudflare is slow. */
const TIMEOUT_MS = 10_000;

export interface TurnstileResult {
  ok: boolean;
  /** Cloudflare's error codes, for the audit log. Never shown to the submitter. */
  errorCodes?: string[];
}

/**
 * Server-side Turnstile verification.
 *
 * The widget's client-side token means nothing until it is exchanged here: it is
 * single-use and only this call proves it was issued for this site.
 *
 * Fails **closed** — a network error or timeout is treated as a failed challenge. The
 * alternative (letting submissions through when the verifier is unreachable) turns any
 * outage into an open spam window, which is exactly when a flood is most likely.
 */
export async function verifyTurnstile(
  token: string | undefined,
  secret: string,
  remoteIp?: string,
): Promise<TurnstileResult> {
  if (!token) return { ok: false, errorCodes: ["missing-input-response"] };

  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  // Optional, but lets Cloudflare correlate the challenge with the client.
  if (remoteIp) body.append("remoteip", remoteIp);

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return { ok: false, errorCodes: [`http-${response.status}`] };

    const result = (await response.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };

    return { ok: result.success === true, errorCodes: result["error-codes"] };
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError" ? "timeout" : "network";
    return { ok: false, errorCodes: [`verify-${reason}`] };
  }
}
