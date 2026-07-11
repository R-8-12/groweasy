'use client';

/**
 * ResultsTable — renders an array of CrmRecord objects in a scrollable table.
 *
 * Behaviour:
 *   records.length > 1000  → VirtualTable (virtualised, performance-safe)
 *                             Wrapped in an ErrorBoundary: if the virtualizer
 *                             fails to init, ErrorBanner is shown and the
 *                             table is NOT rendered. (Requirement 8.6)
 *   records.length ≤ 1000  → plain <table>
 *
 * Shared table features (both paths):
 *   • Exactly 15 columns — one per CRM field in spec order (Requirement 8.2)
 *   • Horizontal scroll (overflow-x: auto)                 (Requirement 8.5)
 *   • Vertical scroll, max-height 400 px                   (Requirement 8.5)
 *   • Sticky column headers                                (Requirement 8.5)
 *   • Mobile horizontal scroll (same overflow mechanism)   (Requirement 8.5)
 *   • crm_status displayed as a colour-coded badge
 *   • Tailwind CSS + dark mode (dark: variants)
 *
 * Requirements: 8.1, 8.2, 8.5, 8.6
 */

import React, { Component } from 'react';
import type { CrmRecord, CrmStatus } from '@/lib/types';
import ErrorBanner from '@/components/shared/ErrorBanner';
import VirtualTable from '@/components/shared/VirtualTable';

// ---------------------------------------------------------------------------
// Column definitions (ordered per spec)
// ---------------------------------------------------------------------------

/** The 15 CRM fields in display order, with human-readable header labels. */
const CRM_COLUMNS: { key: keyof CrmRecord; label: string }[] = [
  { key: 'created_at',                    label: 'Created At' },
  { key: 'name',                          label: 'Name' },
  { key: 'email',                         label: 'Email' },
  { key: 'country_code',                  label: 'Country Code' },
  { key: 'mobile_without_country_code',   label: 'Mobile' },
  { key: 'company',                       label: 'Company' },
  { key: 'city',                          label: 'City' },
  { key: 'state',                         label: 'State' },
  { key: 'country',                       label: 'Country' },
  { key: 'lead_owner',                    label: 'Lead Owner' },
  { key: 'crm_status',                    label: 'CRM Status' },
  { key: 'crm_note',                      label: 'CRM Note' },
  { key: 'data_source',                   label: 'Data Source' },
  { key: 'possession_time',               label: 'Possession Time' },
  { key: 'description',                   label: 'Description' },
];

const COLUMN_KEYS   = CRM_COLUMNS.map((c) => c.key);
const COLUMN_LABELS = CRM_COLUMNS.map((c) => c.label);

const VIRTUALIZER_THRESHOLD = 1000;

// ---------------------------------------------------------------------------
// crm_status badge
// ---------------------------------------------------------------------------

/** Maps each CrmStatus value to Tailwind colour classes (light + dark). */
const CRM_STATUS_STYLES: Record<CrmStatus, string> = {
  GOOD_LEAD_FOLLOW_UP:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  DID_NOT_CONNECT:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  BAD_LEAD:
    'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  SALE_DONE:
    'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
};

const CRM_STATUS_LABELS: Record<CrmStatus, string> = {
  GOOD_LEAD_FOLLOW_UP: 'Good Lead',
  DID_NOT_CONNECT:     'Did Not Connect',
  BAD_LEAD:            'Bad Lead',
  SALE_DONE:           'Sale Done',
};

