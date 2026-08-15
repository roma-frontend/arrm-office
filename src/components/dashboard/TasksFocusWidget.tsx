'use client';

/**
 * Tasks Focus Widget — a compact tasks strip on the dashboard.
 *
 * If there is anything due, the next few tasks show as slim rows with an
 * inline check-off; the rest of the detail lives on /tasks. Empty state is a
 * single line, not a hero — the dashboard should stay scannable.
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from 'convex/react';
import { isPast } from 'date-fns';
import { ListChecks, Plus, Check, AlertTriangle, Loader2, ChevronRight } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import { useAuthUser } from '@/store/useAuthStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { localizedTaskTitle } from '@/lib/taskTitle';

/** How many tasks fit in the strip before "view all" takes over. */
const MAX_ROWS = 3;

export function TasksFocusWidget() {
  const { t } = useTranslation();
  const user = useAuthUser();
  const [busyId, setBusyId] = useState<string | null>(null);

  const myTasks = useQuery(api.dashboard.getMyTasks, {});
  const updateStatus = useMutation(api.tasks.updateTaskStatus);

  const { dueTasks, overdueCount, totalOpen } = useMemo(() => {
    const active = (myTasks ?? []).filter((task) => task.status !== 'completed');
    const sorted = [...active].sort((a, b) => {
      const aOver = a.deadline != null && isPast(new Date(a.deadline));
      const bOver = b.deadline != null && isPast(new Date(b.deadline));
      if (aOver !== bOver) return aOver ? -1 : 1;
      if (a.deadline == null && b.deadline == null) return b.createdAt - a.createdAt;
      if (a.deadline == null) return 1;
      if (b.deadline == null) return -1;
      return a.deadline - b.deadline;
    });
    return {
      dueTasks: sorted.slice(0, MAX_ROWS),
      overdueCount: active.filter(
        (task) => task.deadline != null && isPast(new Date(task.deadline)),
      ).length,
      totalOpen: active.length,
    };
  }, [myTasks]);

  async function complete(taskId: string) {
    if (!user?.id) return;
    setBusyId(taskId);
    try {
      await updateStatus({
        taskId: taskId as never,
        status: 'completed',
        userId: user.id as never,
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="overflow-hidden border-(--border) glass-panel">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <ListChecks className="size-4 text-(--brand-text)" aria-hidden="true" />
        <Link
          href="/tasks"
          className="text-sm font-semibold text-(--text-primary) transition-colors hover:text-(--brand-text)"
        >
          {t('toolDock.myTasks', 'My tasks')}
        </Link>
        {totalOpen > 0 && (
          <span
            className={cn(
              'num flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white',
              overdueCount > 0 ? 'bg-(--danger-solid)' : 'bg-(--primary)',
            )}
            title={
              overdueCount > 0
                ? t('toolDock.overdueCount', '{{count}} overdue', { count: overdueCount })
                : undefined
            }
          >
            {totalOpen}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="gap-0.5 text-xs">
            <Link href="/tasks">
              {t('toolDock.viewAll', 'View all')}
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="hidden gap-1 text-xs sm:flex">
            <Link href="/tasks/new">
              <Plus className="size-3.5" aria-hidden="true" />
              {t('toolDock.newTask', 'New task')}
            </Link>
          </Button>
        </div>
      </div>

      {myTasks === undefined ? (
        <div className="space-y-1.5 px-4 pb-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-8 rounded-md" />
          ))}
        </div>
      ) : dueTasks.length === 0 ? (
        <Link
          href="/tasks"
          className="flex items-center gap-2 px-4 pb-3 text-xs text-(--text-muted) transition-colors hover:text-(--text-2)"
        >
          <Check className="size-3.5 text-(--success-text)" aria-hidden="true" />
          {t('toolDock.noTasks', "You're all caught up")}
        </Link>
      ) : (
        <div className="space-y-1 px-3 pb-3">
          {dueTasks.map((task) => {
            const overdue = task.deadline != null && isPast(new Date(task.deadline));
            const busy = busyId === task._id;
            return (
              <div
                key={task._id}
                className="group flex items-center gap-2 rounded-md border border-transparent px-1.5 py-1.5 transition-colors hover:border-(--border) hover:bg-(--background-subtle)"
              >
                <button
                  type="button"
                  onClick={() => complete(task._id)}
                  disabled={busy}
                  aria-label={t('toolDock.completeTask', 'Mark done')}
                  title={t('toolDock.completeTask', 'Mark done')}
                  className={cn(
                    'flex size-4.5 shrink-0 items-center justify-center rounded border transition-colors',
                    'border-(--border-strong) text-transparent hover:border-(--success-solid) hover:bg-(--success-quiet) hover:text-(--success-text)',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary)/40 disabled:opacity-50',
                  )}
                >
                  {busy ? (
                    <Loader2
                      className="size-3 animate-spin text-(--text-muted)"
                      aria-hidden="true"
                    />
                  ) : (
                    <Check className="size-3" aria-hidden="true" />
                  )}
                </button>
                <Link href="/tasks" className="min-w-0 flex-1 truncate">
                  <span
                    className={cn(
                      'text-[13px] font-medium leading-tight',
                      overdue ? 'text-(--danger-text)' : 'text-(--text-primary)',
                    )}
                  >
                    {localizedTaskTitle(t, task)}
                  </span>
                </Link>
                {overdue && (
                  <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-(--danger-text)">
                    <AlertTriangle className="size-3" aria-hidden="true" />
                    {t('toolDock.overdue', 'Overdue')}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default TasksFocusWidget;
