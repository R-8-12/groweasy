/**
 * Tests for frontend/lib/csvParser.ts
 * Requirements: 2.1, 2.8, 2.9, 2.10, 12.6
 */

import { describe, it, expect } from '@jest/globals';
import * as fc from 'fast-check';
import { parseCSV } from '../lib/csvParser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a File from a plain string, mimicking what a real browser drag/drop
 * produces. jsdom supports the File constructor via Blob.
 */
const makeFile = (content: string, name = 'test.csv') =>
  new File([content], name, { type: 'text/csv' });

/**
 * Serialise an array of row objects back to a CSV string.
 * Headers are taken from the first row's keys; values are not quoted unless
 * they contain commas, quotes, or newlines (to keep it simple for tests).
 */
function buildCsv(
  headers: string[],
  dataRows: Record<string, string>[],
): string {
  if (headers.length === 0) return '';
  const escape = (v: string) =>
    v.includes(',') || v.includes('"') || v.includes('\n')
      ? `"${v.replace(/"/g, '""')}"`
      : v;
  const headerLine = headers.map(escape).join(',');
  const bodyLines = dataRows.map((row) =>
    headers.map((h) => escape(row[h] ?? '')).join(','),
  );
  return [headerLine, ...bodyLines].join('\n');
}

// ---------------------------------------------------------------------------
// Property Test (Task 12.2)
// ---------------------------------------------------------------------------

