/**
 * Tests for the superadmin trash — convex/superadmin/trash. Soft delete with
 * restore for organizations (cascading to members) and users, plus permanent
 * user purge, all under the superadmin gate.
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

let trash: any;
let mockGetAuthCaller: jest.Mock;
let mockGet: jest.Mock;
let mockPatch: jest.Mock;
let mockInsert: jest.Mock;
let mockDelete: jest.Mock;

const superadmin = {
  _id: 'user-super',
  name: 'Root',
  email: 'root@x.com',
  role: 'superadmin',
  organizationId: 'org-own',
};
const admin = { _id: 'user-admin', name: 'Admin', email: 'a@a.com', role: 'admin' };

const NOW = Date.now();

const org = (overrides: Record<string, unknown> = {}) => ({
  _id: 'org-1',
  name: 'Acme',
  slug: 'acme',
  plan: 'professional',
  isActive: true,
  createdBySuperadmin: true,
  employeeLimit: 50,
  createdAt: NOW - 30 * 24 * 3600_000,
  updatedAt: NOW - 30 * 24 * 3600_000,
  ...overrides,
});
const member = (overrides: Record<string, unknown> = {}) => ({
  _id: 'user-1',
  name: 'Alice',
  email: 'alice@x.com',
  role: 'employee',
  organizationId: 'org-1',
  isActive: true,
  isApproved: true,
  createdAt: NOW - 1000,
  ...overrides,
});

function makeCtx(tableRows: Record<string, unknown[]> = {}) {
  const chain = (table: string) => {
    const conds: Array<{ op: 'eq' | 'gt'; f: string; v: unknown }> = [];
    const c: any = {
      withIndex: (_name: string, cb?: (q: any) => unknown) => {
        if (typeof cb === 'function') {
          const q: any = {
            eq: (f: string, v: unknown) => (conds.push({ op: 'eq', f, v }), q),
            gt: (f: string, v: unknown) => (conds.push({ op: 'gt', f, v }), q),
            gte: (f: string, v: unknown) => (conds.push({ op: 'gt', f, v }), q),
          };
          cb(q);
        }
        return c;
      },
      filter: () => c,
      order: () => c,
      take: async () =>
        (tableRows[table] ?? []).filter((row) =>
          conds.every((cnd) => {
            const val = (row as Record<string, unknown>)[cnd.f];
            return cnd.op === 'eq' ? val === cnd.v : (val ?? 0) > cnd.v;
          }),
        ),
      first: async () => null,
      unique: async () => null,
    };
    return c;
  };
  return {
    db: {
      get: mockGet,
      insert: mockInsert,
      patch: mockPatch,
      delete: mockDelete,
      query: (t: string) => chain(t),
    },
  };
}

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockGet = jest.fn();
    mockPatch = jest.fn(async () => undefined);
    mockInsert = jest.fn(async () => 'audit-1');
    mockDelete = jest.fn(async () => undefined);
    trash = require('../../convex/superadmin/trash');
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller.mockResolvedValue(superadmin);
  mockGet.mockResolvedValue(null);
  mockInsert.mockResolvedValue('audit-1');
});

// ── listTrash ────────────────────────────────────────────────────────────────

describe('listTrash', () => {
  it('returns only soft-deleted orgs and users', async () => {
    const ctx = makeCtx({
      organizations: [
        org({ _id: 'org-a', name: 'Gone Co', deletedAt: NOW - 1000 }),
        org({ _id: 'org-b', name: 'Alive Co' }),
      ],
      users: [
        member({ _id: 'u-a', name: 'Gone User', deletedAt: NOW - 500 }),
        member({ _id: 'u-b', name: 'Alive User' }),
      ],
    });
    mockGet.mockImplementation(async (id: string) => (id === 'org-1' ? org() : null));

    const result = await trash.listTrash.handler(ctx, {});
    expect(result.organizations.map((o: any) => o.name)).toEqual(['Gone Co']);
    expect(result.users.map((u: any) => u.name)).toEqual(['Gone User']);
  });

  it('rejects non-superadmins', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    await expect(trash.listTrash.handler(makeCtx(), {})).rejects.toThrow(/Only superadmins/);
  });
});

// ── moveOrgToTrash ───────────────────────────────────────────────────────────

describe('moveOrgToTrash', () => {
  it('soft-deletes the org and cascades to its members', async () => {
    const ctx = makeCtx({
      users: [member({ _id: 'u-1' }), member({ _id: 'u-2', organizationId: 'org-other' })],
    });
    mockGet.mockImplementation(async (id: string) => (id === 'org-1' ? org() : null));

    const result = await trash.moveOrgToTrash.handler(ctx, { organizationId: 'org-1' });
    expect(result.usersAffected).toBe(1);
    expect(mockPatch).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ deletedAt: expect.any(Number), isActive: false }),
    );
    // Only the member of org-1 is patched.
    expect(mockPatch).toHaveBeenCalledWith('u-1', expect.objectContaining({ isActive: false }));
    expect(mockPatch).not.toHaveBeenCalledWith('u-2', expect.anything());
    // Audit trail entry.
    expect(mockInsert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'superadmin.trash.org_move' }),
    );
  });

  it('refuses to trash the caller own org', async () => {
    mockGet.mockResolvedValue(org());
    await expect(
      trash.moveOrgToTrash.handler(makeCtx(), { organizationId: 'org-own' }),
    ).rejects.toThrow(/cannot trash the organization/);
  });
});

// ── moveUserToTrash / restoreUser / purgeUser ───────────────────────────────

describe('user trash actions', () => {
  it('moves a user to trash and clears the session', async () => {
    mockGet.mockResolvedValue(member());
    const ctx = makeCtx();
    await trash.moveUserToTrash.handler(ctx, { userId: 'user-1' });
    expect(mockPatch).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        deletedAt: expect.any(Number),
        isActive: false,
        sessionToken: undefined,
      }),
    );
  });

  it('refuses to trash another superadmin', async () => {
    mockGet.mockResolvedValue(member({ role: 'superadmin' }));
    await expect(trash.moveUserToTrash.handler(makeCtx(), { userId: 'user-1' })).rejects.toThrow(
      /superadmin/,
    );
  });

  it('restores a user', async () => {
    mockGet.mockResolvedValue(member({ deletedAt: NOW - 100 }));
    const ctx = makeCtx();
    await trash.restoreUser.handler(ctx, { userId: 'user-1' });
    expect(mockPatch).toHaveBeenCalledWith('user-1', expect.objectContaining({ isActive: true }));
  });

  it('purges a user permanently with an audit entry', async () => {
    mockGet.mockResolvedValue(member());
    const ctx = makeCtx();
    await trash.purgeUser.handler(ctx, { userId: 'user-1' });
    expect(mockDelete).toHaveBeenCalledWith('user-1');
    expect(mockInsert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'superadmin.trash.user_purge' }),
    );
  });
});

// ── restoreOrg ───────────────────────────────────────────────────────────────

describe('restoreOrg', () => {
  it('restores the org and only the members that were trashed with it', async () => {
    const ctx = makeCtx({
      users: [
        member({ _id: 'u-1', deletedAt: NOW - 100 }),
        member({ _id: 'u-2' }), // alive member — untouched
      ],
    });
    mockGet.mockResolvedValue(org({ deletedAt: NOW - 100 }));

    const result = await trash.restoreOrg.handler(ctx, { organizationId: 'org-1' });
    expect(result.usersRestored).toBe(1);
    expect(mockPatch).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ deletedAt: undefined, isActive: true }),
    );
    expect(mockPatch).toHaveBeenCalledWith('u-1', expect.objectContaining({ isActive: true }));
    expect(mockPatch).not.toHaveBeenCalledWith('u-2', expect.anything());
  });
});
