/**
 * Tests for GdprToolkitClient and AccessMatrixClient — the Tier-2 superadmin
 * tools. Mocks convex/react + react-i18next, then verifies the search flow,
 * the blast-radius chips, the anonymize/erase buttons and the capability grid.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('react-i18next', () => {
  const KEY_MAP: Record<string, string> = {
    'superadmin.gdpr.title': 'GDPR Data Toolkit',
    'superadmin.gdpr.subtitle': 'Find a data subject, inspect, export, anonymize or erase',
    'superadmin.gdpr.searchPlaceholder': 'Search by exact email or name…',
    'superadmin.gdpr.search': 'Search',
    'superadmin.gdpr.recordCount': '{{count}} records',
    'superadmin.gdpr.inspect': 'Inspect',
    'superadmin.gdpr.export': 'Export',
    'superadmin.gdpr.anonymize': 'Anonymize',
    'superadmin.gdpr.erase': 'Erase',
    'superadmin.gdpr.eraseConfirmPlaceholder':
      'Type the email or ERASE to confirm permanent erasure',
    'superadmin.gdpr.eraseConfirm': 'Erase forever',
    'superadmin.gdpr.inactive': 'inactive',
    'superadmin.controlCenter.loading': 'Loading…',
    'superadmin.accessMatrix.title': 'Access Matrix',
    'superadmin.accessMatrix.subtitle': 'Who can do what across every tenant',
    'superadmin.accessMatrix.globalDistribution': 'Global role distribution',
    'superadmin.accessMatrix.grid': 'Capability grid',
    'superadmin.accessMatrix.capabilities': 'enforced capabilities',
    'superadmin.accessMatrix.capability': 'Capability',
    'superadmin.accessMatrix.users': 'users',
    'superadmin.accessMatrix.noDrift': 'No role drift — every account holds a role from the enum.',
    'superadmin.accessMatrix.perOrg': 'Roles per organization',
    'superadmin.accessMatrix.org': 'Organization',
    'superadmin.accessMatrix.role': 'Role',
    'superadmin.accessMatrix.drift': 'Role drift — accounts with roles outside the enum',
    'superadmin.accessMatrix.user': 'User',
  };
  return {
    useTranslation: () => ({
      t: (key: string, fallback?: string, opts?: Record<string, unknown>) => {
        const raw = KEY_MAP[key] ?? fallback ?? key;
        return raw.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(opts?.[name] ?? ''));
      },
      i18n: { language: 'en' },
    }),
  };
});

jest.mock('@/convex/_generated/api', () => ({
  api: {
    superadmin: {
      gdprToolkit: {
        searchDataSubjects: { _name: 'searchDataSubjects' },
        exportUserData: { _name: 'exportUserData' },
        anonymizeUser: { _name: 'anonymizeUser' },
        eraseUserData: { _name: 'eraseUserData' },
      },
      accessMatrix: {
        getAccessMatrix: { _name: 'getAccessMatrix' },
      },
    },
  },
}));

let searchResults: any[] | undefined = undefined;
let matrixData: any = undefined;

jest.mock('convex/react', () => ({
  useQuery: (ref: any) => {
    const name = ref?._name ?? '';
    if (name === 'searchDataSubjects') return searchResults;
    if (name === 'getAccessMatrix') return matrixData;
    return undefined;
  },
  useMutation: (ref: any) => jest.fn().mockResolvedValue({ success: true }),
  useConvex: () => ({ query: jest.fn().mockResolvedValue({ exportedAt: 1 }) }),
}));

import { GdprToolkitClient } from '@/components/superadmin/GdprToolkitClient';
import { AccessMatrixClient } from '@/components/superadmin/AccessMatrixClient';

const subject = {
  _id: 'user-42',
  name: 'Anna Hakobyan',
  email: 'anna@acme.com',
  role: 'employee',
  isActive: true,
  organizationId: 'org-1',
  organizationName: 'Acme',
  recordCount: 3,
  perTable: { userProfiles: 2, leaveRequests: 1 },
};

beforeEach(() => {
  searchResults = undefined;
  matrixData = undefined;
});

describe('GdprToolkitClient', () => {
  it('renders the title and search box', () => {
    render(<GdprToolkitClient />);
    expect(screen.getByText('GDPR Data Toolkit')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search by exact email or name…')).toBeTruthy();
  });

  it('shows search results with blast-radius chips', () => {
    searchResults = [subject];
    render(<GdprToolkitClient />);
    fireEvent.change(screen.getByPlaceholderText('Search by exact email or name…'), {
      target: { value: 'anna@acme.com' },
    });
    fireEvent.click(screen.getByText('Search'));
    expect(screen.getByText('Anna Hakobyan')).toBeTruthy();
    expect(screen.getByText('3 records')).toBeTruthy();
    expect(screen.getByText('userProfiles · 2')).toBeTruthy();
  });

  it('renders anonymize and erase actions for a subject', () => {
    searchResults = [subject];
    render(<GdprToolkitClient />);
    fireEvent.change(screen.getByPlaceholderText('Search by exact email or name…'), {
      target: { value: 'anna@acme.com' },
    });
    fireEvent.click(screen.getByText('Search'));
    expect(screen.getByText('Anonymize')).toBeTruthy();
    expect(screen.getByText('Erase')).toBeTruthy();
    expect(screen.getByText('Export')).toBeTruthy();
  });
});

describe('AccessMatrixClient', () => {
  const matrix = {
    capabilities: [
      { key: 'leave.approve', description: 'Approve leave in your subtree.' },
      { key: 'users.read.org', description: 'Read every member.' },
    ],
    roles: [
      {
        role: 'admin',
        label: 'Organization admin',
        capabilities: ['leave.approve', 'users.read.org'],
      },
      { role: 'employee', label: 'Employee', capabilities: [] },
    ],
    globalCounts: { admin: 2, employee: 30 },
    perOrg: [{ orgId: 'org-1', orgName: 'Acme', counts: { admin: 2, employee: 30 } }],
    drift: [],
    generatedAt: Date.now(),
  };

  it('renders the capability grid with grants', () => {
    matrixData = matrix;
    render(<AccessMatrixClient />);
    expect(screen.getByText('Access Matrix')).toBeTruthy();
    expect(screen.getByText('leave.approve')).toBeTruthy();
    expect(screen.getByText('users.read.org')).toBeTruthy();
    expect(screen.getAllByText('Organization admin').length).toBeGreaterThan(0);
  });

  it('shows role distribution and per-org breakdown', () => {
    matrixData = matrix;
    render(<AccessMatrixClient />);
    expect(screen.getByText('Global role distribution')).toBeTruthy();
    expect(screen.getByText('Acme')).toBeTruthy();
    expect(
      screen.getByText('No role drift — every account holds a role from the enum.'),
    ).toBeTruthy();
  });

  it('renders loading state before data arrives', () => {
    matrixData = undefined;
    render(<AccessMatrixClient />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });
});
