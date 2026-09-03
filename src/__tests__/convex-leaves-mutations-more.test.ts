/**
 * Tests for convex/leaves/mutations.ts — branches the main mutations suite
 * leaves open: remaining balance-deduction types (day_off/study/maternity/
 * paternity), cross-org guards in update/delete, balance restoration on delete,
 * admin notifications, SLA breach scoring, bulk error paths and the
 * markAllLeavesAsRead org branch.
 *
 * Pattern: convex-leaves-mutations.test.ts.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

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
  isSuperadminEmail: jest.fn(),
}));

jest.mock('../../convex/lib/userProfile', () => ({
  patchProfile: jest.fn(),
}));

jest.mock('../../convex/lib/notify', () => ({
  notify: jest.fn(),
}));

// The reporting-line approval refactor routes reviews through leaves/approval.
// These unit tests stub the gate and exercise the mutation flows around it.
jest.mock('../../convex/leaves/approval', () => ({
  assertMayReview: jest.fn(),
  resolveApprovalRoute: jest.fn(),
  reviewRefusal: jest.fn(),
  HEAD_AUTO_APPROVAL_NOTE: 'Auto-approved: head policy',
}));

// ── Module under test ────────────────────────────────────────────────────────
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockIsSuperadminEmail: jest.Mock;
let mockPatchProfile: jest.Mock;
let mockNotify: jest.Mock;
let mockAssertMayReview: jest.Mock;
let mockReviewRefusal: jest.Mock;
let mockResolveApprovalRoute: jest.Mock;

type Handler = (ctx: any, args: any) => Promise<unknown>;
const handlers: Record<string, Handler> = {};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  mockIsSuperadminEmail = jest.requireMock('../../convex/lib/auth').isSuperadminEmail;
  mockPatchProfile = jest.requireMock('../../convex/lib/userProfile').patchProfile;
  mockNotify = jest.requireMock('../../convex/lib/notify').notify;
  mockAssertMayReview = jest.requireMock('../../convex/leaves/approval').assertMayReview;
  mockReviewRefusal = jest.requireMock('../../convex/leaves/approval').reviewRefusal;
  mockResolveApprovalRoute = jest.requireMock('../../convex/leaves/approval').resolveApprovalRoute;
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  mockIsSuperadminEmail.mockReset();
  mockPatchProfile.mockReset();
  mockNotify.mockReset();
  mockAssertMayReview.mockReset();
  mockReviewRefusal.mockReset();
  mockResolveApprovalRoute.mockReset();
  mockAssertMayReview.mockResolvedValue(undefined);
  mockReviewRefusal.mockResolvedValue(null);
  mockResolveApprovalRoute.mockResolvedValue({
    autoApprove: false,
    reason: 'chain',
    notifyIds: [ADMIN_ID],
  });
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/leaves/mutations');
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

function makeCaller(role: string, org: string | undefined = ORG_A, id: string = ADMIN_ID) {
  return { _id: id, role, email: 'caller@example.com', organizationId: org, name: 'Caller' };
}

/** Caller that genuinely has no organization (default params can't express this). */
function callerWithoutOrg(role: string, id: string = ADMIN_ID) {
  return { _id: id, role, email: 'caller@example.com', organizationId: undefined, name: 'Caller' };
}

function userDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: USER_ID,
    name: 'Anna',
    email: 'anna@example.com',
    role: 'employee',
    organizationId: ORG_A,
    isActive: true,
    isApproved: true,
    paidLeaveBalance: 24,
    sickLeaveBalance: 10,
    familyLeaveBalance: 5,
    dayOffBalance: 6,
    studyLeaveBalance: 5,
    maternityLeaveBalance: 0,
    ...overrides,
  };
}

const SIGNATURE_DOC_ID = 'sig_doc_1';

function signatureDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: SIGNATURE_DOC_ID,
    organizationId: ORG_A,
    title: 'Leave Request — Anna',
    content: '{}',
    status: 'completed',
    ...overrides,
  };
}

function leaveDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: LEAVE_ID,
    organizationId: ORG_A,
    userId: USER_ID,
    type: 'paid',
    startDate: '2026-08-10',
    endDate: '2026-08-12',
    days: 3,
    reason: 'Family event',
    status: 'pending',
    isRead: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    leaveRequestDocumentId: SIGNATURE_DOC_ID,
    ...overrides,
  };
}

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
  node.order = jest.fn().mockReturnValue(node);
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
  const insert = jest.fn().mockResolvedValue('new_id');
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
  // Approve-leave now triggers the HR Assistant digest through
  // ctx.runMutation / ctx.scheduler.runAfter. The tests only assert on
  // leaves side-effects, so the digest side-channels are no-ops.
  const runMutation = jest.fn().mockResolvedValue(undefined);
  const runQuery = jest.fn().mockResolvedValue(undefined);
  const scheduler = { runAfter: jest.fn().mockResolvedValue(undefined) };
  return {
    ctx: { db, runMutation, runQuery, scheduler },
    get,
    insert,
    patch,
    remove,
    chains,
    db,
  };
}

function chain(chains: Map<string, ReturnType<typeof makeChain>>, table: string) {
  if (!chains.has(table)) chains.set(table, makeChain());
  return chains.get(table)!;
}

// ── approveLeave: extra balance types ────────────────────────────────────────
describe('approveLeave balance branches', () => {
  it('deducts day_off, study, maternity and paternity balances', async () => {
    for (const [type, profile, field, before] of [
      ['day_off', userDoc({ dayOffBalance: 6 }), 'dayOffBalance', 6],
      ['study', userDoc({ studyLeaveBalance: 5 }), 'studyLeaveBalance', 5],
      ['maternity', userDoc({ maternityLeaveBalance: 126 }), 'maternityLeaveBalance', 126],
      ['paternity', userDoc({ paidLeaveBalance: 24 }), 'paidLeaveBalance', 24],
    ] as const) {
      mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
      const { ctx, get, chains } = makeCtx();
      get
        .mockResolvedValueOnce(leaveDoc({ type })) // leave
        .mockResolvedValueOnce(makeCaller('admin')) // reviewer
        .mockResolvedValueOnce(signatureDoc()) // leave-request document (completed)
        .mockResolvedValueOnce(profile as any); // leave owner
      const metricCh = chain(chains, 'slaMetrics');
      metricCh.first.mockResolvedValueOnce(null); // no SLA metric

      await handlers.approveLeave(ctx, { leaveId: LEAVE_ID });

      expect(mockPatchProfile).toHaveBeenCalledWith(
        ctx,
        USER_ID,
        expect.objectContaining({ [field]: Math.max(0, before - 3) }),
      );
    }
  });

  it('scores the SLA as breached for a late response', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get, patch, chains } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc({ type: 'paid' }))
      .mockResolvedValueOnce(makeCaller('admin'))
      .mockResolvedValueOnce(signatureDoc()) // leave-request document (completed)
      .mockResolvedValueOnce(userDoc({ paidLeaveBalance: 24 }));
    const metricCh = chain(chains, 'slaMetrics');
    metricCh.first.mockResolvedValueOnce({
      _id: 'metric_1',
      submittedAt: Date.now() - 48 * 60 * 60 * 1000, // 48h late vs 24h target
      targetResponseTime: 24,
    });

    await handlers.approveLeave(ctx, { leaveId: LEAVE_ID });

    expect(patch).toHaveBeenCalledWith(
      'metric_1',
      expect.objectContaining({ status: 'breached', slaScore: expect.any(Number) }),
    );
  });
});

// ── rejectLeave: cross-org + SLA breached ────────────────────────────────────
describe('rejectLeave extra branches', () => {
  it('rejects a cross-organization reviewer', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_B));
    mockAssertMayReview.mockRejectedValue(new Error('Access denied: cross-organization operation'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc()).mockResolvedValueOnce(makeCaller('admin', ORG_B));

    await expect(handlers.rejectLeave(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'Access denied: cross-organization operation',
    );
  });
});

// ── updateLeave: cross-org + superadmin ──────────────────────────────────────
describe('updateLeave extra branches', () => {
  it('rejects a cross-organization editor', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_B));
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc()).mockResolvedValueOnce(makeCaller('admin', ORG_B));

    await expect(handlers.updateLeave(ctx, { leaveId: LEAVE_ID, days: 2 })).rejects.toThrow(
      'Access denied: cross-organization operation',
    );
    expect(patch).not.toHaveBeenCalled();
  });
});

