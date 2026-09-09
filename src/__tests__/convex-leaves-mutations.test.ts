/**
 * Tests for convex/leaves/mutations.ts — create/approve/reject/update/delete,
 * bulk operations, SLA metrics and the secured approve/reject mutations.
 *
 * Pattern: convex-leaves-rbac.test.ts — mock `_generated/server`, getAuthCaller,
 * lib/auth, lib/userProfile and lib/notify; require the module inside
 * jest.isolateModules.
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

// The reporting-line approval refactor routes reviews through leaves/approval
// (assertMayReview / reviewRefusal / resolveApprovalRoute). These unit tests
// stub that gate and assert the mutation flows around it; the gate itself is
// covered by convex-leaves.integration.test.ts.
jest.mock('../../convex/leaves/approval', () => ({
  assertMayReview: jest.fn(),
  resolveApprovalRoute: jest.fn(),
  reviewRefusal: jest.fn(),
  HEAD_AUTO_APPROVAL_NOTE: 'Auto-approved: head policy',
}));

// ── Module under test ────────────────────────────────────────────────────────
import { internal } from '../../convex/_generated/api';

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
  // Defaults: any caller may review, nothing is refused, requests route to the
  // org admin (mirrors the pre-refactor admin fan-out for these unit tests).
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

// ── Helpers ──────────────────────────────────────────────────────────────────
const ORG_A = 'org-1';
const ORG_B = 'org-2';
const LEAVE_ID = 'leave_1';
const USER_ID = 'user_emp';
const ADMIN_ID = 'user_admin';

function makeCaller(
  role: 'admin' | 'supervisor' | 'superadmin' | 'employee' | 'driver' = 'employee',
  org: string | undefined = ORG_A,
  id: string = USER_ID,
) {
  return { _id: id, role, email: 'caller@example.com', organizationId: org, name: 'Caller' };
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
    title: 'Leave Request — Anna (2026-08-10 → 2026-08-12)',
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

function makeChain() {
  const take = jest.fn().mockResolvedValue([]);
  const first = jest.fn().mockResolvedValue(null);
  const order = jest.fn().mockReturnValue({ take });
  const withIndex = jest.fn().mockReturnValue({ order, take, first });
  return { root: { withIndex, order, take, first }, withIndex, order, take, first };
}

function makeCtx() {
  const get = jest.fn();
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
      return chains.get(table)!.root;
    }),
  };
  // Approve-leave now triggers the HR Assistant digest through
  // ctx.runMutation / ctx.scheduler.runAfter. The tests only assert on
  // leaves side-effects, so the digest side-channels are no-ops.
  const runMutation = jest.fn().mockResolvedValue(undefined);
  const runQuery = jest.fn().mockResolvedValue(undefined);
  const scheduler = { runAfter: jest.fn().mockResolvedValue(undefined) };
  return { ctx: { db, runMutation, runQuery, scheduler }, get, insert, patch, remove, chains, db };
}

// ── createLeave ──────────────────────────────────────────────────────────────
describe('createLeave', () => {
  it('throws when the user does not exist', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    await expect(
      handlers.createLeave(ctx, {
        userId: USER_ID,
        type: 'paid',
        startDate: 'x',
        endDate: 'y',
        days: 1,
        reason: 'r',
      }),
    ).rejects.toThrow('User not found');
  });

  it('throws for unapproved accounts', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ isApproved: false }));

    await expect(
      handlers.createLeave(ctx, {
        userId: USER_ID,
        type: 'paid',
        startDate: 'x',
        endDate: 'y',
        days: 1,
        reason: 'r',
      }),
    ).rejects.toThrow('Account pending approval');
  });

  it('throws for users without an organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ organizationId: undefined }));

    await expect(
      handlers.createLeave(ctx, {
        userId: USER_ID,
        type: 'paid',
        startDate: 'x',
        endDate: 'y',
        days: 1,
        reason: 'r',
      }),
    ).rejects.toThrow('User does not belong to an organization');
  });

  it('creates the request, notifies the employee and all org admins, and audits', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get, insert } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ name: 'Anna' }));

    const id = await handlers.createLeave(ctx, {
      userId: USER_ID,
      type: 'paid',
      startDate: '2026-08-10',
      endDate: '2026-08-12',
      days: 3,
      reason: 'Family event',
      comment: 'please',
    });

    expect(id).toBe(LEAVE_ID);
    expect(insert).toHaveBeenCalledWith(
      'leaveRequests',
      expect.objectContaining({ organizationId: ORG_A, status: 'pending', isRead: false }),
    );
    // employee acknowledgement
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ userId: USER_ID, type: 'system', route: '/leaves' }),
    );
    // admin notification (only the non-self admin)
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ userId: ADMIN_ID, type: 'leave_request' }),
    );
    expect(insert).toHaveBeenCalledWith(
      'slaMetrics',
      expect.objectContaining({ targetResponseTime: 24 }),
    );
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'leave_created', organizationId: ORG_A }),
    );
  });
});

// ── approveLeave / rejectLeave ───────────────────────────────────────────────
describe('approveLeave', () => {
  it('rejects unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();

    await expect(handlers.approveLeave(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('throws for a missing leave', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    await expect(handlers.approveLeave(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'Leave request not found',
    );
  });

  it('throws when the leave is not pending', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc({ status: 'approved' }));

    await expect(handlers.approveLeave(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'Leave is not pending',
    );
  });

  it('rejects a cross-organization reviewer', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_B, ADMIN_ID));
    mockAssertMayReview.mockRejectedValue(new Error('Access denied: cross-organization operation'));
    const { ctx, get } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc())
      .mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'admin', organizationId: ORG_B }));

    await expect(handlers.approveLeave(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'Access denied: cross-organization operation',
    );
  });

  it('rejects a non-admin reviewer', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    mockAssertMayReview.mockRejectedValue(
      new Error('You do not have permission to review leave requests'),
    );
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc()).mockResolvedValueOnce(userDoc());

    await expect(handlers.approveLeave(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'You do not have permission to review leave requests',
    );
  });

  it('approves, deducts the paid balance, updates the SLA and audits', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch, insert, db } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc());
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'admin', name: 'Boss' }));
    get.mockResolvedValueOnce(signatureDoc()); // leave-request document (completed)
    get.mockResolvedValueOnce(userDoc({ paidLeaveBalance: 24 })); // leave owner
    const metricCh = makeChain();
    metricCh.first.mockResolvedValueOnce({
      _id: 'metric_1',
      submittedAt: Date.now() - 60 * 60 * 1000,
      targetResponseTime: 24,
    });
    db.query.mockImplementation(() => metricCh.root);

    const result = await handlers.approveLeave(ctx, { leaveId: LEAVE_ID, comment: 'ok' });

    expect(result).toBe(LEAVE_ID);
    expect(patch).toHaveBeenCalledWith(
      LEAVE_ID,
      expect.objectContaining({ status: 'approved', reviewedBy: ADMIN_ID, reviewComment: 'ok' }),
    );
    expect(mockPatchProfile).toHaveBeenCalledWith(
      ctx,
      USER_ID,
      expect.objectContaining({ paidLeaveBalance: 21 }),
    );
    expect(patch).toHaveBeenCalledWith(
      'metric_1',
      expect.objectContaining({ status: 'on_time', slaScore: expect.any(Number) }),
    );
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'leave_approved' }),
    );
  });

  it('deducts the sick balance for sick leave', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A, ADMIN_ID));
    const { ctx, get, chains } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc({ type: 'sick' }));
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'supervisor', name: 'Boss' }));
    get.mockResolvedValueOnce(signatureDoc()); // leave-request document (completed)
    get.mockResolvedValueOnce(userDoc({ sickLeaveBalance: 10 }));

    await handlers.approveLeave(ctx, { leaveId: LEAVE_ID });

    expect(mockPatchProfile).toHaveBeenCalledWith(
      ctx,
      USER_ID,
      expect.objectContaining({ sickLeaveBalance: 7 }),
    );
  });

  it('clamps the balance at zero', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc({ type: 'family' }));
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'admin', name: 'Boss' }));
    get.mockResolvedValueOnce(signatureDoc()); // leave-request document (completed)
    get.mockResolvedValueOnce(userDoc({ familyLeaveBalance: 2 })); // 2 - 3 → 0

    await handlers.approveLeave(ctx, { leaveId: LEAVE_ID });

    expect(mockPatchProfile).toHaveBeenCalledWith(
      ctx,
      USER_ID,
      expect.objectContaining({ familyLeaveBalance: 0 }),
    );
  });
});

describe('rejectLeave', () => {
  it('rejects the leave and updates the SLA to breached for a late response', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch, insert, db } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc());
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'admin', name: 'Boss' }));
    const metricCh = makeChain();
    metricCh.first.mockResolvedValueOnce({
      _id: 'metric_1',
      submittedAt: Date.now() - 48 * 60 * 60 * 1000,
      targetResponseTime: 24,
    });
    db.query.mockImplementation(() => metricCh.root);

    const result = await handlers.rejectLeave(ctx, { leaveId: LEAVE_ID, comment: 'no' });

    expect(result).toBe(LEAVE_ID);
    expect(patch).toHaveBeenCalledWith(
      LEAVE_ID,
      expect.objectContaining({ status: 'rejected', reviewComment: 'no' }),
    );
    expect(patch).toHaveBeenCalledWith('metric_1', expect.objectContaining({ status: 'breached' }));
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ userId: USER_ID, type: 'leave_rejected' }),
    );
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'leave_rejected' }),
    );
  });

  it('throws for a non-admin reviewer', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('driver', ORG_A, 'user_driver'));
    mockAssertMayReview.mockRejectedValue(
      new Error('You do not have permission to review leave requests'),
    );
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc()).mockResolvedValueOnce(userDoc({ role: 'driver' }));

    await expect(handlers.rejectLeave(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'You do not have permission to review leave requests',
    );
  });
});

// ── updateLeave ──────────────────────────────────────────────────────────────
describe('updateLeave', () => {
  it('lets the owner edit a pending leave', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get, patch, insert } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc()).mockResolvedValueOnce(userDoc());

    const result = await handlers.updateLeave(ctx, {
      leaveId: LEAVE_ID,
      days: 4,
      reason: 'New reason',
    });

    expect(result).toBe(LEAVE_ID);
    // leaveId must be stripped from the patch payload
    const patchArgs = patch.mock.calls[0] as [string, Record<string, unknown>];
    expect(patchArgs[1]).not.toHaveProperty('leaveId');
    expect(patchArgs[1]).toMatchObject({
      days: 4,
      reason: 'New reason',
      updatedAt: expect.any(Number),
    });
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'leave_updated' }),
    );
  });

  it('lets an admin edit somebody else\u2019s leave and notifies the owner', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc({ userId: USER_ID }));
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'admin', name: 'Boss' }));

    await handlers.updateLeave(ctx, { leaveId: LEAVE_ID, startDate: '2026-09-01' });

    expect(patch).toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ userId: USER_ID, type: 'leave_request' }),
    );
  });

  it('denies a non-admin editing somebody else\u2019s leave', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, 'user_other'));
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc({ userId: USER_ID }));
    get.mockResolvedValueOnce(userDoc({ _id: 'user_other' }));

    await expect(handlers.updateLeave(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'You can only edit your own leave requests',
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it('denies an owner editing an approved leave', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc({ status: 'approved' })).mockResolvedValueOnce(userDoc());

    await expect(handlers.updateLeave(ctx, { leaveId: LEAVE_ID, days: 2 })).rejects.toThrow(
      'Only pending leaves can be edited',
    );
    expect(patch).not.toHaveBeenCalled();
  });
});

// ── deleteLeave / forceDeleteLeave ───────────────────────────────────────────
describe('deleteLeave', () => {
  it('restores the balance when an admin deletes an approved paid leave', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch, remove, insert } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc({ status: 'approved', days: 3 })) // leave
      .mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'admin' })) // requester = admin
      .mockResolvedValueOnce(userDoc({ paidLeaveBalance: 21 })); // leave owner

    const result = await handlers.deleteLeave(ctx, { leaveId: LEAVE_ID });

    expect(result).toBe(LEAVE_ID);
    expect(mockPatchProfile).toHaveBeenCalledWith(
      ctx,
      USER_ID,
      expect.objectContaining({ paidLeaveBalance: 24 }),
    );
    expect(remove).toHaveBeenCalledWith(LEAVE_ID);
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'leave_deleted' }),
    );
  });

  it('denies an employee — even the owner — from deleting (cancellation goes to HR)', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get, remove } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc()).mockResolvedValueOnce(userDoc());

    await expect(handlers.deleteLeave(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'Only admins and supervisors can delete leave requests',
    );
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('forceDeleteLeave', () => {
  it('deletes without balance restoration for a superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, get, remove, insert, patch } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc({ status: 'approved' }))
      .mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'superadmin' }));

    const result = await handlers.forceDeleteLeave(ctx, { leaveId: LEAVE_ID });

    expect(result).toBe(LEAVE_ID);
    expect(remove).toHaveBeenCalledWith(LEAVE_ID);
    expect(mockPatchProfile).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'leave_force_deleted' }),
    );
  });

  it('denies non-superadmins', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, remove } = makeCtx();
    get
      .mockResolvedValueOnce(leaveDoc())
      .mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'admin' }));

    await expect(handlers.forceDeleteLeave(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'Only superadmin can force delete leaves',
    );
    expect(remove).not.toHaveBeenCalled();
  });
});

// ── mark read ────────────────────────────────────────────────────────────────
describe('markLeaveAsRead / markAllLeavesAsRead', () => {
  it('marks a single leave as read', async () => {
    const { ctx, get, patch, insert } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc());

    const result = await handlers.markLeaveAsRead(ctx, { leaveId: LEAVE_ID });

    expect(result).toBe(LEAVE_ID);
    expect(patch).toHaveBeenCalledWith(LEAVE_ID, { isRead: true });
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'leave_marked_read' }),
    );
  });

  it('marks all unread leaves as read for an admin organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch, insert, db } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'admin' }));
    const leavesCh = makeChain();
    leavesCh.take.mockResolvedValue([
      leaveDoc({ isRead: false }),
      leaveDoc({ _id: 'l2', isRead: true }),
      leaveDoc({ _id: 'l3', isRead: undefined }),
    ]);
    db.query.mockImplementation(() => leavesCh.root);

    const count = await handlers.markAllLeavesAsRead(ctx, {});

    expect(count).toBe(2);
    expect(patch).toHaveBeenCalledWith(LEAVE_ID, { isRead: true });
    expect(patch).toHaveBeenCalledWith('l3', { isRead: true });
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'all_leaves_marked_read' }),
    );
  });

  it('lets a superadmin mark everything as read without an index', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, get, patch, db } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'superadmin' }));
    const leavesCh = makeChain();
    leavesCh.take.mockResolvedValue([leaveDoc({ isRead: false })]);
    db.query.mockImplementation(() => leavesCh.root);

    const count = await handlers.markAllLeavesAsRead(ctx, {});

    expect(count).toBe(1);
    expect(leavesCh.withIndex).not.toHaveBeenCalled();
    expect(leavesCh.order).toHaveBeenCalledWith('desc');
  });

  it('skips the audit log when nothing was unread', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, insert, db } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'admin' }));
    const leavesCh = makeChain();
    leavesCh.take.mockResolvedValue([leaveDoc({ isRead: true })]);
    db.query.mockImplementation(() => leavesCh.root);

    const count = await handlers.markAllLeavesAsRead(ctx, {});

    expect(count).toBe(0);
    expect(insert).not.toHaveBeenCalled();
  });
});

// ── Bulk operations ──────────────────────────────────────────────────────────
describe('bulkApproveLeaves', () => {
  it('approves pending leaves and reports per-leave errors', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch, insert } = makeCtx();
    get.mockImplementation((id: string) => {
      if (id === ADMIN_ID) return Promise.resolve(userDoc({ _id: ADMIN_ID, role: 'admin' }));
      if (id === LEAVE_ID) return Promise.resolve(leaveDoc());
      if (id === SIGNATURE_DOC_ID) return Promise.resolve(signatureDoc());
      if (id === 'leave_2')
        return Promise.resolve(leaveDoc({ _id: 'leave_2', status: 'approved' }));
      if (id === 'leave_3')
        return Promise.resolve(leaveDoc({ _id: 'leave_3', organizationId: ORG_B }));
      if (id === 'leave_4') return Promise.resolve(null);
      return Promise.resolve(userDoc({ paidLeaveBalance: 24 }));
    });

    const result = (await handlers.bulkApproveLeaves(ctx, {
      leaveIds: [LEAVE_ID, 'leave_2', 'leave_3', 'leave_4'],
    })) as any;

    expect(result.approved).toEqual([LEAVE_ID]);
    expect(result.errors).toHaveLength(3);
    expect(patch).toHaveBeenCalledWith(
      LEAVE_ID,
      expect.objectContaining({ status: 'approved', reviewedBy: ADMIN_ID }),
    );
    expect(mockPatchProfile).toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'bulk_leaves_approved' }),
    );
  });

  it('collects a per-row refusal for non-admin callers', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    mockReviewRefusal.mockResolvedValue('You do not have permission to review leave requests');
    const { ctx, get, patch } = makeCtx();
    get.mockImplementation((id: string) => {
      if (id === LEAVE_ID) return Promise.resolve(leaveDoc());
      return Promise.resolve(userDoc());
    });

    const result = (await handlers.bulkApproveLeaves(ctx, { leaveIds: [LEAVE_ID] })) as any;

    expect(result.approved).toEqual([]);
    expect(result.errors[0]).toContain('You do not have permission to review leave requests');
    expect(patch).not.toHaveBeenCalled();
  });

  it('refreshes the HR Assistant digest for every day of an approved leave', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    const { scheduler, runMutation } = ctx as any;
    get.mockImplementation((id: string) => {
      if (id === ADMIN_ID) return Promise.resolve(userDoc({ _id: ADMIN_ID, role: 'admin' }));
      if (id === LEAVE_ID) return Promise.resolve(leaveDoc());
      if (id === SIGNATURE_DOC_ID) return Promise.resolve(signatureDoc());
      return Promise.resolve(userDoc({ paidLeaveBalance: 24 }));
    });

    const result = (await handlers.bulkApproveLeaves(ctx, {
      leaveIds: [LEAVE_ID],
    })) as any;

    expect(result.approved).toEqual([LEAVE_ID]);
    // Channel seeding happens once per org before the per-day refreshes.
    expect(runMutation).toHaveBeenCalledWith(
      internal.attendance.bot.seedHrAssistantMembers,
      expect.objectContaining({ organizationId: ORG_A }),
    );
    // leaveDoc covers 2026-08-10 → 2026-08-12 → three per-day digest renders.
    // runAfter signature: (delay, functionReference, args).
    const scheduledDates = scheduler.runAfter.mock.calls
      .map((call: any[]) => (call[2] as { date: string }).date)
      .sort();
    expect(scheduledDates).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
    for (const call of scheduler.runAfter.mock.calls as any[][]) {
      expect(call[0]).toBe(0);
      // The function reference is a circular api proxy — the args (and the
      // count of calls) pin down that these are digest renders.
      expect(call[2]).toEqual(
        expect.objectContaining({
          organizationId: ORG_A,
          date: expect.stringMatching(/^2026-08-1[0-2]$/),
          trigger: 'approval',
        }),
      );
    }
  });

  it('does not touch the digest scheduler when nothing was approved', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    const { scheduler, runMutation } = ctx as any;
    get.mockImplementation((id: string) => {
      if (id === ADMIN_ID) return Promise.resolve(userDoc({ _id: ADMIN_ID, role: 'admin' }));
      if (id === LEAVE_ID) return Promise.resolve(leaveDoc({ status: 'approved' }));
      return Promise.resolve(userDoc({ paidLeaveBalance: 24 }));
    });

    const result = (await handlers.bulkApproveLeaves(ctx, {
      leaveIds: [LEAVE_ID],
    })) as any;

    expect(result.approved).toEqual([]);
    expect(scheduler.runAfter).not.toHaveBeenCalled();
    expect(runMutation).not.toHaveBeenCalled();
  });
});

describe('bulkRejectLeaves', () => {
  it('rejects pending leaves and skips invalid ones', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A, ADMIN_ID));
    const { ctx, get, patch, insert } = makeCtx();
    get.mockImplementation((id: string) => {
      if (id === ADMIN_ID) return Promise.resolve(userDoc({ _id: ADMIN_ID, role: 'supervisor' }));
      if (id === LEAVE_ID) return Promise.resolve(leaveDoc());
      return Promise.resolve(null);
    });

    const result = (await handlers.bulkRejectLeaves(ctx, {
      leaveIds: [LEAVE_ID, 'missing_1'],
      comment: 'no budget',
    })) as any;

    expect(result.rejected).toEqual([LEAVE_ID]);
    expect(result.errors).toHaveLength(1);
    expect(patch).toHaveBeenCalledWith(
      LEAVE_ID,
      expect.objectContaining({ status: 'rejected', reviewComment: 'no budget' }),
    );
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'bulk_leaves_rejected' }),
    );
  });
});

// ── Secured approve/reject ───────────────────────────────────────────────────
// secureApproveLeave / secureRejectLeave were removed by the reporting-line
// approval refactor (they only checked the organization, so any employee could
// review any request in their org, including their own). approveLeave and
// rejectLeave now go through leaves/approval.reviewRefusal instead.
