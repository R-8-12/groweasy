# Requirements Document

## Introduction

GrowEasy CRM requires an AI-powered CSV Importer that enables users to upload lead data in any valid CSV format regardless of column naming conventions or layout. The system uses an AI model to intelligently map arbitrary CSV columns to a fixed set of CRM fields, returning structured lead records. The feature covers a four-step frontend workflow (upload → preview → confirm → results) backed by a Node.js/Express API that batches CSV records to an LLM for field extraction.

## Glossary

- **CSV_Importer**: The end-to-end feature composed of the Frontend and the Backend.
- **Frontend**: The Next.js client application.
- **Backend**: The Node.js + Express API server.
- **AI_Service**: The integration layer that communicates with the chosen LLM (OpenAI, Gemini, or Claude).
- **CSV_Parser**: The client-side utility that reads an uploaded file and converts it to row objects.
- **Batch_Processor**: The backend component that groups CSV records and submits them to the AI_Service in batches.
- **CRM_Record**: A structured object containing the fifteen CRM fields extracted by the AI_Service.
- **Lead**: A single row from the uploaded CSV that represents a prospective customer.
- **Preview_Table**: The responsive table rendered on the frontend after client-side parsing, before backend processing.
- **Results_Table**: The responsive table rendered on the frontend after the backend returns CRM_Records.
- **Drag_Drop_Zone**: The interactive UI area that accepts files dragged from the operating system.
- **Progress_Indicator**: A visual element (spinner, progress bar, or streaming counter) shown during AI processing.
- **Retry_Manager**: The backend component responsible for retrying failed AI_Service batch requests.
- **Virtualizer**: The frontend component that renders only visible rows of a large dataset.
- **Dark_Mode**: A UI theme that uses dark background colors and light foreground colors.
- **crm_status**: The lead status field; must be one of the four enumerated values.
- **data_source**: The lead source field; must be one of the five enumerated values or blank.
- **crm_note**: A free-text field used for remarks, overflow emails, overflow mobiles, and follow-up notes.

---

## Requirements

### Requirement 1: CSV File Upload

**User Story:** As a CRM user, I want to upload a CSV file via drag-and-drop or a file picker, so that I can begin the import process without being restricted to a specific upload method.

#### Acceptance Criteria

1. THE Frontend SHALL render a Drag_Drop_Zone that accepts files with a `.csv` MIME type or `.csv` file extension.
2. WHEN a user drags a valid CSV file over the Drag_Drop_Zone, THE Frontend SHALL apply a distinct border style and background color change to the Drag_Drop_Zone to indicate it is an active drop target.
3. WHEN a user drops a valid CSV file onto the Drag_Drop_Zone, THE Frontend SHALL display a loading indicator while client-side parsing is in progress.
4. WHEN a user clicks the file picker trigger, THE Frontend SHALL open the operating system file picker filtered to `.csv` files.
5. WHEN a user selects a file through the file picker, THE Frontend SHALL display a loading indicator while client-side parsing is in progress.
6. IF a user drops or selects a file with zero bytes, THEN THE Frontend SHALL display an inline error message rejecting the file as empty.
7. IF a user drops or selects a file that is not a valid CSV (wrong extension or MIME type), THEN THE Frontend SHALL display an inline error message describing the accepted file types.
8. IF a user drops or selects a CSV file larger than 50 MB, THEN THE Frontend SHALL display an inline error message stating the maximum file size.
9. IF a user drops or selects a file that violates both type and size constraints, THEN THE Frontend SHALL display both error messages simultaneously.
10. WHEN client-side parsing completes successfully, THE Frontend SHALL display a file summary showing the file name and total row count before rendering the Preview_Table.
11. IF the uploaded file has a valid `.csv` extension but its contents cannot be parsed as valid CSV, THEN THE Frontend SHALL display an inline error message indicating the file content is not valid CSV.

---

### Requirement 2: Client-Side CSV Preview

**User Story:** As a CRM user, I want to see a preview of the uploaded CSV rows before committing to import, so that I can verify the data looks correct without triggering AI processing.

#### Acceptance Criteria

