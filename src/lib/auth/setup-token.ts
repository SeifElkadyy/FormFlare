/**
 * Optional `/setup` gate.
 *
 * The window between deploy and first setup is the one moment a stranger who finds
 * the URL could claim the instance. FormFlare cannot *require* a secret without
 * breaking the zero-secrets deploy promise (design principle 1), so this is opt-in:
 *
 * - `SETUP_TOKEN` unset (the default) → setup works as before, first-run lock only.
 * - `SETUP_TOKEN` set → every setup request must present it.
 *
 * It stays commented out in `.dev.vars.example` so the deploy button never prompts
 * for it. Deployers who want the extra protection add it as a secret and pass
 * `?token=` (or the `x-setup-token` header) when opening `/setup`.
 */

/** Read the token from a header or query string. */
export function readSetupToken(request: Request): string | undefined {
  const header = request.headers.get("x-setup-token");
  if (header) return header;
  return new URL(request.url).searchParams.get("token") ?? undefined;
}

/**
 * Check a supplied token against the configured one.
 *
 * Returns true when no token is configured, which is the default deploy.
 * Comparison is constant-time so a wrong guess does not leak a prefix match.
 */
export function setupTokenOk(
  configured: string | undefined,
  supplied: string | undefined,
): boolean {
  if (!configured) return true;
  if (!supplied) return false;
  return timingSafeEqualString(configured, supplied);
}

function timingSafeEqualString(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  // Length is not secret here, but comparing byte-by-byte on equal lengths avoids
  // an early return that would reveal the matching prefix.
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}
