# Implementation Plan: AI CSV Importer

## Overview

This plan converts the AI CSV Importer design into an ordered sequence of coding tasks.
Work begins with shared type definitions and project scaffolding, then proceeds through
backend services, frontend components, integration wiring, Docker setup, and finally
documentation. Each task is scoped to a single focused session and references the
specific requirements and design sections it satisfies.

---

## Tasks

- [x] 1. Scaffold project structure and shared TypeScript types
  - [x] 1.1 Initialise backend package: `npm init`, install Express, multer, csv-parse, openai, cors, ts-node, TypeScript (strict), jest, fast-check, and type packages; create `tsconfig.json` with `strict: true`; create `jest.config.ts`
    - Create `backend/tsconfig.json` with `strict: true`, `outDir: dist`, `rootDir: src`
    - Create `backend/jest.config.ts` referencing `ts-jest`
    - _Requirements: 12.1, 12.3_
  - [x] 1.2 Initialise frontend package: `npx create-next-app@latest` with App Router, TypeScript strict, Tailwind CSS; install `@tanstack/react-virtual`, `papaparse`, `@types/papaparse`; configure `tailwind.config.ts` with `darkMode: 'class'`
    - Enable `strict: true` in `frontend/tsconfig.json`
    - Add `darkMode: 'class'` to `frontend/tailwind.config.ts`
    - _Requirements: 12.2, 12.4_
  - [x] 1.3 Create shared TypeScript interfaces in `backend/src/types/index.ts` and mirror relevant types in `frontend/lib/types.ts`
    - Define `CrmRecord` (15 fields), `CrmStatus`, `DataSource`, `SkippedRecord`, `SkipReason`, `ImportResponse`
    - Define `ProgressEvent`, `FinalEvent`, `ErrorEvent`, `SseEvent`, `ApiErrorResponse`
    - Define `ImportStep` state-machine union type and `ProgressState` in `frontend/lib/types.ts`
    - _Requirements: 5.2, 5.3, 5.4, 7.1, 10.1_

- [x] 2. Backend infrastructure: server bootstrap, middleware, and utilities
  - [x] 2.1 Create `backend/src/utils/logger.ts` — structured request logger that records method, path, HTTP status, and duration in milliseconds
    - _Requirements: 11.4_
  - [x] 2.2 Create `backend/src/middleware/multerConfig.ts` — multer instance with 50 MB `limits.fileSize`, CSV-only `fileFilter` (MIME `text/csv` and `.csv` extension), single-file field named `file`
    - _Requirements: 4.1, 4.5, 4.6, 11.2_
  - [x] 2.3 Create `backend/src/middleware/errorHandler.ts` — global Express error-handler middleware that serialises any thrown error to `{ error, message }` JSON with the correct HTTP status; handle multer `LIMIT_FILE_SIZE` (413) and unsupported media type (415) specially
    - _Requirements: 11.1, 4.6, 11.2_
  - [x] 2.4 Create `backend/src/server.ts` — Express app bootstrap: apply `cors` middleware using `FRONTEND_ORIGIN` env var, mount multer content-type guard (return 415 before multer runs if `Content-Type` is not multipart), mount import router, mount error handler, expose `GET /health`, start server on `PORT` env var (default 4000)
    - _Requirements: 11.2, 11.3, 13.4_

- [x] 3. Backend CSV parser service
  - [x] 3.1 Create `backend/src/services/csvParser.ts` — async function that accepts a `Buffer`, uses `csv-parse` to produce `Record<string, string>[]`, throws typed errors for empty input (0 bytes), header-only / no data rows, and unparseable content
    - Return all column keys exactly as they appear in the CSV header row
    - _Requirements: 4.2, 4.3, 4.4_
  - [x] 3.2 Write property test for backend CSV parser (Property 2)
    - **Property 2: Backend CSV Parse Preserves Headers and Values**
    - Generate arbitrary header names and cell values with fast-check; assert every key in returned row objects equals the corresponding CSV header and every value equals the corresponding cell
    - **Validates: Requirements 4.2**
    - _File: `backend/__tests__/csvParser.test.ts`_
  - [x] 3.3 Write unit tests for backend CSV parser
    - Test: valid CSV round-trip, empty file (0 bytes), header-only file, malformed quotes with partial rows, non-CSV binary content
    - _Requirements: 4.2, 4.3, 4.4, 12.5_
    - _File: `backend/__tests__/csvParser.test.ts`_

