/**
 * CSV Parser service — wraps csv-parse to produce typed row objects.
 *
 * Requirements: 4.2, 4.3, 4.4
 */

import { parse } from 'csv-parse';
import type { ApiErrorResponse } from '../types/index';

// ─── Typed error ─────────────────────────────────────────────────────────────

export class CsvParseError extends Error {
  public readonly error: ApiErrorResponse['error'];
  public readonly statusCode: number;

  constructor(error: 'empty_file' | 'invalid_csv', message: string) {
    super(message);
    this.name = 'CsvParseError';
    this.error = error;
    this.statusCode = 422;
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Parses a CSV `Buffer` into an array of row objects keyed by the original
 * column headers (no normalisation applied).
 *
 * Throws `CsvParseError` for:
 *   - `empty_file`  — buffer is 0 bytes, or the file contains only a header
 *                     row with no data rows.
 *   - `invalid_csv` — the content cannot be parsed as valid CSV.
 *
 * @param buffer  Raw file content received from multer.
 * @returns       Promise resolving to an array of `Record<string, string>`.
 */
export async function parseCSV(
  buffer: Buffer,
): Promise<Record<string, string>[]> {
  // ── 1. Reject zero-byte uploads immediately ──────────────────────────────
  if (buffer.length === 0) {
    throw new CsvParseError('empty_file', 'The uploaded file is empty (0 bytes).');
  }

  // ── 2. Run csv-parse asynchronously ─────────────────────────────────────
  let rows: Record<string, string>[];

  try {
    rows = await new Promise<Record<string, string>[]>((resolve, reject) => {
      parse(
        buffer,
        {
          columns: true,          // use header row as object keys
          skip_empty_lines: true, // ignore blank lines
          trim: false,            // preserve whitespace exactly as-is
          relax_quotes: false,    // strict quote handling
          relax_column_count: true, // tolerate rows with fewer columns than header
          cast: false,            // keep every value as a string
        },
        (err, records: Record<string, string>[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(records);
          }
        },
      );
    });
  } catch (err) {
    // csv-parse throws for malformed content (bad quotes, etc.)
    const msg =
      err instanceof Error
        ? `CSV parse error: ${err.message}`
        : 'The file could not be parsed as valid CSV.';
    throw new CsvParseError('invalid_csv', msg);
  }

  // ── 3. Reject header-only files (0 data rows) ───────────────────────────
  if (rows.length === 0) {
    throw new CsvParseError(
      'empty_file',
      'The uploaded file contains no data rows (header row only or completely empty).',
    );
  }

  return rows;
}
