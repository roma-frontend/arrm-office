/**
 * Tests for ControlCenterClient — the superadmin control center tabs.
 *
 * Mocks convex/react (useQuery / usePaginatedQuery / useMutation) and
 * react-i18next, then verifies the tab bar, the monitor pulse cards, the
 * security alert feed and the export controls.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('react-i18next', () => {
  const KEY_MAP: Record<string, string> = {
    'superadmin.controlCenter.tabs.monitor': 'Monitor',
    'superadmin.controlCenter.tabs.security': 'Security',
    'superadmin.controlCenter.tabs.sessions': 'Sessions',
    'superadmin.controlCenter.tabs.users': 'Users',
    'superadmin.controlCenter.tabs.orgs': 'Organizations',
    'superadmin.controlCenter.tabs.audit': 'Audit',
    'superadmin.controlCenter.tabs.export': 'Export',
    'superadmin.controlCenter.pulse.logins': 'Logins',
    'superadmin.controlCenter.pulse.checkIns': 'Check-ins',
    'superadmin.controlCenter.hotOrgs': 'Hottest organizations',
    'superadmin.controlCenter.quality.title': 'Data quality',
    'superadmin.controlCenter.export.fullDump': 'Full snapshot',
    'superadmin.controlCenter.export.users': 'Users',
    'superadmin.controlCenter.security.critical': 'Critical',
    'superadmin.sessions.revoke': 'Log out',
  };
  return {
    useTranslation: () => ({
      t: (key: string, fallback?: string) => KEY_MAP[key] ?? fallback ?? key,
      i18n: { language: 'en' },
    }),
  };
});

let pulseData: any = {};
let securityData: any = null;
let qualityData: any = null;
let healthData: any = null;
let backupsData: any = null;
let exportsData: any = null;
let sessionsData: any = null;
let auditData: any = null;
let orgsData: any = null;

jest.mock('convex/react', () => ({
  useQuery: (ref: any) => {
    const name = ref?._name ?? '';
    if (name === 'getControlPulse') return pulseData;
    if (name === 'getControlSecurity') return securityData;
    if (name === 'getDataQuality') return qualityData;
    if (name === 'getPlatformHealth') return healthData;
    if (name === 'getBackupStats') return backupsData;
    if (name === 'getControlExports') return exportsData;
    if (name === 'listActiveSessions') return sessionsData;
    if (name === 'listGlobalAuditLogs') return auditData;
    if (name === 'getAllOrganizations') return orgsData;
    return undefined;
  },
  usePaginatedQuery: () => ({
    results: [{ _id: 'u1', name: 'Alice', email: 'alice@x.com', role: 'employee', isActive: true }],
    status: 'Exhausted',
    loadMore: jest.fn(),
  }),
  useMutation: () => jest.fn(),
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    superadmin: {
      controlCenter: {
        getControlPulse: { _name: 'getControlPulse' },
        getControlSecurity: { _name: 'getControlSecurity' },
        getDataQuality: { _name: 'getDataQuality' },
        getControlExports: { _name: 'getControlExports' },
      },
      hub: { getPlatformHealth: { _name: 'getPlatformHealth' } },
      sessions: {
        listActiveSessions: { _name: 'listActiveSessions' },
        listGlobalAuditLogs: { _name: 'listGlobalAuditLogs' },
        revokeSession: { _name: 'revokeSession' },
      },
    },
    backups: { getBackupStats: { _name: 'getBackupStats' } },
    users: { listUsersPaginated: { _name: 'listUsersPaginated' } },
    organizations: { getAllOrganizations: { _name: 'getAllOrganizations' } },
  },
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, size, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
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

import { ControlCenterClient } from '@/components/superadmin/ControlCenterClient';

beforeEach(() => {
  jest.clearAllMocks();
  pulseData = {
    logins: { lastHour: 1, last24h: 12, prev24h: 10 },
    registrations: { lastHour: 0, last24h: 3, prev24h: 1 },
    newOrgs: { lastHour: 0, last24h: 1, prev24h: 0 },
    checkIns: { lastHour: 5, last24h: 40, prev24h: 30 },
    leaveRequests: { lastHour: 0, last24h: 4, prev24h: 2 },
    tasksCreated: { lastHour: 2, last24h: 18, prev24h: 15 },
    hotOrgs: [{ id: 'org-a', name: 'Hot Co', count: 42 }],
  };
  securityData = {
    counts: { critical: 1, warn: 2, info: 1 },
    alerts: [
      {
        id: 'a1',
        level: 'critical',
        kind: 'login.blocked',
        at: Date.now(),
        actor: 'x@x.com',
        detail: 'Locked',
      },
      {
        id: 'a2',
        level: 'info',
        kind: 'impersonation.active',
        at: Date.now(),
        actor: 'reason',
        detail: 'Impersonating',
      },
    ],
  };
  qualityData = {
    globalScore: 78,
    byBand: { excellent: 2, good: 3, attention: 1, critical: 0 },
    worstOrgs: [{ name: 'Messy Org', users: 5, score: 41, missing: ['position', 'phone'] }],
  };
  healthData = {
    organizations: 10,
    users: 120,
    activeSubscriptions: 8,
    sessions: 15,
    pendingLeaves: 3,
    openTickets: 2,
    activeIncidents: 0,
    expiringTrials: 1,
  };
  backupsData = { totalBackups: 4, orgsBackedUp: 3, totalSize: 1024 };
  exportsData = {
    users: [{ name: 'Alice', email: 'alice@x.com', role: 'employee' }],
    orgs: [{ name: 'Alpha', industry: 'IT' }],
    sessions: [],
    audit: [{ action: 'user.login', actor: 'alice@x.com' }],
  };
  sessionsData = [];
  auditData = [];
  orgsData = [];
});

describe('ControlCenterClient', () => {
  it('renders all seven tabs', () => {
    render(<ControlCenterClient />);
    expect(screen.getByRole('tab', { name: 'Monitor' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Security' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Sessions' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Users' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Organizations' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Audit' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Export' })).toBeTruthy();
  });

  it('shows pulse metrics and hot orgs on the monitor tab', () => {
    render(<ControlCenterClient />);
    expect(screen.getByText('Logins')).toBeTruthy();
    expect(screen.getByText('Check-ins')).toBeTruthy();
    expect(screen.getByText('Hottest organizations')).toBeTruthy();
    expect(screen.getByText('Hot Co')).toBeTruthy();
    expect(screen.getByText('Data quality')).toBeTruthy();
    expect(screen.getByText('78%')).toBeTruthy();
  });

  it('switches to the security feed with leveled alerts', () => {
    render(<ControlCenterClient />);
    fireEvent.click(screen.getByRole('tab', { name: 'Security' }));
    expect(screen.getByText('login.blocked')).toBeTruthy();
    expect(screen.getByText('impersonation.active')).toBeTruthy();
    expect(screen.getByText(/Critical · 1/)).toBeTruthy();
  });

  it('switches to the export tab and offers CSV/JSON downloads', () => {
    render(<ControlCenterClient />);
    fireEvent.click(screen.getByRole('tab', { name: 'Export' }));
    expect(screen.getAllByText('Users').length).toBeGreaterThan(0);
    expect(screen.getByText('Full snapshot')).toBeTruthy();
    expect(screen.getAllByText('CSV').length).toBeGreaterThan(0);
    expect(screen.getAllByText('JSON').length).toBeGreaterThan(0);
  });

  it('shows sessions with a logout action', () => {
    sessionsData = [
      {
        userId: 'u1',
        name: 'Alice',
        email: 'alice@x.com',
        organizationName: 'Alpha',
        sessionExpiry: Date.now() + 3600_000,
      },
    ];
    render(<ControlCenterClient />);
    fireEvent.click(screen.getByRole('tab', { name: 'Sessions' }));
    expect(screen.getByText('alice@x.com')).toBeTruthy();
    expect(screen.getByText('Log out')).toBeTruthy();
  });
});