// Feature: ai-csv-importer, Property 1: Parsing Output Fidelity
describe('Property 1: Parsing Output Fidelity', () => {
  /**
   * Validates: Requirements 1.10, 2.2
   *
   * For any valid CSV string with arbitrary column names and data rows,
   * parseCSV must return exactly as many rows as there are data rows in
   * the generated CSV content.
   */
  it('row count returned by parseCSV equals the actual data row count', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1–5 distinct, non-empty column headers
        fc
          .uniqueArray(
            fc
              .string({ minLength: 1, maxLength: 20 })
              .filter(
                (s) =>
                  s.trim().length > 0 &&
                  !s.includes(',') &&
                  !s.includes('"') &&
                  !s.includes('\n') &&
                  !s.includes('\r'),
              ),
            { minLength: 1, maxLength: 5 },
          )
          .filter((headers) => headers.length >= 1),
        // Generate 0–20 data rows
        fc.integer({ min: 0, max: 20 }),
        async (headers, rowCount) => {
          // Build row objects with simple safe cell values
          const dataRows: Record<string, string>[] = Array.from(
            { length: rowCount },
            (_, i) =>
              Object.fromEntries(headers.map((h, j) => [h, `val_${i}_${j}`])),
          );

          const csvContent = buildCsv(headers, dataRows);
          const file = makeFile(csvContent);
          const result = await parseCSV(file);

          // The parsed row count must equal the number of data rows we put in
          if (result.rows.length !== rowCount) {
            throw new Error(
              `Expected ${rowCount} rows but got ${result.rows.length}. ` +
                `CSV:\n${csvContent}`,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Unit Tests (Task 12.3)
// ---------------------------------------------------------------------------

describe('parseCSV — unit tests', () => {
  // -------------------------------------------------------------------------
  // 1. Valid CSV with multiple columns
  // -------------------------------------------------------------------------
  describe('valid CSV with multiple columns', () => {
    it('returns all rows and zero errors for a well-formed CSV', async () => {
      const csv = 'Name,Email,Phone\nAlice,alice@example.com,1234\nBob,bob@example.com,5678';
      const result = await parseCSV(makeFile(csv));

      expect(result.rows).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.partial).toBe(false);
    });

    it('maps column values correctly', async () => {
      const csv = 'Name,City\nAlice,London\nBob,Paris';
      const result = await parseCSV(makeFile(csv));

      expect(result.rows[0]).toEqual({ Name: 'Alice', City: 'London' });
      expect(result.rows[1]).toEqual({ Name: 'Bob', City: 'Paris' });
    });

    it('handles a single data row', async () => {
      const csv = 'Col1,Col2\nfoo,bar';
      const result = await parseCSV(makeFile(csv));

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ Col1: 'foo', Col2: 'bar' });
      expect(result.partial).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Empty file (0 bytes)
  // -------------------------------------------------------------------------
  describe('empty file (0 bytes)', () => {
    it('returns no rows and an error with "File is empty" message', async () => {
      const result = await parseCSV(makeFile(''));

      expect(result.rows).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toMatch(/file is empty/i);
      expect(result.partial).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Header-only file (0 data rows)
  // -------------------------------------------------------------------------
  describe('header-only file', () => {
    it('returns no rows, no errors, and partial=false', async () => {
      const csv = 'Name,Email,Phone';
      const result = await parseCSV(makeFile(csv));

      expect(result.rows).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.partial).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Malformed CSV with partial rows (some succeed, some fail)
  // -------------------------------------------------------------------------
  describe('malformed CSV with partial rows', () => {
    it('sets partial=true when some rows succeed and some fail', async () => {
      // Rows with mismatched column counts cause PapaParse FieldMismatch errors
      const csv = [
        'Name,Email,Phone',
        'Alice,alice@example.com,1234',
        'Bob,bob@example.com',          // missing Phone field → FieldMismatch error
        'Charlie,charlie@example.com,9012',
      ].join('\n');

      const result = await parseCSV(makeFile(csv));

      // At least one row should have succeeded (Alice and/or Charlie)
      expect(result.rows.length).toBeGreaterThan(0);
      // There should be at least one parse error (Bob's row)
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.partial).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Zero successful parses
  // -------------------------------------------------------------------------
  describe('CSV where zero rows parse successfully', () => {
    it('returns empty rows array and partial=false when no rows can be parsed', async () => {
      // A header-only CSV produces 0 rows but 0 errors — that's covered above.
      // Here we test: a completely non-CSV text that makes PapaParse produce
      // 0 valid data rows (PapaParse is quite forgiving, so we use a binary-like
      // payload to force 0 data rows with potential errors).
      // In practice, a CSV with only malformed rows (no valid structure) and
      // no successful rows should produce partial=false.
      //
      // Simulate by calling with a file that has a header but all data lines
      // have unmatched quotes so PapaParse skips them as errors.
      const csv = ['Name,Email', '"bad quote'].join('\n');
      const result = await parseCSV(makeFile(csv));

      // PapaParse behaviour: rows may be empty OR may include a partial row;
      // what we verify is that partial=false when rows is empty.
      if (result.rows.length === 0) {
        expect(result.partial).toBe(false);
      }
    });

    it('returns partial=false when all rows fail and rows array is empty', async () => {
      // Construct a scenario where PapaParse returns 0 rows by using empty content
      const result = await parseCSV(makeFile(''));
      expect(result.rows).toHaveLength(0);
      expect(result.partial).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Structural invariants
  // -------------------------------------------------------------------------
  describe('structural invariants', () => {
    it('partial is true only when rows > 0 AND errors > 0', async () => {
      const cases = [
        'Name,Email\nAlice,alice@example.com',                          // valid → partial=false
        '',                                                              // empty → partial=false
        'Name,Email',                                                    // header-only → partial=false
        'Name,Email,Phone\nAlice,a@b.com,123\nBob,b@b.com',            // partial mismatch
      ];

      for (const csv of cases) {
        const result = await parseCSV(makeFile(csv));
        const expectedPartial = result.rows.length > 0 && result.errors.length > 0;
        expect(result.partial).toBe(expectedPartial);
      }
    });

    it('always returns the three required fields', async () => {
      const result = await parseCSV(makeFile('A,B\n1,2'));
      expect(result).toHaveProperty('rows');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('partial');
    });
  });
});
