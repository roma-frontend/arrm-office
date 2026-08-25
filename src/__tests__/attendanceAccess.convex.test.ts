/**
 * Attendance access rules (convex/timeTracking.ts).
 *
 * The org-wide attendance queries used to trust a client-supplied `adminId`:
 * the role was read from *that* user's document, so any employee could read
 * the whole org's attendance by passing an admin's id. These tests pin the
 * fixed behavior — the role comes from the authenticated caller:
 * - admin / superadmin → org-wide
 * - supervisor → own reporting subtree only
 * - employee → nothing, even when passing an admin's id
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';

import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './timeTracking.ts': () => import('../../convex/timeTracking'),
} as unknown as Record<string, () => Promise<unknown>>;

const TODAY = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().split('T')[0]!;

async function seed() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Acme',
      slug: `acme-${Math.random().toString(36).slice(2)}`,
      plan: 'professional',
      isActive: true,
      createdBySuperadmin: false,
      employeeLimit: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);

    const baseUser = {
      passwordHash: 'x',
      employeeType: 'staff' as const,
      isActive: true,
      isApproved: true,
      travelAllowance: 0,
      paidLeaveBalance: 0,
      sickLeaveBalance: 0,
      familyLeaveBalance: 0,
      createdAt: Date.now(),
    };

    const adminId = (await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'HR Admin',
      email: 'hr@acme.test',
      role: 'admin',
    })) as Id<'users'>;

    // Supervisor with one direct report (inSubtree) and one stranger (outSubtree).
    const supervisorId = (await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Sup',
      email: 'sup@acme.test',
      role: 'supervisor',
    })) as Id<'users'>;

    const inSubtreeId = (await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'In Subtree',
      email: 'in@acme.test',
      role: 'employee',
      supervisorId,
    })) as Id<'users'>;

    const outSubtreeId = (await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Out Subtree',
      email: 'out@acme.test',
      role: 'employee',
    })) as Id<'users'>;

    const employeeId = (await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Plain Employee',
      email: 'emp@acme.test',
      role: 'employee',
    })) as Id<'users'>;

    // Both employees checked in today.
    for (const userId of [inSubtreeId, outSubtreeId, employeeId]) {
      await ctx.db.insert('timeTracking', {
        organizationId,
        userId,
        checkInTime: Date.now() - 3_600_000,
        scheduledStartTime: Date.now() - 7_200_000,
        scheduledEndTime: Date.now() + 7_200_000,
        isLate: false,
        isEarlyLeave: false,
        overtimeMinutes: 0,
        totalWorkedMinutes: 60,
        status: 'checked_in',
        date: TODAY,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
    }

    return { organizationId, adminId, supervisorId, inSubtreeId, outSubtreeId, employeeId };
  });

  return { t, ...ids };
}

describe('org-wide attendance access', () => {
  it('an employee gets nothing even when passing an admin id as adminId', async () => {
    const ctx = await seed();
    const emp = ctx.t.withIdentity({ email: 'emp@acme.test' });

    const rows = await emp.query(api.timeTracking.getTodayAllAttendance, {
      adminId: ctx.adminId,
    });
    expect(rows).toEqual([]);

    const overview = await emp.query(api.timeTracking.getAllEmployeesAttendanceOverview, {
      adminId: ctx.adminId,
      month: TODAY.slice(0, 7),
    });
    expect(overview).toEqual([]);
  });

  it('an admin sees the whole org', async () => {
    const ctx = await seed();
    const admin = ctx.t.withIdentity({ email: 'hr@acme.test' });

    const rows = await admin.query(api.timeTracking.getTodayAllAttendance, {
      adminId: ctx.adminId,
    });
    expect(rows).toHaveLength(3);
  });

  it('a supervisor sees only their reporting subtree', async () => {
    const ctx = await seed();
    const sup = ctx.t.withIdentity({ email: 'sup@acme.test' });

    const rows = await sup.query(api.timeTracking.getTodayAllAttendance, {
      adminId: ctx.supervisorId,
    });
    const userIds = rows.map((r) => r!.userId).sort();
    expect(userIds).toEqual([ctx.inSubtreeId]);

    const overview = await sup.query(api.timeTracking.getAllEmployeesAttendanceOverview, {
      adminId: ctx.supervisorId,
      month: TODAY.slice(0, 7),
    });
    expect(overview.map((r) => r.user._id)).toEqual([ctx.inSubtreeId]);
  });

  it('the summary degrades to zeros for an employee', async () => {
    const ctx = await seed();
    const emp = ctx.t.withIdentity({ email: 'emp@acme.test' });

    const summary = await emp.query(api.timeTracking.getTodayAttendanceSummary, {
      adminId: ctx.adminId,
    });
    expect(summary).toMatchObject({ totalActive: 0, checkedIn: 0, attendanceRate: '0' });
  });
});
