import { expect } from "vitest";

/**
 * Assert that a query failed on a UNIQUE constraint.
 *
 * Drizzle wraps D1 failures in a generic "Failed query: ..." Error and puts the
 * real SQLite message on `cause`, so matching the top-level message would pass for
 * any failed query at all. Checking `cause` pins the specific constraint.
 *
 * `expected` is matched against the cause so a test can name what should have
 * fired. SQLite phrases this two ways:
 *   - column indexes  → "UNIQUE constraint failed: users.email"
 *   - expression indexes → "UNIQUE constraint failed: index 'submissions_form_email_ci_uq'"
 * Pass whichever the index in question produces.
 */
export async function expectUniqueViolation(
  promise: Promise<unknown>,
  expected?: string,
): Promise<void> {
  let cause: string | undefined;

  try {
    await promise;
  } catch (err) {
    cause = (err as { cause?: { message?: string } }).cause?.message;
  }

  expect(cause, "expected the query to throw a D1 error").toBeDefined();
  expect(cause).toMatch(/UNIQUE constraint failed/i);
  if (expected) expect(cause).toContain(expected);
}
