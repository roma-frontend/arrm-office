/**
 * Integration tests for convex/tasks — team/employee queries, comment
 * enrichment, supervisor scoping and secured deletion, run against convex-test's
 * in-memory database with the real schema.
 *
 * Complements the unit suites (convex-tasks.test.ts / convex-tasks-rbac.test.ts)
 * by exercising the real `enrichTasksWithUserData` batch-loading path, comment
 * author resolution, per-org filtering for non-superadmins, team queries via the
 * by_supervisor index, and the secured delete/reassign mutations with verified
 * identity.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './tasks.ts': () => import('../../convex/tasks'),
  './recurringTasks.ts': () => import('../../convex/recurringTasks'),
  './reporting.ts': () => import('../../convex/reporting'),
  './lib/auth.ts': () => import('../../convex/lib/auth'),
  './lib/limits.ts': () => import('../../convex/lib/limits'),
  './lib/userProfile.ts': () => import('../../convex/lib/userProfile'),
  './lib/getAuthCaller.ts': () => import('../../convex/lib/getAuthCaller'),
  './lib/notify.ts': () => import('../../convex/lib/notify'),
  './lib/sanitize.ts': () => import('../../convex/lib/sanitize'),
  './lib/capabilities.ts': () => import('../../convex/lib/capabilities'),
  './lib/reportingLine.ts': () => import('../../convex/lib/reportingLine'),
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
    const otherOrgId = await ctx.db.insert('organizations', {
      name: 'Other',
      slug: `other-${Math.random().toString(36).slice(2)}`,
      plan: 'starter',
      isActive: true,
      createdBySuperadmin: false,
      employeeLimit: 10,
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
    const supervisorId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Manager',
      email: 'manager@acme.test',
      role: 'supervisor',
      department: 'Eng',
      position: 'Lead',
    });
    const employeeId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Employee',
      email: 'employee@acme.test',
      role: 'employee',
      department: 'Eng',
      supervisorId,
    });
    const peerId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Peer',
      email: 'peer@acme.test',
      role: 'employee',
      department: 'Eng',
      supervisorId,
    });
    const foreignId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId: otherOrgId,
      name: 'Foreign',
      email: 'foreign@other.test',
      role: 'employee',
    });
    // The other tenant needs someone who may actually assign work: `createTask`
    // now takes the creator from the session and refuses employees, so foreign
    // fixtures can no longer be authored by `foreignId` itself.
    const foreignAdminId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId: otherOrgId,
      name: 'Foreign Admin',
      email: 'foreign-admin@other.test',
      role: 'admin',
    });
    const superadminId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Super',
      email: 'super@acme.test',
      role: 'superadmin',
    });

    return {
      organizationId,
      otherOrgId,
      adminId,
      supervisorId,
      employeeId,
      peerId,
      foreignId,
      foreignAdminId,
      superadminId,
    };
  });
  return { t, ...ids };
}

function taskArgs(c: Ctx, overrides: Record<string, unknown> = {}) {
  return {
    title: 'Ship onboarding checklist',
    description: 'Prepare workspace',
    assignedTo: c.employeeId,
    priority: 'high' as const,
    deadline: Date.now() + 7 * 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

/**
 * `createTask` takes its creator from the authenticated session — an anonymous
 * `t.run(...)` call is rejected outright — so every fixture has to be authored
 * by somebody. `manager@acme.test` is the default: a supervisor of both
 * `employeeId` and `peerId`, which keeps the task's organization on Acme.
 */
function createTaskAs(c: Ctx, email: string, overrides: Record<string, unknown> = {}) {
  return c.t.withIdentity({ email }).mutation(api.tasks.createTask, taskArgs(c, overrides));
}

async function createTaskWithComment(c: Ctx, overrides: Record<string, unknown> = {}) {
  const taskId = await createTaskAs(c, 'manager@acme.test', overrides);
  await c.t.run((ctx) =>
    ctx.runMutation(api.tasks.addComment, {
      taskId,
      authorId: c.employeeId,
      content: 'First comment',
    }),
  );
  await c.t.run((ctx) =>
    ctx.runMutation(api.tasks.addComment, {
      taskId,
      authorId: c.peerId,
      content: 'Second comment',
    }),
  );
  return taskId;
}