- [x] 4. Backend SSE stream writer
  - [x] 4.1 Create `backend/src/streaming/sseWriter.ts` — helper functions `writeProgress(res, batches_completed, batches_total)`, `writeFinal(res, importResponse)`, and `writeError(res, error, message)`; each emits a `data: <json>\n\n` line conforming to the `SseEvent` discriminated union; set `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive` headers on the response
    - _Requirements: 10.1, 10.2, 10.4_
  - [x] 4.2 Write property test for SSE progress event sequence (Property 20)
    - **Property 20: SSE Progress Event Sequence Correctness**
    - For any N batches, assert that calling `writeProgress` N times produces exactly N events where the k-th event has `batches_completed === k` and `batches_total === N`, and no event has `batches_completed > batches_total`
    - **Validates: Requirements 10.2**
    - _File: `backend/__tests__/batchProcessor.test.ts`_

- [x] 5. Backend AI service
  - [x] 5.1 Create `backend/src/services/aiService.ts` — implement `extractFields(batch: Record<string, string>[])`: build system prompt (11 rules) and user prompt template, call OpenAI SDK with `response_format: { type: "json_object" }`, parse response (array or `{ records: [] }` wrapper), validate all 15 fields present per record (default missing fields to `""`), coerce `crm_status` to valid enum (default `DID_NOT_CONNECT`), coerce `data_source` to valid enum (default `""`), normalise `created_at` (test with `new Date()`, set `""` if invalid), split into `records` and `skipped` (`__skip__: true`) arrays
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10_
  - [x] 5.2 Write property test for AI response field completeness (Property 4)
    - **Property 4: AI Response Field Completeness**
    - Generate arbitrary JSON objects (missing some or all of the 15 fields); assert that after passing through the validation layer every record contains all 15 fields with no `undefined` values
    - **Validates: Requirements 5.2**
    - _File: `backend/__tests__/aiService.test.ts`_
  - [x] 5.3 Write property test for crm_status enum coercion (Property 5)
    - **Property 5: crm_status Enum Coercion**
    - Generate arbitrary strings (including empty, whitespace, random unicode); assert coercion always returns a member of `{GOOD_LEAD_FOLLOW_UP, DID_NOT_CONNECT, BAD_LEAD, SALE_DONE}` and defaults to `DID_NOT_CONNECT` for unrecognised values
    - **Validates: Requirements 5.3**
    - _File: `backend/__tests__/aiService.test.ts`_
  - [x] 5.4 Write property test for data_source enum coercion (Property 6)
    - **Property 6: data_source Enum Coercion**
    - Generate arbitrary strings; assert coercion always returns one of the five valid values or `""`
    - **Validates: Requirements 5.4**
    - _File: `backend/__tests__/aiService.test.ts`_
  - [x] 5.5 Write property test for created_at normalization (Property 7)
    - **Property 7: created_at Normalization**
    - Generate arbitrary strings; assert the normalization function returns either `""` or a non-empty string where `new Date(result)` is not `NaN`
    - **Validates: Requirements 5.5**
    - _File: `backend/__tests__/aiService.test.ts`_
  - [x] 5.6 Write property test for email overflow (Property 8)
    - **Property 8: Email Overflow to crm_note**
    - Generate records with N ≥ 1 email addresses; assert `email` equals the first address and when N > 1 `crm_note` contains `additional_emails:` with the remaining N−1 addresses, with no address lost
    - **Validates: Requirements 5.6**
    - _File: `backend/__tests__/aiService.test.ts`_
  - [x] 5.7 Write property test for mobile overflow (Property 9)
    - **Property 9: Mobile Overflow to crm_note**
    - Generate records with N ≥ 1 mobile numbers; assert `mobile_without_country_code` equals the first (without country code) and when N > 1 `crm_note` contains `additional_mobiles:` with remaining numbers, with no number lost
    - **Validates: Requirements 5.7**
    - _File: `backend/__tests__/aiService.test.ts`_
  - [x] 5.8 Write property test for newline escaping (Property 10)
    - **Property 10: Newline Character Escaping**
    - Generate CRM records whose field values contain literal `\n` (U+000A) and `\r` (U+000D) characters; assert no field in the returned record contains a literal newline after processing
    - **Validates: Requirements 5.8**
    - _File: `backend/__tests__/aiService.test.ts`_
  - [x] 5.9 Write property test for no-contact-info skip detection (Property 11)
    - **Property 11: No-Contact-Info Skip Detection**
    - Generate records with empty/missing email AND empty mobile; assert the record appears in `skipped` with `reason: "no_contact_info"` and does NOT appear in `records`
    - **Validates: Requirements 5.9**
    - _File: `backend/__tests__/aiService.test.ts`_
  - [x] 5.10 Write unit tests for AI service
    - Test: prompt construction contains all 11 rules, enum coercion examples, overflow email/mobile, `__skip__` flag, LLM returning fewer records than input rows (marks remainder as `ai_batch_failed`)
    - _Requirements: 5.2–5.10, 12.5_
    - _File: `backend/__tests__/aiService.test.ts`_

