/**
 * CSV generation and download.
 *
 * ## Why this exists
 *
 * The original export in `AdminDashboard` escaped by swapping commas for
 * semicolons:
 *
 *     String(item[h] || "").replace(/,/g, ";")
 *
 * That is not escaping — it is silent data corruption. A guardian recorded as
 * "Smith, Jr" exports as "Smith; Jr", and the church has no way to know the
 * file no longer matches their records. Quotes and newlines were not handled
 * at all, and either will break the row structure of the whole file.
 *
 * This module quotes properly per RFC 4180 instead, so the value that goes in
 * is the value that comes out.
 *
 * ## Why columns are explicit
 *
 * The original derived headers from `Object.keys(data[0])` — whatever fields
 * happened to exist on the *first* record. Firestore enforces no schema, so
 * that has two failure modes: a field absent from record 0 silently disappears
 * for every row, and a field added to the collection later is silently
 * exported to anyone who presses the button. For an export containing
 * children's contact details, "whatever happens to be on the document" is the
 * wrong column list. Callers name their columns.
 */

/** A column in an export: where to read it from, and what to title it. */
export interface CsvColumn<T> {
  /** Header text written to the file. */
  header: string;
  /** Pulls the cell value out of a row. Return "" for absent data. */
  value: (row: T) => string;
}

/**
 * Quotes a single field per RFC 4180.
 *
 * A field is wrapped in quotes when it contains a comma, a quote, or any line
 * break; internal quotes are doubled. Everything else is written bare, which
 * keeps the common case readable.
 */
function escapeField(raw: string): string {
  const value = raw ?? "";

  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

/**
 * Renders rows to a CSV string using an explicit column list.
 *
 * The header row is always written, so an empty export still produces a file
 * with meaningful columns rather than a zero-byte download that looks like a
 * failure.
 */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeField(c.header)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => escapeField(c.value(row))).join(","),
  );

  // CRLF: Excel on Windows is the overwhelmingly common consumer here, and it
  // is the line ending RFC 4180 specifies.
  return [header, ...body].join("\r\n");
}

/**
 * Triggers a browser download of `content` as `filename`.
 *
 * The BOM is deliberate. Without it Excel reads the file as the system
 * codepage and mangles any non-ASCII character — which in South African
 * church data means names like "Müller" or "Ngwenyama" render as mojibake.
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([`﻿${content}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Without this the blob is held for the lifetime of the document. The
  // original export leaked one per collection, every time it ran.
  URL.revokeObjectURL(url);
}
