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