- [x] 6. Backend retry manager
  - [x] 6.1 Create `backend/src/services/retryManager.ts` — implement `run<T>(fn, { maxAttempts: 4, backoff: [1000, 2000, 4000] })`: call `fn()`, on transient error (429, 500, 502, 503, 504, network timeout >30 s) sleep for the next back-off delay and retry up to 3 additional times; on non-transient error (400, 401, 403, 404) throw immediately without delay; export `classifyAiError(err): 'transient' | 'non_transient'`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x] 6.2 Write property test for transient retry schedule (Property 12)
    - **Property 12: Transient Retry Schedule**
    - Mock `fn` to always throw a transient error; assert total attempts === 4 and delays between attempts are ≥ 1000 ms, ≥ 2000 ms, ≥ 4000 ms in order
    - **Validates: Requirements 6.1**
    - _File: `backend/__tests__/retryManager.test.ts`_
  - [x] 6.3 Write property test for non-transient immediate failure (Property 13)
    - **Property 13: Non-Transient Error Immediate Failure**
    - Generate any non-transient status code (400, 401, 403, 404); mock `fn` to throw with that status; assert exactly 1 attempt is made with no sleep calls
    - **Validates: Requirements 6.4**
    - _File: `backend/__tests__/retryManager.test.ts`_
  - [x] 6.4 Write unit tests for retry manager
    - Test: success on first try, success on second try after one transient failure, exhaustion of all 4 attempts, non-transient stops immediately, sleep durations match schedule
    - _Requirements: 6.1–6.4, 12.5_
    - _File: `backend/__tests__/retryManager.test.ts`_

- [x] 7. Backend batch processor
  - [x] 7.1 Create `backend/src/services/batchProcessor.ts` — implement `processBatches(rows, sseWriter, res, abortSignal)`: chunk rows into batches of ≤50, iterate with abort-signal check, call `retryManager.run(() => aiService.extractFields(batch))`, accumulate `records` and `skipped`, emit `writeProgress` after each batch, on total failure mark all rows in batch as `ai_service_unavailable` or `ai_batch_failed`, emit `writeFinal` with `buildImportResponse` satisfying count invariants
    - Export `chunkRows(rows: T[], size: number): T[][]` as a pure function (needed for property test)
    - _Requirements: 5.1, 5.11, 6.3, 6.5, 7.1, 7.2, 7.3, 7.4, 10.1, 10.2, 10.4, 10.5_
  - [x] 7.2 Write property test for batch chunking invariant (Property 3)
    - **Property 3: Batch Chunking Invariant**
    - Generate arrays of arbitrary length (0–1000); assert every batch ≤ 50 rows, concatenation equals original array, no rows duplicated or omitted
    - **Validates: Requirements 5.1**
    - _File: `backend/__tests__/batchProcessor.test.ts`_
  - [x] 7.3 Write property test for ImportResponse count invariants (Property 14)
    - **Property 14: ImportResponse Count Invariants**
    - Generate arbitrary N with split between records and skipped; assert `total_imported === records.length`, `total_skipped === skipped.length`, `total_imported + total_skipped === N` for all distributions including all-imported and all-skipped boundary cases
    - **Validates: Requirements 7.1, 7.2, 7.3**
    - _File: `backend/__tests__/batchProcessor.test.ts`_
  - [x] 7.4 Write unit tests for batch processor
    - Test: correct chunking at exactly 50 rows, chunking at 51 rows produces two batches, skipped rows accumulate correctly, abort signal stops processing, all-skipped returns HTTP 200
    - _Requirements: 5.1, 5.11, 7.4, 10.5, 12.5_
    - _File: `backend/__tests__/batchProcessor.test.ts`_

