import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const settings = {
  subscriptions: defineTable({
    organizationId: v.optional(v.id('organizations')),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    stripeSessionId: v.optional(v.string()),
    stripePriceId: v.optional(v.string()),
    plan: v.union(v.literal('starter'), v.literal('professional'), v.literal('enterprise')),
    status: v.union(
      v.literal('trialing'),
      v.literal('active'),
      v.literal('past_due'),
      v.literal('canceled'),
      v.literal('incomplete'),
    ),
    email: v.optional(v.string()),
    userId: v.optional(v.id('users')),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    trialEnd: v.optional(v.number()),
    metadata: v.optional(
      v.object({
        manual: v.optional(v.boolean()),
        customPrice: v.optional(v.number()),
        notes: v.optional(v.string()),
        createdBy: v.optional(v.id('users')),
        createdAt: v.optional(v.number()),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_stripe_customer', ['stripeCustomerId'])
    .index('by_stripe_subscription', ['stripeSubscriptionId'])
    .index('by_status', ['status'])
    .index('by_user', ['userId'])
    .index('by_email', ['email']),

  contactInquiries: defineTable({
    name: v.string(),
    email: v.string(),
    company: v.optional(v.string()),
    teamSize: v.optional(v.string()),
    message: v.string(),
    plan: v.optional(v.string()),
    createdAt: v.number(),
  }).index('by_created', ['createdAt']),

  maintenanceMode: defineTable({
    organizationId: v.id('organizations'),
    isActive: v.boolean(),
    title: v.string(),
    message: v.string(),
    startTime: v.number(),
    endTime: v.optional(v.number()),
    estimatedDuration: v.optional(v.string()),
    icon: v.optional(v.string()),
    enabledBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_active', ['isActive']),

  scheduledJobs: defineTable({
    organizationId: v.id('organizations'),
    functionName: v.string(),
    schedule: v.string(),
    isActive: v.boolean(),
    lastRun: v.optional(v.number()),
    nextRun: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_active', ['organizationId', 'isActive'])
    .index('by_function', ['functionName']),
};