// ── deleteLeave: restoration + cross-org + admin notify ─────────────────────
describe('deleteLeave extra branches', () => {
  it('restores every balance type when deleting an approved leave', async () => {
    for (const [type, field] of [
      ['sick', 'sickLeaveBalance'],
      ['family', 'familyLeaveBalance'],
      ['day_off', 'dayOffBalance'],
      ['study', 'studyLeaveBalance'],
      ['maternity', 'maternityLeaveBalance'],
      ['paternity', 'paidLeaveBalance'],
    ] as const) {
      // Only HR may delete — employees route cancellations through the queue.
      mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
      const { ctx, get } = makeCtx();
      get
        .mockResolvedValueOnce(leaveDoc({ type, status: 'approved' }))
        .mockResolvedValueOnce(makeCaller('admin', ORG_A, ADMIN_ID)) // requester lookup
        .mockResolvedValueOnce(userDoc()); // owner balance lookup

      await handlers.deleteLeave(ctx, { leaveId: LEAVE_ID });

      expect(mockPatchProfile).toHaveBeenCalledWith(
        ctx,
        USER_ID,
        expect.objectContaining({ [field]: expect.any(Number) }),
      );
    }
  });

  it('rejects a cross-organization deleter', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_B));
    const { ctx, get, remove } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc()).mockResolvedValueOnce(makeCaller('admin', ORG_B));

    await expect(handlers.deleteLeave(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'Access denied: cross-organization operation',
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('notifies the owner when an admin deletes a foreign approved leave', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get, remove } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc({ status: 'approved' })) // leave owned by USER_ID
      .mockResolvedValueOnce(makeCaller('admin', ORG_A, ADMIN_ID)) // requester = admin
      .mockResolvedValueOnce(userDoc({ paidLeaveBalance: 21 })); // owner

    await handlers.deleteLeave(ctx, { leaveId: LEAVE_ID });

    expect(remove).toHaveBeenCalledWith(LEAVE_ID);
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: USER_ID,
        type: 'leave_request',
        titleKey: 'notifications.titles.leaveDeleted',
      }),
    );
  });

  it('restores the balance when HR deletes a cancel_requested leave that was approved', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get
      .mockResolvedValueOnce(
        leaveDoc({ status: 'cancel_requested', previousStatus: 'approved', days: 3 }),
      )
      .mockResolvedValueOnce(makeCaller('admin', ORG_A, ADMIN_ID)) // requester = admin
      .mockResolvedValueOnce(userDoc({ paidLeaveBalance: 21 })); // owner

    await handlers.deleteLeave(ctx, { leaveId: LEAVE_ID });

    expect(mockPatchProfile).toHaveBeenCalledWith(
      ctx,
      USER_ID,
      expect.objectContaining({ paidLeaveBalance: 24 }),
    );
  });

  it('does not restore the balance for a cancel_requested leave that was never approved', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc({ status: 'cancel_requested', previousStatus: 'pending' }))
      .mockResolvedValueOnce(makeCaller('admin', ORG_A, ADMIN_ID));

    await handlers.deleteLeave(ctx, { leaveId: LEAVE_ID });

    expect(mockPatchProfile).not.toHaveBeenCalled();
  });

  it('notifies the owner with the cancellation-approved message when HR approves a cancellation', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc({ status: 'cancel_requested', previousStatus: 'approved' }))
      .mockResolvedValueOnce(makeCaller('admin', ORG_A, ADMIN_ID));

    await handlers.deleteLeave(ctx, { leaveId: LEAVE_ID });

    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: USER_ID,
        titleKey: 'notifications.titles.leaveCancellationApproved',
      }),
    );
  });
});

