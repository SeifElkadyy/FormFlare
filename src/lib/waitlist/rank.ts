/**
 * 1-based rank among confirmed signups on this form.
 *
 * Score is `waitlist_position - referral_count * boost`. Ties break on id (ULID,
 * so earlier signup wins). Unconfirmed double-opt-in rows have a null position
 * and are excluded. The stored position is never rewritten — colliding updates
 * would break uniqueness of signup order.
 */
export function waitlistScore(position: number, referralCount: number, boost: number): number {
  return position - referralCount * boost;
}

export async function waitlistRank(
  d1: D1Database,
  formId: string,
  submissionId: string,
): Promise<{ rank: number; position: number; referrals: number; boost: number } | null> {
  const row = await d1
    .prepare(
      `SELECT s.waitlist_position AS position,
              s.referral_count AS referrals,
              f.referral_boost AS boost
         FROM submissions s
         JOIN forms f ON f.id = s.form_id
        WHERE s.id = ?1`,
    )
    .bind(submissionId)
    .first<{ position: number | null; referrals: number; boost: number }>();

  if (!row || row.position === null) return null;

  const score = waitlistScore(row.position, row.referrals, row.boost);
  const ahead = await d1
    .prepare(
      `SELECT count(*) AS n FROM submissions
        WHERE form_id = ?1
          AND waitlist_position IS NOT NULL
          AND (
            (waitlist_position - referral_count * ?2) < ?3
            OR (
              (waitlist_position - referral_count * ?2) = ?3
              AND id < ?4
            )
          )`,
    )
    .bind(formId, row.boost, score, submissionId)
    .first<{ n: number }>();

  return {
    rank: (ahead?.n ?? 0) + 1,
    position: row.position,
    referrals: row.referrals,
    boost: row.boost,
  };
}

/** Confirmed waitlist signups, or every submission on a standard form. */
export async function publicCount(d1: D1Database, publicId: string): Promise<number | null> {
  const form = await d1
    .prepare(`SELECT id, mode, double_opt_in FROM forms WHERE public_id = ?1 AND active = 1`)
    .bind(publicId)
    .first<{ id: string; mode: string; double_opt_in: number }>();
  if (!form) return null;

  if (form.mode === "waitlist" && form.double_opt_in) {
    const counted = await d1
      .prepare(
        `SELECT count(*) AS n FROM submissions
          WHERE form_id = ?1 AND waitlist_position IS NOT NULL AND opted_in_at IS NOT NULL`,
      )
      .bind(form.id)
      .first<{ n: number }>();
    return counted?.n ?? 0;
  }

  const counted = await d1
    .prepare(`SELECT count(*) AS n FROM submissions WHERE form_id = ?1 AND status != 'spam'`)
    .bind(form.id)
    .first<{ n: number }>();
  return counted?.n ?? 0;
}
