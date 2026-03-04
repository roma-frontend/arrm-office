"use client";

import { useTranslation } from "react-i18next";
import { format, eachDayOfInterval, startOfMonth, endOfMonth, isSameDay } from 'date-fns';

interface LeaveHeatmapProps {
  leaves: Array<{
    startDate: string;
    endDate: string;
    status: string;
  }>;
  month?: Date;
}

export function LeaveHeatmap({ 
leaves, month = new Date() }: LeaveHeatmapProps) {
  const { t } = useTranslation();
  const days = eachDayOfInterval({
    start: startOfMonth(month),
    end: endOfMonth(month),
  });

  // Count leaves per day
  const getLeaveCount = (day: Date) => {
    return leaves.filter(leave => {
      const start = new Date(leave.startDate);
      const end = new Date(leave.endDate);
      return day >= start && day <= end && leave.status === 'approved';
    }).length;
  };

  const maxCount = Math.max(...days.map(getLeaveCount), 1);

  const getColor = (count: number) => {
    if (count === 0) return 'bg-[var(--background-subtle)]';
    const intensity = count / maxCount;
    if (intensity > 0.75) return 'bg-red-500';
    if (intensity > 0.5) return 'bg-orange-500';
    if (intensity > 0.25) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="bg-[var(--background)] rounded-2xl p-6 shadow-lg border border-[var(--border)]">
      <h3 className="text-xl font-bold mb-4 text-[var(--text-primary)]">
        📅 {t('leaveHeatmap.title')} - {format(month, 'MMMM yyyy')}
      </h3>
      
      <div className="grid grid-cols-7 gap-2">
        {[t('leaveHeatmap.daysSun'), t('leaveHeatmap.daysMon'), t('leaveHeatmap.daysTue'), t('leaveHeatmap.daysWed'), t('leaveHeatmap.daysThu'), t('leaveHeatmap.daysFri'), t('leaveHeatmap.daysSat')].map(day => (
          <div key={day} className="text-xs font-medium text-[var(--text-muted)] text-center">
            {day}
          </div>
        ))}
        
        {days.map(day => {
          const count = getLeaveCount(day);
          return (
            <div
              key={day.toISOString()}
              className={`aspect-square rounded-lg ${getColor(count)} flex items-center justify-center text-xs font-medium text-white cursor-pointer hover:scale-110 transition-transform`}
              title={count === 1 ? t("leaveHeatmap.tooltipSingle", { date: format(day, "MMM d"), count }) : t("leaveHeatmap.tooltipMultiple", { date: format(day, "MMM d"), count })}
            >
              {format(day, 'd')}
            </div>
          );
        })}
      </div>
      
      <div className="flex items-center gap-4 mt-4 text-xs text-[var(--text-muted)]">
        <span>{t("leaveHeatmap.less")}</span>
        <div className="flex gap-1">
          <div className="w-4 h-4 rounded bg-[var(--background-subtle)]" />
          <div className="w-4 h-4 rounded bg-green-500" />
          <div className="w-4 h-4 rounded bg-yellow-500" />
          <div className="w-4 h-4 rounded bg-orange-500" />
          <div className="w-4 h-4 rounded bg-red-500" />
        </div>
        <span>{t("leaveHeatmap.more")}</span>
      </div>
    </div>
  );
}

export default LeaveHeatmap;

