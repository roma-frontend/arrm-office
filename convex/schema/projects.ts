import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const projects = {
  projects: defineTable({
    organizationId: v.optional(v.id('organizations')),
    name: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal('planning'),
      v.literal('active'),
      v.literal('on_hold'),
      v.literal('completed'),
      v.literal('cancelled'),
    ),
    priority: v.union(
      v.literal('low'),
      v.literal('medium'),
      v.literal('high'),
      v.literal('urgent'),
    ),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    deadline: v.optional(v.number()),
    createdBy: v.id('users'),
    ownerId: v.optional(v.id('users')),
    // Members who can see and work on this project
    memberIds: v.array(v.id('users')),
    // Tags for categorization
    tags: v.optional(v.array(v.string())),
    templateId: v.optional(v.id('projectTemplates')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_owner', ['ownerId'])
    .index('by_status', ['status'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_org_created', ['organizationId', 'createdAt']),

  projectTemplates: defineTable({
    organizationId: v.optional(v.id('organizations')),
    name: v.string(),
    description: v.optional(v.string()),
    // Default tasks to create when project is created from template
    defaultTasks: v.array(
      v.object({
        title: v.string(),
        description: v.optional(v.string()),
        priority: v.union(
          v.literal('low'),
          v.literal('medium'),
          v.literal('high'),
          v.literal('urgent'),
        ),
        estimatedDays: v.optional(v.number()),
      }),
    ),
    tags: v.optional(v.array(v.string())),
    isPublic: v.boolean(),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_public', ['isPublic']),
};
