'use client';

/**
 * PreviewTable — renders parsed CSV rows in a scrollable, accessible table.
 *
 * Behaviour matrix (driven by `rows.length` and `parseError`):
 *
 *  rows=0, no error  → empty-state message; no table (Requirement 2.9)
 *  rows=0, error     → ErrorBanner only; no table     (Requirement 2.10)
 *  rows>0, error     → ErrorBanner + table (partial)  (Requirement 2.8)
 *  rows>1000         → VirtualTable (with built-in ErrorBoundary)
 *                       If virtualizer fails, ErrorBanner blocks preview
 *                       (Requirement 2.7)
 *  rows≤1000         → plain <table> with:
 *                         • horizontal scroll          (Requirement 2.3)
 *                         • vertical scroll, max 400px (Requirement 2.4)
 *                         • sticky column headers      (Requirement 2.5)
 *                         • mobile horizontal scroll   (Requirement 2.6)
 *
 * Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10
 */

import ErrorBanner from '@/components/shared/ErrorBanner';
import VirtualTable from '@/components/shared/VirtualTable';

const VIRTUALIZER_THRESHOLD = 1000;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PreviewTableProps {
  /** All successfully parsed data rows. */
  rows: Record<string, string>[];
  /** Column names in display order (from CSV headers). */
  columns: string[];
  /**
   * Human-readable error message from the CSV parser.
   * Present on partial parse (some rows succeeded) or total parse failure
   * (zero rows parsed). The distinction is made via `rows.length`:
   *   - rows.length > 0 → partial failure: show banner + table
   *   - rows.length === 0 → total failure: show banner only
   */
  parseError?: string;
}

// ---------------------------------------------------------------------------
// PlainTable — used when row count ≤ 1000
// ---------------------------------------------------------------------------

function PlainTable({
  rows,
  columns,
}: {
  rows: Record<string, string>[];
  columns: string[];
}) {
  return (
    /*
     * Outer wrapper: overflow-x-auto covers horizontal scroll on all viewport
     * widths (including < 768 px — Requirement 2.6); overflow-y-auto +
     * max-height 400 px caps vertical size (Requirements 2.3, 2.4).
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
        aria-label="CSV preview"
      >
        {/* Sticky column headers — Requirements 2.5 */}
        <thead
          className="sticky top-0 z-10"
          style={{ backgroundColor: 'var(--color-table-header-bg)' }}
        >
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                scope="col"
                className={[
                  'whitespace-nowrap px-3 py-2',
                  'text-left text-xs font-semibold uppercase tracking-wide',
                  'border-b border-[var(--color-table-border)]',
                ].join(' ')}
                style={{ color: 'var(--color-table-header-text)' }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, rowIndex) => (
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
              {columns.map((col) => (
                <td
                  key={col}
                  className={[
                    'whitespace-nowrap px-3 py-1.5 text-xs',
                    'border-b border-[var(--color-table-border)]',
                  ].join(' ')}
                  style={{ color: 'var(--color-text)' }}
                >
                  {row[col] ?? ''}
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
// PreviewTable — public export
// ---------------------------------------------------------------------------

export default function PreviewTable({
  rows,
  columns,
  parseError,
}: PreviewTableProps) {
  // ------------------------------------------------------------------
  // Case A: no data rows
  // ------------------------------------------------------------------
  if (rows.length === 0) {
    if (parseError !== undefined) {
      /*
       * Total parse failure — zero rows parsed, error present.
       * Show ErrorBanner only; do NOT render the table. (Requirement 2.10)
       */
      return <ErrorBanner message={parseError} />;
    }

    /*
     * Header-only or empty CSV — no error, no rows.
     * Show empty-state message; do NOT render the table. (Requirement 2.9)
     */
    return (
      <p
        role="status"
        aria-live="polite"
        className={[
          'flex items-center justify-center rounded-md px-6 py-10',
          'border border-dashed border-[var(--color-border)]',
          'text-sm text-[var(--color-text-muted)]',
        ].join(' ')}
      >
        No data rows found.
      </p>
    );
  }

  // ------------------------------------------------------------------
  // Case B: rows available — choose table implementation
  // ------------------------------------------------------------------
  const useVirtualizer = rows.length > VIRTUALIZER_THRESHOLD;

  return (
    <div className="flex flex-col gap-3">
      {/*
       * Inline parse-error banner for partial parses.
       * Rendered above the table when some rows succeeded. (Requirement 2.8)
       */}
      {parseError !== undefined && (
        <ErrorBanner message={parseError} />
      )}

      {/*
       * Table — virtualised for > 1000 rows, plain otherwise.
       *
       * VirtualTable wraps itself in an ErrorBoundary: if the virtualizer
       * fails to initialise, it blocks the preview and shows ErrorBanner.
       * (Requirement 2.7)
       */}
      {useVirtualizer ? (
        <VirtualTable rows={rows} columns={columns} />
      ) : (
        <PlainTable rows={rows} columns={columns} />
      )}
    </div>
  );
}
