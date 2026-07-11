/**
 * Browser-only CSV parser utility using PapaParse.
 * Requirements: 2.1, 2.8, 2.9, 2.10
 *
 * No network requests are issued. All parsing happens entirely in the browser
 * via the File API + PapaParse.
 */

import Papa from 'papaparse';

export interface ParseResult {
  rows: Record<string, string>[];
  errors: Papa.ParseError[];
  /** true when some rows succeeded AND some errors occurred */
  partial: boolean;
}

/**
 * Parse a CSV File in the browser.
 *
 * Outcomes:
 * - Empty file (0 bytes)          → { rows: [], errors: [{ message: 'File is empty' }], partial: false }
 * - Header-only (0 data rows)     → { rows: [], errors: [], partial: false }
 * - Partial parse (some rows ok)  → { rows: <successful rows>, errors: <parse errors>, partial: true }
 * - Total parse failure (0 rows)  → { rows: [], errors: <parse errors>, partial: false }
 * - Fully valid CSV               → { rows: <all rows>, errors: [], partial: false }
 */
export async function parseCSV(file: File): Promise<ParseResult> {
  // Handle empty file immediately — PapaParse may silently return 0 rows
  if (file.size === 0) {
    return {
      rows: [],
      errors: [
        {
          type: 'FieldMismatch',
          code: 'TooFewFields',
          message: 'File is empty',
          row: 0,
        },
      ],
      partial: false,
    };
  }

  return new Promise<ParseResult>((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const rows = results.data as Record<string, string>[];
        const errors = results.errors as Papa.ParseError[];

        const hasRows = rows.length > 0;
        const hasErrors = errors.length > 0;

        // partial: some rows succeeded AND some errors occurred
        const partial = hasRows && hasErrors;

        resolve({ rows, errors, partial });
      },
      error(err: Error) {
        // Fatal PapaParse error — could not parse at all
        // Map the Error to a Papa.ParseError shape for a consistent return type
        const parseError: Papa.ParseError = {
          type: 'FieldMismatch',
          code: 'TooFewFields',
          message: err.message,
          row: 0,
        };
        resolve({ rows: [], errors: [parseError], partial: false });
      },
    });
  });
}