- [x] 8. Backend import route and request validation
  - [x] 8.1 Create `backend/src/routes/importRoute.ts` — implement `POST /api/import` handler: validate Content-Type (415 → handled by server middleware), apply multer (triggers 413 on oversize, 422 `missing_file` if no `file` field), call `csvParser` (422 `empty_file` or `invalid_csv`), set SSE headers, create `AbortController`, wire `req.on('close')` to `controller.abort()`, call `processBatches`; validate Content-Type order per spec (415 before multer, 413 before 422 variants)
    - _Requirements: 4.1, 4.3, 4.4, 4.6, 4.7, 11.2, 11.3, 11.5, 11.6_
  - [x] 8.2 Write property test for error response shape invariant (Property 21)
    - **Property 21: Error Response Shape Invariant**
    - For each error condition (415, 413, 422 variants, 504, 500) assert response body is valid JSON with non-empty `error` string and non-empty `message` string, and `Content-Type` header is `application/json`
    - **Validates: Requirements 11.1**
    - _File: `backend/__tests__/importRoute.test.ts`_ (integration test using supertest)

- [x] 9. Checkpoint — backend services complete
  - Ensure all backend unit and property tests pass (`npm test` from `backend/`), TypeScript compiles with no errors (`tsc --noEmit`), and the server starts cleanly. Ask the user if any questions arise before proceeding to frontend work.

- [x] 10. Frontend theme manager and layout
  - [x] 10.1 Create `frontend/lib/themeManager.ts` — implement `resolveInitialTheme()` (checks `localStorage["theme"]`, falls back to `prefers-color-scheme`, defaults to `"light"`) and `applyTheme(theme)` (toggles `dark` class on `<html>`, persists to `localStorage["theme"]`)
    - _Requirements: 9.1, 9.3_
  - [x] 10.2 Write property test for theme resolution and persistence (Property 18)
    - **Property 18: Theme Resolution and Persistence**
    - Generate all combinations of `localStorage` state (`null`, `"dark"`, `"light"`) and OS preference (`"dark"`, `"light"`); assert `resolveInitialTheme()` returns persisted value when present, OS value otherwise, `"light"` when neither; assert `applyTheme` sets `localStorage["theme"]` to the exact supplied string
    - **Validates: Requirements 9.1, 9.3**
    - _File: `frontend/__tests__/themeManager.test.ts`_
  - [x] 10.3 Create `frontend/components/shared/ThemeToggle.tsx` — button that reads current theme from context/prop, calls `applyTheme` on click, and reflects the active theme visually (icon or label switch)
    - _Requirements: 9.2, 9.3_
  - [x] 10.4 Update `frontend/app/layout.tsx` — add `<script>` tag (or inline `beforeInteractive` Script) that calls `resolveInitialTheme()` and `applyTheme()` before first paint to prevent flash of wrong theme; wrap children with theme context if needed
    - _Requirements: 9.1_
  - [x] 10.5 Update `frontend/app/globals.css` — define CSS custom properties for dark/light palettes ensuring text-to-background contrast ratios meet WCAG 2.1 AA (≥4.5:1 normal text, ≥3:1 large text) in both themes
    - _Requirements: 9.4_

