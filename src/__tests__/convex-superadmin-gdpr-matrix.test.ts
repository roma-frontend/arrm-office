/**
 * Tests for the Tier-2 superadmin tools — convex/superadmin/gdprToolkit and
 * convex/superadmin/accessMatrix.
 *
 * GDPR: search a data subject (blast-radius preview), export the full payload,
 * anonymize PII in place, and erase the subject (cascade + confirmation gate).
 * Access Matrix: capability catalog + role grid + role distribution + drift.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  internalAction: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
  internalQuery: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

let gdpr: any;
let matrix: any;
let mockGetAuthCaller: jest.Mock;
let mockGet: jest.Mock;
let mockPatch: jest.Mock;
let mockInsert: jest.Mock;
let mockDelete: jest.Mock;

const superadmin = { _id: 'user-super', name: 'Root', email: 'root@x.com', role: 'superadmin' };
const admin = { _id: 'user-admin', name: 'Admin', email: 'a@a.com', role: 'admin' };
const subject = {
  _id: 'user-42',
  name: 'Anna Hakobyan',
  email: 'anna@acme.com',
  role: 'employee',
  isActive: true,
  organizationId: 'org-1',
  createdAt: 1000,
  updatedAt: 2000,
  paidLeaveBalance: 10,
  sickLeaveBalance: 5,
  familyLeaveBalance: 3,
  employeeType: 'staff',
};

function makeCtx(extra = {}) {
  return {
    db: {
      get: mockGet,
      patch: mockPatch,
      insert: mockInsert,
      delete: mockDelete,
      query: () => ({
        withIndex: () => ({ first: () => Promise.resolve(null) }),
        filter: () => ({ take: (n: number) => Promise.resolve([]) }),
        take: (n: number) => Promise.resolve([]),
        order: () => ({ take: (n: number) => Promise.resolve([]) }),
        first: () => Promise.resolve(null),
        collect: () => Promise.resolve([]),
      }),
    },
    ...extra,
  };
}

beforeAll(async () => {
  gdpr = await import('../../convex/superadmin/gdprToolkit');
  matrix = await import('../../convex/superadmin/accessMatrix');
});

beforeEach(() => {
  jest.clearAllMocks();
  ({ getAuthCaller: mockGetAuthCaller } = jest.requireMock('../../convex/lib/getAuthCaller'));
  mockGet = jest.fn();
  mockPatch = jest.fn();
  mockInsert = jest.fn();
  mockDelete = jest.fn();
});

describe('gdpr toolkit — auth gate', () => {
  it('rejects non-superadmins on search and export', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    const ctx = makeCtx();
    await expect(gdpr.searchDataSubjects.handler(ctx, { query: 'anna' })).rejects.toThrow(
      'Superadmin only',
    );
    await expect(gdpr.exportUserData.handler(ctx, { userId: 'user-42' })).rejects.toThrow(
      'Superadmin only',
    );
  });

  it('rejects non-superadmins on anonymize and erase', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    const ctx = makeCtx();
    await expect(gdpr.anonymizeUser.handler(ctx, { userId: 'user-42' })).rejects.toThrow(
      'Superadmin only',
    );
    await expect(
      gdpr.eraseUserData.handler(ctx, { userId: 'user-42', confirm: 'ERASE' }),
    ).rejects.toThrow('Superadmin only');
  });
});

describe('gdpr toolkit — searchDataSubjects', () => {
  it('returns the subject with per-table blast-radius counts', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const rowsByTable: Record<string, unknown[]> = {
      users: [subject],
      userProfiles: [
        { _id: 'p1', userId: 'user-42', phone: '+374111111' },
        { _id: 'p2', userId: 'user-42', phone: '+374222222' },
      ],
      leaveRequests: [{ _id: 'l1', userId: 'user-42', status: 'approved' }],
      notifications: [],
    };
    const ctx = makeCtx();
    ctx.db.query = (table: string) => ({
      filter: () => ({
        take: () => Promise.resolve(rowsByTable[table] ?? []),
      }),
    });
    mockGet.mockResolvedValueOnce({ _id: 'org-1', name: 'Acme' });

    const res = await gdpr.searchDataSubjects.handler(ctx, { query: 'anna@acme.com' });
    expect(res).toHaveLength(1);
    expect(res[0].email).toBe('anna@acme.com');
    expect(res[0].organizationName).toBe('Acme');
    expect(res[0].perTable.userProfiles).toBe(2);
    expect(res[0].perTable.leaveRequests).toBe(1);
    expect(res[0].recordCount).toBe(3);
  });

  it('returns empty when nothing matches', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const ctx = makeCtx();
    ctx.db.query = () => ({
      filter: () => ({ take: () => Promise.resolve([]) }),
    });
    const res = await gdpr.searchDataSubjects.handler(ctx, { query: 'nobody@nowhere.com' });
    expect(res).toEqual([]);
  });
});

describe('gdpr toolkit — exportUserData', () => {
  it('bundles account, profile, org and non-empty collections', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    mockGet.mockImplementation((id: string) =>
      id === 'org-1' ? { _id: 'org-1', name: 'Acme', slug: 'acme', createdAt: 500 } : null,
    );
    const profile = { _id: 'p1', userId: 'user-42', phone: '+374111111' };
    const rowsByTable: Record<string, unknown[]> = {
      userProfiles: [profile],
      leaveRequests: [{ _id: 'l1', userId: 'user-42' }],
    };
    const ctx = makeCtx();
    ctx.db.query = (table: string) => ({
      withIndex: () => ({ first: () => Promise.resolve(profile) }),
      filter: () => ({
        take: () => Promise.resolve(rowsByTable[table] ?? []),
      }),
    });
    mockGet.mockResolvedValueOnce(subject);

    const res = await gdpr.exportUserData.handler(ctx, { userId: 'user-42' });
    expect(res.subject.email).toBe('anna@acme.com');
    expect(res.organization.name).toBe('Acme');
    expect(res.profile.phone).toBe('+374111111');
    const tables = res.collections.map((c: any) => c.table);
    expect(tables).toContain('userProfiles');
    expect(tables).toContain('leaveRequests');
    expect(tables).not.toContain('notifications');
    // _id/_creationTime stripped from exported rows
    expect(res.collections[0].rows[0]).not.toHaveProperty('_id');
  });
});

describe('gdpr toolkit — anonymizeUser', () => {
  it('scrubs PII on user, profile and employee profile', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    mockGet.mockResolvedValueOnce(subject);
    const ctx = makeCtx();
    ctx.db.query = () => ({
      withIndex: () => ({ first: () => Promise.resolve(null) }),
    });

    await gdpr.anonymizeUser.handler(ctx, { userId: 'user-42' });
    expect(mockPatch).toHaveBeenCalledWith(
      'user-42',
      expect.objectContaining({
        name: 'Anonymous User',
        email: expect.stringContaining('@erased.local'),
      }),
    );
    expect(mockInsert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'superadmin.gdpr.anonymize' }),
    );
  });
});

describe('gdpr toolkit — eraseUserData', () => {
  it('requires the confirmation to match the email', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    mockGet.mockResolvedValueOnce(subject);
    const ctx = makeCtx();
    await expect(
      gdpr.eraseUserData.handler(ctx, { userId: 'user-42', confirm: 'nope' }),
    ).rejects.toThrow('Confirmation mismatch');
  });

  it('cascade-deletes owned records and scrubs the account when confirmed', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    mockGet.mockResolvedValueOnce(subject);
    const rowsByTable: Record<string, unknown[]> = {
      leaveRequests: [{ _id: 'l1', userId: 'user-42' }],
      dataAccessLogs: [{ _id: 'dal1', userId: 'user-42' }], // must be preserved
    };
    const ctx = makeCtx();
    ctx.db.query = (table: string) => ({
      filter: () => ({
        take: () => Promise.resolve(rowsByTable[table] ?? []),
      }),
    });

    await gdpr.eraseUserData.handler(ctx, { userId: 'user-42', confirm: 'ERASE' });
    // dataAccessLogs excluded from the sweep — the audit trail survives.
    expect(mockDelete).toHaveBeenCalledWith('l1');
    expect(mockDelete).not.toHaveBeenCalledWith('dal1');
    expect(mockPatch).toHaveBeenCalledWith(
      'user-42',
      expect.objectContaining({ name: 'Erased User', isActive: false }),
    );
    expect(mockInsert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'superadmin.gdpr.erase' }),
    );
  });
});

describe('access matrix', () => {
  it('returns the capability catalog and role grants', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const ctx = makeCtx();
    ctx.db.query = (table: string) => {
      if (table === 'organizations') {
        return { take: () => Promise.resolve([]) };
      }
      if (table === 'positions') {
        // No position is flagged isDriverPosition in this fixture.
        return {
          filter: () => ({ take: () => Promise.resolve([]) }),
          withIndex: () => ({ take: () => Promise.resolve([]) }),
        };
      }
      return {
        take: () =>
          Promise.resolve([
            { _id: 'u1', role: 'admin', isActive: true, organizationId: 'org-1' },
            { _id: 'u2', role: 'employee', isActive: true, organizationId: 'org-1' },
            { _id: 'u3', role: 'mystery', isActive: true, organizationId: 'org-2' },
            { _id: 'u4', role: 'employee', isActive: false, organizationId: 'org-1' },
          ]),
      };
    };
    mockGet.mockImplementation((id: string) =>
      id === 'org-1' ? { _id: 'org-1', name: 'Acme' } : { _id: 'org-2', name: 'Beta' },
    );

    const res = await matrix.getAccessMatrix.handler(ctx, {});
    expect(res.capabilities.length).toBeGreaterThan(0);
    const admin = res.roles.find((r: any) => r.role === 'admin');
    expect(admin.capabilities).toContain('users.read.org');
    const employee = res.roles.find((r: any) => r.role === 'employee');
    expect(employee.capabilities).toEqual([]);
    // Global counts: mystery excluded, inactive excluded
    expect(res.globalCounts.admin).toBe(1);
    expect(res.globalCounts.employee).toBe(1);
    // Drift flags the unknown role
    expect(res.drift).toHaveLength(1);
    expect(res.drift[0].role).toBe('mystery');
    expect(res.drift[0].orgName).toBe('Beta');
  });

  it('counts drivers by position, not by role', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const ctx = makeCtx();
    ctx.db.query = (table: string) => {
      if (table === 'organizations') {
        return { take: () => Promise.resolve([{ _id: 'org-1', name: 'Acme' }]) };
      }
      if (table === 'positions') {
        // pos-d1 is flagged as a driver position.
        return {
          filter: () => ({
            take: () => Promise.resolve([{ _id: 'pos-d1', isDriverPosition: true }]),
          }),
          withIndex: () => ({ take: () => Promise.resolve([]) }),
        };
      }
      return {
        take: () =>
          Promise.resolve([
            // Legacy role 'driver' — counted via the fallback.
            { _id: 'u1', role: 'driver', isActive: true, organizationId: 'org-1' },
            // Employee holding a driver position — counted by position.
            {
              _id: 'u2',
              role: 'employee',
              positionId: 'pos-d1',
              isActive: true,
              organizationId: 'org-1',
            },
            { _id: 'u3', role: 'employee', isActive: true, organizationId: 'org-1' },
          ]),
      };
    };

    const res = await matrix.getAccessMatrix.handler(ctx, {});
    expect(res.globalCounts.driver).toBe(2);
    expect(res.globalCounts.employee).toBe(1);
    expect(res.perOrg.find((o: any) => o.orgId === 'org-1')?.counts.driver).toBe(2);
  });

  it('returns null for non-superadmins', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    const res = await matrix.getAccessMatrix.handler(makeCtx(), {});
    expect(res).toBeNull();
  });
});