// ── deleteLeave on the caller's OWN leave → reporting line ───────────────────
describe('deleteLeave — HR deleting their own leave', () => {
  it('routes the deletion up the reporting line instead of deleting', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch, remove, insert } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc({ userId: ADMIN_ID, status: 'approved', days: 3 })) // leave, owned by the admin
      .mockResolvedValueOnce(makeCaller('admin', ORG_A, ADMIN_ID)); // requester
    mockResolveApprovalRoute.mockResolvedValue({
      autoApprove: false,
      reason: 'chain',
      notifyIds: ['user_ceo', ADMIN_ID],
    });

    await handlers.deleteLeave(ctx, { leaveId: LEAVE_ID });

    // Not deleted — the row now waits for the manager above to decide.
    expect(remove).not.toHaveBeenCalled();
    expect(patch).toHaveBeenCalledWith(
      LEAVE_ID,
      expect.objectContaining({ status: 'cancel_requested', previousStatus: 'approved' }),
    );
    // The manager above is notified; the requester (self) is skipped.
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: 'user_ceo',
        titleKey: 'notifications.titles.leaveCancelRequested',
      }),
    );
    expect(mockNotify).not.toHaveBeenCalledWith(ctx, expect.objectContaining({ userId: ADMIN_ID }));
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'leave_cancel_requested' }),
    );
    // No balance movement while the deletion is pending.
    expect(mockPatchProfile).not.toHaveBeenCalled();
  });

  it('auto-applies the deletion when nobody above can approve (head/auto)', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch, remove, insert } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc({ userId: ADMIN_ID, status: 'approved', days: 3 })) // leave, owned by the admin
      .mockResolvedValueOnce(makeCaller('admin', ORG_A, ADMIN_ID)) // requester
      .mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, paidLeaveBalance: 21 })); // owner balance
    mockResolveApprovalRoute.mockResolvedValue({
      autoApprove: true,
      reason: 'head_auto',
      notifyIds: [],
    });

    await handlers.deleteLeave(ctx, { leaveId: LEAVE_ID });

    expect(remove).toHaveBeenCalledWith(LEAVE_ID);
    expect(patch).not.toHaveBeenCalled();
    expect(mockPatchProfile).toHaveBeenCalledWith(
      ctx,
      ADMIN_ID,
      expect.objectContaining({ paidLeaveBalance: 24 }),
    );
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'leave_deleted' }),
    );
  });
});

// ── requestLeaveCancellation: HR cancelling their own leave → reporting line ─
describe('requestLeaveCancellation — HR cancelling their own leave', () => {
  it('routes an HR requester to the reporting line, not the HR queue', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch, insert } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc({ userId: ADMIN_ID, status: 'approved' })) // leave, owned by the admin
      .mockResolvedValueOnce(makeCaller('admin', ORG_A, ADMIN_ID)); // requester = HR
    mockResolveApprovalRoute.mockResolvedValue({
      autoApprove: false,
      reason: 'chain',
      notifyIds: ['user_ceo', ADMIN_ID],
    });

    const result = await handlers.requestLeaveCancellation(ctx, {
      leaveId: LEAVE_ID,
      comment: 'plans changed',
    });

    expect(result).toBe(LEAVE_ID);
    expect(patch).toHaveBeenCalledWith(
      LEAVE_ID,
      expect.objectContaining({ status: 'cancel_requested', previousStatus: 'approved' }),
    );
    // The manager above is notified; the requester (self) is skipped.
    expect(mockNotify).toHaveBeenCalledWith(ctx, expect.objectContaining({ userId: 'user_ceo' }));
    expect(mockNotify).not.toHaveBeenCalledWith(ctx, expect.objectContaining({ userId: ADMIN_ID }));
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'leave_cancel_requested', userId: ADMIN_ID }),
    );
  });
});