- [x] 11. Frontend shared components
  - [x] 11.1 Create `frontend/components/shared/ErrorBanner.tsx` — standardised error display component that accepts `message: string` and optional `onRetry?: () => void`; renders retry button when `onRetry` is provided; accessible (`role="alert"`)
    - _Requirements: 8.7, 10.6_
  - [x] 11.2 Create `frontend/components/shared/VirtualTable.tsx` — reusable `@tanstack/react-virtual` wrapper; accepts `rows: Record<string, string>[]`, `columns: string[]`; renders only visible rows (estimateSize 40 px, overscan 5); supports sticky headers, horizontal scroll, vertical scroll with max-height 400 px constraint; wrapped in `ErrorBoundary` that renders `ErrorBanner` fallback on virtualizer init failure
    - _Requirements: 2.4, 2.5, 2.7, 8.5, 8.6_

- [x] 12. Frontend CSV parser utility
  - [x] 12.1 Create `frontend/lib/csvParser.ts` — PapaParse wrapper function `parseCSV(file: File)` that runs entirely in the browser (no network request); returns `{ rows, errors, partial: boolean }`; handles empty file, header-only, partial parse (some rows succeeded), and total parse failure
    - _Requirements: 2.1, 2.8, 2.9, 2.10_
  - [x] 12.2 Write property test for frontend CSV parsing output fidelity (Property 1)
    - **Property 1: Parsing Output Fidelity**
    - Generate valid CSV strings with arbitrary column names and rows; assert row count returned by `parseCSV` equals the actual number of data rows in the generated CSV
    - **Validates: Requirements 1.10, 2.2**
    - _File: `frontend/__tests__/csvParser.test.ts`_
  - [x] 12.3 Write unit tests for frontend CSV parser
    - Test: valid CSV with multiple columns, empty file, header-only file, malformed CSV with partial rows, zero successful parses
    - _Requirements: 2.1, 2.8, 2.9, 2.10, 12.6_
    - _File: `frontend/__tests__/csvParser.test.ts`_

- [x] 13. Frontend API client with SSE consumer
  - [x] 13.1 Create `frontend/lib/apiClient.ts` — `importCSV(file: File, callbacks: { onProgress, onFinal, onError })` function: POST `multipart/form-data` to `NEXT_PUBLIC_BACKEND_URL/api/import` with the file; consume `text/event-stream` response using `ReadableStream`/`EventSource` pattern; parse each `data:` line as `SseEvent`; dispatch to appropriate callback; handle premature stream close (call `onError`); expose `AbortController` for cancellation
    - _Requirements: 3.4, 3.5, 3.6, 10.3, 10.6_

- [x] 14. Frontend upload step components
  - [x] 14.1 Create `frontend/components/upload/FileError.tsx` — displays one or more validation error messages as accessible inline alerts; supports simultaneous display of type and size errors
    - _Requirements: 1.6, 1.7, 1.8, 1.9_
  - [x] 14.2 Create `frontend/components/upload/DragDropZone.tsx` — drag-and-drop zone plus hidden `<input type="file" accept=".csv">` trigger; applies active drop-target styles on `dragover`; validates file on drop/select (type: `.csv`/`text/csv`, size ≤50 MB, non-zero bytes); dispatches file to parent or calls error callback; renders `FileError` when validation fails
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

- [x] 15. Frontend preview step components
  - [x] 15.1 Create `frontend/components/preview/FileSummary.tsx` — displays file name and total row count; shown after successful parse before `PreviewTable`
    - _Requirements: 1.10_
  - [x] 15.2 Create `frontend/components/preview/PreviewTable.tsx` — renders parsed CSV rows using `VirtualTable` when row count > 1000, plain table otherwise; shows horizontal scroll, vertical scroll (max 400 px), sticky headers, mobile horizontal scroll (< 768 px); shows inline error + partial rows on partial parse; shows empty-state message when no data rows
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

