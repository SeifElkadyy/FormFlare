import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/lib/db/client";
import { forms, projects, submissions } from "../src/lib/db/schema";
import { publicId as newPublicId, ulid } from "../src/lib/ids";
import {
  MAX_PAGE_SIZE,
  clampPageSize,
  escapeLike,
  getSubmission,
  listSubmissions,
  parseFilters,
} from "../src/lib/submissions/query";

const db = createDb(env.DB);

async function seedForm(name = "Contact") {
  const now = Date.now();
  const projectId = ulid();
  const formId = ulid();

  await db.insert(projects).values({ id: projectId, name: "P", createdAt: now });
  await db.insert(forms).values({
    id: formId,
    publicId: newPublicId(),
    projectId,
    name,
    createdAt: now,
    updatedAt: now,
  });
  return formId;
}

/** Ids are ULIDs, so passing an increasing timestamp fixes the sort order. */
async function seedSubmission(
  formId: string,
  index: number,
  overrides: Partial<typeof submissions.$inferInsert> = {},
) {
  const createdAt = 1_700_000_000_000 + index * 1000;
  const id = ulid(createdAt);
  await db.insert(submissions).values({
    id,
    formId,
    dataJson: JSON.stringify({ message: `message ${index}` }),
    email: `person${index}@example.com`,
    createdAt,
    ...overrides,
  });
  return id;
}

beforeEach(async () => {
  await db.delete(submissions);
  await db.delete(forms);
  await db.delete(projects);
});

describe("clampPageSize", () => {
  it("defaults, floors and caps", () => {
    expect(clampPageSize(undefined)).toBe(50);
    expect(clampPageSize(10)).toBe(10);
    expect(clampPageSize(0)).toBe(50); // falsy → default
    expect(clampPageSize(-5)).toBe(1);
    // A caller cannot ask for the whole table in one request.
    expect(clampPageSize(10_000)).toBe(MAX_PAGE_SIZE);
    expect(clampPageSize(NaN)).toBe(50);
  });
});

