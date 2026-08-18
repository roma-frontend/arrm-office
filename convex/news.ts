/**
 * Company News Feed — announcements, social feed, reactions, comments.
 *
 * Provides a company-wide social feed similar to Spark.work's social features,
 * supporting announcements, birthday celebrations, achievements, and more.
 */
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx, MutationCtx } from './_generated/server';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { assertOrgScope, assertOrgStaff, resolveOrgScope, scopeOwnsRecord } from './lib/orgAccess';
import type { OrgScope } from './lib/orgAccess';
import { notify } from './lib/notify';
import { assertModuleAccess } from './lib/entitlements';

const MAX_TITLE = 200;
const MAX_CONTENT = 20_000;
const MAX_COMMENT = 2_000;
/** Ceiling on notification fan-out for one post. */
const MAX_NOTIFIED = 500;

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

/**
 * Whether one person may see one post.
 *
 * `targetDepartment` and `targetRoles` were stored and then ignored by both
 * reads, so "visible to HR only" published to the whole company — the fields
 * made the UI look considerate while leaking the content. Targeting is enforced
 * here, in one place, and the same predicate decides who gets notified.
 *
 * Staff see everything so they can moderate; the author always sees their own.
 */
export function canSeeAnnouncement(
  announcement: Pick<
    Doc<'announcements'>,
    'authorId' | 'targetDepartment' | 'targetRoles' | 'organizationId'
  >,
  viewer: { _id: Id<'users'>; role: string; departmentId?: Id<'departments'> },
  isStaff: boolean,
): boolean {
  if (isStaff) return true;
  if (announcement.authorId === viewer._id) return true;

  if (announcement.targetDepartment && announcement.targetDepartment !== viewer.departmentId) {
    return false;
  }
  if (
    announcement.targetRoles &&
    announcement.targetRoles.length > 0 &&
    !announcement.targetRoles.includes(viewer.role as Doc<'users'>['role'])
  ) {
    return false;
  }
  return true;
}

/** Caller as the targeting predicate needs them: role plus resolved department. */
async function viewerOf(
  ctx: QueryCtx | MutationCtx,
  scope: OrgScope,
): Promise<{ _id: Id<'users'>; role: string; departmentId?: Id<'departments'> }> {
  const user = await ctx.db.get(scope.caller._id);
  return {
    _id: scope.caller._id,
    role: scope.caller.role,
    departmentId: user?.departmentId,
  };
}

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Publish an announcement.
 *
 * `authorId` used to be an argument, so anyone could post to any organization's
 * feed under anyone's name — on a company-wide broadcast surface. The author is
 * now the authenticated caller and publishing requires staff rights.
 *
 * Publishing also notifies its audience. Until now a post appeared in the feed
 * and nowhere else, so it was only seen by people who happened to open /news;
 * an urgent notice reached nobody in particular. Recipients are resolved through
 * the same targeting predicate the feed uses, so a department-scoped post does
 * not notify the whole company.
 */
export const createAnnouncement = mutation({
  args: {
    organizationId: v.optional(v.id('organizations')),
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
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'news');
    const scope = await assertOrgStaff(ctx, args.organizationId);
    const organizationId = scope.organizationId;
    if (!organizationId) throw new Error('Organization is required');

    const title = args.title.trim();
    const content = args.content.trim();
    if (!title) throw new Error('Title is required');
    if (title.length > MAX_TITLE) throw new Error(`Title must be at most ${MAX_TITLE} characters`);
    if (!content) throw new Error('Content is required');
    if (content.length > MAX_CONTENT) {
      throw new Error(`Content must be at most ${MAX_CONTENT} characters`);
    }

    if (args.targetDepartment) {
      const department = await ctx.db.get(args.targetDepartment);
      if (!department || department.organizationId !== organizationId) {
        throw new Error('Department not found in this organization');
      }
    }

    const now = Date.now();
    const announcementId = await ctx.db.insert('announcements', {
      organizationId,
      authorId: scope.caller._id,
      title,
      content,
      summary: args.summary?.trim() || undefined,
      category: args.category,
      isPinned: args.isPinned,
      isUrgent: args.isUrgent ?? false,
      targetDepartment: args.targetDepartment,
      targetRoles: args.targetRoles?.length ? args.targetRoles : undefined,
      tags: args.tags?.length ? args.tags : undefined,
      imageUrl: args.imageUrl,
      publishedAt: now,
      expiresAt: args.expiresAt,
      viewCount: 0,
      reactionCount: 0,
      commentCount: 0,
      createdAt: now,
      updatedAt: undefined,
    });

    const notified = await notifyAudience(ctx, {
      organizationId,
      announcementId,
      authorName: scope.caller.name,
      title,
      isUrgent: args.isUrgent ?? false,
      targetDepartment: args.targetDepartment,
      targetRoles: args.targetRoles,
      authorId: scope.caller._id,
      now,
    });

    // Log to audit
    await ctx.db.insert('auditLogs', {
      organizationId,
      userId: scope.caller._id,
      action: 'announcement.created',
      target: `announcement_${announcementId}`,
      details: `Created announcement: "${title}"`,
      createdAt: now,
    });

    return { success: true, announcementId, notified };
  },
});

