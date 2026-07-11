// Feature: ai-csv-importer, Property 19: Progress Percentage Calculation
import '@testing-library/jest-dom/jest-globals';
import { describe, test, expect } from '@jest/globals';
import * as fc from 'fast-check';
import { render, screen } from '@testing-library/react';
import ProgressIndicator from '@/components/processing/ProgressIndicator';

// ---------------------------------------------------------------------------
// Unit test — indeterminate mode renders the spinner, not a progress bar
// ---------------------------------------------------------------------------

describe('ProgressIndicator — indeterminate mode', () => {
  test('renders spinner (role="status") and no progressbar when indeterminate=true', () => {
    render(
      <ProgressIndicator
        indeterminate={true}
        batches_completed={0}
        batches_total={0}
      />
    );

    // Spinner must be present
    expect(screen.getByRole('status')).toBeInTheDocument();
    // No progressbar should be rendered
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  test('renders accessible label "Processing…" when indeterminate=true', () => {
    render(
      <ProgressIndicator
        indeterminate={true}
        batches_completed={0}
        batches_total={0}
      />
    );
    expect(screen.getByRole('status', { name: 'Processing…' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Unit tests — determinate mode
// ---------------------------------------------------------------------------

describe('ProgressIndicator — determinate mode', () => {
  test('renders progressbar (role="progressbar") when indeterminate=false', () => {
    render(
      <ProgressIndicator
        indeterminate={false}
        batches_completed={3}
        batches_total={10}
      />
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  test('shows correct percentage text for 3 of 10 batches (30%)', () => {
    render(
      <ProgressIndicator
        indeterminate={false}
        batches_completed={3}
        batches_total={10}
      />
    );
    expect(screen.getByTestId('progress-percentage')).toHaveTextContent('30%');
  });

  test('shows 100% when all batches are complete', () => {
    render(
      <ProgressIndicator
        indeterminate={false}
        batches_completed={5}
        batches_total={5}
      />
    );
    expect(screen.getByTestId('progress-percentage')).toHaveTextContent('100%');
  });

  test('aria-valuenow reflects the rounded percentage', () => {
    render(
      <ProgressIndicator
        indeterminate={false}
        batches_completed={1}
        batches_total={3}
      />
    );
    const bar = screen.getByRole('progressbar');
    // Math.round(1/3 * 100) = 33
    expect(bar).toHaveAttribute('aria-valuenow', '33');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });
});

// ---------------------------------------------------------------------------
// Property-based test — Property 19
// Validates: Requirements 3.5, 3.6
// ---------------------------------------------------------------------------

describe('Property 19: Progress Percentage Calculation (property-based)', () => {
  /**
   * For any valid (batches_completed, batches_total) pair where
   * 0 ≤ batches_completed ≤ batches_total and batches_total > 0:
   *
   *  1. The displayed percentage text equals Math.round(bc/bt*100) + "%"
   *  2. The percentage value is always within [0, 100]
   */
  test('percentage text equals Math.round(bc/bt*100)% and is always in [0,100]', () => {
    const pairArb = fc
      .integer({ min: 1, max: 1000 })
      .chain((bt) =>
        fc
          .integer({ min: 0, max: bt })
          .map((bc) => ({ bc, bt }))
      );

    // Feature: ai-csv-importer, Property 19: Progress Percentage Calculation
    fc.assert(
      fc.property(pairArb, ({ bc, bt }) => {
        const { unmount } = render(
          <ProgressIndicator
            indeterminate={false}
            batches_completed={bc}
            batches_total={bt}
          />
        );

        const percentageEl = screen.getByTestId('progress-percentage');
        const displayedText = percentageEl.textContent ?? '';

        // Expected value
        const expected = Math.round((bc / bt) * 100);
        const expectedText = `${expected}%`;

        // Parse the numeric value from displayed text (strip %)
        const numericValue = parseInt(displayedText.replace('%', ''), 10);

        unmount();

        // Assertion 1: text matches expected formula
        if (displayedText !== expectedText) return false;
        // Assertion 2: value is within bounds [0, 100]
        if (numericValue < 0 || numericValue > 100) return false;

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
