// Feature: ai-csv-importer, Property 17: Skipped Section Completeness
import '@testing-library/jest-dom/jest-globals';
import { describe, test, expect } from '@jest/globals';
import * as fc from 'fast-check';
import { render, screen } from '@testing-library/react';
import SkippedSection from '@/components/results/SkippedSection';
import type { SkippedRecord, SkipReason } from '@/lib/types';

// ---------------------------------------------------------------------------
// Local copy of REASON_LABELS (not exported from component)
// ---------------------------------------------------------------------------

const REASON_LABELS: Record<SkipReason, string> = {
  no_contact_info: 'No contact info',
  ai_batch_failed: 'AI batch failed',
  ai_service_unavailable: 'AI service unavailable',
};

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe('SkippedSection — unit tests', () => {
  test('returns null / renders nothing when skipped is an empty array', () => {
    const { container } = render(<SkippedSection skipped={[]} />);
    expect(container.firstChild).toBeNull();
  });

  test('renders a <details> element when skipped has at least one entry', () => {
    const { container } = render(
      <SkippedSection skipped={[{ row_index: 0, reason: 'no_contact_info' }]} />
    );
    expect(container.querySelector('details')).not.toBeNull();
  });

  test('renders "No contact info" label for no_contact_info reason', () => {
    render(<SkippedSection skipped={[{ row_index: 5, reason: 'no_contact_info' }]} />);
    expect(screen.getByText('No contact info')).toBeInTheDocument();
  });

  test('renders "AI batch failed" label for ai_batch_failed reason', () => {
    render(<SkippedSection skipped={[{ row_index: 3, reason: 'ai_batch_failed' }]} />);
    expect(screen.getByText('AI batch failed')).toBeInTheDocument();
  });

  test('renders "AI service unavailable" label for ai_service_unavailable reason', () => {
    render(<SkippedSection skipped={[{ row_index: 7, reason: 'ai_service_unavailable' }]} />);
    expect(screen.getByText('AI service unavailable')).toBeInTheDocument();
  });

  test('renders multiple entries with correct row_index and reason for each', () => {
    const skipped: SkippedRecord[] = [
      { row_index: 0, reason: 'no_contact_info' },
      { row_index: 2, reason: 'ai_batch_failed' },
      { row_index: 9, reason: 'ai_service_unavailable' },
    ];

    const { container } = render(<SkippedSection skipped={skipped} />);
    const textContent = container.textContent ?? '';

    // row_index presence via "(row N)" spans
    expect(textContent).toContain('(row 0)');
    expect(textContent).toContain('(row 2)');
    expect(textContent).toContain('(row 9)');

    // reason labels
    expect(screen.getByText('No contact info')).toBeInTheDocument();
    expect(screen.getByText('AI batch failed')).toBeInTheDocument();
    expect(screen.getByText('AI service unavailable')).toBeInTheDocument();

    // row count: tbody should have exactly 3 <tr> elements
    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Property-based test — Property 17
// Validates: Requirements 8.4
// ---------------------------------------------------------------------------

describe('Property 17: Skipped Section Completeness (property-based)', () => {
  /**
   * For any non-empty array of SkippedRecord objects:
   * - Every entry's row_index appears in the rendered output via "(row N)" span
   * - Every entry's reason label appears in the rendered output
   * - The number of rendered <tbody> rows equals skipped.length (no omissions)
   */
  test('every row_index and reason label appears in the output; no entries omitted', () => {
    const skipReasonArb = fc.constantFrom<SkipReason>(
      'no_contact_info',
      'ai_batch_failed',
      'ai_service_unavailable'
    );

    const skippedRecordArb = fc.record<SkippedRecord>({
      row_index: fc.nat(),
      reason: skipReasonArb,
    });

    const nonEmptySkippedArb = fc.array(skippedRecordArb, { minLength: 1 });

    // Feature: ai-csv-importer, Property 17: Skipped Section Completeness
    fc.assert(
      fc.property(nonEmptySkippedArb, (skipped) => {
        const { container, unmount } = render(<SkippedSection skipped={skipped} />);

        const textContent = container.textContent ?? '';

        // Assert every row_index appears as "(row N)" in the DOM
        for (const record of skipped) {
          if (!textContent.includes(`(row ${record.row_index})`)) {
            unmount();
            return false;
          }
        }

        // Assert every reason label appears in the DOM
        for (const record of skipped) {
          const label = REASON_LABELS[record.reason];
          if (!textContent.includes(label)) {
            unmount();
            return false;
          }
        }

        // Assert no entries are omitted: tbody row count === skipped.length
        const rows = container.querySelectorAll('tbody tr');
        if (rows.length !== skipped.length) {
          unmount();
          return false;
        }

        unmount();
        return true;
      }),
      { numRuns: 100 }
    );
  });
});