describe("cursor pagination", () => {
  it("walks every row exactly once with no duplicates", async () => {
    const formId = await seedForm();
    for (let i = 0; i < 25; i++) await seedSubmission(formId, i);

    const seen: string[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < 10; page++) {
      const result = await listSubmissions(db, {}, cursor, 10);
      seen.push(...result.items.map((r) => r.id));
      cursor = result.nextCursor;
      if (!cursor) break;
    }

    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
  });

  it("returns newest first", async () => {
    const formId = await seedForm();
    for (let i = 0; i < 5; i++) await seedSubmission(formId, i);

    const page = await listSubmissions(db, {}, null, 10);
    const timestamps = page.items.map((r) => r.createdAt);
    expect([...timestamps].sort((a, b) => b - a)).toEqual(timestamps);
  });

  it("reports no cursor on the last page", async () => {
    const formId = await seedForm();
    for (let i = 0; i < 3; i++) await seedSubmission(formId, i);

    const page = await listSubmissions(db, {}, null, 10);
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  /**
   * The reason for a cursor rather than OFFSET: with OFFSET, a row inserted while
   * someone pages shifts every later page, so an entry is duplicated or skipped.
   */
  it("is stable when rows are inserted mid-pagination", async () => {
    const formId = await seedForm();
    for (let i = 0; i < 10; i++) await seedSubmission(formId, i);

    const first = await listSubmissions(db, {}, null, 5);

    // A new submission arrives between page 1 and page 2.
    await seedSubmission(formId, 99);

    const second = await listSubmissions(db, {}, first.nextCursor, 5);

    const overlap = first.items.filter((a) => second.items.some((b) => b.id === a.id));
    expect(overlap).toHaveLength(0);
    expect(second.items).toHaveLength(5);
  });

  it("joins the form name", async () => {
    const formId = await seedForm("Beta waitlist");
    await seedSubmission(formId, 0);

    const page = await listSubmissions(db, {}, null, 10);
    expect(page.items[0].formName).toBe("Beta waitlist");
  });
});

describe("filters", () => {
  it("filters by form", async () => {
    const a = await seedForm("A");
    const b = await seedForm("B");
    await seedSubmission(a, 0);
    await seedSubmission(b, 1);

    const page = await listSubmissions(db, { formId: a }, null, 10);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].formName).toBe("A");
  });

  it("filters by status", async () => {
    const formId = await seedForm();
    await seedSubmission(formId, 0);
    await seedSubmission(formId, 1, { status: "spam" });

    const page = await listSubmissions(db, { status: "spam" }, null, 10);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].status).toBe("spam");
  });

  it("filters by date range", async () => {
    const formId = await seedForm();
    for (let i = 0; i < 5; i++) await seedSubmission(formId, i);

    const page = await listSubmissions(
      db,
      { from: 1_700_000_002_000, to: 1_700_000_003_000 },
      null,
      10,
    );
    expect(page.items).toHaveLength(2);
  });

  it("searches the stored data and the email", async () => {
    const formId = await seedForm();
    await seedSubmission(formId, 0, { dataJson: JSON.stringify({ message: "needle here" }) });
    await seedSubmission(formId, 1, { dataJson: JSON.stringify({ message: "nothing" }) });

    await expect(listSubmissions(db, { search: "needle" }, null, 10)).resolves.toMatchObject({
      items: [{ formName: "Contact" }],
    });

    const byEmail = await listSubmissions(db, { search: "person1@" }, null, 10);
    expect(byEmail.items).toHaveLength(1);
  });

  it("searches the owner's notes", async () => {
    const formId = await seedForm();
    await seedSubmission(formId, 0, { note: "Sent a quote on Monday" });
    await seedSubmission(formId, 1);

    const page = await listSubmissions(db, { search: "quote" }, null, 10);
    expect(page.items.map((i) => i.note)).toEqual(["Sent a quote on Monday"]);
  });

  /** `%` is a LIKE wildcard; searching for it literally must not match everything. */
  it("escapes LIKE wildcards in the search term", async () => {
    const formId = await seedForm();
    await seedSubmission(formId, 0, { dataJson: JSON.stringify({ message: "100% sure" }) });
    await seedSubmission(formId, 1, { dataJson: JSON.stringify({ message: "nothing" }) });

    const page = await listSubmissions(db, { search: "100%" }, null, 10);
    expect(page.items).toHaveLength(1);

    // A bare "%" is treated as the literal character, so it matches only the row that
    // actually contains one — not every row, which is what an unescaped wildcard would do.
    const wildcard = await listSubmissions(db, { search: "%" }, null, 10);
    expect(wildcard.items).toHaveLength(1);
    expect(JSON.parse(wildcard.items[0].dataJson).message).toContain("100%");

    // Same for "_", which would otherwise match any single character.
    const underscore = await listSubmissions(db, { search: "_" }, null, 10);
    expect(underscore.items).toHaveLength(0);
  });

  it("escapeLike escapes the special characters", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("back\\slash")).toBe("back\\\\slash");
  });
});

describe("parseFilters", () => {
  it("reads every supported parameter", () => {
    const params = new URLSearchParams({
      form: "f1",
      status: "spam",
      q: "  hello  ",
      from: "2026-01-01",
      to: "2026-01-31",
    });

    const filters = parseFilters(params);
    expect(filters.formId).toBe("f1");
    expect(filters.status).toBe("spam");
    expect(filters.search).toBe("hello");
    expect(filters.from).toBe(Date.parse("2026-01-01"));
    // A bare end date covers the whole day, or "to: today" would exclude today.
    expect(filters.to).toBe(Date.parse("2026-01-31") + 86_399_999);
  });

  it("ignores an invalid status and unparseable dates", () => {
    const filters = parseFilters(
      new URLSearchParams({ status: "bogus", from: "not-a-date", q: "   " }),
    );
    expect(filters.status).toBeUndefined();
    expect(filters.from).toBeUndefined();
    expect(filters.search).toBeUndefined();
  });

  it("caps an overlong search term", () => {
    const filters = parseFilters(new URLSearchParams({ q: "x".repeat(500) }));
    expect(filters.search).toHaveLength(200);
  });
});

describe("getSubmission", () => {
  it("returns a submission with its form, or null", async () => {
    const formId = await seedForm("Contact");
    const id = await seedSubmission(formId, 0);

    await expect(getSubmission(db, id)).resolves.toMatchObject({ id, formName: "Contact" });
    await expect(getSubmission(db, "does-not-exist")).resolves.toBeNull();
  });
});
