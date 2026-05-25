import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const newsletter = {
  newsletterSubscribers: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    language: v.union(v.literal('en'), v.literal('ru'), v.literal('hy'), v.literal('de')),
    topics: v.optional(
      v.array(
        v.union(
          v.literal('hr-tips'),
          v.literal('leadership'),
          v.literal('wellness'),
          v.literal('tech'),
        ),
      ),
    ),
    subscribedAt: v.number(),
    unsubscribed: v.boolean(),
    unsubscribeToken: v.string(),
    lastSentAt: v.optional(v.number()),
    // Telegram delivery
    telegramChatId: v.optional(v.string()),
    channel: v.optional(v.union(v.literal('email'), v.literal('telegram'))),
    // Drip campaign
    dripStep: v.optional(v.number()), // 0-3, which welcome message was last sent
    dripLastSentAt: v.optional(v.number()),
    // Pause
    pausedUntil: v.optional(v.number()),
    // Referral
    referralCode: v.optional(v.string()),
    referredBy: v.optional(v.string()),
    referralCount: v.optional(v.number()),
    // Analytics
    totalSent: v.optional(v.number()),
    totalDelivered: v.optional(v.number()),
  })
    .index('by_email', ['email'])
    .index('by_active', ['unsubscribed'])
    .index('by_token', ['unsubscribeToken'])
    .index('by_telegram', ['telegramChatId'])
    .index('by_referral', ['referralCode']),

  newsletterAnalytics: defineTable({
    subscriberId: v.id('newsletterSubscribers'),
    sentAt: v.number(),
    channel: v.union(v.literal('email'), v.literal('telegram')),
    type: v.union(v.literal('digest'), v.literal('drip'), v.literal('poll')),
    delivered: v.boolean(),
    language: v.optional(v.string()),
  }).index('by_subscriber', ['subscriberId']),

  newsletterPolls: defineTable({
    question: v.string(),
    options: v.array(v.object({ text: v.string(), votes: v.number() })),
    sentAt: v.number(),
    closesAt: v.number(),
    active: v.boolean(),
  }).index('by_active', ['active']),

  newsletterPollVotes: defineTable({
    pollId: v.id('newsletterPolls'),
    subscriberId: v.id('newsletterSubscribers'),
    optionIndex: v.number(),
    votedAt: v.number(),
  })
    .index('by_poll', ['pollId'])
    .index('by_subscriber_poll', ['subscriberId', 'pollId']),
};
