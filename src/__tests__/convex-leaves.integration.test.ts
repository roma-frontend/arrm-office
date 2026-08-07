/**
 * Integration tests for convex/leaves — the full leave-request lifecycle
 * against convex-test's in-memory database with the real schema.
 *
 * Covers: createLeave (tenant isolation, notifications, SLA row, audit log),
 * approveLeave / rejectLeave (RBAC, cross-org protection, balance deduction,
 * SLA update, audit), and the queue queries.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './leaves.ts': () => import('../../convex/leaves'),
  './leaves/index.ts': () => import('../../convex/leaves/index'),
  './leaves/mutations.ts': () => import('../../convex/leaves/mutations'),
  './leaves/queries.ts': () => import('../../convex/leaves/queries'),
  './leaves/helpers.ts': () => import('../../convex/leaves/helpers'),
  './lib/userProfile.ts': () => import('../../convex/lib/userProfile'),
  './lib/getAuthCaller.ts': () => import('../../convex/lib/getAuthCaller'),
  './lib/notify.ts': () => import('../../convex/lib/notify'),
} as unknown as Record<string, () => Promise<unknown>>;

type Ctx = Awaited<ReturnType<typeof seed>>;

async function insertOrg(
  ctx: { db: { insert: (table: 'organizations', doc: never) => Promise<Id<'organizations'>> } },
  name: string,
): Promise<Id<'organizations'>> {
  return await ctx.db.insert('organizations', {
    name,
    slug: `${name.toLowerCase()}-${Math.random().toString(36).slice(2)}`,
    plan: 'professional',
    isActive: true,
    createdBySuperadmin: false,
    employeeLimit: 100,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as never);
}

async function seed() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const organizationId = await insertOrg(ctx, 'Acme');

    const baseUser = {
      organizationId,
      passwordHash: 'x',
      employeeType: 'staff' as const,
      isActive: true,
      isApproved: true,
      travelAllowance: 0,
      paidLeaveBalance: 10,
      sickLeaveBalance: 5,
      familyLeaveBalance: 5,
      dayOffBalance: 4,
      createdAt: Date.now(),
    };

    const adminId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Admin',
      email: 'admin@acme.test',
      role: 'admin',
    });
    const supervisorId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Supervisor',
      email: 'supervisor@acme.test',
      role: 'supervisor',
    });
    const employeeId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Employee',
      email: 'employee@acme.test',
      role: 'employee',
    });
    const pendingEmployeeId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Pending',
      email: 'pending@acme.test',
      role: 'employee',
      isApproved: false,
    });

    return { organizationId, adminId, supervisorId, employeeId, pendingEmployeeId };
  });

  return { t, ...ids };
}

const asAdmin = (c: Ctx) => c.t.withIdentity({ email: 'admin@acme.test' });
const asSupervisor = (c: Ctx) => c.t.withIdentity({ email: 'supervisor@acme.test' });
const asEmployee = (c: Ctx) => c.t.withIdentity({ email: 'employee@acme.test' });

/** Dates in the current year to keep SLA/stats deterministic. */
function thisYearDate(month: number, day: number): string {
  const year = new Date().getFullYear();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const createArgs = (c: Ctx, userId: Id<'users'>, overrides: Record<string, unknown> = {}) => ({
  userId,
  type: 'paid',
  startDate: thisYearDate(6, 10),
  endDate: thisYearDate(6, 12),
  days: 3,
  reason: 'vacation',
  ...overrides,
});

async function createLeaveRequest(
  c: Ctx,
  by: (c: Ctx) => { mutation: (f: unknown, a: unknown) => Promise<unknown> },
  userId: Id<'users'>,
  overrides: Record<string, unknown> = {},
): Promise<Id<'leaveRequests'>> {
  const result = await by(c).mutation(api.leaves.createLeave, createArgs(c, userId, overrides));
  return result as Id<'leaveRequests'>;
}

describe('leaves.createLeave', () => {
  it('rejects a user that does not exist', async () => {
    const c = await seed();
    // Insert then delete a user so we have a valid-but-missing id.
    const ghostId = await c.t.run(async (ctx) => {
      const id = await ctx.db.insert('users', {
        organizationId: c.organizationId,
        name: 'Ghost',
        email: 'ghost@acme.test',
        passwordHash: 'x',
        role: 'employee',
        employeeType: 'staff',
        isActive: true,
        isApproved: true,
        travelAllowance: 0,
        paidLeaveBalance: 0,
        sickLeaveBalance: 0,
        familyLeaveBalance: 0,
        createdAt: Date.now(),
      });
      await ctx.db.delete(id);
      return id;
    });

    await expect(
      asEmployee(c).mutation(api.leaves.createLeave, createArgs(c, ghostId)),
    ).rejects.toThrow('User not found');
  });

  it('rejects an account pending approval', async () => {
    const c = await seed();
    await expect(
      asEmployee(c).mutation(api.leaves.createLeave, createArgs(c, c.pendingEmployeeId)),
    ).rejects.toThrow('Account pending approval');
  });

  it('creates a pending request, notifies the employee + admins, and writes SLA/audit rows', async () => {
    const c = await seed();
    const leaveId = await createLeaveRequest(c, asEmployee, c.employeeId);

    const state = await c.t.run(async (ctx) => {
      const leave = await ctx.db.get(leaveId);
      const notifications = await ctx.db.query('notifications').collect();
      const sla = await ctx.db
        .query('slaMetrics')
        .withIndex('by_leave', (q) => q.eq('leaveRequestId', leaveId))
        .first();
      const audit = (await ctx.db.query('auditLogs').collect()).map((row) => row.action);
      return { leave, notifications, sla, audit };
    });

    expect(state.leave?.status).toBe('pending');
    expect(state.leave?.organizationId).toBe(c.organizationId);
    expect(state.leave?.isRead).toBe(false);

    // Employee got the "request received" ack, the admin got a new-request notice.
    const types = state.notifications.map((n) => n.type).sort();
    expect(types).toEqual(['leave_request', 'system']);
    const adminNotice = state.notifications.find((n) => n.userId === c.adminId);
    expect(adminNotice?.type).toBe('leave_request');
    const ack = state.notifications.find((n) => n.userId === c.employeeId);
    expect(ack?.type).toBe('system');

    expect(state.sla?.status).toBe('pending');
    expect(state.sla?.targetResponseTime).toBe(24);
    expect(state.audit).toContain('leave_created');
  });

  it('does not notify the requesting admin about their own request', async () => {
    const c = await seed();
    await createLeaveRequest(c, asAdmin, c.adminId);

    const adminNotices = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('notifications').collect();
      return rows.filter((n) => n.userId === c.adminId && n.type === 'leave_request');
    });
    // Only the employee self-ack notification exists; the admin is skipped as recipient.
    expect(adminNotices).toHaveLength(0);
  });
});

