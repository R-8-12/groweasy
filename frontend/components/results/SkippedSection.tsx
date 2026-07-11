'use client';

/**
 * SkippedSection — expandable/collapsible list of every skipped CSV row.
 *
 * Renders only when `skipped.length > 0`. Uses a native <details>/<summary>
 * element so expand/collapse works without JavaScript and is natively
 * accessible to screen readers and keyboard users.
 *
 * Every SkippedRecord is listed without truncation — no entries are omitted
 * regardless of array size.
 *
 * Requirements: 8.4
 */

import { SkippedRecord, SkipReason } from '@/lib/types';

/** Human-readable labels for each SkipReason value. */
const REASON_LABELS: Record<SkipReason, string> = {
  no_contact_info: 'No contact info',
  ai_batch_failed: 'AI batch failed',
  ai_service_unavailable: 'AI service unavailable',
};

interface SkippedSectionProps {
  /** Array of skipped records from the ImportResponse. */
  skipped: SkippedRecord[];
}

export default function SkippedSection({ skipped }: SkippedSectionProps) {
  // Guard: nothing to show when no rows were skipped.
  if (skipped.length === 0) return null;

  return (
    <details
      className={[
        'rounded-md border',
        'border-amber-300 dark:border-amber-600',
        'bg-amber-50 dark:bg-amber-950/30',
      ].join(' ')}
    >
      {/* ── Toggle header ── */}
      <summary
        className={[
          'flex cursor-pointer select-none list-none items-center gap-2 px-4 py-3',
          'text-sm font-semibold',
          'text-amber-800 dark:text-amber-300',
          // Remove default disclosure triangle in WebKit/Firefox
          '[&::-webkit-details-marker]:hidden',
          // Hover / focus styles
          'rounded-md',
          'hover:bg-amber-100 dark:hover:bg-amber-900/40',
          'focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-amber-500 dark:focus-visible:ring-amber-400',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-amber-50',
          'dark:focus-visible:ring-offset-amber-950',
        ].join(' ')}
      >
        {/* Custom chevron that rotates when open */}
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={[
            'h-4 w-4 shrink-0 transition-transform duration-200',
            'details-open:rotate-90',
            // Tailwind doesn't ship details-open by default; use a CSS trick below.
          ].join(' ')}
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clipRule="evenodd"
          />
        </svg>

        {/* Warning icon */}
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>

        {/* Label with count */}
        <span>
          Skipped rows&nbsp;
          <span
            aria-label={`${skipped.length} skipped`}
            className={[
              'inline-flex items-center justify-center rounded-full px-2 py-0.5',
              'text-xs font-bold tabular-nums',
              'bg-amber-200 text-amber-900',
              'dark:bg-amber-700 dark:text-amber-100',
            ].join(' ')}
          >
            {skipped.length.toLocaleString()}
          </span>
        </span>

        <span className="ml-auto text-xs font-normal text-amber-600 dark:text-amber-400">
          Click to expand
        </span>
      </summary>

      {/* ── Skipped records table ── */}
      <div className="overflow-x-auto">
        <table
          aria-label={`Skipped rows — ${skipped.length} entries`}
          className="w-full border-collapse text-sm"
        >
          <thead>
            <tr
              className={[
                'border-t border-amber-200 dark:border-amber-700',
                'bg-amber-100 dark:bg-amber-900/40',
                'text-left text-xs font-semibold uppercase tracking-wide',
                'text-amber-700 dark:text-amber-400',
              ].join(' ')}
            >
              <th
                scope="col"
                className="px-4 py-2 whitespace-nowrap"
              >
                Row&nbsp;#
              </th>
              <th
                scope="col"
                className="px-4 py-2 whitespace-nowrap"
              >
                Reason
              </th>
            </tr>
          </thead>

          <tbody>
            {skipped.map((record, idx) => (
              <tr
                key={`${record.row_index}-${idx}`}
                className={[
                  'border-t border-amber-100 dark:border-amber-800/50',
                  idx % 2 === 0
                    ? 'bg-white dark:bg-transparent'
                    : 'bg-amber-50/60 dark:bg-amber-900/10',
                  'text-[var(--color-text)] dark:text-amber-100',
                ].join(' ')}
              >
                {/* row_index is 0-based; display as 1-based for readability, but
                    also show the raw 0-based index in a tooltip for debugging. */}
                <td
                  className="px-4 py-2 tabular-nums"
                  title={`0-based index: ${record.row_index}`}
                >
                  {record.row_index + 1}
                  <span className="ml-1 text-xs text-amber-500 dark:text-amber-500">
                    (row {record.row_index})
                  </span>
                </td>

                <td className="px-4 py-2">
                  {/* Pill badge */}
                  <span
                    className={[
                      'inline-block rounded-full px-2.5 py-0.5',
                      'text-xs font-medium',
                      reasonBadgeClass(record.reason),
                    ].join(' ')}
                  >
                    {REASON_LABELS[record.reason] ?? record.reason}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Returns Tailwind badge classes based on the skip reason — subtle colour
 * differentiation helps users quickly scan the list.
 */
function reasonBadgeClass(reason: SkipReason): string {
  switch (reason) {
    case 'no_contact_info':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300';
    case 'ai_batch_failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
    case 'ai_service_unavailable':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  }
}