// ── markAllLeavesAsRead ──────────────────────────────────────────────────────
describe('markAllLeavesAsRead extra branches', () => {
  it('throws for a user without an organization who is not a superadmin email', async () => {
    mockGetAuthCaller.mockResolvedValue(callerWithoutOrg('employee', USER_ID));
    mockIsSuperadminEmail.mockReturnValue(false);
    const { ctx, get } = makeCtx();
    // The requester row also has no organization.
    get.mockResolvedValueOnce(callerWithoutOrg('employee', USER_ID));

    await expect(handlers.markAllLeavesAsRead(ctx, {})).rejects.toThrow(
      'User does not belong to an organization',
    );
  });

  it('lets a superadmin email user without an org mark leaves read', async () => {
    mockGetAuthCaller.mockResolvedValue(callerWithoutOrg('employee', USER_ID));
    mockIsSuperadminEmail.mockReturnValue(true);
    const { ctx, get, patch, chains } = makeCtx();
    get.mockResolvedValueOnce(callerWithoutOrg('employee', USER_ID));
    const lCh = chain(chains, 'leaveRequests');
    lCh.take.mockResolvedValue([leaveDoc({ isRead: false })]);

    const count = (await handlers.markAllLeavesAsRead(ctx, {})) as any;

    expect(count).toBe(1);
    expect(patch).toHaveBeenCalledWith(LEAVE_ID, { isRead: true });
  });

  it('marks leaves read in the org branch and audits the count', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor'));
    const { ctx, get, patch, insert, chains } = makeCtx();
    get.mockResolvedValueOnce(makeCaller('supervisor'));
    const lCh = chain(chains, 'leaveRequests');
    lCh.take.mockResolvedValue([
      leaveDoc({ _id: 'l1', isRead: false }),
      leaveDoc({ _id: 'l2', isRead: true }),
    ]);

    const count = (await handlers.markAllLeavesAsRead(ctx, {})) as any;

    expect(count).toBe(1);
    expect(lCh.withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
    expect(patch).toHaveBeenCalledWith('l1', { isRead: true });
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'all_leaves_marked_read' }),
    );
  });
});

// ── bulkApproveLeaves: balance types, SLA, cross-org, errors ─────────────────
describe('bulkApproveLeaves extra branches', () => {
  it('deducts sick/family/day_off/study/maternity/paternity balances', async () => {
    const cases = [
      ['sick', userDoc({ sickLeaveBalance: 10 }), 'sickLeaveBalance'],
      ['family', userDoc({ familyLeaveBalance: 5 }), 'familyLeaveBalance'],
      ['day_off', userDoc({ dayOffBalance: 6 }), 'dayOffBalance'],
      ['study', userDoc({ studyLeaveBalance: 5 }), 'studyLeaveBalance'],
      ['maternity', userDoc({ maternityLeaveBalance: 126 }), 'maternityLeaveBalance'],
      ['paternity', userDoc({ paidLeaveBalance: 24 }), 'paidLeaveBalance'],
    ] as const;

    for (const [type, profile, field] of cases) {
      mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
      const { ctx, get, chains } = makeCtx();
      // reviewer + leave + owner (usersBatch) + document (in approval loop)
      get
        .mockResolvedValueOnce(makeCaller('admin'))
        .mockResolvedValueOnce(leaveDoc({ type }))
        .mockResolvedValueOnce(profile as any)
        .mockResolvedValueOnce(signatureDoc()); // leave-request document (completed)
      const metricCh = chain(chains, 'slaMetrics');
      metricCh.first.mockResolvedValueOnce(null);

      const res = (await handlers.bulkApproveLeaves(ctx, {
        leaveIds: [LEAVE_ID],
      })) as any;

      expect(res.approved).toEqual([LEAVE_ID]);
      expect(mockPatchProfile).toHaveBeenCalledWith(
        ctx,
        USER_ID,
        expect.objectContaining({ [field]: expect.any(Number) }),
      );
    }
  });

  it('scores a breached SLA metric in the bulk path', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get, patch, chains } = makeCtx();
    get
      .mockResolvedValueOnce(makeCaller('admin'))
      .mockResolvedValueOnce(leaveDoc({ type: 'paid' }))
      .mockResolvedValueOnce(userDoc({ paidLeaveBalance: 24 }))
      .mockResolvedValueOnce(signatureDoc()); // leave-request document (completed)
    const metricCh = chain(chains, 'slaMetrics');
    metricCh.first.mockResolvedValueOnce({
      _id: 'metric_1',
      submittedAt: Date.now() - 100 * 60 * 60 * 1000,
      targetResponseTime: 24,
    });

    await handlers.bulkApproveLeaves(ctx, { leaveIds: [LEAVE_ID] });

    expect(patch).toHaveBeenCalledWith(
      'metric_1',
      expect.objectContaining({ status: 'breached', slaScore: expect.any(Number) }),
    );
  });

  it('collects per-leave errors for missing, non-pending and cross-org leaves', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor'));
    const { ctx, get, insert } = makeCtx();
    get.mockImplementation((id: string) => {
      if (id === ADMIN_ID) return Promise.resolve(makeCaller('supervisor'));
      if (id === 'leave_missing') return Promise.resolve(null);
      if (id === 'leave_done')
        return Promise.resolve(leaveDoc({ _id: 'leave_done', status: 'approved' }));
      if (id === 'leave_foreign')
        return Promise.resolve(leaveDoc({ _id: 'leave_foreign', organizationId: ORG_B }));
      if (id === 'leave_ok') return Promise.resolve(leaveDoc({ _id: 'leave_ok' }));
      if (id === SIGNATURE_DOC_ID) return Promise.resolve(signatureDoc());
      if (id === USER_ID) return Promise.resolve(userDoc({ paidLeaveBalance: 24 }));
      return Promise.resolve(null);
    });

    const res = (await handlers.bulkApproveLeaves(ctx, {
      leaveIds: ['leave_missing', 'leave_done', 'leave_foreign', 'leave_ok'],
    })) as any;

    expect(res.approved).toEqual(['leave_ok']);
    expect(res.errors).toHaveLength(3);
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'bulk_leaves_approved' }),
    );
  });

  it('catches unexpected errors per leave and still reports the rest', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', ORG_B, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, get, patch, insert } = makeCtx();
    // Order in the handler: reviewer, then the leavesBatch (both leaves), then
    // the usersBatch (deduped owner ids), then per-row document gate checks.
    get
      .mockResolvedValueOnce(makeCaller('superadmin', ORG_B, ADMIN_ID)) // reviewer
      .mockResolvedValueOnce(leaveDoc({ _id: 'leave_bad' })) // leavesBatch[0]
      .mockResolvedValueOnce(leaveDoc({ _id: 'leave_good' })) // leavesBatch[1]
      .mockResolvedValueOnce(userDoc({ paidLeaveBalance: 24 })) // usersBatch[0]
      .mockResolvedValueOnce(signatureDoc()) // leave_bad document
      .mockResolvedValueOnce(signatureDoc({ _id: 'sig_doc_2' })); // leave_good document
    // The first patch throws; the second leave still succeeds.
    patch.mockRejectedValueOnce(new Error('boom'));

    const res = (await handlers.bulkApproveLeaves(ctx, {
      leaveIds: ['leave_bad', 'leave_good'],
    })) as any;

    expect(res.approved).toEqual(['leave_good']);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain('leave_bad');
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'bulk_leaves_approved' }),
    );
  });
});

