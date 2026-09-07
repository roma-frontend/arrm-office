'use client';

/**
 * The ClickUp-style task grid: a sticky header, resizable and reorderable columns,
 * collapsible sections, inline editing in every cell, and a selection that acts on
 * many tasks at once.
 *
 * ## What lives here and what does not
 *
 * This component *arranges*. It decides which sections exist and in what order
 * (`@/lib/taskGrouping`), which columns are on and how wide (`./columns`), what is
 * selected, and what is collapsed. It renders one {@link TaskRow} per task and one
 * cell component per column, and it owns no knowledge of how any individual value
 * is edited — that is the `cells/` directory, behind one contract.
 *
 * Everything that *writes* arrives as a callback. The grid never calls a mutation
 * itself, which is what lets the same component serve `/tasks` (every task the
 * viewer can see) and a project page (one project's tasks), with different
 * permissions and different optimistic-update strategies behind it.
 *
 * ## Scrolling
 *
 * The grid expects to be rendered inside an ancestor with `overflow: auto` on
 * **both** axes. The header is `sticky top-0`, the name cell of each row is
 * `sticky left-0`, and both stick against that same scroll box — which is why the
 * grid must not introduce a nested horizontal scroller of its own. A nested
 * `overflow-x-auto` here would silently break the vertical stickiness of the
 * header, since a sticky element only sticks to its nearest scrolling ancestor.
 */

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { highlightRowStyle } from '@/lib/highlightStyle';
import { taskColorClasses, CHIP_BASE } from '@/lib/taskColors';
import {
  clampColumnWidth,
  formatFieldValue,
  optionOf,
  type FieldFormatContext,
  type TaskFieldValue,
  type TaskGridField,
} from '@/lib/taskFieldTypes';
import { statusLabel, priorityLabel, type TaskPriority } from '@/lib/taskLabels';
import { groupTasks, priorityColor, sortTasks } from '@/lib/taskGrouping';
import {
  customColumnId,
  isCustomColumnKey,
  type TaskSortField,
  type TaskViewState,
} from '@/lib/taskViewState';
import type { TaskDensity, TaskTableLayout } from '@/hooks/useTaskViewPreferences';
import type { TaskStatusDef } from '../../../../convex/lib/taskStatus';
import { BulkActionBar, type BulkPatch } from '../BulkActionBar';
import {
  ADD_COLUMN_WIDTH,
  arrangeColumns,
  gridTemplate,
  moveColumn,
  taskColumnCatalog,
  type TaskColumn,
} from './columns';
import { TaskRow, type TaskRowContext, type TaskRowPatch, type TaskTableRow } from './TaskRow';
import { TaskContextMenu, type ContextTask } from '../TaskContextMenu';
import type { TaskCellUser } from './cells/cellChrome';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

export type { TaskTableRow, TaskRowPatch } from './TaskRow';

/**
 * The values a task created inside a section inherits from it.
 *
 * Adding a task to the *READY TO PAY* section and getting one that is not ready to
 * pay is the kind of small betrayal that makes people stop using inline creation.
 */
export interface TaskSeed {
  statusKey?: string;
  priority?: TaskPriority;
  assignedTo?: string;
  projectId?: string;
  fieldValues?: Record<string, TaskFieldValue>;
}

