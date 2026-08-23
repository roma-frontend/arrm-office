import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { taskStatusDefValidator } from '../lib/taskStatus';
import {
  fieldConfigValidator,
  fieldOptionValidator,
  fieldTypeValidator,
} from '../lib/taskCustomFields';

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
    /**
     * The organization's own status, e.g. `ready_to_pay`.
     *
     * `status` above stays the canonical one and is *never* widened: 276 places
     * in this repository compare it against those five literals. A custom status
     * declares a type (`todo|active|review|done|closed`) that maps onto one of
     * them, so a mutation writing `statusKey` writes the matching `status` in the
     * same patch — see `canonicalFor` in `lib/taskStatus.ts`.
     *
     * Absent on every row written before custom statuses existed, which needs no
     * migration: the default set's keys *are* the canonical values, so
     * `statusKey ?? status` names a real status either way.
     */
    statusKey: v.optional(v.string()),
    priority: v.union(
      v.literal('low'),
      v.literal('medium'),
      v.literal('high'),
      v.literal('urgent'),
    ),
    /**
     * Co-assignees, in addition to `assignedTo`.
     *
     * `assignedTo` remains the single responsible person and is what
     * `getVisibleTasks`, the reporting-line checks, notifications and every
     * workload report read. This array is additive: it never contains the primary
     * assignee, and nothing outside the task surfaces has to know it exists.
     */
    assigneeIds: v.optional(v.array(v.id('users'))),
    /** People who asked to hear about this task without owning any of it. */
    watcherIds: v.optional(v.array(v.id('users'))),
    /**
     * Parent for a subtask. One level only — a subtask cannot itself have
     * children, which is enforced in `createSubtask` rather than here.
     *
     * A subtask is a real row in this table, so it keeps its own assignee,
     * deadline and status, and every existing query already counts it. That is
     * deliberate: the alternative (a nested array on the parent) would have made
     * subtasks invisible to the dashboard and to search.
     */
    parentTaskId: v.optional(v.id('tasks')),
    /**
     * Values for the organization's custom fields, keyed by `taskFields` id.
     *
     * `v.any()` because the shape is per-organization and cannot be expressed in
     * a shared schema. The type discipline lives one layer up:
     * `validateFieldValue` in `lib/taskCustomFields.ts` is the only sanctioned
     * way to write a key here, and it normalizes as well as validates.
     */
    customFields: v.optional(v.any()),
    /**
     * Manual position within a group, as a fractional index ("a0", "a0V", "a1").
     *
     * A string rather than a number so inserting between two neighbours needs one
     * patch instead of renumbering the rows below it — the difference between a
     * drag costing 1 write and costing 500.
     */
    orderKey: v.optional(v.string()),
    /** When work is meant to begin; `deadline` is when it must end. */
    startDate: v.optional(v.number()),
    timeEstimateMinutes: v.optional(v.number()),
    /**
     * Roll-up of this task's `taskTimeEntries`, recomputed when an entry is
     * closed or edited. Denormalized so a board of 500 rows can show time spent
     * without 500 extra reads.
     */
    timeSpentMinutes: v.optional(v.number()),
    /**
     * Archived-but-kept. Distinct from `cancelled`, which is a status somebody
     * chose and which reports still count; an archived task is simply out of
     * sight. Task surfaces filter it out, and existing consumers that never look
     * at this field keep behaving exactly as before.
     */
    archivedAt: v.optional(v.number()),
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
    .index('by_recurring', ['recurringTaskId'])
    .index('by_parent', ['parentTaskId'])
    /** Manual ordering within a project, read straight in `orderKey` order. */
    .index('by_project_order', ['projectId', 'orderKey']),

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
     * ── The recipe has to know about every field a task can carry ──
     *
     * A series is a template, and a template that only knows about the fields
     * that existed when it was written produces a *different* task from the one
     * the author set up. If a team makes "Confidence Level" required and puts its
     * weekly reconciliation on a recurring rule, the occurrence has to arrive
     * with that field filled in — otherwise every Monday somebody gets a task
     * that fails its own project's validation.
     *
     * So each of these mirrors a field on `tasks` and is copied verbatim at
     * materialization time. Anything added to `tasks` that a person can set on
     * creation belongs here too.
     */
    statusKey: v.optional(v.string()),
    assigneeIds: v.optional(v.array(v.id('users'))),
    customFields: v.optional(v.any()),
    timeEstimateMinutes: v.optional(v.number()),
    /**
     * Days from the occurrence's own date to its `startDate`.
     *
     * Note the collision worth being careful about: `startDate` on *this* table is
     * a `yyyy-MM-dd` string meaning "when the rule begins", while `startDate` on
     * `tasks` is a timestamp meaning "when this piece of work begins". They are
     * unrelated, which is why the per-occurrence value is an offset with a
     * different name — the same shape `deadlineOffsetDays` already uses.
     */
    startOffsetDays: v.optional(v.number()),
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
    /**
     * Board status — same union as `tasks.status` so recurring tasks appear on
     * the kanban alongside regular ones. Defaults to 'in_progress' when absent.
     */
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('in_progress'),
        v.literal('review'),
        v.literal('completed'),
        v.literal('cancelled'),
      ),
    ),
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

  // ─── Board customization ────────────────────────────────────────────────
  /**
   * A named set of statuses, e.g. *Unpaid → Ready to pay → Paid*.
   *
   * A set, not a flat list of statuses, because the same three columns are wanted
   * on every accounts-payable project and nobody wants to retype them. An
   * organization keeps one set marked `isDefault` and a project may point at
   * another; a project that points at none inherits the default, and an
   * organization with no sets at all falls back to `DEFAULT_STATUS_SET` in code —
   * so this table being empty is a valid, working state, not a bootstrap problem.
   */
  taskStatusSets: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    /** Exactly one per organization; `setDefaultStatusSet` clears the previous. */
    isDefault: v.boolean(),
    statuses: v.array(taskStatusDefValidator),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_default', ['organizationId', 'isDefault']),

  /**
   * A column an organization invented: *Contact*, *Amount owed*, *Category*.
   *
   * `projectId` is the scope. Absent means the field is offered on every board in
   * the organization; set means it belongs to that project alone. Two scopes
   * rather than one because a *Category* worth defining is usually worth reusing,
   * while *Confidence Level* on the payables board would be noise everywhere
   * else.
   *
   * Values live in `tasks.customFields`, keyed by this row's id — so renaming a
   * field or recolouring an option never touches a task.
   */
  taskFields: defineTable({
    organizationId: v.id('organizations'),
    projectId: v.optional(v.id('projects')),
    /** What people see. Whatever the user typed, never translated. */
    name: v.string(),
    /** Slug derived from `name`, for CSV headers and formula-style references. */
    key: v.string(),
    type: fieldTypeValidator,
    /** `select` / `multiSelect` only; validated to be non-empty for those. */
    options: v.optional(v.array(fieldOptionValidator)),
    config: v.optional(fieldConfigValidator),
    /** A task cannot be saved with this cell empty. */
    required: v.optional(v.boolean()),
    order: v.number(),
    /** Organization-wide default width; a per-device override lives in localStorage. */
    width: v.optional(v.number()),
    /**
     * Archived fields stay here rather than being deleted, because the values
     * on existing tasks are somebody's data. Hiding the column is reversible;
     * dropping the field would silently orphan every value keyed to it.
     */
    isActive: v.boolean(),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_project', ['organizationId', 'projectId'])
    .index('by_project', ['projectId']),

  /**
   * A saved view — the *Payable Outstanding* tab, as opposed to plain *List*.
   *
   * Named views are what turn filters into a shared vocabulary: "check Payable
   * Outstanding" instead of "filter by unpaid, sort by due date, group by
   * status". The board already encodes its whole state in the URL
   * (`src/lib/taskViewState.ts`), so a view is little more than that state given
   * a name.
   */
  taskViews: defineTable({
    organizationId: v.id('organizations'),
    /** Absent for a view on the all-tasks board; set for a project's own tabs. */
    projectId: v.optional(v.id('projects')),
    name: v.string(),
    /** A lucide icon name, chosen from a bounded list in the view editor. */
    icon: v.optional(v.string()),
    type: v.union(
      v.literal('list'),
      v.literal('board'),
      v.literal('table'),
      v.literal('calendar'),
      v.literal('timeline'),
    ),
    /**
     * The serialized `TaskViewState` plus column layout.
     *
     * `v.any()` rather than a mirrored object validator on purpose. The client
     * owns this shape and will keep extending it, and `decodeTaskView` is written
     * never to throw — an unknown key is ignored and a missing one falls back to
     * its default. A strict validator here would mean a schema migration every
     * time a filter gains an operator, and would reject a view saved by a browser
     * tab running yesterday's bundle.
     */
    state: v.any(),
    /** `private` is visible to `ownerId` alone; `team` to the organization. */
    visibility: v.union(v.literal('private'), v.literal('team')),
    ownerId: v.id('users'),
    /** The tab that opens first, per project (or per board when unscoped). */
    isDefault: v.boolean(),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_project', ['organizationId', 'projectId'])
    .index('by_owner', ['ownerId']),

  // ─── Task depth ─────────────────────────────────────────────────────────
  /**
   * "This cannot start until that is done."
   *
   * One row per edge, with both directions indexed: a task's detail panel needs
   * what it blocks *and* what blocks it, and a single `by_task` index would make
   * the second question a full scan. `addDependency` walks the graph to refuse a
   * cycle before inserting.
   */
  taskDependencies: defineTable({
    organizationId: v.id('organizations'),
    taskId: v.id('tasks'),
    dependsOnTaskId: v.id('tasks'),
    /** `blocks`: this task blocks the other. `waiting_on`: it waits for the other. */
    type: v.union(v.literal('blocks'), v.literal('waiting_on')),
    createdBy: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_task', ['taskId'])
    .index('by_depends_on', ['dependsOnTaskId'])
    .index('by_org', ['organizationId']),

  /**
   * A checklist inside one task — the small steps that are not worth a subtask.
   *
   * The distinction from a subtask is real and worth keeping: a subtask is a task
   * (it has a status, a deadline, it shows up in workload reports), while a
   * checklist item is a tick box that exists only inside its parent. Conflating
   * them is how a to-do list ends up in somebody's performance review.
   */
  taskChecklistItems: defineTable({
    taskId: v.id('tasks'),
    organizationId: v.id('organizations'),
    title: v.string(),
    isDone: v.boolean(),
    order: v.number(),
    assignedTo: v.optional(v.id('users')),
    doneAt: v.optional(v.number()),
    doneBy: v.optional(v.id('users')),
    createdBy: v.id('users'),
    createdAt: v.number(),
  }).index('by_task', ['taskId']),

  /**
   * Time on a task, whether from the running timer or typed in afterwards.
   *
   * Entries are the record; `tasks.timeSpentMinutes` is a cache of their sum.
   * Kept as rows rather than a single accumulating number because "who spent the
   * time, and when" is the question that actually gets asked, and because an
   * accumulator cannot be corrected without losing the correction.
   */
  taskTimeEntries: defineTable({
    taskId: v.id('tasks'),
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    startedAt: v.number(),
    /** Absent while a timer is still running. */
    endedAt: v.optional(v.number()),
    durationMinutes: v.number(),
    note: v.optional(v.string()),
    source: v.union(v.literal('timer'), v.literal('manual')),
    createdAt: v.number(),
  })
    .index('by_task', ['taskId'])
    .index('by_user', ['userId'])
    .index('by_org_user', ['organizationId', 'userId'])
    /**
     * Finds the user's running timer directly: `eq('userId', u).eq('endedAt',
     * undefined)`. Convex sorts a missing field before every value, so the open
     * entries are one exact-match lookup rather than a scan-and-filter over the
     * user's whole history.
     */
    .index('by_user_open', ['userId', 'endedAt']),
};
