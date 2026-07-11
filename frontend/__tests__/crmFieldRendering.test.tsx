// Feature: ai-csv-importer, CRM Field Rendering
import '@testing-library/jest-dom/jest-globals';
import { describe, test, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import ResultsTable from '@/components/results/ResultsTable';
import type { CrmRecord, CrmStatus } from '@/lib/types';

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
// Unit tests — CRM field rendering
// ---------------------------------------------------------------------------

describe('CRM field rendering — all 15 fields', () => {
  test('all 15 fields are rendered when a record has a unique value for each', () => {
    const record = makeCrmRecord({
      created_at:                    'UNIQUE_CREATED_AT',
      name:                          'UNIQUE_NAME',
      email:                         'UNIQUE_EMAIL',
      country_code:                  'UNIQUE_COUNTRY_CODE',
      mobile_without_country_code:   'UNIQUE_MOBILE',
      company:                       'UNIQUE_COMPANY',
      city:                          'UNIQUE_CITY',
      state:                         'UNIQUE_STATE',
      country:                       'UNIQUE_COUNTRY',
      lead_owner:                    'UNIQUE_LEAD_OWNER',
      crm_status:                    'GOOD_LEAD_FOLLOW_UP',   // renders as 'Good Lead'
      crm_note:                      'UNIQUE_CRM_NOTE',
      data_source:                   'leads_on_demand',
      possession_time:               'UNIQUE_POSSESSION_TIME',
      description:                   'UNIQUE_DESCRIPTION',
    });

    render(<ResultsTable records={[record]} />);

    const uniqueValues = [
      'UNIQUE_CREATED_AT',
      'UNIQUE_NAME',
      'UNIQUE_EMAIL',
      'UNIQUE_COUNTRY_CODE',
      'UNIQUE_MOBILE',
      'UNIQUE_COMPANY',
      'UNIQUE_CITY',
      'UNIQUE_STATE',
      'UNIQUE_COUNTRY',
      'UNIQUE_LEAD_OWNER',
      'Good Lead',          // crm_status badge label
      'UNIQUE_CRM_NOTE',
      'leads_on_demand',
      'UNIQUE_POSSESSION_TIME',
      'UNIQUE_DESCRIPTION',
    ];

    for (const value of uniqueValues) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }
  });
});

describe('CRM field rendering — crm_status badge styling', () => {
  const statusCases: { status: CrmStatus; label: string }[] = [
    { status: 'GOOD_LEAD_FOLLOW_UP', label: 'Good Lead' },
    { status: 'DID_NOT_CONNECT',     label: 'Did Not Connect' },
    { status: 'BAD_LEAD',            label: 'Bad Lead' },
    { status: 'SALE_DONE',           label: 'Sale Done' },
  ];

  statusCases.forEach(({ status, label }) => {
    test(`crm_status "${status}" renders badge label "${label}"`, () => {
      render(<ResultsTable records={[makeCrmRecord({ crm_status: status })]} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });
});

describe('CRM field rendering — crm_note overflow content', () => {
  test('crm_note with overflow emails is rendered verbatim', () => {
    render(
      <ResultsTable
        records={[makeCrmRecord({ crm_note: 'additional_emails: b@b.com, c@c.com' })]}
      />
    );
    expect(
      screen.getByText('additional_emails: b@b.com, c@c.com')
    ).toBeInTheDocument();
  });

  test('crm_note with overflow mobiles is rendered verbatim', () => {
    render(
      <ResultsTable
        records={[makeCrmRecord({ crm_note: 'additional_mobiles: 9999999, 8888888' })]}
      />
    );
    expect(
      screen.getByText('additional_mobiles: 9999999, 8888888')
    ).toBeInTheDocument();
  });
});

describe('CRM field rendering — empty string placeholder', () => {
  test('empty name field renders the — placeholder at least once', () => {
    render(<ResultsTable records={[makeCrmRecord({ name: '' })]} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });
});