export interface TaskTableProps {
  tasks: readonly TaskTableRow[];
  /** The status set of this board — the organization's, not the canonical five. */
  statuses: readonly TaskStatusDef[];
  /** Active custom fields, already scoped to the org and (if any) the project. */
  fields: readonly TaskGridField[];
  /** Candidates for the assignee column and for `user` / `users` fields. */
  users: TaskCellUser[];
  view: TaskViewState;
  layout: TaskTableLayout;
  density: TaskDensity;
  canEdit: boolean;
  lang?: string;
  orgCurrency?: string;
  /** Resolves a project id to its name, for section headers. */
  projectName?: (projectId: string) => string | undefined;
  onOpenTask: (taskId: string) => void;
  onSetStatus: (taskId: string, statusKey: string) => void;
  onPatchTask: (taskId: string, patch: TaskRowPatch) => void;
  onSetField: (taskId: string, fieldId: string, value: TaskFieldValue | null) => void;
  /** Header click. The parent decides whether that flips the direction or the field. */
  onSort: (field: TaskSortField) => void;
  onResizeColumn: (key: string, width: number) => void;
  onReorderColumns: (keys: string[]) => void;
  /** Inline creation. Absent hides the "+ Add Task" affordances entirely. */
  onAddTask?: (title: string, seed: TaskSeed) => Promise<unknown> | void;
  onBulkPatch?: (taskIds: string[], patch: BulkPatch) => Promise<unknown> | void;
  onBulkDelete?: (taskIds: string[]) => Promise<unknown> | void;
  /** The "＋" at the end of the header row — normally an `AddFieldPopover`. */
  addColumnSlot?: ReactNode;
  /** Shown instead of the sections when there is nothing to show. */
  emptyState?: ReactNode;
  /** Task id to highlight (from notification navigation). */
  highlightTaskId?: string | null;
  /** Blink phase for the highlighted row; flips while the highlight is active. */
  highlightPulse?: boolean;
  /** Context menu handlers — when provided, each task row gets a right-click menu. */
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

// ── Header ─────────────────────────────────────────────────────────────────
/**
 * The drag strip on a column's right edge.
 *
 * Uses pointer capture rather than window listeners: the pointer keeps reporting
 * to this element even when it leaves it, which is the whole gesture — you resize
 * a 140px column by dragging 300px to the right. `onDraft` fires continuously for
 * the live preview, `onCommit` once on release, so a resize is one write to
 * localStorage instead of two hundred.
 */
function ResizeHandle({
  width,
  onDraft,
  onCommit,
  label,
}: {
  width: number;
  onDraft: (width: number) => void;
  onCommit: (width: number) => void;
  label: string;
}) {
  const start = useRef({ x: 0, width: 0, active: false });

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        start.current = { x: event.clientX, width, active: true };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!start.current.active) return;
        onDraft(clampColumnWidth(start.current.width + event.clientX - start.current.x));
      }}
      onPointerUp={(event) => {
        if (!start.current.active) return;
        start.current.active = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
        onCommit(clampColumnWidth(start.current.width + event.clientX - start.current.x));
      }}
      className={cn(
        'absolute top-1 right-0 bottom-1 w-1 cursor-col-resize rounded-full',
        'hover:bg-(--brand) active:bg-(--brand)',
      )}
    />
  );
}

/** Ascending / descending marker, drawn only on the column being sorted by. */
function SortMark({ dir }: { dir: 'asc' | 'desc' }) {
  return (
    <span aria-hidden className="shrink-0 text-(--brand)">
      {dir === 'asc' ? '↑' : '↓'}
    </span>
  );
}

function ColumnHeader({
  column,
  view,
  onSort,
  onDraftWidth,
  onCommitWidth,
  onDropColumn,
  canArrange,
}: {
  column: TaskColumn;
  view: TaskViewState;
  onSort: (field: TaskSortField) => void;
  onDraftWidth: (key: string, width: number) => void;
  onCommitWidth: (key: string, width: number) => void;
  onDropColumn: (from: string, to: string) => void;
  canArrange: boolean;
}) {
  const { t } = useTranslation();
  const [over, setOver] = useState(false);
  const active = view.sort === column.sort;

  return (
    <div
      role="columnheader"
      aria-sort={active ? (view.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      onDragOver={(event) => {
        if (!canArrange) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        if (!canArrange) return;
        event.preventDefault();
        const from = event.dataTransfer.getData('text/plain');
        if (from) onDropColumn(from, column.key);
      }}
      className={cn('relative flex min-w-0 items-center gap-1 px-2', over && 'bg-(--brand-quiet)')}
    >
      <button
        type="button"
        // Only the label is draggable, not the whole header: the resize strip is a
        // sibling, and a native drag started on it would eat the resize gesture.
        draggable={canArrange}
        onDragStart={(event) => {
          event.dataTransfer.setData('text/plain', column.key);
          event.dataTransfer.effectAllowed = 'move';
        }}
        onClick={() => column.sort && onSort(column.sort)}
        title={column.label}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-1 truncate rounded py-1 text-left',
          'text-xs font-semibold text-(--text-muted)',
          column.sort ? 'cursor-pointer select-none hover:text-(--text-primary)' : 'cursor-default',
        )}
      >
        <span className="truncate">{column.label}</span>
        {active && <SortMark dir={view.dir} />}
      </button>
      <ResizeHandle
        width={column.width}
        label={t('tasksTable.resizeColumn', 'Resize column')}
        onDraft={(width) => onDraftWidth(column.key, width)}
        onCommit={(width) => onCommitWidth(column.key, width)}
      />
    </div>
  );
}

