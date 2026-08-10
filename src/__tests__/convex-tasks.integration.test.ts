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
  './lib/auth.ts': () => import('../../convex/lib/auth'),
  './lib/limits.ts': () => import('../../convex/lib/limits'),
  './lib/userProfile.ts': () => import('../../convex/lib/userProfile'),
  './lib/getAuthCaller.ts': () => import('../../convex/lib/getAuthCaller'),
  './lib/notify.ts': () => import('../../convex/lib/notify'),
  './lib/sanitize.ts': () => import('../../convex/lib/sanitize'),
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
    assignedBy: c.supervisorId,
    priority: 'high' as const,
    deadline: Date.now() + 7 * 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

async function createTaskWithComment(c: Ctx, overrides: Record<string, unknown> = {}) {
  const taskId = await c.t.run((ctx) =>
    ctx.runMutation(api.tasks.createTask, taskArgs(c, overrides)),
  );
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
    // A task in the foreign org assigned to the same employee: the org is taken
    // from the assigner (foreignId), so it must be invisible to the Acme filter.
    const foreignTaskId = await c.t.run((ctx) =>
      ctx.runMutation(
        api.tasks.createTask,
        taskArgs(c, { assignedTo: c.foreignId, assignedBy: c.foreignId, title: 'Foreign task' }),
      ),
    );
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
    // A task in the foreign org (assigner from otherOrg → task.organizationId = otherOrg).
    await c.t.run((ctx) =>
      ctx.runMutation(
        api.tasks.createTask,
        taskArgs(c, { assignedTo: c.foreignId, assignedBy: c.foreignId, title: 'Foreign' }),
      ),
    );
    const res = await c.t
      .withIdentity({ email: 'admin@acme.test' })
      .query(api.tasks.getAllTasks, {});
    expect(res).toHaveLength(1);
    expect(res[0]?._id).toBe(taskId);
  });

  it('lets a superadmin filter by selected organization', async () => {
    const c = await seed();
    await createTaskWithComment(c);
    const foreignTaskId = await c.t.run((ctx) =>
      ctx.runMutation(
        api.tasks.createTask,
        taskArgs(c, { assignedTo: c.foreignId, assignedBy: c.foreignId, title: 'Foreign' }),
      ),
    );
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

// ── getTeamTasks / getMyEmployees (by_supervisor index) ─────────────────────
describe('team queries', () => {
  it('getTeamTasks aggregates tasks of all subordinates', async () => {
    const c = await seed();
    const t1 = await createTaskWithComment(c);
    const t2 = await c.t.run((ctx) =>
      ctx.runMutation(
        api.tasks.createTask,
        taskArgs(c, { assignedTo: c.peerId, title: 'Peer task' }),
      ),
    );
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
    const res = await c.t.run((ctx) => ctx.runQuery(api.tasks.getUsersForAssignment, {}));
    const names = res.map((u) => u.name);
    expect(names).not.toContain('Super');
    expect(names).toContain('Employee');
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

  it('getSupervisors returns active supervisors and admins of the org', async () => {
    const c = await seed();
    await c.t.run(async (ctx) => {
      // An inactive supervisor must be excluded.
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
      .query(api.tasks.getSupervisors, {});
    const names = res.map((u) => u.name);
    expect(names).toContain('Manager');
    expect(names).toContain('Admin');
    expect(names).not.toContain('Inactive');
    const mgr = res.find((u) => u.name === 'Manager');
    expect(mgr?.position).toBe('Lead');
  });

  it('getSupervisors returns everything for unauthenticated callers (no filter)', async () => {
    const c = await seed();
    const res = await c.t.run((ctx) => ctx.runQuery(api.tasks.getSupervisors, {}));
    const names = res.map((u) => u.name);
    expect(names).toContain('Manager');
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
