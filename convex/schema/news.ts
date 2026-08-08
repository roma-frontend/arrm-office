import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const news = {
  announcements: defineTable({
    organizationId: v.id('organizations'),
    authorId: v.id('users'),
    title: v.string(),
    content: v.string(), // rich text / markdown
    summary: v.optional(v.string()),
    category: v.union(
      v.literal('news'),
      v.literal('announcement'),
      v.literal('event'),
      v.literal('birthday'),
      v.literal('achievement'),
      v.literal('policy'),
      v.literal('general'),
    ),
    isPinned: v.boolean(),
    isUrgent: v.boolean(),
    /** If set, only visible to specific department */
    targetDepartment: v.optional(v.id('departments')),
    /** If set, only visible to specific roles */
    targetRoles: v.optional(
      v.array(
        v.union(
          v.literal('superadmin'),
          v.literal('admin'),
          v.literal('supervisor'),
          v.literal('employee'),
          v.literal('driver'),
        ),
      ),
    ),
    tags: v.optional(v.array(v.string())),
    imageUrl: v.optional(v.string()),
    publishedAt: v.number(),
    expiresAt: v.optional(v.number()),
    /**
     * Localized copy, locale → text. Set on posts published from the schedule, so
     * every reader sees the notice in their own language; `title`/`content` keep
     * the fallback for readers whose language is missing and for anything written
     * by hand.
     */
    titleI18n: v.optional(v.record(v.string(), v.string())),
    contentI18n: v.optional(v.record(v.string(), v.string())),
    /** Set when the post was published automatically from a schedule entry. */
    scheduleId: v.optional(v.id('announcementSchedule')),
    viewCount: v.number(),
    reactionCount: v.number(),
    commentCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_published', ['organizationId', 'publishedAt'])
    .index('by_org_pinned', ['organizationId', 'isPinned'])
    .index('by_org_category', ['organizationId', 'category'])
    .index('by_author', ['authorId'])
    // The expiry sweep walks these directly instead of scanning every post.
    .index('by_expires', ['expiresAt'])
    .index('by_schedule', ['scheduleId']),

  /**
   * Dated entries the admin fills in once and the feed publishes on the day.
   *
   * Birthdays and recurring company dates were previously either announced by
   * hand every year or not at all. An entry carries its copy in every language,
   * a day range (so a multi-day event stays up for its whole run) and an optional
   * yearly repeat.
   */
  announcementSchedule: defineTable({
    organizationId: v.id('organizations'),
    createdBy: v.id('users'),
    category: v.union(
      v.literal('news'),
      v.literal('announcement'),
      v.literal('event'),
      v.literal('birthday'),
      v.literal('achievement'),
      v.literal('policy'),
      v.literal('general'),
    ),
    /** locale → title. `en` is required, the rest fall back to it. */
    title: v.record(v.string(), v.string()),
    /** locale → body. */
    content: v.record(v.string(), v.string()),
    /** `yyyy-MM-dd`, in the organization's timezone. */
    startDate: v.string(),
    /** `yyyy-MM-dd`; equal to `startDate` for a single-day entry. */
    endDate: v.string(),
    repeat: v.union(v.literal('none'), v.literal('yearly')),
    /** The colleague an entry is about, for birthdays and anniversaries. */
    employeeId: v.optional(v.id('users')),
    targetDepartment: v.optional(v.id('departments')),
    targetRoles: v.optional(
      v.array(
        v.union(
          v.literal('superadmin'),
          v.literal('admin'),
          v.literal('supervisor'),
          v.literal('employee'),
          v.literal('driver'),
        ),
      ),
    ),
    imageUrl: v.optional(v.string()),
    isPinned: v.boolean(),
    isUrgent: v.boolean(),
    isActive: v.boolean(),
    /** `yyyy-MM-dd` of the occurrence last published, so a day cannot double up. */
    lastPublishedKey: v.optional(v.string()),
    lastAnnouncementId: v.optional(v.id('announcements')),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_active', ['organizationId', 'isActive'])
    // The publishing sweep runs across tenants, so it needs `isActive` alone.
    .index('by_active', ['isActive'])
    .index('by_org_start', ['organizationId', 'startDate'])
    .index('by_employee', ['employeeId']),

  announcementReactions: defineTable({
    organizationId: v.id('organizations'),
    announcementId: v.id('announcements'),
    userId: v.id('users'),
    emoji: v.string(),
    createdAt: v.number(),
  })
    .index('by_announcement', ['announcementId'])
    .index('by_user', ['userId'])
    .index('by_announcement_user', ['announcementId', 'userId']),

  announcementComments: defineTable({
    organizationId: v.id('organizations'),
    announcementId: v.id('announcements'),
    authorId: v.id('users'),
    content: v.string(),
    parentCommentId: v.optional(v.id('announcementComments')),
    isEdited: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index('by_announcement', ['announcementId'])
    .index('by_author', ['authorId'])
    .index('by_parent', ['parentCommentId']),

  /** Track unique views per user so the view counter is not inflated
   *  by auto-mount effects or page refreshes. */
  announcementViews: defineTable({
    organizationId: v.id('organizations'),
    announcementId: v.id('announcements'),
    userId: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_announcement', ['announcementId'])
    .index('by_user', ['userId'])
    .index('by_announcement_user', ['announcementId', 'userId']),
};