// ── getTasksForEmployee / getTasksAssignedBy (org scoping + enrichment) ─────
describe('employee task queries', () => {
  it('enriches tasks with users, comments, authors and profiles', async () => {
    const c = await seed();
    await createTaskWithComment(c);

    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.tasks.getTasksForEmployee, { userId: c.employeeId }),
    );
    expect(res).toHaveLength(1);
    const task = res[0]!;
    expect(task.title).toBe('Ship onboarding checklist');
    expect(task.assignedToUser?.name).toBe('Employee');
    expect(task.assignedByUser?.name).toBe('Manager');
    expect(task.assignedByUser?.position).toBe('Lead');
    expect(task.commentCount).toBe(2);
    expect(task.comments).toHaveLength(2);
    const authors = task.comments.map((x: { author: { name: string } | null }) => x.author?.name);
    expect(authors).toContain('Employee');
    expect(authors).toContain('Peer');
  });

  it('filters out tasks from other organizations for non-superadmins', async () => {
    const c = await seed();
    await createTaskWithComment(c);
    // A task in the foreign org: the org is taken from the creator's session,
    // so this one lands on otherOrg and must be invisible to the Acme filter.
    const foreignTaskId = await createTaskAs(c, 'foreign-admin@other.test', {
      assignedTo: c.foreignId,
      title: 'Foreign task',
    });
    // The foreign user sees only their own org's task.
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.tasks.getTasksForEmployee, { userId: c.foreignId }),
    );
    expect(res).toHaveLength(1);
    expect(res[0]?._id).toBe(foreignTaskId);
    expect(res[0]?.title).toBe('Foreign task');
  });

  it('returns an empty list when the user has no tasks', async () => {
    const c = await seed();
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.tasks.getTasksForEmployee, { userId: c.peerId }),
    );
    expect(res).toEqual([]);
  });

  it('getTasksAssignedBy returns tasks the supervisor created', async () => {
    const c = await seed();
    const taskId = await createTaskWithComment(c);
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.tasks.getTasksAssignedBy, { supervisorId: c.supervisorId }),
    );
    expect(res).toHaveLength(1);
    expect(res[0]?._id).toBe(taskId);
    expect(res[0]?.assignedToUser?.name).toBe('Employee');
  });

  it('getTasksAssignedBy returns an empty list for a supervisor with no tasks', async () => {
    const c = await seed();
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.tasks.getTasksAssignedBy, { supervisorId: c.supervisorId }),
    );
    expect(res).toEqual([]);
  });

  it('getTasksAssignedBy includes tasks employees created themselves (reporting line)', async () => {
    const c = await seed();
    // The employee creates a task for themselves — allowed since `createTask`
    // lets an employee assign work to themselves.
    const selfTaskId = await createTaskAs(c, 'employee@acme.test', {
      assignedTo: c.employeeId,
      title: 'My own task',
    });

    // The supervisor sees it: it was created inside their reporting subtree.
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.tasks.getTasksAssignedBy, { supervisorId: c.supervisorId }),
    );
    expect(res.some((t) => t._id === selfTaskId)).toBe(true);
    expect(res.find((t) => t._id === selfTaskId)?.title).toBe('My own task');

    // The peer (also a report of the same supervisor, but not the creator) does
    // not see the task in their personal list.
    const peerRes = await c.t.run((ctx) =>
      ctx.runQuery(api.tasks.getTasksForEmployee, { userId: c.peerId }),
    );
    expect(peerRes.some((t) => t._id === selfTaskId)).toBe(false);
  });

  it('notifies the supervisor when an employee creates a task for themselves', async () => {
    const c = await seed();
    await createTaskAs(c, 'employee@acme.test', {
      assignedTo: c.employeeId,
      title: 'My own task',
    });

    // The notification lands in the supervisor's inbox, not the employee's.
    const rows = await c.t.run((ctx) => ctx.db.query('notifications').collect());
    const supervisorNotice = rows.find((n) => n.userId === c.supervisorId);
    expect(supervisorNotice).toBeDefined();
    expect(supervisorNotice?.title).toContain('New Task Created');
    expect(supervisorNotice?.type).toBe('system');
    // Nobody self-notifies.
    expect(rows.some((n) => n.userId === c.employeeId)).toBe(false);
  });
});

