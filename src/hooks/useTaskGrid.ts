'use client';

/**
 * Everything the ClickUp-style grid needs from the server, in one hook.
 *
 * The board (`TasksClient`) and a project page (`ProjectTaskGrid`) draw the same
 * `TaskTable` against the same statuses, the same custom fields and the same
 * mutations — they differ only in which tasks they hold and in where the view
 * state lives. Wiring that twice is how the two pages start disagreeing about
 * what a cell edit does, so the wiring lives here and each page keeps only its
 * own view state.
 *
 * What is deliberately *not* here: the view state itself. On the board it is the
 * URL (so a link is a board), on a project page it is component state (so the
 * project's own default view opens). Those are different enough that sharing them
 * would mean a hook with two modes and a flag, which is worse than two callers.
 */

import { useCallback, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { DEFAULT_STATUS_SET, type TaskStatusDef } from '../../convex/lib/taskStatus';
import type { SavedTaskViewState } from '@/lib/taskViewState';
import type { TaskFieldLike, TaskFieldValue, TaskGridField } from '@/lib/taskFieldTypes';
import type { TaskCellUser } from '@/components/tasks/table/cells/cellChrome';
import type { TaskRowPatch, TaskSeed } from '@/components/tasks/table/TaskTable';
import type { BulkPatch } from '@/components/tasks/BulkActionBar';
import type { FieldDraft } from '@/components/tasks/AddFieldPopover';
import type { SavedViewTab } from '@/components/tasks/ViewTabs';

/** The little a source task has to carry for the derived pickers below. */
export interface GridSourceTask {
  _id?: string;
  projectId?: string;
  projectName?: string | null;
  assignedToUser?: { _id?: string; name?: string; avatarUrl?: string | null } | null;
  /** "recurring" when the row is a series (not a materialised task). */
  _type?: string;
}

export interface TaskGridScope {
  /**
   * Optional: the queries below resolve the caller's own organization when it is
   * absent, so an impersonating or org-switched page passes it and an ordinary
   * one does not have to.
   */
  organizationId?: string;
  /** Set on a project page: fields, statuses and views are then the project's. */
  projectId?: string;
  /** The viewer, used as the assignee for a row typed straight into the grid. */
  viewerId?: string;
  /** Hold the queries until the page knows who is asking. Defaults to the viewer. */
  enabled?: boolean;
}

export function useTaskGrid(scope: TaskGridScope, tasks: readonly GridSourceTask[] | undefined) {
  const { t } = useTranslation();
  const { organizationId, projectId, viewerId } = scope;

  /**
   * Three queries that describe the board rather than its contents: the status
   * set it uses, the columns it has, and the views saved on it.
   *
   * Kept out of the task query on purpose. They change on a different clock — a
   * column is added once a quarter, a task changes every minute — so folding them
   * in would re-send the whole board's configuration with every status change,
   * and Convex would have no way to tell that only the tasks moved.
   */
  const gridScope = useMemo(
    () => ({
      ...(organizationId ? { organizationId: organizationId as Id<'organizations'> } : {}),
      ...(projectId ? { projectId: projectId as Id<'projects'> } : {}),
    }),
    [organizationId, projectId],
  );
  /**
   * Gated on the viewer rather than on the organization: every one of these
   * queries resolves the caller's own scope when no `organizationId` is passed,
   * so waiting for one would leave an ordinary member's board on the fallback
   * statuses with no columns at all.
   */
  const ready = scope.enabled ?? !!viewerId;

  const statusSet = useQuery(api.taskStatuses.resolveForProject, ready ? gridScope : 'skip');
  const fieldDefs = useQuery(api.taskFields.listFields, ready ? gridScope : 'skip');
  const savedViews = useQuery(api.taskViews.listViews, ready ? gridScope : 'skip');

  /**
   * The board's statuses, with the built-in five as the fallback.
   *
   * The fallback is not just for the moment before the query lands: an
   * organization that has never opened the status editor has no set at all, and
   * `DEFAULT_STATUS_SET` is exactly what its tasks already carry.
   */
  const statuses: readonly TaskStatusDef[] = statusSet?.statuses ?? DEFAULT_STATUS_SET;
  const fields = useMemo<readonly TaskGridField[]>(() => fieldDefs ?? [], [fieldDefs]);
  /** Custom fields by id, for the filter and sort comparators. */
  const fieldMap = useMemo(
    () => new Map<string, TaskFieldLike>(fields.map((field) => [field._id as string, field])),
    [fields],
  );

  const viewTabs = useMemo<SavedViewTab[]>(
    () =>
      (savedViews ?? []).map((view) => ({
        _id: view._id,
        name: view.name,
        type: view.type,
        visibility: view.visibility,
        isDefault: view.isDefault,
        canEdit: view.canEdit,
      })),
    [savedViews],
  );

  /**
   * Assignee candidates for the grid's people cells, keyed as the cells expect.
   *
   * Derived from the tasks rather than from an employee query because the list of
   * colleagues is only readable by managers, and an employee editing their own
   * board still needs to see the names already on it.
   */
  const cellUsers = useMemo<TaskCellUser[]>(() => {
    const map = new Map<string, TaskCellUser>();
    for (const task of tasks ?? []) {
      const user = task.assignedToUser;
      if (!user?._id || map.has(user._id)) continue;
      map.set(user._id, {
        _id: user._id,
        name: user.name || '?',
        avatarUrl: user.avatarUrl ?? undefined,
      });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  /** Projects present on the board, for the filter builder's value list. */
  const filterProjects = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks ?? []) {
      if (task.projectId && task.projectName) map.set(task.projectId, task.projectName);
    }
    return [...map.entries()]
      .map(([_id, name]) => ({ _id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const projectNameOf = useCallback(
    (id: string) => tasks?.find((task) => task.projectId === id)?.projectName ?? undefined,
    [tasks],
  );

  // ── Writes ─────────────────────────────────────────────────────────────────
  const setTaskStatusFor = useMutation(api.tasks.setTaskStatus);
  const writeTaskFields = useMutation(api.tasks.updateTaskFields);
  const patchTasks = useMutation(api.tasks.bulkUpdateTasks);
  const removeTasks = useMutation(api.tasks.bulkDeleteTasks);
  const addField = useMutation(api.taskFields.createField);
  const addTask = useMutation(api.tasks.createTask);
  const storeView = useMutation(api.taskViews.saveView);
  const changeView = useMutation(api.taskViews.updateView);
  const dropView = useMutation(api.taskViews.deleteView);
  const makeViewDefault = useMutation(api.taskViews.setDefaultView);

  /**
   * One place where a failed grid write becomes a message.
   *
   * Every cell in the table is a mutation, and a cell that silently refuses to
   * change looks like a bug in the grid rather than a permission boundary. The
   * server's `ConvexError` messages are written to be read by the person who hit
   * them, so they are shown as-is.
   */
  const runWrite = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
      } catch (error) {
        const message =
          typeof (error as { data?: unknown })?.data === 'string'
            ? (error as { data: string }).data
            : error instanceof Error
              ? error.message
              : t('common.error', 'Something went wrong');
        toast.error(message);
      }
    },
    [t],
  );

  /** Bulk writes skip rows the caller may not touch; saying so beats silence. */
  const reportSkipped = useCallback(
    (skipped: number) => {
      if (skipped > 0) {
        toast.error(
          t('tasksTable.someSkipped', {
            count: skipped,
            defaultValue: '{{count}} task(s) were left unchanged — you cannot edit them',
          }),
        );
      }
    },
    [t],
  );

  const handleSetStatus = useCallback(
    (taskId: string, statusKey: string) => {
      // Recurring series IDs come from the `recurringTasks` table and cannot
      // be passed to `v.id('tasks')` validators on `setTaskStatus`.
      const isRecurring = (tasks ?? []).some(
        (t) => t._type === 'recurring' && t._id === taskId,
      );
      if (isRecurring) {
        void runWrite(() =>
          updateRecurringTaskStatus({
            seriesId: taskId as Id<'recurringTasks'>,
            status: statusKey as 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled',
          }),
        );
      } else {
        void runWrite(() => setTaskStatusFor({ taskId: taskId as Id<'tasks'>, statusKey }));
      }
    },
    [runWrite, setTaskStatusFor, updateRecurringTaskStatus, tasks],
  );

  /**
   * A single row's built-in columns.
   *
   * Routed through `bulkUpdateTasks` with one id rather than `updateTask`: that
   * mutation is admin/supervisor-only and cannot set an assignee at all, so a
   * cell edit by the person the task belongs to would be refused for no reason a
   * user could see.
   */
  const handlePatchTask = useCallback(
    (taskId: string, patch: TaskRowPatch) => {
      void runWrite(async () => {
        const result = await patchTasks({
          taskIds: [taskId as Id<'tasks'>],
          patch: {
            ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
            ...(patch.deadline !== undefined ? { deadline: patch.deadline } : {}),
            ...(patch.assignedTo !== undefined
              ? { assignedTo: patch.assignedTo as Id<'users'> }
              : {}),
          },
        });
        reportSkipped(result.skipped);
      });
    },
    [runWrite, patchTasks, reportSkipped],
  );

  const handleSetField = useCallback(
    (taskId: string, fieldId: string, value: TaskFieldValue | null) => {
      void runWrite(() =>
        writeTaskFields({ taskId: taskId as Id<'tasks'>, values: { [fieldId]: value } }),
      );
    },
    [runWrite, writeTaskFields],
  );

  /**
   * Inline creation, seeded by the section it was typed into.
   *
   * `createTask` predates custom statuses and columns and is called from the
   * wizard, onboarding and recurring materialisation; widening its signature for
   * a convenience only this grid needs would touch all of them. So the seed is
   * applied as two follow-up writes on the id it returns.
   */
  const handleAddTask = useCallback(
    async (title: string, seed: TaskSeed) => {
      const assignee = seed.assignedTo ?? viewerId;
      if (!assignee) return;
      await runWrite(async () => {
        const taskId = await addTask({
          title,
          assignedTo: assignee as Id<'users'>,
          priority: seed.priority ?? 'medium',
          // The seed wins so a row typed into a section lands in it; the scope's
          // project is the fallback, which is what a project page wants.
          ...((seed.projectId ?? projectId)
            ? { projectId: (seed.projectId ?? projectId) as Id<'projects'> }
            : {}),
        });
        if (seed.statusKey) await setTaskStatusFor({ taskId, statusKey: seed.statusKey });
        if (seed.fieldValues && Object.keys(seed.fieldValues).length > 0) {
          await writeTaskFields({ taskId, values: seed.fieldValues });
        }
      });
    },
    [viewerId, projectId, runWrite, addTask, setTaskStatusFor, writeTaskFields],
  );

  // Recurring task mutations for bulk operations
  const deleteRecurringTask = useMutation(api.recurringTasks.deleteRecurringTask);
  const updateRecurringTaskStatus = useMutation(api.recurringTasks.updateRecurringTaskStatus);
  const updateRecurringTask = useMutation(api.recurringTasks.updateRecurringTask);

  /**
   * Separate IDs into regular tasks and recurring series so we can call
   * the correct mutation for each. Recurring IDs come from the
   * `recurringTasks` table and cannot be passed to `v.id('tasks')` validators.
   */
  const partitionIds = useCallback(
    (taskIds: string[]): { regular: Id<'tasks'>[]; recurring: string[] } => {
      const recurringIds = new Set(
        (tasks ?? []).filter((t) => t._type === 'recurring').map((t) => t._id),
      );
      const regular: Id<'tasks'>[] = [];
      const recurring: string[] = [];
      for (const id of taskIds) {
        if (recurringIds.has(id)) {
          recurring.push(id);
        } else {
          regular.push(id as Id<'tasks'>);
        }
      }
      return { regular, recurring };
    },
    [tasks],
  );

  const handleBulkPatch = useCallback(
    (taskIds: string[], patch: BulkPatch) => {
      void runWrite(async () => {
        const { regular, recurring } = partitionIds(taskIds);

        // Regular tasks — bulk mutation
        if (regular.length > 0) {
          const result = await patchTasks({
            taskIds: regular,
            patch: {
              ...(patch.statusKey ? { statusKey: patch.statusKey } : {}),
              ...(patch.priority ? { priority: patch.priority } : {}),
              ...(patch.assignedTo ? { assignedTo: patch.assignedTo as Id<'users'> } : {}),
            },
          });
          reportSkipped(result.skipped);
        }

        // Recurring series — update one by one
        for (const seriesId of recurring) {
          const rid = seriesId as Id<'recurringTasks'>;
          if (patch.statusKey) {
            await updateRecurringTaskStatus({
              seriesId: rid,
              status: patch.statusKey as
                | 'pending'
                | 'in_progress'
                | 'review'
                | 'completed'
                | 'cancelled',
            });
          }
          // Priority and assignee are handled via updateRecurringTask
          const fields: Record<string, unknown> = {};
          if (patch.priority) fields.priority = patch.priority;
          if (patch.assignedTo) fields.assignedTo = patch.assignedTo as Id<'users'>;
          if (Object.keys(fields).length > 0) {
            await updateRecurringTask({
              seriesId: rid,
              ...fields,
            } as Parameters<typeof updateRecurringTask>[0]);
          }
        }
      });
    },
    [
      runWrite,
      patchTasks,
      reportSkipped,
      partitionIds,
      updateRecurringTask,
      updateRecurringTaskStatus,
    ],
  );

  const handleBulkDelete = useCallback(
    (taskIds: string[]) => {
      void runWrite(async () => {
        const { regular, recurring } = partitionIds(taskIds);

        // Regular tasks — bulk mutation
        if (regular.length > 0) {
          const result = await removeTasks({ taskIds: regular });
          reportSkipped(result.skipped);
        }

        // Recurring series — delete one by one
        for (const seriesId of recurring) {
          await deleteRecurringTask({
            seriesId: seriesId as Id<'recurringTasks'>,
          });
        }
      });
    },
    [runWrite, removeTasks, reportSkipped, partitionIds, deleteRecurringTask],
  );

  /**
   * A new column.
   *
   * Created against the scope it was added from: a column added on a project page
   * belongs to that project, one added on the board belongs to the organization.
   * That is the difference between "this client wants a Confidence Level" and
   * "every board here tracks Confidence Level".
   */
  const handleCreateField = useCallback(
    (draft: FieldDraft) => {
      void runWrite(() =>
        addField({
          name: draft.name,
          type: draft.type,
          ...(draft.options ? { options: draft.options } : {}),
          ...(draft.config ? { config: draft.config } : {}),
          ...(draft.required ? { required: draft.required } : {}),
          ...gridScope,
        }),
      );
    },
    [runWrite, addField, gridScope],
  );

  // ── Saved views ────────────────────────────────────────────────────────────
  /** Resolves to the id of the created view, so the caller can select it. */
  const createView = useCallback(
    async (args: {
      name: string;
      type: string;
      state: SavedTaskViewState;
      visibility: 'private' | 'team';
    }): Promise<string | undefined> => {
      let created: string | undefined;
      await runWrite(async () => {
        created = await storeView({
          name: args.name,
          type: args.type as 'list' | 'board' | 'table' | 'calendar' | 'timeline',
          state: args.state,
          visibility: args.visibility,
          ...gridScope,
        });
      });
      return created;
    },
    [runWrite, storeView, gridScope],
  );

  const updateViewState = useCallback(
    (viewId: string, type: string, state: SavedTaskViewState) => {
      void runWrite(() =>
        changeView({
          viewId: viewId as Id<'taskViews'>,
          type: type as 'list' | 'board' | 'table' | 'calendar' | 'timeline',
          state,
        }),
      );
    },
    [runWrite, changeView],
  );

  const renameView = useCallback(
    (viewId: string, name: string) => {
      void runWrite(() => changeView({ viewId: viewId as Id<'taskViews'>, name }));
    },
    [runWrite, changeView],
  );

  /** Resolves once the view is gone, so the caller can drop it from its state. */
  const removeView = useCallback(
    async (viewId: string) => {
      await runWrite(() => dropView({ viewId: viewId as Id<'taskViews'> }));
    },
    [runWrite, dropView],
  );

  const setDefaultView = useCallback(
    (viewId: string) => {
      void runWrite(() => makeViewDefault({ viewId: viewId as Id<'taskViews'> }));
    },
    [runWrite, makeViewDefault],
  );

  return {
    /** `undefined` until the configuration lands; the statuses fall back regardless. */
    savedViews,
    statuses,
    fields,
    fieldMap,
    viewTabs,
    cellUsers,
    filterProjects,
    projectNameOf,
    runWrite,
    handleSetStatus,
    handlePatchTask,
    handleSetField,
    handleAddTask,
    handleBulkPatch,
    handleBulkDelete,
    handleCreateField,
    createView,
    updateViewState,
    renameView,
    removeView,
    setDefaultView,
  };
}