function CrmStatusBadge({ status }: { status: string }) {
  const isValid = status in CRM_STATUS_STYLES;
  if (!isValid) {
    return <span className="text-xs text-gray-500 dark:text-gray-400">{status || '—'}</span>;
  }
  const s = status as CrmStatus;
  return (
    <span
      className={[
        'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
        CRM_STATUS_STYLES[s],
      ].join(' ')}
    >
      {CRM_STATUS_LABELS[s]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Cell renderer — returns a plain string value or a special element
// ---------------------------------------------------------------------------

function CellContent({ col, value }: { col: keyof CrmRecord; value: string }) {
  if (col === 'crm_status') {
    return <CrmStatusBadge status={value} />;
  }
  return <>{value || <span className="text-gray-400 dark:text-gray-600">—</span>}</>;
}

// ---------------------------------------------------------------------------
// Convert CrmRecord[] → Record<string,string>[] for VirtualTable
// ---------------------------------------------------------------------------

/**
 * VirtualTable accepts `rows: Record<string,string>[]` keyed by the column
 * name passed in the `columns` prop.  We use the column *label* (human-readable)
 * as the key so the header row rendered by VirtualTable matches.
 *
 * The `crm_status` column requires special badge rendering that VirtualTable
 * cannot provide, so for the virtual path we fall back to the raw string value
 * (the badge is a nice-to-have; correctness and virtualisation take priority).
 */
function toVirtualRows(records: CrmRecord[]): Record<string, string>[] {
  return records.map((rec) => {
    const row: Record<string, string> = {};
    CRM_COLUMNS.forEach(({ key, label }) => {
      row[label] = String(rec[key] ?? '');
    });
    return row;
  });
}

// ---------------------------------------------------------------------------
// PlainTable — used when records.length ≤ 1000
// ---------------------------------------------------------------------------

function PlainTable({ records }: { records: CrmRecord[] }) {
  return (
    /*
     * Outer wrapper:
     *   overflow-x-auto  → horizontal scroll on all viewport widths (incl. < 768 px)
     *   overflow-y-auto  → vertical scroll when content exceeds max-height
     *   max-height 400px → caps visible height (Requirements 8.5)
     */
    <div
      style={{ maxHeight: '400px' }}
      className={[
        'overflow-x-auto overflow-y-auto',
        'border border-[var(--color-table-border)]',
        'rounded-md',
        'w-full',
      ].join(' ')}
    >
      <table
        className="min-w-full border-collapse text-sm"
        aria-label="CRM import results"
      >
        {/* Sticky column headers — Requirement 8.5 */}
        <thead
          className="sticky top-0 z-10"
          style={{ backgroundColor: 'var(--color-table-header-bg)' }}
        >
          <tr>
            {CRM_COLUMNS.map(({ key, label }) => (
              <th
                key={key}
                scope="col"
                className={[
                  'whitespace-nowrap px-3 py-2',
                  'text-left text-xs font-semibold uppercase tracking-wide',
                  'border-b border-[var(--color-table-border)]',
                ].join(' ')}
                style={{ color: 'var(--color-table-header-text)' }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {records.map((record, rowIndex) => (
            <tr
              key={rowIndex}
              style={{
                backgroundColor:
                  rowIndex % 2 === 0
                    ? 'var(--color-table-row-bg)'
                    : 'var(--color-table-row-alt-bg)',
              }}
              className="hover:bg-[var(--color-table-row-hover)]"
            >
              {COLUMN_KEYS.map((col) => (
                <td
                  key={col}
                  className={[
                    'whitespace-nowrap px-3 py-1.5 text-xs',
                    'border-b border-[var(--color-table-border)]',
                  ].join(' ')}
                  style={{ color: 'var(--color-text)' }}
                >
                  <CellContent col={col} value={String(record[col] ?? '')} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ErrorBoundary — wraps the VirtualTable path (Requirement 8.6)
// ---------------------------------------------------------------------------

interface VirtualBoundaryProps {
  records: CrmRecord[];
}

interface VirtualBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class VirtualTableBoundary extends Component<
  VirtualBoundaryProps,
  VirtualBoundaryState
> {
  constructor(props: VirtualBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): VirtualBoundaryState {
    const message =
      error instanceof Error
        ? error.message
        : 'The table virtualizer failed to initialise.';
    return { hasError: true, errorMessage: message };
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      /*
       * Virtualizer init failure → show ErrorBanner; do NOT render the table.
       * Requirement 8.6: "IF the Virtualizer fails to initialize, THE Frontend
       * SHALL display an error message and SHALL NOT render the Results_Table."
       */
      return (
        <ErrorBanner
          message={`Unable to render the results table: ${this.state.errorMessage}`}
          onRetry={this.handleRetry}
        />
      );
    }

    /*
     * Convert CrmRecord[] → Record<string,string>[] keyed by column label
     * so VirtualTable can display the correct header + cell values.
     */
    const virtualRows = toVirtualRows(this.props.records);

    return (
      <VirtualTable
        rows={virtualRows}
        columns={COLUMN_LABELS}
      />
    );
  }
}

// ---------------------------------------------------------------------------
// ResultsTable — public export
// ---------------------------------------------------------------------------

export interface ResultsTableProps {
  /** All CRM records returned by the backend (Requirement 8.2). */
  records: CrmRecord[];
}

/**
 * ResultsTable
 *
 * - records.length > 1000  → VirtualTable wrapped in ErrorBoundary
 * - records.length ≤ 1000  → PlainTable
 *
 * Both paths satisfy Requirements 8.2, 8.5.
 * The ErrorBoundary path satisfies Requirement 8.6.
 */
export default function ResultsTable({ records }: ResultsTableProps) {
  if (records.length > VIRTUALIZER_THRESHOLD) {
    return <VirtualTableBoundary records={records} />;
  }

  return <PlainTable records={records} />;
}
