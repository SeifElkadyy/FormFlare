import { and, eq, lt } from "drizzle-orm";
import type { Database } from "../db/client";
import { apiKeys, type ApiKey } from "../db/schema";
import { sha256Hex, token, ulid } from "../ids";

/**
 * API keys.
 *
 * Format: `ff_live_<48 hex chars>`. Only the SHA-256 is stored, so a database leak
 * yields no usable key; the plaintext is shown once at creation.
 */

const PREFIX = "ff_live_";

/** How often `last_used_at` may be written. */
export const LAST_USED_THROTTLE_MS = 60_000;

export interface CreatedKey {
  id: string;
  /** Shown once, never stored. */
  plaintext: string;
  prefix: string;
}

export async function createApiKey(
  db: Database,
  name: string,
  now: number = Date.now(),
): Promise<CreatedKey> {
  const plaintext = `${PREFIX}${token(24)}`;
  const id = ulid(now);

  await db.insert(apiKeys).values({
    id,
    name: name.trim().slice(0, 100) || "Untitled key",
    // Enough to identify a key in a list without being enough to use it.
    prefix: plaintext.slice(0, PREFIX.length + 6),
    keyHash: await sha256Hex(plaintext),
    createdAt: now,
  });

  return { id, plaintext, prefix: plaintext.slice(0, PREFIX.length + 6) };
}

export async function revokeApiKey(db: Database, id: string): Promise<void> {
  await db.delete(apiKeys).where(eq(apiKeys.id, id));
}

/** Pull the bearer token out of an Authorization header. */
export function readBearer(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (!header) return undefined;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : undefined;
}

/**
 * Resolve a presented key, or null.
 *
 * Looks up by hash, so the plaintext is never compared against anything stored.
 * `last_used_at` is updated at most once a minute: every authenticated request would
 * otherwise be a write, turning a read-only API into a write-heavy one on D1.
 */
export async function authenticateApiKey(
  db: Database,
  presented: string | undefined,
  now: number = Date.now(),
): Promise<ApiKey | null> {
  if (!presented || !presented.startsWith(PREFIX)) return null;

  const hash = await sha256Hex(presented);
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash)).limit(1);
  const key = rows[0];
  if (!key) return null;

  if (!key.lastUsedAt || now - key.lastUsedAt > LAST_USED_THROTTLE_MS) {
    // The staleness check is repeated in SQL so two concurrent requests cannot both
    // write: whichever lands second sees a fresh timestamp and updates nothing.
    await db
      .update(apiKeys)
      .set({ lastUsedAt: now })
      .where(
        key.lastUsedAt
          ? and(eq(apiKeys.id, key.id), lt(apiKeys.lastUsedAt, now - LAST_USED_THROTTLE_MS))
          : eq(apiKeys.id, key.id),
      );
  }

  return key;
}
