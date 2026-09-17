import { eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import { files as filesTable, forms, submissions } from "../db/schema";
import type { Storage } from "../platform/storage";
import { invalidateForm } from "./form-cache";

/**
 * Deletion paths that also clean up R2.
 *
 * Foreign keys cascade the `files` rows, but a cascade runs inside SQLite and cannot
 * reach object storage. Deleting only the rows would orphan every uploaded object —
 * invisible, unreferenced and billed forever.
 *
 * So R2 objects are deleted explicitly here, and the keys are read *before* the rows
 * are removed: once the row is gone, the key is unknowable. A daily sweep
 * (`runDailyMaintenance`) catches anything stranded by a crash between the two steps.
 */

/** Delete one submission, its file rows and its R2 objects. */
export async function deleteSubmission(
  db: Database,
  storage: Storage,
  submissionId: string,
): Promise<void> {
  const keys = await db
    .select({ r2Key: filesTable.r2Key })
    .from(filesTable)
    .where(eq(filesTable.submissionId, submissionId));

  // Objects first: if this fails, the row still points at them and the sweep can retry.
  // Deleting the row first would lose the keys entirely.
  for (const { r2Key } of keys) {
    await storage.delete(r2Key).catch(() => {});
  }

  await db.delete(submissions).where(eq(submissions.id, submissionId));
}

/** Delete several submissions (bulk actions in the inbox). */
export async function deleteSubmissions(
  db: Database,
  storage: Storage,
  submissionIds: string[],
): Promise<void> {
  if (submissionIds.length === 0) return;

  const keys = await db
    .select({ r2Key: filesTable.r2Key })
    .from(filesTable)
    .where(inArray(filesTable.submissionId, submissionIds));

  for (const { r2Key } of keys) {
    await storage.delete(r2Key).catch(() => {});
  }

  await db.delete(submissions).where(inArray(submissions.id, submissionIds));
}

/** Delete a form, all its submissions, and every R2 object they reference. */
export async function deleteForm(
  db: Database,
  storage: Storage,
  formId: string,
  publicId: string,
): Promise<void> {
  // Join through submissions: file rows have no form_id of their own.
  const keys = await db
    .select({ r2Key: filesTable.r2Key })
    .from(filesTable)
    .innerJoin(submissions, eq(submissions.id, filesTable.submissionId))
    .where(eq(submissions.formId, formId));

  for (const { r2Key } of keys) {
    await storage.delete(r2Key).catch(() => {});
  }

  await db.delete(forms).where(eq(forms.id, formId));

  // Clear this isolate's cache so the dashboard stops serving the deleted form
  // immediately. Other isolates expire within the cache TTL.
  invalidateForm(publicId);
}

/**
 * Delete R2 objects with no `files` row.
 *
 * Covers objects stranded by a crash between the R2 put and the D1 insert, which the
 * delete paths above cannot know about.
 *
 * `newerThanMs` skips recently written objects, because an upload that is mid-request
 * legitimately has no row yet — deleting those would break live submissions.
 */
export async function sweepOrphanedObjects(
  db: Database,
  bucket: R2Bucket,
  now: number = Date.now(),
  graceMs: number = 60 * 60 * 1000,
): Promise<{ scanned: number; deleted: number }> {
  let cursor: string | undefined;
  let scanned = 0;
  let deleted = 0;

  do {
    const listing = await bucket.list({ cursor, limit: 500 });
    cursor = listing.truncated ? listing.cursor : undefined;

    const candidates = listing.objects.filter(
      (object) => now - object.uploaded.getTime() > graceMs,
    );
    scanned += candidates.length;
    if (candidates.length === 0) continue;

    const keys = candidates.map((o) => o.key);
    const known = await db
      .select({ r2Key: filesTable.r2Key })
      .from(filesTable)
      .where(inArray(filesTable.r2Key, keys));
    const knownKeys = new Set(known.map((k) => k.r2Key));

    for (const key of keys) {
      if (knownKeys.has(key)) continue;
      await bucket.delete(key).catch(() => {});
      deleted++;
    }
  } while (cursor);

  return { scanned, deleted };
}