// ── getAllTasks (admin gating + org filtering) ──────────────────────────────
describe('getAllTasks', () => {
  it('throws for non-admin roles', async () => {
    const c = await seed();
    await createTaskWithComment(c);
    await expect(
      c.t.withIdentity({ email: 'employee@acme.test' }).query(api.tasks.getAllTasks, {}),
    ).rejects.toThrow('Only admins can access all tasks');
  });

  it('returns an empty list for unauthenticated callers', async () => {
    const c = await seed();
    await createTaskWithComment(c);
    const res = await c.t.run((ctx) => ctx.runQuery(api.tasks.getAllTasks, {}));
    expect(res).toEqual([]);
  });

  it('lets an admin see only their organization tasks', async () => {
    const c = await seed();
    const taskId = await createTaskWithComment(c);
    // A task in the foreign org (creator from otherOrg → task.organizationId = otherOrg).
    await createTaskAs(c, 'foreign-admin@other.test', {
      assignedTo: c.foreignId,
      title: 'Foreign',
    });
    const res = await c.t
      .withIdentity({ email: 'admin@acme.test' })
      .query(api.tasks.getAllTasks, {});
    expect(res).toHaveLength(1);
    expect(res[0]?._id).toBe(taskId);
  });

  it('lets a superadmin filter by selected organization', async () => {
    const c = await seed();
    await createTaskWithComment(c);
    const foreignTaskId = await createTaskAs(c, 'foreign-admin@other.test', {
      assignedTo: c.foreignId,
      title: 'Foreign',
    });
    const res = await c.t
      .withIdentity({ email: 'super@acme.test' })
      .query(api.tasks.getAllTasks, { selectedOrganizationId: c.otherOrgId });
    expect(res).toHaveLength(1);
    expect(res[0]?._id).toBe(foreignTaskId);
    expect(res[0]?.title).toBe('Foreign');
  });

  it('throws for an admin without an organization', async () => {
    const c = await seed();
    await c.t.run(async (ctx) => {
      await ctx.db.insert('users', {
        passwordHash: 'x',
        employeeType: 'staff',
        name: 'Orphan Admin',
        email: 'orphan@x.test',
        role: 'admin',
        isActive: true,
        isApproved: true,
        travelAllowance: 0,
        paidLeaveBalance: 10,
        sickLeaveBalance: 5,
        familyLeaveBalance: 5,
        dayOffBalance: 4,
        createdAt: Date.now(),
      } as never);
    });
    await expect(
      c.t.withIdentity({ email: 'orphan@x.test' }).query(api.tasks.getAllTasks, {}),
    ).rejects.toThrow('Admin must belong to an organization');
  });
});

