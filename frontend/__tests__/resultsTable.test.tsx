// Feature: ai-csv-importer, Property 15: Results Table Rendering Fidelity
import '@testing-library/jest-dom/jest-globals';
import { describe, test, expect } from '@jest/globals';
import * as fc from 'fast-check';
import { render, screen, within } from '@testing-library/react';
import ResultsTable from '@/components/results/ResultsTable';
import type { CrmRecord, CrmStatus, DataSource } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeCrmRecord(overrides: Partial<CrmRecord> = {}): CrmRecord {
  return {
    created_at: '',
    name: 'Test User',
    email: 'test@example.com',
    country_code: '+1',
    mobile_without_country_code: '5551234',
    company: 'Acme',
    city: 'Anytown',
    state: 'CA',
    country: 'USA',
    lead_owner: 'owner@example.com',
    crm_status: 'DID_NOT_CONNECT',
    crm_note: '',
    data_source: '',
    possession_time: '',
    description: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe('ResultsTable — unit tests', () => {
  test('renders the table even when records is empty, with 15 column headers', () => {
    render(<ResultsTable records={[]} />);
    const table = screen.getByRole('table', { name: 'CRM import results' });
    expect(table).toBeInTheDocument();

    const thead = table.querySelector('thead');
    expect(thead).not.toBeNull();
    const headers = thead!.querySelectorAll('th');
    expect(headers).toHaveLength(15);

    const tbody = table.querySelector('tbody');
    expect(tbody).not.toBeNull();
    const dataRows = tbody!.querySelectorAll('tr');
    expect(dataRows).toHaveLength(0);
  });

  test('renders exactly 15 column headers for a single record', () => {
    render(<ResultsTable records={[makeCrmRecord()]} />);
    const table = screen.getByRole('table', { name: 'CRM import results' });
    const headers = table.querySelectorAll('thead th');
    expect(headers).toHaveLength(15);
  });

  test('renders all cell values — name and email appear for a known record', () => {
    const record = makeCrmRecord({ name: 'Jane Doe', email: 'jane@test.com' });
    render(<ResultsTable records={[record]} />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('jane@test.com')).toBeInTheDocument();
  });

  test('crm_status GOOD_LEAD_FOLLOW_UP renders badge label "Good Lead"', () => {
    render(<ResultsTable records={[makeCrmRecord({ crm_status: 'GOOD_LEAD_FOLLOW_UP' })]} />);
    expect(screen.getByText('Good Lead')).toBeInTheDocument();
  });

  test('crm_status DID_NOT_CONNECT renders badge label "Did Not Connect"', () => {
    render(<ResultsTable records={[makeCrmRecord({ crm_status: 'DID_NOT_CONNECT' })]} />);
    expect(screen.getByText('Did Not Connect')).toBeInTheDocument();
  });

  test('empty string fields render the — placeholder', () => {
    // name is empty → the component renders <span>—</span>
    render(<ResultsTable records={[makeCrmRecord({ name: '' })]} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  test('table has aria-label "CRM import results"', () => {
    render(<ResultsTable records={[makeCrmRecord()]} />);
    expect(
      screen.getByRole('table', { name: 'CRM import results' })
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Property-based test — Property 15
// Validates: Requirements 8.1, 8.2
// ---------------------------------------------------------------------------

describe('Property 15: Results Table Rendering Fidelity (property-based)', () => {
  /**
   * For any array of 1–200 CrmRecord objects:
   *  1. The table always has exactly 15 column headers
   *  2. The table body has exactly records.length data rows
   *
   * All records are ≤ 200 so we always exercise the plain table path.
   */
  test('always renders 15 headers and records.length body rows', () => {
    const crmStatusArb = fc.constantFrom(
      'GOOD_LEAD_FOLLOW_UP',
      'DID_NOT_CONNECT',
      'BAD_LEAD',
      'SALE_DONE'
    ) as fc.Arbitrary<CrmStatus>;

    const dataSourceArb = fc.constantFrom(
      'leads_on_demand',
      'meridian_tower',
      'eden_park',
      'varah_swamy',
      'sarjapur_plots',
      ''
    ) as fc.Arbitrary<DataSource | ''>;

    const crmRecordArb = fc.record({
      created_at: fc.string(),
      name: fc.string(),
      email: fc.string(),
      country_code: fc.string(),
      mobile_without_country_code: fc.string(),
      company: fc.string(),
      city: fc.string(),
      state: fc.string(),
      country: fc.string(),
      lead_owner: fc.string(),
      crm_status: crmStatusArb,
      crm_note: fc.string(),
      data_source: dataSourceArb,
      possession_time: fc.string(),
      description: fc.string(),
    });

    const recordsArb = fc.array(crmRecordArb, { minLength: 1, maxLength: 200 });

    // Feature: ai-csv-importer, Property 15: Results Table Rendering Fidelity
    fc.assert(
      fc.property(recordsArb, (records) => {
        const { container, unmount } = render(<ResultsTable records={records} />);

        const table = container.querySelector('table[aria-label="CRM import results"]');
        if (!table) { unmount(); return false; }

        const headerCells = table.querySelectorAll('thead th');
        if (headerCells.length !== 15) { unmount(); return false; }

        const bodyRows = table.querySelectorAll('tbody tr');
        if (bodyRows.length !== records.length) { unmount(); return false; }

        unmount();
        return true;
      }),
      { numRuns: 100 }
    );
  });
});
