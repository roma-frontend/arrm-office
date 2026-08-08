/**
 * Dated news entries: the schedule behind the feed.
 *
 * Birthdays and the rest of the office calendar used to be announced by hand, on
 * the day, in one language — or forgotten. An admin now fills a row in once, with
 * its copy in every language and the day (or the range of days) it belongs to,
 * and the feed publishes it on that day and takes it down when the day is over.
 *
 * Days are calendar days in the organization's timezone, never instants: an entry
 * dated the 22nd must appear on the 22nd in Yerevan regardless of when the cron
 * happens to run. See `lib/orgDays.ts`.
 */

import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { assertOrgStaff, resolveOrgStaff, scopeOwnsRecord } from './lib/orgAccess';
import { isDayKey, occurrenceFor, orgDayEnd, orgDayKey, windowCoversDay } from './lib/orgDays';
import { notifyAudience, purgeAnnouncement } from './news';
import { logger } from '../src/lib/logger';

const MAX_TITLE = 200;
const MAX_CONTENT = 20_000;
/** A range longer than this is a mistake, not a campaign. */
const MAX_SPAN_DAYS = 60;
/** Locales the interface ships; anything else is ignored on write. */
const LOCALES = ['en', 'ru', 'hy', 'de'] as const;

const categoryValidator = v.union(
  v.literal('news'),
  v.literal('announcement'),
  v.literal('event'),
  v.literal('birthday'),
  v.literal('achievement'),
  v.literal('policy'),
  v.literal('general'),
);

const roleValidator = v.array(
  v.union(
    v.literal('superadmin'),
    v.literal('admin'),
    v.literal('supervisor'),
    v.literal('employee'),
    v.literal('driver'),
  ),
);

/**
 * Keep only known locales, trimmed and non-empty.
 *
 * English is required because it is the fallback every other language falls back
 * to; a row whose only copy is Armenian would read as blank for everyone else.
 */
function sanitizeCopy(
  input: Record<string, string>,
  limit: number,
  field: 'title' | 'content',
): Record<string, string> {
  const copy: Record<string, string> = {};
  for (const locale of LOCALES) {
    const text = (input[locale] ?? '').trim();
    if (!text) continue;
    if (text.length > limit) throw new Error(`Schedule ${field} is too long for ${locale}`);
    copy[locale] = text;
  }
  if (!copy.en) throw new Error(`Schedule ${field} needs an English version`);
  return copy;
}

/** Pick the reader's language, falling back to English and then to anything. */
export function pickLocalized(copy: Record<string, string>, locale: string): string {
  return copy[locale] ?? copy.en ?? Object.values(copy)[0] ?? '';
}

function assertWindow(startDate: string, endDate: string): void {
  if (!isDayKey(startDate) || !isDayKey(endDate)) {
    throw new Error('Dates must be calendar days in yyyy-MM-dd form');
  }
  if (endDate < startDate) throw new Error('The last day cannot precede the first');

  const span =
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000 + 1;
  if (span > MAX_SPAN_DAYS)
    throw new Error(`A schedule entry cannot span more than ${MAX_SPAN_DAYS} days`);
}

/** Departments and named employees must belong to the same organization. */
async function assertTargetsInOrg(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
  args: { employeeId?: Id<'users'>; targetDepartment?: Id<'departments'> },
): Promise<void> {
  if (args.employeeId) {
    const employee = await ctx.db.get(args.employeeId);
    if (!employee || employee.organizationId !== organizationId) {
      throw new Error('Employee not found in this organization');
    }
  }
  if (args.targetDepartment) {
    const department = await ctx.db.get(args.targetDepartment);
    if (!department || department.organizationId !== organizationId) {
      throw new Error('Department not found in this organization');
    }
  }
}

// ─── ADMIN CRUD ───────────────────────────────────────────────────────────────

/** The schedule list, newest window first. Staff only — it is an editing view. */
export const listSchedule = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const scope = await resolveOrgStaff(ctx, args.organizationId);
    if (!scope) return [];

    const entries = await ctx.db
      .query('announcementSchedule')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    const employeeIds = [
      ...new Set(entries.map((e) => e.employeeId).filter(Boolean)),
    ] as Id<'users'>[];
    const employees = await Promise.all(employeeIds.map((id) => ctx.db.get(id)));
    const nameById = new Map(
      employees.filter((u): u is Doc<'users'> => !!u).map((u) => [u._id, u.name]),
    );

    const today = orgDayKey();

    return entries
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.createdAt - b.createdAt)
      .map((entry) => ({
        ...entry,
        employeeName: entry.employeeId ? nameById.get(entry.employeeId) : undefined,
        /** True when today falls inside the window, i.e. it is on the feed now. */
        isLive: entry.isActive && windowCoversDay(entry, today),
      }));
  },
});

