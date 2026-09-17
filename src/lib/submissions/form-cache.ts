import { eq, or } from "drizzle-orm";
import type { Database } from "../db/client";
import { forms, type Form } from "../db/schema";

/**
 * Per-isolate form config cache.
 *
 * Every submission needs the form's config, and without this each one costs a D1 read
 * on the hot path. 30 seconds is short enough that a change propagates quickly and long
 * enough to absorb a burst.
 *
 * ⚠️ The cache is per Worker isolate and cannot be cleared globally. Deactivating or
 * deleting a form therefore takes **up to 30 seconds** to apply across all isolates.
 * `invalidateForm()` clears the isolate that made the change, so the dashboard reflects
 * it immediately, but other isolates simply expire. This is documented in the
 * troubleshooting guide and the FAQ.
 *
 * A module-level Map is safe here: each isolate has its own, entries are small, and it
 * is bounded by eviction below.
 */
const TTL_MS = 30_000;

/** Bound so a flood of unknown ids cannot grow the map without limit. */
const MAX_ENTRIES = 1000;

interface Entry {
  form: Form | null;
  expiresAt: number;
}

const cache = new Map<string, Entry>();

export async function loadForm(
  db: Database,
  publicId: string,
  now: number = Date.now(),
): Promise<Form | null> {
  const hit = cache.get(publicId);
  if (hit && hit.expiresAt > now) return hit.form;

  const rows = await db.select().from(forms).where(eq(forms.publicId, publicId)).limit(1);
  const form = rows[0] ?? null;

  if (cache.size >= MAX_ENTRIES) {
    // Cheapest useful eviction: drop the oldest insertion. Map preserves insertion order.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }

  // Negative results are cached too, so hammering an unknown id does not hit D1 each time.
  cache.set(publicId, { form, expiresAt: now + TTL_MS });
  return form;
}

/** Lookup used by `/p/:slug` — public id or custom slug. */
export async function loadHostedForm(
  db: Database,
  key: string,
  now: number = Date.now(),
): Promise<Form | null> {
  const cacheKey = `hosted:${key}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > now) return hit.form;

  const rows = await db
    .select()
    .from(forms)
    .where(or(eq(forms.publicId, key), eq(forms.slug, key)))
    .limit(1);
  const form = rows[0] ?? null;

  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }

  cache.set(cacheKey, { form, expiresAt: now + TTL_MS });
  if (form) {
    cache.set(form.publicId, { form, expiresAt: now + TTL_MS });
    if (form.slug) cache.set(`hosted:${form.slug}`, { form, expiresAt: now + TTL_MS });
  }
  return form;
}

/** Clear one form from this isolate's cache. Call after any write to it. */
export function invalidateForm(publicId: string, slug?: string | null): void {
  cache.delete(publicId);
  cache.delete(`hosted:${publicId}`);
  if (slug) cache.delete(`hosted:${slug}`);
}

/** Clear everything. Used by tests and after bulk changes. */
export function clearFormCache(): void {
  cache.clear();
}

export const FORM_CACHE_TTL_MS = TTL_MS;
