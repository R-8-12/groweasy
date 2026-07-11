/**
 * Integration tests for POST /api/import error response shape.
 *
 * Feature: ai-csv-importer, Property 21: Error Response Shape Invariant
 * Validates: Requirements 11.1
 *
 * Requirements 11.1: The backend SHALL return all error responses as JSON objects
 * with at minimum the fields `error` (string, machine-readable code) and
 * `message` (string, human-readable description).
 */

import request from 'supertest';
import { app } from '../src/server';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Module-level mock — used only for the 500 scenario
// ---------------------------------------------------------------------------

jest.mock('../src/services/csvParser', () => {
  const actual = jest.requireActual<typeof import('../src/services/csvParser')>(
    '../src/services/csvParser',
  );
  return {
    ...actual,
    // Default: delegate to real implementation.
    // Individual tests override this with mockImplementationOnce.
    parseCSV: jest.fn(actual.parseCSV),
  };
});

// Mock processBatches to prevent SSE streaming side-effects in tests that
// reach the batch-processing stage (500 scenario only actually needs this
// because the mock throws before processBatches is ever called, but we mock
// it defensively so no real AI calls are ever issued during this test suite).
jest.mock('../src/services/batchProcessor', () => {
  const actual = jest.requireActual<typeof import('../src/services/batchProcessor')>(
    '../src/services/batchProcessor',
  );
  return {
    ...actual,
    processBatches: jest.fn(async () => { /* no-op */ }),
  };
});

import { parseCSV } from '../src/services/csvParser';

