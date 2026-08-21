'use client';

import { useState, useMemo, useRef, useTransition, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useMainRef } from '@/hooks/useMainRef';
import { useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { CreateTaskWizard } from './CreateTaskWizard';
import { ProjectBadge } from './ProjectBadge';
import { localizedTaskTitle, type TitledTask } from '@/lib/taskTitle';
import { TaskSheet } from './TaskSheet';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from '@/components/ui/sheet';
import { RecurringTasksClient } from './RecurringTasksClient';
import { DraftResumeBar } from '@/components/ui/DraftResumeBar';
import { useDraftResume } from '@/hooks/useDraftResume';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { AssignSupervisorModal } from './AssignSupervisorModal';
import { EmployeeHoverCard } from '@/components/employees/EmployeeHoverCard';
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
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { useOptimisticTaskStatus } from '@/hooks/useOptimisticActions';
import { memo } from 'react';
import { Repeat as RepeatIcon } from 'lucide-react';
import type { TFunction } from 'i18next';

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type Status = 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled';
type Priority = 'low' | 'medium' | 'high' | 'urgent';
import TimelineView from './TimelineView';
import Link from 'next/link';

type ViewMode = 'kanban' | 'list' | 'timeline';

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

const KANBAN_COLUMNS: Status[] = ['pending', 'in_progress', 'review', 'completed'];

// â”€â”€ Avatar helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Deadline badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
function TaskCardContent({ task, isDragging = false }: { task: TaskItem; isDragging?: boolean }) {
  const { t } = useTranslation();
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
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${priorityCfg.bg} ${priorityCfg.color}`}
          >
            {priorityCfg.icon} {t(priorityCfg.labelKey)}
          </span>
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color}`}
        >
          {t(statusCfg.labelKey)}
        </span>
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
          )}
          <DeadlineBadge deadline={task.deadline} status={task.status as Status} />
        </div>
      </div>
    </div>
  );
}

function DraggableTaskCard({ task, onOpen }: { task: TaskItem; onOpen: () => void }) {
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
      <TaskCardContent task={task} isDragging={isDragging} />

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
}: {
  status: Status;
  tasks: TaskItem[];
  onOpen: (t: TaskItem) => void;
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
        {tasks.map((task) => (
          <DraggableTaskCard key={task._id} task={task} onOpen={() => onOpen(task)} />
        ))}
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

// â”€â”€ Main Client â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface RecurringSeriesRow {
  _id: string;
  title: string;
  isActive: boolean;
  assignedTo?: string;
  assignedToName?: string;
}

/**
 * Compact strip of active recurring series, shown above the board/list/timeline
 * so a repeating task is visible where the day-to-day work lives. The rules
 * open in a sheet — the same surface as the task detail panel — instead of
 * shipping the user off to a separate page.
 */