// ── bulkRejectLeaves: guard, status, cross-org, SLA, error ───────────────────
describe('bulkRejectLeaves extra branches', () => {
  it('collects a per-row refusal for non-admin callers', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    mockReviewRefusal.mockResolvedValue('You do not have permission to review leave requests');
    const { ctx, get, insert } = makeCtx();
    get.mockImplementation((id: string) => {
      if (id === LEAVE_ID) return Promise.resolve(leaveDoc());
      return Promise.resolve(makeCaller('employee'));
    });

    const res = (await handlers.bulkRejectLeaves(ctx, {
      leaveIds: [LEAVE_ID],
      comment: 'no',
    })) as any;

    expect(res.rejected).toEqual([]);
    expect(res.errors[0]).toContain('You do not have permission to review leave requests');
    expect(insert).not.toHaveBeenCalled();
  });

  it('collects non-pending and cross-org errors', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get, insert } = makeCtx();
    get.mockImplementation((id: string) => {
      if (id === ADMIN_ID) return Promise.resolve(makeCaller('admin'));
      if (id === 'leave_done')
        return Promise.resolve(leaveDoc({ _id: 'leave_done', status: 'approved' }));
      if (id === 'leave_foreign')
        return Promise.resolve(leaveDoc({ _id: 'leave_foreign', organizationId: ORG_B }));
      if (id === 'leave_ok') return Promise.resolve(leaveDoc({ _id: 'leave_ok' }));
      return Promise.resolve(null);
    });

    const res = (await handlers.bulkRejectLeaves(ctx, {
      leaveIds: ['leave_missing', 'leave_done', 'leave_foreign', 'leave_ok'],
      comment: 'no budget',
    })) as any;

    expect(res.rejected).toEqual(['leave_ok']);
    expect(res.errors).toHaveLength(3);
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'bulk_leaves_rejected' }),
    );
  });

  it('scores a breached SLA metric in the bulk reject path', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get, patch, chains } = makeCtx();
    get
      .mockResolvedValueOnce(makeCaller('admin'))
      .mockResolvedValueOnce(leaveDoc({ type: 'paid' }));
    const metricCh = chain(chains, 'slaMetrics');
    metricCh.first.mockResolvedValueOnce({
      _id: 'metric_1',
      submittedAt: Date.now() - 100 * 60 * 60 * 1000,
      targetResponseTime: 24,
    });

    await handlers.bulkRejectLeaves(ctx, { leaveIds: [LEAVE_ID], comment: 'no' });

    expect(patch).toHaveBeenCalledWith(
      'metric_1',
      expect.objectContaining({ status: 'breached', slaScore: expect.any(Number) }),
    );
  });

  it('catches unexpected errors per leave', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get, patch } = makeCtx();
    get
      .mockResolvedValueOnce(makeCaller('admin'))
      .mockResolvedValueOnce(leaveDoc({ _id: 'leave_bad' }))
      .mockResolvedValueOnce(leaveDoc({ _id: 'leave_good' }));
    patch.mockRejectedValueOnce(new Error('boom'));

    const res = (await handlers.bulkRejectLeaves(ctx, {
      leaveIds: ['leave_bad', 'leave_good'],
      comment: 'no',
    })) as any;

    expect(res.rejected).toEqual(['leave_good']);
    expect(res.errors[0]).toContain('leave_bad');
  });
});

