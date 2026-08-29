/**
 * Tests for convex/leaves/queries.ts — every query with its role branches:
 * superadmin / staff (admin+supervisor) / employee+driver / unauthenticated,
 * plus org-scoping, pagination cursors and enrichment.
 *
 * Pattern: convex-leaves-mutations.test.ts — mock `_generated/server`,
 * lib/getAuthCaller, lib/auth, lib/userProfile and leaves/helpers; execute
 * withIndex/filter predicates; require inside jest.isolateModules.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { encodeCursor } from '../../convex/pagination';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  action: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
  internalQuery: ({ handler, args }: any) => ({ handler, args }),
  internalAction: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
}));

jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn(),
}));

jest.mock('../../convex/leaves/helpers', () => ({
  enrichLeavesWithUserData: jest.fn(),
}));

jest.mock('../../convex/lib/rbac', () => ({
  canAccessUser: jest.fn().mockResolvedValue(true),
}));

// ── Module under test ────────────────────────────────────────────────────────
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockGetProfile: jest.Mock;
let mockEnrich: jest.Mock;

type Handler = (ctx: any, args: any) => Promise<unknown>;
const handlers: Record<string, Handler> = {};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  mockGetProfile = jest.requireMock('../../convex/lib/userProfile').getProfile;
  mockEnrich = jest.requireMock('../../convex/leaves/helpers').enrichLeavesWithUserData;
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  mockGetProfile.mockReset();
  mockEnrich.mockReset();
  // Identity enrichment: tests assert on the raw leave rows.
  mockEnrich.mockImplementation(async (_ctx: any, leaves: unknown[]) => leaves);
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/leaves/queries');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      }
    }
  });
});

// ── Fixtures ─────────────────────────────────────────────────────────────────
const ORG_A = 'org-1';
const ORG_B = 'org-2';
const USER_ID = 'user_emp';
const ADMIN_ID = 'user_admin';
const LEAVE_ID = 'leave_1';

function makeCaller(role: string, org: string | undefined = ORG_A, id: string = USER_ID) {
  return { _id: id, role, email: 'caller@example.com', organizationId: org, name: 'Caller' };
}

/** Caller that genuinely has no organization (default params can't express this). */
function callerWithoutOrg(role: string, id: string = USER_ID) {
  return { _id: id, role, email: 'caller@example.com', organizationId: undefined, name: 'Caller' };
}

/** Returns an ISO date `days` from today, so leave fixtures never fall on
 * the current day (keeps getLeaveStats' onLeaveToday counting stable). */
function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0] || '';
}

function leaveDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: LEAVE_ID,
    organizationId: ORG_A,
    userId: USER_ID,
    type: 'paid',
    startDate: futureDate(30),
    endDate: futureDate(32),
    days: 3,
    reason: 'Family event',
    status: 'pending',
    isRead: false,
    reviewedBy: ADMIN_ID,
    _creationTime: 1_700_000_000_000,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

// Query builder fake that executes withIndex/filter predicates.
function makeQueryBuilder() {
  const q: any = {};
  q.eq = jest.fn(() => q);
  q.neq = jest.fn(() => q);
  q.field = jest.fn(() => q);
  q.lt = jest.fn(() => q);
  q.lte = jest.fn(() => q);
  q.gte = jest.fn(() => q);
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
  node.paginate = jest.fn().mockResolvedValue({ page: [], isDone: true, continueCursor: '' });
  node.filter = jest.fn((pred?: (qb: any) => any) => {
    if (pred) pred(q);
    return node;
  });
  node.withIndex = jest.fn((_name: string, pred?: (qb: any) => any) => {
    if (pred) pred(q);
    return node;
  });
  return node;
}

function makeCtx() {
  const get = jest.fn().mockResolvedValue(null);
  const insert = jest.fn().mockResolvedValue(LEAVE_ID);
  const patch = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(undefined);
  const chains = new Map<string, ReturnType<typeof makeChain>>();
  const db = {
    get,
    insert,
    patch,
    delete: remove,
    query: jest.fn((table: string) => {
      if (!chains.has(table)) chains.set(table, makeChain());
      return chains.get(table)!;
    }),
  };
  return { ctx: { db }, get, insert, patch, remove, chains, db };
}

