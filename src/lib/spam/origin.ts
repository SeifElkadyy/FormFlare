/**
 * Origin allow-listing and open-redirect prevention.
 */

export function parseOrigins(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch {
    return [];
  }
}

/** Normalise to a bare origin (scheme + host + port), or null if unparseable. */
function toOrigin(value: string): string | null {
  try {
    // Accept bare hosts ("example.com") as well as full origins in the allow-list.
    const withScheme = value.includes("://") ? value : `https://${value}`;
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

/**
 * Is this request allowed to submit to this form?
 *
 * An empty allow-list means "any origin" — the default, since most forms live on a site
 * whose URL the owner has not bothered to configure, and the honeypot, rate limit and
 * Turnstile are the real spam defences.
 *
 * With a list configured, the Origin header is checked, falling back to Referer for
 * clients that omit Origin. A request with neither is allowed only when the list is
 * empty: server-to-server callers should use the API, not the public form endpoint.
 */
export function originAllowed(request: Request, allowedOriginsJson: string): boolean {
  const allowed = parseOrigins(allowedOriginsJson);
  if (allowed.length === 0) return true;

  const candidate = request.headers.get("origin") ?? originOfUrl(request.headers.get("referer"));
  if (!candidate) return false;

  const normalised = toOrigin(candidate);
  if (!normalised) return false;

  // Hosted pages live on this instance. Posting from our own origin must work even
  // when the owner allow-listed only their marketing site.
  const self = originOfUrl(request.url);
  if (self && toOrigin(self) === normalised) return true;

  return allowed.some((entry) => toOrigin(entry) === normalised);
}

function originOfUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Decide where to send the browser after a successful submission.
 *
 * `_redirect` is attacker-controlled: it arrives in the request body, so anyone can post
 * to a public form with `_redirect=https://phishing.example`. Honouring it unchecked
 * turns every form into an open redirect that lends the instance's domain to a phishing
 * flow.
 *
 * It is therefore only honoured when it points at an origin the form owner allow-listed.
 * A form with no allow-list cannot use `_redirect` at all — there is nothing to check it
 * against, and silently allowing anything is exactly the hole being closed. The form's
 * own `redirectUrl`, set in the dashboard by an authenticated owner, is always trusted.
 */
export function resolveRedirect(
  requested: string | undefined,
  form: { redirectUrl: string | null; allowedOriginsJson: string },
): string | null {
  if (requested) {
    const allowed = parseOrigins(form.allowedOriginsJson);
    if (allowed.length > 0) {
      const target = toOrigin(requested);
      if (target && allowed.some((entry) => toOrigin(entry) === target)) {
        return requested;
      }
    }
    // Requested but not allowed: fall through to the configured redirect rather than
    // failing the submission. The data is already saved; where the browser lands next
    // is not worth a 4xx.
  }

  return form.redirectUrl ?? null;
}
