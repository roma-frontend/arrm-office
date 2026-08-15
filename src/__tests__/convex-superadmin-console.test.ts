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
  const chain = (table: string) => {
    const c: any = {
      withIndex: (_name: string, cb?: (q: any) => unknown) => {
        if (typeof cb === 'function') {
          const q: any = { eq: () => q };
          cb(q);
        }
        return c;
      },
      filter: () => c,
      order: () => c,
      take: async () => tableRows[table] ?? [],
      first: async () => (tableRows[table] ?? [])[0] ?? null,
      unique: async () => (tableRows[table] ?? [])[0] ?? null,
      count: async () => (tableRows[table] ?? []).length,
      collect: async () => tableRows[table] ?? [],
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
});