function RecurringStrip({
  series,
  t,
  onManage,
}: {
  series: RecurringSeriesRow[];
  t: TFunction;
  onManage: () => void;
}) {
  if (series.length === 0) return null;
  return (
    <div className="m-4 rounded-2xl border border-(--border) bg-(--card) p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-(--text-2)">
          <RepeatIcon className="h-3.5 w-3.5 text-(--brand-text)" aria-hidden="true" />
          {t('tasksClient.recurring', 'Recurring')}
        </p>
        <button
          type="button"
          onClick={onManage}
          className="text-xs font-medium text-(--brand-text) hover:underline"
        >
          {t('tasksClient.manageRecurring', 'Manage')}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {series.map((s) => (
          <button
            key={s._id}
            type="button"
            onClick={onManage}
            className="group flex items-center gap-1.5 rounded-full border border-(--border) bg-(--background-subtle) px-3 py-1.5 text-xs text-(--text-2) transition-all hover:border-(--primary)/40 hover:text-(--brand-text)"
          >
            <RepeatIcon className="h-3 w-3 text-(--brand-text)" aria-hidden="true" />
            <span className="max-w-[180px] truncate font-medium">{s.title}</span>
            {s.assignedToName && (
              <EmployeeHoverCard userId={s.assignedTo} name={s.assignedToName}>
                <span className="text-(--text-muted) cursor-pointer underline-offset-2 hover:underline">
                  → {s.assignedToName}
                </span>
              </EmployeeHoverCard>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

interface TasksClientProps {
  userId: string;
  userRole: 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';
}

export const TasksClient = memo(function TasksClient({ userId, userRole }: TasksClientProps) {
  const { t } = useTranslation();
  const mainRef = useMainRef();
  const kanbanScrollRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortBy, setSortBy] = useState<'name' | 'deadline' | 'priority' | 'status' | 'assignee'>(
    'status',
  );
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [groupBy, setGroupBy] = useState<'status' | 'priority' | 'project' | 'assignee'>('status');
  const [showCreate, setShowCreate] = useState(false);
  /** Recurring series manager, opened as a sheet instead of a separate page. */
  const [showRecurring, setShowRecurring] = useState(false);
  const taskDraft = useDraftResume('create-task', !showCreate);
  /** Task shown in the slide-over, with its title for the panel header. */
  const [sheetTask, setSheetTask] = useState<{ id: Id<'tasks'>; title: string } | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<Status | 'all'>('all');
  const [filterEmployee, setFilterEmployee] = useState<string>('all');
  const [filterProject, setFilterProject] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [_activeTask, setActiveTask] = useState<TaskItem | null>(null);
  const [_isPending, startTransition] = useTransition();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const mainEl = mainRef.current;
    const handleScroll = () => {
      if (mainEl) {
        setIsScrolled(mainEl.scrollTop > 10);
      }
    };
    if (mainEl) {
      mainEl.addEventListener('scroll', handleScroll, { passive: true });
      handleScroll();
    }
    return () => {
      if (mainEl) {
        mainEl.removeEventListener('scroll', handleScroll);
      }
    };
  }, [mainRef]);

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
  const [optimisticStatuses, setOptimisticStatuses] = useState<Map<string, Status>>(new Map());

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
      setSheetTask({ id: task._id as Id<'tasks'>, title: localizedTaskTitle(t, task) });
    },
    [t],
  );

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

  // Active recurring series, shown as a compact strip above the board. The
  // query scopes server-side: managers see every series in the org, everyone
  // else only the ones pointed at them (or created by them).
  const recurringSeries = useQuery(api.recurringTasks.listRecurringTasks, {});
  const activeSeries: RecurringSeriesRow[] = (recurringSeries ?? []).filter((s) => s.isActive);

  // Merge optimistic updates with raw tasks for instant UI feedback
  const rawTasksWithOptimistic = useMemo(() => {
    if (!rawTasks) return rawTasks;
    if (optimisticStatuses.size === 0) return rawTasks;
    return rawTasks.map((task) => {
      const optimisticStatus = optimisticStatuses.get(task._id);
      if (optimisticStatus) {
        return { ...task, status: optimisticStatus };
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
      setFilterProject('all');
    }
  }, [projectFilterValues, filterProject]);

  // Filter + Sort
  const tasks = useMemo(() => {
    if (!rawTasksWithOptimistic) return [];
    const filtered = rawTasksWithOptimistic.filter((t) => {
      const matchPriority = filterPriority === 'all' || t.priority === filterPriority;
      const matchStatus = filterStatus === 'all' || t.status === filterStatus;
      const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase());
      const matchEmployee = filterEmployee === 'all' || t.assignedToUser?._id === filterEmployee;
      const matchProject =
        filterProject === 'all' ||
        (filterProject === 'none' ? !t.projectId : t.projectId === filterProject);
      return matchPriority && matchStatus && matchSearch && matchEmployee && matchProject;
    });
    const priorityOrder: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    const statusOrder: Record<Status, number> = {
      pending: 0,
      in_progress: 1,
      review: 2,
      completed: 3,
      cancelled: 4,
    };
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
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
    filterPriority,
    filterStatus,
    search,
    filterEmployee,
    filterProject,
    sortBy,
    sortDir,
  ]);

  // Stats — cancelled tasks are closed history: the kanban has no column for
  // them and overdue ignores them, so "total" counts active work only and the
  // cards always add up to what the board shows.
  const stats = useMemo(() => {
    const all = rawTasksWithOptimistic ?? [];
    return {
      total: all.filter((t) => t.status !== 'cancelled').length,
      pending: all.filter((t) => t.status === 'pending').length,
      inProgress: all.filter((t) => t.status === 'in_progress').length,
      review: all.filter((t) => t.status === 'review').length,
      completed: all.filter((t) => t.status === 'completed').length,
      overdue: all.filter(
        (t) =>
          t.deadline &&
          t.deadline < Date.now() &&
          t.status !== 'completed' &&
          t.status !== 'cancelled',
      ).length,
    };
  }, [rawTasksWithOptimistic]);

  const tasksByStatus = useMemo(() => {
    const map: Record<Status, TaskItem[]> = {
      pending: [],
      in_progress: [],
      review: [],
      completed: [],
      cancelled: [],
    };
    tasks.forEach((t) => {
      map[t.status as Status].push(t);
    });
    return map;
  }, [tasks]);

  // Group tasks for section-based view
  const sections = useMemo(() => {
    if (groupBy === 'status') {
      const sectionOrder: Status[] = ['pending', 'in_progress', 'review', 'completed'];
      return sectionOrder.map((status) => ({
        key: status,
        label: t(STATUS_CONFIG[status].labelKey),
        tasks: tasks.filter((t) => t.status === status),
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
    const map = new Map<string, { label: string; tasks: typeof tasks }>();
    tasks.forEach((tk) => {
      const key = tk.assignedToUser?._id ?? '__unassigned__';
      const name = tk.assignedToUser?.name || 'Unassigned';
      const existing = map.get(key);
      if (existing) existing.tasks.push(tk);
      else map.set(key, { label: name, tasks: [tk] });
    });
    return [...map.entries()].map(([key, v]) => ({ key, label: v.label, tasks: v.tasks }));
  }, [tasks, groupBy, t]);

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
    if (sortBy === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ═══ Page Header ═══ */}
      {/* ═══ Page Header ═══ */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-(--brand) flex items-center justify-center text-white font-bold text-xs shrink-0">
            {userId ? userId.slice(0, 2).toUpperCase() : 'U'}
          </div>
          <h1 className="text-xl font-bold text-(--text-primary)">
            {userRole === 'employee' || userRole === 'driver'
              ? t('tasksClient.myTasks')
              : t('tasksClient.taskManager')}
          </h1>
          <svg
            className="w-4 h-4 text-(--text-muted)"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <div className="flex items-center gap-2">
          <button className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-(--border) text-xs font-medium text-(--text-secondary) hover:bg-(--background-subtle) transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
            {t('tasksClient.share', 'Share')}
          </button>
          <button className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-(--border) text-xs font-medium text-(--text-secondary) hover:bg-(--background-subtle) transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            {t('tasksClient.customize', 'Customize')}
          </button>
        </div>
      </div>

      {/* ═══ View Tabs ═══ */}
      <div className="flex items-center gap-1 px-4 sm:px-6 border-b border-(--border) shrink-0">
        {[
          { key: 'list' as ViewMode, label: t('tasksClient.list') },
          { key: 'kanban' as ViewMode, label: t('tasksClient.board', 'Board') },
          { key: 'timeline' as ViewMode, label: t('tasksClient.timeline', 'Timeline') },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => startTransition(() => setViewMode(tab.key))}
            className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              viewMode === tab.key
                ? 'border-(--brand) text-(--brand-text)'
                : 'border-transparent text-(--text-muted) hover:text-(--text-primary)'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

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

        <div className="flex items-center gap-1 ml-auto overflow-x-auto scrollbar-width-none">
          <CustomSelect
            value={filterStatus}
            onChange={(v) => setFilterStatus(v as Status | 'all')}
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
          <CustomSelect
            value={groupBy}
            onChange={(v) => setGroupBy(v as typeof groupBy)}
            options={[
              { value: 'status', label: t('tasksClient.group.status', 'Status') },
              { value: 'priority', label: t('tasksClient.group.priority', 'Priority') },
              { value: 'project', label: t('tasksClient.group.project', 'Project') },
              { value: 'assignee', label: t('tasksClient.group.assignee', 'Assignee') },
            ]}
            triggerClassName="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-(--border) bg-(--background) text-xs text-(--text-secondary) hover:bg-(--background-subtle) transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            dropdownClassName="bg-(--card) border border-(--border) text-(--text-primary)"
          />
          {canManage && employees.length > 1 && (
            <CustomSelect
              value={filterEmployee}
              onChange={(v) => setFilterEmployee(v)}
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
              onChange={(v) => setFilterProject(v)}
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
            onChange={(v) => setFilterPriority(v as Priority | 'all')}
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
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--text-muted)"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('placeholders.searchTasks')}
              className="pl-8 pr-3 py-1.5 rounded-lg border border-(--border) bg-(--background) text-xs text-(--text-primary) w-40 sm:w-52 focus:outline-none focus:ring-1 focus:ring-(--brand) placeholder:text-(--text-muted)"
            />
          </div>
        </div>
      </div>

      {/* ═══ Content ═══ */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {rawTasks === undefined ? (
          <div className="flex items-center justify-center py-20">
            <ShieldLoader size="lg" />
          </div>
        ) : viewMode === 'kanban' ? (
          <DndContext
            sensors={sensors}
            onDragStart={(e: DragStartEvent) => {
              const task = tasks.find((t) => t._id === e.active.id);
              setActiveTask(task ?? null);
            }}
            onDragEnd={(e: DragEndEvent) => {
              const { active, over } = e;
              if (!over || !convexId) {
                setActiveTask(null);
                return;
              }
              const newStatus = over.id as Status;
              const task = tasks.find((t) => t._id === active.id);
              if (!task || task.status === newStatus) {
                setActiveTask(null);
                return;
              }
              flushSync(() => {
                setOptimisticStatuses((prev) => {
                  const next = new Map(prev);
                  next.set(task._id as string, newStatus);
                  return next;
                });
              });
              setActiveTask(null);
              updateOptimistic(task._id as Id<'tasks'>, newStatus, convexId, task.status)
                .then(() => {
                  toast.success(
                    t('tasks.status.moved', { status: t(STATUS_CONFIG[newStatus].labelKey) }),
                    { duration: 2000 },
                  );
                  setOptimisticStatuses((prev) => {
                    const next = new Map(prev);
                    next.delete(task._id as string);
                    return next;
                  });
                })
                .catch(() => {
                  toast.error(t('tasks.failedToUpdateStatus'));
                  setOptimisticStatuses((prev) => {
                    const next = new Map(prev);
                    next.delete(task._id as string);
                    return next;
                  });
                });
            }}
            onDragCancel={() => setActiveTask(null)}
          >
            <RecurringStrip series={activeSeries} t={t} onManage={() => setShowRecurring(true)} />
            <div ref={kanbanScrollRef} className="flex gap-4 overflow-x-auto p-4 sm:p-6">
              {KANBAN_COLUMNS.map((status) => (
                <DroppableKanbanColumn
                  key={status}
                  status={status}
                  tasks={tasksByStatus[status]}
                  onOpen={(task) => openTask(task)}
                />
              ))}
            </div>
          </DndContext>
        ) : viewMode === 'timeline' ? (
          <div className="p-4 sm:p-6">
            <RecurringStrip series={activeSeries} t={t} onManage={() => setShowRecurring(true)} />
            <TimelineView tasks={tasks} onOpen={(task) => openTask(task)} />
          </div>
        ) : (
          /* ═══ List View — ClickUp Design ═══ */
          <div className="flex flex-col min-h-0">
            <RecurringStrip series={activeSeries} t={t} onManage={() => setShowRecurring(true)} />

            {/* Table Header */}
            <div className="grid grid-cols-[minmax(0,2.5fr)_130px_150px_140px_110px] border-b border-(--border) bg-(--background-subtle) sticky top-0 z-10 shrink-0">
              <div className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-(--text-muted)">
                {t('tasksClient.task', 'Name')}
              </div>
              <div
                className="flex items-center gap-1 px-4 py-2 text-xs font-semibold text-(--text-muted) cursor-pointer hover:text-(--text-primary) select-none"
                onClick={() => toggleSort('deadline')}
              >
                {t('tasksClient.deadline', 'Due date')}
                {sortBy === 'deadline' && (
                  <svg
                    className={`w-3 h-3 ${sortDir === 'desc' ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 15l7-7 7 7"
                    />
                  </svg>
                )}
              </div>
              <div className="flex items-center gap-1 px-4 py-2 text-xs font-semibold text-(--text-muted)">
                {t('tasksClient.assignee', 'Collaborators')}
              </div>
              <div className="flex items-center gap-1 px-4 py-2 text-xs font-semibold text-(--text-muted)">
                {t('tasksClient.project', 'Projects')}
              </div>
              <div className="flex items-center gap-1 px-4 py-2 text-xs font-semibold text-(--text-muted)">
                {t('common.status', 'Status')}
              </div>
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
                      {/* Section Header */}
                      <button
                        onClick={() => toggleSection(section.key)}
                        className="w-full flex items-center gap-2 px-4 py-2 bg-(--background) hover:bg-(--background-subtle) transition-colors text-left border-b border-(--border)"
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
                        <span className="text-sm font-semibold text-(--text-primary)">
                          {section.label}
                        </span>
                      </button>

                      {/* Task Rows */}
                      {!isCollapsed &&
                        section.tasks.map((task) => {
                          const statusCfg = STATUS_CONFIG[task.status as Status];
                          return (
                            <div
                              key={task._id}
                              onClick={() => openTask(task)}
                              className="grid grid-cols-[minmax(0,2.5fr)_130px_150px_140px_110px] border-b border-(--border) last:border-0 hover:bg-(--background-subtle) cursor-pointer transition-colors items-center"
                            >
                              {/* Name */}
                              <div className="flex items-center gap-2 px-4 py-2 min-w-0">
                                <span
                                  className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${task.status === 'completed' ? 'border-(--success-solid) bg-(--success-solid)' : 'border-(--text-muted)'}`}
                                >
                                  {task.status === 'completed' && (
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
                                </span>
                                <span className="text-sm text-(--text-primary) truncate font-medium">
                                  {localizedTaskTitle(t, task)}
                                </span>
                              </div>
                              {/* Due date */}
                              <div className="px-4 py-2">
                                <DeadlineBadge
                                  deadline={task.deadline}
                                  status={task.status as Status}
                                />
                              </div>
                              {/* Collaborators */}
                              <div className="flex items-center gap-2 px-4 py-2 min-w-0">
                                <Avatar
                                  name={task.assignedToUser?.name ?? '?'}
                                  url={task.assignedToUser?.avatarUrl}
                                  size="sm"
                                />
                                <span className="text-xs text-(--text-secondary) truncate">
                                  {task.assignedToUser?.name ?? '—'}
                                </span>
                              </div>
                              {/* Project */}
                              <div className="px-4 py-2 min-w-0 truncate">
                                <ProjectBadge
                                  projectId={task.projectId}
                                  projectName={task.projectName}
                                  className="text-xs max-w-[140px]"
                                />
                              </div>
                              {/* Status */}
                              <div className="px-4 py-2">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={`w-2 h-2 rounded-full shrink-0 ${statusCfg.dot}`}
                                  />
                                  <span className={`text-xs font-medium ${statusCfg.color}`}>
                                    {t(statusCfg.labelKey)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}

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
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        )}
      </div>

      {/* ── Modals ── */}
      <TaskSheet
        taskId={sheetTask?.id ?? null}
        taskTitle={sheetTask?.title}
        onClose={() => setSheetTask(null)}
      />

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

      <Sheet open={showRecurring} onOpenChange={setShowRecurring}>
        <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
          <SheetHeader>
            <SheetTitle>{t('recurringTasks.title')}</SheetTitle>
            <SheetDescription>{t('recurringTasks.subtitle')}</SheetDescription>
          </SheetHeader>
          <SheetBody className="px-0 py-0">
            <RecurringTasksClient
              userId={userId}
              userRole={userRole}
              embedded
              className="px-5 py-4"
            />
          </SheetBody>
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

export default TasksClient;
