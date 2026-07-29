import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { MAX_PAGE_SIZE } from '../pagination';

async function getUserOrgId(ctx: QueryCtx, userId: Id<'users'>): Promise<Id<'organizations'>> {
  const user = await ctx.db.get(userId);
  if (!user) throw new Error('User not found');
  if (!user.organizationId) throw new Error('User has no organization');
  return user.organizationId;
}

// ─────────────────────────────────────────────────────────────────────────────
// SET TYPING
// ─────────────────────────────────────────────────────────────────────────────
export const setTyping = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
    isTyping: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('chatTyping')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', args.conversationId).eq('userId', args.userId),
      )
      .first();

    if (args.isTyping) {
      if (existing) {
        await ctx.db.patch(existing._id, { updatedAt: Date.now() });
      } else {
        const orgId = await getUserOrgId(ctx, args.userId);
        await ctx.db.insert('chatTyping', {
          conversationId: args.conversationId,
          userId: args.userId,
          organizationId: orgId,
          updatedAt: Date.now(),
        });
      }
    } else {
      if (existing) await ctx.db.delete(existing._id);
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET TYPING USERS
// ─────────────────────────────────────────────────────────────────────────────
export const getTypingUsers = query({
  args: {
    conversationId: v.id('chatConversations'),
    currentUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - 5000;
    const typing = await ctx.db
      .query('chatTyping')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .take(MAX_PAGE_SIZE);

    const active = typing.filter((t) => t.userId !== args.currentUserId && t.updatedAt > cutoff);

    return Promise.all(
      active.map(async (t) => {
        const user = await ctx.db.get(t.userId);
        return { userId: t.userId, name: user?.name ?? 'Someone' };
      }),
    );
  },
});
