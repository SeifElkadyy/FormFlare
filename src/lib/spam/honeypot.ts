/**
 * Honeypot check.
 *
 * A field hidden with CSS that a human never sees and never fills. Bots that fill every
 * input give themselves away.
 *
 * The response to a hit is a normal success (Section 12.1): telling a bot it was caught
 * just teaches the author to skip the field next time.
 */
export function isHoneypotHit(values: Record<string, string>, honeypotField: string): boolean {
  const value = values[honeypotField];
  return typeof value === "string" && value.trim().length > 0;
}

/** Reserved names stripped from stored submission data. */
export const RESERVED_FIELDS = ["cf-turnstile-response", "_redirect"] as const;

/** Remove reserved and honeypot fields before the data is stored. */
export function stripReserved(
  values: Record<string, string>,
  honeypotField: string,
): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === honeypotField) continue;
    if ((RESERVED_FIELDS as readonly string[]).includes(key)) continue;
    clean[key] = value;
  }
  return clean;
}
