-- Case-insensitive waitlist dedupe.
--
-- 0001 indexes the raw email, so it only catches byte-identical duplicates:
-- SQLite's default collation is case-sensitive, and "A@Example.com" would slip
-- past it as a separate signup. Callers are supposed to normalise before insert,
-- but that is a convention a future code path can forget. This index makes the
-- database enforce it.
--
-- Defence in depth: normalisation stays in code (it is what gets *stored* and
-- shown in the dashboard), and this index guarantees the invariant even if a
-- caller skips it.
--
-- Indexed on lower(email) rather than adding a generated column: SQLite supports
-- expression indexes directly, so this needs no schema change and no backfill.
--
-- 0001's index is kept alongside this one. It is redundant for correctness but
-- serves lookups on the exact stored value, and dropping an index that shipped
-- is not worth the migration risk.
--
-- Note: lower() is ASCII-only in SQLite, so it does not fold non-ASCII case
-- (e.g. "İ"). Real-world email localparts are effectively ASCII, and the code-side
-- normalisation is the same lower(), so the two agree.
CREATE UNIQUE INDEX IF NOT EXISTS submissions_form_email_ci_uq
  ON submissions (form_id, lower(email))
  WHERE email IS NOT NULL;
