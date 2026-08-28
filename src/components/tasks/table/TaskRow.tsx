'use client';

/**
 * One row of the task grid.
 *
 * Split from `TaskTable.tsx` so the table file is about arrangement — columns,
 * sections, selection — and this one is about a single task. It is deliberately
 * dumb: everything it can change, it changes by calling something on {@link
 * TaskRowContext}, which the table memoizes once for all rows.
 *
 * ## The row is not a link
 *
 * Clicking anywhere on a row does *not* open the task; only the title does. That
 * is a decision, not an omission. Every cell here is editable, so a row-level
 * click handler means each cell has to stop propagation, and the one that forgets
 * — or the popover that closes onto the row underneath — opens a detail sheet the
 * reader did not ask for. ClickUp draws the same line for the same reason.
 */

import { memo, useState, useRef, useEffect, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { MoreVertical } from 'lucide-react';
import { localizedTaskTitle } from '@/lib/taskTitle';
import type { FieldFormatContext, TaskFieldValue } from '@/lib/taskFieldTypes';
import type { ArrangeableTask } from '@/lib/taskGrouping';
import type { TaskPriority } from '@/lib/taskLabels';
import { isClosedType, resolveStatus, type TaskStatusDef } from '../../../../convex/lib/taskStatus';
import type { TaskColumn } from './columns';
import {
  AssigneeCell,
  DeadlineCell,
  PlainCell,
  PriorityCell,
  StatusCell,
  StatusTick,
} from './cells/BuiltInCells';
import { CustomFieldCell } from './cells/CustomFieldCell';
import type { TaskCellUser } from './cells/cellChrome';

/** A task as the grid renders it: what it arranges by, plus what it displays. */
export interface TaskTableRow extends ArrangeableTask {
  titleKey?: string | null;
  assignedToUser?: { _id?: string; name?: string; avatarUrl?: string | null } | null;
  projectName?: string | null;
  subtaskCount?: number;
  subtaskDoneCount?: number;
  parentTaskId?: string;
}

/** The built-in columns a row can write, as one patch. */
export interface TaskRowPatch {
  priority?: TaskPriority;
  deadline?: number | null;
  assignedTo?: string;
}

/**
 * Everything a row needs that is the same for every row.
 *
 * Passed as one object rather than twenty props so the table can build it in a
 * `useMemo` and `memo()` below can compare it by identity — with twenty props, a
 * single inline arrow in the table's JSX re-renders all sixty rows on every
 * keystroke in the search box.
 */
export interface TaskRowContext {
  columns: readonly TaskColumn[];
  statuses: readonly TaskStatusDef[];
  users: TaskCellUser[];
  format: FieldFormatContext;
  lang: string | undefined;
  canEdit: boolean;
  /** `grid-template-columns`, shared with the header so the two line up. */
  gridStyle: CSSProperties;
  /** Row height, from the density preference. */
  rowHeightClass: string;
  onOpenTask: (taskId: string) => void;
  onSetStatus: (taskId: string, statusKey: string) => void;
  onPatchTask: (taskId: string, patch: TaskRowPatch) => void;
  onSetField: (taskId: string, fieldId: string, value: TaskFieldValue | null) => void;
  onToggleSelect: (taskId: string, extend: boolean) => void;
  /** Context menu: edit a task. */
  onEditTask?: (taskId: string) => void;
  /** Context menu: rename a task. */
  onRenameTask?: (taskId: string) => void;
  /** Context menu: set priority. */
  onSetPriority?: (taskId: string, priority: string) => void;
  /** Context menu: delete a task. */
  onDeleteTask?: (taskId: string) => void;
}

/** Three-dot menu that appears on row hover in the name cell. */
function NameCellMenu({ task, ctx }: { task: TaskTableRow; ctx: TaskRowContext }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!ctx.onEditTask && !ctx.onDeleteTask) return null;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          'p-1 rounded-md transition-opacity hover:bg-(--background-subtle) text-(--text-muted) hover:text-(--text-primary)',
          open ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100',
        )}
        aria-label="Task actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg border border-(--border) bg-(--card) shadow-lg p-1">
          {ctx.onEditTask && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                ctx.onEditTask!(task._id);
                setOpen(false);
              }}
              className="flex items-center gap-2 w-full px-2.5 py-2 text-sm rounded-md hover:bg-(--brand-quiet) hover:text-(--brand-text) transition-colors text-left"
            >
              {t('tasksClient.edit', 'Edit')}
            </button>
          )}
          {ctx.onSetPriority && (
            <>
              <div className="h-px bg-(--border) my-1" />
              {['low', 'medium', 'high', 'urgent'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    ctx.onSetPriority!(task._id, p);
                    setOpen(false);
                  }}
                  disabled={task.priority === p}
                  className="flex items-center gap-2 w-full px-2.5 py-2 text-sm rounded-md hover:bg-(--brand-quiet) hover:text-(--brand-text) transition-colors text-left disabled:opacity-50"
                >
                  {t(`taskPriority.${p}`, p)}
                  {task.priority === p && <span className="ml-auto text-xs opacity-50">✓</span>}
                </button>
              ))}
            </>
          )}
          {ctx.onDeleteTask && (
            <>
              <div className="h-px bg-(--border) my-1" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  ctx.onDeleteTask!(task._id);
                  setOpen(false);
                }}
                className="flex items-center gap-2 w-full px-2.5 py-2 text-sm rounded-md hover:bg-(--danger-quiet) text-(--danger-text) transition-colors text-left"
              >
                {t('tasksClient.delete', 'Delete')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** The sticky lead cell: select, tick, title, subtask count. */
function NameCell({
  task,
  ctx,
  selected,
  closed,
}: {
  task: TaskTableRow;
  ctx: TaskRowContext;
  selected: boolean;
  closed: boolean;
}) {
  const { t } = useTranslation();
  const subtasks = task.subtaskCount ?? 0;

  return (
    <div
      className={cn(
        // Sticky so the name stays put while the columns scroll past it. It needs
        // its own opaque background for that — and therefore its own copy of the
        // row's hover and selected backgrounds, or it paints a pale stripe over
        // whichever one the row is showing.
        'sticky left-0 z-[1] flex min-w-0 items-center gap-2 border-r border-(--border) pl-2 pr-3',
        selected ? 'bg-(--brand-quiet)' : 'bg-(--card) group-hover/row:bg-(--background-subtle)',
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        readOnly
        aria-label={t('tasksTable.selectRow', 'Select task')}
        // `onClick` rather than `onChange`: it is the only one of the two that
        // carries `shiftKey`, which is how a range of rows gets selected. Keyboard
        // Space fires a click too, so this is not a mouse-only path.
        onClick={(event) => {
          event.stopPropagation();
          ctx.onToggleSelect(task._id, event.shiftKey);
        }}
        className={cn(
          'h-3.5 w-3.5 shrink-0 cursor-pointer accent-(--brand) transition-opacity',
          // Sixty always-visible checkboxes turn a board into a form. It appears
          // on hover, on focus, and whenever it is actually ticked.
          selected ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100 focus:opacity-100',
        )}
      />
      <StatusTick
        statuses={ctx.statuses}
        status={task.status}
        statusKey={task.statusKey}
        readOnly={!ctx.canEdit}
        label={t('tasksTable.toggleDone', 'Mark complete')}
        onPick={(statusKey) => ctx.onSetStatus(task._id, statusKey)}
      />
      {task.parentTaskId && (
        <span
          aria-hidden
          title={t('tasksTable.subtaskOf', 'Subtask')}
          className="shrink-0 text-(--text-muted)"
        >
          ↳
        </span>
      )}
      <button
        type="button"
        onClick={() => ctx.onOpenTask(task._id)}
        className={cn(
          'min-w-0 flex-1 truncate rounded px-0.5 text-left text-sm font-medium',
          'hover:text-(--brand-text) focus-visible:ring-2 focus-visible:ring-(--brand-outline) focus-visible:outline-none',
          closed ? 'text-(--text-muted) line-through' : 'text-(--text-primary)',
        )}
      >
        {localizedTaskTitle(t, task)}
      </button>
      {subtasks > 0 && (
        <span
          title={t('tasksTable.subtasks', 'Subtasks')}
          className="shrink-0 rounded-md bg-(--background-subtle) px-1.5 py-0.5 text-[11px] tabular-nums text-(--text-muted)"
        >
          {task.subtaskDoneCount ?? 0}/{subtasks}
        </span>
      )}
      {/* Three-dot menu — appears on row hover */}
      {ctx.canEdit && <NameCellMenu task={task} ctx={ctx} />}
    </div>
  );
}

/** The cell for one column of one row. */
function RowCell({
  column,
  task,
  ctx,
}: {
  column: TaskColumn;
  task: TaskTableRow;
  ctx: TaskRowContext;
}) {
  const { t } = useTranslation();
  const readOnly = !ctx.canEdit;

  if (column.field) {
    const fieldId = column.field._id;
    return (
      <CustomFieldCell
        field={column.field}
        value={task.customFields?.[fieldId]}
        format={ctx.format}
        users={ctx.users}
        readOnly={readOnly}
        onCommit={(next) => ctx.onSetField(task._id, fieldId, next)}
      />
    );
  }

  switch (column.key) {
    case 'status':
      return (
        <StatusCell
          statuses={ctx.statuses}
          status={task.status}
          statusKey={task.statusKey}
          readOnly={readOnly}
          onPick={(statusKey) => ctx.onSetStatus(task._id, statusKey)}
        />
      );
    case 'priority':
      return (
        <PriorityCell
          priority={task.priority ?? 'medium'}
          readOnly={readOnly}
          onPick={(priority) => ctx.onPatchTask(task._id, { priority })}
        />
      );
    case 'deadline':
      return (
        <DeadlineCell
          deadline={task.deadline}
          closed={isClosedType(resolveStatus(task, ctx.statuses).type)}
          lang={ctx.lang}
          readOnly={readOnly}
          onPick={(deadline) => ctx.onPatchTask(task._id, { deadline })}
        />
      );
    case 'assignee':
      return (
        <AssigneeCell
          assignedTo={task.assignedTo}
          users={ctx.users}
          readOnly={readOnly}
          placeholder={t('tasksTable.unassigned', 'Unassigned')}
          onPick={(assignedTo) => ctx.onPatchTask(task._id, { assignedTo })}
        />
      );
    case 'project':
      return <PlainCell>{task.projectName ?? ''}</PlainCell>;
    default:
      // A column key from a newer build. An empty cell keeps the grid aligned,
      // which is the one thing that must not break.
      return <PlainCell>{''}</PlainCell>;
  }
}

function TaskRowInner({
  task,
  ctx,
  selected,
}: {
  task: TaskTableRow;
  ctx: TaskRowContext;
  selected: boolean;
}) {
  const closed = isClosedType(resolveStatus(task, ctx.statuses).type);

  return (
    <div
      role="row"
      style={ctx.gridStyle}
      className={cn(
        'group/row grid items-stretch border-b border-(--border) transition-colors',
        ctx.rowHeightClass,
        selected ? 'bg-(--brand-quiet)' : 'hover:bg-(--background-subtle)',
      )}
    >
      <NameCell task={task} ctx={ctx} selected={selected} closed={closed} />
      {ctx.columns.map((column) => (
        <div key={column.key} role="gridcell" className="min-w-0">
          <RowCell column={column} task={task} ctx={ctx} />
        </div>
      ))}
      {/* Sits under the header's "＋", so the last real column keeps its width. */}
      <div aria-hidden />
    </div>
  );
}

/**
 * Memoized on the row's identity: a board of sixty rows re-renders one of them
 * when one of them changes. `ctx` is stable by construction (see its docs), so
 * the default shallow comparison is enough.
 */
export const TaskRow = memo(TaskRowInner);
