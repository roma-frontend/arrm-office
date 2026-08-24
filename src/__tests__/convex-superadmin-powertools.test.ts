/**
 * Tests for the superadmin power tools — convex/superadmin/{impersonation,
 * accessTokens, emergency, search, user360}. These back the hub's operator
 * console: impersonation sessions, temp superadmin tokens, the emergency
 * dashboard, global search, and the 360° user profile.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/pagination', () => ({ MAX_PAGE_SIZE: 50 }));
jest.mock('../../convex/lib/limits', () => ({ DEFAULT_LIST_CAP: 50 }));

jest.mock('../../convex/lib/auth', () => ({
  requireAuthUserOrThrow: jest.fn(),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/notify', () => ({ notify: jest.fn() }));

jest.mock('../../convex/lib/userProfile', () => ({ getProfile: jest.fn() }));

jest.mock('bcryptjs', () => ({ hashSync: jest.fn(() => 'hashed-password') }));

jest.mock('../../convex/_generated/api', () => ({
  api: { superadmin: { globalSearch: { _name: 'globalSearch' } } },
}));

let impersonation: any;
let accessTokens: any;
let emergency: any;
let search: any;
let user360: any;
let mockRequireAuth: jest.Mock;
let mockGetAuthCaller: jest.Mock;
let mockNotify: jest.Mock;
let mockGetProfile: jest.Mock;
let mockGet: jest.Mock;
let mockInsert: jest.Mock;
let mockPatch: jest.Mock;
let mockDelete: jest.Mock;
let mockRunQuery: jest.Mock;

const superadmin = {
  _id: 'user-super',
  name: 'Root',
  email: 'root@x.com',
  role: 'superadmin',
  organizationId: 'org-1',
};
const admin = { _id: 'user-admin', name: 'Admin', email: 'a@a.com', role: 'admin' };

function makeCtx(tableRows: Record<string, unknown[]> = {}) {
  const matches = (row: unknown, eqs: Array<[string, unknown]>) =>
    eqs.every(([field, value]) => (row as Record<string, unknown>)[field] === value);

  const chain = (table: string) => {
    const eqs: Array<[string, unknown]> = [];
    const c: any = {
      withIndex: (_name: string, cb?: (q: any) => unknown) => {
        if (typeof cb === 'function') {
          const q: any = { eq: (field: string, value: unknown) => (eqs.push([field, value]), q) };
          cb(q);
        }
        return c;
      },
      filter: (cb?: (q: any) => unknown) => {
        // Complex predicates (or/and/gt/neq) can't be simulated with simple eq
        // matches, so filters don't constrain rows — the test fixtures are
        // already shaped to satisfy them. Only `withIndex` eqs filter.
        if (typeof cb === 'function') {
          const q: any = {
            field: (name: string) => name,
            eq: () => q,
            and: (...qs: unknown[]) => q,
            or: (...qs: unknown[]) => q,
            gt: () => q,
            neq: () => q,
          };
          cb(q);
        }
        return c;
      },
      order: () => c,
      take: async () => (tableRows[table] ?? []).filter((row) => matches(row, eqs)),
      first: async () => (tableRows[table] ?? []).filter((row) => matches(row, eqs))[0] ?? null,
      unique: async () => (tableRows[table] ?? []).filter((row) => matches(row, eqs))[0] ?? null,
      count: async () => (tableRows[table] ?? []).filter((row) => matches(row, eqs)).length,
      collect: async () => (tableRows[table] ?? []).filter((row) => matches(row, eqs)),
    };
    return c;
  };

  return {
    runQuery: mockRunQuery,
    db: {
      get: mockGet,
      insert: mockInsert,
      patch: mockPatch,
      delete: mockDelete,
      query: (table: string) => chain(table),
    },
  };
}

beforeAll(() => {
  jest.isolateModules(() => {
    mockRequireAuth = jest.requireMock('../../convex/lib/auth').requireAuthUserOrThrow;
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockNotify = jest.requireMock('../../convex/lib/notify').notify;
    mockGetProfile = jest.requireMock('../../convex/lib/userProfile').getProfile;
    mockGet = jest.fn();
    mockInsert = jest.fn(async () => 'inserted-1');
    mockPatch = jest.fn(async () => undefined);
    mockDelete = jest.fn(async () => undefined);
    mockRunQuery = jest.fn(async () => ({
      users: [],
      organizations: [],
      leaveRequests: [],
      driverRequests: [],
      tasks: [],
      supportTickets: [],
    }));

    impersonation = require('../../convex/superadmin/impersonation');
    accessTokens = require('../../convex/superadmin/accessTokens');
    emergency = require('../../convex/superadmin/emergency');
    search = require('../../convex/superadmin/search');
    user360 = require('../../convex/superadmin/user360');
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue(superadmin);
  mockGetAuthCaller.mockResolvedValue(superadmin);
  mockInsert.mockResolvedValue('inserted-1');
  mockRunQuery.mockResolvedValue({
    users: [],
    organizations: [],
    leaveRequests: [],
    driverRequests: [],
    tasks: [],
    supportTickets: [],
  });
});

// ── Impersonation ────────────────────────────────────────────────────────────

describe('impersonation', () => {
  it('startImpersonation creates a session, ends old ones and notifies', async () => {
    mockGet.mockImplementation(async (id: string) => {
      if (id === 'target-1')
        return {
          _id: 'target-1',
          name: 'Anna',
          email: 'anna@x.com',
          role: 'employee',
          organizationId: 'org-1',
        };
      return null;
    });
    const ctx = makeCtx({
      impersonationSessions: [{ _id: 'old-1', superadminId: superadmin._id, isActive: true }],
    });
    const result = await impersonation.startImpersonation.handler(ctx, {
      targetUserId: 'target-1',
      reason: 'Support',
    });
    expect(result.sessionId).toBe('inserted-1');
    expect(result.token).toContain('imp_');
    expect(mockPatch).toHaveBeenCalledWith('old-1', expect.objectContaining({ isActive: false }));
    expect(mockInsert).toHaveBeenCalledWith(
      'impersonationSessions',
      expect.objectContaining({ targetUserId: 'target-1', reason: 'Support' }),
    );
    expect(mockInsert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'IMPERSONATE_USER' }),
    );
    expect(mockNotify).toHaveBeenCalled();
  });

  it('startImpersonation rejects non-superadmins and invalid targets', async () => {
    mockRequireAuth.mockResolvedValue(admin);
    await expect(
      impersonation.startImpersonation.handler(makeCtx(), { targetUserId: 't', reason: 'x' }),
    ).rejects.toThrow('Only superadmin');

    mockRequireAuth.mockResolvedValue(superadmin);
    mockGet.mockResolvedValueOnce(null);
    await expect(
      impersonation.startImpersonation.handler(makeCtx(), { targetUserId: 't', reason: 'x' }),
    ).rejects.toThrow('Target user not found');

    mockGet.mockResolvedValueOnce({ _id: 't', role: 'superadmin', organizationId: 'org-1' });
    await expect(
      impersonation.startImpersonation.handler(makeCtx(), { targetUserId: 't', reason: 'x' }),
    ).rejects.toThrow('not allowed');
  });

  it('endImpersonation patches the session and logs it', async () => {
    mockGet.mockResolvedValue({
      _id: 's1',
      superadminId: superadmin._id,
      targetUserId: 't1',
      organizationId: 'org-1',
      startedAt: Date.now() - 1000,
    });
    const result = await impersonation.endImpersonation.handler(makeCtx(), { sessionId: 's1' });
    expect(result.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith('s1', expect.objectContaining({ isActive: false }));
    expect(mockInsert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'END_IMPERSONATION' }),
    );
  });

  it('endImpersonation rejects unauthorized callers and missing sessions', async () => {
    mockGet.mockResolvedValueOnce({ _id: 's1', superadminId: 'someone-else' });
    await expect(
      impersonation.endImpersonation.handler(makeCtx(), { sessionId: 's1' }),
    ).rejects.toThrow('Unauthorized');

    mockGet.mockResolvedValueOnce(null);
    await expect(
      impersonation.endImpersonation.handler(makeCtx(), { sessionId: 's1' }),
    ).rejects.toThrow('Session not found');
  });

  it('getActiveImpersonation returns the live session or null', async () => {
    mockGet.mockImplementation(async (id: string) => {
      if (id === 'target-1') return { _id: 'target-1', name: 'Anna', email: 'anna@x.com' };
      return { _id: superadmin._id, name: 'Root', email: 'root@x.com' };
    });
    const ctx = makeCtx({
      impersonationSessions: [
        {
          _id: 's1',
          superadminId: superadmin._id,
          targetUserId: 'target-1',
          reason: 'R',
          startedAt: 1,
          expiresAt: Date.now() + 1000,
          isActive: true,
        },
      ],
    });
    const active = await impersonation.getActiveImpersonation.handler(ctx, {});
    expect(active.sessionId).toBe('s1');
    expect(active.targetUser.name).toBe('Anna');

    const empty = await impersonation.getActiveImpersonation.handler(makeCtx(), {});
    expect(empty).toBeNull();
  });

  it('getImpersonationHistory enriches sessions', async () => {
    mockGet.mockImplementation(async (id: string) => {
      if (id === 'target-1') return { _id: 'target-1', name: 'Anna', email: 'anna@x.com' };
      if (id === 'org-1') return { _id: 'org-1', name: 'ACME' };
      return { _id: superadmin._id, name: 'Root', email: 'root@x.com' };
    });
    const ctx = makeCtx({
      impersonationSessions: [
        {
          _id: 's1',
          superadminId: superadmin._id,
          targetUserId: 'target-1',
          organizationId: 'org-1',
          startedAt: 100,
          endedAt: 200,
        },
      ],
    });
    const result = await impersonation.getImpersonationHistory.handler(ctx, {});
    expect(result).toHaveLength(1);
    expect(result[0].targetUserName).toBe('Anna');
    expect(result[0].organizationName).toBe('ACME');
    expect(result[0].duration).toBe(100);
  });

  it('activateImpersonationSession validates token and patches the target', async () => {
    mockGet.mockImplementation(async (id: string) => {
      if (id === 's1')
        return {
          _id: 's1',
          isActive: true,
          token: 'tok',
          superadminId: superadmin._id,
          targetUserId: 'target-1',
          expiresAt: Date.now() + 1000,
        };
      if (id === 'target-1')
        return {
          _id: 'target-1',
          name: 'Anna',
          email: 'anna@x.com',
          role: 'employee',
          organizationId: 'org-1',
        };
      if (id === 'org-1') return { _id: 'org-1', name: 'ACME', slug: 'acme' };
      return {
        _id: superadmin._id,
        name: 'Root',
        email: 'root@x.com',
        role: 'superadmin',
        organizationId: 'org-1',
      };
    });
    const result = await impersonation.activateImpersonationSession.handler(makeCtx(), {
      sessionId: 's1',
      token: 'tok',
      superadminId: superadmin._id,
      targetSessionToken: 'target-token',
      targetSessionExpiry: Date.now() + 1000,
    });
    expect(result.targetUser.name).toBe('Anna');
    expect(mockPatch).toHaveBeenCalledWith(
      'target-1',
      expect.objectContaining({ sessionToken: 'target-token' }),
    );
  });

  it('activateImpersonationSession rejects bad tokens and expired sessions', async () => {
    mockGet.mockResolvedValueOnce({
      _id: 's1',
      isActive: true,
      token: 'other',
      superadminId: superadmin._id,
      targetUserId: 't',
    });
    await expect(
      impersonation.activateImpersonationSession.handler(makeCtx(), {
        sessionId: 's1',
        token: 'tok',
        superadminId: superadmin._id,
        targetSessionToken: 'x',
        targetSessionExpiry: 1,
      }),
    ).rejects.toThrow('Invalid impersonation token');

    mockGet.mockResolvedValueOnce({
      _id: 's1',
      isActive: true,
      token: 'tok',
      superadminId: superadmin._id,
      targetUserId: 't',
      expiresAt: Date.now() - 1000,
    });
    await expect(
      impersonation.activateImpersonationSession.handler(makeCtx(), {
        sessionId: 's1',
        token: 'tok',
        superadminId: superadmin._id,
        targetSessionToken: 'x',
        targetSessionExpiry: 1,
      }),
    ).rejects.toThrow('expired');
  });

  it('endImpersonationWithToken restores the superadmin session', async () => {
    mockGet.mockImplementation(async (id: string) => {
      if (id === 's1')
        return {
          _id: 's1',
          token: 'tok',
          isActive: true,
          superadminId: superadmin._id,
          targetUserId: 't1',
          organizationId: 'org-1',
          startedAt: 100,
        };
      if (id === 'org-1') return { _id: 'org-1', name: 'ACME', slug: 'acme' };
      return {
        _id: superadmin._id,
        name: 'Root',
        email: 'root@x.com',
        role: 'superadmin',
        organizationId: 'org-1',
      };
    });
    const result = await impersonation.endImpersonationWithToken.handler(makeCtx(), {
      sessionId: 's1',
      token: 'tok',
      restoredSessionToken: 'fresh-token',
      restoredSessionExpiry: Date.now() + 1000,
    });
    expect(result.superadmin.id).toBe(superadmin._id);
    expect(mockPatch).toHaveBeenCalledWith(
      superadmin._id,
      expect.objectContaining({ sessionToken: 'fresh-token' }),
    );
  });
});

// ── Access tokens ────────────────────────────────────────────────────────────

describe('access tokens', () => {
  it('generateAccessToken creates a temp user and token', async () => {
    mockGet.mockResolvedValue(null);
    const result = await accessTokens.generateAccessToken.handler(makeCtx(), {
      name: 'Auditor',
      email: 'AUDITOR@x.com ',
      reason: 'Audit',
      durationMs: 3600000,
    });
    expect(result.email).toBe('auditor@x.com');
    expect(result.password).toBeTruthy();
    expect(mockInsert).toHaveBeenCalledWith(
      'users',
      expect.objectContaining({ role: 'superadmin', isActive: true }),
    );
    expect(mockInsert).toHaveBeenCalledWith(
      'superadminAccessTokens',
      expect.objectContaining({ email: 'auditor@x.com' }),
    );
    expect(mockInsert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'GENERATE_SUPERADMIN_TOKEN' }),
    );
  });

  it('generateAccessToken recycles a stale user and rejects non-superadmins', async () => {
    mockGet.mockResolvedValue(null);
    const ctx = makeCtx({
      users: [{ _id: 'stale-1', email: 'a@x.com' }],
      superadminAccessTokens: [{ _id: 'tok-1', tempUserId: 'stale-1' }],
    });
    const result = await accessTokens.generateAccessToken.handler(ctx, {
      name: 'A',
      email: 'a@x.com',
      reason: 'R',
      durationMs: 1000,
    });
    expect(mockDelete).toHaveBeenCalledWith('tok-1');
    expect(mockDelete).toHaveBeenCalledWith('stale-1');

    mockRequireAuth.mockResolvedValue(admin);
    await expect(
      accessTokens.generateAccessToken.handler(makeCtx(), {
        name: 'A',
        email: 'a@x.com',
        reason: 'R',
        durationMs: 1000,
      }),
    ).rejects.toThrow('Only superadmins');
  });

  it('revokeAccessToken deletes the temp user and logs it', async () => {
    mockGet.mockResolvedValue({
      _id: 'tok-1',
      tempUserId: 'temp-1',
      email: 'temp@x.com',
      name: 'Temp',
      isRevoked: false,
    });
    const result = await accessTokens.revokeAccessToken.handler(makeCtx(), { tokenId: 'tok-1' });
    expect(result.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith('temp-1');
    expect(mockDelete).toHaveBeenCalledWith('tok-1');
    expect(mockInsert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'REVOKE_SUPERADMIN_TOKEN' }),
    );
  });

  it('revokeAccessToken rejects already-revoked tokens', async () => {
    mockGet.mockResolvedValueOnce({ _id: 'tok-1', tempUserId: 'temp-1', isRevoked: true });
    await expect(
      accessTokens.revokeAccessToken.handler(makeCtx(), { tokenId: 'tok-1' }),
    ).rejects.toThrow('already revoked');
  });

  it('listAccessTokens enriches with status', async () => {
    mockGet.mockResolvedValue({ _id: 'temp-1', isActive: true });
    const ctx = makeCtx({
      superadminAccessTokens: [
        {
          _id: 'tok-1',
          createdBy: superadmin._id,
          tempUserId: 'temp-1',
          isRevoked: false,
          expiresAt: Date.now() + 1000,
        },
        {
          _id: 'tok-2',
          createdBy: superadmin._id,
          tempUserId: 'temp-2',
          isRevoked: true,
          expiresAt: Date.now() + 1000,
        },
      ],
    });
    const result = await accessTokens.listAccessTokens.handler(ctx, {});
    expect(result).toHaveLength(2);
    expect(result[0].status).toBe('active');
    expect(result[1].status).toBe('revoked');
  });

  it('checkTempAccessStillValid blocks expired tokens and passes for regular users', async () => {
    const expiredCtx = makeCtx({
      superadminAccessTokens: [
        { _id: 'tok-1', tempUserId: 'temp-1', isRevoked: false, expiresAt: Date.now() - 1000 },
      ],
    });
    const invalid = await accessTokens.checkTempAccessStillValid(expiredCtx as any, 'temp-1');
    expect(invalid.valid).toBe(false);
    expect(invalid.reason).toContain('expired');

    const valid = await accessTokens.checkTempAccessStillValid(makeCtx() as any, 'normal-user');
    expect(valid.valid).toBe(true);
  });
});

// ── Emergency dashboard ──────────────────────────────────────────────────────

describe('emergency dashboard', () => {
  it('getEmergencyDashboard aggregates critical signals', async () => {
    const now = Date.now();
    mockGet.mockImplementation(async (id: string) => {
      if (id === 'u1') return { _id: 'u1', name: 'Anna' };
      if (id === 'org-1') return { _id: 'org-1', name: 'ACME' };
      return null;
    });
    const ctx = makeCtx({
      supportTickets: [
        {
          _id: 't1',
          priority: 'critical',
          status: 'open',
          createdAt: now - 60000,
          createdBy: 'u1',
          organizationId: 'org-1',
        },
      ],
      emergencyIncidents: [
        {
          _id: 'i1',
          status: 'investigating',
          createdAt: now - 60000,
          startedAt: now - 60000,
          createdBy: 'u1',
        },
      ],
      slaMetrics: [
        ...Array.from({ length: 11 }, (_, i) => ({
          _id: `sla-${i}`,
          status: 'breached',
          createdAt: now - 60000,
        })),
      ],
      loginAttempts: [
        ...Array.from({ length: 5 }, (_, i) => ({
          _id: `la-${i}`,
          success: false,
          ip: '10.0.0.1',
          userId: 'u1',
          createdAt: now - 60000,
        })),
      ],
      maintenanceMode: [{ _id: 'm1', isActive: true }],
      organizationRequests: [{ _id: 'r1', status: 'pending' }],
    });
    const result = await emergency.getEmergencyDashboard.handler(ctx, {});
    expect(result.criticalTickets).toHaveLength(1);
    expect(result.criticalTickets[0].creatorName).toBe('Anna');
    expect(result.activeIncidents).toHaveLength(1);
    expect(result.slaBreaches).toBe(11);
    expect(result.suspiciousIPs).toHaveLength(1);
    expect(result.suspiciousIPs[0].ip).toBe('10.0.0.1');
    expect(result.maintenanceModeOrgs).toBe(1);
    expect(result.pendingOrgRequests).toBe(1);
    expect(result.priorityLevel).toBe('critical');
    expect(result.requiresAttention).toBe(true);
  });

  it('getEmergencyDashboard is calm when nothing is wrong', async () => {
    const result = await emergency.getEmergencyDashboard.handler(makeCtx(), {});
    expect(result.priorityLevel).toBe('low');
    expect(result.requiresAttention).toBe(false);
    expect(result.issues).toEqual([]);
  });

  it('createIncident inserts and notifies every superadmin', async () => {
    const ctx = makeCtx({
      users: [
        { _id: 'su-1', role: 'superadmin' },
        { _id: 'su-2', role: 'superadmin' },
      ],
    });
    const incidentId = await emergency.createIncident.handler(ctx, {
      createdBy: superadmin._id,
      title: 'DB down',
      description: 'Everything is on fire',
      severity: 'critical',
      affectedUsers: 100,
      affectedOrgs: 3,
    });
    expect(incidentId).toBe('inserted-1');
    expect(mockNotify).toHaveBeenCalledTimes(2);
  });

  it('updateIncidentStatus patches resolved incidents with a resolvedAt', async () => {
    await emergency.updateIncidentStatus.handler(makeCtx(), {
      incidentId: 'i1',
      status: 'resolved',
      userId: superadmin._id,
      resolution: 'Fixed',
    });
    expect(mockPatch).toHaveBeenCalledWith(
      'i1',
      expect.objectContaining({
        status: 'resolved',
        resolution: 'Fixed',
        resolvedAt: expect.any(Number),
      }),
    );
  });
});

// ── Search ───────────────────────────────────────────────────────────────────

describe('search', () => {
  it('globalSearch returns empty for short queries', async () => {
    const result = await search.globalSearch.handler(makeCtx(), { query: 'a' });
    expect(result.total).toBe(0);
  });

  it('globalSearch enriches users, orgs and related docs', async () => {
    mockGet.mockImplementation(async (id: string) => {
      if (id === 'u1') return { _id: 'u1', name: 'Anna', email: 'anna@x.com' };
      if (id === 'u2') return { _id: 'u2', name: 'Bob', email: 'bob@x.com' };
      if (id === 'drv-1') return { _id: 'drv-1', userId: 'u2' };
      return null;
    });
    const ctx = makeCtx({
      users: [{ _id: 'u1', name: 'Anna', email: 'anna@x.com', organizationId: 'org-1' }],
      organizations: [{ _id: 'org-1', name: 'ACME Ann', slug: 'ann-corp', plan: 'pro' }],
      leaveRequests: [
        {
          _id: 'l1',
          userId: 'u1',
          type: 'vacation',
          status: 'pending',
          startDate: 'ann-01',
          endDate: 'ann-05',
          createdAt: 1,
        },
      ],
      driverRequests: [
        {
          _id: 'd1',
          requesterId: 'u1',
          driverId: 'drv-1',
          tripInfo: { from: 'Ann Home', to: 'Airport', purpose: 'Flight' },
          startTime: 1,
        },
      ],
      tasks: [
        {
          _id: 't1',
          title: 'Fix ann bug',
          description: 'something',
          assignedTo: 'u1',
          assignedBy: 'u1',
          status: 'open',
          priority: 'high',
          createdAt: 1,
        },
      ],
      supportTickets: [
        {
          _id: 'tk1',
          title: 'Ann help',
          description: 'please',
          ticketNumber: 'TK-ANN-1',
          createdBy: 'u1',
          assignedTo: 'u1',
          createdAt: 1,
        },
      ],
    });
    const result = await search.globalSearch.handler(ctx, { query: 'ann' });
    expect(result.users).toHaveLength(1);
    expect(result.organizations[0].name).toBe('ACME Ann');
    expect(result.leaveRequests[0].userName).toBe('Anna');
    expect(result.driverRequests[0].driverName).toBe('Bob');
    expect(result.tasks[0].assigneeName).toBe('Anna');
    expect(result.supportTickets[0].creatorName).toBe('Anna');
    expect(result.total).toBeGreaterThan(0);
  });

  it('quickSearch delegates to globalSearch and reshapes results', async () => {
    mockRunQuery.mockResolvedValue({
      users: [{ _id: 'u1', name: 'Anna', email: 'anna@x.com', organizationId: 'org-1' }],
      organizations: [{ _id: 'org-1', name: 'ACME', slug: 'acme', plan: 'pro' }],
      leaveRequests: [
        {
          _id: 'l1',
          userName: 'Anna',
          type: 'vacation',
          startDate: 'a',
          endDate: 'b',
          status: 'pending',
        },
      ],
      tasks: [{ _id: 't1', title: 'Task', status: 'open', priority: 'high' }],
      supportTickets: [{ _id: 'tk1', ticketNumber: 'TK-1', title: 'Help' }],
    });
    const result = await search.quickSearch.handler(makeCtx(), { query: 'ann' });
    expect(result.users[0].type).toBe('user');
    expect(result.organizations[0].type).toBe('organization');
    expect(result.tasks[0].type).toBe('task');
    expect(result.tickets[0].type).toBe('ticket');
  });

  it('searchUsersByPrefix filters by org and globally', async () => {
    const ctx = makeCtx({
      users: [
        { _id: 'u1', name: 'Anna', email: 'anna@x.com', role: 'employee', organizationId: 'org-1' },
        { _id: 'u2', name: 'Bob', email: 'bob@x.com', role: 'employee', organizationId: 'org-2' },
      ],
    });
    const scoped = await search.searchUsersByPrefix.handler(ctx, {
      prefix: 'ann',
      organizationId: 'org-1' as any,
    });
    expect(scoped).toHaveLength(1);
    expect(scoped[0].name).toBe('Anna');

    const global = await search.searchUsersByPrefix.handler(ctx, { prefix: 'bob' });
    expect(global).toHaveLength(1);
    expect(global[0].email).toBe('bob@x.com');
  });
});

// ── User 360 ────────────────────────────────────────────────────────────────

describe('user360', () => {
  it('getUser360 assembles a complete profile with stats', async () => {
    const now = Date.now();
    mockGet.mockImplementation(async (id: string) => {
      if (id === 'target-1')
        return {
          _id: 'target-1',
          name: 'Anna',
          email: 'anna@x.com',
          role: 'employee',
          organizationId: 'org-1',
        };
      if (id === 'org-1') return { _id: 'org-1', name: 'ACME' };
      if (id === 'rev-1') return { _id: 'rev-1', name: 'Reviewer' };
      if (id === 'cre-1') return { _id: 'cre-1', name: 'Creator' };
      if (id === 'drv-1') return { _id: 'drv-1', userId: 'u-driver' };
      if (id === 'u-driver') return { _id: 'u-driver', name: 'Driver', phone: '+1' };
      return null;
    });
    mockGetProfile.mockResolvedValue({ phone: '+7' });
    const ctx = makeCtx({
      leaveRequests: [
        { _id: 'l1', userId: 'target-1', status: 'pending', reviewedBy: 'rev-1', createdAt: 1 },
        { _id: 'l2', userId: 'target-1', status: 'approved', createdAt: 2 },
      ],
      tasks: [
        {
          _id: 't1',
          assignedTo: 'target-1',
          assignedBy: 'cre-1',
          status: 'completed',
          createdAt: 1,
        },
      ],
      driverRequests: [{ _id: 'd1', requesterId: 'target-1', driverId: 'drv-1', startTime: 1 }],
      notifications: [{ _id: 'n1', userId: 'target-1' }],
      loginAttempts: [
        { _id: 'la1', userId: 'target-1', success: true },
        { _id: 'la2', userId: 'target-1', success: false },
      ],
      supportTickets: [
        { _id: 'tk1', createdBy: 'target-1', status: 'open', createdAt: 1 },
        { _id: 'tk2', createdBy: 'target-1', status: 'resolved', createdAt: 2 },
      ],
      ticketComments: [{ _id: 'tc1', authorId: 'target-1', createdAt: 1 }],
      chatMessages: [{ _id: 'cm1', senderId: 'target-1', createdAt: 1 }],
    });
    const result = await user360.getUser360.handler(ctx, { userId: 'target-1' });
    expect(result.user.name).toBe('Anna');
    expect(result.organization.name).toBe('ACME');
    expect(result.stats.pendingLeaves).toBe(1);
    expect(result.stats.approvedLeaves).toBe(1);
    expect(result.stats.completedTasks).toBe(1);
    expect(result.stats.openTickets).toBe(1);
    expect(result.stats.failedLoginAttempts).toBe(1);
    expect(result.leaves.find((l: any) => l._id === 'l1').reviewerName).toBe('Reviewer');
    expect(result.tasks[0].creatorName).toBe('Creator');
    expect(result.driverRequests[0].driverName).toBe('Driver');
    expect(result.driverRequests[0].driverPhone).toBe('+7');
  });

  it('getUser360 throws for missing users', async () => {
    mockGet.mockResolvedValueOnce(null);
    await expect(user360.getUser360.handler(makeCtx(), { userId: 'nope' })).rejects.toThrow(
      'User not found',
    );
  });
});
