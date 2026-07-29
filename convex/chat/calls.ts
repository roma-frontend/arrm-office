import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { MAX_PAGE_SIZE } from '../pagination';

// ─── CALLS ────────────────────────────────────────────────────────────────────

export const initiateCall = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    organizationId: v.optional(v.id('organizations')),
    initiatorId: v.id('users'),
    type: v.union(v.literal('audio'), v.literal('video')),
    participantIds: v.array(v.id('users')),
    offer: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const participantList = [
      {
        userId: args.initiatorId,
        joinedAt: now,
        offer: args.offer,
      },
      ...args.participantIds.filter((id) => id !== args.initiatorId).map((id) => ({ userId: id })),
    ];

    const callId = await ctx.db.insert('chatCalls', {
      conversationId: args.conversationId,
      organizationId: args.organizationId,
      initiatorId: args.initiatorId,
      type: args.type,
      status: 'ringing',
      participants: participantList,
      createdAt: now,
    });

    // Post system message about call
    const initiator = await ctx.db.get(args.initiatorId);
    await ctx.db.insert('chatMessages', {
      conversationId: args.conversationId,
      organizationId: args.organizationId,
      senderId: args.initiatorId,
      type: 'call',
      content: `${initiator?.name ?? 'Someone'} started a ${args.type} call`,
      callType: args.type,
      callStatus: 'missed',
      createdAt: now,
    });

    return callId;
  },
});

export const answerCall = mutation({
  args: {
    callId: v.id('chatCalls'),
    userId: v.id('users'),
    answer: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error('Call not found');

    const participants = call.participants.map((p) => {
      if (p.userId === args.userId) {
        return { ...p, joinedAt: Date.now(), answer: args.answer };
      }
      return p;
    });

    await ctx.db.patch(args.callId, {
      status: 'active',
      startedAt: Date.now(),
      participants,
    });

    // Update call message status
    const callMessages = await ctx.db
      .query('chatMessages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', call.conversationId))
      .order('desc')
      .take(5);
    const callMsg = callMessages.find((m) => m.type === 'call' && m.callStatus === 'missed');
    if (callMsg) {
      await ctx.db.patch(callMsg._id, { callStatus: 'answered' });
    }
  },
});

export const endCall = mutation({
  args: {
    callId: v.id('chatCalls'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error('Call not found');

    const now = Date.now();
    const duration = call.startedAt ? Math.floor((now - call.startedAt) / 1000) : 0;

    const participants = call.participants.map((p) => {
      if (!p.leftAt) return { ...p, leftAt: now };
      return p;
    });

    await ctx.db.patch(args.callId, {
      status: 'ended',
      endedAt: now,
      duration,
      participants,
    });
  },
});

export const declineCall = mutation({
  args: {
    callId: v.id('chatCalls'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error('Call not found');
    await ctx.db.patch(args.callId, { status: 'declined' });

    const callMessages = await ctx.db
      .query('chatMessages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', call.conversationId))
      .order('desc')
      .take(5);
    const callMsg = callMessages.find((m) => m.type === 'call');
    if (callMsg) {
      await ctx.db.patch(callMsg._id, { callStatus: 'declined' });
    }
  },
});

/** Store SDP offer for the initiator (does NOT change call status) */
export const updateOffer = mutation({
  args: {
    callId: v.id('chatCalls'),
    userId: v.id('users'),
    offer: v.string(),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error('Call not found');

    const participants = call.participants.map((p) => {
      if (p.userId === args.userId) {
        return { ...p, offer: args.offer };
      }
      return p;
    });

    await ctx.db.patch(args.callId, { participants });
  },
});

export const updateIceCandidates = mutation({
  args: {
    callId: v.id('chatCalls'),
    userId: v.id('users'),
    candidates: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error('Call not found');

    const participants = call.participants.map((p) => {
      if (p.userId === args.userId) {
        // Append new candidates to existing array instead of replacing
        const existing = p.iceCandidates ?? [];
        const merged = [...existing, ...args.candidates];
        return { ...p, iceCandidates: merged };
      }
      return p;
    });

    await ctx.db.patch(args.callId, { participants });
  },
});

export const getActiveCall = query({
  args: { conversationId: v.id('chatConversations') },
  handler: async (ctx, args) => {
    // Get the most recent call that is still ringing or active
    return ctx.db
      .query('chatCalls')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .order('desc')
      .filter((q) => q.or(q.eq(q.field('status'), 'ringing'), q.eq(q.field('status'), 'active')))
      .first();
  },
});

/** Get all incoming calls for a user (ringing calls where user is not initiator) */
export const getIncomingCalls = query({
  args: {
    userId: v.id('users'),
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    // Find all active/ringing calls in this organization where user is a participant but not initiator
    const calls = await ctx.db
      .query('chatCalls')
      .withIndex('by_organization', (q) => q.eq('organizationId', args.organizationId))
      .filter((q) =>
        q.and(
          q.or(q.eq(q.field('status'), 'ringing'), q.eq(q.field('status'), 'active')),
          q.neq(q.field('initiatorId'), args.userId),
        ),
      )
      .order('desc')
      .take(MAX_PAGE_SIZE);

    // Filter to only calls where user is a participant
    const incomingCalls = calls.filter((call) =>
      call.participants?.some(
        (p: { userId: Id<'users'>; joinedAt?: number }) => p.userId === args.userId,
      ),
    );

    // Get the most recent one (or return null if none)
    if (incomingCalls.length > 0) {
      return incomingCalls[0];
    }

    return null;
  },
});
