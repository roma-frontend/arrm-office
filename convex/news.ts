/**
 * Company News Feed — announcements, social feed, reactions, comments.
 *
 * Provides a company-wide social feed similar to Spark.work's social features,
 * supporting announcements, birthday celebrations, achievements, and more.
 */
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { DEFAULT_LIST_CAP } from './lib/limits';

// ── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, string> = {
  news: '📰',
  announcement: '📢',
  event: '📅',
  birthday: '🎂',
  achievement: '🏆',
  policy: '📋',
  general: '💬',
};

function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category] ?? '💬';
}

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Create a new announcement.
 */
export const createAnnouncement = mutation({
  args: {
    organizationId: v.id('organizations'),
    authorId: v.id('users'),
    title: v.string(),
    content: v.string(),
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
    isUrgent: v.optional(v.boolean()),
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
    tags: v.optional(v.array(v.string())),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const announcementId = await ctx.db.insert('announcements', {
      organizationId: args.organizationId,
      authorId: args.authorId,
      title: args.title,
      content: args.content,
      summary: args.summary,
      category: args.category,
      isPinned: args.isPinned,
      isUrgent: args.isUrgent ?? false,
      targetDepartment: args.targetDepartment,
      targetRoles: args.targetRoles,
      tags: args.tags,
      imageUrl: args.imageUrl,
      publishedAt: now,
      expiresAt: undefined,
      viewCount: 0,
      reactionCount: 0,
      commentCount: 0,
      createdAt: now,
      updatedAt: undefined,
    });

    // Log to audit
    await ctx.db.insert('auditLogs', {
      organizationId: args.organizationId,
      userId: args.authorId,
      action: 'announcement.created',
      target: `announcement_${announcementId}`,
      details: `Created announcement: "${args.title}"`,
      createdAt: now,
    });

    return { success: true, announcementId };
  },
});

/**
 * Update an existing announcement.
 */