// ── getVisibleTasks (reporting-line visibility) ─────────────────────────────
describe('getVisibleTasks', () => {
  it('lets an employee see their own and manager-assigned tasks, not colleagues', async () => {
    const c = await seed();
    const selfTaskId = await createTaskAs(c, 'employee@acme.test', {
      assignedTo: c.employeeId,
      title: 'My own',
    });
    const assignedTaskId = await createTaskAs(c, 'manager@acme.test', {
      assignedTo: c.employeeId,
      title: 'Assigned to me',
    });
    await createTaskAs(c, 'manager@acme.test', {
      assignedTo: c.peerId,
      title: 'Peer task',
    });

    const res = await c.t
      .withIdentity({ email: 'employee@acme.test' })
      .query(api.tasks.getVisibleTasks, {});
    const ids = res.map((t) => t._id).sort();
    expect(ids).toEqual([selfTaskId, assignedTaskId].sort());
  });

  it('lets a supervisor see own, report and manager-assigned tasks across the branch', async () => {
    const c = await seed();
    const ownTaskId = await createTaskAs(c, 'manager@acme.test', {
      assignedTo: c.supervisorId,
      title: 'My own',
    });
    const reportTaskId = await createTaskAs(c, 'manager@acme.test', {
      assignedTo: c.employeeId,
      title: 'Assigned to report',
    });
    const bossAssignedId = await createTaskAs(c, 'admin@acme.test', {
      assignedTo: c.supervisorId,
      title: 'Boss assigned to me',
    });
    const selfCreatedId = await createTaskAs(c, 'employee@acme.test', {
      assignedTo: c.employeeId,
      title: 'Report self-created',
    });
    // Assigned by the admin (not the supervisor) to another report of the same
    // supervisor — the supervisor still sees it: the assignee is in their tree.
    const peerAssignedId = await createTaskAs(c, 'admin@acme.test', {
      assignedTo: c.peerId,
      title: 'Peer assigned by admin',
    });

    const res = await c.t
      .withIdentity({ email: 'manager@acme.test' })
      .query(api.tasks.getVisibleTasks, {});
    const ids = res.map((t) => t._id).sort();
    expect(ids).toEqual(
      [ownTaskId, reportTaskId, bossAssignedId, selfCreatedId, peerAssignedId].sort(),
    );
  });

  it('does not leak tasks from another organization', async () => {
    const c = await seed();
    const foreignTaskId = await createTaskAs(c, 'foreign-admin@other.test', {
      assignedTo: c.foreignId,
      title: 'Foreign',
    });
    const acmeTaskId = await createTaskAs(c, 'manager@acme.test', {
      assignedTo: c.employeeId,
      title: 'Acme',
    });

    const res = await c.t
      .withIdentity({ email: 'manager@acme.test' })
      .query(api.tasks.getVisibleTasks, {});
    const ids = res.map((t) => t._id);
    expect(ids).toContain(acmeTaskId);
    expect(ids).not.toContain(foreignTaskId);
  });

  it('returns nothing for unauthenticated callers', async () => {
    const c = await seed();
    await createTaskWithComment(c);
    const res = await c.t.run((ctx) => ctx.runQuery(api.tasks.getVisibleTasks, {}));
    expect(res).toEqual([]);
  });

  it('lets an admin see every task of the organization (org-wide override)', async () => {
    const c = await seed();
    const t1 = await createTaskWithComment(c);
    const t2 = await createTaskAs(c, 'employee@acme.test', {
      assignedTo: c.employeeId,
      title: 'My own',
    });

    const res = await c.t
      .withIdentity({ email: 'admin@acme.test' })
      .query(api.tasks.getVisibleTasks, {});
    const ids = res.map((t) => t._id).sort();
    expect(ids).toEqual([t1, t2].sort());
  });

  it('lets a superadmin filter by selected organization', async () => {
    const c = await seed();
    const acmeTaskId = await createTaskWithComment(c);
    const foreignTaskId = await createTaskAs(c, 'foreign-admin@other.test', {
      assignedTo: c.foreignId,
      title: 'Foreign',
    });

    const res = await c.t
      .withIdentity({ email: 'super@acme.test' })
      .query(api.tasks.getVisibleTasks, { selectedOrganizationId: c.otherOrgId });
    const ids = res.map((t) => t._id);
    expect(ids).toContain(foreignTaskId);
    expect(ids).not.toContain(acmeTaskId);
  });
  it('does not leak recurring tasks from other branches for non-staff callers', async () => {
    const c = await seed();
    // Insert recurring series: one for the employee, one for the peer,
    // one for a foreign user in another org.
    const ownSeries = await c.t.run(async (ctx) => {
      const now = Date.now();
      return ctx.db.insert('recurringTasks', {
        organizationId: c.organizationId,
        title: 'Own recurring',
        assignedTo: c.employeeId,
        assignedBy: c.supervisorId,
        priority: 'medium',
        frequency: 'weekly',
        daysOfWeek: [1],
        startDate: '2026-01-01',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      } as never);
    });
    const peerSeries = await c.t.run(async (ctx) => {
      const now = Date.now();
      return ctx.db.insert('recurringTasks', {
        organizationId: c.organizationId,
        title: 'Peer recurring',
        assignedTo: c.peerId,
        assignedBy: c.supervisorId,
        priority: 'medium',
        frequency: 'weekly',
        daysOfWeek: [2],
        startDate: '2026-01-01',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      } as never);
    });
    const foreignSeries = await c.t.run(async (ctx) => {
      const now = Date.now();
      return ctx.db.insert('recurringTasks', {
        organizationId: c.otherOrgId,
        title: 'Foreign recurring',
        assignedTo: c.foreignId,
        assignedBy: c.foreignId,
        priority: 'medium',
        frequency: 'weekly',
        daysOfWeek: [3],
        startDate: '2026-01-01',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      } as never);
    });

    // Employee should only see their own recurring series, not the peer's
    const res = await c.t
      .withIdentity({ email: 'employee@acme.test' })
      .query(api.tasks.getVisibleTasks, {});
    const ids = res.map((t) => t._id);
    expect(ids).toContain(ownSeries);
    expect(ids).not.toContain(peerSeries);
    expect(ids).not.toContain(foreignSeries);
  });
});

