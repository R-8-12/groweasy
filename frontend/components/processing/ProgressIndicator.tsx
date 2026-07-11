'use client';

/**
 * ProgressIndicator — shows import processing progress.
 *
 * Two modes:
 *  - indeterminate=true  → animated spinner while waiting for first SSE event
 *  - indeterminate=false → determinate progress bar with percentage text
 *
 * Requirements: 3.5, 3.6, 10.3
 */

export interface ProgressIndicatorProps {
  /** true until first ProgressEvent received from the SSE stream */
  indeterminate: boolean;
  batches_completed: number;
  batches_total: number;
}

export default function ProgressIndicator({
  indeterminate,
  batches_completed,
  batches_total,
}: ProgressIndicatorProps) {
  // -------------------------------------------------------------------------
  // Indeterminate — spinner
  // -------------------------------------------------------------------------
  if (indeterminate) {
    return (
      <div
        role="status"
        aria-label="Processing…"
        className="flex flex-col items-center gap-3 py-6"
      >
        {/* Animated ring spinner using Tailwind animate-spin */}
        <span
          aria-hidden="true"
          className={[
            'inline-block h-10 w-10 rounded-full border-4',
            'border-[var(--color-bg-subtle)]',
            'border-t-[var(--color-btn-primary-bg)]',
            'animate-spin',
          ].join(' ')}
        />
        <p className="text-sm text-[var(--color-text-secondary)]">
          Processing…
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Determinate — progress bar
  // -------------------------------------------------------------------------
  const percentage =
    batches_total > 0
      ? Math.round((batches_completed / batches_total) * 100)
      : 0;

  // Clamp to [0, 100] as a safety net
  const clamped = Math.min(100, Math.max(0, percentage));

  return (
    <div
      className="flex flex-col gap-2 py-4 w-full"
      data-testid="progress-container"
    >
      {/* Percentage label row */}
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-[var(--color-text)]">
          Importing…
        </span>
        <span
          data-testid="progress-percentage"
          className="font-semibold tabular-nums text-[var(--color-text)]"
        >
          {clamped}%
        </span>
      </div>

      {/* Track + fill bar */}
      <div
        className={[
          'h-2.5 w-full overflow-hidden rounded-full',
          'bg-[var(--color-bg-subtle)]',
        ].join(' ')}
      >
        <div
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Import progress"
          style={{ width: `${clamped}%` }}
          className={[
            'h-full rounded-full transition-[width] duration-300 ease-out',
            'bg-[var(--color-btn-primary-bg)]',
          ].join(' ')}
        />
      </div>
    </div>
  );
}