function chain(chains: Map<string, ReturnType<typeof makeChain>>, table: string) {
  if (!chains.has(table)) chains.set(table, makeChain());
  return chains.get(table)!;
}

const paginationOpts = { cursor: null, numItems: 20, endCursor: null };

// ── getAllLeaves ─────────────────────────────────────────────────────────────
describe('getAllLeaves', () => {
  it('returns [] when unauthenticated and no organizationId is given', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    await expect(handlers.getAllLeaves(ctx, {})).resolves.toEqual([]);
  });

  it('server-side call with organizationId and no requester reads the org queue', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.take.mockResolvedValue([leaveDoc()]);

    const res = (await handlers.getAllLeaves(ctx, { organizationId: ORG_A })) as any[];

    expect(res).toHaveLength(1);
    expect(lCh.withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
    expect(lCh.order).toHaveBeenCalledWith('desc');
    expect(mockEnrich).toHaveBeenCalled();
  });

  it('lets a superadmin see every leave across organizations', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', ORG_A, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.take.mockResolvedValue([leaveDoc()]);

    const res = (await handlers.getAllLeaves(ctx, {})) as any[];

    expect(res).toHaveLength(1);
    expect(lCh.withIndex).not.toHaveBeenCalled();
    expect(mockIsSuperadmin).toHaveBeenCalled();
  });

  it('staff without an organization sees nothing', async () => {
    mockGetAuthCaller.mockResolvedValue(callerWithoutOrg('admin', ADMIN_ID));
    const { ctx, db } = makeCtx();
    const res = (await handlers.getAllLeaves(ctx, {})) as any[];
    expect(res).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('staff reads the org queue', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor'));
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.take.mockResolvedValue([leaveDoc()]);

    await handlers.getAllLeaves(ctx, {});

    expect(lCh.withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('employees only see their own leaves even when an organizationId is passed', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.take.mockResolvedValue([leaveDoc()]);

    await handlers.getAllLeaves(ctx, { organizationId: ORG_A });

    expect(lCh.withIndex).toHaveBeenCalledWith('by_user', expect.any(Function));
  });
});

// ── listLeavesPaginated ──────────────────────────────────────────────────────
describe('listLeavesPaginated', () => {
  it('returns an empty page for unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    const res = (await handlers.listLeavesPaginated(ctx, {
      paginationOpts,
    })) as any;
    expect(res).toEqual({ page: [], isDone: true, continueCursor: '' });
  });

  it('superadmin paginates all leaves without an org filter', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', ORG_A, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.paginate.mockResolvedValue({ page: [leaveDoc()], isDone: true, continueCursor: '' });

    const res = (await handlers.listLeavesPaginated(ctx, { paginationOpts })) as any;

    expect(res.page).toHaveLength(1);
    expect(lCh.withIndex).not.toHaveBeenCalled();
    expect(lCh.paginate).toHaveBeenCalledWith(paginationOpts);
  });

  it('superadmin paginates an org-scoped subset when organizationId is given', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', ORG_A, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.paginate.mockResolvedValue({ page: [leaveDoc()], isDone: true, continueCursor: '' });

    await handlers.listLeavesPaginated(ctx, { paginationOpts, organizationId: ORG_B });

    expect(lCh.withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('staff paginates the chosen organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.paginate.mockResolvedValue({ page: [], isDone: true, continueCursor: '' });

    await handlers.listLeavesPaginated(ctx, { paginationOpts, organizationId: ORG_B });

    expect(lCh.withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('staff falls back to their own organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor'));
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.paginate.mockResolvedValue({ page: [], isDone: true, continueCursor: '' });

    await handlers.listLeavesPaginated(ctx, { paginationOpts });

    expect(lCh.withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('staff without an organization gets an empty page', async () => {
    mockGetAuthCaller.mockResolvedValue(callerWithoutOrg('admin', ADMIN_ID));
    const { ctx, db } = makeCtx();
    const res = (await handlers.listLeavesPaginated(ctx, { paginationOpts })) as any;
    expect(res).toEqual({ page: [], isDone: true, continueCursor: '' });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('employees only paginate their own leaves', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('driver'));
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.paginate.mockResolvedValue({ page: [], isDone: true, continueCursor: '' });

    await handlers.listLeavesPaginated(ctx, { paginationOpts, organizationId: ORG_A });

    expect(lCh.withIndex).toHaveBeenCalledWith('by_user', expect.any(Function));
  });
});

// ── getLeavesForOrganization ─────────────────────────────────────────────────
describe('getLeavesForOrganization', () => {
  it('returns [] for unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    await expect(
      handlers.getLeavesForOrganization(ctx, { organizationId: ORG_A }),
    ).resolves.toEqual([]);
  });

  it('lets a superadmin read any organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', ORG_B, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.take.mockResolvedValue([leaveDoc()]);

    const res = (await handlers.getLeavesForOrganization(ctx, {
      organizationId: ORG_A,
    })) as any[];

    expect(res).toHaveLength(1);
    expect(lCh.withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('lets same-org staff read the queue', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.take.mockResolvedValue([leaveDoc()]);

    const res = (await handlers.getLeavesForOrganization(ctx, {
      organizationId: ORG_A,
    })) as any[];

    expect(res).toHaveLength(1);
  });

  it('employees see only their own leaves', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.take.mockResolvedValue([leaveDoc()]);

    await handlers.getLeavesForOrganization(ctx, { organizationId: ORG_A });

    expect(lCh.withIndex).toHaveBeenCalledWith('by_user', expect.any(Function));
  });

  it('denies staff querying a foreign organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor'));
    const { ctx, db } = makeCtx();
    const res = (await handlers.getLeavesForOrganization(ctx, {
      organizationId: ORG_B,
    })) as any[];
    expect(res).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });
});

