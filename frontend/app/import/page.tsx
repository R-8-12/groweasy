'use client';

/**
 * ImportPage — main orchestrator for the 4-step CSV import workflow.
 *
 * State machine:
 *   idle → parsing           (file selected)
 *   parsing → preview        (parse success)
 *   parsing → error          (total parse failure)
 *   preview → processing     (confirm clicked)
 *   processing → results     (final SSE event)
 *   processing → error       (SSE error or network failure)
 *
 * Requirements: 1.3, 1.5, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 8.1, 8.7, 10.6
 */

import { useEffect, useReducer, useRef, useState } from 'react';
import type { ImportStep, ProgressState, ImportResponse } from '@/lib/types';
import { parseCSV } from '@/lib/csvParser';
import { importCSV } from '@/lib/apiClient';
import { resolveInitialTheme } from '@/lib/themeManager';

// ─── Component imports ───
import DragDropZone from '@/components/upload/DragDropZone';
import FileSummary from '@/components/preview/FileSummary';
import PreviewTable from '@/components/preview/PreviewTable';
import ProgressIndicator from '@/components/processing/ProgressIndicator';
import ResultsTable from '@/components/results/ResultsTable';
import ImportSummary from '@/components/results/ImportSummary';
import SkippedSection from '@/components/results/SkippedSection';
import ErrorBanner from '@/components/shared/ErrorBanner';
import ThemeToggle from '@/components/shared/ThemeToggle';

// ═══════════════════════════════════════════════════════════════════════════
// STATE MACHINE — Reducer + Actions
// ═══════════════════════════════════════════════════════════════════════════

type Action =
  | { type: 'FILE_SELECTED' }
  | { type: 'PARSE_SUCCESS'; rows: Record<string, string>[]; fileName: string; rowCount: number }
  | { type: 'PARSE_ERROR'; message: string }
  | { type: 'CONFIRM_IMPORT' }
  | { type: 'PROGRESS_UPDATE'; batches_completed: number; batches_total: number }
  | { type: 'IMPORT_SUCCESS'; response: ImportResponse }
  | { type: 'IMPORT_ERROR'; message: string; retryable: boolean }
  | { type: 'RETRY' };

