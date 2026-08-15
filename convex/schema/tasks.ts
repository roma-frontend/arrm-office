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
    /**
     * Set on tasks a recurring series produced, so an occurrence can be traced
     * back to the rule that created it (and the series can show its history).
     * A person editing or completing the occurrence never touches the series.
     */
    recurringTaskId: v.optional(v.id('recurringTasks')),
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
    .index('by_project', ['projectId'])
    .index('by_recurring', ['recurringTaskId']),

  /**
   * A rule that keeps producing tasks: "every Monday", "the 1st of each month".
   *
   * Kept out of the `tasks` table on purpose. A rule is not a task — it has no
   * status, nobody completes it, and it must never appear on the board. Storing
   * it alongside real tasks would mean every list query, filter and Kanban
   * bucket had to remember to exclude it, and the one that forgot would leak a
   * template into somebody's workload.
   *
   * Occurrences are materialized into `tasks` by an hourly cron
   * (`internal.recurringTasks.generateDueRecurringTasks`), idempotent per day via
   * `lastGeneratedKey` — the same shape `newsSchedule` uses.
   */
  recurringTasks: defineTable({
    organizationId: v.id('organizations'),

    // ── The task to produce ──
    title: v.string(),
    description: v.optional(v.string()),
    assignedTo: v.id('users'),
    /** Who set the series up; becomes `assignedBy` on every occurrence. */
    assignedBy: v.id('users'),
    priority: v.union(
      v.literal('low'),
      v.literal('medium'),
      v.literal('high'),
      v.literal('urgent'),
    ),
    tags: v.optional(v.array(v.string())),
    projectId: v.optional(v.id('projects')),
    objectiveId: v.optional(v.id('objectives')),
    keyResultId: v.optional(v.id('keyResults')),
    /**
     * Files attached to the rule. Copied into every occurrence at
     * materialization time, so the same briefing travels with the work.
     */
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

    // ── The rule ──
    frequency: v.union(v.literal('weekly'), v.literal('monthly')),
    /** Weekly: 0 = Sunday … 6 = Saturday. */
    daysOfWeek: v.optional(v.array(v.number())),
    /** Monthly: 1–31, clamped to the length of each month. */
    dayOfMonth: v.optional(v.number()),
    /** `yyyy-MM-dd` in the organization's timezone, inclusive. */
    startDate: v.string(),
    /** `yyyy-MM-dd`, inclusive. Absent means it runs until switched off. */
    endDate: v.optional(v.string()),
    /**
     * How long the assignee gets. 0 (or absent) means the occurrence is due the
     * day it appears; 6 on a weekly series means "due by the end of the week".
     */
    deadlineOffsetDays: v.optional(v.number()),

    isActive: v.boolean(),
    /** `yyyy-MM-dd` of the occurrence last materialized — the double-run guard. */
    lastGeneratedKey: v.optional(v.string()),
    /** Running total, so the series can report what it has produced. */
    generatedCount: v.optional(v.number()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_active', ['isActive'])
    .index('by_org_active', ['organizationId', 'isActive'])
    .index('by_assigned_to', ['assignedTo']),

  taskComments: defineTable({
    taskId: v.id('tasks'),
    authorId: v.id('users'),
    content: v.string(),
    createdAt: v.number(),
  }).index('by_task', ['taskId']),

  /** Discussion on a recurring rule — same shape as `taskComments`. */
  recurringTaskComments: defineTable({
    seriesId: v.id('recurringTasks'),
    authorId: v.id('users'),
    content: v.string(),
    createdAt: v.number(),
  }).index('by_series', ['seriesId']),
};
