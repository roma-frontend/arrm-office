'use client';

import { useState, useMemo, useRef, useTransition, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useMainRef } from '@/hooks/useMainRef';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { CreateTaskWizard } from './CreateTaskWizard';
import { ProjectBadge } from './ProjectBadge';
import { localizedTaskTitle, type TitledTask } from '@/lib/taskTitle';
import { resolveStatus } from '../../../convex/lib/taskStatus';
import { statusLabel } from '@/lib/taskLabels';
import { taskColorClasses, CHIP_BASE } from '@/lib/taskColors';
import { cn } from '@/lib/utils';
import { TaskSheet } from './TaskSheet';
import DetailSheet from '@/components/ui/detail-sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from '@/components/ui/sheet';

import { DraftResumeBar } from '@/components/ui/DraftResumeBar';
import { useDraftResume } from '@/hooks/useDraftResume';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { AssignSupervisorModal } from './AssignSupervisorModal';
import { EmployeeHoverCard } from '@/components/employees/EmployeeHoverCard';
import { TaskContextMenu, type ContextTask } from './TaskContextMenu';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { useOptimisticTaskStatus, useRecurringTaskStatus } from '@/hooks/useOptimisticActions';
import { memo } from 'react';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CheckCircle,
  Clock,
  FileText,
  MessageSquare,
  Pencil,
  Search as SearchIcon,
  Tag,
  User,
  Users,
  X as XIcon,
} from 'lucide-react';
import type { TFunction } from 'i18next';
import { useGlobalShortcut } from '@/hooks/useGlobalShortcut';
import {
  DEFAULT_TASK_VIEW,
  clearTaskFilters,
  countActiveFilters,
  decodeTaskView,
  encodeTaskView,
  fromSavedView,
  isEffectiveCondition,
  sameTaskView,
  taskViewLink,
  toSavedView,
  type TaskFilterCondition,
  type TaskGroupField,
  type TaskViewState,
} from '@/lib/taskViewState';
import { exportFileStem, tasksToCsv, tasksToMarkdown, type ExportTaskRow } from '@/lib/taskExport';
import {
  TASK_BOARD_COLUMN_KEYS,
  useTaskViewPreferences,
  type TaskBoardColumnKey,
} from '@/hooks/useTaskViewPreferences';
import { ShareViewMenu } from './ShareViewMenu';
import { CustomizeViewMenu } from './CustomizeViewMenu';
import { TaskStatsBar, type TaskStatItem } from './TaskStatsBar';
import { TaskFilterChips, type TaskFilterChip } from './TaskFilterChips';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
// ── The table view ─────────────────────────────────────────────────────────
// The grid and its toolbar are their own modules; this file wires them to the
// board's state and to Convex. Nothing below is loaded by the kanban or the
// timeline, which are deliberately untouched by any of it.
import { TaskTable } from './table/TaskTable';
import { ViewTabs } from './ViewTabs';
import { GroupBySelector } from './GroupBySelector';
import { ColumnsMenu } from './ColumnsMenu';
import { FilterBuilder } from './FilterBuilder';
import { AddFieldPopover } from './AddFieldPopover';
import { applyTaskFilters } from '@/lib/taskFilters';
import { useTaskGrid } from '@/hooks/useTaskGrid';

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type Status = 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled';
type Priority = 'low' | 'medium' | 'high' | 'urgent';
import TimelineView from './TimelineView';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

type ViewMode = 'kanban' | 'list' | 'table' | 'timeline';

interface TaskAttachment {
  name: string;
  url?: string;
}

interface TaskAssignee {
  _id?: string;
  name?: string;
  avatarUrl?: string | null;
  department?: string;
}

interface TaskItem {
  _id: string;
  title: string;
  /** Set for tasks the system generated (onboarding steps) so they can be translated. */
  titleKey?: string | null;
  description?: string;
  status: Status;
  statusKey?: string | null;
  priority: Priority;
  deadline?: number;
  tags?: string[];
  attachments?: TaskAttachment[];
  assignedToUser?: TaskAssignee | null;
  commentCount: number;
  /** Project link for the badge; set server-side from the task's projectId. */
  projectId?: string;
  /** Project name for the badge; set server-side from the task's projectId. */
  projectName?: string | null;
  /** Set on tasks generated by a recurring series, so the UI can show a repeat badge. */
  recurringTaskId?: string | null;
  /** "recurring" when the row is a series (not a materialised task). */
  _type?: string;
  subtaskCount?: number;
  subtaskDoneCount?: number;
}

const STATUS_CONFIG: Record<
  Status,
  { labelKey: string; color: string; bg: string; border: string; dot: string }
> = {
  pending: {
    labelKey: 'tasks.status.pending',
    color: 'text-(--text-muted)',
    bg: 'bg-(--background-subtle)',
    border: 'border-(--border)',
    dot: 'bg-(--text-muted)',
  },
  in_progress: {
    labelKey: 'tasks.status.inProgress',
    color: 'text-(--brand-text)',
    bg: 'bg-(--brand-quiet)',
    border: 'border-(--brand-outline)',
    dot: 'bg-(--brand)',
  },
  review: {
    labelKey: 'tasks.status.review',
    color: 'text-(--warning-text)',
    bg: 'bg-(--warning-quiet)',
    border: 'border-(--warning-outline)',
    dot: 'bg-(--warning-solid)',
  },
  completed: {
    labelKey: 'tasks.status.completed',
    color: 'text-(--success-text)',
    bg: 'bg-(--success-quiet)',
    border: 'border-(--success-outline)',
    dot: 'bg-(--success-solid)',
  },
  cancelled: {
    labelKey: 'tasks.status.cancelled',
    color: 'text-(--danger-text)',
    bg: 'bg-(--danger-quiet)',
    border: 'border-(--danger-outline)',
    dot: 'bg-(--danger-solid)',
  },
};

const PRIORITY_CONFIG: Record<
  Priority,
  { labelKey: string; color: string; bg: string; icon: string }
> = {
  low: {
    labelKey: 'tasks.priority.low',
    color: 'text-(--text-muted)',
    bg: 'bg-(--background-subtle)',
    icon: '',
  },
  medium: {
    labelKey: 'tasks.priority.medium',
    color: 'text-(--brand-text)',
    bg: 'bg-(--brand-quiet)',
    icon: '',
  },
  high: {
    labelKey: 'tasks.priority.high',
    color: 'text-(--warning-text)',
    bg: 'bg-(--warning-quiet)',
    icon: '',
  },
  urgent: {
    labelKey: 'tasks.priority.urgent',
    color: 'text-(--danger-text)',
    bg: 'bg-(--danger-quiet)',
    icon: '?',
  },
};

// Which kanban lanes exist at all; which of them are *shown* is a per-person
// preference (see `useTaskViewPreferences`). Cancelled work has no lane by
// default because it is closed history, not a stage.

function Avatar({
  name,
  url,
  size = 'sm',
}: {
  name: string;
  url?: string | null;
  size?: 'sm' | 'md';
}) {
  const dim = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return (
    <div
      className={`${dim} rounded-full overflow-hidden shrink-0 flex items-center justify-center font-bold text-white bg-linear-to-br from-(--brand) to-(--brand)`}
    >
      {url ? (
        /* eslint-disable-next-line @next/next/no-img-element -- external avatar URLs */
        <img
          src={url}
          alt={name}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        initials
      )}
    </div>
  );
}

function DeadlineBadge({ deadline, status }: { deadline?: number; status: Status }) {
  const { t, i18n } = useTranslation();
  if (!deadline) return null;
  // eslint-disable-next-line react-hooks/purity -- intentional: badge must compare against current time
  const now = Date.now();
  const diff = deadline - now;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  const overdue = diff < 0 && status !== 'completed' && status !== 'cancelled';
  const soon = diff > 0 && days <= 2 && status !== 'completed';
  const locale = i18n?.language === 'ru' ? 'ru-RU' : i18n?.language === 'hy' ? 'hy-AM' : 'en-GB';
  const dateStr = new Date(deadline).toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
  });

  if (overdue)
    return (
      <span className="text-xs font-medium text-(--danger-text) bg-(--danger-quiet) px-2 py-0.5 rounded-full">
        {t('tasksClient.overdueTag')}
      </span>
    );
  if (soon)
    return (
      <span className="text-xs font-medium text-(--warning-text) bg-(--warning-quiet) px-2 py-0.5 rounded-full">
        📅 {dateStr}
      </span>
    );
  return <span className="text-xs text-(--text-muted)">📅 {dateStr}</span>;
}

