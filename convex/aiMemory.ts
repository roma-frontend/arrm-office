/**
 * AI Assistant long-term memory.
 *
 * Durable facts/preferences the user shared in chat (extracted server-side
 * from `<REMEMBER>` tags). Mixed back into the system prompt so the assistant
 * stays consistent across separate conversations.
 */

import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { getAuthCaller } from './lib/getAuthCaller';
import { isSuperadmin } from './lib/auth';

/** Max facts kept per user; oldest are evicted once the cap is exceeded. */
export const MEMORY_CAP = 30;
/** Max characters kept per fact. */
export const MEMORY_MAX_LEN = 240;
/** Max facts accepted from a single reply. */
export const MEMORY_PER_REPLY = 5;

export const listMemories = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    if (caller._id !== args.userId && !isSuperadmin(caller) && caller.role !== 'admin') return [];
    return await ctx.db
      .query('aiMemories')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(MEMORY_CAP);
  },
});

/**
 * Persist a batch of facts harvested from one assistant reply. Case-insensitive
 * dedup against existing memory; evicts the oldest rows beyond MEMORY_CAP.
 */
export const addMemories = mutation({
  args: {
    userId: v.id('users'),
    facts: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('aiMemories')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .take(MEMORY_CAP);
    const seen = new Set(existing.map((m) => m.content.toLowerCase()));

    let added = 0;
    for (const raw of args.facts.slice(0, MEMORY_PER_REPLY)) {
      const fact = (raw || '').replace(/\s+/g, ' ').trim().slice(0, MEMORY_MAX_LEN);
      if (!fact) continue;
      const key = fact.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      await ctx.db.insert('aiMemories', {
        userId: args.userId,
        content: fact,
        createdAt: Date.now(),
      });
      added += 1;
    }

    if (added > 0) {
      const all = await ctx.db
        .query('aiMemories')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .order('desc')
        .take(MEMORY_CAP + MEMORY_PER_REPLY);
      for (const row of all.slice(MEMORY_CAP)) {
        await ctx.db.delete(row._id);
      }
    }

    return { added };
  },
});

export const deleteMemory = mutation({
  args: { memoryId: v.id('aiMemories') },
  handler: async (ctx, args) => {
    const memory = await ctx.db.get(args.memoryId);
    if (!memory) return { success: false };
    await ctx.db.delete(args.memoryId);
    return { success: true };
  },
});

export const clearMemories = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const memories = await ctx.db
      .query('aiMemories')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .take(MEMORY_CAP + MEMORY_PER_REPLY);
    for (const memory of memories) {
      await ctx.db.delete(memory._id);
    }
    return { deleted: memories.length };
  },
});
