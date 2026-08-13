'use client';

import { useTranslation } from 'react-i18next';
import { useChartTheme } from '@/lib/chart-theme';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from '@/lib/dynamic-imports';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';

interface LeavesTrendChartProps {
  leaves: Array<{
    startDate: string;
    endDate: string;
    days: number;
    status: string;
  }>;
}

export function LeavesTrendChart({ leaves }: LeavesTrendChartProps) {
  const { t, i18n } = useTranslation();
  const { status, textColor, gridStroke, axisTickFill, tooltipProps } = useChartTheme();

  const dfLocale = i18n.language === 'ru' ? ru : i18n.language === 'hy' ? hy : enUS;
  // Generate last 6 months
  const now = new Date();
  const months = eachMonthOfInterval({
    start: subMonths(now, 5),
    end: now,
  });

  // Count leaves per month
  const data = months.map((month) => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);

    const monthLeaves = leaves.filter((leave) => {
      const leaveStart = new Date(leave.startDate);
      const leaveEnd = new Date(leave.endDate);
      return (
        (leaveStart >= monthStart && leaveStart <= monthEnd) ||
        (leaveEnd >= monthStart && leaveEnd <= monthEnd) ||
        (leaveStart <= monthStart && leaveEnd >= monthEnd)
      );
    });

    const approved = monthLeaves.filter((l) => l.status === 'approved').length;
    const pending = monthLeaves.filter((l) => l.status === 'pending').length;
    const rejected = monthLeaves.filter((l) => l.status === 'rejected').length;

    return {
      month: format(month, 'MMM yyyy', { locale: dfLocale }),
      approved,
      pending,
      rejected,
      total: monthLeaves.length,
    };
  });

  return (
    <div className="bg-(--background-subtle) rounded-2xl p-6 shadow-lg border border-(--border)">
      <h3 className="text-xl font-bold mb-4 text-(--text-primary)">
        📈 {t('leaveRequestsTrend.title')}
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.3} />
          <XAxis dataKey="month" tick={{ fill: axisTickFill, fontSize: 12 }} />
          <YAxis tick={{ fill: axisTickFill, fontSize: 12 }} />
          <Tooltip {...tooltipProps} />
          <Legend
            wrapperStyle={{ color: textColor, fontSize: '13px' }}
            formatter={(value: string) => (
              <span style={{ color: textColor, fontWeight: 500 }}>{value}</span>
            )}
          />
          <Line
            type="monotone"
            dataKey="approved"
            stroke={status.success}
            strokeWidth={2}
            name={t('leaveRequestsTrend.approved')}
          />
          <Line
            type="monotone"
            dataKey="pending"
            stroke={status.warning}
            strokeWidth={2}
            name={t('leaveRequestsTrend.pending')}
          />
          <Line
            type="monotone"
            dataKey="rejected"
            stroke={status.danger}
            strokeWidth={2}
            name={t('leaveRequestsTrend.rejected')}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default LeavesTrendChart;