/**
 * Notify everyone a post is addressed to.
 *
 * Reads the roster once and filters with `canSeeAnnouncement`, so the audience of
 * a notification and the audience of the feed can never drift apart. The author
 * is skipped — nobody needs telling about their own post — and the fan-out is
 * capped so a large tenant cannot blow the mutation's write budget.
 */
export async function notifyAudience(
  ctx: MutationCtx,
  args: {
    organizationId: Id<'organizations'>;
    announcementId: Id<'announcements'>;
    authorId: Id<'users'>;
    authorName: string;
    title: string;
    isUrgent: boolean;
    targetDepartment?: Id<'departments'>;
    targetRoles?: Doc<'users'>['role'][];
    now: number;
  },
): Promise<number> {
  const members = await ctx.db
    .query('users')
    .withIndex('by_org_active', (q) =>
      q.eq('organizationId', args.organizationId).eq('isActive', true),
    )
    .take(DEFAULT_LIST_CAP);

  const audience = members
    .filter((member) => member._id !== args.authorId)
    .filter((member) =>
      canSeeAnnouncement(
        {
          authorId: args.authorId,
          organizationId: args.organizationId,
          targetDepartment: args.targetDepartment,
          targetRoles: args.targetRoles,
        },
        { _id: member._id, role: member.role, departmentId: member.departmentId },
        // Staff would otherwise be notified about posts aimed elsewhere: the
        // moderation exemption belongs to reading, not to being told.
        false,
      ),
    )
    .slice(0, MAX_NOTIFIED);

  for (const member of audience) {
    await notify(ctx, {
      organizationId: args.organizationId,
      userId: member._id,
      type: 'announcement_published',
      titleKey: args.isUrgent
        ? 'notifications.titles.announcementUrgent'
        : 'notifications.titles.announcementPublished',
      messageKey: 'notifications.messages.announcementPublished',
      params: { author: args.authorName, title: args.title },
      fallbackTitle: args.isUrgent ? 'Urgent announcement' : 'Company news',
      fallbackMessage: `${args.authorName}: ${args.title}`,
      relatedId: args.announcementId,
      route: '/news',
      createdAt: args.now,
    });
  }

  return audience.length;
}

/**
 * Update an existing announcement.
 */
