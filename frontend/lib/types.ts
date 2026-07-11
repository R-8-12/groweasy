/**
 * Shared TypeScript interfaces for the AI CSV Importer frontend.
 * Requirements: 5.2, 5.3, 5.4, 7.1, 10.1
 */

/** The 15 fixed CRM fields extracted by the AI for every imported lead. */
export interface CrmRecord {
  created_at: string;                      // ISO 8601 or empty string
  name: string;
  email: string;                           // first email; overflow → crm_note
  country_code: string;                    // e.g. "+91"
  mobile_without_country_code: string;     // first mobile; overflow → crm_note
  company: string;
  city: string;
  state: string;
  country: string;
  lead_owner: string;
  crm_status: CrmStatus;
  crm_note: string;                        // remarks + overflow emails/mobiles
  data_source: DataSource | '';
  possession_time: string;
  description: string;
}

export type CrmStatus =
  | 'GOOD_LEAD_FOLLOW_UP'
  | 'DID_NOT_CONNECT'
  | 'BAD_LEAD'
  | 'SALE_DONE';

export type DataSource =
  | 'leads_on_demand'
  | 'meridian_tower'
  | 'eden_park'
  | 'varah_swamy'
  | 'sarjapur_plots';

export interface SkippedRecord {
  row_index: number;   // 0-based index in the original CSV data rows
  reason: SkipReason;
}

export type SkipReason =
  | 'no_contact_info'
  | 'ai_batch_failed'
  | 'ai_service_unavailable';

export interface ImportResponse {
  records: CrmRecord[];
  skipped: SkippedRecord[];
  total_imported: number;   // invariant: === records.length
  total_skipped: number;    // invariant: === skipped.length
                            // invariant: total_imported + total_skipped === input rows
}

/** Emitted after each batch completes. */
export interface ProgressEvent {
  type: 'progress';
  batches_completed: number;
  batches_total: number;
}

/** Emitted once all batches finish; carries the full import response. */
export interface FinalEvent {
  type: 'final';
  data: ImportResponse;
}

/** Emitted if a fatal error occurs before a final event. */
export interface ErrorEvent {
  type: 'error';
  error: string;
  message: string;
}

export type SseEvent = ProgressEvent | FinalEvent | ErrorEvent;

/** Frontend state machine for the four-step import flow. */
export type ImportStep =
  | { status: 'idle' }
  | { status: 'parsing' }
  | { status: 'preview'; rows: Record<string, string>[]; fileName: string; rowCount: number }
  | { status: 'processing'; progress: ProgressState }
  | { status: 'results'; response: ImportResponse }
  | { status: 'error'; message: string; retryable: boolean };

export interface ProgressState {
  batches_completed: number;
  batches_total: number;
  indeterminate: boolean;  // true until first SSE progress event arrives
}
