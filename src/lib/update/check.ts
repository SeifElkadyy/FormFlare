import type { Database } from "../db/client";
import { SETTING, getSetting, setSetting } from "../db/settings";
import { APP_VERSION, UPSTREAM_REPO } from "../version";
import { compareVersions, isStableTag } from "./semver";

/** How long a successful GitHub lookup is reused. Public unauthenticated limit is 60/hour. */
export const UPDATE_CACHE_MS = 6 * 60 * 60 * 1000;

export interface UpdateStatus {
  current: string;
  latest: string | null;
  newer: boolean;
  htmlUrl: string | null;
  checkedAt: number;
  error?: string;
}

interface CacheShape {
  latest: string | null;
  htmlUrl: string | null;
  checkedAt: number;
}

export async function getUpdateStatus(
  db: Database,
  opts: { force?: boolean; now?: number; fetcher?: typeof fetch } = {},
): Promise<UpdateStatus> {
  const now = opts.now ?? Date.now();
  const current = APP_VERSION;
  const cached = parseCache(await getSetting(db, SETTING.updateCheck));

  if (!opts.force && cached && now - cached.checkedAt < UPDATE_CACHE_MS) {
    return statusFrom(current, cached);
  }

  try {
    const fetched = await fetchLatest(opts.fetcher ?? fetch);
    const next: CacheShape = {
      latest: fetched.tag,
      htmlUrl: fetched.htmlUrl,
      checkedAt: now,
    };
    await setSetting(db, SETTING.updateCheck, JSON.stringify(next));
    return statusFrom(current, next);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Could not reach GitHub.";
    const next: CacheShape = cached ?? { latest: null, htmlUrl: null, checkedAt: now };
    if (!cached) {
      await setSetting(db, SETTING.updateCheck, JSON.stringify(next));
    }
    return { ...statusFrom(current, next), error };
  }
}

function statusFrom(current: string, cache: CacheShape): UpdateStatus {
  const latest = cache.latest;
  const newer = Boolean(latest && isStableTag(latest) && compareVersions(latest, current) > 0);
  return {
    current,
    latest,
    newer,
    htmlUrl: cache.htmlUrl,
    checkedAt: cache.checkedAt,
  };
}

async function fetchLatest(
  fetcher: typeof fetch,
): Promise<{ tag: string | null; htmlUrl: string | null }> {
  const response = await fetcher(`https://api.github.com/repos/${UPSTREAM_REPO}/releases/latest`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "formflare-update-check",
    },
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);

  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null) throw new Error("Unexpected GitHub payload.");
  const record = body as { tag_name?: unknown; html_url?: unknown; prerelease?: unknown; draft?: unknown };

  if (record.draft === true || record.prerelease === true) {
    return { tag: null, htmlUrl: null };
  }

  const tag = typeof record.tag_name === "string" ? record.tag_name : null;
  if (!tag || !isStableTag(tag)) return { tag: null, htmlUrl: null };

  return {
    tag,
    htmlUrl: typeof record.html_url === "string" ? record.html_url : null,
  };
}

function parseCache(raw: string | null): CacheShape | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as { latest?: unknown; htmlUrl?: unknown; checkedAt?: unknown };
    if (typeof record.checkedAt !== "number") return null;
    return {
      latest: typeof record.latest === "string" ? record.latest : null,
      htmlUrl: typeof record.htmlUrl === "string" ? record.htmlUrl : null,
      checkedAt: record.checkedAt,
    };
  } catch {
    return null;
  }
}
