import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const goals = {
  // OKR Objectives (Company → Team → Individual)
  objectives: defineTable({
    organizationId: v.id('organizations'),
    title: v.string(),
    description: v.optional(v.string()),
    ownerId: v.id('users'),
    level: v.union(v.literal('company'), v.literal('team'), v.literal('individual')),
    // Team scope — department name (only for team-level objectives)
    department: v.optional(v.string()),
    // Period
    periodType: v.union(
      v.literal('Q1'),
      v.literal('Q2'),
      v.literal('Q3'),
      v.literal('Q4'),
      v.literal('H1'),
      v.literal('H2'),
      v.literal('FY'),
    ),
    periodYear: v.number(),
    periodStart: v.number(),
    periodEnd: v.number(),
    // Status & progress
    status: v.union(
      v.literal('draft'),
      v.literal('active'),
      v.literal('completed'),
      v.literal('cancelled'),
    ),
    progress: v.number(), // 0-100, server-computed from KRs
    // Alignment — single parent (tree structure)
    parentObjectiveId: v.optional(v.id('objectives')),
    // Audit
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_period', ['organizationId', 'periodYear', 'periodType'])
    .index('by_org_level', ['organizationId', 'level'])
    .index('by_org_owner', ['organizationId', 'ownerId'])
    .index('by_owner', ['ownerId'])
    .index('by_parent', ['parentObjectiveId'])
    .index('by_org_status', ['organizationId', 'status']),

  // Key Results — measurable outcomes for each objective
  keyResults: defineTable({
    objectiveId: v.id('objectives'),
    organizationId: v.id('organizations'),
    title: v.string(),
    description: v.optional(v.string()),
    // Measurement
    metricType: v.union(
      v.literal('percentage'),
      v.literal('number'),
      v.literal('currency'),
      v.literal('boolean'),
    ),
    direction: v.union(v.literal('increase'), v.literal('decrease')),
    startValue: v.number(),
    targetValue: v.number(),
    currentValue: v.number(),
    unit: v.optional(v.string()),
    // Weight within objective (sum should be 100)
    weight: v.number(),
    // Health (manual via check-ins)
    confidence: v.union(
      v.literal('high'),
      v.literal('medium'),
      v.literal('low'),
      v.literal('none'),
    ),
    // Display order
    order: v.number(),
    // Owner (may differ from objective owner)
    ownerId: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_objective', ['objectiveId'])
    .index('by_objective_order', ['objectiveId', 'order'])
    .index('by_org', ['organizationId'])
    .index('by_owner', ['ownerId']),

  // Check-ins — weekly progress updates on KRs
  goalCheckins: defineTable({
    keyResultId: v.id('keyResults'),
    objectiveId: v.id('objectives'),
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    previousValue: v.number(),
    newValue: v.number(),
    note: v.optional(v.string()),
    confidence: v.union(v.literal('high'), v.literal('medium'), v.literal('low')),
    createdAt: v.number(),
  })
    .index('by_kr', ['keyResultId'])
    .index('by_objective', ['objectiveId'])
    .index('by_org_date', ['organizationId', 'createdAt']),
};
