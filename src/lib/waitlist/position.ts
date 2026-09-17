/**
 * Waitlist positions.
 *
 * Positions must be unique and gap-free: "You're #214" is worthless if two people get
 * 214, and suspicious if the numbers skip.
 *
 * The counter lives on `forms.submission_count`, and the increment and read happen in a
 * single UPDATE ... RETURNING. That is what makes it safe: `SELECT` then `UPDATE` would
 * let two concurrent signups read the same value.
 *
 * This is sound on D1 because each database is backed by a single Durable Object, so
 * writes are serialised — statements from different requests cannot interleave. It is
 * not a property of SQLite in general.
 */
/**
 * Claim the next waitlist position.
 *
 * `UPDATE ... RETURNING` is one statement, so the increment and the read of the new
 * value cannot be separated by another request's write.
 */
export async function claimPosition(d1: D1Database, formId: string): Promise<number> {
  const row = await d1
    .prepare(
      `UPDATE forms
         SET submission_count = submission_count + 1,
             updated_at = ?2
       WHERE id = ?1
       RETURNING submission_count`,
    )
    .bind(formId, Date.now())
    .first<{ submission_count: number }>();

  if (!row) throw new Error(`form ${formId} disappeared while claiming a position`);
  return row.submission_count;
}

/**
 * Find an existing waitlist signup for this email.
 *
 * A duplicate is not an error (Section 12.1): the submitter is told their original
 * position, so re-submitting the form is idempotent from their point of view and does
 * not leak whether someone else signed up with that address.
 */
export async function findExistingSignup(
  d1: D1Database,
  formId: string,
  normalisedEmail: string,
): Promise<{ id: string; position: number | null; optedInAt: number | null } | null> {
  // lower() on both sides, matching migration 0002's index, so this finds the row that
  // the unique index would collide with.
  const row = await d1
    .prepare(
      `SELECT id, waitlist_position, opted_in_at
         FROM submissions
        WHERE form_id = ?1 AND lower(email) = lower(?2)
        LIMIT 1`,
    )
    .bind(formId, normalisedEmail)
    .first<{ id: string; waitlist_position: number | null; opted_in_at: number | null }>();

  return row
    ? { id: row.id, position: row.waitlist_position, optedInAt: row.opted_in_at }
    : null;
}

/** Increment only, for non-waitlist forms that still track a total. */
export async function bumpSubmissionCount(d1: D1Database, formId: string): Promise<void> {
  await d1
    .prepare(`UPDATE forms SET submission_count = submission_count + 1 WHERE id = ?1`)
    .bind(formId)
    .run();
}
