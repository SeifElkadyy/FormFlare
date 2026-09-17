/**
 * Turn a typed site into an origin we can store on the allow-list.
 *
 * Owners paste "yoursite.com" or a full URL. The check later compares origins,
 * so we normalise once here rather than storing a path they did not mean.
 */
export function originFromInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const withScheme = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}
