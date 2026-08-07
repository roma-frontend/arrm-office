/**
 * Integration tests for convex/notifications.ts against convex-test's in-memory
 * database — real schema and real index-based queries.
 *
 * Verifies the real `by_user` / `by_user_unread` indexes drive the paginated
 * list, unread counts, read/delete mutations.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './notifications.ts': () => import('../../convex/notifications'),
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
      organizationId,
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

    const userId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'User',
      email: 'user@acme.test',
      role: 'employee',
    });

    // Seed notifications directly (as the notify() helper would create them).
    for (let i = 0; i < 5; i += 1) {
      await ctx.db.insert('notifications', {
        organizationId,
        userId,
        type: 'system',
        title: `Notice ${i}`,
        message: `Message ${i}`,
        isRead: i % 2 === 0, // 0, 2, 4 read; 1, 3 unread
        metadata: '{"k":"v"}',
        createdAt: Date.now() + i, // ascending creation time
      } as never);
    }

    return { organizationId, userId };
  });

  return { t, ...ids };
}

const asUser = (c: Ctx) => c.t.withIdentity({ email: 'user@acme.test' });

describe('notifications.listPaginated', () => {
  it('returns the newest page first via the by_user index', async () => {
    const c = await seed();
    const firstPage = await asUser(c).query(api.notifications.listPaginated, {
      userId: c.userId,
      paginationOpts: { numItems: 2, cursor: null },
    });

    expect(firstPage.page).toHaveLength(2);
    // Descending order: newest (4) then 3.
    expect(firstPage.page[0].title).toBe('Notice 4');
    expect(firstPage.page[1].title).toBe('Notice 3');
    expect(firstPage.isDone).toBe(false);
    expect(firstPage.continueCursor).toBeTruthy();

    const secondPage = await asUser(c).query(api.notifications.listPaginated, {
      userId: c.userId,
      paginationOpts: { numItems: 2, cursor: firstPage.continueCursor },
    });
    expect(secondPage.page).toHaveLength(2);
    expect(secondPage.page[0].title).toBe('Notice 2');
    expect(secondPage.page[1].title).toBe('Notice 1');

    // Final page reaches the end.
    const lastPage = await asUser(c).query(api.notifications.listPaginated, {
      userId: c.userId,
      paginationOpts: { numItems: 10, cursor: secondPage.continueCursor },
    });
    expect(lastPage.isDone).toBe(true);
    expect(lastPage.page).toHaveLength(1); // Notice 0
  });

  it("does not leak another user's notifications", async () => {
    const c = await seed();
    const otherId = await c.t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        organizationId: c.organizationId,
        name: 'Other',
        email: 'other@acme.test',
        passwordHash: 'x',
        role: 'employee',
        employeeType: 'staff',
        isActive: true,
        isApproved: true,
        travelAllowance: 0,
        paidLeaveBalance: 10,
        sickLeaveBalance: 5,
        familyLeaveBalance: 5,
        createdAt: Date.now(),
      });
    });
    await c.t.run(async (ctx) => {
      await ctx.db.insert('notifications', {
        organizationId: c.organizationId,
        userId: otherId,
        type: 'system',
        title: 'Other notice',
        message: 'x',
        isRead: false,
        createdAt: Date.now(),
      } as never);
    });

    const page = await asUser(c).query(api.notifications.listPaginated, {
      userId: c.userId,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(page.page.every((n) => n.userId === c.userId)).toBe(true);
    expect(page.page).toHaveLength(5);
  });
});

describe('notifications.getUnreadCount', () => {
  it('counts only unread notifications via by_user_unread', async () => {
    const c = await seed();
    const count = await asUser(c).query(api.notifications.getUnreadCount, {
      userId: c.userId,
    });
    expect(count).toBe(2); // notices 1 and 3
  });
});

describe('notifications.markAsRead / markAllAsRead', () => {
  it('marks a single notification as read', async () => {
    const c = await seed();
    const target = await c.t.run(async (ctx) => {
      const rows = await ctx.db
        .query('notifications')
        .withIndex('by_user', (q) => q.eq('userId', c.userId))
        .collect();
      return rows.find((n) => n.title === 'Notice 1')!;
    });

    await asUser(c).mutation(api.notifications.markAsRead, { notificationId: target._id });

    const after = await c.t.run(async (ctx) => await ctx.db.get(target._id));
    expect(after?.isRead).toBe(true);
    // Unread count drops to 1.
    const count = await asUser(c).query(api.notifications.getUnreadCount, {
      userId: c.userId,
    });
    expect(count).toBe(1);
  });

  it('marks every unread notification as read and returns the count', async () => {
    const c = await seed();
    const count = await asUser(c).mutation(api.notifications.markAllAsRead, {
      userId: c.userId,
    });
    expect(count).toBe(2);

    const unread = await c.t.run(async (ctx) => {
      const rows = await ctx.db
        .query('notifications')
        .withIndex('by_user_unread', (q) => q.eq('userId', c.userId).eq('isRead', false))
        .collect();
      return rows.length;
    });
    expect(unread).toBe(0);

    // Second run is a no-op.
    const again = await asUser(c).mutation(api.notifications.markAllAsRead, {
      userId: c.userId,
    });
    expect(again).toBe(0);
  });
});

describe('notifications.deleteNotification', () => {
  it("deletes the row and drops it from the user's list", async () => {
    const c = await seed();
    const target = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('notifications').collect();
      return rows.find((n) => n.title === 'Notice 2')!;
    });

    await asUser(c).mutation(api.notifications.deleteNotification, {
      notificationId: target._id,
    });

    const page = await asUser(c).query(api.notifications.listPaginated, {
      userId: c.userId,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(page.page.map((n) => n.title)).not.toContain('Notice 2');
    expect(page.page).toHaveLength(4);
  });
});