- [x] 16. Frontend processing step component
  - [x] 16.1 Create `frontend/components/processing/ProgressIndicator.tsx` — renders an indeterminate state (spinner or animated bar) until the first `ProgressEvent` is received; then renders a determinate progress bar displaying `Math.round((batches_completed / batches_total) * 100)%`
    - _Requirements: 3.5, 3.6, 10.3_
  - [x] 16.2 Write property test for progress percentage calculation (Property 19)
    - **Property 19: Progress Percentage Calculation**
    - Generate integer pairs `(batches_completed, batches_total)` where `0 ≤ batches_completed ≤ batches_total` and `batches_total > 0`; render `ProgressIndicator` and assert displayed value equals `Math.round((batches_completed / batches_total) * 100)` with no values outside [0, 100]
    - **Validates: Requirements 3.6, 10.3**
    - _File: `frontend/__tests__/progressIndicator.test.tsx`_

- [x] 17. Frontend results step components
  - [x] 17.1 Create `frontend/components/results/ImportSummary.tsx` — displays `total_imported` and `total_skipped` counts exactly as provided in `ImportResponse`; accessible heading structure
    - _Requirements: 8.3_
  - [x] 17.2 Write property test for import summary display correctness (Property 16)
    - **Property 16: Import Summary Display Correctness**
    - Generate arbitrary `ImportResponse` objects satisfying count invariants; render `ImportSummary` and assert both `total_imported` and `total_skipped` values are displayed without truncation or rounding
    - **Validates: Requirements 8.3**
    - _File: `frontend/__tests__/importSummary.test.tsx`_
  - [x] 17.3 Create `frontend/components/results/SkippedSection.tsx` — expandable/collapsible section shown when `total_skipped > 0`; lists every `SkippedRecord` with its `row_index` and `reason`; no entries omitted
    - _Requirements: 8.4_
  - [x] 17.4 Write property test for skipped section completeness (Property 17)
    - **Property 17: Skipped Section Completeness**
    - Generate non-empty `skipped` arrays of arbitrary length; render `SkippedSection` and assert every element's `row_index` and `reason` appear in the rendered output with no entries omitted
    - **Validates: Requirements 8.4**
    - _File: `frontend/__tests__/skippedSection.test.tsx`_
  - [x] 17.5 Create `frontend/components/results/ResultsTable.tsx` — renders `CrmRecord[]` using `VirtualTable` when > 1000 rows, plain table otherwise; 15 columns one per CRM field; horizontal scroll, vertical scroll (max 400 px), sticky headers, mobile horizontal scroll; shows `ErrorBanner` (no table) if virtualizer fails to init
    - _Requirements: 8.1, 8.2, 8.5, 8.6_
  - [x] 17.6 Write property test for results table rendering fidelity (Property 15)
    - **Property 15: Results Table Rendering Fidelity**
    - Generate `CrmRecord[]` of arbitrary length (1–200 in unit tests); render `ResultsTable` and assert exactly `records.length` data rows and exactly 15 column headers, with no records omitted or duplicated
    - **Validates: Requirements 8.2**
    - _File: `frontend/__tests__/resultsTable.test.tsx`_
  - [x] 17.7 Write unit tests for CRM field rendering
    - Test: all 15 fields rendered per row, `crm_status` badge styling, overflow `crm_note` display (additional_emails / additional_mobiles prefix), empty string fields render as empty cells
    - _Requirements: 8.2, 12.6_
    - _File: `frontend/__tests__/crmFieldRendering.test.ts`_

- [x] 18. Frontend import page orchestrator (state machine)
  - [x] 18.1 Create `frontend/app/import/page.tsx` — `ImportPage` component with `useReducer` state machine; define reducer handling transitions: `idle → parsing` (file selected), `parsing → preview` (parse success), `parsing → error` (total parse failure), `preview → processing` (confirm clicked), `processing → results` (final SSE event), `processing → error` (SSE error or network failure); render the correct step component per state; wire `DragDropZone`, `FileSummary`, `PreviewTable`, "Confirm Import" button (disabled states per Requirements 3.1–3.3), `ProgressIndicator`, `ResultsTable`, `ImportSummary`, `SkippedSection`, and `ErrorBanner` with retry; wire `ThemeToggle`
    - _Requirements: 1.3, 1.5, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 8.1, 8.7, 10.6_

