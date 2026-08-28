'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { localizedTaskTitle } from '@/lib/taskTitle';
import { useRouter } from 'next/navigation';
import { useNow } from '@/hooks/useNow';
import { useTranslation } from 'react-i18next';
import { Calendar, AlertTriangle, CheckCircle2, Clock, Circle } from 'lucide-react';
import { TaskContextMenu } from './TaskContextMenu';

// ── Types ──
type Status = 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled';
type Priority = 'low' | 'medium' | 'high' | 'urgent';
type TimelineScale = 'week' | 'month' | 'quarter';

interface Task {
  _id: string;
  title: string;
  status: Status;
  priority: Priority;
  deadline?: number;
  createdAt: number;
  assignedToUser?: { name: string; avatarUrl?: string | null } | null;
  tags?: string[];
  projectId?: string;
  projectName?: string | null;
}

interface TimelineViewProps {
  tasks: Task[];
  onOpen: (task: Task) => void;
  /** Context menu handlers — when provided, each task gets a right-click menu. */
  contextMenu?: {
    canManage: boolean;
    onEdit: (task: any) => void;
    onRename?: (task: any) => void;
    onSetStatus: (taskId: string, statusKey: string) => void;
    onSetPriority: (taskId: string, priority: string) => void;
    onDelete: (task: any) => void;
    onToggleActive?: (task: any) => void;
  };
}

// ── Config ──
// `labelKey` is spelled out per status because the i18n catalogue uses
// `inProgress` while the status enum (and the database) uses `in_progress`.
// Interpolating the raw value printed the key itself in the legend.
const STATUS_COLORS: Record<
  Status,
  { bar: string; text: string; bg: string; border: string; labelKey: string }
> = {
  pending: {
    bar: 'bg-(--text-muted)/40',
    text: 'text-(--text-muted)',
    bg: 'bg-(--background-subtle)',
    border: 'border-(--border)',
    labelKey: 'tasks.status.pending',
  },
  in_progress: {
    bar: 'bg-(--brand)',
    text: 'text-(--brand-text)',
    bg: 'bg-(--brand-quiet)',
    border: 'border-(--brand-outline)',
    labelKey: 'tasks.status.inProgress',
  },
  review: {
    bar: 'bg-(--warning-solid)',
    text: 'text-(--warning-text)',
    bg: 'bg-(--warning-quiet)',
    border: 'border-(--warning-outline)',
    labelKey: 'tasks.status.review',
  },
  completed: {
    bar: 'bg-(--success-solid)',
    text: 'text-(--success-text)',
    bg: 'bg-(--success-quiet)',
    border: 'border-(--success-outline)',
    labelKey: 'tasks.status.completed',
  },
  cancelled: {
    bar: 'bg-(--danger-solid)',
    text: 'text-(--danger-text)',
    bg: 'bg-(--danger-quiet)',
    border: 'border-(--danger-outline)',
    labelKey: 'tasks.status.cancelled',
  },
};

/**
 * Hover-tooltip width. Fixed on purpose: the tooltip lives inside the
 * horizontally scrolling timeline, which clips its overflow, so the only way to
 * guarantee it stays visible is to compute its position from a known width.
 */
const TOOLTIP_WIDTH = 260;

const PRIORITY_DOT: Record<Priority, string> = {
  low: 'bg-(--text-muted)',
  medium: 'bg-(--brand)',
  high: 'bg-(--warning-solid)',
  urgent: 'bg-(--danger-solid)',
};

// ── Date helpers ──
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale === 'ru' ? 'ru-RU' : locale === 'hy' ? 'hy-AM' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