describe('leaves.approveLeave', () => {
  it('requires authentication', async () => {
    const c = await seed();
    const leaveId = await createLeaveRequest(c, asEmployee, c.employeeId);
    await expect(c.t.mutation(api.leaves.approveLeave, { leaveId })).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('blocks an employee from approving', async () => {
    const c = await seed();
    const leaveId = await createLeaveRequest(c, asEmployee, c.employeeId);
    await expect(asEmployee(c).mutation(api.leaves.approveLeave, { leaveId })).rejects.toThrow(
      'Only admins and supervisors can approve leaves',
    );
  });

  it('blocks a reviewer from a different organization', async () => {
    const c = await seed();
    const leaveId = await createLeaveRequest(c, asEmployee, c.employeeId);

    const otherOrgId = await c.t.run(async (ctx) => await insertOrg(ctx, 'Other'));
    const foreignAdmin = await c.t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        organizationId: otherOrgId,
        name: 'Foreign',
        email: 'foreign@other.test',
        passwordHash: 'x',
        role: 'admin',
        employeeType: 'staff',
        isActive: true,
        isApproved: true,
        travelAllowance: 0,
        paidLeaveBalance: 0,
        sickLeaveBalance: 0,
        familyLeaveBalance: 0,
        createdAt: Date.now(),
      });
    });

    const asForeign = c.t.withIdentity({ email: 'foreign@other.test' });
    await expect(asForeign.mutation(api.leaves.approveLeave, { leaveId })).rejects.toThrow(
      'Access denied: cross-organization operation',
    );
    expect(otherOrgId).toBeDefined();
    expect(foreignAdmin).toBeDefined();
  });

  it('approves, deducts the paid balance and updates the SLA to on_time', async () => {
    const c = await seed();
    // An existing profile receives the dual-write balance deduction.
    await c.t.run(async (ctx) => {
      await ctx.db.insert('userProfiles', {
        userId: c.employeeId,
        paidLeaveBalance: 10,
      } as never);
    });
    const leaveId = await createLeaveRequest(c, asEmployee, c.employeeId);

    const result = await asAdmin(c).mutation(api.leaves.approveLeave, {
      leaveId,
      comment: 'Enjoy!',
    });

    expect(result).toBe(leaveId);

    const state = await c.t.run(async (ctx) => {
      const leave = await ctx.db.get(leaveId);
      const employee = await ctx.db.get(c.employeeId);
      const profile = await ctx.db
        .query('userProfiles')
        .withIndex('by_user', (q) => q.eq('userId', c.employeeId))
        .first();
      const sla = await ctx.db
        .query('slaMetrics')
        .withIndex('by_leave', (q) => q.eq('leaveRequestId', leaveId))
        .first();
      const notifications = await ctx.db.query('notifications').collect();
      const audit = (await ctx.db.query('auditLogs').collect()).map((row) => row.action);
      return { leave, employee, profile, sla, notifications, audit };
    });

    expect(state.leave?.status).toBe('approved');
    expect(state.leave?.reviewedBy).toBe(c.adminId);
    expect(state.leave?.reviewComment).toBe('Enjoy!');
    expect(state.leave?.reviewedAt).toEqual(expect.any(Number));

    // Balance deducted from both the user doc and the userProfiles dual-write.
    expect(state.employee?.paidLeaveBalance).toBe(7); // 10 - 3
    expect(state.profile?.paidLeaveBalance).toBe(7);

    // SLA updated: responded immediately → on_time with a high score.
    expect(state.sla?.status).toBe('on_time');
    expect(state.sla?.slaScore).toBeGreaterThanOrEqual(80);
    expect(state.sla?.responseTimeHours).toEqual(expect.any(Number));

    // Employee notified of the approval.
    expect(
      state.notifications.some((n) => n.userId === c.employeeId && n.type === 'leave_approved'),
    ).toBe(true);
    expect(state.audit).toContain('leave_approved');
  });

  it('clamps the balance at zero when the leave exceeds it', async () => {
    const c = await seed();
    const leaveId = await createLeaveRequest(c, asEmployee, c.employeeId, {
      days: 50,
      startDate: thisYearDate(6, 10),
      endDate: thisYearDate(8, 30),
    });

    await asAdmin(c).mutation(api.leaves.approveLeave, { leaveId });

    const employee = await c.t.run(async (ctx) => await ctx.db.get(c.employeeId));
    expect(employee?.paidLeaveBalance).toBe(0); // max(0, 10 - 50)
  });

  it('only touches the users table when no profile exists', async () => {
    const c = await seed();
    const leaveId = await createLeaveRequest(c, asEmployee, c.employeeId);

    await asAdmin(c).mutation(api.leaves.approveLeave, { leaveId });

    const state = await c.t.run(async (ctx) => {
      const employee = await ctx.db.get(c.employeeId);
      const profile = await ctx.db
        .query('userProfiles')
        .withIndex('by_user', (q) => q.eq('userId', c.employeeId))
        .first();
      return { paid: employee?.paidLeaveBalance, profileExists: profile !== null };
    });
    expect(state.paid).toBe(7);
    expect(state.profileExists).toBe(false);
  });

  it('refuses to approve a non-pending leave twice', async () => {
    const c = await seed();
    const leaveId = await createLeaveRequest(c, asEmployee, c.employeeId);
    await asAdmin(c).mutation(api.leaves.approveLeave, { leaveId });

    await expect(asAdmin(c).mutation(api.leaves.approveLeave, { leaveId })).rejects.toThrow(
      'Leave is not pending',
    );
  });
});