export const updateAnnouncement = mutation({
  args: {
    announcementId: v.id('announcements'),
    userId: v.id('users'),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    summary: v.optional(v.string()),
    category: v.optional(
      v.union(
        v.literal('news'),
        v.literal('announcement'),
        v.literal('event'),
        v.literal('birthday'),
        v.literal('achievement'),
        v.literal('policy'),
        v.literal('general'),
      ),
    ),
    isPinned: v.optional(v.boolean()),
    isUrgent: v.optional(v.boolean()),
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
    tags: v.optional(v.array(v.string())),
    imageUrl: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { announcementId, userId, ...rest } = args;

    const announcement = await ctx.db.get(announcementId);
    if (!announcement) throw new Error('Announcement not found');

    const patchData: Partial<Doc<'announcements'>> = { updatedAt: Date.now() };
    Object.assign(patchData, rest);

    await ctx.db.patch(announcementId, patchData);

    await ctx.db.insert('auditLogs', {
      organizationId: announcement.organizationId,
      userId,
      action: 'announcement.updated',
      target: `announcement_${announcementId}`,
      details: `Updated announcement: "${announcement.title}"`,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Delete an announcement.
 */
export const deleteAnnouncement = mutation({
  args: {
    announcementId: v.id('announcements'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const announcement = await ctx.db.get(args.announcementId);
    if (!announcement) throw new Error('Announcement not found');

    // Delete all reactions
    const reactions = await ctx.db
      .query('announcementReactions')
      .withIndex('by_announcement', (q) => q.eq('announcementId', args.announcementId))
      .collect();
    for (const r of reactions) {
      await ctx.db.delete(r._id);
    }

    // Delete all comments
    const comments = await ctx.db
      .query('announcementComments')
      .withIndex('by_announcement', (q) => q.eq('announcementId', args.announcementId))
      .collect();
    for (const c of comments) {
      await ctx.db.delete(c._id);
    }

    await ctx.db.delete(args.announcementId);

    await ctx.db.insert('auditLogs', {
      organizationId: announcement.organizationId,
      userId: args.userId,
      action: 'announcement.deleted',
      target: `announcement_${args.announcementId}`,
      details: `Deleted announcement: "${announcement.title}"`,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Toggle pin status of an announcement.
 */
export const togglePinAnnouncement = mutation({
  args: {
    announcementId: v.id('announcements'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const announcement = await ctx.db.get(args.announcementId);
    if (!announcement) throw new Error('Announcement not found');

    await ctx.db.patch(args.announcementId, {
      isPinned: !announcement.isPinned,
      updatedAt: Date.now(),
    });

    return { success: true, isPinned: !announcement.isPinned };
  },
});

/**
 * Add a reaction to an announcement.
 */
export const addReaction = mutation({
  args: {
    organizationId: v.id('organizations'),
    announcementId: v.id('announcements'),
    userId: v.id('users'),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('announcementReactions')
      .withIndex('by_announcement_user', (q) =>
        q.eq('announcementId', args.announcementId).eq('userId', args.userId),
      )
      .filter((q) => q.eq(q.field('emoji'), args.emoji))
      .first();

    if (existing) {
      // Toggle off
      await ctx.db.delete(existing._id);
      const announcement = await ctx.db.get(args.announcementId);
      if (announcement) {
        await ctx.db.patch(args.announcementId, {
          reactionCount: Math.max(0, (announcement.reactionCount ?? 0) - 1),
        });
      }
      return { success: true, action: 'removed' };
    }

    await ctx.db.insert('announcementReactions', {
      organizationId: args.organizationId,
      announcementId: args.announcementId,
      userId: args.userId,
      emoji: args.emoji,
      createdAt: Date.now(),
    });

    // Update reaction count
    const announcement = await ctx.db.get(args.announcementId);
    if (announcement) {
      await ctx.db.patch(args.announcementId, {
        reactionCount: (announcement.reactionCount ?? 0) + 1,
      });
    }

    return { success: true, action: 'added' };
  },
});

/**
 * Add a comment to an announcement.
 */
export const addComment = mutation({
  args: {
    organizationId: v.id('organizations'),
    announcementId: v.id('announcements'),
    authorId: v.id('users'),
    content: v.string(),
    parentCommentId: v.optional(v.id('announcementComments')),
  },
  handler: async (ctx, args) => {
    if (!args.content.trim()) throw new Error('Comment cannot be empty');

    const commentId = await ctx.db.insert('announcementComments', {
      organizationId: args.organizationId,
      announcementId: args.announcementId,
      authorId: args.authorId,
      content: args.content.trim(),
      parentCommentId: args.parentCommentId,
      isEdited: false,
      createdAt: Date.now(),
    });

    // Update comment count
    const announcement = await ctx.db.get(args.announcementId);
    if (announcement) {
      await ctx.db.patch(args.announcementId, {
        commentCount: (announcement.commentCount ?? 0) + 1,
      });
    }

    return { success: true, commentId };
  },
});

/**
 * Delete a comment.
 */
export const deleteComment = mutation({
  args: {
    commentId: v.id('announcementComments'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error('Comment not found');

    // Check if user is author or admin
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('User not found');
    if (comment.authorId !== args.userId && user.role !== 'admin' && user.role !== 'superadmin') {
      throw new Error('Not authorized to delete this comment');
    }

    // Delete child comments if this is a parent
    const childComments = await ctx.db
      .query('announcementComments')
      .withIndex('by_parent', (q) => q.eq('parentCommentId', args.commentId))
      .collect();
    for (const child of childComments) {
      await ctx.db.delete(child._id);
    }

    await ctx.db.delete(args.commentId);

    // Update comment count
    const announcement = await ctx.db.get(comment.announcementId);
    if (announcement) {
      await ctx.db.patch(comment.announcementId, {
        commentCount: Math.max(0, (announcement.commentCount ?? 0) - 1 - childComments.length),
      });
    }

    return { success: true };
  },
});

/**
 * Record a unique view for an announcement (one per user).
 * Does nothing if this user has already viewed this announcement.
 */
export const incrementViewCount = mutation({
  args: {
    announcementId: v.id('announcements'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { announcementId, userId } = args;

    // Check if this user already viewed this announcement
    const existing = await ctx.db
      .query('announcementViews')
      .withIndex('by_announcement_user', (q) =>
        q.eq('announcementId', announcementId).eq('userId', userId),
      )
      .first();

    if (existing) {
      // Already counted — skip
      return { success: true, alreadyViewed: true };
    }

    // Insert a view record
    const announcement = await ctx.db.get(announcementId);
    if (!announcement) return { success: false };

    await ctx.db.insert('announcementViews', {
      organizationId: announcement.organizationId,
      announcementId,
      userId,
      createdAt: Date.now(),
    });

    await ctx.db.patch(announcementId, {
      viewCount: (announcement.viewCount ?? 0) + 1,
    });

    return { success: true, alreadyViewed: false };
  },
});

/**
 * Reset the viewCount of all announcements to their actual unique view counts.
 */
export const resetAllViewCounts = mutation({
  args: {},
  handler: async (ctx) => {
    const announcements = await ctx.db.query('announcements').take(1000);
    let totalReset = 0;

    for (const announcement of announcements) {
      const uniqueViews = await ctx.db
        .query('announcementViews')
        .withIndex('by_announcement', (q) => q.eq('announcementId', announcement._id))
        .collect();

      if (uniqueViews.length !== announcement.viewCount) {
        await ctx.db.patch(announcement._id, {
          viewCount: uniqueViews.length,
        });
        totalReset++;
      }
    }

    return { success: true, totalReset };
  },
});

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Get the news feed for an organization.
 * Returns pinned announcements first, then sorted by publishedAt desc.
 */
export const getNewsFeed = query({
  args: {
    organizationId: v.id('organizations'),
    category: v.optional(
      v.union(
        v.literal('news'),
        v.literal('announcement'),
        v.literal('event'),
        v.literal('birthday'),
        v.literal('achievement'),
        v.literal('policy'),
        v.literal('general'),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { organizationId, category, limit = 20 } = args;

    let announcements = await ctx.db
      .query('announcements')
      .withIndex('by_org_published', (q) => q.eq('organizationId', organizationId))
      .order('desc')
      .take(limit * 3); // Fetch more to allow filtering

    if (category) {
      announcements = announcements.filter((a) => a.category === category);
    }

    // Filter out expired
    const now = Date.now();
    announcements = announcements.filter((a) => !a.expiresAt || a.expiresAt > now);

    // Sort: pinned first, then by publishedAt desc
    announcements.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.publishedAt - a.publishedAt;
    });

    // Enrich with author info and reactions
    const enriched = await Promise.all(
      announcements.slice(0, limit).map(async (announcement) => {
        const author = await ctx.db.get(announcement.authorId);
        const reactions = await ctx.db
          .query('announcementReactions')
          .withIndex('by_announcement', (q) => q.eq('announcementId', announcement._id))
          .take(DEFAULT_LIST_CAP);

        // Get user names for reactions
        const reactionUsers = await Promise.all(
          reactions.map((r) => ctx.db.get(r.userId)),
        );
        const reactionMap = new Map(
          reactionUsers
            .filter((u): u is NonNullable<typeof u> => u !== null)
            .map((u) => [u._id, u.name]),
        );

        // Aggregate reactions by emoji (array format to avoid emoji field names)
        const reactionsByEmojiMap: Record<string, Array<{ userId: Id<'users'>; userName: string }>> = {};
        for (const r of reactions) {
          if (!reactionsByEmojiMap[r.emoji]) reactionsByEmojiMap[r.emoji] = [];
          reactionsByEmojiMap[r.emoji]!.push({
            userId: r.userId,
            userName: reactionMap.get(r.userId) ?? 'Unknown',
          });
        }
        const reactionsByEmoji = Object.entries(reactionsByEmojiMap).map(([emoji, users]) => ({ emoji, users }));

        // Get latest 3 comments
        const comments = await ctx.db
          .query('announcementComments')
          .withIndex('by_announcement', (q) => q.eq('announcementId', announcement._id))
          .order('desc')
          .take(3);

        const enrichedComments = await Promise.all(
          comments.map(async (c) => {
            const commentAuthor = await ctx.db.get(c.authorId);
            return {
              ...c,
              authorName: commentAuthor?.name ?? 'Unknown',
              authorAvatar: commentAuthor?.avatarUrl ?? '',
            };
          }),
        );

        return {
          ...announcement,
          authorName: author?.name ?? 'Unknown',
          authorAvatar: author?.avatarUrl ?? '',
          authorRole: author?.role ?? '',
          categoryIcon: getCategoryIcon(announcement.category),
          reactionsByEmoji,
          comments: enrichedComments.reverse(),
          totalComments: announcement.commentCount ?? 0,
        };
      }),
    );

    return enriched;
  },
});

/**
 * Get a single announcement with full details.
 */
export const getAnnouncement = query({
  args: {
    announcementId: v.id('announcements'),
  },
  handler: async (ctx, args) => {
    const announcement = await ctx.db.get(args.announcementId);
    if (!announcement) return null;

    const author = await ctx.db.get(announcement.authorId);

    const reactions = await ctx.db
      .query('announcementReactions')
      .withIndex('by_announcement', (q) => q.eq('announcementId', announcement._id))
      .take(DEFAULT_LIST_CAP);

    const reactionUsers = await Promise.all(
      reactions.map((r) => ctx.db.get(r.userId)),
    );
    const reactionMap = new Map(
      reactionUsers
        .filter((u): u is NonNullable<typeof u> => u !== null)
        .map((u) => [u._id, u.name]),
    );

    const reactionsByEmojiMap: Record<string, Array<{ userId: Id<'users'>; userName: string }>> = {};
    for (const r of reactions) {
      if (!reactionsByEmojiMap[r.emoji]) reactionsByEmojiMap[r.emoji] = [];
      reactionsByEmojiMap[r.emoji]!.push({
        userId: r.userId,
        userName: reactionMap.get(r.userId) ?? 'Unknown',
      });
    }
    const reactionsByEmoji = Object.entries(reactionsByEmojiMap).map(([emoji, users]) => ({ emoji, users }));

    // Get all comments
    const allComments = await ctx.db
      .query('announcementComments')
      .withIndex('by_announcement', (q) => q.eq('announcementId', announcement._id))
      .order('asc')
      .take(DEFAULT_LIST_CAP);

    const enrichedComments = await Promise.all(
      allComments.map(async (c) => {
        const commentAuthor = await ctx.db.get(c.authorId);
        return {
          ...c,
          authorName: commentAuthor?.name ?? 'Unknown',
          authorAvatar: commentAuthor?.avatarUrl ?? '',
        };
      }),
    );

    return {
      ...announcement,
      authorName: author?.name ?? 'Unknown',
      authorAvatar: author?.avatarUrl ?? '',
      authorRole: author?.role ?? '',
      categoryIcon: getCategoryIcon(announcement.category),
      reactionsByEmoji,
      comments: enrichedComments,
      totalComments: announcement.commentCount ?? 0,
    };
  },
});

/**
 * Get news feed stats (for dashboard widget).
 */
export const getNewsStats = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const announcements = await ctx.db
      .query('announcements')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    const active = announcements.filter((a) => !a.expiresAt || a.expiresAt > now);
    const pinned = active.filter((a) => a.isPinned);
    const urgent = active.filter((a) => a.isUrgent);

    const byCategory = active.reduce(
      (acc, a) => {
        acc[a.category] = (acc[a.category] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Recent activity (last 7 days)
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const recentCount = active.filter((a) => a.publishedAt > weekAgo).length;

    return {
      total: announcements.length,
      active: active.length,
      pinned: pinned.length,
      urgent: urgent.length,
      byCategory,
      recentCount,
    };
  },
});
