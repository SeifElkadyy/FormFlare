const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

const RESERVED = new Set([
  "api",
  "api-keys",
  "confirm",
  "f",
  "forms",
  "inbox",
  "login",
  "p",
  "settings",
  "setup",
  "thanks",
  "webhooks",
  "widget",
]);

/**
 * Parse a hosted-page slug.
 *
 * Empty means "no custom slug" (the public id still works). Invalid input is an
 * error rather than silently discarded, so the owner sees why save failed.
 */
export function parseSlug(raw: string): { ok: true; slug: string | null } | { ok: false; error: string } {
  const slug = raw.trim().toLowerCase();
  if (!slug) return { ok: true, slug: null };
  if (slug.length < 2 || slug.length > 40) {
    return { ok: false, error: "Slug must be 2–40 characters." };
  }
  if (!SLUG.test(slug)) {
    return { ok: false, error: "Use lowercase letters, numbers and hyphens." };
  }
  if (RESERVED.has(slug)) {
    return { ok: false, error: "That slug is reserved." };
  }
  return { ok: true, slug };
}

export function hostedPath(form: { slug: string | null; publicId: string }): string {
  return `/p/${form.slug ?? form.publicId}`;
}
