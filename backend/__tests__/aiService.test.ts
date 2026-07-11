/**
 * Tests for backend/src/services/aiService.ts
 * Requirements: 5.2–5.10, 12.5
 *
 * Tasks: 5.2 (Property 4), 5.3 (Property 5), 5.4 (Property 6),
 *        5.5 (Property 7), 5.6 (Property 8), 5.7 (Property 9),
 *        5.8 (Property 10), 5.9 (Property 11), 5.10 (Unit tests)
 */

import * as fc from 'fast-check';
import {
  coerceCrmStatus,
  coerceDataSource,
  normalizeCreatedAt,
  validateAndFillRecord,
} from '../src/services/aiService';
import type { CrmStatus, DataSource } from '../src/types/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_15_FIELDS = [
  'created_at',
  'name',
  'email',
  'country_code',
  'mobile_without_country_code',
  'company',
  'city',
  'state',
  'country',
  'lead_owner',
  'crm_status',
  'crm_note',
  'data_source',
  'possession_time',
  'description',
] as const;

const VALID_CRM_STATUSES: CrmStatus[] = [
  'GOOD_LEAD_FOLLOW_UP',
  'DID_NOT_CONNECT',
  'BAD_LEAD',
  'SALE_DONE',
];

const VALID_DATA_SOURCES: (DataSource | '')[] = [
  'leads_on_demand',
  'meridian_tower',
  'eden_park',
  'varah_swamy',
  'sarjapur_plots',
  '',
];

// ---------------------------------------------------------------------------
// Task 5.2 — Property 4: AI Response Field Completeness
// Validates: Requirements 5.2
// ---------------------------------------------------------------------------

