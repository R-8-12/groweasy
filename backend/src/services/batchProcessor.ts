/**
 * Batch Processor — orchestrates AI extraction across batches of CSV rows,
 * emitting SSE progress events and a final summary.
 *
 * Requirements: 5.1, 5.11, 6.3, 6.5, 7.1, 7.2, 7.3, 7.4, 10.1, 10.2, 10.4, 10.5
 */

import { Response } from 'express';
import { run } from './retryManager';
import { extractFields } from './aiService';
import { writeProgress, writeFinal } from '../streaming/sseWriter';
import type { CrmRecord, SkippedRecord, ImportResponse } from '../types/index';
import { classifyAiError } from './retryManager';

// ---------------------------------------------------------------------------
// Batch size constant
// ---------------------------------------------------------------------------

const BATCH_SIZE = 50;

// ---------------------------------------------------------------------------
// Pure utility: chunkRows
// ---------------------------------------------------------------------------

/**
 * Splits an array into sub-arrays of at most `size` elements.
 * The last chunk may be smaller than `size`.
 *
 * Export required for property-based tests (Property 3).
 *
 * Requirements: 5.1
 */
export function chunkRows<T>(rows: T[], size: number): T[][] {
  if (size <= 0) {
    throw new RangeError('chunkRows: size must be a positive integer');
  }
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// buildImportResponse — satisfies count invariants
// ---------------------------------------------------------------------------

/**
 * Constructs the final `ImportResponse`, ensuring all three count invariants hold:
 *   - total_imported === records.length
 *   - total_skipped  === skipped.length
 *   - total_imported + total_skipped === totalInputRows
 *
 * If accumulated counts somehow diverge from totalInputRows (e.g. due to an
 * unexpected LLM response), the function adds synthetic `ai_batch_failed`
 * entries to make the invariant hold.
 *
 * Requirements: 7.1, 7.2, 7.3
 */
export function buildImportResponse(
  records: CrmRecord[],
  skipped: SkippedRecord[],
  totalInputRows: number,
): ImportResponse {
  const processed = records.length + skipped.length;

  // Pad with synthetic skipped entries if necessary to satisfy invariant (c).
  if (processed < totalInputRows) {
    for (let i = processed; i < totalInputRows; i++) {
      skipped.push({ row_index: i, reason: 'ai_batch_failed' });
    }
  }

  return {
    records,
    skipped,
    total_imported: records.length,
    total_skipped: skipped.length,
  };
}

// ---------------------------------------------------------------------------
// processBatches — main orchestration function
// ---------------------------------------------------------------------------

/**
 * Processes all CSV rows in batches of ≤50, calling the AI service for each
 * batch (with retry), emitting SSE progress events after every batch, and
 * emitting a final SSE event when all batches are done.
 *
 * @param rows        Parsed CSV rows as key→value objects.
 * @param res         Express Response used as the SSE stream.
 * @param abortSignal AbortSignal to support client-disconnect cancellation.
 *
 * Requirements: 5.1, 5.11, 6.3, 6.5, 7.1–7.4, 10.1, 10.2, 10.4, 10.5
 */
export async function processBatches(
  rows: Record<string, string>[],
  res: Response,
  abortSignal: AbortSignal,
): Promise<void> {
  const batches = chunkRows(rows, BATCH_SIZE);
  const batchesTotal = batches.length;

  const allRecords: CrmRecord[] = [];
  const allSkipped: SkippedRecord[] = [];

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    // Requirement 6.5 / 10.5 — abort if the client disconnected.
    if (abortSignal.aborted) {
      break;
    }

    const batch = batches[batchIndex];
    const batchOffset = batchIndex * BATCH_SIZE;

    try {
      // Requirement 6.3 — wrap AI call with retry manager.
      const batchResult = await run(() => extractFields(batch));

      // Re-base row_index values from the AI service to global indices.
      // aiService returns row_index relative to the batch (0-based within batch).
      for (const record of batchResult.records) {
        allRecords.push(record);
      }

      for (const skippedRow of batchResult.skipped) {
        allSkipped.push({
          row_index: batchOffset + skippedRow.row_index,
          reason: skippedRow.reason,
        });
      }
    } catch (err: unknown) {
      // Log the actual error so it's visible in the backend terminal for debugging.
      console.error(`[batchProcessor] Batch ${batchIndex + 1}/${batchesTotal} failed:`, err);

      // All retries exhausted — mark every row in the batch as skipped.
      // Use 'ai_service_unavailable' for transient exhaustion, 'ai_batch_failed'
      // for non-transient errors (though retryManager throws non-transient
      // errors immediately, so both cases arrive here).
      const classification = classifyAiError(err);
      const reason =
        classification === 'transient'
          ? ('ai_service_unavailable' as const)
          : ('ai_batch_failed' as const);

      for (let j = 0; j < batch.length; j++) {
        allSkipped.push({
          row_index: batchOffset + j,
          reason,
        });
      }
    }

    // Requirement 10.2 — emit progress after each batch regardless of success/failure.
    writeProgress(res, batchIndex + 1, batchesTotal);
  }

  // Requirement 10.4 — emit final event and close the stream.
  const importResponse = buildImportResponse(allRecords, allSkipped, rows.length);
  writeFinal(res, importResponse);
}