export const createScheduleEntry = mutation({
  args: {
    organizationId: v.id('organizations'),
    category: categoryValidator,
    title: v.record(v.string(), v.string()),
    content: v.record(v.string(), v.string()),
    startDate: v.string(),
    endDate: v.string(),
    repeat: v.union(v.literal('none'), v.literal('yearly')),
    employeeId: v.optional(v.id('users')),
    targetDepartment: v.optional(v.id('departments')),
    targetRoles: v.optional(roleValidator),
    imageUrl: v.optional(v.string()),
    isPinned: v.optional(v.boolean()),
    isUrgent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const scope = await assertOrgStaff(ctx, args.organizationId, { adminOnly: true });
    const organizationId = scope.organizationId ?? args.organizationId;

    assertWindow(args.startDate, args.endDate);
    await assertTargetsInOrg(ctx, organizationId, args);

    const now = Date.now();
    const entryId = await ctx.db.insert('announcementSchedule', {
      organizationId,
      createdBy: scope.caller._id,
      category: args.category,
      title: sanitizeCopy(args.title, MAX_TITLE, 'title'),
      content: sanitizeCopy(args.content, MAX_CONTENT, 'content'),
      startDate: args.startDate,
      endDate: args.endDate,
      repeat: args.repeat,
      employeeId: args.employeeId,
      targetDepartment: args.targetDepartment,
      targetRoles: args.targetRoles,
      imageUrl: args.imageUrl,
      isPinned: args.isPinned ?? false,
      isUrgent: args.isUrgent ?? false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    // An entry added for today should not wait for tomorrow's sweep.
    const published = await publishEntryIfDue(ctx, await ctx.db.get(entryId), orgDayKey(now), now);

    return { entryId, publishedNow: published };
  },
});

export const updateScheduleEntry = mutation({
  args: {
    entryId: v.id('announcementSchedule'),
    category: v.optional(categoryValidator),
    title: v.optional(v.record(v.string(), v.string())),
    content: v.optional(v.record(v.string(), v.string())),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    repeat: v.optional(v.union(v.literal('none'), v.literal('yearly'))),
    employeeId: v.optional(v.id('users')),
    targetDepartment: v.optional(v.id('departments')),
    targetRoles: v.optional(roleValidator),
    imageUrl: v.optional(v.string()),
    isPinned: v.optional(v.boolean()),
    isUrgent: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) throw new Error('Schedule entry not found');

    const scope = await assertOrgStaff(ctx, entry.organizationId, { adminOnly: true });
    if (!scopeOwnsRecord(scope, entry)) throw new Error('Schedule entry not found');

    const startDate = args.startDate ?? entry.startDate;
    const endDate = args.endDate ?? entry.endDate;
    assertWindow(startDate, endDate);
    await assertTargetsInOrg(ctx, entry.organizationId, args);

    const patch: Partial<Doc<'announcementSchedule'>> = { updatedAt: Date.now() };
    if (args.category) patch.category = args.category;
    if (args.title) patch.title = sanitizeCopy(args.title, MAX_TITLE, 'title');
    if (args.content) patch.content = sanitizeCopy(args.content, MAX_CONTENT, 'content');
    if (args.startDate) patch.startDate = args.startDate;
    if (args.endDate) patch.endDate = args.endDate;
    if (args.repeat) patch.repeat = args.repeat;
    if (args.employeeId !== undefined) patch.employeeId = args.employeeId;
    if (args.targetDepartment !== undefined) patch.targetDepartment = args.targetDepartment;
    if (args.targetRoles !== undefined) patch.targetRoles = args.targetRoles;
    if (args.imageUrl !== undefined) patch.imageUrl = args.imageUrl;
    if (args.isPinned !== undefined) patch.isPinned = args.isPinned;
    if (args.isUrgent !== undefined) patch.isUrgent = args.isUrgent;
    if (args.isActive !== undefined) patch.isActive = args.isActive;

    await ctx.db.patch(args.entryId, patch);

    // Editing the copy has to reach the post already on the feed, otherwise the
    // admin fixes a typo and sees it stay wrong until tomorrow.
    const updated = await ctx.db.get(args.entryId);
    if (updated?.lastAnnouncementId) {
      const live = await ctx.db.get(updated.lastAnnouncementId);
      if (live && live.scheduleId === args.entryId) {
        if (updated.isActive) {
          await ctx.db.patch(live._id, {
            title: pickLocalized(updated.title, 'en'),
            content: pickLocalized(updated.content, 'en'),
            titleI18n: updated.title,
            contentI18n: updated.content,
            category: updated.category,
            isPinned: updated.isPinned,
            isUrgent: updated.isUrgent,
            imageUrl: updated.imageUrl,
            targetDepartment: updated.targetDepartment,
            targetRoles: updated.targetRoles,
            expiresAt: orgDayEnd(updated.endDate),
            updatedAt: Date.now(),
          });
        } else {
          // Deactivating pulls the post immediately rather than leaving it up.
          await purgeAnnouncement(ctx, live._id);
          await ctx.db.patch(args.entryId, {
            lastAnnouncementId: undefined,
            lastPublishedKey: undefined,
          });
        }
      }
    }

    return { success: true };
  },
});

/**
 * Remove a schedule entry, and the post it put on the feed with it.
 *
 * Leaving the post behind would strand a notice nobody can edit or take down
 * through the schedule any more.
 */
export const deleteScheduleEntry = mutation({
  args: { entryId: v.id('announcementSchedule') },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) throw new Error('Schedule entry not found');

    const scope = await assertOrgStaff(ctx, entry.organizationId, { adminOnly: true });
    if (!scopeOwnsRecord(scope, entry)) throw new Error('Schedule entry not found');

    if (entry.lastAnnouncementId) {
      const live = await ctx.db.get(entry.lastAnnouncementId);
      if (live && live.scheduleId === args.entryId) await purgeAnnouncement(ctx, live._id);
    }

    await ctx.db.delete(args.entryId);
    return { success: true };
  },
});

