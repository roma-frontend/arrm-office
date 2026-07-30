'use client';

import { useTranslation } from 'react-i18next';
import { useTheme } from '@/components/ThemeProvider';
import { format, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';

interface LeaveHeatmapProps {
  leaves: Array<{
    startDate: string;
    endDate: string;
    status: string;
  }>;
  month?: Date;
}

export function LeaveHeatmap({ leaves, month = new Date() }: LeaveHeatmapProps) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const lang = i18n.language || 'en';
  const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;
  const days = eachDayOfInterval({
    start: startOfMonth(month),
    end: endOfMonth(month),
  });

  // Count leaves per day (approved only)
  const getLeaveCount = (day: Date) => {
    return leaves.filter((leave) => {
      const start = new Date(leave.startDate);
      const end = new Date(leave.endDate);
      return day >= start && day <= end && leave.status === 'approved';
    }).length;
  };

  const maxCount = Math.max(...days.map(getLeaveCount), 1);

  const getColor = (count: number) => {
    if (count === 0) return isDark ? 'bg-slate-800/50' : 'bg-slate-100';
    const intensity = count / maxCount;
    if (intensity > 0.75) return isDark ? 'bg-blue-500' : 'bg-blue-600';
    if (intensity > 0.5) return isDark ? 'bg-blue-400' : 'bg-blue-500';
    if (intensity > 0.25) return isDark ? 'bg-sky-400' : 'bg-sky-400';
    return isDark ? 'bg-sky-500/60' : 'bg-sky-300';
  };

  const getTextColor = (count: number) => {
    if (count === 0) return isDark ? 'text-slate-400' : 'text-slate-500';
    return 'text-white';
  };

  return (
    <div className="bg-(--background-subtle) rounded-2xl p-6 shadow-lg border border-(--border)">
      <h3 className="text-xl font-bold mb-6 text-(--text-primary)">
        📅 {t('leaveHeatmap.title')} - {format(month, 'MMMM yyyy', { locale: dateFnsLocale })}
      </h3>

      <div className="grid grid-cols-7 gap-2">
        {[
          t('leaveHeatmap.daysSun'),
          t('leaveHeatmap.daysMon'),
          t('leaveHeatmap.daysTue'),
          t('leaveHeatmap.daysWed'),
          t('leaveHeatmap.daysThu'),
          t('leaveHeatmap.daysFri'),
          t('leaveHeatmap.daysSat'),
        ].map((day) => (
          <div
            key={day}
            className="text-xs font-semibold text-(--text-muted) text-center uppercase tracking-wider mb-1"
          >
            {day}
          </div>
        ))}

        {days.map((day) => {
          const count = getLeaveCount(day);
          return (
            <div
              key={day.toISOString()}
              className={`aspect-square rounded-xl ${getColor(count)} ${getTextColor(count)} flex items-center justify-center text-sm font-semibold cursor-pointer hover:scale-105 hover:shadow-md transition-all duration-300 ease-out group relative`}
              title={
                count === 1
                  ? t('leaveHeatmap.tooltipSingle', {
                      date: format(day, 'MMM d', { locale: dateFnsLocale }),
                      count,
                    })
                  : t('leaveHeatmap.tooltipMultiple', {
                      date: format(day, 'MMM d', { locale: dateFnsLocale }),
                      count,
                    })
              }
            >
              <span className="relative z-10">{format(day, 'd', { locale: dateFnsLocale })}</span>
              {count > 0 && (
                <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mt-6 text-xs text-(--text-muted)">
        <span>{t('leaveHeatmap.less')}</span>
        <div className="flex gap-1.5">
          <div className={`w-5 h-5 rounded ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`} />
          <div className={`w-5 h-5 rounded ${isDark ? 'bg-sky-500/60' : 'bg-sky-300'}`} />
          <div className={`w-5 h-5 rounded ${isDark ? 'bg-sky-400' : 'bg-sky-400'}`} />
          <div className={`w-5 h-5 rounded ${isDark ? 'bg-blue-400' : 'bg-blue-500'}`} />
          <div className={`w-5 h-5 rounded ${isDark ? 'bg-blue-500' : 'bg-blue-600'}`} />
        </div>
        <span>{t('leaveHeatmap.more')}</span>
      </div>
    </div>
  );
}

export default LeaveHeatmap;