1. WHEN a valid CSV file is selected, THE CSV_Parser SHALL parse the file entirely in the browser; no HTTP request SHALL be issued to the Backend during this step.
2. WHEN parsing is complete, THE Frontend SHALL render the Preview_Table displaying all parsed rows.
3. WHEN the number of columns in the parsed CSV exceeds the visible viewport width, THE Preview_Table SHALL enable horizontal scrolling so all columns remain accessible.
4. WHEN the rendered height of the Preview_Table exceeds 400 px, THE Preview_Table SHALL enable vertical scrolling, constraining its visible height to 400 px.
5. THE Preview_Table SHALL render column headers as sticky so that they remain visible during vertical scrolling.
6. WHEN the viewport width is less than 768 px, THE Preview_Table SHALL enable horizontal scrolling so all columns remain accessible without wrapping or truncation.
7. WHEN the CSV contains more than 1000 rows, THE Frontend SHALL render the Preview_Table using the Virtualizer so that only visible rows are mounted in the DOM; IF the Virtualizer fails to initialize, THEN THE Frontend SHALL block the preview and display an error message.
8. IF the CSV_Parser encounters a malformed CSV (e.g. mismatched quotes or inconsistent column counts) and at least one row is successfully parsed, THEN THE Frontend SHALL display an inline error message AND SHALL render the Preview_Table with the rows that were successfully parsed.
9. WHEN the CSV file contains no data rows (header row only or completely empty), THE Frontend SHALL display a message indicating no data rows are present and SHALL NOT render the Preview_Table.
10. IF the CSV_Parser encounters a malformed CSV and zero rows are successfully parsed, THEN THE Frontend SHALL display an inline error message and SHALL NOT render the Preview_Table.

---

### Requirement 3: Import Confirmation

**User Story:** As a CRM user, I want to explicitly confirm the import before any AI processing begins, so that I retain control over when the backend API is called.

#### Acceptance Criteria

1. WHEN the Preview_Table is visible, THE Frontend SHALL render a "Confirm Import" button in an enabled state.
2. WHEN no file has been uploaded or client-side parsing is still in progress, THE Frontend SHALL render the "Confirm Import" button in a disabled state.
3. WHILE AI processing is in progress, THE Frontend SHALL render the "Confirm Import" button in a disabled state.
4. WHEN the user clicks the enabled "Confirm Import" button, THE Frontend SHALL submit the CSV file to the `POST /api/import` Backend endpoint.
5. WHEN the "Confirm Import" button is clicked, THE Frontend SHALL immediately display the Progress_Indicator in an indeterminate state before the first progress event is received.
6. WHEN a progress event is received from the Backend, THE Progress_Indicator SHALL update to display `batches_completed` out of `batches_total` as defined in Requirement 10.

---

### Requirement 4: Backend CSV Ingestion

**User Story:** As a backend system, I want to accept any valid CSV file upload without assuming fixed column names, so that the importer works with diverse real-world lead data exports.

#### Acceptance Criteria

1. THE Backend SHALL expose a `POST /api/import` endpoint that accepts `multipart/form-data` with a single CSV file in a field named `file`.
2. WHEN a valid CSV file is uploaded, THE Backend SHALL parse the file into an array of row objects keyed by the original column headers, preserving all columns regardless of naming.
3. IF the uploaded file is empty (zero bytes or header row only with no data rows), THEN THE Backend SHALL return HTTP 422 with a JSON error body describing the issue.
4. IF the uploaded file cannot be parsed as valid CSV, THEN THE Backend SHALL return HTTP 422 with a JSON error body describing the parse failure.
5. THE Backend SHALL accept CSV files up to 50 MB in size.
6. IF the uploaded file exceeds 50 MB, THEN THE Backend SHALL return HTTP 413 with a JSON error body; size validation SHALL occur before content parsing so that HTTP 413 takes precedence over HTTP 422.
7. IF the request does not include a `file` field in the multipart payload, THEN THE Backend SHALL return HTTP 422 with a JSON error body indicating the missing field.
8. IF the request includes more than one file field, THEN THE Backend SHALL process only the first file and ignore additional files.

---

### Requirement 5: AI-Powered Field Extraction

**User Story:** As a CRM system, I want the AI_Service to map arbitrary CSV columns to the fifteen CRM fields, so that lead data is consistently structured regardless of the source format.

#### Acceptance Criteria