// ── secureApproveLeave / secureRejectLeave: removed ─────────────────────────
// The reporting-line approval refactor deleted these mutations — they checked
// only the organization, so any employee could review any request in their org.
// approveLeave / rejectLeave now go through leaves/approval.reviewRefusal.

// ── requestLeaveCancellation: employee → HR queue ────────────────────────────
describe('requestLeaveCancellation', () => {
  it('asks HR to cancel an approved leave, notifies admins and audits', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, USER_ID));
    const { ctx, get, patch, insert, chains } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc({ status: 'approved' })) // leave
      .mockResolvedValueOnce(userDoc({ _id: USER_ID, name: 'Anna' })); // requester = owner
    const adminsCh = chain(chains, 'users');
    adminsCh.take.mockResolvedValue([makeCaller('admin', ORG_A, ADMIN_ID, 'Boss')]);

    const result = await handlers.requestLeaveCancellation(ctx, {
      leaveId: LEAVE_ID,
      comment: 'plans changed',
    });

    expect(result).toBe(LEAVE_ID);
    expect(patch).toHaveBeenCalledWith(
      LEAVE_ID,
      expect.objectContaining({
        status: 'cancel_requested',
        previousStatus: 'approved',
        cancelRequestedAt: expect.any(Number),
        isRead: false,
      }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: ADMIN_ID,
        titleKey: 'notifications.titles.leaveCancelRequested',
      }),
    );
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'leave_cancel_requested', userId: USER_ID }),
    );
  });

  it('notifies supervisors as well as admins', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, USER_ID));
    const { ctx, get, chains } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc({ status: 'approved' }))
      .mockResolvedValueOnce(userDoc({ _id: USER_ID, name: 'Anna' }));
    const usersCh = chain(chains, 'users');
    usersCh.take
      .mockResolvedValueOnce([makeCaller('admin', ORG_A, ADMIN_ID)]) // admin query
      .mockResolvedValueOnce([makeCaller('supervisor', ORG_A, 'user_sup')]); // supervisor query

    await handlers.requestLeaveCancellation(ctx, { leaveId: LEAVE_ID });

    expect(mockNotify).toHaveBeenCalledWith(ctx, expect.objectContaining({ userId: ADMIN_ID }));
    expect(mockNotify).toHaveBeenCalledWith(ctx, expect.objectContaining({ userId: 'user_sup' }));
  });

  it('lets the owner cancel a pending request too', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, USER_ID));
    const { ctx, get, patch, chains } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc({ status: 'pending' }))
      .mockResolvedValueOnce(userDoc({ _id: USER_ID, name: 'Anna' }));
    const adminsCh = chain(chains, 'users');
    adminsCh.take.mockResolvedValue([]);

    await handlers.requestLeaveCancellation(ctx, { leaveId: LEAVE_ID });

    expect(patch).toHaveBeenCalledWith(
      LEAVE_ID,
      expect.objectContaining({ status: 'cancel_requested', previousStatus: 'pending' }),
    );
  });

  it('denies a non-owner', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, 'user_other'));
    const { ctx, get, patch } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc())
      .mockResolvedValueOnce(makeCaller('employee', ORG_A, 'user_other'));

    await expect(handlers.requestLeaveCancellation(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'You can only request cancellation of your own leave requests',
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it('refuses to cancel a rejected leave', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, USER_ID));
    const { ctx, get, patch } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc({ status: 'rejected' }))
      .mockResolvedValueOnce(userDoc({ _id: USER_ID }));

    await expect(handlers.requestLeaveCancellation(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'Only pending or approved leaves can be cancelled',
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it('denies a cross-organization requester', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_B, USER_ID));
    const { ctx, get, patch } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc())
      .mockResolvedValueOnce(makeCaller('employee', ORG_B, USER_ID));

    await expect(handlers.requestLeaveCancellation(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'Access denied: cross-organization operation',
    );
    expect(patch).not.toHaveBeenCalled();
  });
});

