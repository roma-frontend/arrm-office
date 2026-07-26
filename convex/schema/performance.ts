import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const performance = {
  // Review cycles (Q1, Annual, etc.)
  reviewCycles: defineTable({
    organizationId: v.id('organizations'),
    title: v.string(),
    description: v.optional(v.string()),
    type: v.union(
      v.literal('quarterly'),
      v.literal('semi_annual'),
      v.literal('annual'),
      v.literal('custom'),
    ),
    startDate: v.number(),
    endDate: v.number(),
    status: v.union(
      v.literal('draft'),
      v.literal('active'),
      v.literal('completed'),
      v.literal('cancelled'),
    ),
    // 360° toggles
    includesSelf: v.boolean(),
    includesPeer: v.boolean(),
    includesManager: v.boolean(),
    includesDirectReport: v.boolean(),
    // Snapshotted competencies at launch (immutable after launch)
    competencies: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        description: v.string(),
        weight: v.number(), // 0-100, sum should be 100
      }),
    ),
    // Anonymity settings
    peerAnonymityThreshold: v.number(), // minimum peer reviews before showing results (default: 2)
    showPeerIdentity: v.boolean(), // whether to reveal peer names to reviewee
    // Audit
    createdBy: v.id('users'),
    launchedAt: v.optional(v.number()),
    launchedBy: v.optional(v.id('users')),
    closedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_org_dates', ['organizationId', 'startDate']),

  // Review templates (reusable competency sets)
  reviewTemplates: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    description: v.optional(v.string()),
    competencies: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        description: v.string(),
        weight: v.number(),
      }),
    ),
    isDefault: v.boolean(),
    createdBy: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_default', ['organizationId', 'isDefault']),

  // Assignments: who reviews whom
  reviewAssignments: defineTable({
    organizationId: v.id('organizations'),
    cycleId: v.id('reviewCycles'),
    reviewerId: v.id('users'),
    revieweeId: v.id('users'),
    type: v.union(
      v.literal('self'),
      v.literal('peer'),
      v.literal('manager'),
      v.literal('direct_report'),
    ),
    status: v.union(
      v.literal('pending'),
      v.literal('in_progress'),
      v.literal('submitted'),
      v.literal('cancelled'),
    ),
    dueDate: v.number(),
    submittedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_cycle', ['cycleId'])
    .index('by_reviewer', ['reviewerId'])
    .index('by_reviewer_status', ['reviewerId', 'status'])
    .index('by_reviewee_cycle', ['revieweeId', 'cycleId'])
    .index('by_cycle_reviewer', ['cycleId', 'reviewerId'])
    .index('by_cycle_reviewee', ['cycleId', 'revieweeId'])
    .index('by_cycle_type', ['cycleId', 'type']),

  // Submitted review responses (one per assignment)
  reviewResponses: defineTable({
    organizationId: v.id('organizations'),
    assignmentId: v.id('reviewAssignments'),
    cycleId: v.id('reviewCycles'),
    reviewerId: v.id('users'),
    revieweeId: v.id('users'),
    type: v.union(
      v.literal('self'),
      v.literal('peer'),
      v.literal('manager'),
      v.literal('direct_report'),
    ),
    // Summary fields for quick reporting
    overallScore: v.number(),
    strengths: v.optional(v.string()),
    improvements: v.optional(v.string()),
    generalComments: v.optional(v.string()),
    submittedAt: v.number(),
  })
    .index('by_assignment', ['assignmentId'])
    .index('by_cycle_reviewee', ['cycleId', 'revieweeId'])
    .index('by_cycle_reviewer', ['cycleId', 'reviewerId'])
    .index('by_cycle_type', ['cycleId', 'type'])
    .index('by_reviewee', ['revieweeId']),

  // Individual competency ratings (normalized for analytics)
  reviewRatings: defineTable({
    organizationId: v.id('organizations'),
    responseId: v.id('reviewResponses'),
    cycleId: v.id('reviewCycles'),
    revieweeId: v.id('users'),
    competencyId: v.string(),
    competencyName: v.string(),
    score: v.number(), // 1-5
    comment: v.optional(v.string()),
  })
    .index('by_response', ['responseId'])
    .index('by_cycle_reviewee', ['cycleId', 'revieweeId'])
    .index('by_cycle_competency', ['cycleId', 'competencyId']),
};
