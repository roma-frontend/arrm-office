import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const tasks = {
  tasks: defineTable({
    organizationId: v.optional(v.id('organizations')),
    projectId: v.optional(v.id('projects')),
    title: v.string(),
    /**
     * Translation key for tasks the system generated itself.
     *
     * Onboarding mirrors each of its steps into this table, and the text was
     * written in English at creation time — so a Russian board showed
     * "[Onboarding] Prepare workplace and access badge" among its translated
     * columns. The key travels with the row and the reader's language is applied
     * on display; `title` stays as the fallback for rows that predate it and for
     * anything a person typed themselves.
     */
    titleKey: v.optional(v.string()),
    description: v.optional(v.string()),
    assignedTo: v.id('users'),
    assignedBy: v.id('users'),
    status: v.union(
      v.literal('pending'),
      v.literal('in_progress'),
      v.literal('review'),
      v.literal('completed'),
      v.literal('cancelled'),
    ),
    priority: v.union(
      v.literal('low'),
      v.literal('medium'),
      v.literal('high'),
      v.literal('urgent'),
    ),
    deadline: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    attachmentUrl: v.optional(v.string()),
    attachments: v.optional(
      v.array(
        v.object({
          url: v.string(),
          name: v.string(),
          type: v.string(),
          size: v.number(),
          uploadedBy: v.id('users'),
          uploadedAt: v.number(),
        }),
      ),
    ),
    // Goals ↔ Tasks linkage
    objectiveId: v.optional(v.id('objectives')),
    keyResultId: v.optional(v.id('keyResults')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_assigned_to', ['assignedTo'])
    .index('by_assigned_by', ['assignedBy'])
    .index('by_status', ['status'])
    .index('by_deadline', ['deadline'])
    .index('by_assigned_status', ['assignedTo', 'status'])
    .index('by_org_deadline', ['organizationId', 'deadline'])
    .index('by_objective', ['objectiveId'])
    .index('by_key_result', ['keyResultId'])
    .index('by_project', ['projectId']),

  taskComments: defineTable({
    taskId: v.id('tasks'),
    authorId: v.id('users'),
    content: v.string(),
    createdAt: v.number(),
  }).index('by_task', ['taskId']),
};