// ── getUserLeaves ────────────────────────────────────────────────────────────
describe('getUserLeaves', () => {
  it('returns the raw leaves for the given user id', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.take.mockResolvedValue([leaveDoc()]);

    const res = (await handlers.getUserLeaves(ctx, { userId: USER_ID })) as any[];

    expect(res).toHaveLength(1);
    expect(lCh.withIndex).toHaveBeenCalledWith('by_user', expect.any(Function));
    expect(lCh.order).toHaveBeenCalledWith('desc');
  });
});

// ── getPendingLeaves ─────────────────────────────────────────────────────────
describe('getPendingLeaves', () => {
  it('returns [] for unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    await expect(handlers.getPendingLeaves(ctx, {})).resolves.toEqual([]);
  });

  it('lets a superadmin see all pending leaves', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', ORG_A, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.take.mockResolvedValue([leaveDoc()]);

    const res = (await handlers.getPendingLeaves(ctx, {})) as any[];

    expect(res).toHaveLength(1);
    expect(lCh.withIndex).not.toHaveBeenCalled();
    // enrichment without reviewers
    expect(mockEnrich).toHaveBeenCalledWith(ctx, expect.any(Array), false);
  });

  it('throws for a user without an organization', async () => {
    mockGetAuthCaller.mockResolvedValue(callerWithoutOrg('employee', USER_ID));
    const { ctx } = makeCtx();
    await expect(handlers.getPendingLeaves(ctx, {})).rejects.toThrow(
      'User does not belong to an organization',
    );
  });

  it('reads the org pending queue by status index', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor'));
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.take.mockResolvedValue([leaveDoc()]);

    const res = (await handlers.getPendingLeaves(ctx, {})) as any[];

    expect(res).toHaveLength(1);
    expect(lCh.withIndex).toHaveBeenCalledWith('by_org_status', expect.any(Function));
  });
});

