'use client';

/**
 * The project's own task grid — ClickUp's "List" page.
 *
 * Same `TaskTable`, same statuses, same custom columns and same writes as the
 * board on `/tasks`, through the same `useTaskGrid` hook. The difference is
 * scope and permanence:
 *
 *   - **Scope.** `useTaskGrid` is given this project's id, so the columns and the
 *     saved views it reads are the project's — a client's board can carry an
 *     *Amount owed* column without every project in the organization growing one
 *     — and a task typed into the grid lands in this project by construction
 *     rather than by the person remembering to pick it.
 *   - **Permanence.** The board's view lives in the URL because a link to a board
 *     *is* the board. Here it is component state: the project page has one
 *     address, and a person arriving at it should see the project, not whatever
 *     grouping the last visitor left in the query string. Anything worth keeping
 *     is saved as a view, which is what the tabs above the grid are for.
 *
 * Recurring series are deliberately not rows. `getProject` returns them
 * alongside the tasks so the page can show that a series exists, but a series is
 * a recipe in `recurringTasks` — it has no task document to patch, so every cell
 * in the grid would be a write the server has to refuse. They are filtered out
 * here and the page shows them separately.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TaskTable } from '@/components/tasks/table/TaskTable';
import type { TaskTableRow } from '@/components/tasks/table/TaskRow';
import { AddFieldPopover } from '@/components/tasks/AddFieldPopover';
import { ColumnsMenu } from '@/components/tasks/ColumnsMenu';
import { FilterBuilder } from '@/components/tasks/FilterBuilder';
import { GroupBySelector } from '@/components/tasks/GroupBySelector';
import { ViewTabs } from '@/components/tasks/ViewTabs';
import { useTaskGrid } from '@/hooks/useTaskGrid';
import { useTaskViewPreferences } from '@/hooks/useTaskViewPreferences';
import { applyTaskFilters } from '@/lib/taskFilters';
import type { ContextTask } from '@/components/tasks/TaskContextMenu';
import {
  DEFAULT_TASK_VIEW,
  fromSavedView,
  isEffectiveCondition,
  sameTaskView,
  toSavedView,
  type TaskFilterCondition,
  type TaskSortField,
  type TaskViewState,
} from '@/lib/taskViewState';

/**
 * A row as the project page holds it.
 *
 * `type` is what `getProject` tags each entry with; everything else is the grid's
 * own row contract, satisfied by the task documents the query spreads.
 */
export interface ProjectGridTask extends TaskTableRow {
  type?: 'task' | 'recurring';
}

interface ProjectTaskGridProps {
  projectId: string;
  /** Everything `getProject` returned; recurring series are filtered out here. */
  tasks: readonly ProjectGridTask[];
  /** The viewer, so a row typed into the grid has an assignee. */
  viewerId?: string;
  /** Whether the viewer may write cells at all. The server checks per row too. */
  canEdit: boolean;
  /** Bulk actions and adding a column: staff only. */
  canManage: boolean;
  onOpenTask: (taskId: string, title: string) => void;
  /** Context menu callbacks — wired from the parent project page. */
  contextMenu?: {
    canManage: boolean;
    onEdit: (task: ContextTask) => void;
    onRename?: (task: ContextTask) => void;
    onSetStatus: (taskId: string, statusKey: string) => void;
    onSetPriority: (taskId: string, priority: string) => void;
    onDelete: (task: ContextTask) => void;
    onToggleActive?: (task: ContextTask) => void;
  };
}

/**
 * The project page opens grouped by status, which is the arrangement the grid was
 * designed around: the sections read as the pipeline the project is in.
 */
const PROJECT_DEFAULT_VIEW: TaskViewState = {
  ...DEFAULT_TASK_VIEW,
  view: 'table',
  group: 'status',
};

