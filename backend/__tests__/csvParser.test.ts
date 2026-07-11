/**
 * Unit tests and property-based tests for backend/src/services/csvParser.ts
 * Requirements: 4.2, 4.3, 4.4, 12.5
 */

import * as fc from 'fast-check';
import { parseCSV, CsvParseError } from '../src/services/csvParser';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buf(content: string): Buffer {
  return Buffer.from(content, 'utf8');
}

// ─── Happy-path tests ─────────────────────────────────────────────────────────

describe('parseCSV — valid input', () => {
  it('parses a minimal CSV with one data row', async () => {
    const csv = 'name,email\nAlice,alice@example.com\n';
    const rows = await parseCSV(buf(csv));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ name: 'Alice', email: 'alice@example.com' });
  });

  it('parses multiple data rows', async () => {
    const csv = 'first,last\nJohn,Doe\nJane,Smith\n';
    const rows = await parseCSV(buf(csv));

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ first: 'John', last: 'Doe' });
    expect(rows[1]).toEqual({ first: 'Jane', last: 'Smith' });
  });

  it('preserves column header names exactly (no normalisation)', async () => {
    const csv = ' My Column , Another Col \n val1, val2\n';
    const rows = await parseCSV(buf(csv));

    // Keys must match the raw header text — spaces preserved
    expect(Object.keys(rows[0])).toEqual([' My Column ', ' Another Col ']);
  });

  it('preserves cell values exactly (no trimming)', async () => {
    const csv = 'city\n  London  \n';
    const rows = await parseCSV(buf(csv));

    expect(rows[0]['city']).toBe('  London  ');
  });

  it('handles quoted fields with commas inside', async () => {
    const csv = 'name,address\nBob,"123 Main St, Suite 4"\n';
    const rows = await parseCSV(buf(csv));

    expect(rows[0]).toEqual({ name: 'Bob', address: '123 Main St, Suite 4' });
  });

  it('handles an empty cell value', async () => {
    const csv = 'a,b\n1,\n';
    const rows = await parseCSV(buf(csv));

    expect(rows[0]).toEqual({ a: '1', b: '' });
  });

  it('returns Record<string, string> (all values are strings)', async () => {
    const csv = 'num,flag\n42,true\n';
    const rows = await parseCSV(buf(csv));

    expect(typeof rows[0]['num']).toBe('string');
    expect(typeof rows[0]['flag']).toBe('string');
  });

  it('handles CSV without a trailing newline', async () => {
    const csv = 'x,y\n1,2';
    const rows = await parseCSV(buf(csv));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ x: '1', y: '2' });
  });
});

// ─── Error: empty file ────────────────────────────────────────────────────────

describe('parseCSV — empty_file errors', () => {
  it('throws CsvParseError with code empty_file for a 0-byte buffer', async () => {
    await expect(parseCSV(Buffer.alloc(0))).rejects.toMatchObject({
      error: 'empty_file',
      statusCode: 422,
    });
  });

  it('thrown error is an instance of CsvParseError', async () => {
    await expect(parseCSV(Buffer.alloc(0))).rejects.toBeInstanceOf(CsvParseError);
  });

  it('throws CsvParseError with code empty_file for a header-only CSV', async () => {
    const csv = 'name,email\n';
    await expect(parseCSV(buf(csv))).rejects.toMatchObject({
      error: 'empty_file',
      statusCode: 422,
    });
  });

  it('throws CsvParseError with code empty_file for a header row with no newline', async () => {
    const csv = 'name,email';
    await expect(parseCSV(buf(csv))).rejects.toMatchObject({
      error: 'empty_file',
      statusCode: 422,
    });
  });
});

// ─── Error: invalid CSV ───────────────────────────────────────────────────────

describe('parseCSV — invalid_csv errors', () => {
  it('throws CsvParseError with code invalid_csv for mismatched quotes', async () => {
    // An unclosed quote causes csv-parse to error
    const csv = 'name,email\n"unclosed,test@example.com\n';
    await expect(parseCSV(buf(csv))).rejects.toMatchObject({
      error: 'invalid_csv',
      statusCode: 422,
    });
  });

  it('thrown error for invalid CSV is an instance of CsvParseError', async () => {
    const csv = 'name,email\n"unclosed,test@example.com\n';
    await expect(parseCSV(buf(csv))).rejects.toBeInstanceOf(CsvParseError);
  });
});

