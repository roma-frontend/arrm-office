import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { taskColorValidator } from '../lib/taskStatus';

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
    /**
     * ── A project is this product's ClickUp List ──
     *
     * Which is to say: the unit that owns its own columns, its own statuses and
     * its own saved tabs. That is why these four live here rather than on a new
     * "list" table — the concept already existed, and giving it the missing
     * properties beats introducing a second container that means the same thing.
     */
    /** Overrides the organization's default status set for this project's tasks. */
    statusSetId: v.optional(v.id('taskStatusSets')),
    /** The tab that opens when somebody lands on the project. */
    defaultViewId: v.optional(v.id('taskViews')),
    /** From the bounded label palette, so a project chip works in both themes. */
    color: v.optional(taskColorValidator),
    /** A lucide icon name, chosen from a bounded list in the project editor. */
    icon: v.optional(v.string()),
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
