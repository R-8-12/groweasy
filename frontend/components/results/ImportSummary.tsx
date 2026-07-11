'use client';

/**
 * ImportSummary — displays the total_imported and total_skipped counts
 * from an ImportResponse as a dedicated summary element, separate from
 * the data rows in the ResultsTable.
 *
 * The counts are rendered exactly as provided — no truncation, rounding,
 * or formatting that changes the numeric value.
 *
 * Requirements: 8.3
 */

import type { ImportResponse } from '@/lib/types';

interface ImportSummaryProps {
  /** The full import response; only total_imported and total_skipped are used. */
  response: Pick<ImportResponse, 'total_imported' | 'total_skipped'>;
}

export default function ImportSummary({ response }: ImportSummaryProps) {
  const { total_imported, total_skipped } = response;

  return (
    <section
      aria-labelledby="import-summary-heading"
      className={[
        'rounded-md border px-4 py-3',
        'border-[var(--color-border)]',
        'bg-[var(--color-bg-surface)]',
        'dark:border-[var(--color-border)]',
        'dark:bg-[var(--color-bg-surface)]',
      ].join(' ')}
    >
      <h2
        id="import-summary-heading"
        className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]"
      >
        Import Summary
      </h2>

      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        {/* Imported count */}
        <div className="flex flex-col">
          <dt className="text-xs font-medium text-[var(--color-text-secondary)]">
            Imported
          </dt>
          <dd
            className="text-2xl font-bold tabular-nums text-[var(--color-text)]"
            data-testid="total-imported"
          >
            {String(total_imported)}
          </dd>
        </div>

        {/* Skipped count */}
        <div className="flex flex-col">
          <dt className="text-xs font-medium text-[var(--color-text-secondary)]">
            Skipped
          </dt>
          <dd
            className={[
              'text-2xl font-bold tabular-nums',
              total_skipped > 0
                ? 'text-[var(--color-error-text)]'
                : 'text-[var(--color-text)]',
            ].join(' ')}
            data-testid="total-skipped"
          >
            {String(total_skipped)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
