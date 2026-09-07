import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { paginationOptsValidator } from 'convex/server';
import { MAX_PAGE_SIZE } from './pagination';
import { DEFAULT_LIST_CAP } from './lib/limits';
import { getAuthCaller } from './lib/getAuthCaller';

// ── Get notifications for a user (paginated) ───────────────────────────────
export const listPaginated = query({
  args: { userId: v.id('users'), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return { page: [], isDone: true, continueCursor: '' };
    return await ctx.db
      .query('notifications')
      .withIndex('by_user', (q) => q.eq('userId', caller._id))
      .order('desc')
      .paginate(args.paginationOpts);
  },
});

// ── Get notifications for a user (legacy, kept for badge counts) ────────────
export const getUserNotifications = query({
  args: { userId: v.id('users') },
  handler: async (ctx, _args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    return await ctx.db
      .query('notifications')
      .withIndex('by_user', (q) => q.eq('userId', caller._id))
      .order('desc')
      .take(50);
  },
});

// ── Get unread count ───────────────────────────────────────────────────────
export const getUnreadCount = query({
  args: { userId: v.id('users') },
  handler: async (ctx, _args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return 0;
    const unread = await ctx.db
      .query('notifications')
      .withIndex('by_user_unread', (q) => q.eq('userId', caller._id).eq('isRead', false))
      .take(MAX_PAGE_SIZE);
    return Math.min(unread.length, MAX_PAGE_SIZE);
  },
});

// ── Mark notification as read ──────────────────────────────────────────────
export const markAsRead = mutation({
  args: { notificationId: v.id('notifications') },
  handler: async (ctx, args) => {
    const { notificationId } = args;
    await ctx.db.patch(notificationId, { isRead: true });
  },
});

// ── Mark all as read ───────────────────────────────────────────────────────
export const markAllAsRead = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const { userId } = args;
    // Mark all unread notifications as read (capped for safety)
    const unread = await ctx.db
      .query('notifications')
      .withIndex('by_user_unread', (q) => q.eq('userId', userId).eq('isRead', false))
      .take(DEFAULT_LIST_CAP);
    for (const n of unread) {
      await ctx.db.patch(n._id, { isRead: true });
    }
    return unread.length;
  },
});

// ── Delete notification ────────────────────────────────────────────────────
export const deleteNotification = mutation({
  args: { notificationId: v.id('notifications') },
  handler: async (ctx, args) => {
    const { notificationId } = args;
    await ctx.db.delete(notificationId);
  },
});