// ── getTeamTasks / getMyEmployees (by_supervisor index) ─────────────────────
describe('team queries', () => {
  it('getTeamTasks aggregates tasks of all subordinates', async () => {
    const c = await seed();
    const t1 = await createTaskWithComment(c);
    const t2 = await createTaskAs(c, 'manager@acme.test', {
      assignedTo: c.peerId,
      title: 'Peer task',
    });
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.tasks.getTeamTasks, { supervisorId: c.supervisorId }),
    );
    const ids = res.map((x) => x._id).sort();
    expect(ids).toEqual([t1, t2].sort());
  });

  it('getTeamTasks returns an empty list when the supervisor has no team', async () => {
    const c = await seed();
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.tasks.getTeamTasks, { supervisorId: c.foreignId }),
    );
    expect(res).toEqual([]);
  });

  it('getMyEmployees lists subordinates with profile avatars', async () => {
    const c = await seed();
    await c.t.run(async (ctx) => {
      await ctx.db.insert('userProfiles', {
        userId: c.employeeId,
        avatarUrl: 'https://example.com/avatar.png',
      } as never);
    });
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.tasks.getMyEmployees, { supervisorId: c.supervisorId }),
    );
    const names = res.map((e) => e.name).sort();
    expect(names).toEqual(['Employee', 'Peer']);
    const emp = res.find((e) => e.name === 'Employee');
    expect(emp?.avatarUrl).toBe('https://example.com/avatar.png');
  });

  it('getMyEmployees returns an empty list for a supervisor with no team', async () => {
    const c = await seed();
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.tasks.getMyEmployees, { supervisorId: c.foreignId }),
    );
    expect(res).toEqual([]);
  });
});

