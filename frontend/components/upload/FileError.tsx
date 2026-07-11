'use client';

/**
 * FileError — inline validation error display for file upload.
 *
 * Renders each message as a separate accessible alert so screen readers
 * announce all errors immediately. Supports simultaneous display of
 * multiple errors (e.g. wrong type + too large at the same time).
 *
 * Requirements: 1.6, 1.7, 1.8, 1.9
 */

interface FileErrorProps {
  /** One or more validation error messages to display. */
  messages: string[];
}

export default function FileError({ messages }: FileErrorProps) {
  if (messages.length === 0) return null;

  return (
    <ul
      aria-label="File validation errors"
      className="mt-3 flex flex-col gap-2 list-none p-0 m-0"
    >
      {messages.map((message, index) => (
        <li
          key={index}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className={[
            'flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm font-medium',
            'border-[var(--color-error-border)]',
            'bg-[var(--color-error-bg)]',
            'text-[var(--color-error-text)]',
          ].join(' ')}
        >
          {/* Error icon — hidden from screen readers since role="alert" provides context */}
          <span aria-hidden="true" className="mt-0.5 shrink-0 leading-none">
            ✕
          </span>
          <span>{message}</span>
        </li>
      ))}
    </ul>
  );
}
