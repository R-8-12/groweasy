/**
 * Tests for Batch Processor and SSE Writer behaviour.
 *
 * Covers:
 *   - Property 20: SSE Progress Event Sequence Correctness (Req 10.2)
 *   - Property  3: Batch Chunking Invariant               (Req 5.1)
 *   - Property 14: ImportResponse Count Invariants         (Req 7.1, 7.2, 7.3)
 *   - Unit tests for chunkRows, processBatches, buildImportResponse
 */

import * as fc from 'fast-check';
import type { Response } from 'express';

import { writeProgress } from '../src/streaming/sseWriter';
import {
  chunkRows,
  processBatches,
  buildImportResponse,
} from '../src/services/batchProcessor';
import type { CrmRecord, SkippedRecord, ImportResponse, ProgressEvent } from '../src/types/index';

// ---------------------------------------------------------------------------
// Module-level mocks (must be declared before imports that use them)
// ---------------------------------------------------------------------------

jest.mock('../src/services/aiService', () => ({
  extractFields: jest.fn(),
}));

jest.mock('../src/services/retryManager', () => {
  const original = jest.requireActual<typeof import('../src/services/retryManager')>(
    '../src/services/retryManager',
  );
  return {
    ...original,
    run: jest.fn((fn: () => Promise<unknown>) => fn()),
  };
});

import { extractFields } from '../src/services/aiService';
import { run as retryRun } from '../src/services/retryManager';

const mockExtractFields = extractFields as jest.MockedFunction<typeof extractFields>;
const mockRetryRun = retryRun as jest.MockedFunction<typeof retryRun>;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Minimal mock of an Express Response that captures raw SSE writes. */
function createMockRes(): { res: Response; events: ProgressEvent[] } {
  const events: ProgressEvent[] = [];

  const res = {
    write(chunk: string): boolean {
      const match = chunk.match(/^data: (.+)\n\n$/s);
      if (match) {
        const parsed: unknown = JSON.parse(match[1]);
        const evt = parsed as ProgressEvent;
        if (evt.type === 'progress') {
          events.push(evt);
        }
      }
      return true;
    },
    setHeader: () => undefined,
    end: () => undefined,
  } as unknown as Response;

  return { res, events };
}

/** Mock Response that captures all raw SSE writes (for processBatches tests). */
function createMockResponse(): { res: Response; written: string[] } {
  const written: string[] = [];

  const res = {
    write(chunk: string): boolean {
      written.push(chunk);
      return true;
    },
    end(): void { /* no-op */ },
    setHeader(): void { /* no-op */ },
    headersSent: false,
  } as unknown as Response;

  return { res, written };
}

/** Parse the last SSE "final" payload from the written chunks. */
function parseFinalEvent(written: string[]): ImportResponse | null {
  for (let i = written.length - 1; i >= 0; i--) {
    const match = written[i].match(/^data: (.+)\n\n$/s);
    if (match) {
      const parsed = JSON.parse(match[1]) as { type: string; data?: ImportResponse };
      if (parsed.type === 'final' && parsed.data) {
        return parsed.data;
      }
    }
  }
  return null;
}

/** Build the smallest valid CrmRecord for use in tests. */
function makeCrmRecord(name = 'Test User'): CrmRecord {
  return {
    created_at: '',
    name,
    email: `${name.replace(/\s+/g, '').toLowerCase()}@example.com`,
    country_code: '',
    mobile_without_country_code: '',
    company: '',
    city: '',
    state: '',
    country: '',
    lead_owner: '',
    crm_status: 'DID_NOT_CONNECT',
    crm_note: '',
    data_source: '',
    possession_time: '',
    description: '',
  };
}

/** Build N minimal CSV row objects. */
function makeRows(n: number): Record<string, string>[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `Lead ${i}`,
    email: `lead${i}@example.com`,
  }));
}