- [x] 19. Checkpoint — frontend components complete
  - Run `npm test -- --run` from `frontend/` and ensure all frontend unit and property tests pass; run `tsc --noEmit` from `frontend/` with zero errors; visually verify the four-step flow renders correctly in a browser. Ask the user if any questions arise before proceeding to Docker setup.

- [x] 20. Docker and deployment configuration
  - [x] 20.1 Create `backend/Dockerfile` — multi-stage build: `builder` stage installs all deps and runs `tsc`; `production` stage copies `dist/` and production `node_modules` only into a minimal `node:20-alpine` image; expose port 4000; set `CMD ["node", "dist/server.js"]`
    - _Requirements: 13.1_
  - [x] 20.2 Create `frontend/Dockerfile` — multi-stage build following Next.js standalone output: `builder` stage runs `npm run build` with `output: 'standalone'` in `next.config.ts`; `runner` stage copies `.next/standalone`, `.next/static`, and `public` into `node:20-alpine`; expose port 3000
    - _Requirements: 13.2_
  - [x] 20.3 Create `docker-compose.yml` at repository root — define `backend` and `frontend` services; wire `OPENAI_API_KEY`, `BACKEND_URL` (consumed by frontend), and `FRONTEND_ORIGIN` (consumed by backend CORS); add `healthcheck` for backend (`GET /health`) so frontend depends_on backend being healthy
    - _Requirements: 13.3, 13.4_

- [x] 21. README documentation
  - [x] 21.1 Create `README.md` at repository root containing: project overview, prerequisites (Node 20, Docker, pnpm/npm), step-by-step local setup for frontend and backend, environment variable reference (`OPENAI_API_KEY`, `BACKEND_URL`, `FRONTEND_ORIGIN`, `PORT`), Docker Compose setup instructions, AI prompt strategy section describing the 11-rule JSON-mode system prompt and user prompt template
    - _Requirements: 14.1, 14.2_
  - [x] 21.2 Add to `README.md`: at least two `curl` example commands (successful import with a real CSV file, validation error with wrong Content-Type or missing file), complete JSON response schema for successful import documenting all four top-level fields and `SkippedRecord` structure, live Frontend URL and Backend API base URL placeholders
    - _Requirements: 14.3, 14.4, 15.3_

- [x] 22. Final checkpoint — end-to-end validation
  - Ensure `docker-compose up` starts successfully, `http://localhost:3000/` returns HTTP 200, `http://localhost:4000/health` returns `{"status":"ok"}`, and a sample CSV import completes end-to-end. Run the full test suite (`npm test` in both `frontend/` and `backend/`). Ask the user if any questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP, but all 21 correctness properties are covered by the starred tasks — they are strongly recommended.
- Minimum **100 fast-check iterations** per property test (configure via `fc.assert(..., { numRuns: 100 })`).
- Every property-based test file must include the comment `// Feature: ai-csv-importer, Property N: <property_text>` above each `fc.assert` call.
- TypeScript strict mode is non-negotiable in both packages — keep `tsc --noEmit` clean at every checkpoint.
- All context documents (requirements.md, design.md) are assumed available during implementation; tasks do not repeat their full content.
- The `NEXT_PUBLIC_BACKEND_URL` env var controls the backend URL on the frontend; ensure `.env.local` and Docker env wiring are consistent.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 3, "tasks": ["2.4", "3.1", "4.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "5.1"] },
    { "id": 5, "tasks": ["4.2", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "5.9", "5.10", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "6.4", "7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3", "7.4", "8.1"] },
    { "id": 8, "tasks": ["8.2", "10.1", "10.3", "10.4", "10.5", "11.1", "11.2", "12.1", "13.1"] },
    { "id": 9, "tasks": ["10.2", "12.2", "12.3", "14.1", "14.2", "15.1", "15.2", "16.1", "17.1", "17.3", "17.5"] },
    { "id": 10, "tasks": ["16.2", "17.2", "17.4", "17.6", "17.7", "18.1"] },
    { "id": 11, "tasks": ["20.1", "20.2"] },
    { "id": 12, "tasks": ["20.3", "21.1"] },
    { "id": 13, "tasks": ["21.2"] }
  ]
}
```
