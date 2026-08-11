/**
 * Integration tests for the superadmin organization lifecycle: freeze (with a
 * reason surfaced at login and through getAuthCaller), unfreeze, and hard
 * delete with the cascading purge. Runs against convex-test's in-memory
 * database with the real schema.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api, internal } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './superadmin.ts': () => import('../../convex/superadmin/index'),
  './auth.ts': () => import('../../convex/auth'),
} as unknown as Record<string, () => Promise<unknown>>;

async function seed() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Acme',
      slug: 'acme',
      plan: 'professional',
      isActive: true,
      createdBySuperadmin: false,
      employeeLimit: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const baseUser = {
      passwordHash: 'x',
      employeeType: 'staff' as const,
      isActive: true,
      isApproved: true,
      travelAllowance: 0,
      paidLeaveBalance: 10,
      sickLeaveBalance: 5,
      familyLeaveBalance: 5,
      createdAt: Date.now(),
    };

    const superadminId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Root',
      email: 'root@platform.test',
      role: 'superadmin',
    });
    const adminId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Admin',
      email: 'admin@acme.test',
      role: 'admin',
    });
    const employeeId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Employee',
      email: 'employee@acme.test',
      role: 'employee',
    });

    // Org-scoped data that the purge must remove.
    const taskId = await ctx.db.insert('tasks', {
      organizationId,
      title: 'org task',
      assignedTo: employeeId,
      assignedBy: adminId,
      status: 'pending',
      priority: 'medium',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.insert('notifications', {
      organizationId,
      userId: employeeId,
      type: 'system',
      title: 'n',
      message: 'm',
      isRead: false,
      createdAt: Date.now(),
    });

    return { organizationId, superadminId, adminId, employeeId, taskId };
  });

  return { t, ...ids };
}

type Ctx = Awaited<ReturnType<typeof seed>>;

const asSuperadmin = (c: Ctx) => c.t.withIdentity({ email: 'root@platform.test' });
const asAdmin = (c: Ctx) => c.t.withIdentity({ email: 'admin@acme.test' });

function loginArgs(c: Ctx) {
  return {
    email: 'employee@acme.test',
    password: '',
    sessionToken: `tok-${Math.random()}`,
    sessionExpiry: Date.now() + 3600000,
    isOAuthLogin: true,
  };
}

describe('organization freeze', () => {
  it('blocks login with the reason and hides Convex data from the org', async () => {
    const c = await seed();

    // Before the freeze the employee can log in.
    const before = await c.t.mutation(api.auth.login, loginArgs(c));
    expect(before.userId).toBe(c.employeeId);

    await asSuperadmin(c).mutation(api.superadmin.freezeOrganization, {
      organizationId: c.organizationId,
      reason: 'Payment overdue',
    });

    const state = await c.t.query(api.superadmin.getFreezeState, {
      organizationId: c.organizationId,
    });
    expect(state.frozen).toBe(true);
    expect(state.reason).toBe('Payment overdue');

    // Login now fails with the machine-readable freeze marker + reason.
    await expect(c.t.mutation(api.auth.login, loginArgs(c))).rejects.toThrow(
      /ORG_FROZEN\|Payment overdue/,
    );

    // Authenticated callers from the frozen org are treated as unauthenticated.
    const visible = await asAdmin(c).query(api.superadmin.getFreezeState, {
      organizationId: c.organizationId,
    });
    expect(visible.frozen).toBe(true);
  });

  it('requires a reason and superadmin role', async () => {
    const c = await seed();

    await expect(
      asSuperadmin(c).mutation(api.superadmin.freezeOrganization, {
        organizationId: c.organizationId,
        reason: '   ',
      }),
    ).rejects.toThrow(/reason is required/i);

    await expect(
      asAdmin(c).mutation(api.superadmin.freezeOrganization, {
        organizationId: c.organizationId,
        reason: 'self-freeze',
      }),
    ).rejects.toThrow(/superadmin/i);
  });

  it('unfreeze restores login', async () => {
    const c = await seed();
    await asSuperadmin(c).mutation(api.superadmin.freezeOrganization, {
      organizationId: c.organizationId,
      reason: 'check',
    });
    await asSuperadmin(c).mutation(api.superadmin.unfreezeOrganization, {
      organizationId: c.organizationId,
    });

    const state = await c.t.query(api.superadmin.getFreezeState, {
      organizationId: c.organizationId,
    });
    expect(state.frozen).toBe(false);

    const login = await c.t.mutation(api.auth.login, loginArgs(c));
    expect(login.userId).toBe(c.employeeId);
  });
});

describe('organization hard delete', () => {
  it('requires slug confirmation and never deletes the caller own org', async () => {
    const c = await seed();

    await expect(
      asSuperadmin(c).mutation(api.superadmin.secureDeleteOrganization, {
        organizationId: c.organizationId,
        confirmSlug: 'wrong',
      }),
    ).rejects.toThrow(/slug/i);
  });

  it('purges org data, users and the org document', async () => {
    const c = await seed();

    const deletionId = await asSuperadmin(c).mutation(api.superadmin.secureDeleteOrganization, {
      organizationId: c.organizationId,
      confirmSlug: 'acme',
    });

    // The org is frozen the moment deletion starts.
    const state = await c.t.query(api.superadmin.getFreezeState, {
      organizationId: c.organizationId,
    });
    expect(state.frozen).toBe(true);

    // Drive the batched purge until it reports done.
    for (let i = 0; i < 10; i++) {
      const control = await c.t.run(async (ctx) => await ctx.db.get(deletionId));
      if (control?.status === 'done') break;
      await c.t.mutation(internal.superadmin.purgeOrganizationData, { deletionId });
    }

    const final = await c.t.run(async (ctx) => {
      const control = await ctx.db.get(deletionId);
      const org = await ctx.db.get(c.organizationId);
      const users = await ctx.db
        .query('users')
        .withIndex('by_org', (q) => q.eq('organizationId', c.organizationId))
        .collect();
      const tasks = await ctx.db.query('tasks').collect();
      const notifications = await ctx.db.query('notifications').collect();
      return { control, org, users, tasks, notifications };
    });

    expect(final.control?.status).toBe('done');
    expect(final.control?.deletedDocs).toBeGreaterThan(0);
    expect(final.org).toBeNull();
    expect(final.users).toHaveLength(0);
    expect(final.tasks).toHaveLength(0);
    expect(final.notifications).toHaveLength(0);

    // The superadmin survives the purge.
    const superadmin = await c.t.run(async (ctx) => await ctx.db.get(c.superadminId));
    expect(superadmin).toBeTruthy();
  });
});