1. THE Batch_Processor SHALL divide CSV rows into batches of no more than 50 rows per AI_Service request.
2. WHEN the AI_Service processes a batch, THE AI_Service SHALL return a CRM_Record for each input row containing the fifteen CRM fields: `created_at`, `name`, `email`, `country_code`, `mobile_without_country_code`, `company`, `city`, `state`, `country`, `lead_owner`, `crm_status`, `crm_note`, `data_source`, `possession_time`, and `description`.
3. THE AI_Service SHALL set `crm_status` to exactly one of: `GOOD_LEAD_FOLLOW_UP`, `DID_NOT_CONNECT`, `BAD_LEAD`, or `SALE_DONE`; any row where no status can be inferred SHALL have `crm_status` set to `DID_NOT_CONNECT`.
4. THE AI_Service SHALL set `data_source` to exactly one of: `leads_on_demand`, `meridian_tower`, `eden_park`, `varah_swamy`, or `sarjapur_plots`; rows where no source can be inferred SHALL have `data_source` set to an empty string.
5. WHEN a CSV row contains a value that includes an unambiguous calendar date with recognisable day, month, and year components, THE AI_Service SHALL set `created_at` to an ISO 8601 date-time string parseable by JavaScript's `new Date()`; IF no such value is present, THE AI_Service SHALL set `created_at` to an empty string.
6. WHEN a CSV row contains multiple email addresses, THE AI_Service SHALL set `email` to the first email address and SHALL append the remaining email addresses to `crm_note` as a comma-separated list with the prefix `additional_emails:`.
7. WHEN a CSV row contains multiple mobile numbers, THE AI_Service SHALL set `mobile_without_country_code` to the first mobile number without country code prefix and SHALL append the remaining mobile numbers to `crm_note` as a comma-separated list with the prefix `additional_mobiles:`.
8. THE AI_Service SHALL escape all newline characters within field values as the two-character sequence `\n` so that each CRM_Record maps to exactly one CSV row.
9. WHEN a CSV row contains neither a valid email address nor a valid mobile number, THE AI_Service SHALL flag the record as skipped and THE Batch_Processor SHALL collect the flagged record into the `skipped` response array with the reason `"no_contact_info"`.
10. THE AI_Service SHALL use the `crm_note` field to store remarks, follow-up notes, and any data that does not fit into the other fourteen CRM fields.
11. WHEN the AI_Service is unavailable for a batch after all retry attempts defined in Requirement 6 are exhausted, THE Batch_Processor SHALL mark all rows in that batch as skipped with the reason `"ai_service_unavailable"` and SHALL continue processing the next unprocessed batch.

---

### Requirement 6: Retry Mechanism for AI Batches

**User Story:** As a backend system, I want failed AI batch requests to be retried automatically, so that transient LLM API errors do not cause partial import failures.

#### Acceptance Criteria

1. WHEN an AI_Service request fails with a transient error (HTTP 429, 500, 502, 503, or 504, or a network timeout exceeding 30 seconds), THE Retry_Manager SHALL retry the batch up to 3 additional times (4 total attempts) using exponential back-off with delays of 1 s, 2 s, and 4 s (formula: 2^(N−2) seconds where N is the attempt number starting at 2), stopping immediately when the retry limit is reached.
2. WHEN a batch succeeds on a retry attempt, THE Batch_Processor SHALL continue processing the next unprocessed batch without additional delay.
3. IF a batch fails all 4 attempts, THEN THE Backend SHALL mark all rows in that batch as skipped with the reason `"ai_batch_failed"` and SHALL continue processing remaining batches.
4. WHEN an AI_Service request fails with a non-transient error (HTTP 400, 401, 403, or 404), THE Retry_Manager SHALL not retry the batch and SHALL immediately mark all rows in that batch as skipped with the reason `"ai_batch_failed"`.
5. THE Backend SHALL include all rows skipped due to `"ai_batch_failed"` in the `skipped` array and `total_skipped` count defined in Requirement 7.

---

### Requirement 7: Structured Import Response

**User Story:** As a CRM user, I want the backend to return a clear, structured JSON response after import, so that the frontend can display parsed records and skipped records accurately.

#### Acceptance Criteria

1. WHEN all batches have been processed, THE Backend SHALL return HTTP 200 with a JSON body containing: `records` (array of CRM_Records), `skipped` (array of objects each containing `row_index` (integer, 0-based) and `reason` (string)), `total_imported` (integer), and `total_skipped` (integer).
2. THE Backend SHALL ensure `total_imported` equals the length of the `records` array.
3. THE Backend SHALL ensure `total_skipped` equals the length of the `skipped` array, and `total_imported` plus `total_skipped` equals the total number of input rows.
4. WHEN `total_imported` is zero and `total_skipped` equals the total input row count, THE Backend SHALL return HTTP 200 with the structured body and SHALL NOT return an error status code.

---

### Requirement 8: Results Display