// ── Sections ───────────────────────────────────────────────────────────────
/** What a section header shows: the group's own label, in the group's own colour. */
interface SectionChip {
  label: string;
  color: string;
}

function SectionHeader({
  chip,
  count,
  collapsed,
  onToggle,
  onAdd,
}: {
  chip: SectionChip;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  onAdd?: () => void;
}) {
  const { t } = useTranslation();
  const classes = taskColorClasses(chip.color);

  return (
    <div className="flex items-center gap-2 border-b border-(--border) bg-(--background) px-3 py-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex min-w-0 items-center gap-2 rounded-md py-0.5 pr-2 text-left hover:bg-(--background-subtle)"
      >
        <ChevronRight
          aria-hidden
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-(--text-muted) transition-transform',
            !collapsed && 'rotate-90',
          )}
        />
        <span className={cn(CHIP_BASE, classes.chip, 'uppercase')}>{chip.label}</span>
        <span className="shrink-0 text-xs tabular-nums text-(--text-muted)">{count}</span>
      </button>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="ml-1 flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-(--text-muted) opacity-0 transition-opacity hover:bg-(--background-subtle) hover:text-(--text-primary) focus-visible:opacity-100 group-hover/section:opacity-100"
        >
          <Plus aria-hidden className="h-3 w-3" />
          {t('tasksTable.addTask', 'Add Task')}
        </button>
      )}
    </div>
  );
}

/**
 * The inline "+ Add Task" row at the foot of a section.
 *
 * Stays open after a successful create and keeps focus, because tasks are entered
 * in runs of five, not one at a time. Escape closes it; an empty title just closes
 * it too, rather than complaining about a field the user is trying to abandon.
 */
function AddTaskRow({
  onCreate,
  onClose,
  placeholder,
}: {
  onCreate: (title: string) => Promise<unknown> | void;
  onClose: () => void;
  placeholder: string;
}) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await onCreate(trimmed);
      setTitle('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 border-b border-(--border) px-3 py-1.5">
      <input
        autoFocus
        value={title}
        disabled={busy}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => {
          if (!title.trim()) onClose();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void submit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
        className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 text-sm outline-none placeholder:text-(--text-muted) focus:ring-2 focus:ring-(--brand-outline)"
      />
    </div>
  );
}

// ── DnD wrappers for table rows and sections ─────────────────────────────
function DraggableTaskRowWrapper({
  task,
  ctx,
  selected,
  isHighlighted,
  highlightPulse,
}: {
  task: TaskTableRow;
  ctx: TaskRowContext;
  selected: boolean;
  isHighlighted?: boolean;
  highlightPulse?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task._id,
    data: { status: task.status },
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: 'relative' as const,
  };
  const highlightStyle = highlightRowStyle(Boolean(isHighlighted), highlightPulse);

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, ...highlightStyle }}
      {...attributes}
      {...listeners}
      data-task-id={task._id}
    >
      <TaskRow task={task} ctx={ctx} selected={selected} />
    </div>
  );
}

function DroppableTableSection({ id, children }: { id: string; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: { type: 'list-section' },
  });
  return (
    <div ref={setNodeRef} className={isOver ? 'bg-(--brand-quiet)/30 rounded-lg' : ''}>
      {children}
    </div>
  );
}