// ─── PUBLISHING ───────────────────────────────────────────────────────────────

/**
 * Publish one entry if today falls in its window and it has not run today.
 *
 * `lastPublishedKey` holds the first day of the occurrence currently on the feed,
 * which is what keeps a multi-day entry from posting again every morning while it
 * is still running.
 */
async function publishEntryIfDue(
  ctx: MutationCtx,
  entry: Doc<'announcementSchedule'> | null,
  today: string,
  now: number,
): Promise<boolean> {
  if (!entry || !entry.isActive) return false;

  const occurrence = occurrenceFor(entry, today);
  if (!occurrence) return false;

  if (entry.lastPublishedKey === occurrence.startDate) {
    const existing = entry.lastAnnouncementId ? await ctx.db.get(entry.lastAnnouncementId) : null;
    if (existing) return false;
    // The post was deleted by hand; the entry is free to publish again.
  }

  const author = await ctx.db.get(entry.createdBy);
  const title = pickLocalized(entry.title, 'en');

  const announcementId = await ctx.db.insert('announcements', {
    organizationId: entry.organizationId,
    authorId: entry.createdBy,
    title,
    content: pickLocalized(entry.content, 'en'),
    titleI18n: entry.title,
    contentI18n: entry.content,
    category: entry.category,
    isPinned: entry.isPinned,
    isUrgent: entry.isUrgent,
    targetDepartment: entry.targetDepartment,
    targetRoles: entry.targetRoles,
    imageUrl: entry.imageUrl,
    publishedAt: now,
    // Gone the moment the last day is over, wherever the cron happens to run.
    expiresAt: orgDayEnd(occurrence.endDate),
    scheduleId: entry._id,
    viewCount: 0,
    reactionCount: 0,
    commentCount: 0,
    createdAt: now,
  });

  await ctx.db.patch(entry._id, {
    lastPublishedKey: occurrence.startDate,
    lastAnnouncementId: announcementId,
    updatedAt: now,
  });

  await notifyAudience(ctx, {
    organizationId: entry.organizationId,
    announcementId,
    authorId: entry.createdBy,
    authorName: author?.name ?? '',
    title,
    isUrgent: entry.isUrgent,
    targetDepartment: entry.targetDepartment,
    targetRoles: entry.targetRoles,
    now,
  });

  return true;
}

/**
 * Publish everything due today, across every organization.
 *
 * Runs hourly rather than once a day so an entry added for today reaches the feed
 * within the hour even if nobody triggers it, and so a missed run (deploy,
 * outage) is caught up on the next pass instead of skipping the day entirely.
 */
export const publishDueEntries = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const today = orgDayKey(now);

    const entries = await ctx.db
      .query('announcementSchedule')
      .withIndex('by_active', (q) => q.eq('isActive', true))
      .take(DEFAULT_LIST_CAP);

    let published = 0;
    // Oldest window first, so several entries landing on one day appear in the
    // order the admin dated them.
    const ordered = entries.sort(
      (a, b) => a.startDate.localeCompare(b.startDate) || a.createdAt - b.createdAt,
    );
    for (const entry of ordered) {
      if (await publishEntryIfDue(ctx, entry, today, now)) published++;
    }

    if (published > 0) logger.log(`[news schedule] published ${published} entries for ${today}`);
    return { published, day: today };
  },
});

/**
 * Take down posts whose last day has passed.
 *
 * Every expiring post is deleted with its reactions, comments and views: an
 * expiry date is an explicit statement that the notice is for a period, and the
 * feed already hides it the moment the period ends, so keeping the row would only
 * accumulate content nobody can reach.
 */
export const expireAnnouncements = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const expired = await ctx.db
      .query('announcements')
      .withIndex('by_expires', (q) => q.lte('expiresAt', now))
      .take(SMALL_LIST_CAP);

    let removed = 0;
    for (const announcement of expired) {
      // `by_expires` also matches rows without an expiry in some engines; be
      // explicit rather than trusting the index bound.
      if (!announcement.expiresAt || announcement.expiresAt > now) continue;

      if (announcement.scheduleId) {
        const entry = await ctx.db.get(announcement.scheduleId);
        if (entry && entry.lastAnnouncementId === announcement._id) {
          await ctx.db.patch(entry._id, { lastAnnouncementId: undefined });
        }
      }

      await purgeAnnouncement(ctx, announcement._id);
      removed++;
    }

    if (removed > 0) logger.log(`[news schedule] removed ${removed} expired announcements`);
    return { removed };
  },
});