**User Story:** As a CRM user, I want to see the imported records and any skipped records in a clear results view after AI processing completes, so that I can assess the quality and completeness of the import.

#### Acceptance Criteria

1. WHEN the Backend returns HTTP 200, THE Frontend SHALL hide the Progress_Indicator and SHALL render the Results_Table.
2. THE Results_Table SHALL display all CRM_Records from the `records` array, with one row per CRM_Record and one column per CRM field.
3. THE Results_Table SHALL display a dedicated summary element (separate from the data rows) showing the `total_imported` and `total_skipped` counts.
4. WHEN `total_skipped` is greater than zero, THE Frontend SHALL render a secondary table or expandable section listing each skipped row's `row_index` and `reason`.
5. THE Results_Table SHALL support horizontal scrolling, vertical scrolling (max height 400 px), sticky headers, and horizontal scrolling on viewports narrower than 768 px, using the same constraints defined for the Preview_Table in Requirement 2.
6. WHEN the Results_Table contains more than 1000 rows, THE Frontend SHALL render it using the Virtualizer; IF the Virtualizer fails to initialize, THE Frontend SHALL display an error message and SHALL NOT render the Results_Table.
7. IF the Backend returns an HTTP error response, THEN THE Frontend SHALL display an error message containing the `message` field from the Backend error body and SHALL render a retry button that re-submits the same file to the `POST /api/import` endpoint.

---

### Requirement 9: Dark Mode

**User Story:** As a CRM user, I want the application to support a dark mode, so that I can use the importer comfortably in low-light environments.

#### Acceptance Criteria

1. WHEN the application loads and no preference is stored in `localStorage`, THE Frontend SHALL read the `prefers-color-scheme` media query and apply the matching theme; IF the media query is not supported, THE Frontend SHALL default to light mode.
2. THE Frontend SHALL render a toggle control that allows the user to switch between light mode and dark mode; the toggle SHALL reflect the currently active theme.
3. WHEN the user activates the toggle, THE Frontend SHALL switch the active theme and SHALL persist the chosen value (`"dark"` or `"light"`) to `localStorage` under the key `"theme"`; on subsequent page loads, the persisted value SHALL take precedence over the OS preference.
4. WHILE dark mode is active, THE Frontend SHALL render all UI surfaces — including tables, buttons, inputs, and the Drag_Drop_Zone — using a dark background palette where text-to-background contrast ratios meet WCAG 2.1 AA (minimum 4.5:1 for normal text and 3:1 for large text).

---

### Requirement 10: Progress Streaming

**User Story:** As a CRM user, I want real-time progress feedback during AI processing, so that I know the import is working and can estimate time remaining.

#### Acceptance Criteria

1. WHEN a valid CSV file is submitted to `POST /api/import`, THE Backend SHALL emit progress events via Server-Sent Events (SSE) or chunked JSON streaming after each batch completes.
2. WHEN a batch completes, THE Backend SHALL emit a progress event containing `batches_completed` (integer) and `batches_total` (integer).
3. THE Frontend SHALL consume progress events and SHALL update the Progress_Indicator to display `round((batches_completed / batches_total) * 100)`% completion; before the first event is received, THE Frontend SHALL show the Progress_Indicator in an indeterminate state.
4. WHEN all batches complete, THE Backend SHALL emit a final event containing the complete structured import response as defined in Requirement 7 and SHALL close the stream.
5. WHEN the client disconnects before the stream completes, THE Backend SHALL abort all pending AI_Service requests for that import and SHALL release associated resources.
6. IF the Frontend receives a malformed event or the stream closes before a final event is received, THE Frontend SHALL display an error message and SHALL offer a retry action consistent with Requirement 8 criterion 7.

---

### Requirement 11: API Design and Error Handling

**User Story:** As a developer integrating with the Backend, I want the API to follow consistent conventions and return descriptive errors, so that integrations are straightforward to build and debug.

#### Acceptance Criteria

1. THE Backend SHALL return all error responses as JSON objects with at minimum the fields `error` (string, machine-readable code) and `message` (string, human-readable description).
2. THE Backend SHALL validate that the `Content-Type` of the uploaded request is `multipart/form-data`; IF it is not, THEN THE Backend SHALL return HTTP 415 with a JSON error body regardless of any other condition.
3. THE Backend SHALL set the `Access-Control-Allow-Origin` header to permit requests from the configured Frontend origin.
4. THE Backend SHALL log each request with method, path, HTTP status code, and processing duration in milliseconds.
5. THE Backend SHALL complete the full import processing within 120 seconds per request; IF processing exceeds this limit and no higher-priority validation error (HTTP 413, 415, or 422) applies, THEN THE Backend SHALL return HTTP 504 with `error: "processing_timeout"` and a human-readable `message`.
6. IF the `multipart/form-data` request does not include a `file` field, THEN THE Backend SHALL return HTTP 422 with `error: "missing_file"`.

