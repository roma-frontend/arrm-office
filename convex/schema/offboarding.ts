import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const offboarding = {
  // Offboarding checklists (active program for departing employee)
  offboardingPrograms: defineTable({
    organizationId: v.id('organizations'),
    employeeId: v.id('users'),
    managerId: v.id('users'),
    lastDay: v.number(),
    reason: v.union(
      v.literal('resignation'),
      v.literal('termination'),
      v.literal('layoff'),
      v.literal('retirement'),
      v.literal('contract_end'),
      v.literal('other'),
    ),
    reasonNote: v.optional(v.string()),
    status: v.union(v.literal('active'), v.literal('completed'), v.literal('cancelled')),
    createdBy: v.id('users'),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_employee', ['employeeId']),

  // Individual offboarding tasks
  offboardingTasks: defineTable({
    organizationId: v.id('organizations'),
    programId: v.id('offboardingPrograms'),
    title: v.string(),
    description: v.optional(v.string()),
    assigneeType: v.union(
      v.literal('employee'),
      v.literal('manager'),
      v.literal('hr'),
      v.literal('it'),
      v.literal('finance'),
    ),
    assigneeId: v.optional(v.id('users')),
    category: v.union(
      v.literal('access_revoke'),
      v.literal('equipment_return'),
      v.literal('knowledge_transfer'),
      v.literal('documentation'),
      v.literal('exit_interview'),
      v.literal('payroll'),
      v.literal('other'),
    ),
    status: v.union(v.literal('pending'), v.literal('completed'), v.literal('skipped')),
    completedBy: v.optional(v.id('users')),
    completedAt: v.optional(v.number()),
    order: v.number(),
  })
    .index('by_program', ['programId'])
    .index('by_assignee', ['assigneeId'])
    .index('by_org', ['organizationId']),

  // Exit interviews
  exitInterviews: defineTable({
    organizationId: v.id('organizations'),
    programId: v.id('offboardingPrograms'),
    employeeId: v.id('users'),
    conductedBy: v.id('users'),
    conductedAt: v.optional(v.number()),
    overallExperience: v.optional(v.number()),
    wouldRecommend: v.optional(v.boolean()),
    primaryReason: v.optional(v.string()),
    feedback: v.optional(v.string()),
    improvements: v.optional(v.string()),
    status: v.union(v.literal('scheduled'), v.literal('completed'), v.literal('skipped')),
    createdAt: v.number(),
  })
    .index('by_program', ['programId'])
    .index('by_org', ['organizationId']),
};
