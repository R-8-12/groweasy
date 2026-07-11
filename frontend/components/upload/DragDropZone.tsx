'use client';

import { useRef, useState, useCallback, DragEvent, ChangeEvent } from 'react';
import FileError from './FileError';

/**
 * DragDropZone — file upload zone with drag-and-drop and file-picker support.
 *
 * Behaviour:
 *  - Accepts `.csv` files (by MIME type `text/csv` or `.csv` extension).
 *  - Validates: type, size (≤ 50 MB), non-zero bytes.
 *  - On validation failure, renders <FileError> with all applicable messages.
 *  - On success, calls `onFile(file)` and clears any previous errors.
 *  - Shows a loading spinner while `isLoading` is true.
 *  - Applies active drop-target styles on dragover.
 *  - Fully keyboard accessible (Enter / Space to open file picker).
 *  - Dark mode via CSS custom properties defined in globals.css.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9
 */

const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

interface DragDropZoneProps {
  /** Called when a valid file is selected or dropped. */
  onFile: (file: File) => void;
  /** When true, displays a loading spinner instead of the upload prompt. */
  isLoading?: boolean;
}

/**
 * Validates a File against type, size, and emptiness constraints.
 * Returns an array of user-friendly error strings (empty = valid).
 */
function validateFile(file: File): string[] {
  const errors: string[] = [];

  // --- Type check ---
  const hasValidMime = file.type === 'text/csv' || file.type === '';
  const hasValidExtension = file.name.toLowerCase().endsWith('.csv');

  // Accept if MIME is text/csv, or if extension is .csv (covers cases where
  // the OS doesn't supply a MIME type for csv files).
  if (!hasValidMime && !hasValidExtension) {
    errors.push('Invalid file type. Please upload a CSV file (.csv).');
  }

  // --- Size check (≤ 50 MB) ---
  if (file.size > MAX_SIZE_BYTES) {
    errors.push('File is too large. Maximum allowed size is 50 MB.');
  }

  // --- Empty file check ---
  if (file.size === 0) {
    errors.push('The selected file is empty. Please choose a file with content.');
  }

  return errors;
}

export default function DragDropZone({ onFile, isLoading = false }: DragDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // --- Drag event handlers ---

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Keep active state on while hovering
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only deactivate when leaving the zone itself, not a child element
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const file = e.dataTransfer.files[0];
      if (!file) return;

      const validationErrors = validateFile(file);
      if (validationErrors.length > 0) {
        setErrors(validationErrors);
        return;
      }

      setErrors([]);
      onFile(file);
    },
    [onFile],
  );

  // --- File input change handler ---

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset input value so the same file can be selected again after an error
      e.target.value = '';

      const validationErrors = validateFile(file);
      if (validationErrors.length > 0) {
        setErrors(validationErrors);
        return;
      }

      setErrors([]);
      onFile(file);
    },
    [onFile],
  );

  // --- Trigger file picker on click / keyboard ---

  const openFilePicker = useCallback(() => {
    if (!isLoading) {
      inputRef.current?.click();
    }
  }, [isLoading]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openFilePicker();
      }
    },
    [openFilePicker],
  );

  // --- Derive zone styles based on state ---

  const hasErrors = errors.length > 0;

  const zoneClasses = [
    // Base layout
    'relative flex flex-col items-center justify-center gap-3',
    'w-full rounded-lg border-2 border-dashed p-8',
    'transition-colors duration-150 cursor-pointer',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'focus-visible:ring-[var(--color-border-focus)]',
    'select-none',

    // State-specific colours using CSS custom properties from globals.css
    isDragOver
      ? [
          'border-[var(--color-dropzone-active-border)]',
          'bg-[var(--color-dropzone-active-bg)]',
          'text-[var(--color-dropzone-active-text)]',
        ].join(' ')
      : hasErrors
        ? [
            'border-[var(--color-dropzone-error-border)]',
            'bg-[var(--color-dropzone-error-bg)]',
            'text-[var(--color-dropzone-error-text)]',
          ].join(' ')
        : [
            'border-[var(--color-dropzone-border)]',
            'bg-[var(--color-dropzone-bg)]',
            'text-[var(--color-dropzone-text)]',
          ].join(' '),

    // Disable pointer events while loading
    isLoading ? 'pointer-events-none opacity-70' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      {/* Hidden native file input — filtered to .csv files (Req 1.4) */}
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleChange}
      />

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload CSV file. Click or drag and drop a CSV file here."
        aria-disabled={isLoading}
        className={zoneClasses}
        onClick={openFilePicker}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isLoading ? (
          /* Loading spinner — shown while client-side parsing is in progress (Req 1.3, 1.5) */
          <div
            role="status"
            aria-label="Processing file…"
            className="flex flex-col items-center gap-3"
          >
            <svg
              aria-hidden="true"
              className="h-8 w-8 animate-spin text-[var(--color-dropzone-active-border)]"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            <span className="text-sm font-medium">Parsing file…</span>
          </div>
        ) : (
          /* Upload prompt */
          <>
            {/* Upload icon */}
            <svg
              aria-hidden="true"
              className="h-10 w-10 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 16V4m0 0L8 8m4-4 4 4" />
              <path d="M20 16v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2" />
            </svg>

            <div className="text-center">
              <p className="text-sm font-semibold">
                {isDragOver ? 'Drop your CSV file here' : 'Drag & drop your CSV file here'}
              </p>
              <p className="mt-1 text-xs">
                or{' '}
                <span className="underline underline-offset-2 font-medium">
                  click to browse
                </span>
              </p>
              <p className="mt-2 text-xs opacity-70">
                Accepted: .csv files up to 50 MB
              </p>
            </div>
          </>
        )}
      </div>

      {/* Inline validation errors (Req 1.6, 1.7, 1.8, 1.9) */}
      {hasErrors && <FileError messages={errors} />}
    </div>
  );
}
