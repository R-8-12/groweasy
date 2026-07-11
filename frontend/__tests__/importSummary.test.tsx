// Feature: ai-csv-importer, Property 16: Import Summary Display Correctness
import '@testing-library/jest-dom/jest-globals';
import { describe, test, expect } from '@jest/globals';
import * as fc from 'fast-check';
import { render, screen } from '@testing-library/react';
import ImportSummary from '@/components/results/ImportSummary';

// ---------------------------------------------------------------------------
// Unit tests — boundary cases
// ---------------------------------------------------------------------------

describe('ImportSummary — unit tests', () => {
  test('displays "0" for both counts when total_imported and total_skipped are 0', () => {
    render(<ImportSummary response={{ total_imported: 0, total_skipped: 0 }} />);

    expect(screen.getByTestId('total-imported').textContent).toBe('0');
    expect(screen.getByTestId('total-skipped').textContent).toBe('0');
  });

  test('displays large numbers exactly without abbreviation (e.g. 1_000_000 shows as "1000000" not "1M")', () => {
    render(
      <ImportSummary response={{ total_imported: 1_000_000, total_skipped: 500_000 }} />
    );

    expect(screen.getByTestId('total-imported').textContent).toBe('1000000');
    expect(screen.getByTestId('total-skipped').textContent).toBe('500000');
  });

  test('displays exact numeric string when total_skipped > 0', () => {
    render(<ImportSummary response={{ total_imported: 42, total_skipped: 7 }} />);

    expect(screen.getByTestId('total-imported').textContent).toBe('42');
    expect(screen.getByTestId('total-skipped').textContent).toBe('7');
  });
});

// ---------------------------------------------------------------------------
// Property-based test — Property 16
// Validates: Requirements 8.3
// ---------------------------------------------------------------------------

describe('Property 16: Import Summary Display Correctness (property-based)', () => {
  /**
   * For any ImportResponse where total_imported ≥ 0 and total_skipped ≥ 0,
   * the ImportSummary component must display both counts exactly as they
   * appear in the response — no truncation, rounding, or substitution.
   *
   * The displayed textContent must equal String(total_imported) and
   * String(total_skipped) respectively.
   */
  test('total-imported and total-skipped textContent equal the exact numeric values', () => {
    const countPairArb = fc.record({
      total_imported: fc.nat(),
      total_skipped: fc.nat(),
    });

    // Feature: ai-csv-importer, Property 16: Import Summary Display Correctness
    fc.assert(
      fc.property(countPairArb, ({ total_imported, total_skipped }) => {
        const { unmount } = render(
          <ImportSummary response={{ total_imported, total_skipped }} />
        );

        const importedEl = screen.getByTestId('total-imported');
        const skippedEl = screen.getByTestId('total-skipped');

        const importedText = importedEl.textContent ?? '';
        const skippedText = skippedEl.textContent ?? '';

        const expectedImported = String(total_imported);
        const expectedSkipped = String(total_skipped);

        unmount();

        // total-imported must display the exact numeric string
        if (importedText !== expectedImported) return false;
        // total-skipped must display the exact numeric string
        if (skippedText !== expectedSkipped) return false;

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
