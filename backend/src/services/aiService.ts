/**
 * AI Service — Groq-powered CRM field extraction (OpenAI-compatible API).
 * Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10
 *
 * Uses Groq's free tier (14,400 req/day, 30 req/min) via the OpenAI SDK
 * pointed at https://api.groq.com/openai/v1
 */

import OpenAI from 'openai';
import {
  CrmRecord,
  CrmStatus,
  DataSource,
  SkippedRecord,
} from '../types/index';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_CRM_STATUSES: ReadonlySet<CrmStatus> = new Set([
  'GOOD_LEAD_FOLLOW_UP',
  'DID_NOT_CONNECT',
  'BAD_LEAD',
  'SALE_DONE',
]);

const VALID_DATA_SOURCES: ReadonlySet<DataSource> = new Set([
  'leads_on_demand',
  'meridian_tower',
  'eden_park',
  'varah_swamy',
  'sarjapur_plots',
]);

/** All 15 required CRM field keys. */
const CRM_FIELDS: ReadonlyArray<keyof CrmRecord> = [
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
];

// ---------------------------------------------------------------------------
// System prompt (11 rules)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a CRM data extraction assistant. Your task is to map arbitrary CSV lead data \
to a fixed set of CRM fields. You will receive CSV rows and must return a JSON array \
of exactly the same length, where each element is a CRM record for the corresponding row.

RULES:
1. Return ONLY a valid JSON array. No markdown, no explanation, no extra text. Do NOT wrap the array in any object or key.
2. Return exactly one CRM record per input row, in the same order.
3. Every CRM record must contain all 15 fields even if the value is an empty string.
4. crm_status must be exactly one of: GOOD_LEAD_FOLLOW_UP, DID_NOT_CONNECT, BAD_LEAD, SALE_DONE.
   Map common synonyms: "Interested"/"Hot Lead"/"Follow Up" → GOOD_LEAD_FOLLOW_UP, "Not Interested"/"Bad" → BAD_LEAD, "Contacted"/"New Lead" → DID_NOT_CONNECT, "Sale"/"Closed" → SALE_DONE.
   If no status can be inferred, use DID_NOT_CONNECT.
5. data_source must be exactly one of: leads_on_demand, meridian_tower, eden_park, \
varah_swamy, sarjapur_plots. If no source can be inferred, use an empty string "".
6. created_at must be an ISO 8601 date-time string (e.g. "2024-01-15T00:00:00.000Z") \
if an unambiguous date is present; otherwise use "".
7. If a row contains multiple email addresses, put the first in "email" and append \
the rest to "crm_note" as: additional_emails: addr1, addr2
8. If a row contains multiple mobile numbers, put the first (without country code) \
in "mobile_without_country_code" and append the rest to "crm_note" as: \
additional_mobiles: num1, num2
9. Escape all newlines within field values as the two-character sequence \\n.
10. If a row has NO valid email and NO valid mobile number, set the special field \
"__skip__" to true in that record. All other fields may be empty strings.
11. Use "crm_note" to store any remarks, follow-up notes, or data that does not fit \
the other 14 fields.

FIELD MAPPING GUIDE — map these common CSV column names to the correct CRM fields:
- "name", "full name", "lead name", "contact name", "customer name" → name
- "email", "email address", "e-mail", "mail" → email
- "phone", "mobile", "contact", "number", "cell", "whatsapp" → mobile_without_country_code (strip country code prefix like +91, 0091, 0 and put it in country_code)
- "country code", "isd", "dial code", "code" → country_code
- "company", "company name", "organisation", "organization", "firm", "employer" → company
- "city", "location", "town" → city
- "state", "province", "region" → state
- "country" → country
- "assigned to", "owner", "agent", "sales rep", "executive", "handled by" → lead_owner
- "status", "lead status", "stage", "pipeline" → crm_status
- "remarks", "notes", "comment", "feedback", "description", "details" → crm_note or description
- "source", "lead source", "channel", "campaign" → data_source
- "possession", "possession time", "handover", "delivery date" → possession_time
- "date", "lead date", "created", "created at", "created on", "enquiry date" → created_at`;

// ---------------------------------------------------------------------------
// Helper: build user prompt
// ---------------------------------------------------------------------------

function buildUserPrompt(batch: Record<string, string>[]): string {
  const n = batch.length;
  const headers = batch.length > 0 ? Object.keys(batch[0]).join(', ') : '';
  const rowsJson = JSON.stringify(batch, null, 2);
  return `Process the following ${n} CSV rows and return a JSON array of ${n} CRM records.

CSV Column Headers: ${headers}

