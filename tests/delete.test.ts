import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/lib/db/client";
import { files, forms, projects, submissions } from "../src/lib/db/schema";
import { publicId as newPublicId, ulid } from "../src/lib/ids";
import { r2Storage } from "../src/lib/platform/storage";
import {
  deleteForm,
  deleteSubmission,
  deleteSubmissions,
  sweepOrphanedObjects,
} from "../src/lib/submissions/delete";

const db = createDb(env.DB);
const storage = r2Storage(env.BUCKET);

async function seedSubmissionWithFile(formId: string, key: string) {
  const now = Date.now();
  const submissionId = ulid();

  await env.BUCKET.put(key, "file contents");
  await db.insert(submissions).values({
    id: submissionId,
    formId,
    dataJson: "{}",
    email: `${submissionId}@example.com`,
    createdAt: now,
  });
  await db.insert(files).values({
    id: ulid(),
    submissionId,
    fieldName: "cv",
    r2Key: key,
    filename: "cv.txt",
    contentType: "text/plain",
    size: 13,
    createdAt: now,
  });

  return submissionId;
}

async function seedForm() {
  const now = Date.now();
  const projectId = ulid();
  const formId = ulid();
  const pid = newPublicId();

  await db.insert(projects).values({ id: projectId, name: "P", createdAt: now });
  await db.insert(forms).values({
    id: formId,
    publicId: pid,
    projectId,
    name: "F",
    createdAt: now,
    updatedAt: now,
  });

  return { formId, publicId: pid };
}

beforeEach(async () => {
  await db.delete(files);
  await db.delete(submissions);
  await db.delete(forms);
  await db.delete(projects);

  // R2 has no truncate; clear whatever previous tests left.
  const listing = await env.BUCKET.list({ limit: 1000 });
  for (const object of listing.objects) await env.BUCKET.delete(object.key);
});

describe("deleteSubmission", () => {
  /**
   * The gap a foreign-key cascade leaves: it removes the `files` row inside SQLite and
   * cannot touch R2, so the object would be orphaned and billed forever.
   */
  it("deletes the R2 object, not just the rows", async () => {
    const { formId } = await seedForm();
    const key = `${formId}/one/file.txt`;
    const submissionId = await seedSubmissionWithFile(formId, key);

    expect(await env.BUCKET.get(key)).not.toBeNull();

    await deleteSubmission(db, storage, submissionId);

    expect(await env.BUCKET.get(key)).toBeNull();
    expect(
      await db.select().from(submissions).where(eq(submissions.id, submissionId)),
    ).toHaveLength(0);
    expect(await db.select().from(files).where(eq(files.submissionId, submissionId))).toHaveLength(
      0,
    );
  });

  it("leaves other submissions' objects alone", async () => {
    const { formId } = await seedForm();
    const keepKey = `${formId}/keep/file.txt`;
    const dropKey = `${formId}/drop/file.txt`;

    await seedSubmissionWithFile(formId, keepKey);
    const dropId = await seedSubmissionWithFile(formId, dropKey);

    await deleteSubmission(db, storage, dropId);

    expect(await env.BUCKET.get(keepKey)).not.toBeNull();
    expect(await env.BUCKET.get(dropKey)).toBeNull();
  });
});

describe("deleteSubmissions (bulk)", () => {
  it("deletes every object for the given submissions", async () => {
    const { formId } = await seedForm();
    const ids: string[] = [];
    const keys: string[] = [];

    for (let i = 0; i < 3; i++) {
      const key = `${formId}/bulk${i}/file.txt`;
      keys.push(key);
      ids.push(await seedSubmissionWithFile(formId, key));
    }

    await deleteSubmissions(db, storage, ids);

    for (const key of keys) expect(await env.BUCKET.get(key)).toBeNull();
    expect(await db.select().from(submissions)).toHaveLength(0);
  });

  it("is a no-op for an empty list", async () => {
    const { formId } = await seedForm();
    const key = `${formId}/safe/file.txt`;
    await seedSubmissionWithFile(formId, key);

    await deleteSubmissions(db, storage, []);

    expect(await env.BUCKET.get(key)).not.toBeNull();
  });
});

describe("deleteForm", () => {
  it("deletes the form, its submissions and all their R2 objects", async () => {
    const { formId, publicId } = await seedForm();
    const keys = [`${formId}/a/file.txt`, `${formId}/b/file.txt`];
    for (const key of keys) await seedSubmissionWithFile(formId, key);

    await deleteForm(db, storage, formId, publicId);

    for (const key of keys) expect(await env.BUCKET.get(key)).toBeNull();
    expect(await db.select().from(forms).where(eq(forms.id, formId))).toHaveLength(0);
    expect(await db.select().from(submissions).where(eq(submissions.formId, formId))).toHaveLength(
      0,
    );
  });
});

describe("sweepOrphanedObjects", () => {
  /** Covers objects stranded by a crash between the R2 put and the D1 insert. */
  it("deletes objects with no files row", async () => {
    const { formId } = await seedForm();
    const tracked = `${formId}/tracked/file.txt`;
    const orphan = `${formId}/orphan/file.txt`;

    await seedSubmissionWithFile(formId, tracked);
    await env.BUCKET.put(orphan, "stranded");

    // Grace 0 so the just-written objects are eligible.
    const result = await sweepOrphanedObjects(db, env.BUCKET, Date.now() + 1000, 0);

    expect(result.deleted).toBe(1);
    expect(await env.BUCKET.get(orphan)).toBeNull();
    expect(await env.BUCKET.get(tracked)).not.toBeNull();
  });

  /**
   * An upload that is mid-request legitimately has no row yet. Without a grace period
   * the sweep would delete files out from under live submissions.
   */
  it("spares recently uploaded objects", async () => {
    const orphan = "recent/file.txt";
    await env.BUCKET.put(orphan, "just uploaded");

    const result = await sweepOrphanedObjects(db, env.BUCKET, Date.now(), 60 * 60 * 1000);

    expect(result.deleted).toBe(0);
    expect(await env.BUCKET.get(orphan)).not.toBeNull();
  });
});
