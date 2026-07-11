/**
 * Tests for backend/src/services/retryManager.ts
 * Covers tasks 6.2, 6.3 (property-based) and 6.4 (unit tests).
 * Validates: Requirements 6.1–6.4, 12.5
 */

import * as fc from 'fast-check';
import * as retryManagerModule from '../src/services/retryManager';
import { run, classifyAiError } from '../src/services/retryManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal error object with the given HTTP status. */
function httpError(status: number): { status: number } {
  return { status };
}

// ---------------------------------------------------------------------------
// Task 6.2 — Property 12: Transient Retry Schedule
// ---------------------------------------------------------------------------

describe('Property 12: Transient Retry Schedule', () => {
  // Feature: ai-csv-importer, Property 12: Transient Retry Schedule
  // Validates: Requirements 6.1

  let sleepSpy: jest.SpyInstance;

  beforeEach(() => {
    sleepSpy = jest
      .spyOn(retryManagerModule, 'sleep')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('makes exactly 4 total attempts and uses delays ≥ [1000, 2000, 4000] ms for any transient status code', async () => {
    // Feature: ai-csv-importer, Property 12: Transient Retry Schedule
    await fc.assert(
      fc.asyncProperty(
        // Generate a transient status code
        fc.constantFrom(429, 500, 502, 503, 504),
        async (statusCode) => {
          sleepSpy.mockClear();

          let callCount = 0;
          const fn = jest.fn(async () => {
            callCount++;
            throw httpError(statusCode);
          });

          await expect(run(fn)).rejects.toMatchObject({ status: statusCode });

          // Must have made exactly 4 total attempts
          expect(callCount).toBe(4);

          // sleep is called 3 times (between attempts 1→2, 2→3, 3→4)
          expect(sleepSpy).toHaveBeenCalledTimes(3);

          const delays = sleepSpy.mock.calls.map((args) => args[0] as number);

          // Delays must follow the schedule: ≥ 1000, ≥ 2000, ≥ 4000
          expect(delays[0]).toBeGreaterThanOrEqual(1000);
          expect(delays[1]).toBeGreaterThanOrEqual(2000);
          expect(delays[2]).toBeGreaterThanOrEqual(4000);

          // Verify the exact defaults match the spec (1000, 2000, 4000)
          expect(delays[0]).toBe(1000);
          expect(delays[1]).toBe(2000);
          expect(delays[2]).toBe(4000);
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Task 6.3 — Property 13: Non-Transient Error Immediate Failure
// ---------------------------------------------------------------------------

describe('Property 13: Non-Transient Error Immediate Failure', () => {
  // Feature: ai-csv-importer, Property 13: Non-Transient Error Immediate Failure
  // Validates: Requirements 6.4

  let sleepSpy: jest.SpyInstance;

  beforeEach(() => {
    sleepSpy = jest
      .spyOn(retryManagerModule, 'sleep')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('makes exactly 1 attempt and never calls sleep for any non-transient status code', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a non-transient status code
        fc.constantFrom(400, 401, 403, 404),
        async (statusCode) => {
          sleepSpy.mockClear();

          let callCount = 0;
          const fn = jest.fn(async () => {
            callCount++;
            throw httpError(statusCode);
          });

          await expect(run(fn)).rejects.toMatchObject({ status: statusCode });

          // Exactly 1 attempt — no retries
          expect(callCount).toBe(1);

          // sleep must never be called for non-transient errors
          expect(sleepSpy).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 6.4 — Unit tests for retry manager
// Validates: Requirements 6.1–6.4, 12.5
// ---------------------------------------------------------------------------

describe('retryManager unit tests', () => {
  let sleepSpy: jest.SpyInstance;

  beforeEach(() => {
    sleepSpy = jest
      .spyOn(retryManagerModule, 'sleep')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Success on first try
  // -------------------------------------------------------------------------
  describe('success on first try', () => {
    it('returns the result immediately without calling sleep', async () => {
      const fn = jest.fn().mockResolvedValue('ok');

      const result = await run(fn);

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(sleepSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Success on second try
  // -------------------------------------------------------------------------
  describe('success on second try', () => {
    it('calls fn twice, calls sleep once with 1000 ms', async () => {
      let attempts = 0;
      const fn = jest.fn(async () => {
        attempts++;
        if (attempts === 1) throw httpError(429); // first attempt fails (transient)
        return 'success';
      });

      const result = await run(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(sleepSpy).toHaveBeenCalledTimes(1);
      expect(sleepSpy).toHaveBeenCalledWith(1000);
    });
  });

  // -------------------------------------------------------------------------
  // Exhaustion of all 4 attempts
  // -------------------------------------------------------------------------
  describe('exhaustion of all 4 attempts', () => {
    it('calls fn 4 times, calls sleep 3 times with [1000, 2000, 4000] ms, then throws', async () => {
      const error = httpError(503);
      const fn = jest.fn().mockRejectedValue(error);

      await expect(run(fn)).rejects.toMatchObject({ status: 503 });

      expect(fn).toHaveBeenCalledTimes(4);
      expect(sleepSpy).toHaveBeenCalledTimes(3);

      const delays = sleepSpy.mock.calls.map((args) => args[0] as number);
      expect(delays).toEqual([1000, 2000, 4000]);
    });
  });

  // -------------------------------------------------------------------------
  // Non-transient stops immediately
  // -------------------------------------------------------------------------
  describe('non-transient error stops immediately', () => {
    it('calls fn exactly once, never calls sleep, and re-throws the original error', async () => {
      const error = httpError(404);
      const fn = jest.fn().mockRejectedValue(error);

      await expect(run(fn)).rejects.toMatchObject({ status: 404 });

      expect(fn).toHaveBeenCalledTimes(1);
      expect(sleepSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Sleep durations match schedule [1000, 2000, 4000]
  // -------------------------------------------------------------------------
  describe('sleep durations match the back-off schedule', () => {
    it('uses delays of exactly 1000, 2000, and 4000 ms across the three retries', async () => {
      const fn = jest.fn().mockRejectedValue(httpError(500));

      await expect(run(fn)).rejects.toBeDefined();

      const delays = sleepSpy.mock.calls.map((args) => args[0] as number);
      expect(delays).toEqual([1000, 2000, 4000]);
    });
  });
});

// ---------------------------------------------------------------------------
// classifyAiError unit tests (supporting coverage of 12.5)
// ---------------------------------------------------------------------------

describe('classifyAiError', () => {
  it.each([400, 401, 403, 404])(
    'classifies status %d as non_transient',
    (status) => {
      expect(classifyAiError(httpError(status))).toBe('non_transient');
    },
  );

  it.each([429, 500, 502, 503, 504])(
    'classifies status %d as transient',
    (status) => {
      expect(classifyAiError(httpError(status))).toBe('transient');
    },
  );

  it('classifies unknown errors (no status) as transient', () => {
    expect(classifyAiError(new Error('network timeout'))).toBe('transient');
    expect(classifyAiError({})).toBe('transient');
    expect(classifyAiError(null)).toBe('transient');
  });
});
