-- Waitlist dedupe.
--
-- Hand-written because Drizzle cannot express a partial index's WHERE clause.
--
-- One signup per email per form, but only where an email is actually present:
-- standard (non-waitlist) forms may have many submissions with a NULL email, and
-- SQLite treats each NULL as distinct in a plain UNIQUE index anyway. Scoping the
-- index with WHERE keeps it small and makes the intent explicit.
--
-- Emails must be normalised (trimmed, lowercased) before insert — SQLite's default
-- collation is case-sensitive, so "A@b.com" and "a@b.com" would otherwise both be
-- accepted as separate rows.
CREATE UNIQUE INDEX IF NOT EXISTS submissions_form_email_uq
  ON submissions (form_id, email)
  WHERE email IS NOT NULL;