export function ProjectTaskGrid({
  projectId,
  tasks,
  viewerId,
  canEdit,
  canManage,
  onOpenTask,
  contextMenu,
}: ProjectTaskGridProps) {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<TaskViewState>(PROJECT_DEFAULT_VIEW);

  /**
   * Layout preferences are shared with the board on purpose.
   *
   * Row density and column widths are how *this* person reads a task grid, not a
   * property of the board they are reading — so a compact grid stays compact when
   * they walk from `/tasks` into a project. What is per-project is the
   * configuration (`useTaskGrid`) and the saved views, both of which come from
   * the server.
   */
  const { prefs, toggleTableColumn, setColumnWidth, setColumnOrder, reset } =
    useTaskViewPreferences();

  const {
    statuses,
    fields,
    fieldMap,
    savedViews,
    viewTabs,
    cellUsers,
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
  } = useTaskGrid({ projectId, ...(viewerId ? { viewerId } : {}), enabled: true }, tasks);

  /** Tasks only — see the note about recurring series in the header. */
  const rows = useMemo(() => tasks.filter((task) => task.type !== 'recurring'), [tasks]);

  /**
   * The filter builder narrows here rather than inside the grid, so the same
   * `applyTaskFilters` decides what a condition means on this page as on the
   * board. Sorting and grouping are the table's own, driven by `view`.
   */
  const visible = useMemo(
    () => applyTaskFilters(rows, view.filters, fieldMap),
    [rows, view.filters, fieldMap],
  );

  const activeConditions = useMemo(
    () => view.filters.filter(isEffectiveCondition).length,
    [view.filters],
  );

  const patch = useCallback(
    (change: Partial<TaskViewState>) => setView((prev) => ({ ...prev, ...change })),
    [],
  );

  const toggleSort = useCallback((field: TaskSortField) => {
    setView((prev) =>
      prev.sort === field
        ? { ...prev, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { ...prev, sort: field, dir: 'asc' },
    );
  }, []);

  const setFilters = useCallback((filters: TaskFilterCondition[]) => patch({ filters }), [patch]);

  // ── Saved views ────────────────────────────────────────────────────────────
  const activeSavedView = savedViews?.find((candidate) => candidate._id === view.viewId);
  const viewDirty =
    !!activeSavedView &&
    !sameTaskView(view, fromSavedView(activeSavedView.state, activeSavedView._id));

  const selectView = useCallback(
    (viewId: string) => {
      if (viewId === '') {
        patch({ viewId: '' });
        return;
      }
      const saved = savedViews?.find((candidate) => candidate._id === viewId);
      if (saved) setView(fromSavedView(saved.state, saved._id));
    },
    [savedViews, patch],
  );

  /**
   * The project's default view is what the page opens as.
   *
   * Once, on the first load that has the views — re-applying it afterwards would
   * undo the reader's own grouping every time the query refreshed.
   */
  const defaultApplied = useRef(false);
  useEffect(() => {
    if (defaultApplied.current || !savedViews) return;
    defaultApplied.current = true;
    const preset = savedViews.find((candidate) => candidate.isDefault);
    if (preset) setView(fromSavedView(preset.state, preset._id));
  }, [savedViews]);

  const handleCreateView = useCallback(
    (name: string, visibility: 'private' | 'team') => {
      void (async () => {
        const viewId = await createView({
          name,
          // Always a table here: this page has one grid and no view switcher, so
          // saving is about the filters and the grouping, not the mode.
          type: 'table',
          state: toSavedView(view),
          visibility,
        });
        if (viewId) patch({ viewId });
      })();
    },
    [createView, view, patch],
  );

  const handleUpdateView = useCallback(
    (viewId: string) => updateViewState(viewId, 'table', toSavedView(view)),
    [updateViewState, view],
  );

  const handleDeleteView = useCallback(
    (viewId: string) => {
      void (async () => {
        await removeView(viewId);
        setView((prev) => (prev.viewId === viewId ? { ...prev, viewId: '' } : prev));
      })();
    },
    [removeView],
  );

  return (
    <div className="rounded-xl border border-(--border) bg-(--card)">
      {/* ═══ Toolbar ═══ */}
      {/* Grouping, columns and filters — the three controls that change what the
          grid says without leaving the project. Saved views sit on the same row:
          on a project page they are the whole point of saving anything, since
          there is no URL to share instead. */}
      <div className="flex flex-wrap items-center gap-1 border-b border-(--border) px-2 py-1.5">
        <ViewTabs
          views={viewTabs}
          activeId={view.viewId}
          dirty={viewDirty}
          canShare={canManage}
          onSelect={selectView}
          onCreate={handleCreateView}
          onUpdate={handleUpdateView}
          onRename={renameView}
          onDelete={handleDeleteView}
          onSetDefault={setDefaultView}
        />
        <div className="ml-auto flex items-center gap-0.5">
          <GroupBySelector
            value={view.group}
            fields={fields}
            onChange={(group) => patch({ group })}
            // Every row here belongs to this project, so a "Project" grouping
            // would be one section with the project's own name on it.
            showProject={false}
          />
          <ColumnsMenu
            fields={fields}
            layout={prefs.table}
            onToggle={toggleTableColumn}
            onReorder={setColumnOrder}
            onReset={reset}
          />
          <FilterBuilder
            filters={view.filters}
            fields={fields}
            statuses={statuses}
            users={cellUsers}
            onChange={setFilters}
            activeCount={activeConditions}
          />
        </div>
      </div>

      {/* ═══ The grid ═══ */}
      {/* One scroll box for both axes, as on the board: a sticky header positions
          itself against its nearest scrolling ancestor, so a separate horizontal
          scroller would let the header scroll away vertically. */}
      <div className="max-h-[70vh] overflow-auto">
        <TaskTable
          tasks={visible}
          statuses={statuses}
          fields={fields}
          users={cellUsers}
          view={view}
          layout={prefs.table}
          density={prefs.density}
          canEdit={canEdit}
          lang={i18n.language}
          onOpenTask={(taskId) => {
            const task = rows.find((candidate) => candidate._id === taskId);
            onOpenTask(taskId, task?.title ?? '');
          }}
          onSetStatus={handleSetStatus}
          onPatchTask={handlePatchTask}
          onSetField={handleSetField}
          onSort={toggleSort}
          onResizeColumn={setColumnWidth}
          onReorderColumns={setColumnOrder}
          {...(canEdit ? { onAddTask: handleAddTask } : {})}
          {...(canManage ? { onBulkPatch: handleBulkPatch, onBulkDelete: handleBulkDelete } : {})}
          {...(canManage
            ? { addColumnSlot: <AddFieldPopover onSubmit={handleCreateField} /> }
            : {})}
          contextMenu={contextMenu}
          emptyState={
            <div className="py-14 text-center">
              <p className="mb-2 text-3xl">📋</p>
              <p className="font-medium text-(--text-secondary)">
                {activeConditions > 0
                  ? t('tasksClient.noTasksFound', 'No tasks found')
                  : t('projects.noTasks', 'No tasks yet')}
              </p>
            </div>
          }
        />
      </div>
    </div>
  );
}
