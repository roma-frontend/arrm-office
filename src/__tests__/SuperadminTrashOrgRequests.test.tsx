/**
 * Tests for the Tier-2 superadmin tools: TrashClient (restore / purge) and
 * OrgRequestsClient (approve / reject queue).
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('react-i18next', () => {
  const KEY_MAP: Record<string, string> = {
    'superadmin.trash.title': 'Trash',
    'superadmin.trash.orgs': 'Organizations',
    'superadmin.trash.users': 'Users',
    'superadmin.trash.restore': 'Restore',
    'superadmin.trash.purge': 'Purge',
    'superadmin.trash.typeSlug': 'Type {{slug}} to confirm',
    'superadmin.trash.purgeConfirm': 'Delete forever',
    'superadmin.orgRequests.title': 'Organization requests',
    'superadmin.orgRequests.status.pending': 'Pending',
    'superadmin.orgRequests.status.approved': 'Approved',
    'superadmin.orgRequests.status.rejected': 'Rejected',
    'superadmin.orgRequests.approve': 'Approve',
    'superadmin.orgRequests.reject': 'Reject',
    'superadmin.orgRequests.confirmReject': 'Reject request',
    'superadmin.controlCenter.loading': 'Loading…',
    'common.cancel': 'Cancel',
  };
  return {
    useTranslation: () => ({
      t: (key: string, fallback?: string, opts?: Record<string, string>) => {
        let out = KEY_MAP[key] ?? fallback ?? key;
        if (opts) for (const [k, v] of Object.entries(opts)) out = out.replace(`{{${k}}}`, v);
        return out;
      },
      i18n: { language: 'en' },
    }),
  };
});

let trashData: any = null;
let requestsData: any = null;
let mutationCalls: string[] = [];

jest.mock('convex/react', () => ({
  useQuery: (ref: any) => {
    const name = ref?._name ?? '';
    if (name === 'listTrash') return trashData;
    if (name === 'getOrganizationRequests') return requestsData;
    return undefined;
  },
  useMutation: (ref: any) => (args: any) => {
    mutationCalls.push(`${ref?._name ?? 'mutation'}(${JSON.stringify(args ?? {})})`);
    return Promise.resolve({ organizationId: 'org-new', userId: 'user-new' });
  },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    superadmin: {
      trash: {
        listTrash: { _name: 'listTrash' },
        moveUserToTrash: { _name: 'moveUserToTrash' },
        restoreOrg: { _name: 'restoreOrg' },
        restoreUser: { _name: 'restoreUser' },
        purgeUser: { _name: 'purgeUser' },
      },
      secureDeleteOrganization: { _name: 'secureDeleteOrganization' },
    },
    organizationRequests: {
      getOrganizationRequests: { _name: 'getOrganizationRequests' },
      secureApproveOrgRequest: { _name: 'secureApproveOrgRequest' },
      secureRejectOrgRequest: { _name: 'secureRejectOrgRequest' },
    },
  },
}));

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector: (s: any) => unknown) =>
    selector({ user: { id: 'user-super', role: 'superadmin' } }),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, size, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, placeholder, ...props }: any) => (
    <input value={value} onChange={onChange} placeholder={placeholder} {...props} />
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, ...props }: any) => (
    <span className={className} {...props}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <span data-testid="loader" />,
}));

import { TrashClient } from '@/components/superadmin/TrashClient';
import { OrgRequestsClient } from '@/components/superadmin/OrgRequestsClient';

const NOW = Date.now();

beforeEach(() => {
  jest.clearAllMocks();
  mutationCalls = [];
  trashData = {
    organizations: [
      { id: 'org-1', name: 'Gone Co', slug: 'gone-co', deletedAt: NOW - 1000, deletedBy: null },
    ],
    users: [
      {
        id: 'user-1',
        name: 'Bob',
        email: 'bob@x.com',
        role: 'employee',
        organizationName: 'Gone Co',
        deletedAt: NOW - 500,
        deletedBy: null,
      },
    ],
  };
  requestsData = [
    {
      _id: 'req-1',
      requestedName: 'New Co',
      requestedSlug: 'new-co',
      requesterName: 'Carol',
      requesterEmail: 'carol@x.com',
      requestedPlan: 'professional',
      industry: 'IT',
      country: 'Armenia',
      status: 'pending',
      createdAt: NOW - 1000,
    },
  ];
});

describe('TrashClient', () => {
  it('renders trashed orgs and users with restore actions', () => {
    render(<TrashClient />);
    expect(screen.getByText('Gone Co')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getAllByText('Restore').length).toBe(2);
  });

  it('calls restoreOrg on click', () => {
    render(<TrashClient />);
    fireEvent.click(screen.getAllByText('Restore')[0]!);
    expect(mutationCalls.some((c) => c.startsWith('restoreOrg'))).toBe(true);
  });

  it('requires the org slug before purging', () => {
    render(<TrashClient />);
    fireEvent.click(screen.getAllByText('Purge')[0]!);
    fireEvent.click(screen.getByText('Delete forever'));
    // slug input was empty → no purge mutation, just the mismatch toast path.
    expect(mutationCalls.some((c) => c.startsWith('secureDeleteOrganization'))).toBe(false);
  });
});

describe('OrgRequestsClient', () => {
  it('renders pending requests with approve/reject', () => {
    render(<OrgRequestsClient />);
    expect(screen.getByText('New Co')).toBeTruthy();
    expect(screen.getByText('Approve')).toBeTruthy();
    expect(screen.getByText('Reject')).toBeTruthy();
  });

  it('approves a request', () => {
    render(<OrgRequestsClient />);
    fireEvent.click(screen.getByText('Approve'));
    expect(
      mutationCalls.some((c) => c.startsWith('secureApproveOrgRequest') && c.includes('req-1')),
    ).toBe(true);
  });

  it('rejects a request only with a reason', () => {
    render(<OrgRequestsClient />);
    fireEvent.click(screen.getByText('Reject'));
    fireEvent.click(screen.getByText('Reject request'));
    // No reason entered → mutation not called.
    expect(mutationCalls.some((c) => c.startsWith('secureRejectOrgRequest'))).toBe(false);
  });
});
