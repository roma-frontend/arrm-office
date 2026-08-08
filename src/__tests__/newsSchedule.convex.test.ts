/**
 * Integration tests for the dated news list.
 *
 * The promise is narrow and easy to break: what the admin dates appears that day,
 * in the reader's language, once — and is gone when the day is over. Multi-day
 * runs must not re-publish every morning, and a yearly entry must come back
 * without being touched.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';

import schema from '../../convex/schema';
import { api, internal } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { orgDayKey, orgDayEnd, addDays } from '../../convex/lib/orgDays';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './news.ts': () => import('../../convex/news'),
  './newsSchedule.ts': () => import('../../convex/newsSchedule'),
} as unknown as Record<string, () => Promise<unknown>>;

const TODAY = orgDayKey();

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
      name: 'Anna',
      email: 'anna@acme.test',
      role: 'employee',
    });

    return { organizationId, adminId, employeeId };
  });

  const asAdmin = t.withIdentity({ email: 'admin@acme.test' });
  const asEmployee = t.withIdentity({ email: 'anna@acme.test' });

  return { t, asAdmin, asEmployee, ...ids };
}

const copy = {
  title: { en: 'Happy birthday, Anna!', ru: 'С днём рождения, Анна!' },
  content: { en: 'Anna turns another year today.', ru: 'Анна сегодня празднует день рождения.' },
};

async function feedFor(
  ctx: Awaited<ReturnType<typeof seed>>,
  as: 'admin' | 'employee' = 'employee',
) {
  const client = as === 'admin' ? ctx.asAdmin : ctx.asEmployee;
  return (await client.query(api.news.getNewsFeed, {
    organizationId: ctx.organizationId,
  })) as Array<{
    _id: Id<'announcements'>;
    title: string;
    titleI18n?: Record<string, string>;
    contentI18n?: Record<string, string>;
    expiresAt?: number;
    category: string;
  }>;
}

describe('news schedule — access', () => {
  it('only admins may add an entry', async () => {
    const ctx = await seed();

    await expect(
      ctx.asEmployee.mutation(api.newsSchedule.createScheduleEntry, {
        organizationId: ctx.organizationId,
        category: 'birthday',
        ...copy,
        startDate: TODAY,
        endDate: TODAY,
        repeat: 'yearly',
      }),
    ).rejects.toThrow();
  });

  it('hides the editing list from employees', async () => {
    const ctx = await seed();
    const list = await ctx.asEmployee.query(api.newsSchedule.listSchedule, {
      organizationId: ctx.organizationId,
    });
    expect(list).toEqual([]);
  });

  it('refuses a range that ends before it starts', async () => {
    const ctx = await seed();
    await expect(
      ctx.asAdmin.mutation(api.newsSchedule.createScheduleEntry, {
        organizationId: ctx.organizationId,
        category: 'event',
        ...copy,
        startDate: TODAY,
        endDate: addDays(TODAY, -1),
        repeat: 'none',
      }),
    ).rejects.toThrow();
  });

  it('accepts an entry written only in Armenian and shows it to everyone', async () => {
    const ctx = await seed();

    // The office may work in Armenian; requiring English first would be a tax on
    // the people the feature is for.
    await ctx.asAdmin.mutation(api.newsSchedule.createScheduleEntry, {
      organizationId: ctx.organizationId,
      category: 'birthday',
      title: { hy: 'Ծնունդդ շնորհավոր, Աննա։' },
      content: { hy: 'Աննան այսօր ծնունդ ունի։' },
      startDate: TODAY,
      endDate: TODAY,
      repeat: 'none',
    });

    const feed = await feedFor(ctx);
    expect(feed).toHaveLength(1);
    // No English to fall back to, so the card carries the Armenian rather than a blank.
    expect(feed[0]!.title).toBe('Ծնունդդ շնորհավոր, Աննա։');
    expect(feed[0]!.titleI18n?.hy).toBe('Ծնունդդ շնորհավոր, Աննա։');
    expect(feed[0]!.titleI18n?.en).toBeUndefined();
  });

  it('still requires at least one language', async () => {
    const ctx = await seed();
    await expect(
      ctx.asAdmin.mutation(api.newsSchedule.createScheduleEntry, {
        organizationId: ctx.organizationId,
        category: 'event',
        title: { en: '   ' },
        content: { ru: '' },
        startDate: TODAY,
        endDate: TODAY,
        repeat: 'none',
      }),
    ).rejects.toThrow();
  });
});

describe('news schedule — publishing', () => {
  it('publishes an entry dated today straight away', async () => {
    const ctx = await seed();

    const result = (await ctx.asAdmin.mutation(api.newsSchedule.createScheduleEntry, {
      organizationId: ctx.organizationId,
      category: 'birthday',
      ...copy,
      startDate: TODAY,
      endDate: TODAY,
      repeat: 'yearly',
    })) as { publishedNow: boolean };

    expect(result.publishedNow).toBe(true);

    const feed = await feedFor(ctx);
    expect(feed).toHaveLength(1);
    expect(feed[0]!.title).toBe('Happy birthday, Anna!');
    expect(feed[0]!.titleI18n?.ru).toBe('С днём рождения, Анна!');
    expect(feed[0]!.category).toBe('birthday');
  });

  it('does not publish an entry dated tomorrow', async () => {
    const ctx = await seed();

    const result = (await ctx.asAdmin.mutation(api.newsSchedule.createScheduleEntry, {
      organizationId: ctx.organizationId,
      category: 'event',
      ...copy,
      startDate: addDays(TODAY, 1),
      endDate: addDays(TODAY, 1),
      repeat: 'none',
    })) as { publishedNow: boolean };

    expect(result.publishedNow).toBe(false);
    expect(await feedFor(ctx)).toHaveLength(0);
  });

  it('publishes a due entry exactly once, however often the sweep runs', async () => {
    const ctx = await seed();

    await ctx.t.run(async (dbCtx) => {
      await dbCtx.db.insert('announcementSchedule', {
        organizationId: ctx.organizationId,
        createdBy: ctx.adminId,
        category: 'birthday',
        title: copy.title,
        content: copy.content,
        startDate: TODAY,
        endDate: TODAY,
        repeat: 'none',
        isPinned: false,
        isUrgent: false,
        isActive: true,
        createdAt: Date.now(),
      } as never);
    });

    const first = (await ctx.t.mutation(internal.newsSchedule.publishDueEntries, {})) as {
      published: number;
    };
    const second = (await ctx.t.mutation(internal.newsSchedule.publishDueEntries, {})) as {
      published: number;
    };

    expect(first.published).toBe(1);
    expect(second.published).toBe(0);
    expect(await feedFor(ctx)).toHaveLength(1);
  });

  it('keeps a multi-day run as one post for its whole length', async () => {
    const ctx = await seed();

    await ctx.asAdmin.mutation(api.newsSchedule.createScheduleEntry, {
      organizationId: ctx.organizationId,
      category: 'event',
      ...copy,
      startDate: TODAY,
      endDate: addDays(TODAY, 2),
      repeat: 'none',
    });

    // A later sweep on the same run must not add a second post.
    await ctx.t.mutation(internal.newsSchedule.publishDueEntries, {});

    const feed = await feedFor(ctx);
    expect(feed).toHaveLength(1);
    // Up until the end of the third day.
    expect(feed[0]!.expiresAt).toBe(orgDayEnd(addDays(TODAY, 2)));
  });

  it('sets the expiry to the end of the day for a one-day post', async () => {
    const ctx = await seed();

    await ctx.asAdmin.mutation(api.newsSchedule.createScheduleEntry, {
      organizationId: ctx.organizationId,
      category: 'birthday',
      ...copy,
      startDate: TODAY,
      endDate: TODAY,
      repeat: 'yearly',
    });

    const feed = await feedFor(ctx);
    expect(feed[0]!.expiresAt).toBe(orgDayEnd(TODAY));
    expect(feed[0]!.expiresAt).toBeGreaterThan(Date.now());
  });

  it('notifies the audience about the published post', async () => {
    const ctx = await seed();

    await ctx.asAdmin.mutation(api.newsSchedule.createScheduleEntry, {
      organizationId: ctx.organizationId,
      category: 'birthday',
      ...copy,
      startDate: TODAY,
      endDate: TODAY,
      repeat: 'none',
    });

    const notifications = await ctx.t.run(async (dbCtx) =>
      dbCtx.db
        .query('notifications')
        .filter((q) => q.eq(q.field('userId'), ctx.employeeId))
        .collect(),
    );
    expect(notifications.length).toBe(1);
  });
});

describe('news schedule — taking posts down', () => {
  it('deletes a post whose last day has passed, with its comments', async () => {
    const ctx = await seed();

    const announcementId = await ctx.t.run(async (dbCtx) => {
      const id = await dbCtx.db.insert('announcements', {
        organizationId: ctx.organizationId,
        authorId: ctx.adminId,
        title: 'Yesterday',
        content: 'Over',
        category: 'birthday',
        isPinned: false,
        isUrgent: false,
        publishedAt: Date.now() - 172_800_000,
        expiresAt: Date.now() - 1_000,
        viewCount: 0,
        reactionCount: 0,
        commentCount: 1,
        createdAt: Date.now() - 172_800_000,
      } as never);
      await dbCtx.db.insert('announcementComments', {
        organizationId: ctx.organizationId,
        announcementId: id,
        authorId: ctx.employeeId,
        content: 'Congrats!',
        isEdited: false,
        createdAt: Date.now(),
      } as never);
      return id;
    });

    const result = (await ctx.t.mutation(internal.newsSchedule.expireAnnouncements, {})) as {
      removed: number;
    };
    expect(result.removed).toBe(1);

    await ctx.t.run(async (dbCtx) => {
      expect(await dbCtx.db.get(announcementId)).toBeNull();
      const comments = await dbCtx.db
        .query('announcementComments')
        .withIndex('by_announcement', (q) => q.eq('announcementId', announcementId))
        .collect();
      expect(comments).toHaveLength(0);
    });
  });

  it('leaves a post whose day is still running', async () => {
    const ctx = await seed();

    await ctx.asAdmin.mutation(api.newsSchedule.createScheduleEntry, {
      organizationId: ctx.organizationId,
      category: 'birthday',
      ...copy,
      startDate: TODAY,
      endDate: TODAY,
      repeat: 'none',
    });

    const result = (await ctx.t.mutation(internal.newsSchedule.expireAnnouncements, {})) as {
      removed: number;
    };
    expect(result.removed).toBe(0);
    expect(await feedFor(ctx)).toHaveLength(1);
  });

  it('never touches a post without an expiry', async () => {
    const ctx = await seed();

    await ctx.asAdmin.mutation(api.news.createAnnouncement, {
      organizationId: ctx.organizationId,
      title: 'Evergreen',
      content: 'No end date',
      category: 'news',
      isPinned: false,
    });

    await ctx.t.mutation(internal.newsSchedule.expireAnnouncements, {});
    expect(await feedFor(ctx)).toHaveLength(1);
  });

  it('pulls the live post when the entry is deleted', async () => {
    const ctx = await seed();

    const { entryId } = (await ctx.asAdmin.mutation(api.newsSchedule.createScheduleEntry, {
      organizationId: ctx.organizationId,
      category: 'birthday',
      ...copy,
      startDate: TODAY,
      endDate: TODAY,
      repeat: 'none',
    })) as { entryId: Id<'announcementSchedule'> };

    expect(await feedFor(ctx)).toHaveLength(1);

    await ctx.asAdmin.mutation(api.newsSchedule.deleteScheduleEntry, { entryId });
    expect(await feedFor(ctx)).toHaveLength(0);
  });

  it('pulls the live post when the entry is paused, and edits reach it', async () => {
    const ctx = await seed();

    const { entryId } = (await ctx.asAdmin.mutation(api.newsSchedule.createScheduleEntry, {
      organizationId: ctx.organizationId,
      category: 'birthday',
      ...copy,
      startDate: TODAY,
      endDate: TODAY,
      repeat: 'none',
    })) as { entryId: Id<'announcementSchedule'> };

    await ctx.asAdmin.mutation(api.newsSchedule.updateScheduleEntry, {
      entryId,
      title: { en: 'Corrected title', ru: 'Исправленный заголовок' },
    });

    const feed = await feedFor(ctx);
    expect(feed[0]!.title).toBe('Corrected title');
    expect(feed[0]!.titleI18n?.ru).toBe('Исправленный заголовок');

    await ctx.asAdmin.mutation(api.newsSchedule.updateScheduleEntry, { entryId, isActive: false });
    expect(await feedFor(ctx)).toHaveLength(0);
  });
});

describe('news schedule — the editing list', () => {
  it('marks an entry that is on the feed right now', async () => {
    const ctx = await seed();

    await ctx.asAdmin.mutation(api.newsSchedule.createScheduleEntry, {
      organizationId: ctx.organizationId,
      category: 'birthday',
      ...copy,
      startDate: TODAY,
      endDate: TODAY,
      repeat: 'yearly',
    });
    await ctx.asAdmin.mutation(api.newsSchedule.createScheduleEntry, {
      organizationId: ctx.organizationId,
      category: 'event',
      ...copy,
      startDate: addDays(TODAY, 30),
      endDate: addDays(TODAY, 31),
      repeat: 'none',
    });

    const list = (await ctx.asAdmin.query(api.newsSchedule.listSchedule, {
      organizationId: ctx.organizationId,
    })) as Array<{ isLive: boolean; startDate: string }>;

    expect(list).toHaveLength(2);
    expect(list.filter((e) => e.isLive)).toHaveLength(1);
    // Dated order, so several entries on one day appear as the admin arranged them.
    expect(list[0]!.startDate <= list[1]!.startDate).toBe(true);
  });
});
