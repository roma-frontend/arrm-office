import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const leaves = {
  leaveRequests: defineTable({
    organizationId: v.optional(v.id('organizations')),
    userId: v.id('users'),
    type: v.union(
      v.literal('paid'),
      v.literal('unpaid'),
      v.literal('sick'),
      v.literal('family'),
      v.literal('doctor'),
      v.literal('day_off'),
      v.literal('maternity'),
      v.literal('paternity'),
      v.literal('study'),
    ),
    startDate: v.string(),
    endDate: v.string(),
    days: v.number(),
    reason: v.string(),
    comment: v.optional(v.string()),
    status: v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected')),
    isRead: v.optional(v.boolean()),
    reviewedBy: v.optional(v.id('users')),
    reviewComment: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_user', ['userId'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_status', ['status'])
    .index('by_created', ['createdAt'])
    .index('by_status_created', ['status', 'createdAt'])
    .index('by_user_status', ['userId', 'status'])
    .index('by_org_created', ['organizationId', 'createdAt']),
};
