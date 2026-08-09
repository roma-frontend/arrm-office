'use client';

import React, { memo } from 'react';
import { localizedTaskTitle } from '@/lib/taskTitle';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { formatDistanceToNowStrict, isPast } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import Link from 'next/link';
import { ListChecks, Clock, AlertTriangle } from 'lucide-react';
import { api } from '../../../../convex/_generated/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

const PRIORITY_VARIANT: Record<TaskPriority, 'secondary' | 'warning' | 'destructive'> = {
  low: 'secondary',
  medium: 'secondary',
  high: 'warning',
  urgent: 'destructive',
};

export const MyTasksWidget = memo(function MyTasksWidget({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const lang = i18n.language || 'en';
  const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;

  const tasks = useQuery(api.dashboard.getMyTasks, userId ? {} : 'skip');

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-[#2563eb]" />
            {t('dashboardWidgets.myTasks', 'My Tasks')}
          </CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/tasks">{t('dashboardWidgets.viewAll', 'View all')}</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {tasks === undefined ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 bg-(--background-subtle) animate-pulse rounded-lg" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-8">
            <ListChecks className="w-12 h-12 text-(--text-muted) mx-auto mb-3 opacity-40" />
            <p className="text-sm text-(--text-muted)">
              {t('dashboardWidgets.noTasks', 'No active tasks — you are all caught up!')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.slice(0, 5).map((task) => {
              const overdue = typeof task.deadline === 'number' && isPast(new Date(task.deadline));
              return (
                <Link
                  key={task._id}
                  href="/tasks"
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border border-(--border) hover:bg-(--background-subtle) transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-(--text-primary) truncate">
                      {localizedTaskTitle(t, task)}
                    </p>
                    {typeof task.deadline === 'number' && (
                      <p
                        className={`text-xs mt-0.5 flex items-center gap-1 ${overdue ? 'text-[#ef4444]' : 'text-(--text-muted)'}`}
                      >
                        {overdue ? (
                          <AlertTriangle className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        {overdue
                          ? t('dashboardWidgets.overdue', 'Overdue')
                          : t('dashboardWidgets.dueIn', 'Due in {{time}}', {
                              time: formatDistanceToNowStrict(new Date(task.deadline), {
                                locale: dateFnsLocale,
                              }),
                            })}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={PRIORITY_VARIANT[task.priority as TaskPriority]}
                    className="capitalize shrink-0"
                  >
                    {t(`tasks.priority.${task.priority}`, task.priority)}
                  </Badge>
                </Link>
              );
            })}
            {tasks.length > 5 && (
              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link href="/tasks">
                  {t('dashboardWidgets.viewAllTasks', 'View all {{count}} tasks', {
                    count: tasks.length,
                  })}
                </Link>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export default MyTasksWidget;