// ── getLeaveStats ────────────────────────────────────────────────────────────
describe('getLeaveStats', () => {
  const today = new Date().toISOString().split('T')[0] || '';

  it('returns [] for unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    await expect(handlers.getLeaveStats(ctx, {})).resolves.toEqual([]);
  });

  it('superadmin sees stats across all leaves', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', ORG_A, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.take.mockResolvedValue([
      leaveDoc({ _id: 'l1', status: 'pending' }),
      leaveDoc({ _id: 'l2', status: 'approved' }),
      leaveDoc({ _id: 'l3', status: 'approved', startDate: today, endDate: today }),
      leaveDoc({ _id: 'l4', status: 'rejected' }),
      leaveDoc({ _id: 'l5', status: 'cancel_requested' }),
    ]);

    const res = (await handlers.getLeaveStats(ctx, {})) as any;

    expect(res).toEqual({
      total: 5,
      pending: 1,
      approved: 2,
      rejected: 1,
      pendingCancellations: 1,
      onLeaveToday: 1,
    });
  });

  it('staff reads their own org stats', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.take.mockResolvedValue([leaveDoc({ status: 'approved' })]);

    const res = (await handlers.getLeaveStats(ctx, {})) as any;

    expect(res.approved).toBe(1);
    expect(lCh.withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('throws for staff without an organization', async () => {
    mockGetAuthCaller.mockResolvedValue(callerWithoutOrg('admin', ADMIN_ID));
    const { ctx, db } = makeCtx();
    await expect(handlers.getLeaveStats(ctx, {})).rejects.toThrow(
      'User does not belong to an organization',
    );
    expect(db.query).not.toHaveBeenCalled();
  });

  it('employees only see personal stats', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('driver'));
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.take.mockResolvedValue([leaveDoc({ status: 'pending' })]);

    const res = (await handlers.getLeaveStats(ctx, {})) as any;

    expect(res.pending).toBe(1);
    expect(lCh.withIndex).toHaveBeenCalledWith('by_user', expect.any(Function));
  });
});

// ── getUnreadCount ───────────────────────────────────────────────────────────
describe('getUnreadCount', () => {
  it('returns 0 for unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    await expect(handlers.getUnreadCount(ctx, {})).resolves.toBe(0);
  });

  it('superadmin counts unread pending leaves across all organizations', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', ORG_A, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.take.mockResolvedValue([
      leaveDoc({ _id: 'l1', isRead: false, status: 'pending' }),
      leaveDoc({ _id: 'l2', isRead: true, status: 'pending' }),
      leaveDoc({ _id: 'l3', isRead: undefined, status: 'pending' }),
      leaveDoc({ _id: 'l4', isRead: false, status: 'approved' }),
    ]);

    const res = (await handlers.getUnreadCount(ctx, {})) as any;

    expect(res).toBe(2);
  });

  it('staff counts unread pending in their org', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor'));
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.take.mockResolvedValue([leaveDoc({ isRead: false, status: 'pending' })]);

    const res = (await handlers.getUnreadCount(ctx, {})) as any;

    expect(res).toBe(1);
    expect(lCh.withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('employees always see 0', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx } = makeCtx();
    await expect(handlers.getUnreadCount(ctx, {})).resolves.toBe(0);
  });
});

