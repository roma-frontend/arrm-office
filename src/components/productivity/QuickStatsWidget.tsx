'use client';

import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuthStore } from '@/store/useAuthStore';
import type { Id } from '../../../convex/_generated/dataModel';
import { Clock, CheckCircle2, Calendar, TrendingUp } from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

export function QuickStatsWidget() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const stats = useQuery(
    api.productivity.getTodayStats,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  if (!stats) {
    return (
      <div className="flex items-center justify-center py-8">
        <ShieldLoader size="md" />
      </div>
    );
  }

  const statItems = [
    {
      icon: Clock,
      label: t('quickStats.today'),
      value: `${stats.hoursWorkedToday}h`,
      subtext: t('quickStats.thisWeek', { hours: stats.hoursWorkedWeek }),
      color: 'text-(--primary)',
      bgColor: 'bg-(--primary)/10',
    },
    {
      icon: CheckCircle2,
      label: t('quickStats.tasks'),
      value: `${stats.completedTasksToday}/${stats.totalTasksWeek}`,
      subtext: t('quickStats.doneThisWeek', { completed: stats.completedTasksWeek }),
      color: 'text-(--primary)',
      bgColor: 'bg-(--primary)/10',
    },
    {
      icon: Calendar,
      label: t('quickStats.deadlines'),
      value: stats.todayDeadlines,
      subtext: t('quickStats.dueToday'),
      color: stats.todayDeadlines > 0 ? 'text-orange-500' : 'text-(--text-muted)',
      bgColor: stats.todayDeadlines > 0 ? 'bg-orange-500/10' : 'bg-(--background-subtle)',
    },
    {
      icon: TrendingUp,
      label: t('quickStats.weeklyGoal'),
      value: `${stats.weeklyGoalProgress}%`,
      subtext: t('quickStats.target', { hours: 40 }),
      color: 'text-(--primary)',
      bgColor: 'bg-(--primary)/10',
    },
  ];

  return (
    <div className="px-2 py-3">
      <div className="mb-2 flex items-center justify-between px-2">
        <h3 className="text-xs font-semibold text-(--text-muted)">
          {t('quickStats.todaysOverview')}
        </h3>
        {stats.isClockedIn && (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-(--primary) opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-(--primary)"></span>
            </span>
            <span className="text-[10px] text-(--primary) font-medium">
              {t('quickStats.clockedIn')}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {statItems.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div
              key={idx}
              className={`flex flex-col rounded-lg p-3 transition-all hover:scale-[1.02] ${stat.bgColor}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-3.5 h-3.5 ${stat.color}`} />
                <span className="text-[10px] font-medium text-(--text-muted)">{stat.label}</span>
              </div>
              <div className="text-xl font-bold text-(--text-primary)">{stat.value}</div>
              <div className="text-[10px] text-(--text-muted) mt-0.5">{stat.subtext}</div>
            </div>
          );
        })}
      </div>

      {/* Weekly progress bar */}
      <div className="mt-3 px-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-(--text-muted)">{t('quickStats.weeklyProgress')}</span>
          <span className="text-[10px] font-semibold text-(--text-primary)">
            {stats.weeklyGoalProgress}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-(--background-subtle) overflow-hidden">
          <div
            className="h-full bg-(--primary) transition-all duration-500"
            style={{ width: `${Math.min(100, stats.weeklyGoalProgress)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