describe('leaves.rejectLeave', () => {
  it('rejects with a comment and does not touch the balance', async () => {
    const c = await seed();
    const leaveId = await createLeaveRequest(c, asEmployee, c.employeeId);

    await asSupervisor(c).mutation(api.leaves.rejectLeave, {
      leaveId,
      comment: 'Too many requests',
    });

    const state = await c.t.run(async (ctx) => {
      const leave = await ctx.db.get(leaveId);
      const employee = await ctx.db.get(c.employeeId);
      const sla = await ctx.db
        .query('slaMetrics')
        .withIndex('by_leave', (q) => q.eq('leaveRequestId', leaveId))
        .first();
      const notifications = await ctx.db.query('notifications').collect();
      const audit = (await ctx.db.query('auditLogs').collect()).map((row) => row.action);
      return { leave, employee, sla, notifications, audit };
    });

    expect(state.leave?.status).toBe('rejected');
    expect(state.leave?.reviewedBy).toBe(c.supervisorId);
    expect(state.leave?.reviewComment).toBe('Too many requests');
    // No balance deduction on rejection.
    expect(state.employee?.paidLeaveBalance).toBe(10);

    expect(state.sla?.status).toBe('on_time');
    expect(
      state.notifications.some((n) => n.userId === c.employeeId && n.type === 'leave_rejected'),
    ).toBe(true);
    expect(state.audit).toContain('leave_rejected');
  });

  it('blocks a foreign reviewer', async () => {
    const c = await seed();
    const leaveId = await createLeaveRequest(c, asEmployee, c.employeeId);

    const otherOrgId = await c.t.run(async (ctx) => await insertOrg(ctx, 'Other'));
    await c.t.run(async (ctx) => {
      await ctx.db.insert('users', {
        organizationId: otherOrgId,
        name: 'Foreign Supervisor',
        email: 'fsup@other.test',
        passwordHash: 'x',
        role: 'supervisor',
        employeeType: 'staff',
        isActive: true,
        isApproved: true,
        travelAllowance: 0,
        paidLeaveBalance: 0,
        sickLeaveBalance: 0,
        familyLeaveBalance: 0,
        createdAt: Date.now(),
      });
    });

    const asForeignSupervisor = c.t.withIdentity({ email: 'fsup@other.test' });
    await expect(asForeignSupervisor.mutation(api.leaves.rejectLeave, { leaveId })).rejects.toThrow(
      'Access denied: cross-organization operation',
    );
  });
});