export const updateAnnouncement = mutation({
  args: {
    announcementId: v.id('announcements'),
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
    await assertModuleAccess(ctx, 'news');
    const { announcementId, ...rest } = args;

    const announcement = await ctx.db.get(announcementId);
    if (!announcement) throw new Error('Announcement not found');

    // Reached by its own id, so the organization check follows the read. Staff
    // may moderate anything in their org; the author may fix their own post.
    const scope = await assertOrgScope(ctx, announcement.organizationId);
    if (!scopeOwnsRecord(scope, announcement)) throw new Error('Announcement not found');
    if (!scope.isStaff && announcement.authorId !== scope.caller._id) {
      throw new Error('Not authorized to edit this announcement');
    }

    if (rest.title !== undefined && !rest.title.trim()) throw new Error('Title is required');
    if (rest.title && rest.title.length > MAX_TITLE) {
      throw new Error(`Title must be at most ${MAX_TITLE} characters`);
    }
    if (rest.content && rest.content.length > MAX_CONTENT) {
      throw new Error(`Content must be at most ${MAX_CONTENT} characters`);
    }
    if (rest.targetDepartment) {
      const department = await ctx.db.get(rest.targetDepartment);
      if (!department || department.organizationId !== announcement.organizationId) {
        throw new Error('Department not found in this organization');
      }
    }

    const patchData: Partial<Doc<'announcements'>> = { updatedAt: Date.now() };
    Object.assign(patchData, rest);

    await ctx.db.patch(announcementId, patchData);

    await ctx.db.insert('auditLogs', {
      organizationId: announcement.organizationId,
      userId: scope.caller._id,
      action: 'announcement.updated',
      target: `announcement_${announcementId}`,
      details: `Updated announcement: "${announcement.title}"`,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Delete an announcement together with its reactions, comments and views.
 */
export const deleteAnnouncement = mutation({
  args: {
    announcementId: v.id('announcements'),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'news');
    const announcement = await ctx.db.get(args.announcementId);
    if (!announcement) throw new Error('Announcement not found');

    const scope = await assertOrgScope(ctx, announcement.organizationId);
    if (!scopeOwnsRecord(scope, announcement)) throw new Error('Announcement not found');
    if (!scope.isStaff && announcement.authorId !== scope.caller._id) {
      throw new Error('Not authorized to delete this announcement');
    }

    // Delete all reactions
    await purgeAnnouncement(ctx, args.announcementId);

    await ctx.db.insert('auditLogs', {
      organizationId: announcement.organizationId,
      userId: scope.caller._id,
      action: 'announcement.deleted',
      target: `announcement_${args.announcementId}`,
      details: `Deleted announcement: "${announcement.title}"`,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Delete an announcement and everything hanging off it.
 *
 * Shared with the expiry sweep: reactions, comments and view records all key on
 * the announcement, and a post removed without them leaves rows that a later
 * post with the same id would inherit as "already seen".
 */
export async function purgeAnnouncement(
  ctx: MutationCtx,
  announcementId: Id<'announcements'>,
): Promise<void> {
  const reactions = await ctx.db
    .query('announcementReactions')
    .withIndex('by_announcement', (q) => q.eq('announcementId', announcementId))
    .collect();
  for (const r of reactions) {
    await ctx.db.delete(r._id);
  }

  const comments = await ctx.db
    .query('announcementComments')
    .withIndex('by_announcement', (q) => q.eq('announcementId', announcementId))
    .collect();
  for (const c of comments) {
    await ctx.db.delete(c._id);
  }

  const views = await ctx.db
    .query('announcementViews')
    .withIndex('by_announcement', (q) => q.eq('announcementId', announcementId))
    .collect();
  for (const view of views) {
    await ctx.db.delete(view._id);
  }

  await ctx.db.delete(announcementId);
}

export const togglePinAnnouncement = mutation({
  args: {
    announcementId: v.id('announcements'),
  },
  handler: async (ctx, args) => {
    const announcement = await ctx.db.get(args.announcementId);
    if (!announcement) throw new Error('Announcement not found');

    const scope = await assertOrgStaff(ctx, announcement.organizationId);
    if (!scopeOwnsRecord(scope, announcement)) throw new Error('Announcement not found');

    await ctx.db.patch(args.announcementId, {
      isPinned: !announcement.isPinned,
      updatedAt: Date.now(),
    });

    return { success: true, isPinned: !announcement.isPinned };
  },
});

/**
 * Toggle a reaction on an announcement. Any member of the audience may react.
 */
export const addReaction = mutation({
  args: {
    announcementId: v.id('announcements'),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'news');
    const announcement = await ctx.db.get(args.announcementId);
    if (!announcement) throw new Error('Announcement not found');

    const scope = await assertOrgScope(ctx, announcement.organizationId);
    if (!scopeOwnsRecord(scope, announcement)) throw new Error('Announcement not found');
    const viewer = await viewerOf(ctx, scope);
    if (!canSeeAnnouncement(announcement, viewer, scope.isStaff)) {
      throw new Error('Announcement not found');
    }

    const emoji = args.emoji.trim();
    if (!emoji || emoji.length > 8) throw new Error('Invalid reaction');
    const userId = scope.caller._id;

    const existing = await ctx.db
      .query('announcementReactions')
      .withIndex('by_announcement_user', (q) =>
        q.eq('announcementId', args.announcementId).eq('userId', userId),
      )
      .filter((q) => q.eq(q.field('emoji'), emoji))
      .first();

    if (existing) {
      // Toggle off
      await ctx.db.delete(existing._id);
      await ctx.db.patch(args.announcementId, {
        reactionCount: Math.max(0, (announcement.reactionCount ?? 0) - 1),
      });
      return { success: true, action: 'removed' };
    }

    await ctx.db.insert('announcementReactions', {
      organizationId: announcement.organizationId,
      announcementId: args.announcementId,
      userId,
      emoji,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.announcementId, {
      reactionCount: (announcement.reactionCount ?? 0) + 1,
    });

    return { success: true, action: 'added' };
  },
});

/**
 * Comment on an announcement.
 *
 * The author of the post is notified, which is what makes the feed a
 * conversation rather than a noticeboard — previously a comment reached nobody.
 */
export const addComment = mutation({
  args: {
    announcementId: v.id('announcements'),
    content: v.string(),
    parentCommentId: v.optional(v.id('announcementComments')),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'news');
    const announcement = await ctx.db.get(args.announcementId);
    if (!announcement) throw new Error('Announcement not found');

    const scope = await assertOrgScope(ctx, announcement.organizationId);
    if (!scopeOwnsRecord(scope, announcement)) throw new Error('Announcement not found');
    const viewer = await viewerOf(ctx, scope);
    if (!canSeeAnnouncement(announcement, viewer, scope.isStaff)) {
      throw new Error('Announcement not found');
    }

    const content = args.content.trim();
    if (!content) throw new Error('Comment cannot be empty');
    if (content.length > MAX_COMMENT) {
      throw new Error(`Comment must be at most ${MAX_COMMENT} characters`);
    }

    if (args.parentCommentId) {
      const parent = await ctx.db.get(args.parentCommentId);
      if (!parent || parent.announcementId !== args.announcementId) {
        throw new Error('Parent comment not found');
      }
    }

    const commentId = await ctx.db.insert('announcementComments', {
      organizationId: announcement.organizationId,
      announcementId: args.announcementId,
      authorId: scope.caller._id,
      content,
      parentCommentId: args.parentCommentId,
      isEdited: false,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.announcementId, {
      commentCount: (announcement.commentCount ?? 0) + 1,
    });

    if (announcement.authorId !== scope.caller._id) {
      await notify(ctx, {
        organizationId: announcement.organizationId,
        userId: announcement.authorId,
        type: 'announcement_published',
        titleKey: 'notifications.titles.announcementComment',
        messageKey: 'notifications.messages.announcementComment',
        params: { author: scope.caller.name, title: announcement.title },
        fallbackTitle: 'New comment',
        fallbackMessage: `${scope.caller.name} commented on "${announcement.title}"`,
        relatedId: args.announcementId,
        route: '/news',
      });
    }

    return { success: true, commentId };
  },
});

/**
 * Delete a comment. Author or staff, and only inside their own organization.
 */
export const deleteComment = mutation({
  args: {
    commentId: v.id('announcementComments'),
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error('Comment not found');

    const scope = await assertOrgScope(ctx, comment.organizationId);
    if (!scopeOwnsRecord(scope, comment)) throw new Error('Comment not found');
    if (comment.authorId !== scope.caller._id && !scope.isStaff) {
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
  },
  handler: async (ctx, args) => {
    const { announcementId } = args;
    const announcement = await ctx.db.get(announcementId);
    if (!announcement) return { success: false };

    const scope = await assertOrgScope(ctx, announcement.organizationId);
    if (!scopeOwnsRecord(scope, announcement)) return { success: false };
    const userId = scope.caller._id;

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
 * Recount views from the view records, for the organization in scope.
 *
 * Was an unauthenticated mutation that walked *every* announcement of *every*
 * tenant and rewrote their counters — a maintenance tool anyone could fire.
 */
export const resetAllViewCounts = mutation({
  args: { organizationId: v.optional(v.id('organizations')) },
  handler: async (ctx, args) => {
    const scope = await assertOrgStaff(ctx, args.organizationId, { adminOnly: true });
    const organizationId = scope.organizationId;
    if (!organizationId) throw new Error('Organization is required');

    const announcements = await ctx.db
      .query('announcements')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);
    let totalReset = 0;

    for (const announcement of announcements) {
      const uniqueViews = await ctx.db
        .query('announcementViews')
        .withIndex('by_announcement', (q) => q.eq('announcementId', announcement._id))
        .take(SMALL_LIST_CAP);

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
    const scope = await resolveOrgScope(ctx, organizationId);
    if (!scope) return [];
    const viewer = await viewerOf(ctx, scope);

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

    // Apply targeting: a department- or role-scoped post is not company-wide.
    announcements = announcements.filter((a) => canSeeAnnouncement(a, viewer, scope.isStaff));

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
        const reactionUsers = await Promise.all(reactions.map((r) => ctx.db.get(r.userId)));
        const reactionMap = new Map(
          reactionUsers
            .filter((u): u is NonNullable<typeof u> => u !== null)
            .map((u) => [u._id, u.name]),
        );

        // Aggregate reactions by emoji (array format to avoid emoji field names)
        const reactionsByEmojiMap: Record<
          string,
          Array<{ userId: Id<'users'>; userName: string }>
        > = {};
        for (const r of reactions) {
          if (!reactionsByEmojiMap[r.emoji]) reactionsByEmojiMap[r.emoji] = [];
          reactionsByEmojiMap[r.emoji]!.push({
            userId: r.userId,
            userName: reactionMap.get(r.userId) ?? 'Unknown',
          });
        }
        const reactionsByEmoji = Object.entries(reactionsByEmojiMap).map(([emoji, users]) => ({
          emoji,
          users,
        }));

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

        // Has the reader opened this one? Drives the "new" marker in the feed,
        // which is what makes a broadcast surface scannable.
        const myView = await ctx.db
          .query('announcementViews')
          .withIndex('by_announcement_user', (q) =>
            q.eq('announcementId', announcement._id).eq('userId', viewer._id),
          )
          .first();

        const myReactions = reactions.filter((r) => r.userId === viewer._id).map((r) => r.emoji);

        return {
          ...announcement,
          authorName: author?.name ?? 'Unknown',
          authorAvatar: author?.avatarUrl ?? '',
          authorRole: author?.role ?? '',
          categoryIcon: getCategoryIcon(announcement.category),
          reactionsByEmoji,
          comments: enrichedComments.reverse(),
          totalComments: announcement.commentCount ?? 0,
          isUnread: !myView,
          myReactions,
          canManage: scope.isStaff || announcement.authorId === viewer._id,
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

    // Reached by id, so scope and targeting are checked after the read.
    const scope = await resolveOrgScope(ctx, announcement.organizationId);
    if (!scope || !scopeOwnsRecord(scope, announcement)) return null;
    const viewer = await viewerOf(ctx, scope);
    if (!canSeeAnnouncement(announcement, viewer, scope.isStaff)) return null;

    const author = await ctx.db.get(announcement.authorId);

    const reactions = await ctx.db
      .query('announcementReactions')
      .withIndex('by_announcement', (q) => q.eq('announcementId', announcement._id))
      .take(DEFAULT_LIST_CAP);

    const reactionUsers = await Promise.all(reactions.map((r) => ctx.db.get(r.userId)));
    const reactionMap = new Map(
      reactionUsers
        .filter((u): u is NonNullable<typeof u> => u !== null)
        .map((u) => [u._id, u.name]),
    );

    const reactionsByEmojiMap: Record<
      string,
      Array<{ userId: Id<'users'>; userName: string }>
    > = {};
    for (const r of reactions) {
      if (!reactionsByEmojiMap[r.emoji]) reactionsByEmojiMap[r.emoji] = [];
      reactionsByEmojiMap[r.emoji]!.push({
        userId: r.userId,
        userName: reactionMap.get(r.userId) ?? 'Unknown',
      });
    }
    const reactionsByEmoji = Object.entries(reactionsByEmojiMap).map(([emoji, users]) => ({
      emoji,
      users,
    }));

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
      canManage: scope.isStaff || announcement.authorId === viewer._id,
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
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope) return null;
    const viewer = await viewerOf(ctx, scope);

    const all = await ctx.db
      .query('announcements')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    // Counters must match what the reader can actually open, otherwise the
    // header promises posts the feed will not show.
    const announcements = all.filter((a) => canSeeAnnouncement(a, viewer, scope.isStaff));

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

    // Unread for this reader, so the header can lead with the one number that
    // makes someone open the page.
    const myViews = await ctx.db
      .query('announcementViews')
      .withIndex('by_user', (q) => q.eq('userId', viewer._id))
      .take(DEFAULT_LIST_CAP);
    const seen = new Set(myViews.map((view) => view.announcementId));
    const unreadCount = active.filter((a) => !seen.has(a._id)).length;

    return {
      total: announcements.length,
      active: active.length,
      pinned: pinned.length,
      urgent: urgent.length,
      byCategory,
      recentCount,
      unreadCount,
    };
  },
});
