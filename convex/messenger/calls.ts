import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { MAX_PAGE_SIZE } from '../pagination';
import type { Id } from '../_generated/dataModel';
import { patchProfile } from '../lib/userProfile';

// ─────────────────────────────────────────────────────────────────────────────
// CALLS - Audio/Video calling using WebRTC (similar to web version)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start a call in a conversation
 * Creates a call record and notifies participants
 */
export const startCall = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    initiatorId: v.id('users'),
    callType: v.union(v.literal('audio'), v.literal('video')),
  },
  handler: async (ctx, args) => {
    const { conversationId, initiatorId, callType } = args;
    const conv = await ctx.db.get(conversationId);
    if (!conv) throw new Error('Conversation not found');

    const initiator = await ctx.db.get(initiatorId);
    if (!initiator) throw new Error('Initiator not found');

    const now = Date.now();
    const callId = await ctx.db.insert('chatMessages', {
      conversationId,
      organizationId: conv.organizationId,
      senderId: initiatorId,
      type: 'call',
      content: `${initiator.name} started a ${callType} call`,
      callType,
      callStatus: 'missed', // Will be updated when answered
      createdAt: now,
    });

    // Set initiator status to "in_call"
    await patchProfile(ctx, initiatorId, { presenceStatus: 'in_call' });

    return { callId, conversationId };
  },
});

/**
 * Answer an incoming call
 */
export const answerCall = mutation({
  args: {
    callMessageId: v.id('chatMessages'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { callMessageId, userId } = args;
    const call = await ctx.db.get(callMessageId);
    if (!call) throw new Error('Call not found');

    // Update call status to answered
    await ctx.db.patch(callMessageId, {
      callStatus: 'answered',
      content: `Call answered`,
    });

    // Set user status to "in_call"
    await patchProfile(ctx, userId, { presenceStatus: 'in_call' });

    return callMessageId;
  },
});

/**
 * End a call
 */
export const endCall = mutation({
  args: {
    callMessageId: v.id('chatMessages'),
    userId: v.id('users'),
    duration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { callMessageId, userId, duration } = args;
    const call = await ctx.db.get(callMessageId);
    if (!call) throw new Error('Call not found');

    // Update call with duration
    const patch: Record<string, any> = {
      callDuration: duration,
      content: `Call ended (${duration ? Math.floor(duration / 60) : 0}m ${duration ? duration % 60 : 0}s)`,
    };

    await ctx.db.patch(callMessageId, patch);

    // Reset user status to "available"
    await patchProfile(ctx, userId, { presenceStatus: 'available' });

    return callMessageId;
  },
});

/**
 * Decline an incoming call
 */
export const declineCall = mutation({
  args: {
    callMessageId: v.id('chatMessages'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { callMessageId, userId } = args;
    const call = await ctx.db.get(callMessageId);
    if (!call) throw new Error('Call not found');

    await ctx.db.patch(callMessageId, {
      callStatus: 'declined',
      content: `Call declined`,
    });

    // Reset initiator status
    await patchProfile(ctx, call.senderId, { presenceStatus: 'available' });

    return callMessageId;
  },
});

/**
 * Get active call info for a conversation
 */
export const getActiveCall = query({
  args: {
    conversationId: v.id('chatConversations'),
  },
  handler: async (ctx, args) => {
    const { conversationId } = args;
    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', conversationId))
      .order('desc')
      .take(5);

    // Find the most recent call message that's still active
    const activeCall = messages.find(
      (m) => m.type === 'call' && (m.callStatus === 'answered' || m.callStatus === 'missed'),
    );

    if (!activeCall) return null;

    const initiator = await ctx.db.get(activeCall.senderId);

    return {
      callId: activeCall._id,
      conversationId,
      type: activeCall.callType,
      initiatorId: activeCall.senderId,
      initiatorName: initiator?.name ?? 'Unknown',
      status: activeCall.callStatus,
      createdAt: activeCall.createdAt,
    };
  },
});

/**
 * Get incoming calls for a user
 */
export const getIncomingCalls = query({
  args: {
    userId: v.id('users'),
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const { userId, organizationId } = args;
    // Get all conversations for this user
    const memberships = await ctx.db
      .query('chatMembers')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(MAX_PAGE_SIZE);

    // Batch-load recent messages for all conversations upfront
    const conversationIds = memberships.map((m) => m.conversationId);
    const allMessages = await Promise.all(
      conversationIds.map((convId) =>
        ctx.db
          .query('chatMessages')
          .withIndex('by_conversation', (q) => q.eq('conversationId', convId))
          .order('desc')
          .take(3),
      ),
    );

    // Collect unique sender IDs from potential incoming calls
    const uniqueSenderIds = new Set<Id<'users'>>();
    for (const messages of allMessages) {
      for (const msg of messages) {
        if (msg.type === 'call' && msg.senderId !== userId && msg.callStatus === 'missed') {
          uniqueSenderIds.add(msg.senderId as Id<'users'>);
        }
      }
    }

    // Batch-load all potential initiators
    const sendersBatch = await Promise.all([...uniqueSenderIds].map((id) => ctx.db.get(id)));
    const senderMap = new Map(sendersBatch.filter(Boolean).map((s) => [s._id, s]));

    // Find active calls in these conversations
    for (let i = 0; i < memberships.length; i++) {
      const messages = allMessages[i] || [];
      const incomingCall = messages.find(
        (m) => m.type === 'call' && m.senderId !== userId && m.callStatus === 'missed',
      );

      if (incomingCall) {
        const initiator = senderMap.get(incomingCall.senderId);
        return {
          callId: incomingCall._id,
          conversationId: incomingCall.conversationId,
          type: incomingCall.callType,
          initiatorId: incomingCall.senderId,
          initiatorName: initiator?.name ?? 'Unknown',
          status: incomingCall.callStatus,
          createdAt: incomingCall.createdAt,
        };
      }
    }

    return null;
  },
});
