'use client';

/**
 * ErrorBanner — standardised error display component.
 * Renders the error message with an optional retry button.
 * Accessible via role="alert" so screen readers announce it immediately.
 * Requirements: 8.7, 10.6
 */

interface ErrorBannerProps {
  /** Human-readable error message to display. */
  message: string;
  /** When provided, a "Retry" button is rendered that calls this callback on click. */
  onRetry?: () => void;
}

export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className={[
        'flex items-start gap-3 rounded-md border px-4 py-3',
        'border-[var(--color-error-border)]',
        'bg-[var(--color-error-bg)]',
        'text-[var(--color-error-text)]',
      ].join(' ')}
    >
      {/* Error icon */}
      <span
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-lg leading-none"
      >
        ⚠️
      </span>

      {/* Message + optional retry button */}
      <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex-1 text-sm font-medium">{message}</p>

        {onRetry !== undefined && (
          <button
            type="button"
            onClick={onRetry}
            className={[
              'shrink-0 rounded px-3 py-1.5 text-sm font-semibold',
              'transition-colors duration-150',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              'focus-visible:ring-[var(--color-error-border)]',
              'bg-[var(--color-error-text)] text-[var(--color-error-bg)]',
              'hover:opacity-90 active:opacity-80',
            ].join(' ')}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
