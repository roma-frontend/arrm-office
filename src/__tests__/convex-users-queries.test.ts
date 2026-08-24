/**
 * Tests for convex/users/queries.ts — every query handler: auth gates, org
 * scoping, redaction, pagination, enrichment and error branches.
 *
 * Pattern: convex-team-org-scope.test.ts — mock `_generated/server`,
 * lib/getAuthCaller, lib/auth and lib/userRedaction; require inside
 * jest.isolateModules; execute withIndex/filter predicates so their bodies
 * count as covered.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../../convex/_generated/server', () => ({
  query: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
}));

jest.mock('../../convex/lib/userRedaction', () => ({
  redactUser: (u: any) => u,
}));

jest.mock('../../convex/pagination', () => ({
  MAX_PAGE_SIZE: 50,
}));

jest.mock('convex/server', () => ({
  paginationOptsValidator: {},
}));

// ── Module under test ────────────────────────────────────────────────────────
let queries: any;
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;

const ORG_A = 'org-aaa' as any;
const ORG_B = 'org-bbb' as any;

const adminA = {
  _id: 'user-admin-a' as any,
  name: 'Admin A',
  email: 'admin.a@a.com',
  role: 'admin' as const,
  organizationId: ORG_A,
  isApproved: true,
  isActive: true,
  presenceStatus: 'available',
};

const employeeA = {
  _id: 'user-emp-a' as any,
  name: 'Employee A',
  email: 'emp.a@a.com',
  role: 'employee' as const,
  organizationId: ORG_A,
  isApproved: true,
  isActive: true,
  presenceStatus: 'available',
};

const superadminInA = {
  _id: 'user-super' as any,
  name: 'Super',
  email: 'super@a.com',
  role: 'superadmin' as const,
  organizationId: ORG_A,
};

function makeQueryBuilder() {
  const q: any = {};
  q.eq = jest.fn(() => q);
  q.neq = jest.fn(() => q);
  q.field = jest.fn(() => q);
  q.gte = jest.fn(() => q);
  q.lte = jest.fn(() => q);
  q.and = jest.fn(() => q);
  q.or = jest.fn(() => q);
  return q;
}

function makeChain() {
  const node: any = {};
  const q = makeQueryBuilder();
  node.take = jest.fn().mockResolvedValue([]);
  node.first = jest.fn().mockResolvedValue(null);
  node.unique = jest.fn().mockResolvedValue(null);
  node.order = jest.fn().mockReturnValue(node);
  node.filter = jest.fn((pred?: (qb: any) => any) => {
    if (pred) pred(q);
    return node;
  });
  node.withIndex = jest.fn((_name: string, pred?: (qb: any) => any) => {
    if (pred) pred(q);
    return node;
  });
  node.paginate = jest.fn().mockResolvedValue({ page: [], isDone: true, continueCursor: '' });
  return node;
}

type CtxHandle = ReturnType<typeof makeCtx>;

function makeCtx(
  opts: {
    rows?: Record<string, unknown[]>;
    docs?: Record<string, unknown>;
    identity?: { email?: string } | null;
  } = {},
) {
  const { rows = {}, docs = {}, identity = null } = opts;
  const get = jest.fn(async (id: string) => docs[id] ?? null);
  const chains = new Map<string, ReturnType<typeof makeChain>>();
  // NOTE: rows[table] is auto-wired to take/first/unique/paginate so a simple
  // listing assertion works out of the box. Handlers that use `.first()` for a
  // lookup and `.take()` for a listing on the same table must override `.first`
  // explicitly (see listAll / getUsersByDepartment tests).
  const createChain = (table: string) => {
    if (chains.has(table)) return chains.get(table)!;
    const ch = makeChain();
    const tableRows = rows[table];
    if (tableRows && tableRows.length) {
      ch.take.mockResolvedValue(tableRows);
      ch.first.mockResolvedValue(tableRows[0]);
      ch.unique.mockResolvedValue(tableRows[0]);
      ch.paginate.mockResolvedValue({
        page: tableRows,
        isDone: true,
        continueCursor: 'cursor',
      });
    }
    chains.set(table, ch);
    return ch;
  };
  const db = {
    get,
    query: jest.fn((table: string) => createChain(table)),
  };
  return {
    ctx: {
      db,
      auth: { getUserIdentity: jest.fn(async () => identity) },
    },
    db,
    get,
    chain: createChain,
  };
}

function setRows(h: CtxHandle, table: string, rows: unknown[]) {
  h.chain(table).take.mockResolvedValue(rows);
}

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    queries = require('../../convex/users/queries');
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  mockIsSuperadmin.mockReturnValue(false);
});

// ── getAllUsers ──────────────────────────────────────────────────────────────
describe('getAllUsers', () => {
  it('returns [] when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const h = makeCtx();
    expect(await queries.getAllUsers.handler(h.ctx, {})).toEqual([]);
  });

  it('pins an explicit organization for a superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(superadminInA);
    mockIsSuperadmin.mockReturnValue(true);
    const h = makeCtx({ rows: { users: [employeeA] } });
    const result = await queries.getAllUsers.handler(h.ctx, { organizationId: ORG_B, limit: 10 });
    expect(result).toEqual([employeeA]);
    const ch = h.chain('users');
    expect(ch.withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
    expect(ch.take).toHaveBeenCalledWith(11);
  });

  it('refuses a foreign organization for a non-superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeA);
    const h = makeCtx();
    expect(await queries.getAllUsers.handler(h.ctx, { organizationId: ORG_B })).toEqual([]);
    expect(h.db.query).not.toHaveBeenCalled();
  });

  it('lets a non-superadmin read their own organization', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeA);
    const h = makeCtx({ rows: { users: [employeeA] } });
    expect(await queries.getAllUsers.handler(h.ctx, { organizationId: ORG_A })).toEqual([
      employeeA,
    ]);
  });

  it('returns all users to a superadmin when no org is named', async () => {
    mockGetAuthCaller.mockResolvedValue(superadminInA);
    mockIsSuperadmin.mockReturnValue(true);
    const h = makeCtx({
      rows: { users: [employeeA, { ...superadminInA, role: 'superadmin' }] },
    });
    const result = await queries.getAllUsers.handler(h.ctx, {});
    expect(result).toEqual([employeeA]);
    expect(h.chain('users').order).toHaveBeenCalledWith('desc');
  });

  it('drops pending-approval users from the superadmin listing', async () => {
    mockGetAuthCaller.mockResolvedValue(superadminInA);
    mockIsSuperadmin.mockReturnValue(true);
    const h = makeCtx({
      rows: {
        users: [
          employeeA,
          { ...employeeA, _id: 'pending', isApproved: false },
          // Legacy rows without the field must still surface.
          { ...employeeA, _id: 'legacy', isApproved: undefined },
        ],
      },
    });
    const result = await queries.getAllUsers.handler(h.ctx, {});
    expect(result.map((u: any) => u._id).sort()).toEqual(['legacy', employeeA._id]);
  });

  it('throws when a non-superadmin has no organization', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...employeeA, organizationId: undefined });
    const h = makeCtx();
    await expect(queries.getAllUsers.handler(h.ctx, {})).rejects.toThrow(
      'User does not belong to an organization',
    );
  });

  it('caps the limit at 100', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeA);
    const h = makeCtx({ rows: { users: [] } });
    await queries.getAllUsers.handler(h.ctx, { limit: 1000 });
    expect(h.chain('users').take).toHaveBeenCalledWith(101);
  });
});

// ── listUsersPaginated ───────────────────────────────────────────────────────
describe('listUsersPaginated', () => {
  const paginationOpts = { numItems: 10, cursor: null };

  it('returns an empty page when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const h = makeCtx();
    expect(await queries.listUsersPaginated.handler(h.ctx, { paginationOpts })).toEqual({
      page: [],
      isDone: true,
      continueCursor: '',
    });
  });

  it('paginates a named organization', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    const h = makeCtx({ rows: { users: [employeeA] } });
    const result = await queries.listUsersPaginated.handler(h.ctx, {
      organizationId: ORG_A,
      paginationOpts,
    });
    expect(result.page).toEqual([employeeA]);
    expect(h.chain('users').withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('filters pending-approval users out of the paginated listing', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    const h = makeCtx({ rows: { users: [employeeA] } });
    await queries.listUsersPaginated.handler(h.ctx, {
      organizationId: ORG_A,
      paginationOpts,
    });
    // The approved-only predicate runs through the chain filter mock.
    expect(h.chain('users').filter).toHaveBeenCalledWith(expect.any(Function));
    const predicate = (h.chain('users').filter as jest.Mock).mock.calls[0][0];
    const qb = makeQueryBuilder();
    predicate(qb);
    expect(qb.neq).toHaveBeenCalledWith(expect.anything(), false);
  });

  it('paginates all users for a superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(superadminInA);
    mockIsSuperadmin.mockReturnValue(true);
    const h = makeCtx({ rows: { users: [employeeA] } });
    const result = await queries.listUsersPaginated.handler(h.ctx, { paginationOpts });
    expect(result.page).toEqual([employeeA]);
  });

  it('paginates the caller organization otherwise', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeA);
    const h = makeCtx({ rows: { users: [employeeA] } });
    const result = await queries.listUsersPaginated.handler(h.ctx, { paginationOpts });
    expect(result.page).toEqual([employeeA]);
  });

  it('returns an empty page for a caller with no organization', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...employeeA, organizationId: undefined });
    const h = makeCtx();
    expect(await queries.listUsersPaginated.handler(h.ctx, { paginationOpts })).toEqual({
      page: [],
      isDone: true,
      continueCursor: '',
    });
  });
});

// ── getUsersByOrganizationId ─────────────────────────────────────────────────
describe('getUsersByOrganizationId', () => {
  it('returns [] when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const h = makeCtx();
    expect(
      await queries.getUsersByOrganizationId.handler(h.ctx, { organizationId: ORG_A }),
    ).toEqual([]);
  });

  it('throws on cross-organization access for a non-superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeA);
    const h = makeCtx();
    await expect(
      queries.getUsersByOrganizationId.handler(h.ctx, { organizationId: ORG_B }),
    ).rejects.toThrow('cross-organization');
  });

  it('returns active users of the organization for a same-org caller', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeA);
    const h = makeCtx({ rows: { users: [employeeA] } });
    expect(
      await queries.getUsersByOrganizationId.handler(h.ctx, { organizationId: ORG_A }),
    ).toEqual([employeeA]);
  });

  it('exposes the mobile alias with the same handler', () => {
    expect(queries.getUsersByOrganization).toBe(queries.getUsersByOrganizationId);
  });
});

// ── getCurrentUser ───────────────────────────────────────────────────────────
describe('getCurrentUser', () => {
  it('resolves by userId and enriches with the organization', async () => {
    const h = makeCtx({
      docs: { [employeeA._id]: employeeA, [ORG_A]: { slug: 'org-a', name: 'Org A' } },
    });
    const result = await queries.getCurrentUser.handler(h.ctx, { userId: employeeA._id });
    expect(result).toMatchObject({
      _id: employeeA._id,
      organizationSlug: 'org-a',
      organizationName: 'Org A',
    });
  });

  it('resolves by the auth identity email', async () => {
    const h = makeCtx({
      docs: {},
      identity: { email: employeeA.email },
      rows: { users: [employeeA] },
    });
    const result = await queries.getCurrentUser.handler(h.ctx, {});
    expect(result?._id).toBe(employeeA._id);
    expect(h.chain('users').withIndex).toHaveBeenCalledWith('by_email', expect.any(Function));
  });

  it('resolves by the email argument when no identity is present', async () => {
    const h = makeCtx({ rows: { users: [employeeA] } });
    const result = await queries.getCurrentUser.handler(h.ctx, { email: employeeA.email });
    expect(result?._id).toBe(employeeA._id);
  });

  it('returns null when the user is not found', async () => {
    const h = makeCtx();
    expect(await queries.getCurrentUser.handler(h.ctx, {})).toBeNull();
  });

  it('omits organization info when the user has none', async () => {
    const h = makeCtx({
      docs: { u1: { ...employeeA, _id: 'u1', organizationId: undefined } },
    });
    const result = await queries.getCurrentUser.handler(h.ctx, { userId: 'u1' });
    expect(result).toMatchObject({ _id: 'u1' });
    expect(result.organizationSlug).toBeUndefined();
  });
});

// ── getUserByEmail ───────────────────────────────────────────────────────────
describe('getUserByEmail', () => {
  it('returns null when the user does not exist', async () => {
    const h = makeCtx();
    expect(await queries.getUserByEmail.handler(h.ctx, { email: 'ghost@x.com' })).toBeNull();
  });

  it('returns the user for a same-org caller', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    const h = makeCtx({
      docs: { [adminA._id]: adminA },
      rows: { users: [employeeA] },
    });
    expect(await queries.getUserByEmail.handler(h.ctx, { email: employeeA.email })).toEqual(
      employeeA,
    );
  });

  it('returns null for a cross-org caller', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    const h = makeCtx({
      docs: { [adminA._id]: adminA },
      rows: { users: [{ ...employeeA, organizationId: ORG_B }] },
    });
    expect(await queries.getUserByEmail.handler(h.ctx, { email: employeeA.email })).toBeNull();
  });

  it('allows a superadmin to read any user by email', async () => {
    mockGetAuthCaller.mockResolvedValue(superadminInA);
    mockIsSuperadmin.mockReturnValue(true);
    const h = makeCtx({
      docs: { [superadminInA._id]: superadminInA },
      rows: { users: [{ ...employeeA, organizationId: ORG_B }] },
    });
    expect(await queries.getUserByEmail.handler(h.ctx, { email: employeeA.email })).toEqual({
      ...employeeA,
      organizationId: ORG_B,
    });
  });

  it('returns the user when there is no authenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const h = makeCtx({ rows: { users: [employeeA] } });
    expect(await queries.getUserByEmail.handler(h.ctx, { email: employeeA.email })).toEqual(
      employeeA,
    );
  });
});

// ── getPublicUserByEmail ─────────────────────────────────────────────────────
describe('getPublicUserByEmail', () => {
  it('returns a minimal projection for the auth bridge', async () => {
    const full = { ...employeeA, passwordHash: 'x', totpSecret: 'y', faceDescriptor: 'z' };
    const h = makeCtx({ rows: { users: [full] } });
    const result = await queries.getPublicUserByEmail.handler(h.ctx, { email: employeeA.email });
    expect(result).toEqual({
      _id: employeeA._id,
      name: employeeA.name,
      email: employeeA.email,
      role: 'employee',
      organizationId: ORG_A,
      isApproved: true,
      department: undefined,
      position: undefined,
      employeeType: undefined,
      avatarUrl: undefined,
    });
  });

  it('returns null when the user does not exist', async () => {
    const h = makeCtx();
    expect(await queries.getPublicUserByEmail.handler(h.ctx, { email: 'ghost@x.com' })).toBeNull();
  });
});

// ── getUserById ──────────────────────────────────────────────────────────────
describe('getUserById', () => {
  it('returns null when the user is missing', async () => {
    const h = makeCtx();
    expect(await queries.getUserById.handler(h.ctx, { userId: employeeA._id })).toBeNull();
  });

  it('returns the user for a same-org caller', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    const h = makeCtx({ docs: { [adminA._id]: adminA, [employeeA._id]: employeeA } });
    expect(await queries.getUserById.handler(h.ctx, { userId: employeeA._id })).toEqual(employeeA);
  });

  it('throws for a cross-org caller', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    const h = makeCtx({
      docs: { [adminA._id]: adminA, [employeeA._id]: { ...employeeA, organizationId: ORG_B } },
    });
    await expect(queries.getUserById.handler(h.ctx, { userId: employeeA._id })).rejects.toThrow(
      'cross-organization',
    );
  });

  it('allows a superadmin to read across orgs', async () => {
    mockGetAuthCaller.mockResolvedValue(superadminInA);
    mockIsSuperadmin.mockReturnValue(true);
    const h = makeCtx({
      docs: {
        [superadminInA._id]: superadminInA,
        [employeeA._id]: { ...employeeA, organizationId: ORG_B },
      },
    });
    expect(await queries.getUserById.handler(h.ctx, { userId: employeeA._id })).toEqual({
      ...employeeA,
      organizationId: ORG_B,
    });
  });
});

// `getSupervisors` was removed: it filtered candidates by role, so an employee
// could never be someone's manager and an admin was implicitly senior to
// everyone. `reporting.getPotentialManagers` replaces it and is covered by
// convex-reporting.test.ts and convex-tasks.integration.test.ts.

// ── getUsersByRole ───────────────────────────────────────────────────────────
describe('getUsersByRole', () => {
  it('queries by org and role when an org is given', async () => {
    const h = makeCtx({ rows: { users: [employeeA] } });
    const result = await queries.getUsersByRole.handler(h.ctx, {
      organizationId: ORG_A,
      role: 'employee',
    });
    expect(result[0]).toMatchObject({ _id: employeeA._id, name: employeeA.name });
    expect(h.chain('users').withIndex).toHaveBeenCalledWith('by_org_role', expect.any(Function));
  });

  it('filters by role alone when no org is given', async () => {
    const h = makeCtx({ rows: { users: [employeeA] } });
    const result = await queries.getUsersByRole.handler(h.ctx, { role: 'employee' });
    expect(result[0]._id).toBe(employeeA._id);
    expect(h.chain('users').withIndex).not.toHaveBeenCalled();
  });
});

// ── getPendingApprovalUsers ──────────────────────────────────────────────────
describe('getPendingApprovalUsers', () => {
  it('returns [] when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const h = makeCtx();
    expect(await queries.getPendingApprovalUsers.handler(h.ctx, {})).toEqual([]);
  });

  it('returns [] for a non-admin caller', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeA);
    const h = makeCtx();
    expect(await queries.getPendingApprovalUsers.handler(h.ctx, {})).toEqual([]);
  });

  it('returns all unapproved users for a superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(superadminInA);
    mockIsSuperadmin.mockReturnValue(true);
    const h = makeCtx({
      rows: {
        users: [
          { ...employeeA, isApproved: false },
          { ...adminA, isApproved: true },
        ],
      },
    });
    const result = await queries.getPendingApprovalUsers.handler(h.ctx, {});
    expect(result).toHaveLength(1);
    expect(result[0].isApproved).toBe(false);
  });

  it('returns pending users of the admin organization', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    const h = makeCtx({ rows: { users: [{ ...employeeA, isApproved: false }] } });
    const result = await queries.getPendingApprovalUsers.handler(h.ctx, {});
    expect(result).toHaveLength(1);
    expect(h.chain('users').withIndex).toHaveBeenCalledWith(
      'by_org_approval',
      expect.any(Function),
    );
  });

  it('returns [] for an admin without an organization', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...adminA, organizationId: undefined });
    const h = makeCtx();
    expect(await queries.getPendingApprovalUsers.handler(h.ctx, {})).toEqual([]);
  });
});

// ── getAuditLogs ─────────────────────────────────────────────────────────────
describe('getAuditLogs', () => {
  it('returns [] when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const h = makeCtx();
    expect(await queries.getAuditLogs.handler(h.ctx, {})).toEqual([]);
  });

  it('returns [] for a non-admin caller', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeA);
    const h = makeCtx();
    expect(await queries.getAuditLogs.handler(h.ctx, {})).toEqual([]);
  });

  it('returns the org audit logs for an admin', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    const h = makeCtx({ rows: { auditLogs: [{ _id: 'log1' }] } });
    const result = await queries.getAuditLogs.handler(h.ctx, {});
    expect(result).toEqual([{ _id: 'log1' }]);
    expect(h.chain('auditLogs').order).toHaveBeenCalledWith('desc');
    expect(h.chain('auditLogs').take).toHaveBeenCalledWith(200);
  });
});

// ── getEffectivePresenceStatus ───────────────────────────────────────────────
describe('getEffectivePresenceStatus', () => {
  it('throws when the user is missing', async () => {
    const h = makeCtx();
    await expect(
      queries.getEffectivePresenceStatus.handler(h.ctx, { userId: 'ghost' }),
    ).rejects.toThrow('User not found');
  });

  it('reports out_of_office when an approved leave covers today', async () => {
    const h = makeCtx({
      docs: { [employeeA._id]: employeeA },
      rows: {
        leaveRequests: [
          { startDate: '2000-01-01', endDate: '2100-01-01', status: 'approved' },
          { startDate: '1990-01-01', endDate: '1990-01-02', status: 'approved' },
        ],
      },
    });
    const result = await queries.getEffectivePresenceStatus.handler(h.ctx, {
      userId: employeeA._id,
    });
    expect(result).toEqual({
      userId: employeeA._id,
      presenceStatus: 'available',
      effectivePresenceStatus: 'out_of_office',
      hasActiveLeave: true,
    });
  });

  it('falls back to the presence status when no leave is active', async () => {
    const h = makeCtx({
      docs: { [employeeA._id]: { ...employeeA, presenceStatus: 'busy' } },
      rows: { leaveRequests: [{ startDate: '1990-01-01', endDate: '1990-01-02' }] },
    });
    const result = await queries.getEffectivePresenceStatus.handler(h.ctx, {
      userId: employeeA._id,
    });
    expect(result.effectivePresenceStatus).toBe('busy');
    expect(result.hasActiveLeave).toBe(false);
  });

  it('defaults to available when no presence status is set', async () => {
    const h = makeCtx({
      docs: { [employeeA._id]: { ...employeeA, presenceStatus: undefined } },
      rows: { leaveRequests: [] },
    });
    const result = await queries.getEffectivePresenceStatus.handler(h.ctx, {
      userId: employeeA._id,
    });
    expect(result.presenceStatus).toBe('available');
    expect(result.effectivePresenceStatus).toBe('available');
  });
});

// ── WebAuthn ─────────────────────────────────────────────────────────────────
describe('webauthn queries', () => {
  it('getWebauthnCredentials returns the credentials for a user', async () => {
    const h = makeCtx({ rows: { webauthnCredentials: [{ _id: 'c1', credentialId: 'x' }] } });
    const result = await queries.getWebauthnCredentials.handler(h.ctx, { userId: employeeA._id });
    expect(result).toEqual([{ _id: 'c1', credentialId: 'x' }]);
    expect(h.chain('webauthnCredentials').withIndex).toHaveBeenCalledWith(
      'by_user',
      expect.any(Function),
    );
  });

  it('getWebauthnCredential returns a single credential by id', async () => {
    const h = makeCtx();
    h.chain('webauthnCredentials').unique.mockResolvedValue({ _id: 'c1', credentialId: 'cred-1' });
    const result = await queries.getWebauthnCredential.handler(h.ctx, { credentialId: 'cred-1' });
    expect(result).toEqual({ _id: 'c1', credentialId: 'cred-1' });
  });
});

// ── checkFaceIdStatus ────────────────────────────────────────────────────────
describe('checkFaceIdStatus', () => {
  it('returns zeros when the user is missing', async () => {
    const h = makeCtx();
    expect(await queries.checkFaceIdStatus.handler(h.ctx, { email: 'ghost@x.com' })).toEqual({
      blocked: false,
      attempts: 0,
    });
  });

  it('reports the face id lock state of the user', async () => {
    const h = makeCtx({
      rows: {
        users: [
          {
            _id: employeeA._id,
            faceIdBlocked: true,
            faceIdFailedAttempts: 3,
            faceIdBlockedAt: 123,
            faceIdLastAttempt: 456,
          },
        ],
      },
    });
    const result = await queries.checkFaceIdStatus.handler(h.ctx, { email: employeeA.email });
    expect(result).toEqual({
      blocked: true,
      attempts: 3,
      blockedAt: 123,
      lastAttempt: 456,
    });
  });
});

// ── listAll ──────────────────────────────────────────────────────────────────
describe('listAll', () => {
  it('returns [] without an auth identity', async () => {
    const h = makeCtx();
    expect(await queries.listAll.handler(h.ctx, {})).toEqual([]);
  });

  it('returns [] when the identity maps to no user', async () => {
    const h = makeCtx({ identity: { email: 'ghost@x.com' } });
    expect(await queries.listAll.handler(h.ctx, {})).toEqual([]);
  });

  it('returns all non-superadmin users for a superadmin', async () => {
    mockIsSuperadmin.mockReturnValue(true);
    const h = makeCtx({
      identity: { email: superadminInA.email },
      rows: { users: [employeeA, adminA, { ...superadminInA }] },
    });
    h.chain('users').first.mockResolvedValue(superadminInA);
    const result = await queries.listAll.handler(h.ctx, {});
    expect(result).toHaveLength(2);
  });

  it('returns org users for an admin', async () => {
    const h = makeCtx({
      identity: { email: adminA.email },
      rows: { users: [employeeA, adminA] },
    });
    h.chain('users').first.mockResolvedValue(adminA);
    const result = await queries.listAll.handler(h.ctx, {});
    expect(result).toEqual([employeeA, adminA]);
    expect(h.chain('users').withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('returns [] for an admin without an organization', async () => {
    const h = makeCtx({ identity: { email: adminA.email }, docs: { [adminA._id]: adminA } });
    h.chain('users').first.mockResolvedValue({ ...adminA, organizationId: undefined });
    expect(await queries.listAll.handler(h.ctx, {})).toEqual([]);
  });

  it('returns [] for a plain employee', async () => {
    const h = makeCtx({ identity: { email: employeeA.email } });
    h.chain('users').first.mockResolvedValue(employeeA);
    expect(await queries.listAll.handler(h.ctx, {})).toEqual([]);
  });
});

// ── getUsersByDepartment ─────────────────────────────────────────────────────
describe('getUsersByDepartment', () => {
  const DEPT = 'dept-1' as any;

  it('returns [] without an auth identity', async () => {
    const h = makeCtx();
    expect(await queries.getUsersByDepartment.handler(h.ctx, { departmentId: DEPT })).toEqual([]);
  });

  it('returns [] when the identity maps to no user', async () => {
    const h = makeCtx({ identity: { email: 'ghost@x.com' } });
    expect(await queries.getUsersByDepartment.handler(h.ctx, { departmentId: DEPT })).toEqual([]);
  });

  it('returns active department users for an admin', async () => {
    const h = makeCtx({
      identity: { email: adminA.email },
      rows: { users: [employeeA, { ...employeeA, _id: 'inactive', isActive: false }] },
    });
    h.chain('users').first.mockResolvedValue(adminA);
    const result = await queries.getUsersByDepartment.handler(h.ctx, { departmentId: DEPT });
    expect(result).toEqual([employeeA]);
    expect(h.chain('users').filter).toHaveBeenCalled();
  });

  it('scopes department users to the org for a supervisor', async () => {
    const h = makeCtx({
      identity: { email: 'sup@x.com' },
      rows: {
        users: [
          { _id: 'in-org', isActive: true, organizationId: ORG_A },
          { _id: 'other-org', isActive: true, organizationId: ORG_B },
        ],
      },
    });
    h.chain('users').first.mockResolvedValue({
      _id: 'sup',
      role: 'supervisor',
      organizationId: ORG_A,
    });
    const result = await queries.getUsersByDepartment.handler(h.ctx, { departmentId: DEPT });
    expect(result.map((u: any) => u._id)).toEqual(['in-org']);
  });

  it('returns [] for an employee', async () => {
    const h = makeCtx({ identity: { email: employeeA.email } });
    h.chain('users').first.mockResolvedValue({ _id: 'e', role: 'employee' });
    expect(await queries.getUsersByDepartment.handler(h.ctx, { departmentId: DEPT })).toEqual([]);
  });
});

// ── getPendingUserById ───────────────────────────────────────────────────────
describe('getPendingUserById', () => {
  it('returns null when the user is missing', async () => {
    const h = makeCtx();
    expect(await queries.getPendingUserById.handler(h.ctx, { userId: 'ghost' })).toBeNull();
  });

  it('returns the redacted user', async () => {
    const h = makeCtx({ docs: { [employeeA._id]: employeeA } });
    expect(await queries.getPendingUserById.handler(h.ctx, { userId: employeeA._id })).toEqual(
      employeeA,
    );
  });
});