// ── getUsersForAssignment / getSupervisors ──────────────────────────────────
describe('assignment helpers', () => {
  it('getUsersForAssignment scopes to the requester organization', async () => {
    const c = await seed();
    const res = await c.t
      .withIdentity({ email: 'admin@acme.test' })
      .query(api.tasks.getUsersForAssignment, {});
    const names = res.map((u) => u.name);
    expect(names).toContain('Employee');
    expect(names).toContain('Manager');
    expect(names).not.toContain('Foreign');
  });

  it('getUsersForAssignment excludes superadmins', async () => {
    const c = await seed();
    const res = await c.t
      .withIdentity({ email: 'admin@acme.test' })
      .query(api.tasks.getUsersForAssignment, {});
    const names = res.map((u) => u.name);
    expect(names).not.toContain('Super');
    expect(names).toContain('Employee');
  });

  // Previously an anonymous call fell through to an unscoped `query('users')`
  // scan and handed back every tenant's roster.
  it('getUsersForAssignment returns nothing without a session', async () => {
    const c = await seed();
    const res = await c.t.run((ctx) => ctx.runQuery(api.tasks.getUsersForAssignment, {}));
    expect(res).toEqual([]);
  });

  it('getUsersForAssignment scopes a supervisor to their own reporting branch', async () => {
    const c = await seed();
    const res = await c.t
      .withIdentity({ email: 'manager@acme.test' })
      .query(api.tasks.getUsersForAssignment, {});
    const names = res.map((u) => u.name).sort();
    expect(names).toEqual(['Employee', 'Peer']);
  });

  it('getUsersForAssignment falls back to all users for a superadmin (no org)', async () => {
    // The seed superadmin has no organizationId — the requester exists but the
    // org-scoped branch is skipped, exercising the `query('users').take()` fallback.
    const c = await seed();
    const res = await c.t
      .withIdentity({ email: 'super@acme.test' })
      .query(api.tasks.getUsersForAssignment, {});
    const names = res.map((u) => u.name);
    expect(names).toContain('Employee');
    expect(names).toContain('Foreign');
    expect(names).not.toContain('Super');
  });

  // `tasks.getSupervisors` was removed: it queried `by_role` globally and only
  // filtered by organization when a caller happened to be authenticated, so an
  // unauthenticated call returned every tenant's supervisors and admins. It was
  // also role-filtered, which the reporting-line model rejects — any active
  // colleague can be someone's manager.
  it('reporting.getPotentialManagers is org-scoped, active-only and requires auth', async () => {
    const c = await seed();
    await c.t.run(async (ctx) => {
      // An inactive user must be excluded.
      await ctx.db.insert('users', {
        organizationId: c.organizationId,
        passwordHash: 'x',
        employeeType: 'staff',
        name: 'Inactive',
        email: 'inactive@acme.test',
        role: 'supervisor',
        isActive: false,
        isApproved: true,
        travelAllowance: 0,
        paidLeaveBalance: 10,
        sickLeaveBalance: 5,
        familyLeaveBalance: 5,
        dayOffBalance: 4,
        createdAt: Date.now(),
      } as never);
    });

    const res = await c.t
      .withIdentity({ email: 'admin@acme.test' })
      .query(api.reporting.getPotentialManagers, { organizationId: c.organizationId });
    const names = res.map((u) => u.name);
    expect(names).toContain('Manager');
    expect(names).toContain('Admin');
    expect(names).not.toContain('Inactive');
    expect(names).not.toContain('Super');

    const anonymous = await c.t.run((ctx) =>
      ctx.runQuery(api.reporting.getPotentialManagers, { organizationId: c.organizationId }),
    );
    expect(anonymous).toEqual([]);
  });
});

// ── Comment queries ─────────────────────────────────────────────────────────
describe('comment queries', () => {
  it('getTaskComments returns comments in ascending order with authors', async () => {
    const c = await seed();
    const taskId = await createTaskWithComment(c);
    const res = await c.t.run((ctx) => ctx.runQuery(api.tasks.getTaskComments, { taskId }));
    expect(res).toHaveLength(2);
    expect(res[0]?.content).toBe('First comment');
    expect(res[1]?.content).toBe('Second comment');
    expect(res[0]?.author?.name).toBe('Employee');
    expect(res[1]?.author?.name).toBe('Peer');
  });

  it('listCommentsPaginated pages through comments', async () => {
    const c = await seed();
    const taskId = await createTaskWithComment(c);
    const page = await c.t.run((ctx) =>
      ctx.runQuery(api.tasks.listCommentsPaginated, {
        taskId,
        paginationOpts: { numItems: 1, cursor: null },
      }),
    );
    expect(page.page).toHaveLength(1);
    expect(page.isDone).toBe(false);
    expect(page.page[0]?.author?.name).toBe('Peer'); // desc order → newest first
    const page2 = await c.t.run((ctx) =>
      ctx.runQuery(api.tasks.listCommentsPaginated, {
        taskId,
        paginationOpts: { numItems: 1, cursor: page.continueCursor },
      }),
    );
    expect(page2.page).toHaveLength(1);
    expect(page2.isDone).toBe(true);
    expect(page2.page[0]?.content).toBe('First comment');
  });

  it('getTask returns null for a missing task', async () => {
    const c = await seed();
    const taskId = await createTaskWithComment(c);
    await c.t.run((ctx) => ctx.runMutation(api.tasks.deleteTask, { taskId }));
    const res = await c.t.run((ctx) => ctx.runQuery(api.tasks.getTask, { taskId }));
    expect(res).toBeNull();
  });

  it('getTask enriches with comments and project name', async () => {
    const c = await seed();
    const taskId = await createTaskWithComment(c);
    const res = await c.t.run((ctx) => ctx.runQuery(api.tasks.getTask, { taskId }));
    expect(res?.title).toBe('Ship onboarding checklist');
    expect(res?.commentCount).toBe(2);
    expect(res?.comments).toHaveLength(2);
    expect(res?.assignedToUser?.name).toBe('Employee');
    expect(res?.projectName).toBeNull();
  });
});

