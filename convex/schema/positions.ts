import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const positions = {
  positions: defineTable({
    organizationId: v.id('organizations'),
    departmentId: v.optional(v.id('departments')),
    title: v.string(),
    titleEn: v.optional(v.string()),
    titleRu: v.optional(v.string()),
    titleHy: v.optional(v.string()),
    description: v.optional(v.string()),
    level: v.optional(v.string()),
    /**
     * The position this one reports to — PeopleSoft's "Reports To" field.
     *
     * Labels and orders the chart today. It is *not* a permission input and it
     * is not yet the source of a person's manager: the person-based line
     * (`users.supervisorId`) stays canonical until position-based routing is
     * switched on per organization.
     */
    reportsToPositionId: v.optional(v.id('positions')),
    /**
     * Presentational rank, 0 = head of the organization. Used to order siblings
     * in the chart and to label seniority. Never read it to decide permissions —
     * that is what put the app in the mess this field is part of fixing.
     */
    rank: v.optional(v.number()),
    salaryMin: v.optional(v.number()),
    salaryMax: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_department', ['departmentId']),
};