describe('leaves.updateLeave', () => {
  it('lets the owner edit their own pending request', async () => {
    const c = await seed();
    const leaveId = await createLeaveRequest(c, asEmployee, c.employeeId);

    const result = await asEmployee(c).mutation(api.leaves.updateLeave, {
      leaveId,
      reason: 'family trip',
    });

    expect(result).toBe(leaveId);
    const leave = await c.t.run(async (ctx) => await ctx.db.get(leaveId));
    expect(leave?.reason).toBe('family trip');
    expect(leave?.status).toBe('pending');
  });

  it("lets an admin edit another employee's request (org-scoped)", async () => {
    const c = await seed();
    const leaveId = await createLeaveRequest(c, asEmployee, c.employeeId);

    const result = await asAdmin(c).mutation(api.leaves.updateLeave, {
      leaveId,
      days: 5,
    });
    expect(result).toBe(leaveId);

    const leave = await c.t.run(async (ctx) => await ctx.db.get(leaveId));
    expect(leave?.days).toBe(5);
    // The affected employee is notified of the admin edit.
    const notices = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('notifications').collect();
      return rows.filter((n) => n.userId === c.employeeId && n.type === 'leave_request');
    });
    expect(notices.length).toBeGreaterThan(0);
  });
});

describe('leaves queue queries', () => {
  it('shows the org queue to the admin and only own leaves to the employee', async () => {
    const c = await seed();
    await createLeaveRequest(c, asEmployee, c.employeeId);
    await createLeaveRequest(c, asAdmin, c.adminId);

    const adminView = await asAdmin(c).query(api.leaves.getAllLeaves, {});
    const employeeView = await asEmployee(c).query(api.leaves.getAllLeaves, {});

    // Admin sees both requests (org queue); the employee only their own.
    expect(adminView).toHaveLength(2);
    expect(employeeView).toHaveLength(1);
    expect(employeeView[0].userId).toBe(c.employeeId);
  });

  it('counts pending leaves as unread for staff', async () => {
    const c = await seed();
    await createLeaveRequest(c, asEmployee, c.employeeId);

    const unread = await asAdmin(c).query(api.leaves.getUnreadCount, {});
    const employeeUnread = await asEmployee(c).query(api.leaves.getUnreadCount, {});

    expect(unread).toBe(1);
    // Employees have no review queue — their count never leaks org data.
    expect(employeeUnread).toBe(0);
  });

  it('returns null for a leave the employee is not allowed to view', async () => {
    const c = await seed();
    const leaveId = await createLeaveRequest(c, asAdmin, c.adminId);

    const asEmployee2 = c.t.withIdentity({ email: 'employee@acme.test' });
    const visible = await asEmployee2.query(api.leaves.getLeaveById, { leaveId });
    const asAdminView = await asAdmin(c).query(api.leaves.getLeaveById, { leaveId });

    expect(visible).toBeNull();
    expect(asAdminView?.status).toBe('pending');
  });
});
