'use client';

/**
 * FileSummary — displays the uploaded file name and total row count.
 * Rendered after successful client-side CSV parsing, before PreviewTable.
 *
 * Requirements: 1.10
 */

interface FileSummaryProps {
  /** Original file name as reported by the File object. */
  fileName: string;
  /** Total number of data rows parsed (excluding the header row). */
  rowCount: number;
}

export default function FileSummary({ fileName, rowCount }: FileSummaryProps) {
  return (
    <div
      aria-label="File summary"
      className={[
        'flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md px-4 py-3',
        'border border-[var(--color-border)]',
        'bg-[var(--color-bg-surface)]',
      ].join(' ')}
    >
      {/* File name */}
      <span className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
        {/* Document icon */}
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 shrink-0 text-[var(--color-text-secondary)]"
        >
          <path
            fillRule="evenodd"
            d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.414A2 2 0 0017.414 6L14 2.586A2 2 0 0012.586 2H4zm7 2.5V7a1 1 0 001 1h2.5L11 4.5z"
            clipRule="evenodd"
          />
        </svg>
        <span
          className="max-w-xs truncate"
          title={fileName}
        >
          {fileName}
        </span>
      </span>

      {/* Separator */}
      <span
        aria-hidden="true"
        className="hidden text-[var(--color-border)] sm:inline"
      >
        |
      </span>

      {/* Row count */}
      <span className="text-sm text-[var(--color-text-secondary)]">
        <span className="font-semibold text-[var(--color-text)]">
          {rowCount.toLocaleString()}
        </span>
        {' '}
        {rowCount === 1 ? 'row' : 'rows'}
      </span>
    </div>
  );
}