// ─── CsvParseError shape ──────────────────────────────────────────────────────

describe('CsvParseError', () => {
  it('has the correct name', () => {
    const err = new CsvParseError('empty_file', 'test message');
    expect(err.name).toBe('CsvParseError');
  });

  it('extends Error', () => {
    const err = new CsvParseError('invalid_csv', 'bad csv');
    expect(err).toBeInstanceOf(Error);
  });

  it('exposes the error code and statusCode', () => {
    const err = new CsvParseError('empty_file', 'msg');
    expect(err.error).toBe('empty_file');
    expect(err.statusCode).toBe(422);
  });
});

// ─── Property-Based Tests (Task 3.2) ─────────────────────────────────────────

// Feature: ai-csv-importer, Property 2: Backend CSV Parse Preserves Headers and Values
/**
 * Validates: Requirements 4.2
 *
 * Property 2: Backend CSV Parse Preserves Headers and Values
 *
 * For any valid CSV string with arbitrary column header names and arbitrary cell
 * values, the backend csvParser must return row objects where every key equals
 * the corresponding CSV header and every value equals the corresponding CSV cell,
 * with no data lost or mutated.
 */
describe('parseCSV — Property 2: Backend CSV Parse Preserves Headers and Values', () => {
  /**
   * Safe CSV token: alphanumeric + underscore/hyphen/dot only, length 1–20.
   * Excludes commas, quotes, newlines and whitespace so the constructed CSV
   * string is unambiguous without any quoting, making round-trip verification
   * straightforward.
   */
  const safeCsvToken = fc.stringMatching(/^[A-Za-z][A-Za-z0-9_\-.]{0,19}$/);

  it('every row object key equals the corresponding CSV header (Property 2)', async () => {
    // Feature: ai-csv-importer, Property 2: Backend CSV Parse Preserves Headers and Values
    await fc.assert(
      fc.asyncProperty(
        // 1–6 distinct headers (uniqueArray guarantees no duplicates)
        fc.uniqueArray(safeCsvToken, { minLength: 1, maxLength: 6 }),
        // 1–8 data rows
        fc.integer({ min: 1, max: 8 }),
        async (headers: string[], numRows: number) => {
          // Build deterministic cell values using position indices so
          // we can verify fidelity without a second generator.
          const rows: string[][] = Array.from({ length: numRows }, (_, r) =>
            headers.map((_h, c) => `r${r}c${c}`),
          );

          // Construct the CSV string
          const csvContent = [
            headers.join(','),
            ...rows.map((cells) => cells.join(',')),
          ].join('\n');

          const result = await parseCSV(Buffer.from(csvContent, 'utf8'));

          // Row count must be preserved
          expect(result).toHaveLength(rows.length);

          for (let r = 0; r < result.length; r++) {
            const rowObj = result[r];

            // Keys must equal headers in the original order
            expect(Object.keys(rowObj)).toEqual(headers);

            // Each value must equal the corresponding cell exactly
            for (let c = 0; c < headers.length; c++) {
              expect(rowObj[headers[c] as string]).toBe(rows[r][c]);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Additional Unit Tests (Task 3.3) ────────────────────────────────────────

/**
 * Validates: Requirements 4.2, 4.3, 4.4, 12.5
 */
describe('parseCSV — Task 3.3 unit tests', () => {
  // 1. Valid CSV round-trip: multiple columns and rows
  it('round-trips a multi-column, multi-row CSV without data loss', async () => {
    const csv =
      'id,firstName,lastName,email,phone\n' +
      '1,Alice,Smith,alice@example.com,555-0001\n' +
      '2,Bob,Jones,bob@example.com,555-0002\n' +
      '3,Carol,White,carol@example.com,555-0003\n';

    const rows = await parseCSV(buf(csv));

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      id: '1',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      phone: '555-0001',
    });
    expect(rows[1]).toEqual({
      id: '2',
      firstName: 'Bob',
      lastName: 'Jones',
      email: 'bob@example.com',
      phone: '555-0002',
    });
    expect(rows[2]).toEqual({
      id: '3',
      firstName: 'Carol',
      lastName: 'White',
      email: 'carol@example.com',
      phone: '555-0003',
    });
    // All values must be strings
    for (const row of rows) {
      for (const val of Object.values(row)) {
        expect(typeof val).toBe('string');
      }
    }
  });

  // 2. Empty file (0 bytes) — should throw typed error
  it('throws CsvParseError(empty_file) with statusCode 422 for a 0-byte buffer', async () => {
    const err = await parseCSV(Buffer.alloc(0)).catch((e) => e);
    expect(err).toBeInstanceOf(CsvParseError);
    expect(err.error).toBe('empty_file');
    expect(err.statusCode).toBe(422);
    expect(err.message).toMatch(/empty/i);
  });

  // 3. Header-only file (no data rows) — should throw typed error
  it('throws CsvParseError(empty_file) for a CSV with headers but no data rows', async () => {
    const csv = 'col1,col2,col3\n';
    const err = await parseCSV(buf(csv)).catch((e) => e);
    expect(err).toBeInstanceOf(CsvParseError);
    expect(err.error).toBe('empty_file');
    expect(err.statusCode).toBe(422);
  });

  it('throws CsvParseError(empty_file) for a header-only CSV without trailing newline', async () => {
    const csv = 'col1,col2,col3';
    const err = await parseCSV(buf(csv)).catch((e) => e);
    expect(err).toBeInstanceOf(CsvParseError);
    expect(err.error).toBe('empty_file');
    expect(err.statusCode).toBe(422);
  });

  // 4. Malformed quotes with partial rows
  it('throws CsvParseError(invalid_csv) for a CSV with an unclosed quote in a data row', async () => {
    // Unclosed quote causes csv-parse to error; the partial row is not usable
    const csv = 'name,notes\nAlice,"This note has no closing quote\n';
    const err = await parseCSV(buf(csv)).catch((e) => e);
    expect(err).toBeInstanceOf(CsvParseError);
    expect(err.error).toBe('invalid_csv');
    expect(err.statusCode).toBe(422);
  });

  it('throws CsvParseError(invalid_csv) for trailing content after a closing quote', async () => {
    const csv = 'a,b\n"good"extra,value\n';
    const err = await parseCSV(buf(csv)).catch((e) => e);
    expect(err).toBeInstanceOf(CsvParseError);
    expect(err.error).toBe('invalid_csv');
    expect(err.statusCode).toBe(422);
  });

  // 5. Non-CSV binary content
  it('throws CsvParseError(invalid_csv) for binary content with an invalid opening quote', async () => {
    // A buffer starting with a double-quote byte (0x22) followed by arbitrary
    // non-quote binary bytes — csv-parse raises INVALID_OPENING_QUOTE because
    // the field is not properly closed.  This is a reliable trigger for the
    // invalid_csv path regardless of the surrounding bytes.
    const binary = Buffer.from([
      0x22, 0xff, 0xfe, 0x00, 0x01, 0x02, 0x03, 0x04, // opens with "
      0x05, 0x06, 0x07, 0x08, 0x09, 0x0b, 0x0c, 0x0e, // no closing quote
    ]);
    const err = await parseCSV(binary).catch((e) => e);
    expect(err).toBeInstanceOf(CsvParseError);
    expect(err.error).toBe('invalid_csv');
    expect(err.statusCode).toBe(422);
  });

  it('throws a typed CsvParseError for null-byte binary content', async () => {
    const binary = Buffer.alloc(64, 0x00); // 64 null bytes
    const err = await parseCSV(binary).catch((e) => e);
    expect(err).toBeInstanceOf(CsvParseError);
    expect(['empty_file', 'invalid_csv']).toContain(err.error);
    expect(err.statusCode).toBe(422);
  });
});
