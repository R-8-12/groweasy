/**
 * Multer configuration for CSV file uploads.
 * Requirements: 4.1, 4.5, 4.6, 11.2
 *
 * - Accepts only files with MIME type `text/csv` AND a `.csv` extension.
 * - Enforces a 50 MB file size limit (HTTP 413 on breach via error handler).
 * - Exposes a single-file upload middleware for the field named `file`.
 */

import path from 'path';
import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';

/** 50 MB in bytes */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Accepts the file only when BOTH conditions hold:
 *  1. The MIME type reported by the browser/client is `text/csv`.
 *  2. The original filename ends with the `.csv` extension (case-insensitive).
 *
 * Rejecting on either condition alone would allow spoofed MIME types or
 * misnamed files through; checking both satisfies Requirements 4.5 and 4.6.
 */
const csvFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
): void => {
  const isCsvMime = file.mimetype === 'text/csv';
  const isCsvExt =
    path.extname(file.originalname).toLowerCase() === '.csv';

  if (isCsvMime && isCsvExt) {
    cb(null, true);
  } else {
    // Pass an error so the global error handler can return HTTP 415.
    cb(
      Object.assign(new Error('Only CSV files are accepted.'), {
        code: 'UNSUPPORTED_MEDIA_TYPE',
      }) as unknown as null,
      false,
    );
  }
};

/** Multer instance configured for CSV-only, 50 MB single-file uploads. */
const multerInstance = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE, // triggers MulterError with code LIMIT_FILE_SIZE
  },
  fileFilter: csvFileFilter,
});

/** Single-file upload middleware that reads the `file` form field. */
export const upload = multerInstance.single('file');

export default multerInstance;
