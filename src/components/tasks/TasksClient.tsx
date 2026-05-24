'use client';

import { useState, useMemo, useRef, useCallback, useTransition, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useMainRef } from '@/hooks/useMainRef';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { CreateTaskWizard } from './CreateTaskWizard';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { AssignSupervisorModal } from './AssignSupervisorModal';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  useDndMonitor,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { useOptimisticTaskStatus } from '@/hooks/useOptimisticActions';
import { memo } from 'react';

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type Status = 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled';
type Priority = 'low' | 'medium' | 'high' | 'urgent';
type ViewMode = 'kanban' | 'list';

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
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    dot: 'bg-blue-500',
  },
  review: {
    labelKey: 'tasks.status.review',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    dot: 'bg-amber-500',
  },
  completed: {
    labelKey: 'tasks.status.completed',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    dot: 'bg-emerald-500',
  },
  cancelled: {
    labelKey: 'tasks.status.cancelled',
    color: 'text-rose-500',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    dot: 'bg-rose-400',
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
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    icon: '',
  },
  high: {
    labelKey: 'tasks.priority.high',
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    icon: '',
  },
  urgent: {
    labelKey: 'tasks.priority.urgent',
    color: 'text-rose-500',
    bg: 'bg-rose-500/10',
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
      className={`${dim} rounded-full overflow-hidden shrink-0 flex items-center justify-center font-bold text-white bg-linear-to-br from-blue-500 to-sky-500`}
    >
      {url ? (
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
      <span className="text-xs font-medium text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full">
        {t('tasksClient.overdueTag')}
      </span>
    );
  if (soon)
    return (
      <span className="text-xs font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
        📅 {dateStr}
      </span>
    );
  return <span className="text-xs text-(--text-muted)">📅 {dateStr}</span>;
}

// â”€â”€ Task Card (base content, reused in both draggable and overlay) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function TaskCardContent({ task, isDragging = false }: { task: any; isDragging?: boolean }) {
  const { t } = useTranslation();
  const statusCfg = STATUS_CONFIG[task.status as Status];
  const priorityCfg = PRIORITY_CONFIG[task.priority as Priority];
  return (
    <div
      className={`group bg-(--card) rounded-2xl border shadow-sm p-4 space-y-3 transition-all duration-200 ${
        isDragging
          ? 'border-blue-400 shadow-2xl rotate-2 scale-105 opacity-90'
          : 'border-(--border) hover:shadow-md hover:border-blue-400/50'
      }`}
    >
      <div className="flex items-center justify-between">
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
      </div>
      <p
        className={`font-semibold text-sm leading-snug line-clamp-2 ${isDragging ? 'text-blue-400' : 'text-(--text-primary)'}`}
      >
        {task.title}
      </p>
      {task.description && (
        <p className="text-xs text-(--text-muted) line-clamp-2 leading-relaxed">
          {task.description}
        </p>
      )}
      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.tags.slice(0, 3).map((tag: any) => (
            <span
              key={tag}
              className="text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
      {task.attachments && task.attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {task.attachments.slice(0, 3).map((att: any, idx: number) => (
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
          <span className="text-xs text-(--text-muted) truncate max-w-[100px]">
            {task.assignedToUser?.name ?? '—'}
          </span>
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

function DraggableTaskCard({ task, onOpen }: { task: any; onOpen: () => void }) {
  const { t } = useTranslation();
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
  tasks: any[];
  onOpen: (t: any) => void;
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
            ? `border-2 border-dashed ${cfg.border} bg-blue-500/5`
            : 'border-2 border-transparent'
        }`}
      >
        {tasks.map((task) => (
          <DraggableTaskCard key={task._id} task={task} onOpen={() => onOpen(task)} />
        ))}
        {tasks.length === 0 && (
          <div
            className={`rounded-2xl border-2 border-dashed ${cfg.border} p-6 text-center transition-colors ${isOver ? 'bg-blue-500/5' : ''}`}
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

function TaskRow({ task, onOpen }: { task: any; onOpen: () => void }) {
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
            <span className="font-medium text-(--text-primary) text-sm group-hover:text-blue-400 transition-colors line-clamp-1">
              {task.title}
            </span>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Avatar
              name={task.assignedToUser?.name ?? '?'}
              url={task.assignedToUser?.avatarUrl}
              size="sm"
            />
            <span className="text-sm text-(--text-secondary)">
              {task.assignedToUser?.name ?? '—'}
            </span>
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
                    {task.title}
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
interface TasksClientProps {
  userId: string;
  userRole: 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';
}

export const TasksClient = memo(function TasksClient({ userId, userRole }: TasksClientProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const mainRef = useMainRef();
  const kanbanScrollRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [showCreate, setShowCreate] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<Status | 'all'>('all');
  const [search, setSearch] = useState('');
  const [activeTask, setActiveTask] = useState<any>(null);
  const [isPending, startTransition] = useTransition();
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
  }, []);

  const convexId = userId && userId !== '' ? (userId as Id<'users'>) : null;
  const canManage = userRole === 'admin' || userRole === 'supervisor';
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

  // Queries - for admin/superadmin, get all tasks in their organization
  const adminTasks = useQuery(
    api.tasks.getAllTasks,
    (userRole === 'admin' || userRole === 'superadmin') && convexId
      ? {
          requesterId: convexId,
          selectedOrganizationId: effectiveOrgId
            ? (effectiveOrgId as Id<'organizations'>)
            : undefined,
        }
      : 'skip',
  );
  const supervisorTasks = useQuery(
    api.tasks.getTasksAssignedBy,
    userRole === 'supervisor' && convexId ? { supervisorId: convexId } : 'skip',
  );
  const employeeTasks = useQuery(
    api.tasks.getTasksForEmployee,
    (userRole === 'employee' || userRole === 'driver') && convexId ? { userId: convexId } : 'skip',
  );

  const rawTasks =
    userRole === 'admin'
      ? adminTasks
      : userRole === 'supervisor'
        ? supervisorTasks
        : userRole === 'superadmin'
          ? adminTasks
          : employeeTasks;

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

  // Filter
  const tasks = useMemo(() => {
    if (!rawTasksWithOptimistic) return [];
    return rawTasksWithOptimistic.filter((t) => {
      const matchPriority = filterPriority === 'all' || t.priority === filterPriority;
      const matchStatus = filterStatus === 'all' || t.status === filterStatus;
      const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase());
      return matchPriority && matchStatus && matchSearch;
    });
  }, [rawTasksWithOptimistic, filterPriority, filterStatus, search]);

  // Stats
  const stats = useMemo(() => {
    const all = rawTasksWithOptimistic ?? [];
    return {
      total: all.length,
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
    const map: Record<Status, any[]> = {
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

  return (
    <div className="min-h-screen">
      {/* Sticky Header */}
      <div
        className={`sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-6 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 transition-all duration-200 ${isScrolled ? '' : 'border-b border-(--border)'}`}
      >
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1
              className="text-2xl font-bold tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              {userRole === 'employee' || userRole === 'driver'
                ? t('tasksClient.myTasks')
                : t('tasksClient.taskManager')}
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              {userRole === 'employee' || userRole === 'driver'
                ? t('tasksClient.trackAssignments')
                : t('tasksClient.assignMonitor')}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto flex-col sm:flex-row">
            {userRole === 'admin' && (
              <button
                onClick={() => {
                  const mainEl = mainRef.current;
                  if (mainEl) {
                    mainEl.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  setShowAssign(true);
                }}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-(--border) text-(--text-secondary) hover:bg-(--background-subtle) transition-colors font-medium text-sm w-full sm:w-auto"
              >
                {t('tasksClient.assignSupervisor')}
              </button>
            )}
            {canManage && (
              <button
                onClick={() => {
                  const mainEl = mainRef.current;
                  if (mainEl) {
                    mainEl.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  setShowCreate(true);
                }}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl btn-gradient text-white font-semibold text-sm shadow-md shadow-blue-500/20 transition-all w-full sm:w-auto"
              >
                {t('tasksClient.newTask')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats row - scrollable on mobile */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 my-4 sm:my-6">
        {[
          {
            label: t('tasksClient.total'),
            value: stats.total,
            color: 'from-[var(--text-secondary)] to-[var(--text-muted)]',
          },
          {
            label: t('tasksClient.pending'),
            value: stats.pending,
            color: 'from-[var(--text-muted)] to-[var(--text-muted)]',
          },
          {
            label: t('tasksClient.inProgress'),
            value: stats.inProgress,
            color: 'from-blue-400 to-blue-500',
          },
          {
            label: t('tasksClient.inReview'),
            value: stats.review,
            color: 'from-amber-400 to-amber-500',
          },
          {
            label: t('tasksClient.completed'),
            value: stats.completed,
            color: 'from-emerald-400 to-emerald-500',
          },
          {
            label: t('tasksClient.overdue'),
            value: stats.overdue,
            color: 'from-rose-400 to-rose-500',
          },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-(--card) rounded-xl sm:rounded-2xl border border-(--border) shadow-sm p-3 sm:p-4 text-center"
          >
            <p
              className={`text-xl sm:text-2xl font-bold bg-linear-to-r ${s.color} bg-clip-text text-transparent`}
            >
              {s.value}
            </p>
            <p className="text-[10px] sm:text-xs text-(--text-muted) mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
        {/* Search */}
        <div className="relative flex-1 min-w-[150px] sm:min-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted) text-sm">
            🔍
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('placeholders.searchTasks')}
            className="w-full pl-9 pr-4 py-2 sm:py-2.5 rounded-xl border border-(--input-border) bg-(--input) text-(--text-primary) text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder:text-(--text-muted)"
          />
        </div>

        {/* Priority filter */}
        <CustomSelect
          value={filterPriority}
          onChange={(v) => setFilterPriority(v as any)}
          options={[
            { value: 'all', label: t('tasksClient.allPriorities') },
            { value: 'urgent', label: t('tasksClient.urgent') },
            { value: 'high', label: t('tasksClient.high') },
            { value: 'medium', label: t('tasksClient.medium') },
            { value: 'low', label: t('tasksClient.low') },
          ]}
          triggerClassName="px-2 sm:px-3 py-2 sm:py-2.5 rounded-xl border border-(--input-border) bg-(--input) text-(--text-secondary) text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 shrink-0"
          dropdownClassName="bg-(--input) border border-(--input-border) text-(--text-primary)"
        />

        {/* Status filter */}
        <CustomSelect
          value={filterStatus}
          onChange={(v) => setFilterStatus(v as any)}
          options={[
            { value: 'all', label: t('tasksClient.allStatuses') },
            { value: 'pending', label: t('statuses.pending') },
            { value: 'in_progress', label: t('taskStatus.inProgress') },
            { value: 'review', label: t('taskStatus.inReview') },
            { value: 'completed', label: t('statuses.completed') },
            { value: 'cancelled', label: t('taskStatus.cancelled') },
          ]}
          triggerClassName="px-2 sm:px-3 py-2 sm:py-2.5 rounded-xl border border-(--border) bg-(--card) text-(--text-secondary) text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 shrink-0"
          dropdownClassName="bg-(--card) border border-(--border) text-(--text-primary)"
        />

        {/* View toggle */}
        <div className="flex items-center bg-(--card) border border-(--border) rounded-xl p-1 ml-auto shrink-0">
          <button
            onClick={() => startTransition(() => setViewMode('kanban'))}
            className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${viewMode === 'kanban' ? 'btn-gradient shadow-sm' : 'text-(--text-muted) hover:text-(--text-primary)'}`}
          >
            {t('tasksClient.kanban')}
          </button>
          <button
            onClick={() => startTransition(() => setViewMode('list'))}
            className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${viewMode === 'list' ? 'btn-gradient shadow-sm' : 'text-(--text-muted) hover:text-(--text-primary)'}`}
          >
            {t('tasksClient.list')}
          </button>
        </div>
      </div>

      {/* Content */}
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

            // Synchronous state update BEFORE removing overlay
            flushSync(() => {
              setOptimisticStatuses((prev) => {
                const next = new Map(prev);
                next.set(task._id as string, newStatus);
                return next;
              });
            });

            // Now safe to remove overlay - card is already in new column
            setActiveTask(null);

            // Background server mutation
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
          <div ref={kanbanScrollRef} className="flex gap-4 overflow-x-auto pb-4">
            {KANBAN_COLUMNS.map((status) => (
              <DroppableKanbanColumn
                key={status}
                status={status}
                tasks={tasksByStatus[status]}
                onOpen={(task) => router.push(`/tasks/${task._id}`)}
              />
            ))}
          </div>
        </DndContext>
      ) : (
        <div className="bg-(--card) rounded-2xl border border-(--border) shadow-sm overflow-x-auto">
          {tasks.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-(--text-secondary) font-medium">{t('tasksClient.noTasksFound')}</p>
              <p className="text-(--text-muted) text-sm mt-1">
                {canManage ? t('tasksClient.createNewTask') : t('tasksClient.noTasksAssigned')}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-(--background-subtle) border-b border-(--border)">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-(--text-muted) uppercase tracking-wide">
                    {t('tasksClient.task')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-(--text-muted) uppercase tracking-wide">
                    {t('tasksClient.assignee')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-(--text-muted) uppercase tracking-wide">
                    {t('tasksClient.priority')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-(--text-muted) uppercase tracking-wide">
                    {t('common.status')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-(--text-muted) uppercase tracking-wide">
                    {t('tasksClient.deadline')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-(--text-muted) uppercase tracking-wide"></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <TaskRow
                    key={task._id}
                    task={task}
                    onOpen={() => router.push(`/tasks/${task._id}`)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modals */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent
          className="w-[95vw] sm:w-[90vw] md:w-[85vw] max-w-2xl max-h-[95vh] flex flex-col"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl">{t('task.createTask')}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {convexId && (
              <CreateTaskWizard
                currentUserId={convexId}
                userRole={userRole as 'admin' | 'supervisor' | 'employee'}
                onComplete={() => setShowCreate(false)}
                onCancel={() => setShowCreate(false)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
      {showAssign && <AssignSupervisorModal onClose={() => setShowAssign(false)} />}
    </div>
  );
});

export default TasksClient;
