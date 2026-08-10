/**
 * Integration tests for the news feed (Convex functions).
 *
 * The module had no authorization of any kind, and the two targeting fields it
 * stored were never applied — so these tests cover exactly the promises that
 * were broken:
 *
 *   - the author is the session, and one organization cannot read or touch
 *     another's feed;
 *   - a post addressed to a department or to specific roles reaches only them,
 *     in the feed, in the counters and in the notifications;
 *   - publishing notifies its audience, once, and never the author;
 *   - pinning is a curation right, editing is an author-or-staff right;
 *   - a view is counted once per person.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';

import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { canSeeAnnouncement } from '../../convex/news';

// convex-test normally discovers functions via `import.meta.glob`, which ts-jest
// does not provide - the module map is therefore spelled out.
const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './news.ts': () => import('../../convex/news'),
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
      name: 'Globex',
      slug: `globex-${Math.random().toString(36).slice(2)}`,
      plan: 'professional',
      isActive: true,
      createdBySuperadmin: false,
      employeeLimit: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);

    const salesId = await ctx.db.insert('departments', {
      organizationId,
      name: 'Sales',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);
    const itId = await ctx.db.insert('departments', {
      organizationId,
      name: 'IT',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);
    const foreignDeptId = await ctx.db.insert('departments', {
      organizationId: otherOrgId,
      name: 'Foreign',
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

    const adminId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Admin',
      email: 'admin@acme.test',
      role: 'admin',
    });
    const supervisorId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Manager',
      email: 'manager@acme.test',
      role: 'supervisor',
      departmentId: salesId,
    });
    const salesEmployeeId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Anna Sales',
      email: 'anna@acme.test',
      role: 'employee',
      departmentId: salesId,
    });
    const itEmployeeId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Bagrat IT',
      email: 'bagrat@acme.test',
      role: 'employee',
      departmentId: itId,
    });
    const driverId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Driver',
      email: 'driver@acme.test',
      role: 'driver',
    });
    const outsiderId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId: otherOrgId,
      name: 'Outsider',
      email: 'outsider@globex.test',
      role: 'admin',
    });

    return {
      organizationId,
      otherOrgId,
      salesId,
      itId,
      foreignDeptId,
      adminId,
      supervisorId,
      salesEmployeeId,
      itEmployeeId,
      driverId,
      outsiderId,
    };
  });

  return { t, ...ids };
}

const asAdmin = (c: Ctx) => c.t.withIdentity({ email: 'admin@acme.test' });
const asSupervisor = (c: Ctx) => c.t.withIdentity({ email: 'manager@acme.test' });
const asSales = (c: Ctx) => c.t.withIdentity({ email: 'anna@acme.test' });
const asIt = (c: Ctx) => c.t.withIdentity({ email: 'bagrat@acme.test' });
const asDriver = (c: Ctx) => c.t.withIdentity({ email: 'driver@acme.test' });
const asOutsider = (c: Ctx) => c.t.withIdentity({ email: 'outsider@globex.test' });

async function publish(c: Ctx, overrides: Record<string, unknown> = {}) {
  const result = await asAdmin(c).mutation(api.news.createAnnouncement, {
    organizationId: c.organizationId,
    title: 'Office moves to a new floor',
    content: 'We are moving to the 5th floor on Monday.',
    category: 'announcement' as const,
    isPinned: false,
    ...overrides,
  });
  return result;
}

async function notificationsOf(c: Ctx, userId: Id<'users'>) {
  return c.t.run(async (ctx) =>
    ctx.db
      .query('notifications')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect(),
  );
}

// ─────────────────────────────────────────────────────────────────────────────

describe('publishing', () => {
  it('takes the author from the session and refuses non-staff', async () => {
    const c = await seed();

    await expect(
      asSales(c).mutation(api.news.createAnnouncement, {
        organizationId: c.organizationId,
        title: 'Free coffee forever',
        content: 'Signed, the management',
        category: 'announcement',
        isPinned: false,
      }),
    ).rejects.toThrow(/staff access required/i);

    const result = await publish(c);
    expect(result.success).toBe(true);

    const stored = await c.t.run(async (ctx) => ctx.db.get(result.announcementId));
    expect(stored?.authorId).toBe(c.adminId);
  });

  it('refuses an anonymous caller', async () => {
    const c = await seed();
    await expect(
      c.t.mutation(api.news.createAnnouncement, {
        organizationId: c.organizationId,
        title: 'Anonymous',
        content: 'Nobody sent this',
        category: 'general',
        isPinned: false,
      }),
    ).rejects.toThrow(/not authorized/i);
  });

  it('rejects empty or oversized text', async () => {
    const c = await seed();
    await expect(publish(c, { title: '   ' })).rejects.toThrow(/title is required/i);
    await expect(publish(c, { content: '  ' })).rejects.toThrow(/content is required/i);
    await expect(publish(c, { title: 'x'.repeat(201) })).rejects.toThrow(/at most 200/i);
  });

  it('refuses a department from another organization', async () => {
    const c = await seed();
    await expect(publish(c, { targetDepartment: c.foreignDeptId })).rejects.toThrow(
      /department not found/i,
    );
  });

  it('cannot be published into another organization', async () => {
    const c = await seed();
    await expect(
      asOutsider(c).mutation(api.news.createAnnouncement, {
        organizationId: c.organizationId,
        title: 'Cross-tenant post',
        content: 'Should never appear',
        category: 'general',
        isPinned: false,
      }),
    ).rejects.toThrow(/not authorized/i);
  });
});

describe('notifications', () => {
  it('reaches everyone but the author', async () => {
    const c = await seed();
    const result = await publish(c);

    // 5 members in the org, minus the admin who wrote it.
    expect(result.notified).toBe(4);

    const authorInbox = await notificationsOf(c, c.adminId);
    expect(authorInbox).toHaveLength(0);

    const readerInbox = await notificationsOf(c, c.salesEmployeeId);
    expect(readerInbox).toHaveLength(1);
    expect(readerInbox[0]).toMatchObject({
      type: 'announcement_published',
      route: '/news',
      isRead: false,
    });
    expect(readerInbox[0]?.relatedId).toBe(result.announcementId);
  });

  it('only reaches the targeted department', async () => {
    const c = await seed();
    const result = await publish(c, { targetDepartment: c.salesId });

    // Sales employee and the Sales supervisor, nobody else.
    expect(result.notified).toBe(2);
    expect(await notificationsOf(c, c.salesEmployeeId)).toHaveLength(1);
    expect(await notificationsOf(c, c.supervisorId)).toHaveLength(1);
    expect(await notificationsOf(c, c.itEmployeeId)).toHaveLength(0);
    expect(await notificationsOf(c, c.driverId)).toHaveLength(0);
  });

  it('only reaches the targeted roles', async () => {
    const c = await seed();
    const result = await publish(c, { targetRoles: ['driver'] });

    expect(result.notified).toBe(1);
    expect(await notificationsOf(c, c.driverId)).toHaveLength(1);
    expect(await notificationsOf(c, c.salesEmployeeId)).toHaveLength(0);
  });

  it('carries the urgent title for an urgent post', async () => {
    const c = await seed();
    await publish(c, { isUrgent: true });

    const inbox = await notificationsOf(c, c.salesEmployeeId);
    const metadata = JSON.parse(inbox[0]?.metadata ?? '{}') as { titleKey?: string };
    expect(metadata.titleKey).toBe('notifications.titles.announcementUrgent');
  });

  it('notifies the author when someone comments, but not on their own comment', async () => {
    const c = await seed();
    const { announcementId } = await publish(c);

    await asSales(c).mutation(api.news.addComment, {
      announcementId,
      content: 'Which entrance do we use?',
    });

    const authorInbox = await notificationsOf(c, c.adminId);
    expect(authorInbox).toHaveLength(1);
    const metadata = JSON.parse(authorInbox[0]?.metadata ?? '{}') as { titleKey?: string };
    expect(metadata.titleKey).toBe('notifications.titles.announcementComment');

    await asAdmin(c).mutation(api.news.addComment, {
      announcementId,
      content: 'The main one.',
    });
    expect(await notificationsOf(c, c.adminId)).toHaveLength(1);
  });
});

describe('targeting in reads', () => {
  it('hides a department-scoped post from other departments', async () => {
    const c = await seed();
    await publish(c, { targetDepartment: c.salesId, title: 'Sales kickoff' });

    const salesFeed = await asSales(c).query(api.news.getNewsFeed, {
      organizationId: c.organizationId,
    });
    const itFeed = await asIt(c).query(api.news.getNewsFeed, {
      organizationId: c.organizationId,
    });

    expect(salesFeed).toHaveLength(1);
    expect(itFeed).toHaveLength(0);
  });

  it('hides a role-scoped post from other roles but not from staff', async () => {
    const c = await seed();
    await publish(c, { targetRoles: ['driver'], title: 'Vehicle inspection' });

    expect(
      await asDriver(c).query(api.news.getNewsFeed, { organizationId: c.organizationId }),
    ).toHaveLength(1);
    expect(
      await asSales(c).query(api.news.getNewsFeed, { organizationId: c.organizationId }),
    ).toHaveLength(0);
    // Staff keep full visibility so they can moderate what they publish.
    expect(
      await asSupervisor(c).query(api.news.getNewsFeed, { organizationId: c.organizationId }),
    ).toHaveLength(1);
  });

  it('keeps a single post unreadable by id for the wrong audience', async () => {
    const c = await seed();
    const { announcementId } = await publish(c, { targetDepartment: c.salesId });

    expect(await asSales(c).query(api.news.getAnnouncement, { announcementId })).not.toBeNull();
    expect(await asIt(c).query(api.news.getAnnouncement, { announcementId })).toBeNull();
    expect(await asOutsider(c).query(api.news.getAnnouncement, { announcementId })).toBeNull();
  });

  it('counts only what the reader can open', async () => {
    const c = await seed();
    await publish(c, { targetDepartment: c.salesId });
    await publish(c, { title: 'Everyone', content: 'For all of us' });

    const salesStats = await asSales(c).query(api.news.getNewsStats, {
      organizationId: c.organizationId,
    });
    const itStats = await asIt(c).query(api.news.getNewsStats, {
      organizationId: c.organizationId,
    });

    expect(salesStats?.active).toBe(2);
    expect(itStats?.active).toBe(1);
    expect(itStats?.unreadCount).toBe(1);
  });

  it('shows another organization nothing at all', async () => {
    const c = await seed();
    await publish(c);

    expect(
      await asOutsider(c).query(api.news.getNewsFeed, { organizationId: c.organizationId }),
    ).toEqual([]);
    expect(
      await asOutsider(c).query(api.news.getNewsStats, { organizationId: c.organizationId }),
    ).toBeNull();
  });

  it('drops expired posts', async () => {
    const c = await seed();
    await publish(c, { expiresAt: Date.now() - 1000, title: 'Yesterday' });

    const feed = await asSales(c).query(api.news.getNewsFeed, {
      organizationId: c.organizationId,
    });
    expect(feed).toHaveLength(0);
  });
});

describe('moderation', () => {
  it('lets staff pin but nobody else', async () => {
    const c = await seed();
    const { announcementId } = await publish(c);

    await expect(
      asSales(c).mutation(api.news.togglePinAnnouncement, { announcementId }),
    ).rejects.toThrow(/staff access required/i);

    const pinned = await asSupervisor(c).mutation(api.news.togglePinAnnouncement, {
      announcementId,
    });
    expect(pinned.isPinned).toBe(true);
  });

  it('lets the author and staff edit, and nobody else', async () => {
    const c = await seed();
    const { announcementId } = await publish(c);

    await expect(
      asSales(c).mutation(api.news.updateAnnouncement, { announcementId, title: 'Hijacked' }),
    ).rejects.toThrow(/not authorized/i);

    await asAdmin(c).mutation(api.news.updateAnnouncement, { announcementId, title: 'Corrected' });
    const stored = await c.t.run(async (ctx) => ctx.db.get(announcementId));
    expect(stored?.title).toBe('Corrected');
  });

  it('cannot be edited or deleted from another organization', async () => {
    const c = await seed();
    const { announcementId } = await publish(c);

    await expect(
      asOutsider(c).mutation(api.news.updateAnnouncement, { announcementId, title: 'Defaced' }),
    ).rejects.toThrow(/not authorized/i);
    await expect(
      asOutsider(c).mutation(api.news.deleteAnnouncement, { announcementId }),
    ).rejects.toThrow(/not authorized/i);
  });

  it('removes reactions, comments and views with the post', async () => {
    const c = await seed();
    const { announcementId } = await publish(c);

    await asSales(c).mutation(api.news.addReaction, { announcementId, emoji: '👍' });
    await asSales(c).mutation(api.news.addComment, { announcementId, content: 'Great' });
    await asSales(c).mutation(api.news.incrementViewCount, { announcementId });

    await asAdmin(c).mutation(api.news.deleteAnnouncement, { announcementId });

    const leftovers = await c.t.run(async (ctx) => ({
      reactions: await ctx.db.query('announcementReactions').collect(),
      comments: await ctx.db.query('announcementComments').collect(),
      views: await ctx.db.query('announcementViews').collect(),
    }));
    expect(leftovers.reactions).toHaveLength(0);
    expect(leftovers.comments).toHaveLength(0);
    expect(leftovers.views).toHaveLength(0);
  });

  it('recounts views for the caller’s organization only, and only for admins', async () => {
    const c = await seed();
    await publish(c);

    await expect(
      asSupervisor(c).mutation(api.news.resetAllViewCounts, {
        organizationId: c.organizationId,
      }),
    ).rejects.toThrow(/admin/i);

    const result = await asAdmin(c).mutation(api.news.resetAllViewCounts, {
      organizationId: c.organizationId,
    });
    expect(result.success).toBe(true);
  });
});

describe('reactions, comments and views', () => {
  it('toggles a reaction and marks it as mine', async () => {
    const c = await seed();
    const { announcementId } = await publish(c);

    await asSales(c).mutation(api.news.addReaction, { announcementId, emoji: '🎉' });
    let feed = await asSales(c).query(api.news.getNewsFeed, {
      organizationId: c.organizationId,
    });
    expect(feed[0]?.myReactions).toEqual(['🎉']);
    expect(feed[0]?.reactionsByEmoji[0]?.users).toHaveLength(1);

    const removed = await asSales(c).mutation(api.news.addReaction, {
      announcementId,
      emoji: '🎉',
    });
    expect(removed.action).toBe('removed');
    feed = await asSales(c).query(api.news.getNewsFeed, { organizationId: c.organizationId });
    expect(feed[0]?.myReactions).toEqual([]);
  });

  it('refuses reactions and comments from outside the audience', async () => {
    const c = await seed();
    const { announcementId } = await publish(c, { targetDepartment: c.salesId });

    await expect(
      asIt(c).mutation(api.news.addReaction, { announcementId, emoji: '👍' }),
    ).rejects.toThrow(/not found/i);
    await expect(
      asIt(c).mutation(api.news.addComment, { announcementId, content: 'Sneaking in' }),
    ).rejects.toThrow(/not found/i);
  });

  it('rejects an empty comment and an over-long one', async () => {
    const c = await seed();
    const { announcementId } = await publish(c);

    await expect(
      asSales(c).mutation(api.news.addComment, { announcementId, content: '   ' }),
    ).rejects.toThrow(/cannot be empty/i);
    await expect(
      asSales(c).mutation(api.news.addComment, { announcementId, content: 'x'.repeat(2001) }),
    ).rejects.toThrow(/at most 2000/i);
  });

  it('lets the author delete their comment and staff delete anyone’s', async () => {
    const c = await seed();
    const { announcementId } = await publish(c);

    const mine = await asSales(c).mutation(api.news.addComment, {
      announcementId,
      content: 'Mine',
    });
    const other = await asIt(c).mutation(api.news.addComment, {
      announcementId,
      content: 'Theirs',
    });

    await expect(
      asSales(c).mutation(api.news.deleteComment, { commentId: other.commentId }),
    ).rejects.toThrow(/not authorized/i);

    await asSales(c).mutation(api.news.deleteComment, { commentId: mine.commentId });
    await asAdmin(c).mutation(api.news.deleteComment, { commentId: other.commentId });

    const stored = await c.t.run(async (ctx) => ctx.db.get(announcementId));
    expect(stored?.commentCount).toBe(0);
  });

  it('counts a view once per person and flips isUnread', async () => {
    const c = await seed();
    const { announcementId } = await publish(c);

    let feed = await asSales(c).query(api.news.getNewsFeed, {
      organizationId: c.organizationId,
    });
    expect(feed[0]?.isUnread).toBe(true);

    const first = await asSales(c).mutation(api.news.incrementViewCount, { announcementId });
    const second = await asSales(c).mutation(api.news.incrementViewCount, { announcementId });
    expect(first.alreadyViewed).toBe(false);
    expect(second.alreadyViewed).toBe(true);

    feed = await asSales(c).query(api.news.getNewsFeed, { organizationId: c.organizationId });
    expect(feed[0]?.isUnread).toBe(false);
    expect(feed[0]?.viewCount).toBe(1);
  });
});

describe('canSeeAnnouncement', () => {
  const viewer = {
    _id: 'user_1' as Id<'users'>,
    role: 'employee',
    departmentId: 'dept_sales' as Id<'departments'>,
  };
  const base = {
    authorId: 'user_2' as Id<'users'>,
    organizationId: 'org_1' as Id<'organizations'>,
  };

  it('lets an untargeted post through', () => {
    expect(canSeeAnnouncement({ ...base }, viewer, false)).toBe(true);
  });

  it('matches on department', () => {
    expect(
      canSeeAnnouncement(
        { ...base, targetDepartment: 'dept_sales' as Id<'departments'> },
        viewer,
        false,
      ),
    ).toBe(true);
    expect(
      canSeeAnnouncement(
        { ...base, targetDepartment: 'dept_it' as Id<'departments'> },
        viewer,
        false,
      ),
    ).toBe(false);
  });

  it('matches on role', () => {
    expect(canSeeAnnouncement({ ...base, targetRoles: ['employee'] }, viewer, false)).toBe(true);
    expect(canSeeAnnouncement({ ...base, targetRoles: ['driver'] }, viewer, false)).toBe(false);
    // An empty list is not a filter.
    expect(canSeeAnnouncement({ ...base, targetRoles: [] }, viewer, false)).toBe(true);
  });

  it('always shows the author their own post, and staff everything', () => {
    const mine = { ...base, authorId: viewer._id, targetRoles: ['driver' as const] };
    expect(canSeeAnnouncement(mine, viewer, false)).toBe(true);
    expect(canSeeAnnouncement({ ...base, targetRoles: ['driver'] }, viewer, true)).toBe(true);
  });
});

describe('news — defensive and rendering paths', () => {
  it('rejects over-long content on create and over-long edits', async () => {
    const c = await seed();
    const { announcementId } = await publish(c);

    await expect(publish(c, { content: 'x'.repeat(20_001) })).rejects.toThrow(/at most 20000/i);
    await expect(
      asAdmin(c).mutation(api.news.updateAnnouncement, { announcementId, title: 'x'.repeat(201) }),
    ).rejects.toThrow(/at most 200/i);
    await expect(
      asAdmin(c).mutation(api.news.updateAnnouncement, {
        announcementId,
        content: 'x'.repeat(20_001),
      }),
    ).rejects.toThrow(/at most 20000/i);
  });

  it('refuses to retarget an announcement to a foreign department', async () => {
    const c = await seed();
    const { announcementId } = await publish(c);

    await expect(
      asAdmin(c).mutation(api.news.updateAnnouncement, {
        announcementId,
        targetDepartment: c.foreignDeptId,
      }),
    ).rejects.toThrow(/department not found/i);
  });

  it('refuses a non-author employee deleting someone else’s post', async () => {
    const c = await seed();
    const { announcementId } = await publish(c); // authored by admin

    await expect(
      asSales(c).mutation(api.news.deleteAnnouncement, { announcementId }),
    ).rejects.toThrow(/not authorized to delete/i);
  });

  it('rejects a comment whose parent belongs to another announcement', async () => {
    const c = await seed();
    const first = await publish(c);
    const second = await publish(c, { title: 'Second post' });
    const parent = await asIt(c).mutation(api.news.addComment, {
      announcementId: first.announcementId,
      content: 'Parent',
    });

    await expect(
      asIt(c).mutation(api.news.addComment, {
        announcementId: second.announcementId,
        content: 'Child',
        parentCommentId: parent.commentId,
      }),
    ).rejects.toThrow(/parent comment not found/i);
  });

  it('deletes child comments together with a parent comment', async () => {
    const c = await seed();
    const { announcementId } = await publish(c);
    const parent = await asSales(c).mutation(api.news.addComment, {
      announcementId,
      content: 'Parent',
    });
    const child = await asIt(c).mutation(api.news.addComment, {
      announcementId,
      content: 'Child',
      parentCommentId: parent.commentId,
    });

    await asSales(c).mutation(api.news.deleteComment, { commentId: parent.commentId });

    const remaining = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('announcementComments').collect();
      return rows.map((row) => row._id);
    });
    expect(remaining).not.toContain(parent.commentId);
    expect(remaining).not.toContain(child.commentId);
  });

  it('recounts views that drifted from the stored counter', async () => {
    const c = await seed();
    const { announcementId } = await publish(c);
    await asSales(c).mutation(api.news.incrementViewCount, { announcementId });

    // Delete the view row so the counter is now stale.
    await c.t.run(async (ctx) => {
      const views = await ctx.db.query('announcementViews').collect();
      for (const view of views) await ctx.db.delete(view._id);
    });

    const result = await asAdmin(c).mutation(api.news.resetAllViewCounts, {
      organizationId: c.organizationId,
    });
    expect(result.totalReset).toBe(1);

    const stored = await c.t.run(async (ctx) => ctx.db.get(announcementId));
    expect(stored?.viewCount).toBe(0);
  });

  it('filters the feed by category and pins ahead of the rest', async () => {
    const c = await seed();
    await publish(c, { title: 'A news item', content: 'x', category: 'news' as const });
    await publish(c, {
      title: 'Pinned event',
      content: 'y',
      category: 'event' as const,
      isPinned: true,
    });

    const newsOnly = await asSales(c).query(api.news.getNewsFeed, {
      organizationId: c.organizationId,
      category: 'news' as const,
    });
    expect(newsOnly).toHaveLength(1);
    expect(newsOnly[0]?.title).toBe('A news item');

    const all = await asSales(c).query(api.news.getNewsFeed, {
      organizationId: c.organizationId,
    });
    expect(all[0]?.title).toBe('Pinned event');
    expect(all[0]?.isPinned).toBe(true);
  });

  it('enriches feed and detail with comment authors and reaction names', async () => {
    const c = await seed();
    const { announcementId } = await publish(c);
    await asIt(c).mutation(api.news.addComment, { announcementId, content: 'Nice!' });
    await asIt(c).mutation(api.news.addReaction, { announcementId, emoji: '🎉' });

    const feed = await asSales(c).query(api.news.getNewsFeed, {
      organizationId: c.organizationId,
    });
    expect(feed[0]?.comments[0]?.authorName).toBe('Bagrat IT');
    expect(feed[0]?.reactionsByEmoji[0]?.users[0]?.userName).toBe('Bagrat IT');

    const detail = await asSales(c).query(api.news.getAnnouncement, { announcementId });
    expect(detail?.comments[0]?.authorName).toBe('Bagrat IT');
    expect(detail?.reactionsByEmoji[0]?.users[0]?.userName).toBe('Bagrat IT');
  });
});