describe('Property 4: AI Response Field Completeness', () => {
  // Feature: ai-csv-importer, Property 4: AI Response Field Completeness
  it('every record contains all 15 fields with no undefined values', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary JSON objects possibly missing some of the 15 fields
        fc.record(
          {
            created_at: fc.string(),
            name: fc.string(),
            email: fc.string(),
            country_code: fc.string(),
            mobile_without_country_code: fc.string(),
            company: fc.string(),
            city: fc.string(),
            state: fc.string(),
            country: fc.string(),
            lead_owner: fc.string(),
            crm_status: fc.string(),
            crm_note: fc.string(),
            data_source: fc.string(),
            possession_time: fc.string(),
            description: fc.string(),
          },
          { requiredKeys: [] },
        ),
        (rawPartial) => {
          // Build raw record, removing undefined values to simulate missing keys
          const raw: Record<string, unknown> = Object.fromEntries(
            Object.entries(rawPartial).filter(([, v]) => v !== undefined),
          );

          // Ensure __skip__ is not set so validateAndFillRecord returns a record
          delete raw['__skip__'];

          const record = validateAndFillRecord(raw, 0);
          expect(record).not.toBeNull();
          if (record === null) return;

          // Every field must be present and not undefined
          for (const field of ALL_15_FIELDS) {
            expect(record).toHaveProperty(field);
            expect(record[field]).not.toBeUndefined();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 5.3 — Property 5: crm_status Enum Coercion
// Validates: Requirements 5.3
// ---------------------------------------------------------------------------

describe('Property 5: crm_status Enum Coercion', () => {
  // Feature: ai-csv-importer, Property 5: crm_status Enum Coercion
  it('always returns a valid CrmStatus value for arbitrary string input', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const result = coerceCrmStatus(value);
        expect(VALID_CRM_STATUSES).toContain(result);
      }),
      { numRuns: 100 },
    );
  });

  it('unrecognised values always map to DID_NOT_CONNECT', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const isValid = VALID_CRM_STATUSES.includes(value as CrmStatus);
        if (!isValid) {
          expect(coerceCrmStatus(value)).toBe('DID_NOT_CONNECT');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('empty string maps to DID_NOT_CONNECT', () => {
    expect(coerceCrmStatus('')).toBe('DID_NOT_CONNECT');
  });

  it('whitespace-only string maps to DID_NOT_CONNECT', () => {
    expect(coerceCrmStatus('   ')).toBe('DID_NOT_CONNECT');
    expect(coerceCrmStatus('\t\n')).toBe('DID_NOT_CONNECT');
  });

  it('valid statuses pass through unchanged', () => {
    for (const status of VALID_CRM_STATUSES) {
      expect(coerceCrmStatus(status)).toBe(status);
    }
  });
});

// ---------------------------------------------------------------------------
// Task 5.4 — Property 6: data_source Enum Coercion
// Validates: Requirements 5.4
// ---------------------------------------------------------------------------

describe('Property 6: data_source Enum Coercion', () => {
  // Feature: ai-csv-importer, Property 6: data_source Enum Coercion
  it('always returns a valid DataSource value or empty string for arbitrary input', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const result = coerceDataSource(value);
        expect(VALID_DATA_SOURCES).toContain(result);
      }),
      { numRuns: 100 },
    );
  });

  it('unrecognised values always map to empty string', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const validSources: string[] = [
          'leads_on_demand', 'meridian_tower', 'eden_park', 'varah_swamy', 'sarjapur_plots',
        ];
        if (!validSources.includes(value)) {
          expect(coerceDataSource(value)).toBe('');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('valid data sources pass through unchanged', () => {
    const validSources: DataSource[] = [
      'leads_on_demand', 'meridian_tower', 'eden_park', 'varah_swamy', 'sarjapur_plots',
    ];
    for (const source of validSources) {
      expect(coerceDataSource(source)).toBe(source);
    }
  });

  it('empty string maps to empty string', () => {
    expect(coerceDataSource('')).toBe('');
  });

  it('random string maps to empty string', () => {
    expect(coerceDataSource('unknown_source_xyz')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Task 5.5 — Property 7: created_at Normalization
// Validates: Requirements 5.5
// ---------------------------------------------------------------------------

describe('Property 7: created_at Normalization', () => {
  it('result is either "" or a non-empty string parseable by new Date()', () => {
    // Feature: ai-csv-importer, Property 7: created_at Normalization
    fc.assert(
      fc.property(fc.string(), (value) => {
        const result = normalizeCreatedAt(value);
        if (result === '') {
          // Empty string is always acceptable
          expect(result).toBe('');
        } else {
          // Non-empty result must not produce NaN
          expect(result.length).toBeGreaterThan(0);
          const d = new Date(result);
          expect(isNaN(d.getTime())).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('never returns a non-empty string that produces NaN', () => {
    // Feature: ai-csv-importer, Property 7: created_at Normalization
    fc.assert(
      fc.property(fc.string(), (value) => {
        const result = normalizeCreatedAt(value);
        if (result !== '') {
          expect(isNaN(new Date(result).getTime())).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('returns empty string for clearly unparseable strings', () => {
    expect(normalizeCreatedAt('not-a-date')).toBe('');
    expect(normalizeCreatedAt('hello world')).toBe('');
    expect(normalizeCreatedAt('')).toBe('');
    expect(normalizeCreatedAt('   ')).toBe('');
  });

  it('returns the original value for a valid ISO date string', () => {
    const iso = '2024-01-15T00:00:00.000Z';
    expect(normalizeCreatedAt(iso)).toBe(iso);
  });

  it('returns empty string for non-string input', () => {
    expect(normalizeCreatedAt(null)).toBe('');
    expect(normalizeCreatedAt(undefined)).toBe('');
    expect(normalizeCreatedAt(42)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Task 5.6 — Property 8: Email Overflow to crm_note
// Validates: Requirements 5.6
// ---------------------------------------------------------------------------

describe('Property 8: Email Overflow to crm_note', () => {
  // Feature: ai-csv-importer, Property 8: Email Overflow to crm_note
  // The LLM handles the split; validateAndFillRecord passes through whatever
  // the LLM returned. We verify that a record already split by the LLM
  // (email = first, crm_note already has additional_emails:) survives intact.

  it('single email passes through intact in the email field', () => {
    fc.assert(
      fc.property(
        fc.emailAddress(),
        (email) => {
          const raw: Record<string, unknown> = {
            email,
            crm_note: '',
            crm_status: 'DID_NOT_CONNECT',
            data_source: '',
            created_at: '',
            name: '', country_code: '', mobile_without_country_code: '',
            company: '', city: '', state: '', country: '', lead_owner: '',
            possession_time: '', description: '',
          };
          const record = validateAndFillRecord(raw, 0);
          expect(record).not.toBeNull();
          expect(record!.email).toBe(email);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when LLM already split emails, email = first and crm_note contains additional_emails:', () => {
    fc.assert(
      fc.property(
        fc.emailAddress(),
        fc.array(fc.emailAddress(), { minLength: 1, maxLength: 4 }),
        (firstEmail, extraEmails) => {
          const additionalNote = `additional_emails: ${extraEmails.join(', ')}`;
          const raw: Record<string, unknown> = {
            email: firstEmail,
            crm_note: additionalNote,
            crm_status: 'DID_NOT_CONNECT',
            data_source: '',
            created_at: '',
            name: '', country_code: '', mobile_without_country_code: '',
            company: '', city: '', state: '', country: '', lead_owner: '',
            possession_time: '', description: '',
          };
          const record = validateAndFillRecord(raw, 0);
          expect(record).not.toBeNull();
          // First email is preserved
          expect(record!.email).toBe(firstEmail);
          // crm_note still contains the additional_emails: marker
          expect(record!.crm_note).toContain('additional_emails:');
          // All extra emails are still present
          for (const addr of extraEmails) {
            expect(record!.crm_note).toContain(addr);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 5.7 — Property 9: Mobile Overflow to crm_note
// Validates: Requirements 5.7
// ---------------------------------------------------------------------------

describe('Property 9: Mobile Overflow to crm_note', () => {
  // Feature: ai-csv-importer, Property 9: Mobile Overflow to crm_note
  // Same pass-through pattern as email overflow.

  /** Generator for simple numeric-ish mobile strings */
  const mobileArb = fc.stringMatching(/^[0-9]{7,12}$/);

  it('single mobile passes through intact in mobile_without_country_code', () => {
    fc.assert(
      fc.property(mobileArb, (mobile) => {
        const raw: Record<string, unknown> = {
          mobile_without_country_code: mobile,
          crm_note: '',
          crm_status: 'DID_NOT_CONNECT',
          data_source: '',
          created_at: '',
          name: '', email: '', country_code: '',
          company: '', city: '', state: '', country: '', lead_owner: '',
          possession_time: '', description: '',
        };
        const record = validateAndFillRecord(raw, 0);
        expect(record).not.toBeNull();
        expect(record!.mobile_without_country_code).toBe(mobile);
      }),
      { numRuns: 100 },
    );
  });

  it('when LLM already split mobiles, first mobile field is preserved and crm_note has additional_mobiles:', () => {
    fc.assert(
      fc.property(
        mobileArb,
        fc.array(mobileArb, { minLength: 1, maxLength: 4 }),
        (firstMobile, extraMobiles) => {
          const additionalNote = `additional_mobiles: ${extraMobiles.join(', ')}`;
          const raw: Record<string, unknown> = {
            mobile_without_country_code: firstMobile,
            crm_note: additionalNote,
            crm_status: 'DID_NOT_CONNECT',
            data_source: '',
            created_at: '',
            name: '', email: '', country_code: '',
            company: '', city: '', state: '', country: '', lead_owner: '',
            possession_time: '', description: '',
          };
          const record = validateAndFillRecord(raw, 0);
          expect(record).not.toBeNull();
          // First mobile is preserved
          expect(record!.mobile_without_country_code).toBe(firstMobile);
          // crm_note still contains additional_mobiles: marker
          expect(record!.crm_note).toContain('additional_mobiles:');
          // All extra mobiles are still present
          for (const num of extraMobiles) {
            expect(record!.crm_note).toContain(num);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 5.8 — Property 10: Newline Character Escaping
// Validates: Requirements 5.8
// ---------------------------------------------------------------------------

describe('Property 10: Newline Character Escaping', () => {
  /**
   * Generator: a string that contains at least one literal \n (U+000A)
   * or \r (U+000D) character somewhere in it.
   */
  const stringWithNewline = fc.oneof(
    // String with embedded LF
    fc.tuple(fc.string(), fc.string()).map(([a, b]) => `${a}\n${b}`),
    // String with embedded CR
    fc.tuple(fc.string(), fc.string()).map(([a, b]) => `${a}\r${b}`),
    // String with embedded CR+LF
    fc.tuple(fc.string(), fc.string()).map(([a, b]) => `${a}\r\n${b}`),
  );

  it('no field in the returned record contains a literal newline after processing', () => {
    // Feature: ai-csv-importer, Property 10: Newline Character Escaping
    fc.assert(
      fc.property(
        // Generate a raw record where each of the 15 string fields may contain newlines
        fc.record({
          created_at: stringWithNewline,
          name: stringWithNewline,
          email: stringWithNewline,
          country_code: stringWithNewline,
          mobile_without_country_code: stringWithNewline,
          company: stringWithNewline,
          city: stringWithNewline,
          state: stringWithNewline,
          country: stringWithNewline,
          lead_owner: stringWithNewline,
          crm_status: fc.constant('DID_NOT_CONNECT'),
          crm_note: stringWithNewline,
          data_source: fc.constant(''),
          possession_time: stringWithNewline,
          description: stringWithNewline,
        }),
        (raw) => {
          const record = validateAndFillRecord(raw as Record<string, unknown>, 0);

          // Record should not be skipped (__skip__ is not set)
          expect(record).not.toBeNull();
          if (record === null) return;

          // Every string field must contain no literal \n (U+000A) or \r (U+000D)
          for (const field of ALL_15_FIELDS) {
            const value = record[field];
            expect(typeof value).toBe('string');
            expect(value).not.toMatch(/\n/);
            expect(value).not.toMatch(/\r/);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 5.9 — Property 11: No-Contact-Info Skip Detection
// Validates: Requirements 5.9
// ---------------------------------------------------------------------------

describe('Property 11: No-Contact-Info Skip Detection', () => {
  it('record with __skip__: true returns null from validateAndFillRecord', () => {
    const raw: Record<string, unknown> = {
      __skip__: true,
      name: 'Test User',
      email: '',
      mobile_without_country_code: '',
      crm_status: 'DID_NOT_CONNECT',
      data_source: '',
      created_at: '',
      country_code: '', company: '', city: '', state: '', country: '',
      lead_owner: '', crm_note: '', possession_time: '', description: '',
    };
    const result = validateAndFillRecord(raw, 0);
    expect(result).toBeNull();
  });

  it('record without __skip__ and with contact info returns a CrmRecord', () => {
    fc.assert(
      fc.property(
        fc.emailAddress(),
        (email) => {
          const raw: Record<string, unknown> = {
            email,
            mobile_without_country_code: '',
            crm_status: 'DID_NOT_CONNECT',
            data_source: '',
            created_at: '',
            name: '', country_code: '', company: '', city: '', state: '',
            country: '', lead_owner: '', crm_note: '', possession_time: '',
            description: '',
          };
          const result = validateAndFillRecord(raw, 0);
          expect(result).not.toBeNull();
        },
      ),
      { numRuns: 50 },
    );
  });

  // Feature: ai-csv-importer, Property 11: No-Contact-Info Skip Detection
  // Validates: Requirements 5.9
  it('records with empty/missing email AND empty mobile set __skip__: true → validateAndFillRecord returns null (appears in skipped, not in records)', () => {
    /**
     * Generator for values that represent "no contact info":
     *   - empty string, whitespace-only, null, undefined, or simply absent.
     * The LLM sets __skip__: true for such rows; we replicate that here.
     */
    const noContactValue = fc.oneof(
      fc.constant(''),
      fc.constant(null),
      fc.constant(undefined),
    );

    fc.assert(
      fc.property(
        // Arbitrary name/company — does not affect contact-info check
        fc.string(),
        // Empty/missing email
        noContactValue,
        // Empty/missing mobile
        noContactValue,
        (name, emailVal, mobileVal) => {
          // Build a raw record as the LLM would when it finds no contact info.
          // The LLM sets __skip__: true; all other fields may be empty strings.
          const raw: Record<string, unknown> = {
            __skip__: true,
            name,
            email: emailVal ?? '',
            mobile_without_country_code: mobileVal ?? '',
            crm_status: 'DID_NOT_CONNECT',
            data_source: '',
            created_at: '',
            country_code: '',
            company: '',
            city: '',
            state: '',
            country: '',
            lead_owner: '',
            crm_note: '',
            possession_time: '',
            description: '',
          };

          // ── validateAndFillRecord must return null ──────────────────────────
          const result = validateAndFillRecord(raw, 0);
          expect(result).toBeNull();

          // ── Simulate the extractFields loop ────────────────────────────────
          // When result is null the caller pushes to skipped, not records.
          const records: ReturnType<typeof validateAndFillRecord>[] = [];
          const skipped: Array<{ row_index: number; reason: string }> = [];

          if (result === null) {
            skipped.push({ row_index: 0, reason: 'no_contact_info' });
          } else {
            records.push(result);
          }

          // The record must NOT appear in the records array
          expect(records).toHaveLength(0);

          // The record MUST appear in skipped with reason no_contact_info
          expect(skipped).toHaveLength(1);
          expect(skipped[0].reason).toBe('no_contact_info');
          expect(skipped[0].row_index).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ===========================================================================
// Task 5.10 — Unit Tests for AI Service
// Validates: Requirements 5.2–5.10, 12.5
// ===========================================================================

// ---------------------------------------------------------------------------
// Mock the Gemini SDK before importing extractFields
// ---------------------------------------------------------------------------

// Mutable ref so each test can control the response.
const mockCreate = jest.fn();

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    })),
  };
});

process.env['GROQ_API_KEY'] = 'test-groq-key';

// Import extractFields AFTER the mock is registered
import { extractFields } from '../src/services/aiService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid CRM record object for LLM mock responses. */
function makeMockRecord(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    created_at: '',
    name: 'John Doe',
    email: 'john@example.com',
    country_code: '+91',
    mobile_without_country_code: '9876543210',
    company: 'Acme',
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'India',
    lead_owner: 'Sales Team',
    crm_status: 'GOOD_LEAD_FOLLOW_UP',
    crm_note: '',
    data_source: 'leads_on_demand',
    possession_time: '',
    description: '',
    ...overrides,
  };
}

/** Configure the Gemini mock to return a given JSON string as the LLM response. */
function mockLlmResponse(content: string): void {
  mockCreate.mockResolvedValueOnce({ choices: [{ message: { content } }] });
}

// ---------------------------------------------------------------------------
// 5.10.1 — Prompt construction contains all 11 rules
// ---------------------------------------------------------------------------

describe('5.10.1 Prompt construction: system prompt contains all 11 rules', () => {
  /**
   * With Gemini we send a single combined `contents` string.
   * Intercept generateContent and inspect its `contents` argument.
   */
  beforeEach(() => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify([makeMockRecord()]) } }] });
  });

  it('sends a non-empty prompt to the LLM', async () => {
    await extractFields([{ name: 'Alice', phone: '9999999999' }]);
    expect(mockCreate).toHaveBeenCalled();
    const callArgs = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const systemMsg = callArgs.messages.find((m) => m.role === 'system');
    expect(systemMsg).toBeDefined();
    expect(systemMsg!.content.length).toBeGreaterThan(0);
  });

  it('Rule 1 — instructs to return ONLY valid JSON', async () => {
    await extractFields([{ name: 'Alice' }]);
    const callArgs = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const systemContent = callArgs.messages.find((m) => m.role === 'system')!.content;
    expect(systemContent).toMatch(/Return ONLY valid JSON/i);
  });

  it('Rule 2 — instructs to return exactly one CRM record per input row', async () => {
    await extractFields([{ name: 'Alice' }]);
    const callArgs = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const systemContent = callArgs.messages.find((m) => m.role === 'system')!.content;
    expect(systemContent).toMatch(/exactly one CRM record per input row/i);
  });

  it('Rule 3 — instructs that every record must contain all 15 fields', async () => {
    await extractFields([{ name: 'Alice' }]);
    const callArgs = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const systemContent = callArgs.messages.find((m) => m.role === 'system')!.content;
    expect(systemContent).toMatch(/all 15 fields/i);
  });

  it('Rule 4 — lists valid crm_status values and default DID_NOT_CONNECT', async () => {
    await extractFields([{ name: 'Alice' }]);
    const callArgs = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const systemContent = callArgs.messages.find((m) => m.role === 'system')!.content;
    expect(systemContent).toContain('GOOD_LEAD_FOLLOW_UP');
    expect(systemContent).toContain('DID_NOT_CONNECT');
    expect(systemContent).toContain('BAD_LEAD');
    expect(systemContent).toContain('SALE_DONE');
  });

  it('Rule 5 — lists valid data_source values and default empty string', async () => {
    await extractFields([{ name: 'Alice' }]);
    const callArgs = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const systemContent = callArgs.messages.find((m) => m.role === 'system')!.content;
    expect(systemContent).toContain('leads_on_demand');
    expect(systemContent).toContain('meridian_tower');
    expect(systemContent).toContain('eden_park');
    expect(systemContent).toContain('varah_swamy');
    expect(systemContent).toContain('sarjapur_plots');
  });

  it('Rule 6 — mentions ISO 8601 for created_at', async () => {
    await extractFields([{ name: 'Alice' }]);
    const callArgs = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const systemContent = callArgs.messages.find((m) => m.role === 'system')!.content;
    expect(systemContent).toMatch(/ISO 8601/i);
  });

  it('Rule 7 — email overflow: instructs additional_emails prefix', async () => {
    await extractFields([{ name: 'Alice' }]);
    const callArgs = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const systemContent = callArgs.messages.find((m) => m.role === 'system')!.content;
    expect(systemContent).toContain('additional_emails:');
  });

  it('Rule 8 — mobile overflow: instructs additional_mobiles prefix', async () => {
    await extractFields([{ name: 'Alice' }]);
    const callArgs = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const systemContent = callArgs.messages.find((m) => m.role === 'system')!.content;
    expect(systemContent).toContain('additional_mobiles:');
  });

  it('Rule 9 — instructs to escape newlines as \\n', async () => {
    await extractFields([{ name: 'Alice' }]);
    const callArgs = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const systemContent = callArgs.messages.find((m) => m.role === 'system')!.content;
    // The prompt text says: Escape all newlines ... as the two-character sequence \n
    expect(systemContent).toMatch(/[Ee]scape all newlines/);
  });

  it('Rule 10 — instructs __skip__ for rows with no email and no mobile', async () => {
    await extractFields([{ name: 'Alice' }]);
    const callArgs = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const systemContent = callArgs.messages.find((m) => m.role === 'system')!.content;
    expect(systemContent).toContain('__skip__');
  });

  it('Rule 11 — instructs to use crm_note for overflow/remarks', async () => {
    await extractFields([{ name: 'Alice' }]);
    const callArgs = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const systemContent = callArgs.messages.find((m) => m.role === 'system')!.content;
    expect(systemContent).toMatch(/crm_note.*remarks|remarks.*crm_note/i);
  });

  afterEach(() => {
    mockCreate.mockReset();
  });
});

// ---------------------------------------------------------------------------
// 5.10.2 — Enum coercion examples via extractFields
// ---------------------------------------------------------------------------

describe('5.10.2 Enum coercion via extractFields', () => {
  afterEach(() => {
    mockCreate.mockReset();
  });

  it('invalid crm_status returned by LLM is coerced to DID_NOT_CONNECT', async () => {
    mockLlmResponse(
      JSON.stringify([makeMockRecord({ crm_status: 'UNKNOWN_STATUS', email: 'a@b.com' })]),
    );
    const { records } = await extractFields([{ email: 'a@b.com' }]);
    expect(records).toHaveLength(1);
    expect(records[0].crm_status).toBe('DID_NOT_CONNECT');
  });

  it('empty crm_status returned by LLM is coerced to DID_NOT_CONNECT', async () => {
    mockLlmResponse(
      JSON.stringify([makeMockRecord({ crm_status: '', email: 'a@b.com' })]),
    );
    const { records } = await extractFields([{ email: 'a@b.com' }]);
    expect(records).toHaveLength(1);
    expect(records[0].crm_status).toBe('DID_NOT_CONNECT');
  });

  it('invalid data_source returned by LLM is coerced to empty string', async () => {
    mockLlmResponse(
      JSON.stringify([makeMockRecord({ data_source: 'unknown_source', email: 'a@b.com' })]),
    );
    const { records } = await extractFields([{ email: 'a@b.com' }]);
    expect(records).toHaveLength(1);
    expect(records[0].data_source).toBe('');
  });

  it('valid crm_status passes through unchanged', async () => {
    mockLlmResponse(
      JSON.stringify([makeMockRecord({ crm_status: 'SALE_DONE', email: 'a@b.com' })]),
    );
    const { records } = await extractFields([{ email: 'a@b.com' }]);
    expect(records[0].crm_status).toBe('SALE_DONE');
  });

  it('valid data_source passes through unchanged', async () => {
    mockLlmResponse(
      JSON.stringify([makeMockRecord({ data_source: 'eden_park', email: 'a@b.com' })]),
    );
    const { records } = await extractFields([{ email: 'a@b.com' }]);
    expect(records[0].data_source).toBe('eden_park');
  });
});

// ---------------------------------------------------------------------------
// 5.10.3 — Overflow email: first email in `email`, extras in `crm_note`
// ---------------------------------------------------------------------------

describe('5.10.3 Overflow email handling via extractFields', () => {
  afterEach(() => {
    mockCreate.mockReset();
  });

  it('first email goes to email field and extras appear in crm_note with additional_emails: prefix', async () => {
    const llmRecord = makeMockRecord({
      email: 'first@example.com',
      crm_note: 'additional_emails: second@example.com, third@example.com',
      mobile_without_country_code: '',
    });
    mockLlmResponse(JSON.stringify([llmRecord]));

    const { records } = await extractFields([{ raw_emails: 'first@example.com,second@example.com,third@example.com' }]);

    expect(records).toHaveLength(1);
    expect(records[0].email).toBe('first@example.com');
    expect(records[0].crm_note).toContain('additional_emails:');
    expect(records[0].crm_note).toContain('second@example.com');
    expect(records[0].crm_note).toContain('third@example.com');
  });

  it('single email: email field is set and crm_note has no additional_emails prefix', async () => {
    const llmRecord = makeMockRecord({
      email: 'only@example.com',
      crm_note: '',
      mobile_without_country_code: '',
    });
    mockLlmResponse(JSON.stringify([llmRecord]));

    const { records } = await extractFields([{ email: 'only@example.com' }]);

    expect(records[0].email).toBe('only@example.com');
    expect(records[0].crm_note).not.toContain('additional_emails:');
  });
});

// ---------------------------------------------------------------------------
// 5.10.4 — Overflow mobile: first mobile in field, extras in crm_note
// ---------------------------------------------------------------------------

describe('5.10.4 Overflow mobile handling via extractFields', () => {
  afterEach(() => {
    mockCreate.mockReset();
  });

  it('first mobile goes to mobile_without_country_code and extras appear in crm_note with additional_mobiles: prefix', async () => {
    const llmRecord = makeMockRecord({
      email: 'contact@example.com',
      mobile_without_country_code: '9000000001',
      crm_note: 'additional_mobiles: 9000000002, 9000000003',
    });
    mockLlmResponse(JSON.stringify([llmRecord]));

    const { records } = await extractFields([{ phones: '9000000001,9000000002,9000000003' }]);

    expect(records).toHaveLength(1);
    expect(records[0].mobile_without_country_code).toBe('9000000001');
    expect(records[0].crm_note).toContain('additional_mobiles:');
    expect(records[0].crm_note).toContain('9000000002');
    expect(records[0].crm_note).toContain('9000000003');
  });

  it('single mobile: mobile field is set and crm_note has no additional_mobiles prefix', async () => {
    const llmRecord = makeMockRecord({
      email: 'x@example.com',
      mobile_without_country_code: '9876543210',
      crm_note: '',
    });
    mockLlmResponse(JSON.stringify([llmRecord]));

    const { records } = await extractFields([{ phone: '9876543210' }]);

    expect(records[0].mobile_without_country_code).toBe('9876543210');
    expect(records[0].crm_note).not.toContain('additional_mobiles:');
  });
});

// ---------------------------------------------------------------------------
// 5.10.5 — __skip__ flag: records with __skip__: true go to skipped array
// ---------------------------------------------------------------------------

describe('5.10.5 __skip__ flag handling via extractFields', () => {
  afterEach(() => {
    mockCreate.mockReset();
  });

  it('record with __skip__: true appears in skipped with reason no_contact_info', async () => {
    const skippedRecord = {
      __skip__: true,
      created_at: '',
      name: 'No Contact',
      email: '',
      country_code: '',
      mobile_without_country_code: '',
      company: '',
      city: '',
      state: '',
      country: '',
      lead_owner: '',
      crm_status: 'DID_NOT_CONNECT',
      crm_note: '',
      data_source: '',
      possession_time: '',
      description: '',
    };
    mockLlmResponse(JSON.stringify([skippedRecord]));

    const { records, skipped } = await extractFields([{ name: 'No Contact' }]);

    expect(records).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toBe('no_contact_info');
    expect(skipped[0].row_index).toBe(0);
  });

  it('mix of skipped and valid records are separated correctly', async () => {
    const validRecord = makeMockRecord({ email: 'valid@example.com' });
    const skippedRecord = {
      __skip__: true,
      created_at: '', name: 'Ghost', email: '', country_code: '',
      mobile_without_country_code: '', company: '', city: '', state: '',
      country: '', lead_owner: '', crm_status: 'DID_NOT_CONNECT',
      crm_note: '', data_source: '', possession_time: '', description: '',
    };
    mockLlmResponse(JSON.stringify([validRecord, skippedRecord]));

    const { records, skipped } = await extractFields([
      { email: 'valid@example.com' },
      { name: 'Ghost' },
    ]);

    expect(records).toHaveLength(1);
    expect(records[0].email).toBe('valid@example.com');
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toBe('no_contact_info');
    expect(skipped[0].row_index).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5.10.6 — LLM returns fewer records than input rows → remainder ai_batch_failed
// ---------------------------------------------------------------------------

describe('5.10.6 LLM returns fewer records than input rows', () => {
  afterEach(() => {
    mockCreate.mockReset();
  });

  it('rows not covered by LLM response are marked ai_batch_failed', async () => {
    // Send 3 rows but LLM only returns 1 record
    const singleRecord = makeMockRecord({ email: 'row0@example.com' });
    mockLlmResponse(JSON.stringify([singleRecord]));

    const inputRows = [
      { email: 'row0@example.com' },
      { email: 'row1@example.com' },
      { email: 'row2@example.com' },
    ];
    const { records, skipped } = await extractFields(inputRows);

    // First record is successfully extracted
    expect(records).toHaveLength(1);
    expect(records[0].email).toBe('row0@example.com');

    // Rows 1 and 2 should be in skipped with ai_batch_failed
    const failedSkipped = skipped.filter((s) => s.reason === 'ai_batch_failed');
    expect(failedSkipped).toHaveLength(2);
    expect(failedSkipped.map((s) => s.row_index).sort()).toEqual([1, 2]);
  });

  it('LLM returning zero records marks all rows as ai_batch_failed', async () => {
    mockLlmResponse(JSON.stringify([]));

    const inputRows = [
      { email: 'a@example.com' },
      { email: 'b@example.com' },
    ];
    const { records, skipped } = await extractFields(inputRows);

    expect(records).toHaveLength(0);
    expect(skipped).toHaveLength(2);
    expect(skipped.every((s) => s.reason === 'ai_batch_failed')).toBe(true);
    expect(skipped.map((s) => s.row_index).sort()).toEqual([0, 1]);
  });

  it('LLM returning exactly as many records as input rows produces no ai_batch_failed skips', async () => {
    const twoRecords = [
      makeMockRecord({ email: 'a@example.com' }),
      makeMockRecord({ email: 'b@example.com' }),
    ];
    mockLlmResponse(JSON.stringify(twoRecords));

    const { records, skipped } = await extractFields([
      { email: 'a@example.com' },
      { email: 'b@example.com' },
    ]);

    expect(records).toHaveLength(2);
    expect(skipped.filter((s) => s.reason === 'ai_batch_failed')).toHaveLength(0);
  });

  it('invalid JSON from LLM marks all rows as ai_batch_failed', async () => {
    mockLlmResponse('this is not valid json');

    const { records, skipped } = await extractFields([
      { email: 'x@example.com' },
      { email: 'y@example.com' },
    ]);

    expect(records).toHaveLength(0);
    expect(skipped).toHaveLength(2);
    expect(skipped.every((s) => s.reason === 'ai_batch_failed')).toBe(true);
  });
});
