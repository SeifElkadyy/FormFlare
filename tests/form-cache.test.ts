import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/lib/db/client";
import { forms, projects } from "../src/lib/db/schema";
import { publicId as newPublicId, ulid } from "../src/lib/ids";
import {
  FORM_CACHE_TTL_MS,
  clearFormCache,
  invalidateForm,
  loadForm,
} from "../src/lib/submissions/form-cache";

const db = createDb(env.DB);

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
    name: "Original",
    createdAt: now,
    updatedAt: now,
  });

  return { formId, publicId: pid };
}

beforeEach(async () => {
  await db.delete(forms);
  await db.delete(projects);
  clearFormCache();
});

describe("form cache", () => {
  it("returns the form and caches it", async () => {
    const { publicId } = await seedForm();

    const first = await loadForm(db, publicId);
    expect(first?.name).toBe("Original");

    // Change the row behind the cache's back.
    await db.update(forms).set({ name: "Renamed" }).where(eq(forms.publicId, publicId));

    // Still the cached copy — this is the documented 30s staleness window.
    const second = await loadForm(db, publicId);
    expect(second?.name).toBe("Original");
  });

  /**
   * The stale window has a real consequence: a deactivated form keeps accepting
   * submissions until the entry expires. Documented in the FAQ and troubleshooting guide.
   */
  it("serves a deactivated form until the TTL expires", async () => {
    const { publicId } = await seedForm();
    const start = Date.now();

    expect((await loadForm(db, publicId, start))?.active).toBe(true);

    await db.update(forms).set({ active: false }).where(eq(forms.publicId, publicId));

    // Just before expiry: still active.
    expect((await loadForm(db, publicId, start + FORM_CACHE_TTL_MS - 1))?.active).toBe(true);

    // After expiry: re-read, now inactive.
    expect((await loadForm(db, publicId, start + FORM_CACHE_TTL_MS + 1))?.active).toBe(false);
  });

  /** The isolate that made the change must see it at once, not in 30 seconds. */
  it("invalidateForm clears the entry immediately", async () => {
    const { publicId } = await seedForm();

    await loadForm(db, publicId);
    await db.update(forms).set({ name: "Renamed" }).where(eq(forms.publicId, publicId));

    invalidateForm(publicId);

    expect((await loadForm(db, publicId))?.name).toBe("Renamed");
  });

  it("caches misses too, so unknown ids do not hit D1 every time", async () => {
    const unknown = newPublicId();
    expect(await loadForm(db, unknown)).toBeNull();
    expect(await loadForm(db, unknown)).toBeNull();
  });

  it("clearFormCache empties everything", async () => {
    const { publicId } = await seedForm();

    await loadForm(db, publicId);
    await db.update(forms).set({ name: "Renamed" }).where(eq(forms.publicId, publicId));

    clearFormCache();

    expect((await loadForm(db, publicId))?.name).toBe("Renamed");
  });

  it("is documented as 30 seconds", () => {
    expect(FORM_CACHE_TTL_MS).toBe(30_000);
  });
});
