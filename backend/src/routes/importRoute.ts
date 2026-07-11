/**
 * POST /api/import — CSV upload and streaming import route.
 *
 * Validation order (per spec):
 *   1. 415  Content-Type must be multipart/form-data (confirmed here; also
 *           enforced by server-level middleware before this route runs)
 *   2. 413  Multer rejects oversized files (LIMIT_FILE_SIZE → global errorHandler)
 *   3. 422  No `file` field present → missing_file
 *   4. 422  CSV parse failure → empty_file | invalid_csv
 *
 * After parse succeeds, SSE headers are set and processBatches streams results.
 *
 * Requirements: 4.1, 4.3, 4.4, 4.6, 4.7, 11.2, 11.3, 11.5, 11.6
 */

import { Router, Request, Response, NextFunction } from 'express';
import { upload } from '../middleware/multerConfig';
import { parseCSV, CsvParseError } from '../services/csvParser';
import { processBatches } from '../services/batchProcessor';
import { initSSE, writeError } from '../streaming/sseWriter';

const router = Router();

router.post(
  '/import',
  // ── Step 1: Confirm Content-Type is multipart/form-data (415) ────────────
  // The server-level guard already rejects non-multipart POSTs to /api before
  // reaching this router, but we confirm here for defence-in-depth.
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.is('multipart/form-data')) {
      res.status(415).json({
        error: 'unsupported_media_type',
        message:
          'Content-Type must be multipart/form-data. Received: ' +
          (req.headers['content-type'] ?? 'none'),
      });
      return;
    }
    next();
  },

  // ── Step 2: Apply multer (handles 413 via global errorHandler) ───────────
  upload,

  // ── Steps 3–6: Validate file, parse CSV, stream results ─────────────────
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Step 3: Confirm `file` field was present (422 missing_file)
    if (!req.file) {
      res.status(422).json({
        error: 'missing_file',
        message: 'No file was provided in the request. Include a CSV file in the `file` field.',
      });
      return;
    }

    // Step 4: Parse CSV (422 empty_file | invalid_csv)
    let rows: Record<string, string>[];
    try {
      rows = await parseCSV(req.file.buffer);
    } catch (err) {
      if (err instanceof CsvParseError) {
        res.status(422).json({
          error: err.error,
          message: err.message,
        });
        return;
      }
      // Unexpected error — delegate to global error handler
      next(err);
      return;
    }

    // Step 5: Set SSE headers
    initSSE(res);

    // Step 6: Wire abort signal to client disconnect, then stream batches
    const controller = new AbortController();
    req.on('close', () => {
      controller.abort();
    });

    try {
      await processBatches(rows, res, controller.signal);
    } catch (err) {
      // If headers haven't been flushed yet (res.headersSent is false for SSE
      // after initSSE, this shouldn't happen, but guard anyway).
      if (!res.headersSent) {
        next(err);
        return;
      }
      // SSE stream is already open — emit an error event and close.
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred.';
      writeError(res, 'internal_error', message);
    }
  },
);

export default router;
