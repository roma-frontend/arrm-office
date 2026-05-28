import { v } from 'convex/values';
import { query } from '../_generated/server';
import { MAX_PAGE_SIZE } from '../pagination';

// ─────────────────────────────────────────────────────────────────────────────
// GET UNREAD MESSAGE COUNT — total badge
// ─────────────────────────────────────────────────────────────────────────────
export const getUnreadMessageCount = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const { userId } = args;
    const memberships = await ctx.db
      .query('chatMembers')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(MAX_PAGE_SIZE);

    let total = 0;
    for (const m of memberships) {
      if (m.isMuted || m.isDeleted) continue;
      total += m.unreadCount;
    }
    return total;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET TOTAL UNREAD — unified version matching web signature
// ─────────────────────────────────────────────────────────────────────────────
export const getTotalUnread = query({
  args: {
    userId: v.id('users'),
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const { userId, organizationId } = args;
    const memberships = await ctx.db
      .query('chatMembers')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(MAX_PAGE_SIZE);

    let total = 0;
    for (const m of memberships) {
      if (m.isMuted || m.isDeleted) continue;
      total += m.unreadCount;
    }
    return total;
  },
});
