import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const probation = {
  probationPeriods: defineTable({
    organizationId: v.id('organizations'),
    employeeId: v.id('users'),
    startDate: v.number(),
    endDate: v.number(),
    // endDate as originally planned — kept so extensions stay auditable and the
    // statutory cap is measured against the agreed term, not the drifted one.
    originalEndDate: v.number(),
    durationDays: v.number(),
    status: v.union(
      v.literal('active'),
      v.literal('passed'),
      v.literal('failed'),
      v.literal('cancelled'),
    ),
    // Reminder thresholds (days remaining) already notified — cron dedup.
    remindersSent: v.array(v.number()),
    extensions: v.array(
      v.object({
        extendedBy: v.id('users'),
        extendedAt: v.number(),
        previousEndDate: v.number(),
        newEndDate: v.number(),
        reason: v.optional(v.string()),
      }),
    ),
    outcomeNote: v.optional(v.string()),
    completedBy: v.optional(v.id('users')),
    completedAt: v.optional(v.number()),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_employee', ['employeeId'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_status_end', ['status', 'endDate']),
};