// ── deleteTask / secureDeleteTask (cascade comments) ────────────────────────
describe('deletion', () => {
  it('deleteTask removes comments and the task itself', async () => {
    const c = await seed();
    const taskId = await createTaskWithComment(c);
    await c.t.run((ctx) => ctx.runMutation(api.tasks.deleteTask, { taskId }));
    const task = await c.t.run((ctx) => ctx.db.get(taskId));
    expect(task).toBeNull();
    const comments = await c.t.run((ctx) => ctx.db.query('taskComments').collect());
    expect(comments).toHaveLength(0);
  });

  it('secureDeleteTask rejects unauthenticated callers', async () => {
    const c = await seed();
    const taskId = await createTaskWithComment(c);
    await expect(
      c.t.run((ctx) => ctx.runMutation(api.tasks.secureDeleteTask, { taskId })),
    ).rejects.toThrow('Not authenticated');
  });

  it('secureDeleteTask rejects cross-organization callers', async () => {
    const c = await seed();
    const taskId = await createTaskWithComment(c);
    await expect(
      c.t
        .withIdentity({ email: 'foreign@other.test' })
        .mutation(api.tasks.secureDeleteTask, { taskId }),
    ).rejects.toThrow('cross-organization');
  });

  it('secureDeleteTask deletes comments and the task for a same-org admin', async () => {
    const c = await seed();
    const taskId = await createTaskWithComment(c);
    await c.t
      .withIdentity({ email: 'admin@acme.test' })
      .mutation(api.tasks.secureDeleteTask, { taskId });
    const task = await c.t.run((ctx) => ctx.db.get(taskId));
    expect(task).toBeNull();
    const comments = await c.t.run((ctx) => ctx.db.query('taskComments').collect());
    expect(comments).toHaveLength(0);
  });

  it('secureDeleteTask lets a superadmin delete across organizations', async () => {
    const c = await seed();
    const taskId = await createTaskWithComment(c);
    await c.t
      .withIdentity({ email: 'super@acme.test' })
      .mutation(api.tasks.secureDeleteTask, { taskId });
    const task = await c.t.run((ctx) => ctx.db.get(taskId));
    expect(task).toBeNull();
  });

  it('secureReassignTask rejects unauthenticated callers', async () => {
    const c = await seed();
    const taskId = await createTaskWithComment(c);
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.tasks.secureReassignTask, { taskId, newAssigneeId: c.peerId }),
      ),
    ).rejects.toThrow('Not authenticated');
  });

  it('secureReassignTask moves the task to a new assignee', async () => {
    const c = await seed();
    const taskId = await createTaskWithComment(c);
    await c.t
      .withIdentity({ email: 'admin@acme.test' })
      .mutation(api.tasks.secureReassignTask, { taskId, newAssigneeId: c.peerId });
    const task = await c.t.run((ctx) => ctx.db.get(taskId));
    expect(task?.assignedTo).toBe(c.peerId);
  });
});
