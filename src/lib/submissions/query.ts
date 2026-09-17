import { and, desc, eq, gte, lt, lte, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "../db/client";
import { forms, submissions, type Submission } from "../db/schema";

/**
 * Submission listing with cursor pagination.
 *
 * Cursor, not OFFSET. `OFFSET 10000` makes SQLite walk and discard 10,000 rows on every
 * page, so deep pages get progressively slower, and a row inserted while someone pages
 * shifts every subsequent page — duplicating or skipping entries. A cursor anchored on
 * the last id seen is O(index seek) and stable under concurrent inserts.
 *
 * The cursor is the submission id. Ids are ULIDs, so they sort by creation time and a
 * single column orders the result deterministically — no (timestamp, id) tuple needed.
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export interface SubmissionFilters {
  formId?: string;
  status?: "new" | "read" | "archived" | "spam";
  /** Inclusive ms timestamps. */
  from?: number;
  to?: number;
  search?: string;
}

export interface SubmissionPage {
  items: (Submission & { formName: string; formPublicId: string })[];
  nextCursor: string | null;
}

export function clampPageSize(requested: number | undefined): number {
  if (!requested || !Number.isFinite(requested)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(requested), 1), MAX_PAGE_SIZE);
}

function buildWhere(filters: SubmissionFilters, cursor: string | null): SQL | undefined {
  const clauses: (SQL | undefined)[] = [];

  if (filters.formId) clauses.push(eq(submissions.formId, filters.formId));
  if (filters.status) clauses.push(eq(submissions.status, filters.status));
  if (filters.from !== undefined) clauses.push(gte(submissions.createdAt, filters.from));
  if (filters.to !== undefined) clauses.push(lte(submissions.createdAt, filters.to));

  // Descending order, so "after this cursor" means a smaller id.
  if (cursor) clauses.push(lt(submissions.id, cursor));

  if (filters.search) {
    // v1 search is LIKE over the stored JSON and the extracted email. Good enough for
    // the volumes a self-hosted form backend sees, and it needs no extra table.
    //
    // ponytail: full scan per query; move to an FTS5 virtual table if instances with
    // large submission counts report slow search. FTS5 would need a trigger-maintained
    // index and a migration, which is not worth it before anyone feels the pain.
    // `ESCAPE '\'` is required: escapeLike() prefixes wildcards with a backslash, but
    // SQLite has no default escape character, so without this clause the backslash is
    // matched literally and the escaped term finds nothing.
    const term = `%${escapeLike(filters.search)}%`;
    clauses.push(
      or(
        sql`${submissions.dataJson} LIKE ${term} ESCAPE '\\'`,
        sql`${submissions.email} LIKE ${term} ESCAPE '\\'`,
      ),
    );
  }

  const present = clauses.filter((c): c is SQL => c !== undefined);
  return present.length > 0 ? and(...present) : undefined;
}

/** `%` and `_` are LIKE wildcards; a literal search for them must not match everything. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function listSubmissions(
  db: Database,
  filters: SubmissionFilters = {},
  cursor: string | null = null,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<SubmissionPage> {
  const limit = clampPageSize(pageSize);

  const rows = await db
    .select({
      submission: submissions,
      formName: forms.name,
      formPublicId: forms.publicId,
    })
    .from(submissions)
    .innerJoin(forms, eq(forms.id, submissions.formId))
    .where(buildWhere(filters, cursor))
    .orderBy(desc(submissions.id))
    // One extra row tells us whether another page exists without a second COUNT query.
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: page.map((r) => ({
      ...r.submission,
      formName: r.formName,
      formPublicId: r.formPublicId,
    })),
    nextCursor: hasMore ? page[page.length - 1].submission.id : null,
  };
}

export async function getSubmission(
  db: Database,
  id: string,
): Promise<(Submission & { formName: string; formPublicId: string }) | null> {
  const rows = await db
    .select({ submission: submissions, formName: forms.name, formPublicId: forms.publicId })
    .from(submissions)
    .innerJoin(forms, eq(forms.id, submissions.formId))
    .where(eq(submissions.id, id))
    .limit(1);

  const row = rows[0];
  return row ? { ...row.submission, formName: row.formName, formPublicId: row.formPublicId } : null;
}

/** Parse the `LIKE`-escaped search term back out of a query string. */
export function parseFilters(params: URLSearchParams): SubmissionFilters {
  const filters: SubmissionFilters = {};

  const formId = params.get("form");
  if (formId) filters.formId = formId;

  const status = params.get("status");
  if (status === "new" || status === "read" || status === "archived" || status === "spam") {
    filters.status = status;
  }

  const search = params.get("q");
  if (search && search.trim()) filters.search = search.trim().slice(0, 200);

  const from = params.get("from");
  if (from) {
    const ms = Date.parse(from);
    if (Number.isFinite(ms)) filters.from = ms;
  }

  const to = params.get("to");
  if (to) {
    const ms = Date.parse(to);
    // Inclusive of the whole day when a bare date is given.
    if (Number.isFinite(ms)) filters.to = /^\d{4}-\d{2}-\d{2}$/.test(to) ? ms + 86_399_999 : ms;
  }

  return filters;
}
