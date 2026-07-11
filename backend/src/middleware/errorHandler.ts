/**
 * Global Express error-handler middleware and custom error classes.
 * Requirements: 11.1, 4.6, 11.2
 */

import { Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';

// ---------------------------------------------------------------------------
// Custom error classes
// ---------------------------------------------------------------------------

/** Thrown by csvParser when the file is empty or has no data rows. */
export class CsvParserError extends Error {
  readonly code: 'empty_file' | 'invalid_csv';

  constructor(code: 'empty_file' | 'invalid_csv', message: string) {
    super(message);
    this.name = 'CsvParserError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown by the import route when no `file` field is present in the request. */
export class MissingFileError extends Error {
  constructor(message = 'No file was provided in the request.') {
    super(message);
    this.name = 'MissingFileError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown (or passed via next()) when Content-Type is not multipart/form-data. */
export class UnsupportedMediaTypeError extends Error {
  constructor(message = 'Content-Type must be multipart/form-data.') {
    super(message);
    this.name = 'UnsupportedMediaTypeError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Error shape helper
// ---------------------------------------------------------------------------

interface ErrorBody {
  error: string;
  message: string;
}

function body(error: string, message: string): ErrorBody {
  return { error, message };
}

// ---------------------------------------------------------------------------
// Global error-handler middleware  (4-argument signature = Express error handler)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // --- multer: file too large (413) ----------------------------------------
  if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
    res
      .status(413)
      .json(body('file_too_large', 'The uploaded file exceeds the 50 MB size limit.'));
    return;
  }

  // --- unsupported media type (415) ----------------------------------------
  if (err instanceof UnsupportedMediaTypeError) {
    res
      .status(415)
      .json(body('unsupported_media_type', err.message));
    return;
  }

  // --- CSV parser errors (422) ---------------------------------------------
  if (err instanceof CsvParserError) {
    res
      .status(422)
      .json(body(err.code, err.message));
    return;
  }

  // --- missing file (422) --------------------------------------------------
  if (err instanceof MissingFileError) {
    res
      .status(422)
      .json(body('missing_file', err.message));
    return;
  }

  // --- processing timeout (504) --------------------------------------------
  if (
    err instanceof Error &&
    (err as Error & { code?: string }).code === 'processing_timeout'
  ) {
    res
      .status(504)
      .json(body('processing_timeout', err.message));
    return;
  }

  // --- fallback: internal server error (500) -------------------------------
  const message =
    err instanceof Error ? err.message : 'An unexpected error occurred.';

  res
    .status(500)
    .json(body('internal_error', message));
}