function formatShort(date: Date, locale: string): string {
  return date.toLocaleDateString(locale === 'ru' ? 'ru-RU' : locale === 'hy' ? 'hy-AM' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Timeline View ──
export default function TimelineView({ tasks, onOpen, contextMenu }: TimelineViewProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const locale = i18n.language || 'en';
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<TimelineScale>('month');

  // Today marker
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Calculate visible date range based on tasks
  const dateRange = useMemo(() => {
    if (tasks.length === 0) {
      const start = addDays(today, -14);
      const end = addDays(today, 30);
      return { start, end, totalDays: daysBetween(start, end) };
    }

    const deadlines = tasks.filter((t) => t.deadline).map((t) => new Date(t.deadline!));
    const createdDates = tasks.map((t) => new Date(t.createdAt));

    const allDates = [...deadlines, ...createdDates, today];
    let minDate = new Date(Math.min(...allDates.map((d) => d.getTime())));
    let maxDate = new Date(Math.max(...allDates.map((d) => d.getTime())));

    // Add padding
    minDate = addDays(minDate, -7);
    maxDate = addDays(maxDate, 14);

    // Ensure at least 30 days visible
    if (daysBetween(minDate, maxDate) < 30) {
      maxDate = addDays(minDate, 45);
    }

    const totalDays = daysBetween(minDate, maxDate);
    return { start: minDate, end: maxDate, totalDays };
  }, [tasks, today]);

  // Generate timeline columns (weeks or months)
  const timelineColumns = useMemo(() => {
    const columns: { date: Date; label: string; isToday: boolean; dayOffset: number }[] = [];
    const { start, end } = dateRange;

    if (scale === 'week') {
      let cursor = getMonday(start);
      while (cursor <= end) {
        const weekEnd = addDays(cursor, 6);
        columns.push({
          date: cursor,
          label: `${formatDate(cursor, locale)} — ${formatDate(
            weekEnd > end ? end : weekEnd,
            locale,
          )}`,
          isToday: cursor <= today && today <= weekEnd,
          dayOffset: daysBetween(start, cursor),
        });
        cursor = addDays(cursor, 7);
      }
    } else if (scale === 'month') {
      let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cursor <= end) {
        const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
        const label = cursor.toLocaleDateString(
          locale === 'ru' ? 'ru-RU' : locale === 'hy' ? 'hy-AM' : 'en-GB',
          { month: 'long', year: 'numeric' },
        );
        columns.push({
          date: cursor,
          label: label.charAt(0).toUpperCase() + label.slice(1),
          isToday: cursor <= today && today <= monthEnd,
          dayOffset: daysBetween(start, cursor),
        });
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
    } else {
      // quarter
      let cursor = new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1);
      while (cursor <= end) {
        const qEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 0);
        const q = Math.floor(cursor.getMonth() / 3) + 1;
        columns.push({
          date: cursor,
          label: `Q${q} ${cursor.getFullYear()}`,
          isToday: cursor <= today && today <= qEnd,
          dayOffset: daysBetween(start, cursor),
        });
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1);
      }
    }

    return columns;
  }, [dateRange, scale, today, locale]);

  // Day width in pixels based on scale
  const dayWidth = scale === 'week' ? 24 : scale === 'month' ? 12 : 6;
  const totalWidth = dateRange.totalDays * dayWidth;

  // Row height
  const ROW_HEIGHT = 56;
  const HEADER_HEIGHT = 44;

  // Tasks sorted by deadline (null last)
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (!a.deadline && !b.deadline) return b.createdAt - a.createdAt;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline - b.deadline;
    });
  }, [tasks]);

  // Calculate bar position and width for each task
  const now = useNow();
  const taskBars = useMemo(() => {
    return sortedTasks.map((task) => {
      const { start } = dateRange;
      const taskStart = new Date(task.createdAt);
      const taskEnd = task.deadline ? new Date(task.deadline) : new Date(task.createdAt);

      // Clamp to visible range
      const clampedStart = taskStart < start ? start : taskStart;
      const clampedEnd = taskEnd > dateRange.end ? dateRange.end : taskEnd;

      const leftOffset = daysBetween(start, clampedStart) * dayWidth;
      const barWidth = Math.max(
        daysBetween(clampedStart, clampedEnd) * dayWidth,
        dayWidth * 2, // minimum width
      );

      const isOverdue =
        !!task.deadline &&
        task.deadline < now &&
        task.status !== 'completed' &&
        task.status !== 'cancelled';

      return {
        task,
        leftOffset,
        barWidth,
        isOverdue,
        completionPercent:
          task.status === 'completed'
            ? 100
            : task.status === 'cancelled'
              ? 0
              : task.status === 'in_progress'
                ? 50
                : task.status === 'review'
                  ? 75
                  : 15,
        isCancelled: task.status === 'cancelled',
      };
    });
  }, [sortedTasks, dateRange, dayWidth, now]);

  // Today marker position
  const todayOffset = useMemo(() => {
    const offset = daysBetween(dateRange.start, today) * dayWidth;
    return offset >= 0 && offset <= totalWidth ? offset : null;
  }, [dateRange, today, dayWidth, totalWidth]);

  // Scroll to today on mount
  useEffect(() => {
    if (todayOffset && scrollRef.current) {
      const container = scrollRef.current;
      const scrollTo = todayOffset - container.clientWidth / 3;
      container.scrollLeft = Math.max(0, scrollTo);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const statusIcon = (status: Status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-3.5 h-3.5 text-(--success-text)" />;
      case 'cancelled':
        return <Circle className="w-3.5 h-3.5 text-(--danger-text)" />;
      case 'in_progress':
        return <Clock className="w-3.5 h-3.5 text-(--brand-text)" />;
      case 'review':
        return <AlertTriangle className="w-3.5 h-3.5 text-(--warning-text)" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-(--text-muted)" />;
    }
  };

  return (
    <div className="bg-(--card) rounded-2xl border border-(--border) shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-(--border) bg-(--background-subtle)/50">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-(--text-muted)" />
          <span className="text-xs font-medium text-(--text-secondary)">
            {formatShort(dateRange.start, locale)} — {formatShort(dateRange.end, locale)}
          </span>
        </div>
        <div className="flex items-center gap-1 bg-(--card) rounded-lg border border-(--border) p-0.5">
          {(['week', 'month', 'quarter'] as TimelineScale[]).map((s) => (
            <button
              key={s}
              onClick={() => setScale(s)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                scale === s
                  ? 'bg-(--brand) text-white shadow-sm'
                  : 'text-(--text-muted) hover:text-(--text-primary)'
              }`}
            >
              {s === 'week'
                ? t('tasksClient.week', 'Week')
                : s === 'month'
                  ? t('tasksClient.month', 'Month')
                  : t('tasksClient.quarter', 'Quarter')}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline body */}
      <div
        className="flex"
        style={{ height: HEADER_HEIGHT + sortedTasks.length * ROW_HEIGHT + 20 }}
      >
        {/* Task names column (fixed) */}
        <div className="shrink-0 border-r border-(--border)" style={{ width: 260 }}>
          {/* Header */}
          <div
            className="flex items-center px-4 border-b border-(--border) bg-(--background-subtle)/50"
            style={{ height: HEADER_HEIGHT }}
          >
            <span className="text-xs font-semibold text-(--text-muted) uppercase tracking-wide">
              {t('tasksClient.task', 'Task')}
            </span>
          </div>
          {/* Task names */}
          <div className="overflow-hidden">
            {sortedTasks.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-(--text-muted)">
                {t('tasksClient.noTasksFound', 'No tasks found')}
              </div>
            ) : (
              sortedTasks.map((task, _idx) => (
                <TaskContextMenu
                  key={task._id}
                  task={task as any}
                  canManage={contextMenu?.canManage ?? false}
                  onOpen={(t) => onOpen(t as any)}
                  onEdit={contextMenu?.onEdit ?? (() => {})}
                  onRename={contextMenu?.onRename}
                  onSetStatus={contextMenu?.onSetStatus ?? (() => {})}
                  onSetPriority={contextMenu?.onSetPriority ?? (() => {})}
                  onDelete={contextMenu?.onDelete ?? (() => {})}
                  onToggleActive={contextMenu?.onToggleActive}
                >
                  <div
                    className="flex items-center gap-3 px-4 cursor-pointer hover:bg-(--background-subtle)/50 transition-colors border-b border-(--border)/50 group"
                    style={{ height: ROW_HEIGHT }}
                    onClick={() => onOpen(task)}
                  >
                    {statusIcon(task.status)}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-(--text-primary) truncate group-hover:text-(--brand-text) transition-colors">
                        {localizedTaskTitle(t, task)}
                      </p>
                      <p className="text-[10px] text-(--text-muted) truncate">
                        {task.assignedToUser?.name ?? '—'}
                      </p>
                    </div>
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority]}`}
                    />
                  </div>
                </TaskContextMenu>
              ))
            )}
          </div>
        </div>

        {/* Timeline area (scrollable) */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden">
          <div
            style={{
              width: Math.max(totalWidth, 600),
              position: 'relative',
              minHeight: HEADER_HEIGHT + sortedTasks.length * ROW_HEIGHT,
            }}
          >
            {/* Timeline header */}
            <div
              className="sticky top-0 z-10 border-b border-(--border) bg-(--background-subtle)/80 backdrop-blur-sm flex"
              style={{ height: HEADER_HEIGHT }}
            >
              {timelineColumns.map((col, idx) => (
                <div
                  key={idx}
                  className={`flex-shrink-0 flex items-center justify-center text-[10px] font-medium border-r border-(--border)/50 ${
                    col.isToday
                      ? 'bg-(--brand-quiet) text-(--brand-text) font-bold'
                      : 'text-(--text-muted)'
                  }`}
                  style={{
                    width:
                      scale === 'week'
                        ? 7 * dayWidth
                        : scale === 'month'
                          ? (new Date(
                              col.date.getFullYear(),
                              col.date.getMonth() + 1,
                              0,
                            ).getDate() -
                              col.date.getDate() +
                              1) *
                            dayWidth
                          : 90 * dayWidth,
                    minWidth: 60,
                  }}
                >
                  <span className="truncate px-1">{col.label}</span>
                </div>
              ))}
            </div>

            {/* Today marker line */}
            {todayOffset !== null && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-(--brand) z-20 pointer-events-none"
                style={{ left: todayOffset }}
              >
                <div className="w-2 h-2 bg-(--brand) rounded-full -ml-[3px]" />
              </div>
            )}

            {/* Task bars */}
            <div className="relative">
              {taskBars.map(
                (
                  { task, leftOffset, barWidth, isOverdue, completionPercent, isCancelled },
                  idx,
                ) => {
                  const _cfg = STATUS_COLORS[task.status];
                  // The tooltip used to sit at `left-1/2` of the *row*, which spans
                  // the whole (scrollable) timeline width — so it appeared in the
                  // middle of the chart instead of over the bar, and the scroll
                  // container clipped whatever stuck out. Anchor it on the bar and
                  // clamp it into the content box instead.
                  const contentWidth = Math.max(totalWidth, 600);
                  const tooltipLeft = Math.max(
                    0,
                    Math.min(
                      leftOffset + barWidth / 2 - TOOLTIP_WIDTH / 2,
                      contentWidth - TOOLTIP_WIDTH,
                    ),
                  );
                  // Above the bar, except on the first row of a multi-row chart:
                  // the scroll container hides vertical overflow, so there is
                  // nothing above row 0 to draw into.
                  const tooltipBelow = idx === 0 && sortedTasks.length > 1;
                  return (
                    <div
                      key={task._id}
                      className="relative cursor-pointer hover:z-10 group"
                      style={{ height: ROW_HEIGHT }}
                      onClick={() => onOpen(task)}
                    >
                      {/* Grid line */}
                      <div className="absolute inset-x-0 top-0 border-t border-(--border)/30" />

                      {/* Task bar */}
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 h-7 rounded-lg transition-all duration-200 group-hover:shadow-lg group-hover:scale-y-110 ${
                          isCancelled ? 'opacity-50' : ''
                        } ${isOverdue ? 'ring-2 ring-(--danger-text)' : ''}`}
                        style={{
                          left: leftOffset,
                          width: Math.max(barWidth, 20),
                          background: isOverdue
                            ? 'linear-gradient(90deg, #f43f5e, #e11d48)'
                            : task.status === 'completed'
                              ? 'linear-gradient(90deg, #10b981, #059669)'
                              : task.status === 'in_progress'
                                ? 'linear-gradient(90deg, var(--brand), var(--brand-hover))'
                                : task.status === 'review'
                                  ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                                  : 'linear-gradient(90deg, #6b7280, #4b5563)',
                        }}
                      >
                        {/* Progress fill */}
                        <div
                          className="absolute inset-y-0 left-0 rounded-lg bg-white/20 transition-all duration-500"
                          style={{ width: `${completionPercent}%` }}
                        />
                        {/* Task title on bar */}
                        <div className="absolute inset-0 flex items-center px-2 overflow-hidden">
                          <span className="text-[11px] font-semibold text-white truncate drop-shadow-sm">
                            {localizedTaskTitle(t, task)}
                          </span>
                        </div>
                      </div>

                      {/* Hover tooltip */}
                      <div
                        className={`absolute opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-30 ${
                          tooltipBelow ? 'top-full mt-1' : '-top-1 -translate-y-full'
                        }`}
                        style={{ left: tooltipLeft, width: TOOLTIP_WIDTH }}
                      >
                        <div className="bg-(--card) border border-(--border) rounded-xl shadow-2xl p-3 break-words backdrop-blur-sm">
                          <p className="text-sm font-bold text-(--text-primary)">
                            {localizedTaskTitle(t, task)}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-(--text-muted)">
                            <span>{task.assignedToUser?.name ?? '—'}</span>
                            {task.deadline && (
                              <>
                                <span>·</span>
                                <span
                                  className={isOverdue ? 'text-(--danger-text) font-medium' : ''}
                                >
                                  {formatShort(new Date(task.deadline), locale)}
                                </span>
                              </>
                            )}
                          </div>
                          {task.projectId && task.projectName && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/projects/${task.projectId}`);
                              }}
                              className="text-[11px] text-(--text-muted) hover:text-(--brand-text) cursor-pointer pointer-events-auto mt-1"
                            >
                              📁 {task.projectName}
                            </button>
                          )}
                          {task.tags && task.tags.length > 0 && (
                            <div className="flex gap-1 mt-1.5">
                              {task.tags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[10px] bg-(--brand-quiet) text-(--brand-text) px-1.5 py-0.5 rounded"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 border-t border-(--border) bg-(--background-subtle)/30">
        {(['pending', 'in_progress', 'review', 'completed', 'cancelled'] as Status[]).map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${STATUS_COLORS[s].bar}`} />
            <span className="text-[10px] text-(--text-muted)">{t(STATUS_COLORS[s].labelKey)}</span>
          </div>
        ))}
        <div className="w-px h-3 bg-(--border)" />
        <div className="flex items-center gap-1.5">
          <div className="w-0.5 h-3 bg-(--brand) rounded" />
          <span className="text-[10px] text-(--text-muted)">{t('tasksClient.today', 'Today')}</span>
        </div>
      </div>
    </div>
  );
}
