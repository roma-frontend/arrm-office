/**
 * Tests for the superadmin Control Center — convex/superadmin/controlCenter.
 * The live pulse, the leveled security feed, the per-org data-quality scores
 * and the export row sets, with the superadmin gate on every query.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/limits', () => ({ DEFAULT_LIST_CAP: 2000 }));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

let controlCenter: any;
let mockGetAuthCaller: jest.Mock;
let mockGet: jest.Mock;

const superadmin = {
  _id: 'user-super',
  name: 'Root',
  email: 'root@x.com',
  role: 'superadmin',
  organizationId: 'org-1',
};
const admin = { _id: 'user-admin', name: 'Admin', email: 'a@a.com', role: 'admin' };

function makeCtx(tableRows: Record<string, unknown[]> = {}) {
  const chain = (table: string) => {
    const eqs: Array<[string, unknown]> = [];
    const c: any = {
      withIndex: (_name: string, cb?: (q: any) => unknown) => {
        if (typeof cb === 'function') {
          const q: any = { eq: (f: string, v: unknown) => (eqs.push([f, v]), q), gte: () => q };
          cb(q);
        }
        return c;
      },
      filter: () => c,
      order: () => c,
      take: async () =>
        (tableRows[table] ?? []).filter((row) =>
          eqs.every(([field, value]) => (row as Record<string, unknown>)[field] === value),
        ),
      first: async () => null,
      unique: async () => null,
      collect: async () => tableRows[table] ?? [],
    };
    return c;
  };

  return {
    db: {
      get: mockGet,
      query: (table: string) => chain(table),
    },
  };
}

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockGet = jest.fn();
    controlCenter = require('../../convex/superadmin/controlCenter');
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller.mockResolvedValue(superadmin);
});

const NOW = Date.now();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// ── getControlPulse ──────────────────────────────────────────────────────────

describe('getControlPulse', () => {
  const login = (createdAt: number, success = true) => ({
    _id: `attempt-${createdAt}`,
    email: 'u@x.com',
    success,
    method: 'password' as const,
    createdAt,
  });

  it('computes windowed pulse metrics (hour / 24h / previous 24h)', async () => {
    const ctx = makeCtx({
      loginAttempts: [
        login(NOW - 10 * 60 * 1000), // last hour
        login(NOW - 3 * HOUR), // last 24h
        login(NOW - 2 * DAY + 60 * 60 * 1000), // previous 24h
        login(NOW - 10 * DAY), // older — ignored
      ],
      users: [{ _id: 'u1', _creationTime: NOW - 5 * 60 * 1000 }],
      organizations: [{ _id: 'o1', _creationTime: NOW - 30 * DAY }],
      timeTracking: [{ checkInTime: NOW - 60 * 1000 }],
      leaveRequests: [],
      tasks: [],
      auditLogs: [
        { _id: 'a1', organizationId: 'org-hot', createdAt: NOW - 60 * 1000 },
        { _id: 'a2', organizationId: 'org-hot', createdAt: NOW - 2 * HOUR },
        { _id: 'a3', organizationId: 'org-cold', createdAt: NOW - 10 * DAY },
      ],
    });
    mockGet.mockImplementation(async (id: string) => {
      if (id === 'org-hot') return { _id: id, name: 'Hot Co' };
      return null;
    });

    const result = await (controlCenter.getControlPulse as any).handler(ctx, {});

    expect(result.logins).toEqual({ lastHour: 1, last24h: 2, prev24h: 1 });
    expect(result.registrations.lastHour).toBe(1);
    expect(result.checkIns.last24h).toBe(1);
    // Old org + old audit row are outside the windows.
    expect(result.newOrgs.last24h).toBe(0);
    // Only actions inside the last 24h count toward hot orgs.
    expect(result.hotOrgs).toEqual([{ id: 'org-hot', name: 'Hot Co', count: 2 }]);
  });

  it('rejects non-superadmins', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    const ctx = makeCtx();
    await expect((controlCenter.getControlPulse as any).handler(ctx, {})).rejects.toThrow(
      /Only superadmins/,
    );
  });
});

// ── getControlSecurity ───────────────────────────────────────────────────────

describe('getControlSecurity', () => {
  const attempt = (overrides: Record<string, unknown>) => ({
    _id: 'attempt-1',
    email: 'u@x.com',
    success: true,
    method: 'password' as const,
    createdAt: NOW - 5 * 60 * 1000,
    ...overrides,
  });

  it('levels blocked, failed, high-risk, impersonations and incidents', async () => {
    const ctx = makeCtx({
      loginAttempts: [
        attempt({ _id: 'a1', success: false, blockedReason: 'Locked' }),
        attempt({ _id: 'a2', success: false }),
        attempt({ _id: 'a3', riskScore: 80, riskFactors: ['new_device'] }),
        attempt({ _id: 'a4' }), // fine
      ],
      impersonationSessions: [
        {
          _id: 'imp-1',
          targetUserId: 'user-2',
          reason: 'Support ticket',
          startedAt: NOW - HOUR,
          expiresAt: NOW + HOUR,
          isActive: true,
        },
      ],
      emergencyIncidents: [
        {
          _id: 'inc-1',
          title: 'Outage',
          severity: 'critical',
          status: 'investigating',
          affectedUsers: 12,
          startedAt: NOW - 30 * 60 * 1000,
        },
      ],
      auditLogs: [],
    });

    const result = await (controlCenter.getControlSecurity as any).handler(ctx, {});
    const kinds = result.alerts.map((a: { kind: string }) => a.kind);

    expect(kinds).toContain('login.blocked');
    expect(kinds).toContain('login.failed');
    expect(kinds).toContain('login.high_risk');
    expect(kinds).toContain('impersonation.active');
    expect(kinds).toContain('incident.open');
    expect(result.counts.critical).toBeGreaterThanOrEqual(2); // blocked + critical incident
    expect(result.counts.warn).toBeGreaterThanOrEqual(2); // failed + high-risk
  });
});

// ── getDataQuality ───────────────────────────────────────────────────────────

describe('getDataQuality', () => {
  it('scores orgs by profile completeness and reports the worst', async () => {
    const ctx = makeCtx({
      organizations: [{ _id: 'org-a', name: 'Alpha' }],
      users: [
        {
          _id: 'u1',
          name: 'A',
          email: 'a@x.com',
          role: 'employee',
          organizationId: 'org-a',
          positionId: 'pos-1',
          departmentId: 'dep-1',
          phone: '+1',
          avatarUrl: 'x',
          isActive: true,
        },
        {
          _id: 'u2',
          name: 'B',
          email: 'b@x.com',
          role: 'employee',
          organizationId: 'org-a',
          isActive: true,
        },
      ],
      departments: [{ _id: 'dep-1', organizationId: 'org-a' }],
      positions: [{ _id: 'pos-1', organizationId: 'org-a' }],
    });

    const result = await (controlCenter.getDataQuality as any).handler(ctx, {});
    expect(result.globalScore).toBeGreaterThan(0);
    expect(result.worstOrgs[0]?.name).toBe('Alpha');
    // The incomplete user drags Alpha below 100.
    expect(result.worstOrgs[0]?.score).toBeLessThan(100);
    expect(result.byBand).toMatchObject({
      excellent: expect.any(Number),
      good: expect.any(Number),
      attention: expect.any(Number),
      critical: expect.any(Number),
    });
  });

  it('returns 100 when there are no orgs with users', async () => {
    const ctx = makeCtx({
      organizations: [{ _id: 'org-a', name: 'Alpha' }],
      users: [],
      departments: [],
      positions: [],
    });
    const result = await (controlCenter.getDataQuality as any).handler(ctx, {});
    expect(result.globalScore).toBe(100);
    expect(result.worstOrgs).toEqual([]);
  });
});

// ── getControlExports ────────────────────────────────────────────────────────

describe('getControlExports', () => {
  it('returns flat row sets for users, orgs, sessions and audit', async () => {
    const ctx = makeCtx({
      users: [
        {
          _id: 'u1',
          name: 'Alice',
          email: 'alice@x.com',
          role: 'employee',
          organizationId: 'org-a',
          isActive: true,
          _creationTime: NOW,
          sessionToken: 'tok',
          sessionExpiry: NOW + DAY,
        },
      ],
      organizations: [{ _id: 'org-a', name: 'Alpha', isActive: true, _creationTime: NOW }],
      auditLogs: [
        {
          _id: 'log-1',
          action: 'user.login',
          userId: 'u1',
          organizationId: 'org-a',
          createdAt: NOW,
          target: 'u1',
          details: 'ok',
        },
      ],
    });
    mockGet.mockResolvedValue(null);

    const result = await (controlCenter.getControlExports as any).handler(ctx, {});

    expect(result.users).toHaveLength(1);
    expect(result.users[0]).toMatchObject({
      name: 'Alice',
      email: 'alice@x.com',
      organization: 'Alpha',
    });
    expect(result.orgs).toHaveLength(1);
    expect(result.sessions).toHaveLength(1);
    expect(result.audit).toHaveLength(1);
    expect(result.audit[0]).toMatchObject({ action: 'user.login', actor: 'alice@x.com' });
  });
});
