'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { useTheme } from '@/components/ThemeProvider';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from '@/lib/dynamic-imports';
import { AlertCircle } from 'lucide-react';

type ChartType = 'bar' | 'line' | 'pie' | 'area' | 'table' | 'metric';
type MetricField =
  | 'employees'
  | 'leaves'
  | 'attendance'
  | 'tasks'
  | 'payroll'
  | 'performance'
  | 'recruitment';
type GroupBy = 'department' | 'team' | 'role' | 'location' | 'none';

interface ReportWidgetChartProps {
  type: ChartType;
  metric: MetricField;
  groupBy: GroupBy;
  rangeDays?: number;
  color: string;
  organizationId?: Id<'organizations'>;
  height?: number;
}

const PIE_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#f43f5e',
  '#84cc16',
  '#14b8a6',
  '#d946ef',
];

type Unit = 'count' | 'currency' | 'hours';

// Format a numeric value for display, respecting the metric's unit.
function formatValue(value: number, unit: Unit): string {
  if (unit === 'currency') {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (unit === 'hours') {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)} h`;
  }
  return new Intl.NumberFormat().format(value);
}

export function ReportWidgetChart({
  type,
  metric,
  groupBy,
  rangeDays,
  color,
  organizationId,
  height = 260,
}: ReportWidgetChartProps) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const data = useQuery(api.analytics.getReportData, {
    ...(organizationId ? { organizationId } : {}),
    metric,
    groupBy,
    ...(rangeDays ? { rangeDays } : {}),
  });

  const tooltipBg = isDark ? '#0f172a' : '#ffffff';
  const tooltipBorder = isDark ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.1)';
  const tooltipColor = isDark ? '#ffffff' : '#0f172a';
  const gridStroke = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';
  const axisTickFill = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)';

  const unit: Unit = data?.unit ?? 'count';
  const chartData = useMemo(
    () => (data?.series ?? []).map((s) => ({ name: s.label, value: s.value })),
    [data],
  );

  const tooltipProps = {
    contentStyle: {
      backgroundColor: tooltipBg,
      border: `1px solid ${tooltipBorder}`,
      borderRadius: '8px',
      color: tooltipColor,
    },
    itemStyle: { color: tooltipColor },
    labelStyle: { color: tooltipColor, fontWeight: 700 },
    formatter: (v: unknown) => formatValue(Number(v), unit),
  };

  // ── Loading ──
  if (data === undefined) {
    return (
      <div
        className="rounded-xl bg-(--background-subtle) border border-(--border) animate-pulse"
        style={{ height }}
      />
    );
  }

  // ── Empty state ──
  if (chartData.length === 0) {
    return (
      <div
        className="rounded-xl bg-(--background-subtle) border border-(--border) flex flex-col items-center justify-center text-center px-4"
        style={{ height }}
      >
        <AlertCircle className="w-8 h-8 mb-2 text-(--text-muted)" />
        <p className="text-sm text-(--text-muted)">
          {t('reportBuilder.noData', 'No data available for this metric yet')}
        </p>
      </div>
    );
  }

  // ── Metric card (single big number) ──
  if (type === 'metric') {
    return (
      <div
        className="rounded-xl bg-(--background-subtle) border border-(--border) flex flex-col items-center justify-center"
        style={{ height }}
      >
        <p className="text-4xl font-bold" style={{ color }}>
          {formatValue(data.total, unit)}
        </p>
        <p className="text-sm text-(--text-muted) mt-2">
          {t('reportBuilder.total', 'Total')} · {chartData.length}{' '}
          {t('reportBuilder.groups', 'groups')}
        </p>
      </div>
    );
  }

  // ── Data table ──
  if (type === 'table') {
    return (
      <div
        className="rounded-xl bg-(--background-subtle) border border-(--border) overflow-auto"
        style={{ maxHeight: height }}
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-(--card)">
            <tr className="text-left text-(--text-muted) border-b border-(--border)">
              <th className="px-4 py-2 font-medium">{t('reportBuilder.group', 'Group')}</th>
              <th className="px-4 py-2 font-medium text-right">
                {t('reportBuilder.value', 'Value')}
              </th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((row) => (
              <tr key={row.name} className="border-b border-(--border)/50">
                <td className="px-4 py-2 text-(--text-primary)">{row.name}</td>
                <td className="px-4 py-2 text-right font-mono text-(--text-primary)">
                  {formatValue(row.value, unit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Pie chart ──
  if (type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={height / 3}
            label={(e: { name?: string }) => e.name ?? ''}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip {...tooltipProps} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  // ── Line chart ──
  if (type === 'line') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.3} />
          <XAxis dataKey="name" tick={{ fill: axisTickFill, fontSize: 12 }} />
          <YAxis tick={{ fill: axisTickFill, fontSize: 12 }} />
          <Tooltip {...tooltipProps} />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // ── Area chart ──
  if (type === 'area') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.4} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.3} />
          <XAxis dataKey="name" tick={{ fill: axisTickFill, fontSize: 12 }} />
          <YAxis tick={{ fill: axisTickFill, fontSize: 12 }} />
          <Tooltip {...tooltipProps} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#grad-${color.replace('#', '')})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // ── Bar chart (default) ──
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.3} />
        <XAxis dataKey="name" tick={{ fill: axisTickFill, fontSize: 12 }} />
        <YAxis tick={{ fill: axisTickFill, fontSize: 12 }} />
        <Tooltip {...tooltipProps} cursor={{ fill: isDark ? '#ffffff10' : '#00000008' }} />
        <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default ReportWidgetChart;
