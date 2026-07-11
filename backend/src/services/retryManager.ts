/**
 * Retry Manager — exponential back-off retry wrapper for AI service calls.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4
 *
 * Retry schedule:
 *   Attempt 1 — immediate (no delay)
 *   Attempt 2 — 1 000 ms
 *   Attempt 3 — 2 000 ms
 *   Attempt 4 — 4 000 ms
 *
 * Transient errors  (will be retried): HTTP 429, 500, 502, 503, 504, network timeout
 * Non-transient errors (thrown immediately without retry): HTTP 400, 401, 403, 404
 */

/** Classify an error thrown by the AI service as transient or non-transient. */
export function classifyAiError(err: unknown): 'transient' | 'non_transient' {
  if (err == null || typeof err !== 'object') {
    return 'transient';
  }
  const status = (err as { status?: number }).status;
  if (status !== undefined && [400, 401, 403, 404].includes(status)) {
    return 'non_transient';
  }
  // 429, 5xx, network timeout, and unknown errors are all transient
  return 'transient';
}

/** Exported sleep helper so tests can mock it without intercepting timers. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const self = require('./retryManager') as typeof import('./retryManager');

export interface RetryOptions {
  /** Total number of attempts (initial call + retries). Default: 4 */
  maxAttempts: number;
  /**
   * Array of delays in milliseconds between consecutive attempts.
   * backoff[0] is the delay before attempt 2,
   * backoff[1] is the delay before attempt 3, etc.
   * Default: [1000, 2000, 4000]
   */
  backoff: number[];
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 4,
  backoff: [1000, 2000, 4000],
};

/**
 * Execute `fn` with automatic retry on transient errors.
 *
 * Algorithm:
 *   for attempt in 1..maxAttempts:
 *     try: return await fn()
 *     catch (err):
 *       if non-transient: throw immediately (no delay, no retry)
 *       if attempt === maxAttempts: throw (retries exhausted)
 *       await sleep(backoff[attempt - 1])
 */
export async function run<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const { maxAttempts, backoff }: RetryOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      // Non-transient errors (400, 401, 403, 404) — throw immediately, no retry
      if (classifyAiError(err) === 'non_transient') {
        throw err;
      }

      // Transient error — check if we have retries left
      if (attempt === maxAttempts) {
        // All attempts exhausted, propagate the error
        throw err;
      }

      // Wait for the back-off delay before the next attempt.
      // backoff is 0-indexed: backoff[attempt - 1] gives delay before attempt+1.
      const delayMs = backoff[attempt - 1] ?? 0;
      await self.sleep(delayMs);
    }
  }

  // TypeScript requires this to be unreachable, but the loop always returns or throws.
  /* istanbul ignore next */
  throw new Error('retryManager: unreachable code');
}
