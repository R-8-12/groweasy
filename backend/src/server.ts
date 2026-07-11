/**
 * Express application bootstrap.
 * Requirements: 11.2, 11.3, 13.4
 *
 * Responsibilities:
 *  - Apply CORS middleware using FRONTEND_ORIGIN env var
 *  - Guard Content-Type before multer runs (415 if not multipart/form-data)
 *  - Mount the import router at /api
 *  - Mount the global error handler
 *  - Expose GET /health
 *  - Start the HTTP server on PORT env var (default 4000)
 *  - Export the Express app for testing
 */

// Load .env before anything else reads process.env
import 'dotenv/config';

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

import { requestLogger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import importRouter from './routes/importRoute';

// ---------------------------------------------------------------------------
// App construction
// ---------------------------------------------------------------------------

const app = express();

// -- CORS -------------------------------------------------------------------
// Allow requests from the configured frontend origin.
// Requirement 11.3
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';

app.use(
  cors({
    origin: frontendOrigin,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
  }),
);

// -- Structured request logger ----------------------------------------------
// Requirement 11.4
app.use(requestLogger);

// -- Health check -----------------------------------------------------------
// Requirement 13.4 — GET /health → HTTP 200 { status: 'ok' }
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// -- Content-Type guard (must run BEFORE multer) ----------------------------
// Requirement 11.2 — any POST to /api/import that is not multipart must be
// rejected with HTTP 415 before multer has a chance to process the body.
// We apply this guard only to the /api prefix so that other routes are unaffected.
app.use('/api', (req: Request, res: Response, next: NextFunction): void => {
  // Only guard mutating methods that carry a body.
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    if (!req.is('multipart/form-data')) {
      res.status(415).json({
        error: 'unsupported_media_type',
        message:
          'Content-Type must be multipart/form-data. Received: ' +
          (req.headers['content-type'] ?? 'none'),
      });
      return;
    }
  }
  next();
});

// -- Import router ----------------------------------------------------------
app.use('/api', importRouter);

// -- Global error handler (must be last middleware) -------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? '4000', 10);

// Only start listening when this module is the entry point, not when imported
// by tests.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      JSON.stringify({
        event: 'server_started',
        port: PORT,
        frontendOrigin,
        env: process.env.NODE_ENV ?? 'development',
      }),
    );
  });
}

export default app;
export { app };
