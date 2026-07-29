import { v } from 'convex/values';
import { query } from '../_generated/server';
import { MAX_PAGE_SIZE } from '../pagination';
import { getProfile } from '../lib/userProfile';

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH MESSAGES
// ─────────────────────────────────────────────────────────────────────────────
export const searchMessages = query({
  args: {
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', args.conversationId).eq('userId', args.userId),
      )
      .first();
    if (!membership) return [];

    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .take(MAX_PAGE_SIZE);

    const q = args.query.toLowerCase();
    const matches = messages
      .filter((m) => !m.isDeleted && m.content.toLowerCase().includes(q))
      .slice(-20);

    return Promise.all(
      matches.map(async (m) => {
        const sender = await ctx.db.get(m.senderId);
        const senderProfile = await getProfile(ctx, m.senderId);
        return {
          ...m,
          senderName: sender?.name ?? 'Unknown',
          senderAvatarUrl: senderProfile?.avatarUrl ?? sender?.avatarUrl,
        };
      }),
    );
  },
});
