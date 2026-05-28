import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { SMALL_LIST_CAP } from './lib/limits';
import { withAuth } from './lib/withAuth';

// ── Add Manager Note ──────────────────────────────────────────────
export const addNote = mutation({
  args: {
    employeeId: v.id('users'),
    authorId: v.id('users'),
    type: v.union(
      v.literal('performance'),
      v.literal('behavior'),
      v.literal('achievement'),
      v.literal('concern'),
      v.literal('general'),
    ),
    visibility: v.union(
      v.literal('private'),
      v.literal('hr_only'),
      v.literal('manager_only'),
      v.literal('employee_visible'),
    ),
    content: v.string(),
    tags: v.optional(v.array(v.string())),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    // Simple sentiment analysis based on keywords
    const positiveWords = [
      'excellent',
      'great',
      'outstanding',
      'impressive',
      'exceeded',
      'strong',
      'good',
    ];
    const negativeWords = ['poor', 'weak', 'concerning', 'issue', 'problem', 'below', 'failed'];

    const contentLower = args.content.toLowerCase();
    const hasPositive = positiveWords.some((word) => contentLower.includes(word));
    const hasNegative = negativeWords.some((word) => contentLower.includes(word));

    let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
    if (hasPositive && !hasNegative) sentiment = 'positive';
    else if (hasNegative && !hasPositive) sentiment = 'negative';

    return await ctx.db.insert('employeeNotes', {
      employeeId: args.employeeId,
      authorId: args.authorId,
      type: args.type,
      visibility: args.visibility,
      content: args.content,
      sentiment,
      tags: args.tags ?? [],
      createdAt: Date.now(),
    });
  }),
});

// ── Get Employee Notes ──────────────────────────────────────────────
export const getNotes = query({
  args: {
    employeeId: v.id('users'),
    viewerId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const viewer = (await ctx.db.get(args.viewerId)) as any;
    if (!viewer) return [];

    const allNotes = await ctx.db
      .query('employeeNotes')
      .withIndex('by_employee', (q) => q.eq('employeeId', args.employeeId))
      .order('desc')
      .take(SMALL_LIST_CAP);

    // Filter by visibility
    const filtered = allNotes.filter((note: any) => {
      if (note.visibility === 'employee_visible') return true;
      if (note.visibility === 'hr_only' && viewer.role === 'admin') return true;
      if (
        note.visibility === 'manager_only' &&
        (viewer.role === 'admin' || viewer.role === 'supervisor')
      )
        return true;
      if (note.visibility === 'private' && note.authorId === args.viewerId) return true;
      return false;
    });

    // Get author info
    const notesWithAuthors = await Promise.all(
      filtered.map(async (note) => {
        const author = (await ctx.db.get(note.authorId)) as any;
        return {
          ...note,
          authorName: author?.name ?? 'Unknown',
        };
      }),
    );

    return notesWithAuthors;
  }),
});

// ── Update Note ──────────────────────────────────────────────
export const updateNote = mutation({
  args: {
    noteId: v.id('employeeNotes'),
    content: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const updates: any = {};

    if (args.content !== undefined) {
      updates.content = args.content;

      // Re-analyze sentiment
      const positiveWords = [
        'excellent',
        'great',
        'outstanding',
        'impressive',
        'exceeded',
        'strong',
        'good',
      ];
      const negativeWords = ['poor', 'weak', 'concerning', 'issue', 'problem', 'below', 'failed'];

      const contentLower = args.content.toLowerCase();
      const hasPositive = positiveWords.some((word) => contentLower.includes(word));
      const hasNegative = negativeWords.some((word) => contentLower.includes(word));

      let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
      if (hasPositive && !hasNegative) sentiment = 'positive';
      else if (hasNegative && !hasPositive) sentiment = 'negative';

      updates.sentiment = sentiment;
    }

    if (args.tags !== undefined) {
      updates.tags = args.tags;
    }

    await ctx.db.patch(args.noteId, updates);
  }),
});

// ── Delete Note ──────────────────────────────────────────────
export const deleteNote = mutation({
  args: { noteId: v.id('employeeNotes') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    await ctx.db.delete(args.noteId);
  }),
});

// ── Get Notes Summary ──────────────────────────────────────────────
export const getNotesSummary = query({
  args: { employeeId: v.id('users') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const notes = await ctx.db
      .query('employeeNotes')
      .withIndex('by_employee', (q) => q.eq('employeeId', args.employeeId))
      .take(SMALL_LIST_CAP);

    const total = notes.length;
    const positive = notes.filter((n: any) => n.sentiment === 'positive').length;
    const negative = notes.filter((n: any) => n.sentiment === 'negative').length;
    const neutral = notes.filter((n: any) => n.sentiment === 'neutral').length;

    const byType = {
      performance: notes.filter((n: any) => n.type === 'performance').length,
      behavior: notes.filter((n: any) => n.type === 'behavior').length,
      achievement: notes.filter((n: any) => n.type === 'achievement').length,
      concern: notes.filter((n: any) => n.type === 'concern').length,
      general: notes.filter((n: any) => n.type === 'general').length,
    };

    return {
      total,
      sentiment: { positive, negative, neutral },
      byType,
    };
  }),
});
