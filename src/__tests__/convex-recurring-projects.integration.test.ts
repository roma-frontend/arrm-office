/**
 * Integration tests for the reporting-line visibility of recurring tasks and
 * projects — the same rule `tasks.getVisibleTasks` applies to the board.
 *
 * A series is visible when its assignee or author is the caller or someone in
 * the caller's reporting subtree; a project is visible when the caller (or a
 * subordinate) owns, created or is a member of it. Staff (admin / superadmin)
 * keep the org-wide override. Runs against convex-test's in-memory database
 * with the real schema.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Doc, Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './recurringTasks.ts': () => import('../../convex/recurringTasks'),
  './projects.ts': () => import('../../convex/projects'),
  './tasks.ts': () => import('../../convex/tasks'),
  './reporting.ts': () => import('../../convex/reporting'),
  './lib/auth.ts': () => import('../../convex/lib/auth'),
  './lib/limits.ts': () => import('../../convex/lib/limits'),
  './lib/userProfile.ts': () => import('../../convex/lib/userProfile'),
  './lib/getAuthCaller.ts': () => import('../../convex/lib/getAuthCaller'),
  './lib/notify.ts': () => import('../../convex/lib/notify'),
  './lib/sanitize.ts': () => import('../../convex/lib/sanitize'),
  './lib/capabilities.ts': () => import('../../convex/lib/capabilities'),
  './lib/reportingLine.ts': () => import('../../convex/lib/reportingLine'),
  './lib/orgDays.ts': () => import('../../convex/lib/orgDays'),
  './lib/recurrence.ts': () => import('../../convex/lib/recurrence'),
  './lib/entitlements.ts': () => import('../../convex/lib/entitlements'),
} as unknown as Record<string, () => Promise<unknown>>;

type Ctx = Awaited<ReturnType<typeof seed>>;

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
      paidLeaveBalance: 10,
      sickLeaveBalance: 5,
      familyLeaveBalance: 5,
      dayOffBalance: 4,
      createdAt: Date.now(),
    };

    const adminId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Admin',
      email: 'admin@acme.test',
      role: 'admin',
      department: 'Eng',
    });
    const sup1Id = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Manager One',
      email: 'sup1@acme.test',
      role: 'supervisor',
      department: 'Eng',
    });
    const emp1Id = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Employee One',
      email: 'emp1@acme.test',
      role: 'employee',
      department: 'Eng',
      supervisorId: sup1Id,
    });
    const emp2Id = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Employee Two',
      email: 'emp2@acme.test',
      role: 'employee',
      department: 'Eng',
      supervisorId: sup1Id,
    });
    // A second branch, so subtree scoping is actually exercised: sup1 must
    // NOT see what sup2's reports work on.
    const sup2Id = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Manager Two',
      email: 'sup2@acme.test',
      role: 'supervisor',
      department: 'Sales',
    });
    const emp3Id = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Employee Three',
      email: 'emp3@acme.test',
      role: 'employee',
      department: 'Sales',
      supervisorId: sup2Id,
    });

    const now = Date.now();

    // Series: S1 → emp1, S2 → emp2, S3 → emp3 (other branch).
    const s1Id = await ctx.db.insert('recurringTasks', {
      organizationId,
      title: 'Weekly report',
      assignedTo: emp1Id,
      assignedBy: adminId,
      priority: 'medium',
      frequency: 'weekly',
      daysOfWeek: [1],
      startDate: '2026-01-01',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    } as never);
    const s2Id = await ctx.db.insert('recurringTasks', {
      organizationId,
      title: 'Weekly sync',
      assignedTo: emp2Id,
      assignedBy: adminId,
      priority: 'medium',
      frequency: 'weekly',
      daysOfWeek: [2],
      startDate: '2026-01-01',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    } as never);
    const s3Id = await ctx.db.insert('recurringTasks', {
      organizationId,
      title: 'Sales digest',
      assignedTo: emp3Id,
      assignedBy: sup2Id,
      priority: 'high',
      frequency: 'weekly',
      daysOfWeek: [3],
      startDate: '2026-01-01',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    } as never);

    // One materialized occurrence under S1, so the occurrences query has data.
    const occId = await ctx.db.insert('tasks', {
      organizationId,
      title: 'Weekly report',
      assignedTo: emp1Id,
      assignedBy: adminId,
      status: 'pending',
      priority: 'medium',
      recurringTaskId: s1Id,
      createdAt: now,
      updatedAt: now,
    } as never);

    // Projects: P1 owned by emp1, P2 owned by emp3 (other branch),
    // P3 owned by admin with emp2 as member.
    const p1Id = await ctx.db.insert('projects', {
      organizationId,
      name: 'Onboarding revamp',
      status: 'active',
      priority: 'high',
      createdBy: emp1Id,
      ownerId: emp1Id,
      memberIds: [emp1Id],
      createdAt: now,
      updatedAt: now,
    } as never);
    const p2Id = await ctx.db.insert('projects', {
      organizationId,
      name: 'Sales playbook',
      status: 'planning',
      priority: 'medium',
      createdBy: emp3Id,
      ownerId: emp3Id,
      memberIds: [emp3Id],
      createdAt: now,
      updatedAt: now,
    } as never);
    const p3Id = await ctx.db.insert('projects', {
      organizationId,
      name: 'Q3 hiring drive',
      status: 'active',
      priority: 'urgent',
      createdBy: adminId,
      ownerId: adminId,
      memberIds: [emp2Id],
      createdAt: now,
      updatedAt: now,
    } as never);

    return {
      organizationId,
      adminId,
      sup1Id,
      emp1Id,
      emp2Id,
      sup2Id,
      emp3Id,
      s1Id,
      s2Id,
      s3Id,
      occId,
      p1Id,
      p2Id,
      p3Id,
    };
  });
  return { t, ...ids };
}

const listSeries = (c: Ctx, email: string) =>
  c.t.withIdentity({ email }).query(api.recurringTasks.listRecurringTasks, {});

const listProjects = (c: Ctx, email: string) =>
  c.t.withIdentity({ email }).query(api.projects.listProjects, {
    organizationId: c.organizationId,
  });

// ── Recurring tasks ─────────────────────────────────────────────────────────

describe('recurring task visibility (reporting line)', () => {
  it('an employee sees only the series they are connected to', async () => {
    const c = await seed();
    const res = await listSeries(c, 'emp1@acme.test');
    expect(res.map((s: Doc<'recurringTasks'>) => s._id).sort()).toEqual([c.s1Id].sort());
  });

  it('a supervisor sees their whole branch, not other branches', async () => {
    const c = await seed();
    const res = await listSeries(c, 'sup1@acme.test');
    const ids = res.map((s: Doc<'recurringTasks'>) => s._id).sort();
    expect(ids).toEqual([c.s1Id, c.s2Id].sort());
    expect(ids).not.toContain(c.s3Id);
  });

  it('an admin sees every series in the org', async () => {
    const c = await seed();
    const res = await listSeries(c, 'admin@acme.test');
    expect(res.map((s: Doc<'recurringTasks'>) => s._id).sort()).toEqual(
      [c.s1Id, c.s2Id, c.s3Id].sort(),
    );
  });

  it('occurrences are gated by the same rule', async () => {
    const c = await seed();
    const asSup1 = await c.t
      .withIdentity({ email: 'sup1@acme.test' })
      .query(api.recurringTasks.getRecurringTaskOccurrences, { seriesId: c.s1Id });
    expect(asSup1.map((t: Doc<'tasks'>) => t._id)).toEqual([c.occId]);

    const asEmp2 = await c.t
      .withIdentity({ email: 'emp2@acme.test' })
      .query(api.recurringTasks.getRecurringTaskOccurrences, { seriesId: c.s1Id });
    expect(asEmp2).toEqual([]);
  });
});

// ── Projects ────────────────────────────────────────────────────────────────

describe('project visibility (reporting line)', () => {
  it('an employee sees only projects they own or are a member of', async () => {
    const c = await seed();
    const res = await listProjects(c, 'emp1@acme.test');
    expect(res.map((p: Doc<'projects'>) => p._id).sort()).toEqual([c.p1Id].sort());
  });

  it('a member sees the project even when they do not own it', async () => {
    const c = await seed();
    const res = await listProjects(c, 'emp2@acme.test');
    expect(res.map((p: Doc<'projects'>) => p._id).sort()).toEqual([c.p3Id].sort());
  });

  it('a supervisor sees their branch projects, not other branches', async () => {
    const c = await seed();
    const res = await listProjects(c, 'sup1@acme.test');
    const ids = res.map((p: Doc<'projects'>) => p._id).sort();
    expect(ids).toEqual([c.p1Id, c.p3Id].sort());
    expect(ids).not.toContain(c.p2Id);
  });

  it('an admin sees every project in the org', async () => {
    const c = await seed();
    const res = await listProjects(c, 'admin@acme.test');
    expect(res.map((p: Doc<'projects'>) => p._id).sort()).toEqual([c.p1Id, c.p2Id, c.p3Id].sort());
  });

  it('getProject hides projects outside the reporting line', async () => {
    const c = await seed();
    const forSup1 = await c.t
      .withIdentity({ email: 'sup1@acme.test' })
      .query(api.projects.getProject, { projectId: c.p1Id });
    expect(forSup1).not.toBeNull();
    expect(forSup1?._id).toBe(c.p1Id);

    const forEmp2 = await c.t
      .withIdentity({ email: 'emp2@acme.test' })
      .query(api.projects.getProject, { projectId: c.p1Id });
    expect(forEmp2).toBeNull();
  });

  it('stats only count the projects the caller can see', async () => {
    const c = await seed();
    const forEmp2 = await c.t
      .withIdentity({ email: 'emp2@acme.test' })
      .query(api.projects.getProjectStats, { organizationId: c.organizationId });
    expect(forEmp2?.total).toBe(1);

    const forAdmin = await c.t
      .withIdentity({ email: 'admin@acme.test' })
      .query(api.projects.getProjectStats, { organizationId: c.organizationId });
    expect(forAdmin?.total).toBe(3);
  });
});