const mockParseCSV = parseCSV as jest.MockedFunction<typeof parseCSV>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Asserts that the response has the correct error response shape. */
function assertErrorShape(res: request.Response): void {
  // Content-Type must be application/json
  expect(res.headers['content-type']).toMatch(/application\/json/);

  // Body must have non-empty `error` string
  expect(typeof res.body.error).toBe('string');
  expect(res.body.error.length).toBeGreaterThan(0);

  // Body must have non-empty `message` string
  expect(typeof res.body.message).toBe('string');
  expect(res.body.message.length).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// Scenario trigger functions
// Each returns a supertest Response for a specific error condition.
// ---------------------------------------------------------------------------

/** 415: POST with non-multipart Content-Type */
async function trigger415(): Promise<request.Response> {
  return request(app)
    .post('/api/import')
    .set('Content-Type', 'application/json')
    .send('{}');
}

/** 413: POST multipart with file > 50 MB */
async function trigger413(): Promise<request.Response> {
  return request(app)
    .post('/api/import')
    .attach('file', Buffer.alloc(51 * 1024 * 1024, 'a'), {
      filename: 'big.csv',
      contentType: 'text/csv',
    });
}

/** 422 missing_file: POST multipart without a file field */
async function trigger422MissingFile(): Promise<request.Response> {
  return request(app)
    .post('/api/import')
    .field('dummy', 'value');
}

/** 422 empty_file: POST multipart with a 0-byte CSV */
async function trigger422EmptyFile(): Promise<request.Response> {
  return request(app)
    .post('/api/import')
    .attach('file', Buffer.alloc(0), {
      filename: 'empty.csv',
      contentType: 'text/csv',
    });
}

/** 422 invalid_csv: POST multipart with content that triggers a csv-parse error */
async function trigger422InvalidCsv(): Promise<request.Response> {
  // An unclosed double-quote causes csv-parse (with relax_quotes: false) to throw an
  // "Invalid Closing Quote" or "Invalid Record Length" parse error → invalid_csv
  // We also include a data row so it doesn't get rejected as empty first.
  const malformedCsv = Buffer.from('name,email\n"Alice,alice@example.com\n"Bob,bob@example.com\n');
  return request(app)
    .post('/api/import')
    .attach('file', malformedCsv, {
      filename: 'corrupt.csv',
      contentType: 'text/csv',
    });
}

/** 500: parseCSV throws an unexpected error */
async function trigger500(): Promise<request.Response> {
  mockParseCSV.mockRejectedValueOnce(new Error('unexpected internal failure'));

  // A valid CSV to get past the 415/413/422-missing checks, then hit the mock
  const validCsv = Buffer.from('name,email\nAlice,alice@example.com\n');
  return request(app)
    .post('/api/import')
    .attach('file', validCsv, {
      filename: 'valid.csv',
      contentType: 'text/csv',
    });
}

// ---------------------------------------------------------------------------
// Error scenario registry
// ---------------------------------------------------------------------------

interface ErrorScenario {
  name: string;
  expectedStatus: number;
  expectedErrorCode: string;
  trigger: () => Promise<request.Response>;
}

const ERROR_SCENARIOS: ErrorScenario[] = [
  {
    name: '415 unsupported_media_type',
    expectedStatus: 415,
    expectedErrorCode: 'unsupported_media_type',
    trigger: trigger415,
  },
  {
    name: '413 file_too_large',
    expectedStatus: 413,
    expectedErrorCode: 'file_too_large',
    trigger: trigger413,
  },
  {
    name: '422 missing_file',
    expectedStatus: 422,
    expectedErrorCode: 'missing_file',
    trigger: trigger422MissingFile,
  },
  {
    name: '422 empty_file',
    expectedStatus: 422,
    expectedErrorCode: 'empty_file',
    trigger: trigger422EmptyFile,
  },
  {
    name: '422 invalid_csv',
    expectedStatus: 422,
    expectedErrorCode: 'invalid_csv',
    trigger: trigger422InvalidCsv,
  },
  {
    name: '500 internal_error',
    expectedStatus: 500,
    expectedErrorCode: 'internal_error',
    trigger: trigger500,
  },
];

// ---------------------------------------------------------------------------
// Property 21: Error Response Shape Invariant
// Validates: Requirements 11.1
// ---------------------------------------------------------------------------

// Feature: ai-csv-importer, Property 21: Error Response Shape Invariant
describe('Property 21: Error Response Shape Invariant', () => {
  // Reset mocks between tests so mockRejectedValueOnce doesn't bleed
  afterEach(() => {
    jest.clearAllMocks();
    // Restore parseCSV to the real implementation after each test
    mockParseCSV.mockImplementation(
      jest.requireActual<typeof import('../src/services/csvParser')>(
        '../src/services/csvParser',
      ).parseCSV,
    );
  });

  it(
    'every error condition returns valid JSON with non-empty error and message strings ' +
      'and Content-Type: application/json',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Pick a scenario on each run; fast-check will vary the selection
          // across numRuns iterations
          fc.constantFrom(...ERROR_SCENARIOS),
          async (scenario: ErrorScenario) => {
            const res = await scenario.trigger();

            // Status must match expected code
            expect(res.status).toBe(scenario.expectedStatus);

            // Core shape invariant
            assertErrorShape(res);

            // Error code must match expected value
            expect(res.body.error).toBe(scenario.expectedErrorCode);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  // -------------------------------------------------------------------------
  // Individual deterministic unit tests (one per error condition)
  // These complement the property test with pinned assertions.
  // -------------------------------------------------------------------------

  it('415: non-multipart request returns unsupported_media_type', async () => {
    const res = await trigger415();
    expect(res.status).toBe(415);
    assertErrorShape(res);
    expect(res.body.error).toBe('unsupported_media_type');
  });

  it('413: oversized file returns file_too_large', async () => {
    const res = await trigger413();
    expect(res.status).toBe(413);
    assertErrorShape(res);
    expect(res.body.error).toBe('file_too_large');
  });

  it('422: multipart without file field returns missing_file', async () => {
    const res = await trigger422MissingFile();
    expect(res.status).toBe(422);
    assertErrorShape(res);
    expect(res.body.error).toBe('missing_file');
  });

  it('422: 0-byte CSV returns empty_file', async () => {
    const res = await trigger422EmptyFile();
    expect(res.status).toBe(422);
    assertErrorShape(res);
    expect(res.body.error).toBe('empty_file');
  });

  it('422: binary garbage CSV returns invalid_csv', async () => {
    const res = await trigger422InvalidCsv();
    expect(res.status).toBe(422);
    assertErrorShape(res);
    expect(res.body.error).toBe('invalid_csv');
  });

  it('500: unhandled exception from parseCSV returns internal_error', async () => {
    const res = await trigger500();
    expect(res.status).toBe(500);
    assertErrorShape(res);
    expect(res.body.error).toBe('internal_error');
  });
});