function reducer(state: ImportStep, action: Action): ImportStep {
  switch (action.type) {
    // ─── idle → parsing ───
    case 'FILE_SELECTED':
      if (state.status !== 'idle') return state;
      return { status: 'parsing' };

    // ─── parsing → preview ───
    case 'PARSE_SUCCESS':
      if (state.status !== 'parsing') return state;
      return {
        status: 'preview',
        rows: action.rows,
        fileName: action.fileName,
        rowCount: action.rowCount,
      };

    // ─── parsing → error ───
    case 'PARSE_ERROR':
      if (state.status !== 'parsing') return state;
      return {
        status: 'error',
        message: action.message,
        retryable: true,
      };

    // ─── preview → processing ───
    case 'CONFIRM_IMPORT':
      if (state.status !== 'preview') return state;
      return {
        status: 'processing',
        progress: {
          batches_completed: 0,
          batches_total: 0,
          indeterminate: true, // true until first SSE progress event (Req 3.5)
        },
      };

    // ─── processing → processing (progress update) ───
    case 'PROGRESS_UPDATE':
      if (state.status !== 'processing') return state;
      return {
        status: 'processing',
        progress: {
          batches_completed: action.batches_completed,
          batches_total: action.batches_total,
          indeterminate: false, // first progress event arrives (Req 3.6)
        },
      };

    // ─── processing → results ───
    case 'IMPORT_SUCCESS':
      if (state.status !== 'processing') return state;
      return {
        status: 'results',
        response: action.response,
      };

    // ─── processing → error (or any other state → error if retryable) ───
    case 'IMPORT_ERROR':
      return {
        status: 'error',
        message: action.message,
        retryable: action.retryable,
      };

    // ─── error → idle (retry) ───
    case 'RETRY':
      if (state.status !== 'error') return state;
      return { status: 'idle' };

    default:
      return state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function ImportPage() {
  const [state, dispatch] = useReducer<ImportStep, [Action]>(reducer, { status: 'idle' });

  // ─── Theme management (Req 9.2, 9.3) ───
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  useEffect(() => {
    // Resolve initial theme on mount (client-only)
    setTheme(resolveInitialTheme());
  }, []);

  // ─── File & SSE controller refs ───
  const currentFileRef = useRef<File | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ───────────────────────────────────────────────────────────────────────
  // HANDLERS
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Invoked by DragDropZone when a valid file is selected.
   * Transitions: idle → parsing
   */
  async function handleFileSelected(file: File) {
    currentFileRef.current = file;
    dispatch({ type: 'FILE_SELECTED' });

    try {
      const result = await parseCSV(file);

      // Total parse failure: zero rows, has errors
      if (result.rows.length === 0 && result.errors.length > 0) {
        const message =
          result.errors.map((e) => e.message).join('; ') ||
          'Failed to parse CSV file.';
        dispatch({ type: 'PARSE_ERROR', message });
        return;
      }

      // Parse success (with or without partial errors)
      dispatch({
        type: 'PARSE_SUCCESS',
        rows: result.rows,
        fileName: file.name,
        rowCount: result.rows.length,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred.';
      dispatch({ type: 'PARSE_ERROR', message });
    }
  }

  /**
   * Invoked by "Confirm Import" button.
   * Transitions: preview → processing
   */
  function handleConfirmImport() {
    if (state.status !== 'preview') return;

    const file = currentFileRef.current;
    if (!file) {
      dispatch({
        type: 'IMPORT_ERROR',
        message: 'No file available to import.',
        retryable: false,
      });
      return;
    }

    // Transition to processing immediately (Req 3.4, 3.5)
    dispatch({ type: 'CONFIRM_IMPORT' });

    // Start SSE stream
    const controller = importCSV(file, {
      onProgress: (event) => {
        dispatch({
          type: 'PROGRESS_UPDATE',
          batches_completed: event.batches_completed,
          batches_total: event.batches_total,
        });
      },
      onFinal: (event) => {
        dispatch({
          type: 'IMPORT_SUCCESS',
          response: event.data,
        });
        abortControllerRef.current = null;
      },
      onError: (event) => {
        dispatch({
          type: 'IMPORT_ERROR',
          message: event.message,
          retryable: true, // network/stream errors are retryable (Req 8.7, 10.6)
        });
        abortControllerRef.current = null;
      },
    });

    abortControllerRef.current = controller;
  }

  /**
   * Invoked by ErrorBanner retry button.
   * Transitions: error → idle (then user can select a file again)
   * OR re-submit the same file if already available.
   */
  function handleRetry() {
    if (state.status !== 'error') return;

    // If we still have the file ref, re-submit it directly
    const file = currentFileRef.current;
    if (file) {
      // Reset to idle first, then immediately parse the file again
      dispatch({ type: 'RETRY' });
      // Use setTimeout to allow state to settle before parsing again
      setTimeout(() => {
        void handleFileSelected(file);
      }, 0);
    } else {
      // No file available — just reset to idle so user can upload again
      dispatch({ type: 'RETRY' });
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // RENDER
  // ───────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-bg)]">
      {/* ═══ Header with ThemeToggle ═══ */}
      <header
        className={[
          'sticky top-0 z-20',
          'flex items-center justify-between',
          'border-b border-[var(--color-border)]',
          'bg-[var(--color-bg-surface)]',
          'px-6 py-4',
        ].join(' ')}
      >
        <h1 className="text-2xl font-bold text-[var(--color-text)]">
          AI CSV Importer
        </h1>

        <ThemeToggle theme={theme} onThemeChange={setTheme} />
      </header>

      {/* ═══ Main content area ═══ */}
      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* ─────────────────────────────────────────────────────────── */}
          {/* STEP: idle */}
          {/* ─────────────────────────────────────────────────────────── */}
          {state.status === 'idle' && (
            <>
              <section aria-labelledby="upload-heading">
                <h2
                  id="upload-heading"
                  className="mb-3 text-lg font-semibold text-[var(--color-text)]"
                >
                  Upload CSV File
                </h2>
                <DragDropZone onFile={handleFileSelected} isLoading={false} />
              </section>
            </>
          )}

          {/* ─────────────────────────────────────────────────────────── */}
          {/* STEP: parsing */}
          {/* ─────────────────────────────────────────────────────────── */}
          {state.status === 'parsing' && (
            <>
              <section aria-labelledby="upload-heading">
                <h2
                  id="upload-heading"
                  className="mb-3 text-lg font-semibold text-[var(--color-text)]"
                >
                  Upload CSV File
                </h2>
                <DragDropZone onFile={handleFileSelected} isLoading={true} />
              </section>
            </>
          )}

          {/* ─────────────────────────────────────────────────────────── */}
          {/* STEP: preview */}
          {/* ─────────────────────────────────────────────────────────── */}
          {state.status === 'preview' && (
            <>
              <section aria-labelledby="preview-heading" className="space-y-4">
                <h2
                  id="preview-heading"
                  className="text-lg font-semibold text-[var(--color-text)]"
                >
                  Preview & Confirm
                </h2>

                <FileSummary
                  fileName={state.fileName}
                  rowCount={state.rowCount}
                />

                <PreviewTable rows={state.rows} columns={Object.keys(state.rows[0] ?? {})} />

                {/* Confirm Import button — enabled per Req 3.1, disabled per Req 3.2 */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    className={[
                      'rounded-md px-6 py-2.5 text-sm font-semibold',
                      'transition-colors duration-150',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                      'bg-[var(--color-btn-primary-bg)]',
                      'text-[var(--color-btn-primary-text)]',
                      'hover:bg-[var(--color-btn-primary-hover)]',
                      'focus-visible:ring-[var(--color-border-focus)]',
                    ].join(' ')}
                  >
                    Confirm Import
                  </button>
                </div>
              </section>
            </>
          )}

          {/* ─────────────────────────────────────────────────────────── */}
          {/* STEP: processing */}
          {/* ─────────────────────────────────────────────────────────── */}
          {state.status === 'processing' && (
            <>
              <section aria-labelledby="processing-heading" className="space-y-4">
                <h2
                  id="processing-heading"
                  className="text-lg font-semibold text-[var(--color-text)]"
                >
                  Processing Import
                </h2>

                <ProgressIndicator
                  indeterminate={state.progress.indeterminate}
                  batches_completed={state.progress.batches_completed}
                  batches_total={state.progress.batches_total}
                />
              </section>
            </>
          )}

          {/* ─────────────────────────────────────────────────────────── */}
          {/* STEP: results */}
          {/* ─────────────────────────────────────────────────────────── */}
          {state.status === 'results' && (
            <>
              <section aria-labelledby="results-heading" className="space-y-6">
                <h2
                  id="results-heading"
                  className="text-lg font-semibold text-[var(--color-text)]"
                >
                  Import Complete
                </h2>

                {/* Summary counts */}
                <ImportSummary response={state.response} />

                {/* Imported records table */}
                {state.response.records.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-base font-semibold text-[var(--color-text)]">
                      Imported Records
                    </h3>
                    <ResultsTable records={state.response.records} />
                  </div>
                )}

                {/* Skipped rows (expandable) */}
                <SkippedSection skipped={state.response.skipped} />

                {/* Start new import button */}
                <div className="flex justify-center pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      currentFileRef.current = null;
                      dispatch({ type: 'RETRY' });
                    }}
                    className={[
                      'rounded-md px-6 py-2.5 text-sm font-semibold',
                      'transition-colors duration-150',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                      'bg-[var(--color-btn-primary-bg)]',
                      'text-[var(--color-btn-primary-text)]',
                      'hover:bg-[var(--color-btn-primary-hover)]',
                      'focus-visible:ring-[var(--color-border-focus)]',
                    ].join(' ')}
                  >
                    Import Another File
                  </button>
                </div>
              </section>
            </>
          )}

          {/* ─────────────────────────────────────────────────────────── */}
          {/* STEP: error */}
          {/* ─────────────────────────────────────────────────────────── */}
          {state.status === 'error' && (
            <>
              <section aria-labelledby="error-heading" className="space-y-4">
                <h2
                  id="error-heading"
                  className="text-lg font-semibold text-[var(--color-text)]"
                >
                  Error
                </h2>

                <ErrorBanner
                  message={state.message}
                  onRetry={state.retryable ? handleRetry : undefined}
                />

                {/* If not retryable, offer to start over */}
                {!state.retryable && (
                  <div className="flex justify-center pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        currentFileRef.current = null;
                        dispatch({ type: 'RETRY' });
                      }}
                      className={[
                        'rounded-md px-6 py-2.5 text-sm font-semibold',
                        'transition-colors duration-150',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                        'bg-[var(--color-btn-primary-bg)]',
                        'text-[var(--color-btn-primary-text)]',
                        'hover:bg-[var(--color-btn-primary-hover)]',
                        'focus-visible:ring-[var(--color-border-focus)]',
                      ].join(' ')}
                    >
                      Start Over
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
