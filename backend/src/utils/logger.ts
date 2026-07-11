/**
 * Structured request logger middleware.
 * Logs HTTP method, path, status code, and duration in milliseconds as JSON.
 * Requirements: 11.4
 */

import { Request, Response, NextFunction } from 'express';

export interface RequestLogEntry {
  method: string;
  path: string;
  status: number;
  durationMs: number;
}

/**
 * Express middleware that logs each request as a structured JSON object
 * containing method, path, HTTP status, and processing duration in ms.
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startTime = Date.now();

  res.on('finish', () => {
    const entry: RequestLogEntry = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startTime,
    };
    console.log(JSON.stringify(entry));
  });

  next();
}
