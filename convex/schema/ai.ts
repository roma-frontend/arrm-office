import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const ai = {
  aiConversations: defineTable({
    userId: v.id('users'),
    title: v.string(),
    pinned: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_user', ['userId']),

  aiMessages: defineTable({
    conversationId: v.id('aiConversations'),
    role: v.union(v.literal('user'), v.literal('assistant')),
    content: v.string(),
    createdAt: v.number(),
  }).index('by_conversation', ['conversationId']),

  aiMemories: defineTable({
    userId: v.id('users'),
    content: v.string(),
    createdAt: v.number(),
  }).index('by_user', ['userId']),

  aiFeedback: defineTable({
    conversationId: v.id('aiConversations'),
    messageId: v.optional(v.string()),
    userId: v.id('users'),
    rating: v.union(v.literal('up'), v.literal('down')),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_conversation', ['conversationId'])
    .index('by_user', ['userId']),

  aiShares: defineTable({
    conversationId: v.id('aiConversations'),
    token: v.string(),
    createdBy: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_token', ['token'])
    .index('by_conversation', ['conversationId']),
};