function makeSkippedRecord(rowIndex: number): SkippedRecord {
  return { row_index: rowIndex, reason: 'no_contact_info' };
}

// ===========================================================================
// Property 20 — SSE Progress Event Sequence Correctness
// Validates: Requirements 10.2
// ===========================================================================

// Feature: ai-csv-importer, Property 20: SSE Progress Event Sequence Correctness
describe('Property 20: SSE Progress Event Sequence Correctness', () => {
  it('produces exactly N events with correct batches_completed and batches_total values', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (N: number) => {
          const { res, events } = createMockRes();

          for (let k = 1; k <= N; k++) {
            writeProgress(res, k, N);
          }

          // Assertion 1: exactly N events captured
          expect(events).toHaveLength(N);

          // Assertion 2: k-th event carries correct counters
          for (let k = 1; k <= N; k++) {
            const evt = events[k - 1];
            expect(evt.batches_completed).toBe(k);
            expect(evt.batches_total).toBe(N);
          }

          // Assertion 3: no event has batches_completed > batches_total
          for (const evt of events) {
            expect(evt.batches_completed).toBeLessThanOrEqual(evt.batches_total);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ===========================================================================
// Property 3 — Batch Chunking Invariant
// Validates: Requirements 5.1
// ===========================================================================

// Feature: ai-csv-importer, Property 3: Batch Chunking Invariant
describe('Property 3: Batch Chunking Invariant', () => {
  it('every batch is ≤50 rows, concatenation equals original array, no rows duplicated or omitted', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ id: fc.integer(), value: fc.string() }),
          { minLength: 0, maxLength: 1000 },
        ),
        (rows) => {
          const BATCH_SIZE = 50;
          const chunks = chunkRows(rows, BATCH_SIZE);

          // Assertion 1: every batch has at most 50 rows
          for (const chunk of chunks) {
            expect(chunk.length).toBeLessThanOrEqual(BATCH_SIZE);
          }

          // Assertion 2: concatenation of all chunks equals the original array
          const concatenated = ([] as typeof rows).concat(...chunks);
          expect(concatenated).toEqual(rows);

          // Assertion 3: total row count is preserved (no duplicates or omissions)
          expect(concatenated.length).toBe(rows.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ===========================================================================
// Property 14 — ImportResponse Count Invariants
// Validates: Requirements 7.1, 7.2, 7.3
// ===========================================================================

// Feature: ai-csv-importer, Property 14: ImportResponse Count Invariants
describe('Property 14: ImportResponse Count Invariants', () => {
  it(
    'total_imported === records.length, total_skipped === skipped.length, ' +
      'and total_imported + total_skipped === N for all distributions of N',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 0, max: 1000 }),
          (N: number, S: number) => {
            const imported = Math.min(S, N);
            const skippedCount = N - imported;

            const records: CrmRecord[] = Array.from({ length: imported }, () =>
              makeCrmRecord(),
            );
            const skipped: SkippedRecord[] = Array.from(
              { length: skippedCount },
              (_, i) => makeSkippedRecord(imported + i),
            );

            const response = buildImportResponse(records, skipped, N);

            // Invariant (a)
            expect(response.total_imported).toBe(response.records.length);
            // Invariant (b)
            expect(response.total_skipped).toBe(response.skipped.length);
            // Invariant (c)
            expect(response.total_imported + response.total_skipped).toBe(N);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ===========================================================================
// chunkRows unit tests — Requirement 5.1
// ===========================================================================

describe('chunkRows (unit tests)', () => {
  it('exactly 50 rows → 1 chunk of 50', () => {
    const rows = makeRows(50);
    const chunks = chunkRows(rows, 50);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(50);
  });

  it('51 rows → 2 chunks: first has 50, second has 1', () => {
    const rows = makeRows(51);
    const chunks = chunkRows(rows, 50);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(50);
    expect(chunks[1]).toHaveLength(1);
  });

  it('0 rows → empty array', () => {
    const chunks = chunkRows([], 50);
    expect(chunks).toHaveLength(0);
    expect(chunks).toEqual([]);
  });

  it('size ≤ 0 → throws RangeError', () => {
    expect(() => chunkRows([1, 2, 3], 0)).toThrow(RangeError);
    expect(() => chunkRows([1, 2, 3], -1)).toThrow('chunkRows: size must be a positive integer');
  });
});

// ===========================================================================
// processBatches unit tests — Requirements 5.1, 5.11, 7.4, 10.5
// ===========================================================================

describe('processBatches (unit tests)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRetryRun.mockImplementation((fn) => (fn as () => Promise<unknown>)());
  });

  it('abort signal already aborted → no AI calls made, writeFinal still called', async () => {
    const rows = makeRows(5);
    const { res, written } = createMockResponse();

    const controller = new AbortController();
    controller.abort();

    await processBatches(rows, res, controller.signal);

    expect(mockExtractFields).not.toHaveBeenCalled();

    const finalEvent = parseFinalEvent(written);
    expect(finalEvent).not.toBeNull();
  });

  it('AI throws for first batch → those rows skipped, second batch succeeds', async () => {
    const rows = makeRows(55);
    const { res, written } = createMockResponse();

    const records = makeRows(5).map((_, i) => makeCrmRecord(`Lead ${i}`));

    // retryRun: reject on first call (batch 1 fails), succeed on second call
    // (batch 2 passes through to extractFields which resolves)
    mockRetryRun
      .mockRejectedValueOnce(Object.assign(new Error('service error'), { status: 503 }))
      .mockImplementationOnce((fn) => (fn as () => Promise<unknown>)());

    // extractFields is only reached for the second batch (first is rejected by retryRun)
    mockExtractFields.mockResolvedValueOnce({ records, skipped: [] });

    const controller = new AbortController();
    await processBatches(rows, res, controller.signal);

    const finalEvent = parseFinalEvent(written);
    expect(finalEvent).not.toBeNull();

    const skippedIndices = finalEvent!.skipped.map((s) => s.row_index);
    for (let i = 0; i < 50; i++) {
      expect(skippedIndices).toContain(i);
    }
    expect(finalEvent!.total_imported).toBe(5);
    expect(finalEvent!.total_skipped).toBe(50);
  });

  it('all rows end up skipped → writeFinal called with total_skipped === N', async () => {
    const N = 10;
    const rows = makeRows(N);
    const { res, written } = createMockResponse();

    mockRetryRun.mockRejectedValue(Object.assign(new Error('ai error'), { status: 503 }));

    const controller = new AbortController();
    await processBatches(rows, res, controller.signal);

    const finalEvent = parseFinalEvent(written);
    expect(finalEvent).not.toBeNull();
    expect(finalEvent!.total_skipped).toBe(N);
    expect(finalEvent!.total_imported).toBe(0);
    expect(finalEvent!.total_imported + finalEvent!.total_skipped).toBe(N);
  });

  it('skipped rows from multiple batches accumulate with correct global row_index values', async () => {
    const rows = makeRows(110);
    const { res, written } = createMockResponse();

    mockRetryRun.mockRejectedValue(Object.assign(new Error('ai error'), { status: 500 }));

    const controller = new AbortController();
    await processBatches(rows, res, controller.signal);

    const finalEvent = parseFinalEvent(written);
    expect(finalEvent).not.toBeNull();
    expect(finalEvent!.total_skipped).toBe(110);
    expect(finalEvent!.total_imported).toBe(0);

    const skippedIndices = finalEvent!.skipped.map((s) => s.row_index).sort((a, b) => a - b);
    const expected = Array.from({ length: 110 }, (_, i) => i);
    expect(skippedIndices).toEqual(expected);
  });

  it('non-transient error → skipped rows get reason ai_batch_failed', async () => {
    // HTTP 404 is classified as non-transient by classifyAiError
    const rows = makeRows(5);
    const { res, written } = createMockResponse();

    mockRetryRun.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));

    const controller = new AbortController();
    await processBatches(rows, res, controller.signal);

    const finalEvent = parseFinalEvent(written);
    expect(finalEvent).not.toBeNull();
    expect(finalEvent!.total_skipped).toBe(5);
    expect(finalEvent!.total_imported).toBe(0);
    // Every row must carry 'ai_batch_failed' (non-transient path)
    for (const s of finalEvent!.skipped) {
      expect(s.reason).toBe('ai_batch_failed');
    }
  });

  it('successful batch with skipped rows re-bases row_index to global offset', async () => {
    // 55 rows → batch 1 (50 rows, 3 skipped at indices 0,1,2 within batch) + batch 2 (5 rows, all succeed)
    const rows = makeRows(55);
    const { res, written } = createMockResponse();

    const records = makeRows(47).map((_, i) => makeCrmRecord(`Lead ${i}`));
    const batchSkipped: SkippedRecord[] = [
      { row_index: 0, reason: 'no_contact_info' },
      { row_index: 1, reason: 'no_contact_info' },
      { row_index: 2, reason: 'no_contact_info' },
    ];
    const batch2Records = makeRows(5).map((_, i) => makeCrmRecord(`Lead B${i}`));

    mockRetryRun
      .mockImplementationOnce((fn: () => Promise<unknown>) => fn())
      .mockImplementationOnce((fn: () => Promise<unknown>) => fn());

    mockExtractFields
      .mockResolvedValueOnce({ records, skipped: batchSkipped })
      .mockResolvedValueOnce({ records: batch2Records, skipped: [] });

    const controller = new AbortController();
    await processBatches(rows, res, controller.signal);

    const finalEvent = parseFinalEvent(written);
    expect(finalEvent).not.toBeNull();
    // 47 + 5 imported, 3 skipped
    expect(finalEvent!.total_imported).toBe(52);
    expect(finalEvent!.total_skipped).toBe(3);
    // Skipped row_index values must be global (0-based in the full 55-row input)
    const skippedIndices = finalEvent!.skipped.map((s) => s.row_index);
    expect(skippedIndices).toContain(0);
    expect(skippedIndices).toContain(1);
    expect(skippedIndices).toContain(2);
  });
});

// ===========================================================================
// buildImportResponse unit tests — Requirements 7.1, 7.2, 7.3
// ===========================================================================

describe('buildImportResponse (unit tests)', () => {
  it('returns correct totals when records and skipped together equal totalInputRows', () => {
    const records = [makeCrmRecord('A'), makeCrmRecord('B')];
    const skipped: SkippedRecord[] = [{ row_index: 2, reason: 'no_contact_info' }];
    const result = buildImportResponse(records, skipped, 3);

    expect(result.total_imported).toBe(2);
    expect(result.total_skipped).toBe(1);
    expect(result.total_imported + result.total_skipped).toBe(3);
  });

  it('pads with synthetic skipped entries when processed < totalInputRows', () => {
    const records = [makeCrmRecord()];
    const skipped: SkippedRecord[] = [];
    const result = buildImportResponse(records, skipped, 5);

    expect(result.total_imported).toBe(1);
    expect(result.total_skipped).toBe(4);
    expect(result.total_imported + result.total_skipped).toBe(5);
  });

  it('all-skipped result satisfies invariants', () => {
    const records: CrmRecord[] = [];
    const skipped: SkippedRecord[] = Array.from({ length: 10 }, (_, i) => ({
      row_index: i,
      reason: 'ai_batch_failed' as const,
    }));
    const result = buildImportResponse(records, skipped, 10);

    expect(result.total_imported).toBe(0);
    expect(result.total_skipped).toBe(10);
    expect(result.total_imported + result.total_skipped).toBe(10);
  });
});