// ── The grid ───────────────────────────────────────────────────────────────
export function TaskTable({
  tasks,
  statuses,
  fields,
  users,
  view,
  layout,
  density,
  canEdit,
  lang,
  orgCurrency,
  projectName,
  onOpenTask,
  onSetStatus,
  onPatchTask,
  onSetField,
  onSort,
  onResizeColumn,
  onReorderColumns,
  onAddTask,
  onBulkPatch,
  onBulkDelete,
  addColumnSlot,
  emptyState,
  highlightTaskId,
  highlightPulse,
  contextMenu,
}: TaskTableProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [adding, setAdding] = useState<string | null>(null);
  /** Live width during a drag, so the grid follows the pointer without a write. */
  const [draftWidth, setDraftWidth] = useState<{ key: string; width: number } | null>(null);
  const anchor = useRef<string | null>(null);

  const userNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of users) map.set(user._id, user.name);
    return map;
  }, [users]);

  const format = useMemo<FieldFormatContext>(
    () => ({
      lang,
      ...(orgCurrency ? { orgCurrency } : {}),
      resolveUserName: (id: string) => userNames.get(id),
    }),
    [lang, orgCurrency, userNames],
  );

  /** Names for the things a section can be grouped by, for alphabetical order. */
  const labelOf = useCallback(
    (value: string) => userNames.get(value) ?? projectName?.(value) ?? value,
    [projectName, userNames],
  );

  const catalog = useMemo(() => taskColumnCatalog(fields, t, layout), [fields, t, layout]);
  const { ordered, visible } = useMemo(() => arrangeColumns(catalog, layout), [catalog, layout]);

  /** The visible columns with the in-flight resize applied. */
  const columns = useMemo(() => {
    if (!draftWidth) return visible;
    return visible.map((column) =>
      column.key === draftWidth.key ? { ...column, width: draftWidth.width } : column,
    );
  }, [visible, draftWidth]);

  const { template, minWidth } = useMemo(() => gridTemplate(columns), [columns]);
  const gridStyle = useMemo(() => ({ gridTemplateColumns: template }), [template]);

  const sections = useMemo(() => {
    const arranged = sortTasks(tasks, view.sort, view.dir, { statuses, fields, labelOf });
    return groupTasks(arranged, view.group, { statuses, fields, labelOf });
  }, [tasks, view.sort, view.dir, view.group, statuses, fields, labelOf]);

  /** Row order as rendered, which is what a shift-click range means. */
  const flatIds = useMemo(
    () =>
      sections
        .filter((section) => !collapsed.has(section.value))
        .flatMap((section) => section.tasks.map((task) => task._id)),
    [sections, collapsed],
  );

  const toggleSelect = useCallback(
    (taskId: string, extend: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const from = anchor.current;
        if (extend && from && from !== taskId) {
          const start = flatIds.indexOf(from);
          const end = flatIds.indexOf(taskId);
          if (start !== -1 && end !== -1) {
            const [lo, hi] = start < end ? [start, end] : [end, start];
            // A shift-click adds the range; it never unticks what was already on,
            // which is what every file manager and spreadsheet does.
            for (let index = lo; index <= hi; index += 1) next.add(flatIds[index]!);
            return next;
          }
        }
        if (next.has(taskId)) next.delete(taskId);
        else next.add(taskId);
        anchor.current = taskId;
        return next;
      });
    },
    [flatIds],
  );

  const clearSelection = useCallback(() => {
    anchor.current = null;
    setSelected(new Set());
  }, []);

  const rowContext = useMemo<TaskRowContext>(
    () => ({
      columns,
      statuses,
      users,
      format,
      lang,
      canEdit,
      gridStyle,
      rowHeightClass: density === 'compact' ? 'min-h-8' : 'min-h-9',
      onOpenTask,
      onSetStatus,
      onPatchTask,
      onSetField,
      onToggleSelect: toggleSelect,
      onEditTask: contextMenu?.onEdit
        ? (id: string) => contextMenu.onEdit({ _id: id, title: '' })
        : undefined,
      onSetPriority: contextMenu?.onSetPriority,
      onDeleteTask: contextMenu?.onDelete
        ? (id: string) => contextMenu.onDelete({ _id: id, title: '' })
        : undefined,
    }),
    [
      columns,
      statuses,
      users,
      format,
      lang,
      canEdit,
      gridStyle,
      density,
      onOpenTask,
      onSetStatus,
      onPatchTask,
      onSetField,
      toggleSelect,
      contextMenu,
    ],
  );

  /**
   * A section's chip: its label in the reader's language and the colour its author
   * chose. Everything here is presentation — the ordering happened in
   * `groupTasks`, which deliberately knows nothing about labels.
   */
  const describeSection = useCallback(
    (value: string): SectionChip => {
      const empty = { label: t('tasksTable.empty', 'Empty'), color: 'gray' };
      if (view.group === 'status') {
        const definition = statuses.find((candidate) => candidate.key === value);
        return definition
          ? { label: statusLabel(t, definition), color: definition.color }
          : { label: value || empty.label, color: 'gray' };
      }
      if (view.group === 'priority') {
        if (!value) return empty;
        return { label: priorityLabel(t, value), color: priorityColor(value) };
      }
      if (view.group === 'assignee') {
        return value
          ? { label: userNames.get(value) ?? value, color: 'blue' }
          : { label: t('tasksTable.unassigned', 'Unassigned'), color: 'gray' };
      }
      if (view.group === 'project') {
        return value
          ? { label: projectName?.(value) ?? value, color: 'violet' }
          : { label: t('tasksTable.noProject', 'No project'), color: 'gray' };
      }
      if (isCustomColumnKey(view.group)) {
        if (!value) return empty;
        // Hoisted out of the `find` callback below: TypeScript drops the narrowing
        // from `isCustomColumnKey` inside a closure, and this reads better anyway.
        const fieldId = customColumnId(view.group);
        const field = fields.find((candidate) => candidate._id === fieldId);
        if (!field) return { label: value, color: 'gray' };
        const option = optionOf(field, value);
        if (option) return { label: option.label, color: option.color ?? 'gray' };
        return { label: formatFieldValue(field, value, format) || value, color: 'gray' };
      }
      return empty;
    },
    [fields, format, projectName, statuses, t, userNames, view.group],
  );

  /** What a task created in this section inherits. See {@link TaskSeed}. */
  const seedFor = useCallback(
    (value: string): TaskSeed => {
      if (!value) return {};
      if (view.group === 'status') return { statusKey: value };
      if (view.group === 'priority') return { priority: value as TaskPriority };
      if (view.group === 'assignee') return { assignedTo: value };
      if (view.group === 'project') return { projectId: value };
      if (isCustomColumnKey(view.group)) {
        return { fieldValues: { [customColumnId(view.group)]: value } };
      }
      return {};
    },
    [view.group],
  );

  const commitWidth = useCallback(
    (key: string, width: number) => {
      setDraftWidth(null);
      onResizeColumn(key, width);
    },
    [onResizeColumn],
  );

  const dropColumn = useCallback(
    (from: string, to: string) => {
      if (from === to) return;
      onReorderColumns(moveColumn(ordered, from, to));
    },
    [onReorderColumns, ordered],
  );

  const selectedIds = useMemo(() => [...selected], [selected]);
  const hasSections = view.group !== 'none';

  if (tasks.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div
      role="grid"
      aria-label={t('tasksTable.label', 'Tasks')}
      aria-rowcount={tasks.length}
      // The grid stops shrinking here and the ancestor scrolls instead. `min-w-full`
      // keeps it filling a wide screen, where `minWidth` is the smaller number.
      style={{ minWidth }}
      className="min-w-full"
      onKeyDown={(event) => {
        // A cell that is being edited stops Escape before it reaches this handler
        // (see `useTypedCell`), so this only ever clears the selection.
        if (event.key === 'Escape' && selected.size > 0) clearSelection();
      }}
    >
      <div
        role="row"
        style={gridStyle}
        className="sticky top-0 z-10 grid h-9 items-stretch border-b border-(--border) bg-(--background-subtle)"
      >
        <div
          role="columnheader"
          className="sticky left-0 z-[1] flex min-w-0 items-center gap-2 border-r border-(--border) bg-(--background-subtle) pl-2 pr-3"
        >
          <input
            type="checkbox"
            checked={flatIds.length > 0 && selected.size >= flatIds.length}
            readOnly
            aria-label={t('tasksTable.selectAll', 'Select all tasks')}
            onClick={() => {
              anchor.current = null;
              setSelected((prev) => (prev.size >= flatIds.length ? new Set() : new Set(flatIds)));
            }}
            className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-(--brand)"
          />
          <button
            type="button"
            onClick={() => onSort('name')}
            className="flex min-w-0 items-center gap-1 rounded py-1 text-left text-xs font-semibold text-(--text-muted) hover:text-(--text-primary)"
          >
            <span className="truncate">{t('tasksClient.task', 'Name')}</span>
            {view.sort === 'name' && <SortMark dir={view.dir} />}
          </button>
        </div>
        {columns.map((column) => (
          <ColumnHeader
            key={column.key}
            column={column}
            view={view}
            canArrange={canEdit}
            onSort={onSort}
            onDraftWidth={(key, width) => setDraftWidth({ key, width })}
            onCommitWidth={commitWidth}
            onDropColumn={dropColumn}
          />
        ))}
        <div
          role="columnheader"
          className="flex items-center justify-center"
          style={{ width: ADD_COLUMN_WIDTH }}
        >
          {addColumnSlot}
        </div>
      </div>

      {sections.map((section) => {
        const isCollapsed = collapsed.has(section.value);
        const chip = describeSection(section.value);
        const sectionKey = section.value || '__none__';

        return (
          <div key={sectionKey} className="group/section">
            {hasSections && (
              <SectionHeader
                chip={chip}
                count={section.tasks.length}
                collapsed={isCollapsed}
                onToggle={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(section.value)) next.delete(section.value);
                    else next.add(section.value);
                    return next;
                  })
                }
                onAdd={
                  onAddTask && canEdit
                    ? () => {
                        setCollapsed((prev) => {
                          if (!prev.has(section.value)) return prev;
                          const next = new Set(prev);
                          next.delete(section.value);
                          return next;
                        });
                        setAdding(sectionKey);
                      }
                    : undefined
                }
              />
            )}

            {!isCollapsed && (
              <DroppableTableSection id={sectionKey}>
                {section.tasks.map((task) => (
                  <TaskContextMenu
                    key={task._id}
                    task={task as ContextTask}
                    canManage={contextMenu?.canManage ?? false}
                    onOpen={(t) => onOpenTask(t._id)}
                    onEdit={contextMenu?.onEdit ?? (() => {})}
                    onSetStatus={(id, status) => rowContext.onSetStatus(id, status)}
                    onSetPriority={contextMenu?.onSetPriority ?? (() => {})}
                    onDelete={contextMenu?.onDelete ?? (() => {})}
                  >
                    <DraggableTaskRowWrapper
                      task={task}
                      ctx={rowContext}
                      selected={selected.has(task._id)}
                      isHighlighted={task._id === highlightTaskId}
                      highlightPulse={highlightPulse}
                    />
                  </TaskContextMenu>
                ))}

                {onAddTask && canEdit && adding === sectionKey && (
                  <AddTaskRow
                    placeholder={t('tasksTable.taskNamePlaceholder', 'Task name')}
                    onClose={() => setAdding(null)}
                    onCreate={(title) => onAddTask(title, seedFor(section.value))}
                  />
                )}

                {onAddTask && canEdit && adding !== sectionKey && (
                  <button
                    type="button"
                    onClick={() => setAdding(sectionKey)}
                    className="flex w-full items-center gap-1.5 border-b border-(--border) px-3 py-1.5 text-left text-xs text-(--text-muted) hover:bg-(--background-subtle) hover:text-(--text-primary)"
                  >
                    <Plus aria-hidden className="h-3 w-3" />
                    {t('tasksTable.addTask', 'Add Task')}
                  </button>
                )}
              </DroppableTableSection>
            )}
          </div>
        );
      })}

      {selectedIds.length > 0 && (
        <BulkActionBar
          count={selectedIds.length}
          statuses={statuses}
          users={users}
          onClear={clearSelection}
          {...(onBulkPatch
            ? {
                onPatch: async (patch: BulkPatch) => {
                  await onBulkPatch(selectedIds, patch);
                  clearSelection();
                },
              }
            : {})}
          {...(onBulkDelete
            ? {
                onDelete: async () => {
                  await onBulkDelete(selectedIds);
                  clearSelection();
                },
              }
            : {})}
        />
      )}
    </div>
  );
}
