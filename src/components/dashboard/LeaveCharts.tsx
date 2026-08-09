'use client';

import React from 'react';
import { motion } from '@/lib/cssMotion';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/components/ThemeProvider';
import { CalendarDays } from 'lucide-react';
import {
  PieChart,
  Pie,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from '@/lib/dynamic-imports';
import { Cell, Tooltip as RechartsTooltip } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { SectionHeader, SectionEmpty } from '@/components/dashboard/SectionHeader';

interface LeaveChartsProps {
  monthlyTrend: Array<{ month: string; approved: number; pending: number; rejected: number }>;
  pieData: Array<{ name: string; value: number; color: string }>;
}

const CHART_HEIGHT = 220;

/** A dot and a word — the legend Recharts draws costs a row of chart height. */
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-(--text-muted) whitespace-nowrap">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      {label}
    </span>
  );
}

export function LeaveCharts({ monthlyTrend, pieData }: LeaveChartsProps) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const tooltipBg = isDark ? '#0f172a' : '#ffffff';
  const tooltipBorder = isDark ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.1)';
  const tooltipColor = isDark ? '#ffffff' : '#0f172a';
  const tooltipShadow = isDark ? '0 4px 12px rgba(0, 0, 0, 0.5)' : '0 4px 12px rgba(0, 0, 0, 0.1)';
  const gridStroke = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';
  const axisTickFill = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)';

  const tooltipStyle = {
    background: tooltipBg,
    border: `1px solid ${tooltipBorder}`,
    borderRadius: '8px',
    color: tooltipColor,
    boxShadow: tooltipShadow,
  };

  const pieTotal = pieData.reduce((sum, d) => sum + d.value, 0);
  const hasTrend = monthlyTrend.some((m) => m.approved + m.pending + m.rejected > 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4 items-stretch">
      <motion.div variants={itemVariants} className="lg:col-span-3">
        <Card className="h-full">
          {/* The legend moves into the header: it belongs with the title, and
              inside the plot it ate a row of the chart's own height. */}
          <SectionHeader
            title={t('dashboard.monthlyLeaveTrend')}
            aside={
              <div className="flex items-center gap-3 ml-auto">
                <LegendDot color="#10b981" label={t('statuses.approved')} />
                <LegendDot color="#f59e0b" label={t('statuses.pending')} />
                <LegendDot color="#ef4444" label={t('statuses.rejected')} />
              </div>
            }
          />
          <CardContent className="px-2 sm:px-3 pb-4">
            {hasTrend ? (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart data={monthlyTrend} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: axisTickFill, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: axisTickFill, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <RechartsTooltip
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: tooltipColor }}
                    labelStyle={{ color: tooltipColor }}
                    cursor={{ fill: 'rgba(99,102,241,0.05)' }}
                  />
                  <Bar
                    dataKey="approved"
                    name={t('statuses.approved')}
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={22}
                  />
                  <Bar
                    dataKey="pending"
                    name={t('statuses.pending')}
                    fill="#f59e0b"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={22}
                  />
                  <Bar
                    dataKey="rejected"
                    name={t('statuses.rejected')}
                    fill="#ef4444"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={22}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <SectionEmpty
                icon={<CalendarDays className="w-4 h-4" />}
                message={t('dashboard.noLeaveData')}
                className="min-h-[200px]"
              />
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants} className="lg:col-span-2">
        <Card className="h-full">
          <SectionHeader title={t('dashboard.leaveDistribution')} />
          <CardContent className="px-4 sm:px-5 pb-4">
            {pieData.length > 0 ? (
              <div className="flex flex-col sm:flex-row lg:flex-col items-center gap-3">
                <div className="relative shrink-0">
                  <ResponsiveContainer width={150} height={150}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        innerRadius={48}
                        outerRadius={72}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={tooltipStyle}
                        itemStyle={{ color: tooltipColor }}
                        labelStyle={{ color: tooltipColor }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* The hole in the middle is where the total belongs. */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-semibold text-(--text-primary) tabular-nums leading-none">
                      {pieTotal}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-(--text-muted) mt-0.5">
                      {t('dashboard.total')}
                    </span>
                  </div>
                </div>

                {/* Coloured slices with no key are unreadable; each type is named
                    with its own count and share. */}
                <ul className="w-full space-y-1.5 min-w-0">
                  {pieData.map((entry) => (
                    <li key={entry.name} className="flex items-center gap-2 text-xs">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: entry.color }}
                      />
                      <span className="text-(--text-primary) truncate">{entry.name}</span>
                      <span className="ml-auto tabular-nums text-(--text-primary) font-medium">
                        {entry.value}
                      </span>
                      <span className="tabular-nums text-(--text-muted) w-9 text-right">
                        {pieTotal > 0 ? Math.round((entry.value / pieTotal) * 100) : 0}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <SectionEmpty
                icon={<CalendarDays className="w-4 h-4" />}
                message={t('dashboard.noLeaveData')}
              />
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};