// â”€â”€ Task Card (base content, reused in both draggable and overlay) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/** Shown only on the sorted column, pointing the way the rows actually run. */
function SortCaret({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return null;
  return (
    <svg
      className={`h-3 w-3 ${dir === 'desc' ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  );
}

function StatusCircleButton({
  task,
  statuses,
  onSetStatus,
  canManage,
}: {
  task: TaskItem;
  statuses?: readonly import('../../../convex/lib/taskStatus').TaskStatusDef[];
  onSetStatus: (taskId: string, statusKey: string) => void;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const resolvedStatus = statuses
    ? resolveStatus({ status: task.status as any, statusKey: task.statusKey }, statuses)
    : null;
  const resolvedKey = (resolvedStatus?.key ?? task.status) as Status;
  const statusCfg = STATUS_CONFIG[resolvedKey];
  const isCompleted = resolvedKey === 'completed';
  if (!canManage) {
    return (
      <span
        className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
          isCompleted
            ? 'border-(--success-solid) bg-(--success-solid)'
            : statusCfg.dot.replace('bg-', 'border-')
        }`}
      >
        {isCompleted && (
          <svg
            className="w-2.5 h-2.5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center cursor-pointer hover:scale-125 transition-transform ${
            isCompleted
              ? 'border-(--success-solid) bg-(--success-solid)'
              : statusCfg.dot.replace('bg-', 'border-')
          }`}
          title={t('tasksClient.changeStatus', 'Change status')}
        >
          {isCompleted && (
            <svg
              className="w-2.5 h-2.5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-44 p-1.5 z-[9999]">
        <div className="max-h-64 overflow-y-auto">
          {(Object.entries(STATUS_CONFIG) as [Status, typeof statusCfg][]).map(([key, cfg]) => (
            <button
              key={key}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSetStatus(task._id, key);
                setOpen(false);
              }}
              disabled={resolvedKey === key}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs hover:bg-(--background-subtle) disabled:opacity-50 disabled:cursor-default transition-colors"
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
              <span className={cfg.color}>{t(cfg.labelKey)}</span>
              {resolvedKey === key && <span className="ml-auto text-xs opacity-50">✓</span>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TaskCardContent({
  task,
  isDragging = false,
  statuses,
  onSetStatus,
}: {
  task: TaskItem;
  isDragging?: boolean;
  statuses?: readonly import('../../../convex/lib/taskStatus').TaskStatusDef[];
  onSetStatus?: (taskId: string, statusKey: string) => void;
}) {
  const { t } = useTranslation();
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const resolvedStatus = statuses
    ? resolveStatus({ status: task.status as any, statusKey: task.statusKey }, statuses)
    : null;
  const statusCfg = STATUS_CONFIG[task.status as Status];
  const priorityCfg = PRIORITY_CONFIG[task.priority as Priority];
  return (
    <div
      className={`group bg-(--card) rounded-2xl border shadow-sm p-4 space-y-3 transition-all duration-200 ${
        isDragging
          ? 'border-(--brand-outline) shadow-2xl rotate-2 scale-105 opacity-90'
          : 'border-(--border) hover:shadow-md hover:border-(--brand-outline)'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <ProjectBadge
            projectId={task.projectId}
            projectName={task.projectName}
            className="text-xs max-w-[160px]"
          />
          {task.recurringTaskId && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full bg-(--brand-quiet) text-(--brand-text)"
              title={t('tasksClient.recurringTask', 'Recurring task')}
            >
              🔁
            </span>
          )}
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${priorityCfg.bg} ${priorityCfg.color}`}
          >
            {priorityCfg.icon} {t(priorityCfg.labelKey)}
          </span>
        </div>
        {onSetStatus ? (
          <Popover open={statusPickerOpen} onOpenChange={setStatusPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setStatusPickerOpen(true);
                }}
                className={`text-xs font-medium px-2 py-0.5 rounded-full cursor-pointer hover:opacity-80 transition-opacity ${statusCfg.bg} ${statusCfg.color}`}
              >
                {resolvedStatus ? statusLabel(t, resolvedStatus) : t(statusCfg.labelKey)}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" side="bottom" className="w-44 p-1.5 z-[9999]">
              <div className="max-h-64 overflow-y-auto">
                {(Object.entries(STATUS_CONFIG) as [Status, typeof statusCfg][]).map(
                  ([key, cfg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetStatus(task._id, key);
                        setStatusPickerOpen(false);
                      }}
                      disabled={task.status === key}
                      className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs hover:bg-(--background-subtle) disabled:opacity-50 disabled:cursor-default transition-colors"
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                      <span className={cfg.color}>{t(cfg.labelKey)}</span>
                      {task.status === key && <span className="ml-auto text-xs opacity-50">✓</span>}
                    </button>
                  ),
                )}
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color}`}
          >
            {resolvedStatus ? statusLabel(t, resolvedStatus) : t(statusCfg.labelKey)}
          </span>
        )}
      </div>
      <p
        className={`font-semibold text-sm leading-snug line-clamp-2 ${isDragging ? 'text-(--brand-text)' : 'text-(--text-primary)'}`}
      >
        {localizedTaskTitle(t, task)}
      </p>
      {task.description && (
        <p className="text-xs text-(--text-muted) line-clamp-2 leading-relaxed">
          {task.description}
        </p>
      )}
      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {' '}
          {task.tags.slice(0, 3).map((tag: string) => (
            <span
              key={tag}
              className="text-xs bg-(--brand-quiet) text-(--brand-text) px-2 py-0.5 rounded-full"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
      {task.attachments && task.attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {task.attachments.slice(0, 3).map((att: TaskAttachment, idx: number) => (
            <div
              key={idx}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-(--background-subtle) text-(--text-secondary) border border-(--border)"
            >
              <span>📎</span>
              <span className="truncate max-w-[80px]">{att.name}</span>
            </div>
          ))}
          {task.attachments.length > 3 && (
            <span className="text-xs text-(--text-muted) px-2 py-1">
              +{task.attachments.length - 3} more
            </span>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center justify-between pt-1 border-t border-(--border)">
        <div className="flex items-center gap-2">
          <Avatar
            name={task.assignedToUser?.name ?? '?'}
            url={task.assignedToUser?.avatarUrl}
            size="sm"
          />
          {task.assignedToUser?._id ? (
            <EmployeeHoverCard
              userId={task.assignedToUser._id}
              name={task.assignedToUser.name ?? '?'}
            >
              <span className="text-xs text-(--text-muted) truncate max-w-[100px] cursor-pointer hover:underline hover:underline-offset-2">
                {task.assignedToUser?.name ?? '—'}
              </span>
            </EmployeeHoverCard>
          ) : (
            <span className="text-xs text-(--text-muted) truncate max-w-[100px]">
              {task.assignedToUser?.name ?? '—'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {task.attachments && task.attachments.length > 0 && (
            <span className="text-xs text-(--text-muted) flex items-center gap-1">
              📎 {task.attachments.length}
            </span>
          )}
          {task.commentCount > 0 && (
            <span className="text-xs text-(--text-muted)">💬 {task.commentCount}</span>
          )}{' '}
          <DeadlineBadge deadline={task.deadline} status={task.status as Status} />
          {(task.subtaskCount ?? 0) > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-16 rounded-full bg-(--background-subtle) overflow-hidden">
                <div
                  className="h-full rounded-full bg-(--brand) transition-all"
                  style={{
                    width: `${Math.round(((task.subtaskDoneCount ?? 0) / (task.subtaskCount ?? 1)) * 100)}%`,
                  }}
                />
              </div>
              <span className="text-xs text-(--text-muted)">
                {task.subtaskDoneCount ?? 0}/{task.subtaskCount ?? 0}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DraggableTaskCard({
  task,
  onOpen,
  statuses,
  onSetStatus,
}: {
  task: TaskItem;
  onOpen: () => void;
  statuses?: readonly import('../../../convex/lib/taskStatus').TaskStatusDef[];
  onSetStatus?: (taskId: string, statusKey: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task._id,
    data: {
      status: task.status,
    },
  });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="relative group cursor-grab active:cursor-grabbing"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <TaskCardContent
        task={task}
        isDragging={isDragging}
        statuses={statuses}
        onSetStatus={onSetStatus}
      />

      {/* Drag overlay - visible on hover */}
      <div className="absolute inset-0 rounded-2xl bg-(--background)/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center pointer-events-none">
        <div className="bg-(--card)/90 rounded-xl px-3 py-2 shadow-lg border border-(--border)">
          <svg
            className="w-5 h-5 text-(--text-muted)"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

function DroppableKanbanColumn({
  status,
  tasks,
  onOpen,
  statuses,
  contextMenu,
  onSetStatus,
}: {
  status: Status;
  tasks: TaskItem[];
  onOpen: (t: TaskItem) => void;
  statuses?: readonly import('../../../convex/lib/taskStatus').TaskStatusDef[];
  onSetStatus?: (taskId: string, statusKey: string) => void;
  contextMenu?: {
    canManage: boolean;
    onEdit: (t: ContextTask) => void;
    onRename?: (t: ContextTask) => void;
    onSetStatus: (taskId: string, statusKey: string) => void;
    onSetPriority: (taskId: string, priority: string) => void;
    onDelete: (t: ContextTask) => void;
    onToggleActive?: (t: ContextTask) => void;
  };
}) {
  const cfg = STATUS_CONFIG[status];
  const { t } = useTranslation();
  const { isOver, setNodeRef } = useDroppable({ id: status });

  return (
    <div className="flex-1 min-w-[240px] sm:min-w-[260px] max-w-[320px]">
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
        <span className={`font-semibold text-sm ${cfg.color}`}>{t(cfg.labelKey)}</span>
        <span
          className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}
        >
          {tasks.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`space-y-3 min-h-[120px] p-2 rounded-2xl transition-all duration-200 ${
          isOver
            ? `border-2 border-dashed ${cfg.border} bg-(--brand-quiet)`
            : 'border-2 border-transparent'
        }`}
      >
        {tasks.map((task) =>
          contextMenu ? (
            <TaskContextMenu
              key={task._id}
              task={task as ContextTask}
              canManage={contextMenu.canManage}
              onOpen={(t) => onOpen(t as any)}
              onEdit={contextMenu.onEdit}
              onRename={contextMenu.onRename}
              onSetStatus={contextMenu.onSetStatus}
              onSetPriority={contextMenu.onSetPriority}
              onDelete={contextMenu.onDelete}
              onToggleActive={contextMenu.onToggleActive}
            >
              <DraggableTaskCard
                task={task}
                onOpen={() => onOpen(task)}
                statuses={statuses}
                onSetStatus={onSetStatus}
              />
            </TaskContextMenu>
          ) : (
            <DraggableTaskCard
              key={task._id}
              task={task}
              onOpen={() => onOpen(task)}
              statuses={statuses}
              onSetStatus={onSetStatus}
            />
          ),
        )}
        {tasks.length === 0 && (
          <div
            className={`rounded-2xl border-2 border-dashed ${cfg.border} p-6 text-center transition-colors ${isOver ? 'bg-(--brand-quiet)' : ''}`}
          >
            <p className="text-xs text-(--text-muted)">
              {isOver ? t('tasksClient.dropHere') : t('tasksClient.noTasksFound')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TaskRow({ task, onOpen }: { task: TaskItem; onOpen: () => void }) {
  const { t } = useTranslation();
  const statusCfg = STATUS_CONFIG[task.status as Status];
  const priorityCfg = PRIORITY_CONFIG[task.priority as Priority];

  return (
    <>
      {/* Desktop table row */}
      <tr
        onClick={onOpen}
        className="group hidden sm:table-row hover:bg-(--background-subtle) cursor-pointer transition-colors border-b border-(--border) last:border-0"
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${statusCfg.dot}`} />
            <div className="min-w-0">
              <span className="block font-medium text-(--text-primary) text-sm group-hover:text-(--brand-text) transition-colors truncate">
                {task.recurringTaskId && (
                  <span
                    className="mr-1 text-xs"
                    title={t('tasksClient.recurringTask', 'Recurring task')}
                  >
                    🔁
                  </span>
                )}
                {localizedTaskTitle(t, task)}
              </span>
              <ProjectBadge
                projectId={task.projectId}
                projectName={task.projectName}
                className="block text-[11px] mt-0.5 max-w-[240px]"
              />
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Avatar
              name={task.assignedToUser?.name ?? '?'}
              url={task.assignedToUser?.avatarUrl}
              size="sm"
            />
            {task.assignedToUser?._id ? (
              <EmployeeHoverCard
                userId={task.assignedToUser._id}
                name={task.assignedToUser.name ?? '?'}
              >
                <span className="text-sm text-(--text-secondary) cursor-pointer hover:underline hover:underline-offset-2">
                  {task.assignedToUser?.name ?? '—'}
                </span>
              </EmployeeHoverCard>
            ) : (
              <span className="text-sm text-(--text-secondary)">
                {task.assignedToUser?.name ?? '—'}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <span
            className={`text-xs font-semibold px-2 py-1 rounded-full ${priorityCfg.bg} ${priorityCfg.color}`}
          >
            {priorityCfg.icon} {t(priorityCfg.labelKey)}
          </span>
        </td>
        <td className="px-4 py-3">
          <span
            className={`text-xs font-medium px-2 py-1 rounded-full ${statusCfg.bg} ${statusCfg.color}`}
          >
            {t(statusCfg.labelKey)}
          </span>
        </td>
        <td className="px-4 py-3">
          <DeadlineBadge deadline={task.deadline} status={task.status as Status} />
        </td>
        <td className="px-4 py-3 text-xs text-(--text-muted)">
          {task.commentCount > 0 && `💬 ${task.commentCount}`}
        </td>
      </tr>

      {/* Mobile card — wrapped in <tr> for valid HTML */}
      <tr className="sm:hidden group">
        <td colSpan={6} className="p-0">
          <div
            onClick={onOpen}
            className="p-4 border-b border-(--border) last:border-0 bg-(--card) active:bg-(--background-subtle)"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${statusCfg.dot}`} />
                  <span className={`font-semibold text-sm text-(--text-primary) line-clamp-2`}>
                    {localizedTaskTitle(t, task)}
                  </span>
                </div>
                {task.description && (
                  <p className="text-xs text-(--text-muted) line-clamp-2 mb-2">
                    {task.description}
                  </p>
                )}
              </div>
              <Avatar
                name={task.assignedToUser?.name ?? '?'}
                url={task.assignedToUser?.avatarUrl}
                size="sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ProjectBadge
                projectId={task.projectId}
                projectName={task.projectName}
                className="text-xs max-w-[180px]"
              />
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${priorityCfg.bg} ${priorityCfg.color}`}
              >
                {priorityCfg.icon} {t(priorityCfg.labelKey)}
              </span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color}`}
              >
                {t(statusCfg.labelKey)}
              </span>
              <DeadlineBadge deadline={task.deadline} status={task.status as Status} />
              {task.commentCount > 0 && (
                <span className="text-xs text-(--text-muted)">💬 {task.commentCount}</span>
              )}
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

/**
 * A droppable section in list view — when a task is dragged over it,
 * it highlights to show the user they can drop the task here to change
 * its status.
 */
function DroppableListSection({ id, children }: { id: string; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: { type: 'list-section' },
  });

  return (
    <div
      ref={setNodeRef}
      className={`transition-colors ${isOver ? 'bg-(--brand-quiet)/50 ring-2 ring-inset ring-(--brand-outline) rounded-lg' : ''}`}
    >
      {children}
    </div>
  );
}

/**
 * A list-view task row that is draggable. Wraps the existing grid row
 * with `useDraggable` so the user can drag a task into a different status
 * section — the same mental model as the Kanban board, expressed as rows.
 */
function DraggableListRow({ task, children, isHighlighted }: { task: TaskItem; children: React.ReactNode; isHighlighted?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task._id,
    data: { status: task.status, type: 'list-row' },
  });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={isHighlighted ? 'animate-task-highlight' : undefined}
    >
      {children}
    </div>
  );
}

// ── Recurring Series Detail Sheet ──────────────────────────────────────────
/**
 * Shows recurring series in the same card layout as a regular task detail.
 * The status/priority/schedule/assignee cards mirror TaskDetailClient so the
 * user sees the same UI for both task types.
 */
function RecurringSeriesDetailSheet({
  series,
  onClose,
  convexId,
  userRole,
  effectiveOrgId,
}: {
  series: any;
  onClose: () => void;
  convexId: Id<'users'> | null | undefined;
  userRole: string;
  effectiveOrgId: string | undefined;
}) {
  const { t } = useTranslation(['tasks', 'common']);
  const [editing, setEditing] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  const comments = useQuery(
    api.recurringTasks.listRecurringTaskComments,
    series?._id ? { seriesId: series._id } : 'skip',
  );
  const addComment = useMutation(api.recurringTasks.addRecurringTaskComment);

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !series?._id || isPosting) return;
    setIsPosting(true);
    try {
      await addComment({ seriesId: series._id, content: commentText.trim() });
      setCommentText('');
    } catch {
      toast.error(t('common.error', 'Something went wrong'));
    } finally {
      setIsPosting(false);
    }
  };

  const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

  const describeRule = (): string => {
    if (series.frequency === 'monthly') {
      return t('recurringTasks.rule.monthly', { day: series.dayOfMonth ?? 1 });
    }
    const days = (series.daysOfWeek ?? [])
      .slice()
      .sort((a: number, b: number) => WEEKDAY_ORDER.indexOf(a as 0) - WEEKDAY_ORDER.indexOf(b as 0))
      .map((d: number) => t(`weekdays.${WEEKDAY_KEYS[d] ?? 'mon'}`))
      .join(', ');
    return t('recurringTasks.rule.weekly', { days });
  };

  const canManage = userRole === 'admin' || userRole === 'supervisor' || userRole === 'superadmin';

  if (editing) {
    return (
      <DetailSheet
        open
        onClose={onClose}
        title={t('recurringTasks.editTitle', 'Edit recurring task')}
        size="xl"
      >
        {convexId && (
          <CreateTaskWizard
            className="min-h-0 flex-1 px-5 pt-4"
            currentUserId={convexId}
            userRole={userRole as 'admin' | 'supervisor' | 'employee'}
            selectedOrgId={effectiveOrgId as Id<'organizations'> | undefined}
            editingSeries={series}
            onComplete={onClose}
            onCancel={onClose}
          />
        )}
      </DetailSheet>
    );
  }

  return (
    <DetailSheet
      open
      onClose={onClose}
      title={series.title}
      subtitle={t('recurringTasks.recurringBadge', '🔁 Recurring task')}
      size="xl"
      headerActions={
        canManage ? (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            {t('recurringTasks.edit', 'Edit')}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {/* Row 1: Task Details + Schedule (mirrors TaskDetailClient layout) */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Task Details card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t('recurringTasks.status', 'Status')} &amp; {t('tasksClient.priority', 'Priority')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('common.status')}</span>
                <Badge variant={series.isActive ? 'default' : 'outline'}>
                  {series.isActive
                    ? t('recurringTasks.active', 'Active')
                    : t('recurringTasks.pausedBadge', 'Paused')}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('tasksClient.priority')}</span>
                <Badge variant="secondary">{t(`tasks.priority.${series.priority}`)}</Badge>
              </div>
              {series.description && (
                <div className="border-t border-(--border) pt-3">
                  <p className="text-sm text-muted-foreground">{series.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Schedule card (mirrors Timeline card) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                {t('recurringTasks.schedule', 'Schedule')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm font-medium">🔁 {describeRule()}</p>
              {series.startDate && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t('taskWizard.steps.repeat.startDateLabel', 'Starts on')}
                  </span>
                  <span className="font-medium text-sm">{series.startDate}</span>
                </div>
              )}
              {series.endDate && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t('taskWizard.steps.repeat.endDateLabel', 'Ends on')}
                  </span>
                  <span className="font-medium text-sm">{series.endDate}</span>
                </div>
              )}
              {series.deadlineOffsetDays != null && series.deadlineOffsetDays > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t('taskWizard.steps.repeat.offsetLabel', 'Deadline offset')}
                  </span>
                  <span className="font-medium text-sm">{series.deadlineOffsetDays}d</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Row 2: Assignee + Generated instances */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Assignee card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t('tasksClient.assignee', 'Assignee')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {series.assignedToUser || series.assignedToName ? (
                <div className="flex items-center gap-2">
                  <Avatar
                    name={series.assignedToUser?.name ?? series.assignedToName ?? '?'}
                    url={series.assignedToUser?.avatarUrl ?? series.assignedToAvatar}
                    size="sm"
                  />
                  <span className="font-medium">
                    {series.assignedToUser?.name ?? series.assignedToName ?? series.assignedTo}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('tasksTable.unassigned', 'Unassigned')}
                </p>
              )}

              {/* Co-assignees */}
              {series.coAssignees && series.coAssignees.length > 0 && (
                <div className="border-t border-(--border) pt-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    {t('tasksClient.alsoWorking', 'Also working on this')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {series.coAssignees.map(
                      (ca: { _id: string; name: string; avatarUrl?: string | null }) => (
                        <div key={ca._id} className="flex items-center gap-1.5">
                          <Avatar name={ca.name} url={ca.avatarUrl} size="sm" />
                          <span className="text-sm">{ca.name}</span>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Generated instances card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                {t('recurringTasks.generated', 'Generated')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm font-medium">
                {t('recurringTasks.generatedCount', { count: series.generatedCount ?? 0 })}
              </p>
              {series.nextOccurrence && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t('recurringTasks.nextRun', { date: series.nextOccurrence })}
                  </span>
                </div>
              )}
              {/* Comment count */}
              {series.commentCount != null && series.commentCount > 0 && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MessageSquare className="h-4 w-4" />
                  {t('recurringTasks.commentCount', { count: series.commentCount })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Subtasks template */}
        {series.subtaskTemplates && series.subtaskTemplates.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t('tasksClient.subtasks', 'Subtasks')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {series.subtaskTemplates.map((st: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-4 h-4 rounded border border-(--border) shrink-0" />
                    <span>{st.title}</span>
                    {st.priority && st.priority !== 'medium' && (
                      <Badge variant="secondary" className="text-xs">
                        {t(`tasks.priority.${st.priority}`)}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Checklist template */}
        {series.checklistTemplates && series.checklistTemplates.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                {t('tasksClient.checklist', 'Checklist')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {series.checklistTemplates.map((cl: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-4 h-4 rounded border border-(--border) shrink-0" />
                    <span>{cl.title}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tags */}
        {series.tags && series.tags.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                {t('tasksClient.tags', 'Tags')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {series.tags.map((tag: string, i: number) => (
                  <Badge key={i} variant="secondary">
                    #{tag}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Comments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {t('tasksClient.comments', 'Comments')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {comments && comments.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t('tasksClient.noComments', 'No comments yet')}
              </p>
            )}
            {comments &&
              comments.map((c: any) => (
                <div key={c._id} className="flex gap-3">
                  <Avatar name={c.authorName ?? '?'} url={c.authorAvatar} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{c.authorName}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{c.content}</p>
                  </div>
                </div>
              ))}
            <form onSubmit={(e) => void handleCommentSubmit(e)} className="flex gap-2">
              <Input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={t('tasksClient.writeComment', 'Write a comment...')}
                className="flex-1"
                disabled={isPosting}
              />
              <Button type="submit" size="sm" disabled={!commentText.trim() || isPosting}>
                {t('tasksClient.post', 'Post')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DetailSheet>
  );
}

interface TasksClientProps {
  userId: string;
  userRole: 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';
}

export const TasksClient = memo(function TasksClient({ userId, userRole }: TasksClientProps) {
  const { t, i18n } = useTranslation();
  const mainRef = useMainRef();
  const kanbanScrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  /**
   * Filters, sort, grouping and view mode live in one object because they are
   * one thing: the view. That is what a shared link carries (see
   * `@/lib/taskViewState`), so keeping them as nine separate `useState` calls
   * would mean nine places to remember when serializing.
   */
  const [viewState, setViewState] = useState<TaskViewState>(DEFAULT_TASK_VIEW);
  const patchView = useCallback((patch: Partial<TaskViewState>) => {
    setViewState((prev) => ({ ...prev, ...patch }));
  }, []);
  const {
    view: viewMode,
    sort: sortBy,
    dir: sortDir,
    group: groupBy,
    status: filterStatus,
    priority: filterPriority,
    assignee: filterEmployee,
    project: filterProject,
    q: search,
    overdue: filterOverdue,
  } = viewState;

  /** Layout choices are per person, not per link. */
  const {
    prefs,
    setPrefs,
    toggleColumn,
    toggleBoardColumn,
    toggleTableColumn,
    setColumnWidth,
    setColumnOrder,
    reset,
    isDefault,
  } = useTaskViewPreferences();

  const [showCreate, setShowCreate] = useState(false);

  const taskDraft = useDraftResume('create-task', !showCreate);
  /** Task shown in the slide-over, with its title for the panel header. */
  const [sheetTask, setSheetTask] = useState<{ id: Id<'tasks'>; title: string } | null>(null);
  const [sheetInitialEditing, setSheetInitialEditing] = useState(false);
  /** Recurring series being edited — opens the CreateTaskWizard in edit mode. */
  const [editingRecurring, setEditingRecurring] = useState<any | null>(null);
  /** Inline rename: set to a task id to show a rename input, null to hide. */
  const [renamingTaskId, setRenamingTaskId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showAssign, setShowAssign] = useState(false);
  const [_activeTask, setActiveTask] = useState<TaskItem | null>(null);
  const [_isPending, startTransition] = useTransition();

  /**
   * The address bar is the source of truth for the view, so a link someone
   * pasted is honoured on mount and every later change is written back.
   *
   * `history.replaceState` rather than `router.replace`: this page owns the
   * whole query string, nothing on the server reads it, and a Next.js
   * navigation per keystroke would re-render the route tree for a filter
   * change. Reading `window.location` in an effect instead of `useSearchParams`
   * keeps the page out of a Suspense boundary for the same reason.
   */
  const urlSynced = useRef(false);
  /**
   * True when the link that opened this page carried a view.
   *
   * Recorded rather than re-derived because a saved default view must not
   * overwrite a pasted link — see the effect that applies it. By the time the
   * views query resolves, `viewState` no longer says where it came from.
   */
  const urlProvidedView = useRef(false);
  useEffect(() => {
    urlSynced.current = true;
    const fromUrl = decodeTaskView(window.location.search);
    if (encodeTaskView(fromUrl) !== '') {
      urlProvidedView.current = true;
      setViewState(fromUrl);
    }
  }, []);

  useEffect(() => {
    if (!urlSynced.current) return;
    const query = encodeTaskView(viewState);
    const next = query === '' ? window.location.pathname : `${window.location.pathname}?${query}`;
    window.history.replaceState(window.history.state, '', next);
  }, [viewState]);

  // `/` is the search shortcut everywhere else in this app; the hook ignores it
  // while the user is already typing in a field.
  useGlobalShortcut({ key: '/' }, () => searchRef.current?.focus());

  // ── Notification highlight ─────────────────────────────────────
  // When navigated from a notification with ?highlight=<taskId>, the
  // matching row blinks for 4 seconds so the user spots it immediately.
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hl = params.get('highlight');
    if (hl) {
      setHighlightTaskId(hl);
      // Clear highlight after animation
      const timer = setTimeout(() => setHighlightTaskId(null), 4000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const mainEl = mainRef.current;
    // Each view scrolls in its own container, so the page starts at the top
    // whenever the user switches between them.
    if (mainEl) mainEl.scrollTop = 0;
  }, [mainRef, viewMode]);

  const convexId = userId && userId !== '' ? (userId as Id<'users'>) : null;
  // Superadmins can manage tasks like admins (they see all org tasks too).
  const canManage = userRole === 'admin' || userRole === 'supervisor' || userRole === 'superadmin';
  // Employees may create their own tasks (backend enforces self-assignment);
  // drivers have no task-creation surface anywhere in the app.
  const canCreate = canManage || userRole === 'employee';
  const isSuperadmin = userRole === 'superadmin';
  const selectedOrgId = useSelectedOrganization();

  // For superadmin, use selectedOrgId if available; for admin, use their org from user
  const effectiveOrgId = isSuperadmin && selectedOrgId ? selectedOrgId : undefined;

  // DnD sensors — mouse: 5px distance, touch: 1s hold to prevent accidental drags while scrolling
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 1000, tolerance: 5 } }),
  );
  const { updateOptimistic } = useOptimisticTaskStatus();
  const { updateRecurringOptimistic } = useRecurringTaskStatus();
  const [optimisticStatuses, setOptimisticStatuses] = useState<Map<string, { status: Status; at: number }>>(new Map());

  /**
   * Open a task in the panel instead of navigating.
   *
   * The kanban board is why this matters most here: a column layout is a spatial
   * memory aid, and leaving the page destroys the arrangement the user was
   * reading. The title is captured now so the panel header has something to show
   * before the task query resolves.
   */
  const openTask = useCallback(
    (task: { _id: string } & TitledTask) => {
      // Recurring series open in the CreateTaskWizard edit sheet.
      if ((task as TaskItem)._type === 'recurring') {
        setEditingRecurring(task as any);
        return;
      }
      setSheetTask({ id: task._id as Id<'tasks'>, title: localizedTaskTitle(t, task) });
    },
    [t],
  );

  /** Context menu: open the edit form for a task. */
  const handleContextMenuEdit = useCallback((task: ContextTask) => {
    if (task._type === 'recurring') {
      setEditingRecurring(task);
    } else {
      setSheetInitialEditing(true);
      setSheetTask({ id: task._id as Id<'tasks'>, title: task.title });
    }
  }, []);

  /** Context menu: start inline rename. */
  const handleContextMenuRename = useCallback((task: ContextTask) => {
    setRenamingTaskId(task._id);
    setRenameValue(task.title);
  }, []);

  // Queries — one visibility rule for every role, decided server-side by the
  // reporting line (see convex/tasks.ts `getVisibleTasks`): employees and
  // supervisors see their branch, admins/superadmins see the whole org.
  const visibleTasks = useQuery(
    api.tasks.getVisibleTasks,
    convexId
      ? {
          selectedOrganizationId: effectiveOrgId
            ? (effectiveOrgId as Id<'organizations'>)
            : undefined,
        }
      : 'skip',
  );

  const rawTasks = visibleTasks;
  const rawTasksRef = useRef(rawTasks);
  rawTasksRef.current = rawTasks;

  // Active recurring series, shown as a compact strip above the board. The
  // query scopes server-side: managers see every series in the org, everyone
  // else only the ones pointed at them (or created by them).

  // Merge optimistic updates with raw tasks for instant UI feedback
  const rawTasksWithOptimistic = useMemo(() => {
    if (!rawTasks) return rawTasks;
    if (optimisticStatuses.size === 0) return rawTasks;
    return rawTasks.map((task) => {
      const entry = optimisticStatuses.get(task._id);
      if (entry) {
        // Override BOTH status (canonical) and statusKey so that resolveStatus
        // sees the new key first and places the card in the correct column.
        return { ...task, status: entry.status, statusKey: entry.status };
      }
      return task;
    });
  }, [rawTasks, optimisticStatuses]);

  // Unique employees from tasks (for admin/supervisor filter)
  const employees = useMemo(() => {
    if (!rawTasksWithOptimistic || !canManage) return [];
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        avatarUrl?: string | null;
        department?: string;
        taskCount: number;
      }
    >();
    rawTasksWithOptimistic.forEach((t) => {
      const u = t.assignedToUser;
      if (!u?._id) return;
      const existing = map.get(u._id);
      if (existing) {
        existing.taskCount++;
      } else {
        map.set(u._id, {
          id: u._id,
          name: u.name || '?',
          avatarUrl: u.avatarUrl,
          department: u.department,
          taskCount: 1,
        });
      }
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rawTasksWithOptimistic, canManage]);

  // Project options for the filter — built from the loaded tasks themselves,
  // so it works for every role without an extra query. Tasks without a project
  // are grouped under "Without project".
  const projectFilterOptions = useMemo(() => {
    if (!rawTasksWithOptimistic) return [];
    const counts = new Map<string, { name: string; count: number }>();
    let unassignedCount = 0;
    rawTasksWithOptimistic.forEach((t) => {
      if (!t.projectId) {
        unassignedCount++;
        return;
      }
      const existing = counts.get(t.projectId);
      if (existing) {
        existing.count++;
      } else {
        counts.set(t.projectId, { name: t.projectName || t.projectId, count: 1 });
      }
    });
    const options: { value: string; label: string }[] = [];
    if (unassignedCount > 0) {
      options.push({
        value: 'none',
        label: `${t('tasksClient.noProject', 'Without project')} (${unassignedCount})`,
      });
    }
    [...counts.entries()]
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .forEach(([id, v]) => options.push({ value: id, label: `${v.name} (${v.count})` }));
    return options;
  }, [rawTasksWithOptimistic, t]);

  // Guard: if the selected project disappears from the available options (its
  // tasks were unlinked or deleted, or "without project" ran out of tasks),
  // reset to "all projects" instead of leaving a stale, dead selection.
  const projectFilterValues = useMemo(
    () => new Set<string>(['all', ...projectFilterOptions.map((o) => o.value)]),
    [projectFilterOptions],
  );
  useEffect(() => {
    if (!projectFilterValues.has(filterProject)) {
      patchView({ project: 'all' });
    }
  }, [projectFilterValues, filterProject, patchView]);

  // ── Board configuration and grid writes ────────────────────────────────────
  /**
   * The grid's server side: the status set this board uses, the custom columns it
   * has, the views saved on it, and every write a cell can make.
   *
   * Shared with the project page through `useTaskGrid` rather than written twice,
   * because both draw the same table and a cell edit has to mean the same thing
   * on either. What stays here is the view state — on this page the view *is* the
   * URL, which is what makes a board shareable, and a project page has no such
   * requirement.
   */
  const {
    statuses,
    fields,
    fieldMap,
    savedViews,
    viewTabs,
    cellUsers,
    filterProjects,
    projectNameOf,
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
  } = useTaskGrid(
    {
      ...(effectiveOrgId ? { organizationId: effectiveOrgId } : {}),
      ...(convexId ? { viewerId: convexId } : {}),
      enabled: !!convexId,
    },
    rawTasksWithOptimistic,
  );

  // Auto-clean optimistic status entries:
  // 1. Server matches optimistic → Convex delivered the update, safe to remove
  // 2. Server differs AND entry >1s old → mutation completed and either Convex
  //    delivered the confirmed status or the user clicked Undo (revert)
  // 3. Hard expiry at 3s via interval — ensures Undo always works
  useEffect(() => {
    if (optimisticStatuses.size === 0) return;
    const GRACE_MS = 1_000;   // wait for mutation to complete
    const MAX_AGE_MS = 3_000; // hard expiry — ensures Undo always works
    const interval = setInterval(() => {
      setOptimisticStatuses((prev) => {
        if (prev.size === 0) return prev;
        const now = Date.now();
        let changed = false;
        const next = new Map(prev);
        for (const [taskId, entry] of prev) {
          const age = now - entry.at;
          if (age > MAX_AGE_MS) {
            next.delete(taskId);
            changed = true;
            continue;
          }
          // Also check server data for faster cleanup
          const serverTask = rawTasksRef.current?.find((t) => t._id === taskId);
          if (serverTask) {
            const resolved = statuses
              ? resolveStatus({ status: serverTask.status as any, statusKey: serverTask.statusKey }, statuses)
              : null;
            const serverKey = (resolved?.key ?? serverTask.status) as Status;
            if (
              serverKey === entry.status || // Convex delivered confirmed status
              (serverKey !== entry.status && age > GRACE_MS) // revert happened
            ) {
              next.delete(taskId);
              changed = true;
            }
          }
        }
        return changed ? next : prev;
      });
    }, 500); // check every 500ms
    return () => clearInterval(interval);
  }, [optimisticStatuses.size, statuses]);

  // ── Saved views ────────────────────────────────────────────────────────────
  /** `taskViews.type` names the modes differently: the kanban is a "board". */
  const savedViewType = viewMode === 'kanban' ? 'board' : viewMode;

  const activeSavedView = savedViews?.find((view) => view._id === viewState.viewId);
  /** True once the board stops matching the tab it is showing under. */
  const viewDirty =
    !!activeSavedView &&
    !sameTaskView(viewState, fromSavedView(activeSavedView.state, activeSavedView._id));

  const selectView = useCallback(
    (viewId: string) => {
      if (viewId === '') {
        patchView({ viewId: '' });
        return;
      }
      const view = savedViews?.find((candidate) => candidate._id === viewId);
      if (view) setViewState(fromSavedView(view.state, view._id));
    },
    [savedViews, patchView],
  );

  // ── Soft-delete / restore mutations ──────────────────────────────────────
  const deleteTaskMutation = useMutation(api.tasks.deleteTask);
  const restoreTaskMutation = useMutation(api.tasks.restoreTask);

  /** Context menu: delete a single task. */
  const handleDeleteSingle = useCallback(
    (task: ContextTask) => {
      const deletedTitle = task.title;
      const deletedId = task._id;
      void deleteTaskMutation({ taskId: deletedId as any }).then(() => {
        toast.success(t('tasksClient.taskDeleted', 'Task deleted'), {
          description: deletedTitle,
          action: {
            label: t('undo', 'Undo'),
            onClick: () => {
              void restoreTaskMutation({ taskId: deletedId as any }).then(() => {
                toast.success(t('tasksClient.taskRestored', 'Task restored'));
              });
            },
          },
          duration: 8000,
        });
      });
    },
    [deleteTaskMutation, restoreTaskMutation, t],
  );

  /** Context menu: set priority. */
  const handleContextMenuPriority = useCallback(
    (taskId: string, priority: string) => {
      void handlePatchTask(taskId, { priority: priority as any });
    },
    [handlePatchTask],
  );

  /** Context menu: toggle active/paused for recurring series. */
  const handleToggleActive = useCallback(
    (task: ContextTask) => {
      if (task._type !== 'recurring') return;
      const newStatus = task.status === 'cancelled' ? 'in_progress' : 'cancelled';
      handleSetStatus(task._id, newStatus);
    },
    [handleSetStatus],
  );

  /**
   * A default view is what the board opens as — unless the link says otherwise.
   *
   * A pasted link always wins. Otherwise sharing a filtered board with a
   * colleague whose default is set would show them their own board and quietly
   * lose whatever was being pointed at.
   */
  const defaultViewApplied = useRef(false);
  useEffect(() => {
    if (!urlSynced.current || defaultViewApplied.current || !savedViews) return;
    defaultViewApplied.current = true;
    if (urlProvidedView.current) return;
    const preset = savedViews.find((view) => view.isDefault);
    if (preset) setViewState(fromSavedView(preset.state, preset._id));
  }, [savedViews]);

  /**
   * Saving the board as a tab, then showing it under that tab's name.
   *
   * The `viewId` is set only once the server has one, so a failed save leaves the
   * board unsaved and visibly so, rather than pointing the URL at a view that
   * does not exist.
   */
  const handleCreateView = useCallback(
    (name: string, visibility: 'private' | 'team') => {
      void (async () => {
        const viewId = await createView({
          name,
          type: savedViewType,
          state: toSavedView(viewState),
          visibility,
        });
        if (viewId) patchView({ viewId });
      })();
    },
    [createView, savedViewType, viewState, patchView],
  );

  const handleUpdateView = useCallback(
    (viewId: string) => {
      updateViewState(viewId, savedViewType, toSavedView(viewState));
    },
    [updateViewState, savedViewType, viewState],
  );

  const handleDeleteView = useCallback(
    (viewId: string) => {
      void (async () => {
        await removeView(viewId);
        // The board keeps its filters — only the name it was showing under is
        // gone, and silently resetting the view on a delete would look like the
        // delete had done something else as well.
        setViewState((prev) => (prev.viewId === viewId ? { ...prev, viewId: '' } : prev));
      })();
    },
    [removeView],
  );

  const setFilters = useCallback(
    (filters: TaskFilterCondition[]) => patchView({ filters }),
    [patchView],
  );

  /**
   * Conditions that are actually narrowing, for the badge and the summary chip.
   *
   * Not `filters.length`: the builder pushes a condition up the moment its
   * operator is chosen, so counting them all would say "1 Filter" about a row
   * that has not been told what to filter by yet.
   */
  const activeConditions = useMemo(
    () => viewState.filters.filter(isEffectiveCondition).length,
    [viewState.filters],
  );

  // Filter + Sort
  const tasks = useMemo(() => {
    if (!rawTasksWithOptimistic) return [];
    // One `now` for the whole pass so a task cannot be overdue in one row and
    // not in the next while the list is being built.
    const now = Date.now();
    const filtered = rawTasksWithOptimistic.filter((t) => {
      // Resolve status through org definitions so recurring tasks with
      // mismatched status/statusKey are treated consistently everywhere.
      const rKey = statuses
        ? (resolveStatus({ status: t.status as any, statusKey: t.statusKey }, statuses)
            .key as Status)
        : (t.status as Status);
      const matchPriority = filterPriority === 'all' || t.priority === filterPriority;
      const matchStatus = filterStatus === 'all' || rKey === filterStatus;
      const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase());
      const matchEmployee = filterEmployee === 'all' || t.assignedToUser?._id === filterEmployee;
      const matchProject =
        filterProject === 'all' ||
        (filterProject === 'none' ? !t.projectId : t.projectId === filterProject);
      const matchOverdue =
        !filterOverdue ||
        (!!t.deadline && t.deadline < now && rKey !== 'completed' && rKey !== 'cancelled');
      // A layout preference, not a filter: it is deliberately not in the link,
      // so a shared view never silently hides finished work from the recipient.
      const matchCompleted = !prefs.hideCompleted || rKey !== 'completed';
      // Tab: 'recurring' shows only recurring series; 'all' shows everything.
      const matchTab = viewState.tab === 'all' || (t as any)._type === 'recurring';
      return (
        matchPriority &&
        matchStatus &&
        matchSearch &&
        matchEmployee &&
        matchProject &&
        matchOverdue &&
        matchCompleted &&
        matchTab
      );
    });
    /**
     * The filter builder's conditions, ANDed onto the dropdowns above.
     *
     * Applied here rather than inside the table so every view narrows the same
     * way: a link that says "urgent, overdue, Category = Rent" has to mean the
     * same board whether the recipient opens it as a list, a kanban or a grid.
     */
    const narrowed = applyTaskFilters(filtered, viewState.filters, fieldMap);
    const priorityOrder: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    const statusOrder: Record<Status, number> = {
      pending: 0,
      in_progress: 1,
      review: 2,
      completed: 3,
      cancelled: 4,
    };
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...narrowed].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return dir * a.title.localeCompare(b.title);
        case 'deadline':
          return dir * ((a.deadline ?? Infinity) - (b.deadline ?? Infinity));
        case 'priority':
          return (
            dir *
            ((priorityOrder[a.priority as Priority] ?? 4) -
              (priorityOrder[b.priority as Priority] ?? 4))
          );
        case 'status':
          return (
            dir * ((statusOrder[a.status as Status] ?? 4) - (statusOrder[b.status as Status] ?? 4))
          );
        case 'assignee':
          return (
            dir * (a.assignedToUser?.name ?? 'zzz').localeCompare(b.assignedToUser?.name ?? 'zzz')
          );
        default:
          return 0;
      }
    });
  }, [
    rawTasksWithOptimistic,
    statuses,
    filterPriority,
    filterStatus,
    search,
    filterEmployee,
    filterProject,
    filterOverdue,
    // `tab` was read by `matchTab` but missing from this list, so switching to
    // the recurring strip left the memo holding the previous filter result.
    viewState.tab,
    viewState.filters,
    fieldMap,
    prefs.hideCompleted,
    sortBy,
    sortDir,
  ]);

  // Stats — cancelled tasks are closed history: the kanban has no column for
  // them and overdue ignores them, so "total" counts active work only and the
  // cards always add up to what the board shows.
  const stats = useMemo(() => {
    const all = rawTasksWithOptimistic ?? [];
    /** Resolve the status key through org definitions so recurring tasks
     *  with mismatched status/statusKey show up in the correct bucket. */
    const resolvedKey = (t: (typeof all)[number]) => {
      const r = statuses
        ? resolveStatus({ status: t.status as any, statusKey: t.statusKey }, statuses)
        : null;
      return (r?.key ?? t.status) as Status;
    };
    return {
      total: all.filter((t) => resolvedKey(t) !== 'cancelled').length,
      pending: all.filter((t) => resolvedKey(t) === 'pending').length,
      inProgress: all.filter((t) => resolvedKey(t) === 'in_progress').length,
      review: all.filter((t) => resolvedKey(t) === 'review').length,
      completed: all.filter((t) => resolvedKey(t) === 'completed').length,
      overdue: all.filter(
        (t) =>
          t.deadline &&
          t.deadline < Date.now() &&
          resolvedKey(t) !== 'completed' &&
          resolvedKey(t) !== 'cancelled',
      ).length,
    };
  }, [rawTasksWithOptimistic, statuses]);

  const tasksByStatus = useMemo(() => {
    const map: Record<Status, TaskItem[]> = {
      pending: [],
      in_progress: [],
      review: [],
      completed: [],
      cancelled: [],
    };
    tasks.forEach((t) => {
      // Use resolveStatus so recurring tasks with mismatched status/statusKey
      // land in the correct section (same logic as the Table view).
      const resolved = statuses
        ? resolveStatus({ status: t.status as any, statusKey: t.statusKey }, statuses)
        : null;
      const key = (resolved?.key ?? t.status) as Status;
      if (map[key]) map[key].push(t);
      else map.pending.push(t);
    });
    return map;
  }, [tasks, statuses]);

  // Group tasks for section-based view
  const sections = useMemo(() => {
    if (groupBy === 'status') {
      const sectionOrder: Status[] = ['pending', 'in_progress', 'review', 'completed'];
      return sectionOrder.map((status) => ({
        key: status,
        label: t(STATUS_CONFIG[status].labelKey),
        tasks: tasks.filter((t) => {
          // Use resolveStatus so recurring tasks with mismatched status/statusKey
          // land in the correct section (same logic as the Table view).
          const resolved = statuses
            ? resolveStatus({ status: t.status as any, statusKey: t.statusKey }, statuses)
            : null;
          return (resolved?.key ?? t.status) === status;
        }),
      }));
    }
    if (groupBy === 'priority') {
      const order: Priority[] = ['urgent', 'high', 'medium', 'low'];
      return order.map((p) => ({
        key: p,
        label: t(PRIORITY_CONFIG[p].labelKey),
        tasks: tasks.filter((t) => t.priority === p),
      }));
    }
    if (groupBy === 'project') {
      const map = new Map<string, { label: string; tasks: typeof tasks }>();
      tasks.forEach((tk) => {
        const key = tk.projectId ?? '__none__';
        const existing = map.get(key);
        if (existing) existing.tasks.push(tk);
        else map.set(key, { label: tk.projectName || 'No project', tasks: [tk] });
      });
      return [...map.entries()].map(([key, v]) => ({ key, label: v.label, tasks: v.tasks }));
    }
    // groupBy === 'assignee'
    // Anything else — "none", or a custom field picked while the grid was open —
    // becomes one section rather than falling through to people, which would be
    // a heading that quietly says something the view was never asked for.
    if (groupBy !== 'assignee') {
      return [{ key: '__all__', label: t('tasksClient.allTasks', 'All Tasks'), tasks }];
    }
    const map = new Map<string, { label: string; tasks: typeof tasks }>();
    tasks.forEach((tk) => {
      const key = tk.assignedToUser?._id ?? '__unassigned__';
      const name = tk.assignedToUser?.name || 'Unassigned';
      const existing = map.get(key);
      if (existing) existing.tasks.push(tk);
      else map.set(key, { label: name, tasks: [tk] });
    });
    return [...map.entries()].map(([key, v]) => ({ key, label: v.label, tasks: v.tasks }));
  }, [tasks, groupBy, t, statuses]);

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) patchView({ dir: sortDir === 'asc' ? 'desc' : 'asc' });
    else patchView({ sort: field, dir: 'asc' });
  };

  // ── Summary tiles ──────────────────────────────────────────────────────────
  // Clicking a tile narrows the board to it; clicking the active one clears the
  // narrowing, so a tile is a toggle rather than a dead end. "All" is the way
  // back regardless of what is selected.
  const selectStat = useCallback(
    (key: string) => {
      if (key === 'total') {
        patchView({ status: 'all', overdue: false });
        return;
      }
      if (key === 'overdue') {
        patchView({ overdue: !filterOverdue, status: 'all' });
        return;
      }
      patchView({ status: filterStatus === key ? 'all' : key, overdue: false });
    },
    [patchView, filterOverdue, filterStatus],
  );

  const statItems = useMemo<TaskStatItem[]>(() => {
    const noNarrowing = filterStatus === 'all' && !filterOverdue;
    return [
      {
        key: 'total',
        label: t('tasksClient.total', 'Total'),
        count: stats.total,
        tone: 'neutral' as const,
        active: noNarrowing,
      },
      {
        key: 'pending',
        label: t('tasks.status.pending', 'Pending'),
        count: stats.pending,
        tone: 'neutral' as const,
        active: filterStatus === 'pending',
      },
      {
        key: 'in_progress',
        label: t('tasks.status.inProgress', 'In progress'),
        count: stats.inProgress,
        tone: 'brand' as const,
        active: filterStatus === 'in_progress',
      },
      {
        key: 'review',
        label: t('tasks.status.review', 'Review'),
        count: stats.review,
        tone: 'warning' as const,
        active: filterStatus === 'review',
      },
      {
        key: 'completed',
        label: t('tasks.status.completed', 'Completed'),
        count: stats.completed,
        tone: 'success' as const,
        active: filterStatus === 'completed',
      },
      {
        key: 'overdue',
        label: t('tasksClient.overdue', 'Overdue'),
        count: stats.overdue,
        tone: 'danger' as const,
        active: filterOverdue,
      },
    ];
  }, [stats, filterStatus, filterOverdue, t]);

  // ── Active filters, as chips ───────────────────────────────────────────────
  const activeFilterCount = countActiveFilters(viewState);

  const filterChips = useMemo<TaskFilterChip[]>(() => {
    const chips: TaskFilterChip[] = [];
    if (filterStatus !== 'all') {
      chips.push({
        key: 'status',
        field: t('common.status', 'Status'),
        value: t(STATUS_CONFIG[filterStatus as Status]?.labelKey ?? filterStatus),
      });
    }
    if (filterPriority !== 'all') {
      chips.push({
        key: 'priority',
        field: t('tasksClient.priority', 'Priority'),
        value: t(PRIORITY_CONFIG[filterPriority as Priority]?.labelKey ?? filterPriority),
      });
    }
    if (filterEmployee !== 'all') {
      chips.push({
        key: 'assignee',
        field: t('tasksClient.assignee', 'Assignee'),
        value: employees.find((e) => e.id === filterEmployee)?.name ?? filterEmployee,
      });
    }
    if (filterProject !== 'all') {
      const label =
        filterProject === 'none'
          ? t('tasksClient.noProject', 'Without project')
          : (rawTasksWithOptimistic?.find((tk) => tk.projectId === filterProject)?.projectName ??
            filterProject);
      chips.push({ key: 'project', field: t('tasksClient.project', 'Project'), value: label });
    }
    if (filterOverdue) {
      chips.push({
        key: 'overdue',
        field: t('tasksClient.deadline', 'Due date'),
        value: t('tasksClient.overdue', 'Overdue'),
      });
    }
    if (search.trim() !== '') {
      chips.push({ key: 'q', field: t('common.search', 'Search'), value: search.trim() });
    }
    // One chip for the builder rather than one per condition: the conditions
    // already read as sentences inside the Filter panel, and repeating them here
    // would push the dropdown chips off the row. Removing it clears the lot,
    // which is what "×" on a summary chip should do.
    if (activeConditions > 0) {
      chips.push({
        key: 'conditions',
        field: t('tasksTable.filter', 'Filter'),
        value: t('tasksTable.filterCount', {
          count: activeConditions,
          defaultValue: '{{count}} condition(s)',
        }),
      });
    }
    return chips;
  }, [
    filterStatus,
    filterPriority,
    filterEmployee,
    filterProject,
    filterOverdue,
    search,
    activeConditions,
    employees,
    rawTasksWithOptimistic,
    t,
  ]);

  const removeChip = useCallback(
    (key: string) => {
      switch (key) {
        case 'status':
          patchView({ status: 'all' });
          break;
        case 'priority':
          patchView({ priority: 'all' });
          break;
        case 'assignee':
          patchView({ assignee: 'all' });
          break;
        case 'project':
          patchView({ project: 'all' });
          break;
        case 'overdue':
          patchView({ overdue: false });
          break;
        case 'q':
          patchView({ q: '' });
          break;
        case 'conditions':
          patchView({ filters: [] });
          break;
      }
    },
    [patchView],
  );

  const clearAllFilters = useCallback(() => {
    setViewState((prev) => clearTaskFilters(prev));
  }, []);

  // ── Share payloads ─────────────────────────────────────────────────────────
  const boardTitle =
    userRole === 'employee' || userRole === 'driver'
      ? t('tasksClient.myTasks')
      : t('tasksClient.taskManager');

  const dateLocale =
    i18n?.language === 'ru' ? 'ru-RU' : i18n?.language === 'hy' ? 'hy-AM' : 'en-GB';

  /**
   * Absolute link to the current view. The origin is read after mount rather
   * than during render: the server has no idea which host the browser used, and
   * guessing would produce a link that works for nobody.
   */
  const [locationBase, setLocationBase] = useState({ origin: '', pathname: '/tasks' });
  useEffect(() => {
    setLocationBase({ origin: window.location.origin, pathname: window.location.pathname });
  }, []);
  const shareLink = useMemo(() => taskViewLink(viewState, locationBase), [viewState, locationBase]);

  /** Kanban lanes the user kept on; at least one is guaranteed by the hook. */
  const visibleBoardColumns = useMemo<TaskBoardColumnKey[]>(
    () => TASK_BOARD_COLUMN_KEYS.filter((key) => prefs.board[key]),
    [prefs.board],
  );

  /**
   * The list grid was a hardcoded five-column template, so hiding a column was
   * impossible and priority — the field people sort by most — had nowhere to go.
   * It is now derived from the preferences, header and rows sharing one style
   * object so they cannot drift apart.
   */
  const listColumnOrder = useMemo(
    () =>
      (
        [
          ['deadline', '130px'],
          ['assignee', '150px'],
          ['project', '140px'],
          ['priority', '120px'],
          ['status', '110px'],
        ] as const
      ).filter(([key]) => prefs.columns[key]),
    [prefs.columns],
  );
  const listGridStyle = useMemo(
    () => ({
      gridTemplateColumns: ['minmax(0,2.5fr)', ...listColumnOrder.map(([, w]) => w)].join(' '),
    }),
    [listColumnOrder],
  );
  const cellPad = prefs.density === 'compact' ? 'px-3 py-1' : 'px-4 py-2';

  /** Built only when the user actually opens an export — see ShareViewMenu. */
  const exportRow = useCallback(
    (task: TaskItem): ExportTaskRow => ({
      title: localizedTaskTitle(t, task),
      status: t(STATUS_CONFIG[task.status as Status].labelKey),
      priority: t(PRIORITY_CONFIG[task.priority as Priority].labelKey),
      done: task.status === 'completed',
      deadline: task.deadline ? new Date(task.deadline).toLocaleDateString(dateLocale) : undefined,
      assignee: task.assignedToUser?.name ?? undefined,
      project: task.projectName ?? undefined,
      tags: task.tags,
    }),
    [t, dateLocale],
  );

  const buildCsv = useCallback(
    () =>
      tasksToCsv(tasks.map(exportRow), {
        title: t('tasksClient.task', 'Name'),
        status: t('common.status', 'Status'),
        priority: t('tasksClient.priority', 'Priority'),
        deadline: t('tasksClient.deadline', 'Due date'),
        assignee: t('tasksClient.assignee', 'Assignee'),
        project: t('tasksClient.project', 'Project'),
        tags: t('tasksClient.tags', 'Tags'),
      }),
    [tasks, exportRow, t],
  );

  const buildMarkdown = useCallback(
    () =>
      tasksToMarkdown(
        sections.map((section) => ({
          label: section.label,
          tasks: section.tasks.map(exportRow),
        })),
        {
          title: boardTitle,
          url: shareLink,
          emptyLabel: t('tasksClient.noTasksFound'),
        },
      ),
    [sections, exportRow, boardTitle, shareLink, t],
  );

  // ── Stable DnD callbacks for the List view ──────────────────────────────
  // Extracted from inline arrows so that @dnd-kit's internal useLayoutEffect
  // never sees a changing dependency array.
  const handleListDragStart = useCallback(
    (e: DragStartEvent) => {
      const task = tasks.find((t) => t._id === e.active.id);
      setActiveTask(task ?? null);
    },
    [tasks],
  );

  const handleListDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      setActiveTask(null);
      if (!over || !convexId) return;
      const task = tasks.find((t) => t._id === active.id);
      if (!task) return;
      const overData = over.data.current;
      // If dropped on a droppable section, over.id is the status key
      const overStatus =
        overData?.type === 'list-section'
          ? (over.id as string)
          : (overData?.status as string | undefined);
      if (!overStatus) return;
      // Resolve the task's current status through org definitions so
      // custom statuses are compared against the right canonical key.
      const resolvedCurrent = statuses
        ? resolveStatus({ status: task.status as any, statusKey: task.statusKey }, statuses)
        : null;
      const currentStatusKey = (resolvedCurrent?.key ?? task.status) as Status;
      if (currentStatusKey === overStatus) return;
      // Set optimistic status for instant UI feedback (same as Kanban).
      flushSync(() => {
        setOptimisticStatuses((prev) => {
          const next = new Map(prev);
          next.set(task._id as string, { status: overStatus as Status, at: Date.now() });
          return next;
        });
      });
      handleSetStatus(task._id, overStatus);
    },
    [tasks, statuses, convexId, setOptimisticStatuses, handleSetStatus],
  );

  // Kanban-specific drag end: handles recurring tasks and uses column ID as status.
  const handleKanbanDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      setActiveTask(null);
      if (!over || !convexId) return;
      const newStatus = over.id as Status;
      const task = tasks.find((t) => t._id === active.id);
      if (!task) return;
      // Resolve the task's current status through org definitions so
      // custom statuses are compared against the right canonical key.
      const resolvedCurrent = statuses
        ? resolveStatus({ status: task.status as any, statusKey: task.statusKey }, statuses)
        : null;
      const currentStatusKey = (resolvedCurrent?.key ?? task.status) as Status;
      if (currentStatusKey === newStatus) return;
      // Recurring tasks live in recurringTasks table — use dedicated mutation.
      if ((task as TaskItem)._type === 'recurring') {
        flushSync(() => {
          setOptimisticStatuses((prev) => {
            const next = new Map(prev);
            next.set(task._id as string, { status: newStatus, at: Date.now() });
            return next;
          });
        });
        setActiveTask(null);
        updateRecurringOptimistic(task._id as unknown as Id<'recurringTasks'>, newStatus)
          .then(() => {
            toast.success(
              t('tasks.status.moved', { status: t(STATUS_CONFIG[newStatus].labelKey) }),
              { duration: 2000 },
            );
            // Don't clear optimistic here — let Convex reactivity deliver the
            // updated task. The useOptimisticStatusSync effect below will
            // automatically remove the entry once rawTasks catches up.
          })
          .catch(() => {
            toast.error(t('tasks.failedToUpdateStatus'));
            // On error, revert the optimistic status so the card jumps back.
            setOptimisticStatuses((prev) => {
              const next = new Map(prev);
              next.delete(task._id as string);
              return next;
            });
          });
        return;
      }
      flushSync(() => {
        setOptimisticStatuses((prev) => {
          const next = new Map(prev);
          next.set(task._id as string, { status: newStatus, at: Date.now() });
          return next;
        });
      });
      setActiveTask(null);
      updateOptimistic(task._id as Id<'tasks'>, newStatus, convexId, currentStatusKey)
        .then(() => {
          toast.success(
            t('tasks.status.moved', { status: t(STATUS_CONFIG[newStatus].labelKey) }),
            { duration: 2000 },
          );
          // Don't clear optimistic here — let Convex reactivity deliver the
          // updated task. The useOptimisticStatusSync effect below will
          // automatically remove the entry once rawTasks catches up.
        })
        .catch(() => {
          toast.error(t('tasks.failedToUpdateStatus'));
          // On error, revert the optimistic status so the card jumps back.
          setOptimisticStatuses((prev) => {
            const next = new Map(prev);
            next.delete(task._id as string);
            return next;
          });
        });
    },
    [tasks, statuses, convexId, setOptimisticStatuses, handleSetStatus, updateOptimistic, updateRecurringOptimistic, t],
  );

  const handleDndCancel = useCallback(() => setActiveTask(null), []);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ═══ Page Header ═══ */}
      {/* The title used to sit next to a circle showing the first two
          characters of the viewer's Convex id and a chevron that opened
          nothing. Both are gone: the space now carries the one thing a board
          header can usefully say — how much of the board you are looking at. */}
      <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-3 shrink-0">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-(--text-primary)">{boardTitle}</h1>
          <p className="mt-0.5 text-xs text-(--text-muted)">
            {rawTasks === undefined ? (
              t('common.loading', 'Loading…')
            ) : (
              <>
                {t('tasksClient.headerSummary', {
                  shown: tasks.length,
                  total: stats.total,
                  defaultValue: '{{shown}} of {{total}} tasks',
                })}
                {stats.overdue > 0 && (
                  <span className="font-medium text-(--danger-text)">
                    {' · '}
                    {t('tasksClient.overdueCount', {
                      count: stats.overdue,
                      defaultValue: '{{count}} overdue',
                    })}
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ShareViewMenu
            link={shareLink}
            taskCount={tasks.length}
            activeFilterLabels={filterChips.map((chip) => `${chip.field}: ${chip.value}`)}
            buildMarkdown={buildMarkdown}
            buildCsv={buildCsv}
            fileStem={exportFileStem(boardTitle || 'tasks', new Date())}
            shareTitle={boardTitle}
          />
          <CustomizeViewMenu
            prefs={prefs}
            viewMode={viewMode}
            setPrefs={setPrefs}
            toggleColumn={toggleColumn}
            toggleBoardColumn={toggleBoardColumn}
            reset={reset}
            isDefault={isDefault}
          />
        </div>
      </div>

      {/* ═══ View Tabs ═══ */}
      <div className="flex items-center gap-1 px-4 sm:px-6 border-b border-(--border) shrink-0">
        {[
          { key: 'list' as ViewMode, label: t('tasksClient.list') },
          { key: 'kanban' as ViewMode, label: t('tasksClient.board', 'Board') },
          { key: 'table' as ViewMode, label: t('tasksClient.table', 'Table') },
          { key: 'timeline' as ViewMode, label: t('tasksClient.timeline', 'Timeline') },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => startTransition(() => patchView({ view: tab.key }))}
            className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              viewMode === tab.key
                ? 'border-(--brand) text-(--brand-text)'
                : 'border-transparent text-(--text-muted) hover:text-(--text-primary)'
            }`}
          >
            {tab.label}
          </button>
        ))}
        {/* Separator */}
        <div className="ml-2 h-4 w-px bg-(--border)" />
        {/* Recurring tasks toggle */}
        {[
          { key: 'all' as const, label: t('tasksClient.allTasks', 'All Tasks') },
          { key: 'recurring' as const, label: t('tasksClient.recurringTasks', '🔁 Recurring') },
          { key: 'trash' as const, label: '🗑️ Trash' },
        ].map((tt) => (
          <button
            key={tt.key}
            onClick={() => startTransition(() => patchView({ tab: tt.key }))}
            className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              viewState.tab === tt.key
                ? 'border-(--brand) text-(--brand-text)'
                : 'border-transparent text-(--text-muted) hover:text-(--text-primary)'
            }`}
          >
            {tt.label}
          </button>
        ))}
      </div>

      {/* ═══ Saved views ═══ */}
      {/* A second row rather than more tabs above: the row above chooses how the
          board is drawn, this one chooses which board — "Payable Outstanding" is
          not a sibling of "Table". Hidden until there is a view to show, so the
          strip does not cost a row of vertical space to say nothing. */}
      {(viewTabs.length > 0 || viewMode === 'table') && (
        <div className="shrink-0 px-4 sm:px-6">
          <ViewTabs
            views={viewTabs}
            activeId={viewState.viewId}
            dirty={viewDirty}
            canShare={canManage}
            onSelect={selectView}
            onCreate={handleCreateView}
            onUpdate={handleUpdateView}
            onRename={renameView}
            onDelete={handleDeleteView}
            onSetDefault={setDefaultView}
          />
        </div>
      )}

      {/* ═══ Action Bar ═══ */}
      <div className="flex items-center gap-2 px-4 sm:px-6 py-2 border-b border-(--border) shrink-0">
        {canCreate && (
          <div className="inline-flex items-center shrink-0 rounded-lg overflow-hidden shadow-sm">
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-(--brand) text-white text-sm font-semibold hover:brightness-110 transition whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              {t('tasksClient.addTask', 'Add task')}
            </button>
          </div>
        )}

        {/* ═══ Board controls ═══ */}
        {/* Grouping and columns belong to the grid, so they appear with it: the
            list and the kanban keep the compact dropdown below, which offers
            exactly the four groupings they know how to draw. The filter builder
            is here for every view, because `applyTaskFilters` runs in the shared
            pipeline above — a filtered link means the same board in all of them. */}
        <div className="flex min-w-0 items-center gap-0.5 shrink-0">
          {viewMode === 'table' && (
            <>
              <GroupBySelector
                value={groupBy}
                fields={fields}
                onChange={(group) => patchView({ group })}
              />
              <ColumnsMenu
                fields={fields}
                layout={prefs.table}
                onToggle={toggleTableColumn}
                onReorder={setColumnOrder}
                onReset={reset}
              />
            </>
          )}
          <FilterBuilder
            filters={viewState.filters}
            fields={fields}
            statuses={statuses}
            users={cellUsers}
            projects={filterProjects}
            onChange={setFilters}
            activeCount={activeConditions}
          />
          <button
            onClick={() => {
              const header = ['Title', 'Status', 'Priority', 'Assignee', 'Deadline', 'Project'];
              const rows = tasks.map((t) => [
                t.title,
                t.status,
                t.priority,
                t.assignedToUser?.name ?? '',
                t.deadline ? new Date(t.deadline).toISOString().split('T')[0] : '',
                t.projectName ?? '',
              ]);
              const csv = [header, ...rows]
                .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
                .join('\n');
              const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `tasks-${new Date().toISOString().split('T')[0]}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-(--text-muted) hover:text-(--text-primary) hover:bg-(--background-subtle) rounded-lg transition-colors"
            title={t('tasksClient.exportCsv', 'Export CSV')}
          >
            📥 {t('tasksClient.exportCsv', 'Export CSV')}
          </button>
        </div>

        <div className="flex items-center gap-1 ml-auto overflow-x-auto scrollbar-width-none">
          <CustomSelect
            value={filterStatus}
            onChange={(v) => patchView({ status: v })}
            options={[
              { value: 'all', label: t('tasksClient.filter', 'Filter') },
              { value: 'pending', label: t('statuses.pending') },
              { value: 'in_progress', label: t('taskStatus.inProgress') },
              { value: 'review', label: t('taskStatus.inReview') },
              { value: 'completed', label: t('statuses.completed') },
            ]}
            triggerClassName="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-(--border) bg-(--background) text-xs text-(--text-secondary) hover:bg-(--background-subtle) transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            dropdownClassName="bg-(--card) border border-(--border) text-(--text-primary)"
          />
          <CustomSelect
            value={sortBy}
            onChange={(v) => toggleSort(v as typeof sortBy)}
            options={[
              { value: 'status', label: t('tasksClient.sort.status', 'Status') },
              { value: 'priority', label: t('tasksClient.sort.priority', 'Priority') },
              { value: 'deadline', label: t('tasksClient.sort.deadline', 'Due date') },
              { value: 'name', label: t('tasksClient.sort.name', 'Name') },
              { value: 'assignee', label: t('tasksClient.sort.assignee', 'Assignee') },
            ]}
            triggerClassName="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-(--border) bg-(--background) text-xs text-(--text-secondary) hover:bg-(--background-subtle) transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            dropdownClassName="bg-(--card) border border-(--border) text-(--text-primary)"
          />
          {/* Sort direction. Previously the only way to flip it was to
              re-select the field that was already selected, which reads as a
              no-op — this makes the current direction visible and reversible. */}
          <button
            type="button"
            onClick={() => patchView({ dir: sortDir === 'asc' ? 'desc' : 'asc' })}
            aria-label={
              sortDir === 'asc'
                ? t('tasksClient.sortAsc', 'Ascending — click for descending')
                : t('tasksClient.sortDesc', 'Descending — click for ascending')
            }
            className="flex shrink-0 items-center rounded-lg border border-(--border) bg-(--background) p-1.5 text-(--text-secondary) transition-colors hover:bg-(--background-subtle)"
          >
            {sortDir === 'asc' ? (
              <ArrowUpNarrowWide className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ArrowDownWideNarrow className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
          {/* The grid has its own grouping control, which also offers custom
              fields and "none". This one stays for the list and the kanban,
              whose sections are built from these four and only these four. */}
          {viewMode !== 'table' && (
            <CustomSelect
              value={groupBy}
              onChange={(v) => patchView({ group: v as typeof groupBy })}
              options={[
                { value: 'status', label: t('tasksClient.group.status', 'Status') },
                { value: 'priority', label: t('tasksClient.group.priority', 'Priority') },
                { value: 'project', label: t('tasksClient.group.project', 'Project') },
                { value: 'assignee', label: t('tasksClient.group.assignee', 'Assignee') },
              ]}
              triggerClassName="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-(--border) bg-(--background) text-xs text-(--text-secondary) hover:bg-(--background-subtle) transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              dropdownClassName="bg-(--card) border border-(--border) text-(--text-primary)"
            />
          )}
          {canManage && employees.length > 1 && (
            <CustomSelect
              value={filterEmployee}
              onChange={(v) => patchView({ assignee: v })}
              options={[
                { value: 'all', label: t('tasksClient.assignee', 'Assignee') },
                ...employees.map((e) => ({ value: e.id, label: `${e.name} (${e.taskCount})` })),
              ]}
              triggerClassName="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-(--border) bg-(--background) text-xs text-(--text-secondary) hover:bg-(--background-subtle) transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              dropdownClassName="bg-(--card) border border-(--border) text-(--text-primary)"
            />
          )}
          {projectFilterOptions.length > 0 && (
            <CustomSelect
              value={filterProject}
              onChange={(v) => patchView({ project: v })}
              options={[
                { value: 'all', label: t('tasksClient.project', 'Project') },
                ...projectFilterOptions,
              ]}
              triggerClassName="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-(--border) bg-(--background) text-xs text-(--text-secondary) hover:bg-(--background-subtle) transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              dropdownClassName="bg-(--card) border border-(--border) text-(--text-primary)"
            />
          )}
          {userRole === 'admin' && (
            <button
              onClick={() => setShowAssign(true)}
              className="px-2.5 py-1.5 rounded-lg border border-(--border) bg-(--background) text-xs text-(--text-secondary) hover:bg-(--background-subtle) transition-colors shrink-0 whitespace-nowrap"
            >
              {t('tasksClient.assignSupervisor')}
            </button>
          )}
          <CustomSelect
            value={filterPriority}
            onChange={(v) => patchView({ priority: v })}
            options={[
              { value: 'all', label: t('tasksClient.priority', 'Priority') },
              { value: 'urgent', label: t('tasksClient.urgent') },
              { value: 'high', label: t('tasksClient.high') },
              { value: 'medium', label: t('tasksClient.medium') },
              { value: 'low', label: t('tasksClient.low') },
            ]}
            triggerClassName="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-(--border) bg-(--background) text-xs text-(--text-secondary) hover:bg-(--background-subtle) transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            dropdownClassName="bg-(--card) border border-(--border) text-(--text-primary)"
          />
          <div className="relative shrink-0">
            <SearchIcon
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--text-muted)"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => patchView({ q: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && search !== '') {
                  e.stopPropagation();
                  patchView({ q: '' });
                }
              }}
              placeholder={t('placeholders.searchTasks')}
              aria-label={t('placeholders.searchTasks')}
              className="w-40 rounded-lg border border-(--border) bg-(--background) py-1.5 pl-8 pr-7 text-xs text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:ring-1 focus:ring-(--brand) sm:w-52"
            />
            {search !== '' && (
              <button
                type="button"
                onClick={() => patchView({ q: '' })}
                aria-label={t('tasksClient.clearSearch', 'Clear search')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-(--text-muted) transition-colors hover:bg-(--background-subtle) hover:text-(--text-primary)"
              >
                <XIcon className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Summary tiles — the stats that used to be computed and thrown away ═══ */}
      {prefs.showStats && rawTasks !== undefined && (
        <div className="shrink-0 border-b border-(--border)">
          <TaskStatsBar items={statItems} onSelect={selectStat} />
        </div>
      )}

      {/* ═══ Active filters ═══ */}
      {activeFilterCount > 0 && (
        <div className="shrink-0 border-b border-(--border) bg-(--background-subtle)/40">
          <TaskFilterChips
            chips={filterChips}
            onRemove={removeChip}
            onClearAll={clearAllFilters}
            clearAllLabel={t('tasksClient.clearFilters', 'Clear all')}
            removeLabel={(chip) =>
              t('tasksClient.removeFilter', {
                field: chip.field,
                defaultValue: 'Remove {{field}} filter',
              })
            }
            resultSummary={t('tasksClient.headerSummary', {
              shown: tasks.length,
              total: stats.total,
              defaultValue: '{{shown}} of {{total}} tasks',
            })}
          />
        </div>
      )}

      {/* ═══ Content ═══ */}
      {/* The grid needs one scroll box for both axes. A sticky header positions
          itself against its nearest scrolling ancestor, so if the horizontal
          scrolling happened inside the table instead, the header would scroll
          away vertically. Every other view scrolls vertically only, as before. */}
      <div
        className={`flex-1 min-h-0 ${viewMode === 'table' ? 'overflow-auto' : 'overflow-y-auto'}`}
      >
        {rawTasks === undefined ? (
          <div className="flex items-center justify-center py-20">
            <ShieldLoader size="lg" />
          </div>
        ) : viewState.tab === 'trash' ? (
          <DeletedTasksView
            convexId={convexId}
            onRestore={(taskId) => {
              void restoreTaskMutation({ taskId: taskId as any }).then(() => {
                toast.success(t('tasksClient.taskRestored', 'Task restored'));
              });
            }}
          />
        ) : viewMode === 'kanban' ? (
          <DndContext
            sensors={sensors}
            onDragStart={handleListDragStart}
            onDragEnd={handleKanbanDragEnd}
            onDragCancel={handleDndCancel}
          >
            <div ref={kanbanScrollRef} className="flex gap-4 overflow-x-auto p-4 sm:p-6">
              {visibleBoardColumns.map((status) => (
                <DroppableKanbanColumn
                  key={status}
                  status={status}
                  tasks={tasksByStatus[status]}
                  onOpen={(task) => openTask(task)}
                  statuses={statuses}
                  onSetStatus={canManage ? handleSetStatus : undefined}
                  contextMenu={
                    canManage
                      ? {
                          canManage,
                          onEdit: handleContextMenuEdit,
                          onRename: handleContextMenuRename,
                          onSetStatus: handleSetStatus,
                          onSetPriority: handleContextMenuPriority,
                          onDelete: handleDeleteSingle,
                          onToggleActive: handleToggleActive,
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          </DndContext>
        ) : viewMode === 'timeline' ? (
          <div className="p-4 sm:p-6">
            <TimelineView
              tasks={tasks}
              onOpen={(task) => openTask(task)}
              contextMenu={
                canManage
                  ? {
                      canManage,
                      onEdit: handleContextMenuEdit,
                      onRename: handleContextMenuRename,
                      onSetStatus: handleSetStatus,
                      onSetPriority: handleContextMenuPriority,
                      onDelete: handleDeleteSingle,
                      onToggleActive: handleToggleActive,
                    }
                  : undefined
              }
            />
          </div>
        ) : viewMode === 'table' ? (
          /* ═══ Table View — the ClickUp grid ═══ */
          /* Handed the same `tasks` the list and the kanban get, so all three
             views agree about what is on the board; the grid only differs in
             what it lets you do to a row without opening it. */
          <DndContext
            sensors={sensors}
            onDragStart={handleListDragStart}
            onDragEnd={handleListDragEnd}
            onDragCancel={handleDndCancel}
          >
          <TaskTable
            tasks={tasks}
            statuses={statuses}
            fields={fields}
            users={cellUsers}
            view={viewState}
            layout={prefs.table}
            density={prefs.density}
            canEdit={canCreate}
            lang={i18n.language}
            projectName={projectNameOf}
            onOpenTask={(taskId) => {
              const task = tasks.find((candidate) => candidate._id === taskId);
              if (task) openTask(task);
            }}
            onSetStatus={handleSetStatus}
            onPatchTask={handlePatchTask}
            onSetField={handleSetField}
            onSort={toggleSort}
            onResizeColumn={setColumnWidth}
            onReorderColumns={setColumnOrder}
            onAddTask={canCreate ? handleAddTask : undefined}
            onBulkPatch={canManage ? handleBulkPatch : undefined}
            onBulkDelete={canManage ? handleBulkDelete : undefined}
            addColumnSlot={canManage ? <AddFieldPopover onSubmit={handleCreateField} /> : undefined}
            contextMenu={
              canManage
                ? {
                    canManage,
                    onEdit: handleContextMenuEdit,
                    onRename: handleContextMenuRename,
                    onSetStatus: handleSetStatus,
                    onSetPriority: handleContextMenuPriority,
                    onDelete: handleDeleteSingle,
                    onToggleActive: handleToggleActive,
                  }
                : undefined
            }
            emptyState={
              <div className="py-20 text-center">
                <p className="mb-3 text-4xl">📋</p>
                <p className="font-medium text-(--text-secondary)">
                  {t('tasksClient.noTasksFound')}
                </p>
                <p className="mt-1 text-sm text-(--text-muted)">
                  {canManage ? t('tasksClient.createNewTask') : t('tasksClient.noTasksAssigned')}
                </p>
              </div>
            }
          />
          </DndContext>
        ) : (
          /* ═══ List View — ClickUp Design ═══ */
          <DndContext
            sensors={sensors}
            onDragStart={handleListDragStart}
            onDragEnd={handleListDragEnd}
            onDragCancel={handleDndCancel}
          >
            <div className="flex flex-col min-h-0">
              {/* Table Header */}
              <div
                style={listGridStyle}
                className="grid border-b border-(--border) bg-(--background-subtle) sticky top-0 z-10 shrink-0"
              >
                <div
                  className={`flex items-center gap-1 ${cellPad} cursor-pointer select-none text-xs font-semibold text-(--text-muted) hover:text-(--text-primary)`}
                  onClick={() => toggleSort('name')}
                >
                  {t('tasksClient.task', 'Name')}
                  <SortCaret active={sortBy === 'name'} dir={sortDir} />
                </div>
                {listColumnOrder.map(([key]) => (
                  <div
                    key={key}
                    className={`flex items-center gap-1 ${cellPad} text-xs font-semibold text-(--text-muted) ${
                      key === 'project'
                        ? ''
                        : 'cursor-pointer select-none hover:text-(--text-primary)'
                    }`}
                    onClick={key === 'project' ? undefined : () => toggleSort(key)}
                  >
                    {key === 'deadline' && t('tasksClient.deadline', 'Due date')}
                    {key === 'assignee' && t('tasksClient.assignee', 'Collaborators')}
                    {key === 'project' && t('tasksClient.project', 'Projects')}
                    {key === 'priority' && t('tasksClient.priority', 'Priority')}
                    {key === 'status' && t('common.status', 'Status')}
                    {key !== 'project' && <SortCaret active={sortBy === key} dir={sortDir} />}
                  </div>
                ))}
              </div>

              {/* Sections */}
              {tasks.length === 0 && rawTasks !== undefined ? (
                <div className="py-20 text-center">
                  <p className="text-4xl mb-3">📋</p>
                  <p className="text-(--text-secondary) font-medium">
                    {t('tasksClient.noTasksFound')}
                  </p>
                  <p className="text-(--text-muted) text-sm mt-1">
                    {canManage ? t('tasksClient.createNewTask') : t('tasksClient.noTasksAssigned')}
                  </p>
                </div>
              ) : (
                <>
                  {sections.map((section) => {
                    const isCollapsed = collapsedSections.has(section.key);
                    return (
                      <div key={section.key}>
                        {/* Section Header — matches Table/Projects view styling */}
                        {(() => {
                          const statusDef = statuses?.find((s) => s.key === section.key);
                          const chipColor = statusDef?.color ?? 'gray';
                          const chipClasses = taskColorClasses(chipColor);
                          return (
                            <div className="flex items-center gap-2 border-b border-(--border) bg-(--background) px-3 py-1.5">
                              <button
                                type="button"
                                onClick={() => toggleSection(section.key)}
                                aria-expanded={!isCollapsed}
                                className="flex min-w-0 items-center gap-2 rounded-md py-0.5 pr-2 text-left hover:bg-(--background-subtle)"
                              >
                                <svg
                                  className={`w-3.5 h-3.5 text-(--text-muted) transition-transform shrink-0 ${isCollapsed ? '' : 'rotate-90'}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 5l7 7-7 7"
                                  />
                                </svg>
                                <span className={cn(CHIP_BASE, chipClasses.chip, 'uppercase')}>{section.label}</span>
                                <span className="shrink-0 text-xs tabular-nums text-(--text-muted)">{section.tasks.length}</span>
                              </button>
                              {canCreate && (
                                <button
                                  type="button"
                                  onClick={() => setShowCreate(true)}
                                  className="ml-1 flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-(--text-muted) opacity-0 transition-opacity hover:bg-(--background-subtle) hover:text-(--text-primary) focus-visible:opacity-100 group-hover/section:opacity-100"
                                >
                                  <span className="text-lg leading-none">+</span>
                                  {t('tasksTable.addTask', 'Add Task')}
                                </button>
                              )}
                            </div>
                          );
                        })()}

                        {/* Task Rows — each section is a droppable zone */}
                        {!isCollapsed && (
                          <DroppableListSection id={section.key}>
                            {section.tasks.map((task) => {
                              const statusCfg = STATUS_CONFIG[task.status as Status];
                              const priorityCfg = PRIORITY_CONFIG[task.priority as Priority];
                              return (
                                <DraggableListRow key={task._id} task={task} isHighlighted={task._id === highlightTaskId}>
                                  <TaskContextMenu
                                    key={task._id}
                                    task={task as ContextTask}
                                    canManage={canManage}
                                    onOpen={(t) => openTask(t as any)}
                                    onEdit={handleContextMenuEdit}
                                    onRename={handleContextMenuRename}
                                    onSetStatus={handleSetStatus}
                                    onSetPriority={handleContextMenuPriority}
                                    onDelete={handleDeleteSingle}
                                    onToggleActive={handleToggleActive}
                                  >
                                    <div
                                      onClick={() => openTask(task)}
                                      style={listGridStyle}
                                      className="group/task grid border-b border-(--border) last:border-0 hover:bg-(--brand-quiet)/40 cursor-pointer transition-all duration-150 items-center"
                                    >
                                      {/* Name */}
                                      <div className={`flex items-center gap-2 ${cellPad} min-w-0`}>
                                        {/* Clickable status circle — opens a status picker */}
                                        <StatusCircleButton
                                          task={task}
                                          statuses={statuses}
                                          onSetStatus={handleSetStatus}
                                          canManage={canManage}
                                        />
                                        <span className="text-sm text-(--text-primary) truncate font-medium">
                                          {localizedTaskTitle(t, task)}
                                        </span>
                                      </div>
                                      {/* Cells, in the same order as the header */}
                                      {listColumnOrder.map(([key]) => {
                                        if (key === 'deadline')
                                          return (
                                            <div key={key} className={cellPad}>
                                              <DeadlineBadge
                                                deadline={task.deadline}
                                                status={task.status as Status}
                                              />
                                            </div>
                                          );
                                        if (key === 'assignee')
                                          return (
                                            <div
                                              key={key}
                                              className={`flex items-center gap-2 ${cellPad} min-w-0`}
                                            >
                                              <Avatar
                                                name={task.assignedToUser?.name ?? '?'}
                                                url={task.assignedToUser?.avatarUrl}
                                                size="sm"
                                              />
                                              <span className="text-xs text-(--text-secondary) truncate">
                                                {task.assignedToUser?.name ?? '—'}
                                              </span>
                                            </div>
                                          );
                                        if (key === 'project')
                                          return (
                                            <div
                                              key={key}
                                              className={`${cellPad} min-w-0 truncate`}
                                            >
                                              <ProjectBadge
                                                projectId={task.projectId}
                                                projectName={task.projectName}
                                                className="text-xs max-w-[140px]"
                                              />
                                            </div>
                                          );
                                        if (key === 'priority')
                                          return (
                                            <div key={key} className={cellPad}>
                                              <span
                                                className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${priorityCfg.bg} ${priorityCfg.color}`}
                                              >
                                                {priorityCfg.icon && (
                                                  <span>{priorityCfg.icon}</span>
                                                )}
                                                {t(priorityCfg.labelKey)}
                                              </span>
                                            </div>
                                          );
                                        return (
                                          <div key={key} className={cellPad}>
                                            <div className="flex items-center gap-1.5">
                                              <span
                                                className={`w-2 h-2 rounded-full shrink-0 ${statusCfg.dot}`}
                                              />
                                              <span
                                                className={`text-xs font-medium ${statusCfg.color}`}
                                              >
                                                {statuses
                                                  ? statusLabel(
                                                      t,
                                                      resolveStatus(
                                                        {
                                                          status: task.status as any,
                                                          statusKey: task.statusKey,
                                                        },
                                                        statuses,
                                                      ),
                                                    )
                                                  : t(statusCfg.labelKey)}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </TaskContextMenu>
                                </DraggableListRow>
                              );
                            })}
                          </DroppableListSection>
                        )}

                        {/* Add task placeholder */}
                        {!isCollapsed && canCreate && (
                          <button
                            onClick={() => setShowCreate(true)}
                            className="w-full px-4 py-2 pl-10 text-left text-sm text-(--text-muted) hover:text-(--brand-text) hover:bg-(--background-subtle) transition-colors border-b border-(--border)"
                          >
                            {t('tasksClient.addTaskPlaceholder', 'Add task...')}
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Add section */}
                  {canCreate && (
                    <button
                      onClick={() => setShowCreate(true)}
                      className="w-full px-4 py-3 text-left text-sm font-medium text-(--text-muted) hover:text-(--brand-text) hover:bg-(--background-subtle) transition-colors flex items-center gap-2"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      {t('tasksClient.addSection', 'Add section')}
                    </button>
                  )}
                </>
              )}
            </div>
          </DndContext>
        )}
      </div>

      {/* ── Modals ── */}
      <TaskSheet
        taskId={sheetTask?.id ?? null}
        taskTitle={sheetTask?.title}
        initialEditing={sheetInitialEditing}
        onClose={() => {
          setSheetTask(null);
          setSheetInitialEditing(false);
        }}
      />

      {/* Recurring series detail + edit sheet */}
      {editingRecurring && (
        <RecurringSeriesDetailSheet
          series={editingRecurring}
          onClose={() => setEditingRecurring(null)}
          convexId={convexId}
          userRole={userRole}
          effectiveOrgId={effectiveOrgId}
        />
      )}

      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
          <SheetHeader>
            <SheetTitle>{t('task.createTask')}</SheetTitle>
          </SheetHeader>
          {convexId && (
            <CreateTaskWizard
              className="min-h-0 flex-1 px-5 pt-4"
              currentUserId={convexId}
              userRole={userRole as 'admin' | 'supervisor' | 'employee'}
              selectedOrgId={effectiveOrgId as Id<'organizations'> | undefined}
              assigneeId={userRole === 'employee' ? convexId : undefined}
              onComplete={() => setShowCreate(false)}
              onCancel={() => setShowCreate(false)}
            />
          )}
        </SheetContent>
      </Sheet>

      <DraftResumeBar
        show={taskDraft.available}
        label={t('task.createTask')}
        step={taskDraft.step}
        onResume={() => {
          taskDraft.dismiss();
          setShowCreate(true);
        }}
        onDismiss={taskDraft.dismiss}
        onDiscard={taskDraft.discard}
      />
      {showAssign && <AssignSupervisorModal onClose={() => setShowAssign(false)} />}
    </div>
  );
});

// ── Deleted Tasks View (Trash) ──────────────────────────────────────────
function DeletedTasksView({
  convexId,
  onRestore,
}: {
  convexId: string | null | undefined;
  onRestore: (taskId: string) => void;
}) {
  const { t } = useTranslation();
  const deletedTasks = useQuery(api.tasks.getDeletedTasks, convexId ? {} : 'skip');
  const restoreTaskMutation = useMutation(api.tasks.restoreTask);

  if (deletedTasks === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  if (deletedTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <span className="text-4xl mb-3">🗑️</span>
        <p className="font-medium text-(--text-secondary)">
          {t('tasksClient.trashEmpty', 'Trash is empty')}
        </p>
        <p className="mt-1 text-sm text-(--text-muted)">
          {t('tasksClient.trashEmptyDesc', 'Deleted tasks will appear here')}
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-2">
      <p className="text-sm text-(--text-muted) mb-4">
        {t('tasksClient.trashDesc', {
          count: deletedTasks.length,
          defaultValue: '{{count}} deleted task(s) — click Restore to bring back.',
        })}
      </p>
      {deletedTasks.map((task: any) => (
        <div
          key={task._id}
          className="flex items-center gap-3 p-3 rounded-xl border border-(--border) bg-(--card) hover:bg-(--background-subtle) transition-colors"
        >
          <span className="text-sm font-medium text-(--text-primary) truncate flex-1">
            {task.title}
          </span>
          <span className="text-xs text-(--text-muted) shrink-0">
            {task.assignedToUser?.name ?? '—'}
          </span>
          <span className="text-xs text-(--text-muted) shrink-0">
            {new Date(task.deletedAt).toLocaleDateString()}
          </span>
          <button
            onClick={() => onRestore(task._id)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-(--brand) text-white hover:opacity-90 transition-opacity shrink-0"
          >
            {t('restore', 'Restore')}
          </button>
        </div>
      ))}
    </div>
  );
}

export default TasksClient;