Rows (JSON array of objects):
${rowsJson}`;
}

// ---------------------------------------------------------------------------
// Exported helper: coerceCrmStatus
// ---------------------------------------------------------------------------

export function coerceCrmStatus(value: unknown): CrmStatus {
  if (typeof value === 'string' && VALID_CRM_STATUSES.has(value as CrmStatus)) {
    return value as CrmStatus;
  }
  return 'DID_NOT_CONNECT';
}

// ---------------------------------------------------------------------------
// Exported helper: coerceDataSource
// ---------------------------------------------------------------------------

export function coerceDataSource(value: unknown): DataSource | '' {
  if (typeof value === 'string' && VALID_DATA_SOURCES.has(value as DataSource)) {
    return value as DataSource;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Exported helper: normalizeCreatedAt
// ---------------------------------------------------------------------------

export function normalizeCreatedAt(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return value;
}

// ---------------------------------------------------------------------------
// Helper: escape literal newlines
// ---------------------------------------------------------------------------

function escapeNewlines(value: string): string {
  return value.replace(/\r\n/g, '\\n').replace(/[\r\n]/g, '\\n');
}

// ---------------------------------------------------------------------------
// Exported helper: validateAndFillRecord
// ---------------------------------------------------------------------------

export function validateAndFillRecord(
  raw: Record<string, unknown>,
  _rowIndex: number,
): CrmRecord | null {
  if (raw['__skip__'] === true) return null;

  const getString = (key: string): string => {
    const v = raw[key];
    if (typeof v === 'string') return escapeNewlines(v);
    if (v === null || v === undefined) return '';
    return escapeNewlines(String(v));
  };

  return {
    created_at: escapeNewlines(normalizeCreatedAt(raw['created_at'])),
    name: getString('name'),
    email: getString('email'),
    country_code: getString('country_code'),
    mobile_without_country_code: getString('mobile_without_country_code'),
    company: getString('company'),
    city: getString('city'),
    state: getString('state'),
    country: getString('country'),
    lead_owner: getString('lead_owner'),
    crm_status: coerceCrmStatus(raw['crm_status']),
    crm_note: getString('crm_note'),
    data_source: coerceDataSource(raw['data_source']),
    possession_time: getString('possession_time'),
    description: getString('description'),
  };
}

// ---------------------------------------------------------------------------
// Helper: ensure all 15 fields present
// ---------------------------------------------------------------------------

function ensureAllFields(raw: Record<string, unknown>): Record<string, unknown> {
  const filled: Record<string, unknown> = { ...raw };
  for (const field of CRM_FIELDS) {
    if (!(field in filled)) filled[field] = '';
  }
  return filled;
}

// ---------------------------------------------------------------------------
// Main export: extractFields
// ---------------------------------------------------------------------------

export async function extractFields(
  batch: Record<string, string>[],
): Promise<{ records: CrmRecord[]; skipped: SkippedRecord[] }> {
  const apiKey = process.env['GROQ_API_KEY'];
  if (!apiKey) {
    throw Object.assign(new Error('GROQ_API_KEY is not set'), { status: 401 });
  }

  // Groq is OpenAI-compatible — just point the base URL at Groq's endpoint
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  // llama-3.3-70b-versatile is Groq's best free-tier model for structured JSON tasks
  const model = process.env['GROQ_MODEL'] ?? 'llama-3.3-70b-versatile';

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(batch) },
    ],
    temperature: 0.1,
  });

  const rawContent = completion.choices[0]?.message?.content ?? '';

  // Strip markdown code fences if the model wraps the JSON
  const cleaned = rawContent
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error('[aiService] JSON parse failed. Raw:', rawContent.slice(0, 300));
    return buildAllFailed(batch.length);
  }

  // Accept top-level array or common wrapper keys the LLM may use
  let rawRecords: unknown[];
  if (Array.isArray(parsed)) {
    rawRecords = parsed;
  } else if (parsed !== null && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    // Try common wrapper keys: records, crm_records, data, leads, rows, results
    const wrapperKey = ['records', 'crm_records', 'data', 'leads', 'rows', 'results']
      .find((k) => k in obj && Array.isArray(obj[k]));
    if (wrapperKey) {
      rawRecords = obj[wrapperKey] as unknown[];
    } else {
      console.error('[aiService] unexpected structure. Keys:', Object.keys(obj));
      return buildAllFailed(batch.length);
    }
  } else {
    return buildAllFailed(batch.length);
  }

  const records: CrmRecord[] = [];
  const skipped: SkippedRecord[] = [];

  for (let i = 0; i < rawRecords.length; i++) {
    const rawItem = rawRecords[i];
    if (rawItem === null || typeof rawItem !== 'object') {
      skipped.push({ row_index: i, reason: 'ai_batch_failed' });
      continue;
    }
    const raw = ensureAllFields(rawItem as Record<string, unknown>);
    const record = validateAndFillRecord(raw, i);
    if (record === null) {
      skipped.push({ row_index: i, reason: 'no_contact_info' });
    } else {
      records.push(record);
    }
  }

  // If LLM returned fewer records than input rows, mark remainder as failed
  if (rawRecords.length < batch.length) {
    for (let i = rawRecords.length; i < batch.length; i++) {
      skipped.push({ row_index: i, reason: 'ai_batch_failed' });
    }
  }

  return { records, skipped };
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

function buildAllFailed(count: number): { records: CrmRecord[]; skipped: SkippedRecord[] } {
  return {
    records: [],
    skipped: Array.from({ length: count }, (_, i) => ({
      row_index: i,
      reason: 'ai_batch_failed' as const,
    })),
  };
}
