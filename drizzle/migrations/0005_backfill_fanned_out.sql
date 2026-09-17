-- Backfill `fanned_out_at` for submissions that predate the column.
--
-- `0004` added the column as nullable, so every existing row is NULL. To the recovery
-- sweep that looks identical to "fan-out never completed", so on an instance upgrading
-- past 0004 the sweep would re-enqueue the entire submission history — once, and
-- harmlessly, because fan-out is idempotent and those deliveries already resolved, but
-- it would run against a permanent backlog on every 15-minute tick until each row was
-- touched.
--
-- Setting the marker to `created_at` (rather than now) keeps the column honest: it
-- records when the submission was handled, and these were handled at creation time by
-- the code that ran before the column existed.
--
-- Safe to re-run: the WHERE clause makes it a no-op once applied.
UPDATE submissions
   SET fanned_out_at = created_at
 WHERE fanned_out_at IS NULL;
