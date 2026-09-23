/**
 * Per-form numbers for the Insights page: views, submissions per day, where people came
 * from, and (for waitlists) the ranked leaderboard.
 *
 * All read-time aggregation over existing rows. Nothing here runs on the submit path
 * except `recordView`, which is one upsert per hosted-page render.
 */

export const DAY_MS = 86_400_000;

export function dayOf(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

/** Count one hosted-page or widget view for today. */
export async function recordView(d1: D1Database, formId: string, now = Date.now()): Promise<void> {
  await d1
    .prepare(
      `INSERT INTO form_views (form_id, day, views) VALUES (?1, ?2, 1)
       ON CONFLICT (form_id, day) DO UPDATE SET views = views + 1`,
    )
    .bind(formId, dayOf(now))
    .run();
}

export interface DailyPoint {
  /** Days since the epoch, UTC. */
  day: number;
  submissions: number;
  views: number;
}

export interface FormActivity {
  days: DailyPoint[];
  totals: { submissions: number; views: number };
  /** Submissions / views over the window, or null when there were no views to divide by. */
  conversion: number | null;
}

/**
 * The last `days` UTC days, oldest first, with zero-filled gaps so a chart can map
 * index to position. Spam is excluded: it is not a submission anyone wanted.
 */
export async function formActivity(
  d1: D1Database,
  formId: string,
  days = 30,
  now = Date.now(),
): Promise<FormActivity> {
  const today = dayOf(now);
  const first = today - days + 1;

  const [subs, views] = await Promise.all([
    d1
      .prepare(
        `SELECT created_at / ${DAY_MS} AS day, count(*) AS n FROM submissions
          WHERE form_id = ?1 AND created_at >= ?2 AND status != 'spam'
          GROUP BY day`,
      )
      .bind(formId, first * DAY_MS)
      .all<{ day: number; n: number }>(),
    d1
      .prepare(`SELECT day, views AS n FROM form_views WHERE form_id = ?1 AND day >= ?2`)
      .bind(formId, first)
      .all<{ day: number; n: number }>(),
  ]);

  const subByDay = new Map(subs.results.map((r) => [Math.floor(r.day), r.n]));
  const viewByDay = new Map(views.results.map((r) => [r.day, r.n]));

  const points: DailyPoint[] = [];
  for (let day = first; day <= today; day++) {
    points.push({ day, submissions: subByDay.get(day) ?? 0, views: viewByDay.get(day) ?? 0 });
  }

  const totals = points.reduce(
    (acc, p) => ({ submissions: acc.submissions + p.submissions, views: acc.views + p.views }),
    { submissions: 0, views: 0 },
  );
  return {
    days: points,
    totals,
    conversion: totals.views > 0 ? totals.submissions / totals.views : null,
  };
}

export interface SourceRow {
  label: string;
  count: number;
}

/**
 * Top referring sites and countries over the window. Referrers are stored as full URLs;
 * collapsing to hostnames happens here, so the SQL groups on the raw value and this
 * merges rows that share a host.
 */
export async function formSources(
  d1: D1Database,
  formId: string,
  days = 30,
  now = Date.now(),
  limit = 5,
): Promise<{ referrers: SourceRow[]; countries: SourceRow[] }> {
  const since = (dayOf(now) - days + 1) * DAY_MS;
  const [refs, countries] = await Promise.all([
    d1
      .prepare(
        `SELECT referrer AS label, count(*) AS n FROM submissions
          WHERE form_id = ?1 AND created_at >= ?2 AND status != 'spam'
          GROUP BY referrer ORDER BY n DESC LIMIT 200`,
      )
      .bind(formId, since)
      .all<{ label: string | null; n: number }>(),
    d1
      .prepare(
        `SELECT country AS label, count(*) AS n FROM submissions
          WHERE form_id = ?1 AND created_at >= ?2 AND status != 'spam' AND country IS NOT NULL
          GROUP BY country ORDER BY n DESC LIMIT ?3`,
      )
      .bind(formId, since, limit)
      .all<{ label: string; n: number }>(),
  ]);

  const byHost = new Map<string, number>();
  for (const row of refs.results) {
    const host = referrerHost(row.label);
    byHost.set(host, (byHost.get(host) ?? 0) + row.n);
  }

  return {
    referrers: [...byHost.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit),
    countries: countries.results.map((r) => ({ label: r.label, count: r.n })),
  };
}

export function referrerHost(value: string | null): string {
  if (!value) return "Direct";
  try {
    return new URL(value).hostname.replace(/^www\./, "") || "Direct";
  } catch {
    return "Direct";
  }
}

export interface LeaderboardRow {
  id: string;
  rank: number;
  email: string | null;
  position: number;
  referrals: number;
  createdAt: number;
}

export interface WaitlistSummary {
  confirmed: number;
  pending: number;
  /** Confirmed signups that arrived through someone's referral link. */
  referred: number;
  top: LeaderboardRow[];
}

/**
 * Confirmed signups in rank order. Same score and tie-break as `waitlistRank`, so the
 * number shown here is the number that signup was told.
 */
export async function waitlistSummary(
  d1: D1Database,
  formId: string,
  boost: number,
  limit = 50,
): Promise<WaitlistSummary> {
  const [counts, top] = await Promise.all([
    d1
      .prepare(
        `SELECT
           sum(CASE WHEN waitlist_position IS NOT NULL THEN 1 ELSE 0 END) AS confirmed,
           sum(CASE WHEN waitlist_position IS NULL THEN 1 ELSE 0 END) AS pending,
           sum(CASE WHEN waitlist_position IS NOT NULL AND referred_by_id IS NOT NULL THEN 1 ELSE 0 END) AS referred
         FROM submissions WHERE form_id = ?1 AND status != 'spam'`,
      )
      .bind(formId)
      .first<{ confirmed: number | null; pending: number | null; referred: number | null }>(),
    d1
      .prepare(
        `SELECT id, email, waitlist_position AS position, referral_count AS referrals, created_at AS createdAt
           FROM submissions
          WHERE form_id = ?1 AND waitlist_position IS NOT NULL
          ORDER BY (waitlist_position - referral_count * ?2), id
          LIMIT ?3`,
      )
      .bind(formId, boost, limit)
      .all<Omit<LeaderboardRow, "rank">>(),
  ]);

  return {
    confirmed: counts?.confirmed ?? 0,
    pending: counts?.pending ?? 0,
    referred: counts?.referred ?? 0,
    top: top.results.map((row, i) => ({ ...row, rank: i + 1 })),
  };
}