// ── getLeavesPagederated ─────────────────────────────────────────────────────
describe('getLeavesPagederated', () => {
  it('returns an empty page for unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    await expect(handlers.getLeavesPagederated(ctx, { pageSize: 20 })).resolves.toEqual({
      items: [],
      hasMore: false,
    });
  });

  it('superadmin pages all leaves without a cursor', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', ORG_A, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.take.mockResolvedValue([
      leaveDoc({ _id: 'l1', _creationTime: 100 }),
      leaveDoc({ _id: 'l2', _creationTime: 90 }),
    ]);

    const res = (await handlers.getLeavesPagederated(ctx, { pageSize: 20 })) as any;

    expect(res.items).toHaveLength(2);
    expect(res.hasMore).toBe(false);
    expect(res.nextCursor).toBeUndefined();
    expect(lCh.withIndex).not.toHaveBeenCalled();
  });

  it('superadmin pages with a creation-time cursor filter', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', ORG_A, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.take.mockResolvedValue([leaveDoc({ _id: 'l1' })]);

    const res = (await handlers.getLeavesPagederated(ctx, {
      pageSize: 20,
      cursor: encodeCursor({ _creationTime: 123 }),
    })) as any;

    expect(res.items).toHaveLength(1);
    expect(lCh.filter).toHaveBeenCalled();
  });

  it('returns an empty page for a user without an organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', undefined, USER_ID));
    const { ctx } = makeCtx();
    await expect(handlers.getLeavesPagederated(ctx, { pageSize: 20 })).resolves.toEqual({
      items: [],
      hasMore: false,
    });
  });

  it('employees page with the by_user index and a cursor filter', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.take.mockResolvedValue([leaveDoc({ _id: 'l1' })]);

    const res = (await handlers.getLeavesPagederated(ctx, {
      pageSize: 5,
      cursor: encodeCursor({ _creationTime: 123 }),
    })) as any;

    expect(res.items).toHaveLength(1);
    expect(lCh.withIndex).toHaveBeenCalledWith('by_user', expect.any(Function));
    expect(lCh.filter).toHaveBeenCalled();
  });

  it('computes hasMore and the next cursor when a full page comes back', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, chains } = makeCtx();
    const lCh = chain(chains, 'leaveRequests');
    lCh.take.mockResolvedValue([
      leaveDoc({ _id: 'l1', _creationTime: 100 }),
      leaveDoc({ _id: 'l2', _creationTime: 90 }),
      leaveDoc({ _id: 'l3', _creationTime: 80 }), // the (pageSize+1)th row
    ]);

    const res = (await handlers.getLeavesPagederated(ctx, { pageSize: 2 })) as any;

    expect(res.items).toHaveLength(2);
    expect(res.hasMore).toBe(true);
    expect(res.nextCursor).toBe(encodeCursor({ _creationTime: 90 }));
  });
});

// ── getLeaveById ─────────────────────────────────────────────────────────────
describe('getLeaveById', () => {
  it('returns null for a missing leave', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(handlers.getLeaveById(ctx, { leaveId: LEAVE_ID })).resolves.toBeNull();
  });

  it('returns null for unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc());
    await expect(handlers.getLeaveById(ctx, { leaveId: LEAVE_ID })).resolves.toBeNull();
  });

  it('returns null for a non-owner employee', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, 'someone_else'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc());
    await expect(handlers.getLeaveById(ctx, { leaveId: LEAVE_ID })).resolves.toBeNull();
  });

  it('returns the enriched leave for the owner', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx, get } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc())
      .mockResolvedValueOnce({ _id: USER_ID, name: 'Anna', department: 'Eng' });
    mockGetProfile.mockResolvedValue({ department: 'HR', employeeType: 'staff' });

    const res = (await handlers.getLeaveById(ctx, { leaveId: LEAVE_ID })) as any;

    expect(res.userName).toBe('Anna');
    expect(res.userDepartment).toBe('HR'); // profile wins
  });

  it('lets a same-org admin read any leave and falls back to user department', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc({ userId: USER_ID }));
    get.mockResolvedValueOnce({ _id: USER_ID, name: 'Anna', department: 'Eng' });
    mockGetProfile.mockResolvedValue(null);

    const res = (await handlers.getLeaveById(ctx, { leaveId: LEAVE_ID })) as any;

    expect(res.userName).toBe('Anna');
    expect(res.userDepartment).toBe('Eng');
  });

  it('lets a superadmin read any leave', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', ORG_B, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc({ userId: USER_ID }));
    get.mockResolvedValueOnce(null);
    mockGetProfile.mockResolvedValue(null);

    const res = (await handlers.getLeaveById(ctx, { leaveId: LEAVE_ID })) as any;

    expect(res.userName).toBe('Unknown');
  });
});
