/**
 * Tests for the superadmin console backend — convex/superadmin/sessions.ts and
 * convex/superadmin/dbAdmin.ts.
 *
 * What's worth pinning down:
 *   - Only superadmins reach any of it (RBAC gate).
 *   - listActiveSessions only reports unexpired tokens and never leaks the
 *     token value itself.
 *   - revokeSession clears the token and records an audit entry.
 *   - The Data Browser refuses writes to hidden/protected tables and logs
 *     every write to adminDbChanges.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/limits', () => ({
  DEFAULT_LIST_CAP: 50,
  SMALL_LIST_CAP: 10,
}));

let sessions: any;
let dbAdmin: any;
let hub: any;
let featureToggles: any;
let terminal: any;
let mockGetAuthCaller: jest.Mock;
let mockGet: jest.Mock;
let mockInsert: jest.Mock;
let mockPatch: jest.Mock;
let mockDelete: jest.Mock;

const ORG_A = 'org-aaa' as any;

const superadmin = {
  _id: 'user-super',
  name: 'Root',
  email: 'root@x.com',
  role: 'superadmin',
  organizationId: undefined,
};
const admin = {
  _id: 'user-admin',
  name: 'Admin',
  email: 'a@a.com',
  role: 'admin',
  organizationId: ORG_A,
};

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
        if (typeof cb === 'function') {
          const q: any = {
            field: (name: string) => name,
            eq: (field: string, value: unknown) => (eqs.push([field, value]), q),
            and: (...qs: unknown[]) => q,
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
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockGet = jest.fn();
    mockInsert = jest.fn(async () => 'inserted-1');
    mockPatch = jest.fn(async () => undefined);
    mockDelete = jest.fn(async () => undefined);

    sessions = require('../../convex/superadmin/sessions');
    dbAdmin = require('../../convex/superadmin/dbAdmin');
    hub = require('../../convex/superadmin/hub');
    featureToggles = require('../../convex/superadmin/featureToggles');
    terminal = require('../../convex/superadmin/terminal');
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller.mockResolvedValue(superadmin);
});

// ── Feature toggles ──────────────────────────────────────────────────────────

describe('feature toggles', () => {
  it('returns built-in defaults when nothing is overridden', async () => {
    const result = await featureToggles.listFeatureToggles.handler(makeCtx({}), {});
    expect(result.length).toBeGreaterThan(0);
    const ai = result.find((f: { key: string }) => f.key === 'ai.assistant');
    expect(ai.enabled).toBe(true);
    expect(ai.isOverridden).toBe(false);
  });

  it('refuses non-superadmins', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    await expect(featureToggles.listFeatureToggles.handler(makeCtx(), {})).rejects.toThrow(
      'Only superadmins',
    );
  });

  it('setFeatureToggle records a global row', async () => {
    const result = await featureToggles.setFeatureToggle.handler(makeCtx(), {
      key: 'ai.assistant',
      enabled: false,
    });
    expect(result.success).toBe(true);
    expect(mockInsert).toHaveBeenCalledWith(
      'featureToggles',
      expect.objectContaining({ key: 'ai.assistant', enabled: false, updatedBy: superadmin._id }),
    );
  });

  it('getMyFeatureFlags keeps a superadmin un-gated even when their own org is toggled off', async () => {
    // The superadmin's user record belongs to a tenant that has the feature
    // disabled via override — their console must stay fully usable.
    mockGetAuthCaller.mockResolvedValue({ ...superadmin, organizationId: 'org-adb-armm' });
    const ctx = makeCtx({
      featureToggles: [
        {
          _id: 'toggle-1',
          key: 'chat.realtime',
          enabled: false,
          organizationId: 'org-adb-armm',
          updatedAt: Date.now(),
        },
      ],
    });

    const flags = await featureToggles.getMyFeatureFlags.handler(ctx, {});
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.every((f: { enabled: boolean }) => f.enabled)).toBe(true);
  });

  it('getMyFeatureFlags applies tenant overrides to non-superadmin callers', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...admin, organizationId: 'org-adb-armm' });
    const ctx = makeCtx({
      featureToggles: [
        {
          _id: 'toggle-1',
          key: 'chat.realtime',
          enabled: false,
          organizationId: 'org-adb-armm',
          updatedAt: Date.now(),
        },
      ],
    });

    const flags = await featureToggles.getMyFeatureFlags.handler(ctx, {});
    const chat = flags.find((f: { key: string }) => f.key === 'chat.realtime');
    expect(chat.enabled).toBe(false);
  });
});

// ── Hub health ───────────────────────────────────────────────────────────────

describe('platform health', () => {
  it('aggregates counts across tables', async () => {
    const result = await hub.getPlatformHealth.handler(
      makeCtx({
        organizations: [{ _id: 'org-1' }, { _id: 'org-2' }],
        users: [
          {
            _id: 'u1',
            organizationId: 'org-1',
            sessionToken: 't1',
            sessionExpiry: Date.now() + 1000,
            isActive: true,
          },
          { _id: 'u2', organizationId: 'org-2', sessionToken: undefined, isActive: true },
        ],
        subscriptions: [
          { _id: 's1', status: 'active', cancelAtPeriodEnd: false, createdAt: 1, updatedAt: 1 },
          {
            _id: 's2',
            status: 'trialing',
            trialEnd: Date.now() + 1000 * 60 * 60 * 24 * 2,
            cancelAtPeriodEnd: false,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        leaveRequests: [{ _id: 'l1', status: 'pending' }],
      }),
      {},
    );
    expect(result.organizations).toBe(2);
    expect(result.users).toBe(2);
    expect(result.sessions).toBe(1);
    expect(result.expiringTrials).toBe(1);
    expect(result.pendingLeaves).toBe(1);
  });

  it('counts past-due subscriptions, incidents and open tickets', async () => {
    const result = await hub.getPlatformHealth.handler(
      makeCtx({
        organizations: [{ _id: 'org-1' }],
        users: [{ _id: 'u1', organizationId: 'org-1' }],
        subscriptions: [
          { _id: 's1', status: 'past_due' },
          // Trial that ended long ago — not expiring, not active.
          { _id: 's2', status: 'trialing', trialEnd: Date.now() - 10 },
        ],
        emergencyIncidents: [{ _id: 'i1', status: 'investigating' }],
        supportTickets: [{ _id: 't1', status: 'open' }],
      }),
      {},
    );
    expect(result.pastDueSubscriptions).toBe(1);
    expect(result.activeIncidents).toBe(1);
    expect(result.openTickets).toBe(1);
    expect(result.expiringTrials).toBe(0);
  });
});

// ── Hub live activity + analytics ────────────────────────────────────────────

describe('hub live activity', () => {
  it('enriches audit logs with user and org names', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const now = Date.now();
    const ctx = makeCtx({
      auditLogs: [
        {
          _id: 'log-1',
          userId: 'u1',
          organizationId: 'org-1',
          action: 'user.updated',
          details: '{"updatedFields":["name"]}',
          createdAt: now,
        },
        {
          _id: 'log-2',
          userId: 'missing-user',
          organizationId: undefined,
          action: 'auth.login',
          createdAt: now,
        },
      ],
    });
    mockGet.mockImplementation(async (id: string) => {
      if (id === 'u1') return { _id: 'u1', name: 'Anna', email: 'anna@x.com' };
      if (id === 'org-1') return { _id: 'org-1', name: 'ACME' };
      return null;
    });

    const result = await hub.getLiveActivity.handler(ctx, { limit: 10 });
    expect(result).toHaveLength(2);
    expect(result[0]?.userName).toBe('Anna');
    expect(result[0]?.userEmail).toBe('anna@x.com');
    expect(result[0]?.organizationName).toBe('ACME');
    expect(result[1]?.userName).toBe('Unknown');
    expect(result[1]?.organizationName).toBeUndefined();
  });
});

describe('platform analytics', () => {
  it('computes growth, adoption and size distribution', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    const ctx = makeCtx({
      organizations: [
        { _id: 'org-1', _creationTime: hourAgo },
        { _id: 'org-2', _creationTime: hourAgo },
      ],
      users: [
        { _id: 'u1', organizationId: 'org-1', _creationTime: hourAgo },
        { _id: 'u2', organizationId: 'org-1', _creationTime: now - 2 * 24 * 60 * 60 * 1000 },
        // 11 users in org-2 pushes it into the "medium" bucket (>10, <=50).
        ...Array.from({ length: 11 }, (_, i) => ({
          _id: `u3-${i}`,
          organizationId: 'org-2',
          _creationTime: now - 3 * 24 * 60 * 60 * 1000,
        })),
      ],
      tasks: [{ _id: 't1', organizationId: 'org-1', _creationTime: hourAgo }],
      leaveRequests: [{ _id: 'l1', organizationId: 'org-1', _creationTime: hourAgo }],
      chatConversations: [{ _id: 'c1', organizationId: 'org-2', _creationTime: hourAgo }],
    });

    const result = await hub.getPlatformAnalytics.handler(ctx, {});
    expect(result.growth.orgsLast30d).toBe(2);
    expect(result.growth.usersLast30d).toBe(13);
    expect(result.adoption.tasksPct).toBe(50); // org-1 of {org-1, org-2}
    expect(result.adoption.leavesOrgs).toBe(1);
    expect(result.adoption.chatOrgs).toBe(1);
    expect(result.sizeDistribution.medium).toBe(1); // org-2 has 11 users
    expect(result.sizeDistribution.small).toBe(1); // org-1 has 2 users
    expect(result.engagement.tasksLast7d).toBe(1);
  });

  it('returns zero adoption when there are no orgs', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const result = await hub.getPlatformAnalytics.handler(
      makeCtx({ organizations: [], users: [] }),
      {},
    );
    expect(result.adoption.tasksPct).toBe(0);
    expect(result.growth.orgsLast30d).toBe(0);
  });
});

// ── RBAC ─────────────────────────────────────────────────────────────────────

describe('superadmin console RBAC', () => {
  it('rejects non-superadmins from listing sessions', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    await expect(sessions.listActiveSessions.handler(makeCtx(), {})).rejects.toThrow(
      'Only superadmins',
    );
  });

  it('rejects non-superadmins from the data browser', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    await expect(dbAdmin.listTables.handler(makeCtx(), {})).rejects.toThrow('Only superadmins');
  });
});

// ── Sessions ─────────────────────────────────────────────────────────────────

describe('listActiveSessions', () => {
  const NOW = Date.now();

  it('reports only unexpired tokens and never leaks the token itself', async () => {
    const active = {
      _id: 'user-1',
      name: 'Anna',
      email: 'anna@x.com',
      role: 'employee',
      organizationId: ORG_A,
      sessionToken: 'secret-token-abc',
      sessionExpiry: NOW + 1000 * 60 * 60,
    };
    const expired = {
      _id: 'user-2',
      name: 'Bob',
      email: 'bob@x.com',
      role: 'employee',
      organizationId: ORG_A,
      sessionToken: 'old-token',
      sessionExpiry: NOW - 1000,
    };

    mockGet.mockResolvedValue({ _id: ORG_A, name: 'Org A' });

    const result = await sessions.listActiveSessions.handler(
      makeCtx({ users: [active, expired] }),
      {},
    );

    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('user-1');
    expect(result[0].name).toBe('Anna');
    expect(result[0].organizationName).toBe('Org A');
    expect(result[0]).not.toHaveProperty('sessionToken');
  });

  it('returns an empty list when nobody is logged in', async () => {
    const result = await sessions.listActiveSessions.handler(
      makeCtx({ users: [{ _id: 'user-1', sessionExpiry: undefined }] }),
      {},
    );
    expect(result).toHaveLength(0);
  });
});

describe('revokeSession', () => {
  it('clears the token and records an audit entry', async () => {
    mockGet.mockResolvedValue({
      _id: 'user-1',
      name: 'Anna',
      email: 'anna@x.com',
      organizationId: ORG_A,
      sessionToken: 'secret',
      sessionExpiry: Date.now() + 1000,
    });

    const result = await sessions.revokeSession.handler(makeCtx(), {
      userId: 'user-1',
    });

    expect(result.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith('user-1', {
      sessionToken: undefined,
      sessionExpiry: undefined,
    });
    expect(mockInsert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({
        action: 'superadmin.session.revoke',
        userId: superadmin._id,
      }),
    );
  });

  it('is a no-op when the user has no session', async () => {
    mockGet.mockResolvedValue({ _id: 'user-1', name: 'Anna', sessionToken: undefined });
    const result = await sessions.revokeSession.handler(makeCtx(), { userId: 'user-1' });
    expect(result.alreadyLoggedOut).toBe(true);
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

describe('table info', () => {
  it('reports row count and observed columns', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const result = await dbAdmin.getTableInfo.handler(
      makeCtx({
        users: [
          { _id: 'u1', name: 'A', email: 'a@x.com', organizationId: ORG_A, _creationTime: 1 },
          { _id: 'u2', name: 'B', email: 'b@x.com', organizationId: ORG_A, _creationTime: 1 },
        ],
      }),
      { tableName: 'users' },
    );
    expect(result.count).toBe(2);
    expect(result.columns).toEqual(expect.arrayContaining(['name', 'email']));
    // organizationId → organizations is a recognised relation
    expect(result.related).toEqual(
      expect.arrayContaining([{ field: 'organizationId', table: 'organizations' }]),
    );
  });
});

describe('bulk delete', () => {
  it('deletes several rows and logs each one', async () => {
    mockGet
      .mockResolvedValueOnce({ _id: 'u1', name: 'A', _creationTime: 1 })
      .mockResolvedValueOnce({ _id: 'u2', name: 'B', _creationTime: 1 })
      .mockResolvedValueOnce(null); // third id does not exist

    const result = await dbAdmin.bulkDeleteDbRows.handler(makeCtx(), {
      tableName: 'users',
      docIds: ['u1', 'u2', 'missing'],
    });

    expect(result.deleted).toBe(2);
    expect(mockDelete).toHaveBeenCalledTimes(2);
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockInsert).toHaveBeenCalledWith(
      'adminDbChanges',
      expect.objectContaining({ action: 'delete', docId: 'u1' }),
    );
  });
});

describe('duplicate row', () => {
  it('re-inserts the row without system fields and logs an insert', async () => {
    mockGet.mockResolvedValueOnce({
      _id: 'u1',
      _creationTime: 1,
      name: 'A',
      email: 'a@x.com',
    });

    const result = await dbAdmin.duplicateDbRow.handler(makeCtx(), {
      tableName: 'users',
      docId: 'u1',
    });

    expect(result.success).toBe(true);
    const inserted = mockInsert.mock.calls[0][1] as Record<string, unknown>;
    expect(inserted.name).toBe('A');
    expect(inserted).not.toHaveProperty('_id');
    expect(inserted).not.toHaveProperty('_creationTime');
    expect(mockInsert).toHaveBeenCalledWith(
      'adminDbChanges',
      expect.objectContaining({ action: 'insert' }),
    );
  });
});

describe('revokeAllSessions', () => {
  it('revokes every active session and logs the sweep', async () => {
    const NOW = Date.now();
    mockGetAuthCaller.mockResolvedValue(superadmin);

    const result = await sessions.revokeAllSessions.handler(
      makeCtx({
        users: [
          {
            _id: 'u1',
            sessionToken: 'a',
            sessionExpiry: NOW + 1000,
          },
          {
            _id: 'u2',
            sessionToken: 'b',
            sessionExpiry: NOW - 1000,
          },
        ],
      }),
      {},
    );

    expect(result.revoked).toBe(1);
    expect(mockPatch).toHaveBeenCalledWith('u1', {
      sessionToken: undefined,
      sessionExpiry: undefined,
    });
    expect(mockInsert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'superadmin.session.revoke_all' }),
    );
  });
});

// ── Data Browser ─────────────────────────────────────────────────────────────

describe('Data Browser writes', () => {
  it('refuses writes to protected tables', async () => {
    await expect(
      dbAdmin.patchDbRow.handler(makeCtx(), {
        tableName: 'adminDbChanges',
        docId: 'x',
        patch: { tableName: 'users' },
      }),
    ).rejects.toThrow('protected');
  });

  it('logs a patch with before/after snapshots', async () => {
    mockGet
      .mockResolvedValueOnce({ _id: 'doc-1', name: 'Before', _creationTime: 1 })
      .mockResolvedValueOnce({ _id: 'doc-1', name: 'After', _creationTime: 1 });

    const result = await dbAdmin.patchDbRow.handler(makeCtx(), {
      tableName: 'users',
      docId: 'doc-1',
      patch: { name: 'After' },
    });

    expect(result.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith('doc-1', { name: 'After' });
    expect(mockInsert).toHaveBeenCalledWith(
      'adminDbChanges',
      expect.objectContaining({
        action: 'patch',
        docId: 'doc-1',
        changedBy: superadmin._id,
      }),
    );
    const auditArgs = mockInsert.mock.calls[0][1] as Record<string, string>;
    expect(auditArgs.beforeJson).toContain('Before');
    expect(auditArgs.afterJson).toContain('After');
  });

  it('records a delete so it can be restored', async () => {
    mockGet.mockResolvedValueOnce({ _id: 'doc-1', name: 'Gone', _creationTime: 1 });

    const result = await dbAdmin.deleteDbRow.handler(makeCtx(), {
      tableName: 'users',
      docId: 'doc-1',
    });

    expect(result.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith('doc-1');
    expect(mockInsert).toHaveBeenCalledWith(
      'adminDbChanges',
      expect.objectContaining({ action: 'delete', beforeJson: expect.stringContaining('Gone') }),
    );
  });
});

// ── Data Browser reads ───────────────────────────────────────────────────────

describe('Data Browser reads', () => {
  it('getTableRows returns columns, filtered rows and pagination flags', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const ctx = makeCtx({
      users: [
        { _id: 'u1', name: 'Anna', email: 'anna@x.com', role: 'employee', _creationTime: 1 },
        { _id: 'u2', name: 'Bob', email: 'bob@x.com', role: 'admin', _creationTime: 2 },
      ],
    });

    const all = await dbAdmin.getTableRows.handler(ctx, { tableName: 'users' });
    expect(all.columns).toEqual(expect.arrayContaining(['name', 'email', 'role']));
    expect(all.columns).not.toContain('_id');
    expect(all.rows).toHaveLength(2);
    expect(all.total).toBe(2);
    expect(all.truncated).toBe(false);
    expect(all.rows[0].doc).not.toHaveProperty('_id');

    const filtered = await dbAdmin.getTableRows.handler(ctx, {
      tableName: 'users',
      column: 'role',
      columnValue: 'admin',
    });
    expect(filtered.rows).toHaveLength(1);
    expect(filtered.rows[0].id).toBe('u2');

    const searched = await dbAdmin.getTableRows.handler(ctx, {
      tableName: 'users',
      search: 'anna',
    });
    expect(searched.rows).toHaveLength(1);
    expect(searched.rows[0].id).toBe('u1');
  });

  it('getTableRows rejects unknown tables and honors offset/limit', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    await expect(
      dbAdmin.getTableRows.handler(makeCtx(), { tableName: 'not_a_table' }),
    ).rejects.toThrow('Unknown table');

    const ctx = makeCtx({
      users: [
        { _id: 'u1', name: 'A', _creationTime: 1 },
        { _id: 'u2', name: 'B', _creationTime: 2 },
        { _id: 'u3', name: 'C', _creationTime: 3 },
      ],
    });
    const page = await dbAdmin.getTableRows.handler(ctx, {
      tableName: 'users',
      offset: 1,
      limit: 1,
    });
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].id).toBe('u2');
    expect(page.total).toBe(3);
  });

  it('getRowById returns a stripped doc or null', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    mockGet.mockResolvedValueOnce({ _id: 'u1', name: 'Anna', _creationTime: 1 });
    const found = await dbAdmin.getRowById.handler(makeCtx(), {
      tableName: 'users',
      docId: 'u1',
    });
    expect(found.id).toBe('u1');
    expect(found.doc.name).toBe('Anna');
    expect(found.doc).not.toHaveProperty('_id');

    mockGet.mockResolvedValueOnce(null);
    const missing = await dbAdmin.getRowById.handler(makeCtx(), {
      tableName: 'users',
      docId: 'missing',
    });
    expect(missing).toBeNull();
  });

  it('insertDbRow writes and logs an insert', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const result = await dbAdmin.insertDbRow.handler(makeCtx(), {
      tableName: 'users',
      doc: { name: 'New', email: 'new@x.com' },
    });
    expect(result.success).toBe(true);
    expect(result.docId).toBe('inserted-1');
    expect(mockInsert).toHaveBeenCalledWith(
      'adminDbChanges',
      expect.objectContaining({ action: 'insert', tableName: 'users' }),
    );
  });

  it('listDbHistory filters by table and resolves author names', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    mockGet.mockResolvedValue({ _id: superadmin._id, name: 'Root' });
    const ctx = makeCtx({
      adminDbChanges: [
        { _id: 'c1', tableName: 'users', changedBy: superadmin._id, action: 'patch' },
        { _id: 'c2', tableName: 'users', changedBy: superadmin._id, action: 'delete' },
      ],
    });
    const all = await dbAdmin.listDbHistory.handler(ctx, {});
    expect(all).toHaveLength(2);
    expect(all[0].authorName).toBe('Root');

    const filtered = await dbAdmin.listDbHistory.handler(ctx, { tableName: 'users' });
    expect(filtered).toHaveLength(2);
  });

  it('undoDbChange restores deletes and no-ops already-undone changes', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    mockGet.mockResolvedValueOnce({
      _id: 'c1',
      tableName: 'users',
      docId: 'u1',
      action: 'delete',
      beforeJson: JSON.stringify({ name: 'Anna', email: 'anna@x.com' }),
    });
    const restored = await dbAdmin.undoDbChange.handler(makeCtx(), { changeId: 'c1' });
    expect(restored.success).toBe(true);
    expect(mockInsert).toHaveBeenCalledWith('users', expect.objectContaining({ name: 'Anna' }));
    expect(mockPatch).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ undoneAt: expect.any(Number) }),
    );

    // Already undone → no-op, no write
    mockGet.mockClear();
    mockPatch.mockClear();
    mockGet.mockResolvedValueOnce({
      _id: 'c2',
      tableName: 'users',
      action: 'patch',
      undoneAt: Date.now(),
    });
    const noop = await dbAdmin.undoDbChange.handler(makeCtx(), { changeId: 'c2' });
    expect(noop.alreadyUndone).toBe(true);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('undoDbChange errors for missing changes', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    mockGet.mockResolvedValueOnce(null);
    await expect(dbAdmin.undoDbChange.handler(makeCtx(), { changeId: 'nope' })).rejects.toThrow(
      'Change not found',
    );
  });

  it('exportDatabase redacts secret fields and strips system fields', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const ctx = makeCtx({
      users: [
        {
          _id: 'u1',
          _creationTime: 1,
          name: 'Anna',
          email: 'anna@x.com',
          passwordHash: 'abc123',
          sessionToken: 'tok',
        },
      ],
    });
    const result = await dbAdmin.exportDatabase.handler(ctx, {});
    expect(result.exportedBy).toBe('root@x.com');
    expect(result.tableCount).toBeGreaterThan(0);
    const users = result.tables.users as Array<Record<string, unknown>>;
    expect(users[0].name).toBe('Anna');
    expect(users[0]).not.toHaveProperty('_id');
    expect(users[0]).not.toHaveProperty('passwordHash');
    expect(users[0]).not.toHaveProperty('sessionToken');
  });
});

// ── Feature toggle console ───────────────────────────────────────────────────

describe('feature toggle console', () => {
  it('setFeatureToggle patches an existing global row', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const ctx = makeCtx({
      featureToggles: [{ _id: 'ft-1', key: 'ai.assistant', enabled: true }],
    });
    const result = await featureToggles.setFeatureToggle.handler(ctx, {
      key: 'ai.assistant',
      enabled: false,
    });
    expect(result.success).toBe(true);
    expect(mockPatch).toHaveBeenCalledWith(
      'ft-1',
      expect.objectContaining({ enabled: false, updatedBy: superadmin._id }),
    );
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('listFeatureToggles shows the effective org state when an org is selected', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const ctx = makeCtx({
      featureToggles: [
        { _id: 'ft-1', key: 'chat.realtime', enabled: true, updatedAt: 1 },
        {
          _id: 'ft-2',
          key: 'chat.realtime',
          enabled: false,
          organizationId: 'org-1',
          updatedAt: 2,
        },
      ],
    });
    const global = await featureToggles.listFeatureToggles.handler(ctx, {});
    const chatGlobal = global.find((f: { key: string }) => f.key === 'chat.realtime');
    expect(chatGlobal.enabled).toBe(true);
    expect(chatGlobal.orgOverrideCount).toBe(1);

    const scoped = await featureToggles.listFeatureToggles.handler(ctx, {
      organizationId: 'org-1' as any,
    });
    const chatScoped = scoped.find((f: { key: string }) => f.key === 'chat.realtime');
    expect(chatScoped.enabled).toBe(false);
    expect(chatScoped.isOverridden).toBe(true);
  });

  it('listFeatureOrgOverrides resolves org names', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    mockGet.mockResolvedValue({ _id: 'org-1', name: 'ACME' });
    const ctx = makeCtx({
      featureToggles: [
        {
          _id: 'ft-1',
          key: 'chat.realtime',
          enabled: false,
          organizationId: 'org-1',
          updatedAt: 2,
        },
        { _id: 'ft-2', key: 'chat.realtime', enabled: true },
      ],
    });
    const result = await featureToggles.listFeatureOrgOverrides.handler(ctx, {
      key: 'chat.realtime',
    });
    expect(result).toHaveLength(1);
    expect(result[0].organizationName).toBe('ACME');
    expect(result[0].enabled).toBe(false);
  });

  it('setOrgFeatureOverride inserts a new override and removeOrgFeatureOverride deletes it', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const set = await featureToggles.setOrgFeatureOverride.handler(makeCtx(), {
      key: 'chat.realtime',
      organizationId: 'org-1' as any,
      enabled: false,
    });
    expect(set.success).toBe(true);
    expect(mockInsert).toHaveBeenCalledWith(
      'featureToggles',
      expect.objectContaining({ key: 'chat.realtime', organizationId: 'org-1', enabled: false }),
    );

    const ctx = makeCtx({
      featureToggles: [
        { _id: 'ft-1', key: 'chat.realtime', organizationId: 'org-1', enabled: false },
      ],
    });
    const remove = await featureToggles.removeOrgFeatureOverride.handler(ctx, {
      key: 'chat.realtime',
      organizationId: 'org-1' as any,
    });
    expect(remove.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith('ft-1');
  });

  it('assertFeatureEnabled throws when a module is toggled off for the caller org', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...admin, organizationId: 'org-1' });
    const ctx = makeCtx({
      featureToggles: [
        { _id: 'ft-1', key: 'chat.realtime', enabled: false, organizationId: 'org-1' },
      ],
    });
    await expect(
      featureToggles.assertFeatureEnabled({ ...ctx, auth: {} } as any, 'chat.realtime'),
    ).rejects.toThrow('This feature is disabled');
  });

  it('assertFeatureEnabled passes when the toggle is on', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...admin, organizationId: 'org-1' });
    const ctx = makeCtx({
      featureToggles: [
        { _id: 'ft-1', key: 'chat.realtime', enabled: true, organizationId: 'org-1' },
      ],
    });
    await expect(
      featureToggles.assertFeatureEnabled({ ...ctx, auth: {} } as any, 'chat.realtime'),
    ).resolves.toBeUndefined();
  });

  it('isFeatureEnabledForCaller is soft — disabled module reads as off, no throw', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...admin, organizationId: 'org-1' });
    const ctx = makeCtx({
      featureToggles: [
        { _id: 'ft-1', key: 'chat.realtime', enabled: false, organizationId: 'org-1' },
      ],
    });
    const enabled = await featureToggles.isFeatureEnabledForCaller(
      { ...ctx, auth: {} } as any,
      'chat.realtime',
    );
    expect(enabled).toBe(false);
  });
});

// ── Sessions console ─────────────────────────────────────────────────────────

describe('sessions console', () => {
  it('listActiveSessions filters by org', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    mockGet.mockResolvedValue({ _id: ORG_A, name: 'Org A' });
    const ctx = makeCtx({
      users: [
        {
          _id: 'u1',
          name: 'Anna',
          email: 'anna@x.com',
          role: 'employee',
          organizationId: ORG_A,
          sessionToken: 't',
          sessionExpiry: Date.now() + 1000,
        },
        {
          _id: 'u2',
          name: 'Bob',
          email: 'bob@x.com',
          role: 'employee',
          organizationId: 'org-other',
          sessionToken: 't2',
          sessionExpiry: Date.now() + 1000,
        },
      ],
    });
    const result = await sessions.listActiveSessions.handler(ctx, { orgId: ORG_A });
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('u1');
  });

  it('revokeSession errors when the user is missing', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    mockGet.mockResolvedValueOnce(null);
    await expect(sessions.revokeSession.handler(makeCtx(), { userId: 'nope' })).rejects.toThrow(
      'User not found',
    );
  });

  it('listGlobalAuditLogs enriches entries and filters by action', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    mockGet.mockImplementation(async (id: string) => {
      if (id === 'u1') return { _id: 'u1', name: 'Anna', email: 'anna@x.com' };
      if (id === ORG_A) return { _id: ORG_A, name: 'Org A' };
      return null;
    });
    const ctx = makeCtx({
      auditLogs: [
        {
          _id: 'log-1',
          userId: 'u1',
          organizationId: ORG_A,
          action: 'auth.login',
          createdAt: 1,
        },
        {
          _id: 'log-2',
          userId: 'missing',
          action: 'user.updated',
          createdAt: 2,
        },
      ],
    });
    const all = await sessions.listGlobalAuditLogs.handler(ctx, {});
    expect(all).toHaveLength(2);
    expect(all[0].userName).toBe('Anna');
    expect(all[0].organizationName).toBe('Org A');
    expect(all[1].userName).toBe('Unknown');

    const filtered = await sessions.listGlobalAuditLogs.handler(ctx, { action: 'auth.login' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].action).toBe('auth.login');
  });
});

// ── Terminal command registry ────────────────────────────────────────────────

describe('superadmin terminal', () => {
  it('rejects non-superadmins', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    await expect(terminal.runCommand.handler(makeCtx(), { input: 'health' })).rejects.toThrow(
      'Only superadmins',
    );
  });

  it('help lists commands and is read-only', async () => {
    const result = await terminal.runCommand.handler(makeCtx(), { input: 'help' });
    expect(result.exitCode).toBe(0);
    expect(result.lines.join('\n')).toContain('health');
    expect(result.lines.join('\n')).toContain('toggle');
  });

  it('reports unknown commands with suggestions', async () => {
    const result = await terminal.runCommand.handler(makeCtx(), { input: 'healt' });
    expect(result.exitCode).toBe(1);
    expect(result.lines.join('\n')).toContain('healt');
  });

  it('health returns a snapshot with counts', async () => {
    const ctx = makeCtx({
      organizations: [{ _id: 'org-1', _creationTime: Date.now() }],
      users: [
        { _id: 'u1', email: 'a@a.com', isActive: true, role: 'superadmin' },
        { _id: 'u2', email: 'b@b.com', isActive: true, role: 'employee' },
      ],
      subscriptions: [{ status: 'active' }],
      leaveRequests: [{ status: 'pending' }],
      emergencyIncidents: [],
      supportTickets: [],
    });
    const result = await terminal.runCommand.handler(ctx, { input: 'health' });
    expect(result.exitCode).toBe(0);
    expect(result.lines.join('\n')).toContain('organizations ....... 1');
    expect(result.lines.join('\n')).toContain('users ............... 2');
  });

  it('tables lists the compiled schema', async () => {
    const result = await terminal.runCommand.handler(makeCtx(), { input: 'tables' });
    expect(result.exitCode).toBe(0);
    expect(result.lines.join('\n')).toContain('users');
    expect(result.lines.join('\n')).toContain('organizations');
  });

  it('routes filters by query', async () => {
    const result = await terminal.runCommand.handler(makeCtx(), { input: 'routes superadmin' });
    expect(result.exitCode).toBe(0);
    expect(result.lines.join('\n')).toContain('/superadmin/database');
  });

  it('whoami prints the caller', async () => {
    const result = await terminal.runCommand.handler(makeCtx(), { input: 'whoami' });
    expect(result.exitCode).toBe(0);
    expect(result.lines.join('\n')).toContain('root@x.com');
  });

  it('single mutation runs write commands too', async () => {
    const result = await terminal.runCommand.handler(makeCtx(), {
      input: 'toggle chat.realtime off',
    });
    expect(result.exitCode).toBe(0);
    expect(result.lines.join('\n')).toContain('OFF');
    expect(mockInsert).toHaveBeenCalledWith(
      'featureToggles',
      expect.objectContaining({ key: 'chat.realtime', enabled: false }),
    );
  });

  it('broadcast sends to an org announcements channel', async () => {
    mockGet.mockResolvedValue({ _id: 'org-1', name: 'Acme', slug: 'acme' });
    const ctx = makeCtx({
      organizations: [{ _id: 'org-1', slug: 'acme', name: 'Acme' }],
      chatConversations: [{ _id: 'conv-1', type: 'group', name: 'System Announcements' }],
    });
    const result = await terminal.runCommand.handler(ctx, {
      input: 'broadcast acme Maintenance tonight 22:00',
    });
    expect(result.exitCode).toBe(0);
    expect(mockInsert).toHaveBeenCalledWith(
      'chatMessages',
      expect.objectContaining({ content: 'Maintenance tonight 22:00' }),
    );
  });

  it('env masks values', async () => {
    const original = process.env.SUPERADMIN_TEST_KEY;
    process.env.SUPERADMIN_TEST_KEY = 'super-secret-value';
    try {
      const result = await terminal.runCommand.handler(makeCtx(), {
        input: 'env SUPERADMIN_TEST_KEY',
      });
      expect(result.exitCode).toBe(0);
      expect(result.lines.join('\n')).toContain('SET');
      expect(result.lines.join('\n')).not.toContain('super-secret-value');
    } finally {
      if (original === undefined) delete process.env.SUPERADMIN_TEST_KEY;
      else process.env.SUPERADMIN_TEST_KEY = original;
    }
  });

  it('env reports unset keys as NOT SET', async () => {
    const result = await terminal.runCommand.handler(makeCtx(), {
      input: 'env SUPERADMIN_DEFINITELY_NOT_SET_XYZ',
    });
    expect(result.exitCode).toBe(2);
    expect(result.lines.join('\n')).toContain('NOT SET');
  });

  it('stats reports growth counts', async () => {
    const now = Date.now();
    const ctx = makeCtx({
      organizations: [{ _id: 'org-1', _creationTime: now }],
      users: [
        { _id: 'u1', _creationTime: now },
        { _id: 'u2', _creationTime: now },
      ],
      tasks: [{ _id: 't1', _creationTime: now }],
    });
    const result = await terminal.runCommand.handler(ctx, { input: 'stats' });
    expect(result.exitCode).toBe(0);
    const out = result.lines.join('\n');
    expect(out).toContain('new organizations ... 1');
    expect(out).toContain('new users ........... 2');
    expect(out).toContain('tasks created 7d .... 1');
  });

  it('ping reports round-trip latency', async () => {
    const result = await terminal.runCommand.handler(makeCtx(), { input: 'ping' });
    expect(result.exitCode).toBe(0);
    expect(result.lines.join('\n')).toMatch(/pong in \d+ms/);
  });

  it('sessions lists active sessions and skips expired ones', async () => {
    const now = Date.now();
    const ctx = makeCtx({
      users: [
        {
          _id: 'u1',
          email: 'active@x.com',
          role: 'admin',
          sessionToken: 'tok',
          sessionExpiry: now + 60_000,
        },
        {
          _id: 'u2',
          email: 'expired@x.com',
          role: 'employee',
          sessionToken: 'old',
          sessionExpiry: now - 60_000,
        },
      ],
    });
    const result = await terminal.runCommand.handler(ctx, { input: 'sessions' });
    expect(result.exitCode).toBe(0);
    const out = result.lines.join('\n');
    expect(out).toContain('1 active session(s)');
    expect(out).toContain('active@x.com');
    expect(out).not.toContain('expired@x.com');
  });

  it('sessions reports none when nothing is active', async () => {
    const ctx = makeCtx({ users: [{ _id: 'u1', email: 'a@a.com', role: 'employee' }] });
    const result = await terminal.runCommand.handler(ctx, { input: 'sessions' });
    expect(result.exitCode).toBe(0);
    expect(result.lines.join('\n')).toContain('No active sessions');
  });

  it('orgs lists and filters organizations', async () => {
    const ctx = makeCtx({
      organizations: [
        { _id: 'org-1', name: 'Acme Inc', slug: 'acme', isActive: true, plan: 'pro' },
        { _id: 'org-2', name: 'Globex', slug: 'globex', isActive: false },
      ],
    });
    const all = await terminal.runCommand.handler(ctx, { input: 'orgs' });
    expect(all.exitCode).toBe(0);
    expect(all.lines.join('\n')).toContain('2 organization(s)');
    expect(all.lines.join('\n')).toContain('INACTIVE');
    const filtered = await terminal.runCommand.handler(ctx, { input: 'orgs acme' });
    expect(filtered.exitCode).toBe(0);
    expect(filtered.lines.join('\n')).toContain('1 organization(s) matching');
    expect(filtered.lines.join('\n')).toContain('acme');
  });

  it('orgs errors when nothing matches', async () => {
    const result = await terminal.runCommand.handler(makeCtx(), { input: 'orgs nope' });
    expect(result.exitCode).toBe(1);
    expect(result.lines.join('\n')).toContain('No organizations match');
  });

  it('users requires a query and searches by email/name', async () => {
    const noQuery = await terminal.runCommand.handler(makeCtx(), { input: 'users' });
    expect(noQuery.exitCode).toBe(1);
    expect(noQuery.lines.join('\n')).toContain('usage: users');

    const ctx = makeCtx({
      users: [
        {
          _id: 'u1',
          email: 'bob@x.com',
          name: 'Bob',
          role: 'employee',
          isActive: true,
          organizationId: 'org-1',
        },
        { _id: 'u2', email: 'alice@x.com', name: 'Alice', role: 'admin', isActive: false },
      ],
    });
    const result = await terminal.runCommand.handler(ctx, { input: 'users alice' });
    expect(result.exitCode).toBe(0);
    const out = result.lines.join('\n');
    expect(out).toContain('alice@x.com');
    expect(out).toContain('INACTIVE');
    expect(out).not.toContain('bob@x.com');
  });

  it('users errors when nothing matches', async () => {
    const result = await terminal.runCommand.handler(makeCtx(), { input: 'users zzz' });
    expect(result.exitCode).toBe(1);
    expect(result.lines.join('\n')).toContain('No users match');
  });

  it('tables filters by query and errors on no match', async () => {
    const ok = await terminal.runCommand.handler(makeCtx(), { input: 'tables user' });
    expect(ok.exitCode).toBe(0);
    expect(ok.lines.join('\n')).toContain('users');
    const miss = await terminal.runCommand.handler(makeCtx(), { input: 'tables zzz' });
    expect(miss.exitCode).toBe(1);
    expect(miss.lines.join('\n')).toContain('No tables match');
  });

  it('audit resolves usernames and formats entries', async () => {
    mockGet.mockResolvedValue({ email: 'alice@x.com', name: 'Alice' });
    const ctx = makeCtx({
      auditLogs: [
        {
          _id: 'a1',
          userId: 'u1',
          action: 'user.update',
          createdAt: Date.now(),
          details: 'changed name',
        },
        { _id: 'a2', action: 'system.job', createdAt: Date.now() },
      ],
    });
    const result = await terminal.runCommand.handler(ctx, { input: 'audit 5' });
    expect(result.exitCode).toBe(0);
    const out = result.lines.join('\n');
    expect(out).toContain('Latest 2 audit entries');
    expect(out).toContain('alice');
    expect(out).toContain('user.update');
    expect(out).toContain('changed name');
  });

  it('audit reports when there are no entries', async () => {
    const result = await terminal.runCommand.handler(makeCtx(), { input: 'audit' });
    expect(result.exitCode).toBe(0);
    expect(result.lines.join('\n')).toContain('No audit entries yet');
  });

  it('tickets lists open tickets and reports all clear', async () => {
    const ctx = makeCtx({
      supportTickets: [{ _id: 't1', status: 'open', priority: 'high', title: 'Billing issue' }],
    });
    const withTickets = await terminal.runCommand.handler(ctx, { input: 'tickets' });
    expect(withTickets.exitCode).toBe(0);
    expect(withTickets.lines.join('\n')).toContain('1 open ticket(s)');
    expect(withTickets.lines.join('\n')).toContain('HIGH');

    const clear = await terminal.runCommand.handler(makeCtx(), { input: 'tickets' });
    expect(clear.exitCode).toBe(0);
    expect(clear.lines.join('\n')).toContain('No open tickets');
  });

  it('toggle status reports the effective state', async () => {
    const result = await terminal.runCommand.handler(makeCtx(), {
      input: 'toggle chat.realtime status',
    });
    expect(result.exitCode).toBe(0);
    expect(result.lines.join('\n')).toContain('chat.realtime: ON');

    const overridden = await terminal.runCommand.handler(
      makeCtx({ featureToggles: [{ _id: 'ft-1', key: 'chat.realtime', enabled: false }] }),
      { input: 'toggle chat.realtime' },
    );
    expect(overridden.exitCode).toBe(0);
    expect(overridden.lines.join('\n')).toContain('OFF');
    expect(overridden.lines.join('\n')).toContain('overridden');
  });

  it('toggle patches an existing row and rejects unknown keys', async () => {
    const ctx = makeCtx({
      featureToggles: [{ _id: 'ft-1', key: 'chat.realtime', enabled: false }],
    });
    const result = await terminal.runCommand.handler(ctx, { input: 'toggle chat.realtime on' });
    expect(result.exitCode).toBe(0);
    expect(result.lines.join('\n')).toContain('ON');
    expect(mockPatch).toHaveBeenCalledWith('ft-1', expect.objectContaining({ enabled: true }));

    const bad = await terminal.runCommand.handler(makeCtx(), { input: 'toggle not.a.feature on' });
    expect(bad.exitCode).toBe(1);
    expect(bad.lines.join('\n')).toContain('Unknown feature');
  });

  it('export dumps documents of a table and errors on unknown tables', async () => {
    const ctx = makeCtx({
      users: [{ _id: 'u1', email: 'a@a.com', role: 'employee' }],
    });
    const result = await terminal.runCommand.handler(ctx, { input: 'export users' });
    expect(result.exitCode).toBe(0);
    expect(result.lines.join('\n')).toContain('users: 1 document(s)');
    expect(result.lines.join('\n')).toContain('"email":"a@a.com"');

    const usage = await terminal.runCommand.handler(ctx, { input: 'export' });
    expect(usage.exitCode).toBe(1);
    expect(usage.lines.join('\n')).toContain('usage: export');
  });

  it('broadcast errors for missing orgs and missing arguments', async () => {
    mockGet.mockResolvedValue({ _id: 'org-1', name: 'Acme', slug: 'acme' });
    const ctx = makeCtx({ organizations: [] });
    const noOrg = await terminal.runCommand.handler(ctx, { input: 'broadcast nope Hi' });
    expect(noOrg.exitCode).toBe(1);
    expect(noOrg.lines.join('\n')).toContain('No organization');

    const noArgs = await terminal.runCommand.handler(ctx, { input: 'broadcast' });
    expect(noArgs.exitCode).toBe(1);
    expect(noArgs.lines.join('\n')).toContain('usage: broadcast');
  });

  it('unknown commands suggest close matches', async () => {
    const result = await terminal.runCommand.handler(makeCtx(), { input: 'toggl' });
    expect(result.exitCode).toBe(1);
    expect(result.lines.join('\n')).toContain('Did you mean');
    expect(result.lines.join('\n')).toContain('toggle');
  });

  it('echo prints arguments back', async () => {
    const result = await terminal.runCommand.handler(makeCtx(), { input: 'echo hello world' });
    expect(result.exitCode).toBe(0);
    expect(result.lines.join('\n')).toContain('hello world');
  });

  it('routes errors on no match and tables-info lists schema', async () => {
    const miss = await terminal.runCommand.handler(makeCtx(), { input: 'routes zzz' });
    expect(miss.exitCode).toBe(1);
    expect(miss.lines.join('\n')).toContain('No routes match');

    const info = await terminal.runCommand.handler(makeCtx(), { input: 'tables-info' });
    expect(info.exitCode).toBe(0);
    expect(info.lines.join('\n')).toContain('Schema:');
    expect(info.lines.join('\n')).toContain('users');
  });
});
