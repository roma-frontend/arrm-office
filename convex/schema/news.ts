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
    .index('by_author', ['authorId']),

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
