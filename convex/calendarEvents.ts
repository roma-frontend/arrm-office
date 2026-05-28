import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { withAuth } from './lib/withAuth';

export const create = mutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    title: v.string(),
    date: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    allDay: v.boolean(),
    location: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.string(),
    reminder: v.string(),
    attendees: v.optional(v.array(v.string())),
    attachmentUrl: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    return await ctx.db.insert('calendarEvents', {
      organizationId: args.organizationId,
      createdBy: args.userId,
      title: args.title,
      date: args.date,
      startTime: args.startTime,
      endTime: args.endTime,
      allDay: args.allDay,
      location: args.location,
      description: args.description,
      category: args.category,
      reminder: args.reminder,
      attendees: args.attendees,
      attachmentUrl: args.attachmentUrl,
      createdAt: Date.now(),
    });
  }),
});

export const getByOrganization = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    return await ctx.db
      .query('calendarEvents')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .order('desc')
      .take(200);
  }),
});

export const remove = mutation({
  args: { id: v.id('calendarEvents') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    await ctx.db.delete(args.id);
  }),
});