---

### Requirement 12: Code Quality and Architecture

**User Story:** As a developer maintaining this codebase, I want the project to follow clean architecture principles with type safety, so that the code is easy to understand, test, and extend.

#### Acceptance Criteria

1. THE Backend SHALL use TypeScript with strict mode enabled.
2. THE Frontend SHALL use TypeScript with strict mode enabled.
3. THE Backend SHALL implement each named concern — routing, validation, CSV parsing, AI service integration, batch processing, and response serialization — in a dedicated file or module with no cross-concern logic.
4. THE Frontend SHALL implement each named concern — file upload UI, CSV parsing, API client, table rendering, and theme management — in a dedicated file or module with no cross-concern logic.
5. THE Backend SHALL include unit tests for the CSV parser, the Batch_Processor, the Retry_Manager, and the AI_Service prompt construction function; the test runner's coverage report SHALL show at minimum 80% statement coverage on those modules.
6. THE Frontend SHALL include unit tests for the CSV_Parser utility and the CRM field rendering logic; the test runner's coverage report SHALL show at minimum 80% statement coverage on those modules.

---

### Requirement 13: Docker Setup

**User Story:** As a developer or DevOps engineer, I want the application to be runnable via Docker Compose, so that local setup and deployment are reproducible across machines.

#### Acceptance Criteria

1. THE CSV_Importer SHALL include a `Dockerfile` for the Backend that uses a multi-stage build: a build stage compiles TypeScript and a production stage copies only compiled output and `node_modules` into a minimal Node.js base image.
2. THE CSV_Importer SHALL include a `Dockerfile` for the Frontend that uses a multi-stage build following Next.js standalone output conventions.
3. THE CSV_Importer SHALL include a `docker-compose.yml` that starts both containers and wires the environment variables `OPENAI_API_KEY` (or equivalent LLM key), `BACKEND_URL` (consumed by the Frontend), and `FRONTEND_ORIGIN` (consumed by the Backend for CORS).
4. WHEN `docker-compose up` is executed from the repository root, THE Frontend SHALL return HTTP 200 on `http://localhost:3000/` and THE Backend SHALL return HTTP 200 on `http://localhost:4000/health` within 60 seconds.

---

### Requirement 14: Documentation

**User Story:** As a developer onboarding to this project, I want a comprehensive README, so that I can set up, run, and understand the system without additional guidance.

#### Acceptance Criteria

1. THE CSV_Importer SHALL include a `README.md` at the repository root containing: project overview, prerequisites, step-by-step local setup instructions for both the Frontend and Backend services, environment variable reference, Docker Compose setup instructions, and a description of the AI prompt strategy used for field mapping.
2. THE README.md SHALL include a section describing how to obtain and configure the LLM API key for the chosen provider.
3. THE README.md SHALL include at minimum two example `curl` commands for the `POST /api/import` endpoint: one demonstrating a successful import and one demonstrating a validation error response.
4. THE README.md SHALL include a section documenting the complete JSON response schema for a successful import, covering the four fields (`records`, `skipped`, `total_imported`, `total_skipped`) and the structure of each `skipped` object (`row_index`, `reason`) as defined in Requirement 7.

---

### Requirement 15: Deployment

**User Story:** As a stakeholder evaluating this project, I want the application deployed to a publicly accessible URL, so that I can evaluate it without running it locally.

#### Acceptance Criteria

1. THE Frontend SHALL be deployed to a publicly accessible URL on a platform such as Vercel, Netlify, or equivalent.
2. THE Backend SHALL be deployed to a publicly accessible URL on a platform such as Railway, Render, Fly.io, or equivalent.
3. THE README.md SHALL include the live Frontend URL and the live Backend API base URL.
4. WHEN the deployed Frontend is accessed, THE Frontend SHALL successfully submit a CSV file to the deployed Backend and receive a valid import response, confirming end-to-end communication is functional.
5. WHEN the deployed Frontend communicates with the deployed Backend, no CORS errors SHALL appear in the browser console for requests to the `POST /api/import` endpoint.
