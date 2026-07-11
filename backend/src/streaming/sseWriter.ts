/**
 * SSE (Server-Sent Events) helper functions for streaming import progress.
 * Requirements: 10.1, 10.2, 10.4
 */

import { Response } from 'express';
import type { ProgressEvent, FinalEvent, ErrorEvent, ImportResponse } from '../types/index';

/**
 * Initialises the SSE response headers. Must be called once before any
 * write functions, before the first byte is sent to the client.
 */
export function initSSE(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
}

/**
 * Emits a progress event after a batch completes.
 * Requirement 10.2 — event contains batches_completed and batches_total.
 */
export function writeProgress(
  res: Response,
  batches_completed: number,
  batches_total: number,
): void {
  const event: ProgressEvent = {
    type: 'progress',
    batches_completed,
    batches_total,
  };
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * Emits the final event carrying the complete ImportResponse and closes the stream.
 * Requirement 10.4 — emits final event then closes the stream.
 */
export function writeFinal(res: Response, importResponse: ImportResponse): void {
  const event: FinalEvent = {
    type: 'final',
    data: importResponse,
  };
  res.write(`data: ${JSON.stringify(event)}\n\n`);
  res.end();
}

/**
 * Emits an error event and closes the stream.
 * Requirement 10.1 — fatal errors are surfaced via the SSE stream before closing.
 */
export function writeError(res: Response, error: string, message: string): void {
  const event: ErrorEvent = {
    type: 'error',
    error,
    message,
  };
  res.write(`data: ${JSON.stringify(event)}\n\n`);
  res.end();
}
