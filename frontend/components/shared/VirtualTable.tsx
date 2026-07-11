'use client';

/**
 * VirtualTable — reusable @tanstack/react-virtual wrapper for large datasets.
 *
 * Renders only the visible rows using a virtualizer (estimateSize: 40px, overscan: 5).
 * Supports:
 *   - Sticky column headers (position: sticky, top: 0)
 *   - Horizontal scroll (overflow-x: auto)
 *   - Vertical scroll with max-height 400 px constraint
 *   - Dark mode via Tailwind dark: variants
 *
 * Wrapped in an ErrorBoundary: if the virtualizer fails to initialise,
 * the ErrorBanner fallback is shown and the table is blocked.
 *
 * Requirements: 2.4, 2.5, 2.7, 8.5, 8.6
 */

import React, { Component, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import ErrorBanner from './ErrorBanner';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface VirtualTableProps {
  /** All data rows — only visible rows are mounted in the DOM. */
  rows: Record<string, string>[];
  /** Column names, in display order. */
  columns: string[];
}

// ---------------------------------------------------------------------------
// Inner table (the virtualised part — no error boundary here)
// ---------------------------------------------------------------------------

function VirtualTableInner({ rows, columns }: VirtualTableProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Per the design reference: estimateSize 40px, overscan 5
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 40,
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  return (
    /*
     * Outer wrapper: horizontal scroll + max-height 400 px + vertical scroll.
     * Requirements 2.3, 2.4, 2.5, 2.6, 8.5
     */
    <div
      ref={scrollContainerRef}
      style={{ maxHeight: '400px' }}
      className={[
        'overflow-x-auto overflow-y-auto',
        'border border-gray-200 dark:border-gray-700',
        'rounded-md',
        'w-full',
      ].join(' ')}
    >
      <table className="min-w-full border-collapse text-sm">
        {/* Sticky header — Requirement 2.5, 8.5 */}
        <thead className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-800">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                scope="col"
                className={[
                  'whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide',
                  'text-gray-700 dark:text-gray-300',
                  'border-b border-gray-200 dark:border-gray-700',
                ].join(' ')}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>

        {/*
         * The <tbody> acts as a positioning context for the absolute spacer.
         * We set its height to totalSize so the scroll bar reflects the full
         * virtual list, then absolutely-position the rendered rows inside it.
         */}
        <tbody
          style={{ height: `${totalSize}px`, position: 'relative' }}
          className="bg-white dark:bg-gray-900"
        >
          {virtualItems.map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <tr
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                  height: `${virtualRow.size}px`,
                  display: 'table-row',
                }}
                className={[
                  'hover:bg-gray-50 dark:hover:bg-gray-800/60',
                  virtualRow.index % 2 === 0
                    ? 'bg-white dark:bg-gray-900'
                    : 'bg-gray-50/50 dark:bg-gray-800/30',
                ].join(' ')}
              >
                {columns.map((col) => (
                  <td
                    key={col}
                    className={[
                      'whitespace-nowrap px-3 py-1 text-xs',
                      'text-gray-800 dark:text-gray-200',
                      'border-b border-gray-100 dark:border-gray-800',
                    ].join(' ')}
                  >
                    {row[col] ?? ''}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ErrorBoundary wrapper
// Requirements 2.7, 8.6 — if the virtualizer fails to initialise, block the
// table and show the ErrorBanner fallback.
// ---------------------------------------------------------------------------

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class VirtualTableErrorBoundary extends Component<
  VirtualTableProps,
  ErrorBoundaryState
> {
  constructor(props: VirtualTableProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
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
      return (
        <ErrorBanner
          message={`Unable to render the table: ${this.state.errorMessage}`}
          onRetry={this.handleRetry}
        />
      );
    }

    return (
      <VirtualTableInner rows={this.props.rows} columns={this.props.columns} />
    );
  }
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

export default function VirtualTable(props: VirtualTableProps) {
  return <VirtualTableErrorBoundary {...props} />;
}