// ── rejectLeaveCancellation: HR declines the request ─────────────────────────
describe('rejectLeaveCancellation', () => {
  it('restores the previous status and notifies the owner', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch, insert } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc({ status: 'cancel_requested', previousStatus: 'approved' }))
      .mockResolvedValueOnce(makeCaller('admin', ORG_A, ADMIN_ID, 'Boss'));

    const result = await handlers.rejectLeaveCancellation(ctx, {
      leaveId: LEAVE_ID,
      comment: 'no',
    });

    expect(result).toBe(LEAVE_ID);
    expect(patch).toHaveBeenCalledWith(
      LEAVE_ID,
      expect.objectContaining({
        status: 'approved',
        previousStatus: undefined,
        cancelRequestedAt: undefined,
      }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: USER_ID,
        titleKey: 'notifications.titles.leaveCancellationRejected',
        messageKey: 'notifications.messages.leaveCancellationRejectedWithReason',
      }),
    );
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'leave_cancel_rejected', userId: ADMIN_ID }),
    );
  });

  it('falls back to approved when previousStatus is missing', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A, ADMIN_ID));
    const { ctx, get, patch } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc({ status: 'cancel_requested' }))
      .mockResolvedValueOnce(makeCaller('supervisor', ORG_A, ADMIN_ID, 'Boss'));

    await handlers.rejectLeaveCancellation(ctx, { leaveId: LEAVE_ID });

    expect(patch).toHaveBeenCalledWith(LEAVE_ID, expect.objectContaining({ status: 'approved' }));
  });

  it('denies non-admin callers', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, USER_ID));
    const { ctx, get, patch } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc({ status: 'cancel_requested' }))
      .mockResolvedValueOnce(makeCaller('employee', ORG_A, USER_ID));

    await expect(handlers.rejectLeaveCancellation(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'Only admins and supervisors can reject cancellation requests',
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it('denies the owner — even HR — rejecting their own cancellation', async () => {
    // The reporting line decided to route the request here; the owner cannot
    // silently undo that by declining their own cancel_requested row.
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc({ userId: ADMIN_ID, status: 'cancel_requested' })) // owner = reviewer
      .mockResolvedValueOnce(makeCaller('admin', ORG_A, ADMIN_ID));

    await expect(handlers.rejectLeaveCancellation(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'You cannot review your own leave request',
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it('throws when the leave has no pending cancellation request', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc({ status: 'approved' }))
      .mockResolvedValueOnce(makeCaller('admin', ORG_A, ADMIN_ID));

    await expect(handlers.rejectLeaveCancellation(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'Leave has no pending cancellation request',
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it('denies a cross-organization reviewer', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_B));
    const { ctx, get, patch } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc({ status: 'cancel_requested' }))
      .mockResolvedValueOnce(makeCaller('admin', ORG_B));

    await expect(handlers.rejectLeaveCancellation(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'Access denied: cross-organization operation',
    );
    expect(patch).not.toHaveBeenCalled();
  });
});
