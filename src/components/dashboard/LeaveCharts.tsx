'use client';

import React from 'react';
import { motion } from '@/lib/cssMotion';
import { useTranslation } from 'react-i18next';
import { useChartTheme } from '@/lib/chart-theme';
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
import { cn } from '@/lib/utils';

interface LeaveChartsProps {
  monthlyTrend: Array<{ month: string; approved: number; pending: number; rejected: number }>;
  pieData: Array<{ name: string; value: number; color: string }>;
}

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
  const { status, gridStroke, axisTickFill, tooltipStyle, tooltipColor, hoverFill } =
    useChartTheme();
  // Index of the slice under the pointer, or null. Drives three things at once:
  // the slice highlight, the dimming of the others, and hiding the total in the
  // hole — the tooltip is anchored to the pointer, so the total has to step
  // aside rather than be covered by it.
  const [activeSlice, setActiveSlice] = React.useState<number | null>(null);

  const pieTotal = pieData.reduce((sum, d) => sum + d.value, 0);
  const hasTrend = monthlyTrend.some((m) => m.approved + m.pending + m.rejected > 0);

  return (
    <div className="flex h-full flex-col gap-3 sm:gap-4">
      {/* Bar chart — flex-1 makes it soak up whatever height the pie card
          below doesn't need, so the left column reads as one solid block
          with no dead band between the two charts. */}
      <motion.div variants={itemVariants} className="min-h-0 flex-1">
        <Card className="flex h-full flex-col glass-panel">
          {/* The legend moves into the header: it belongs with the title, and
              inside the plot it ate a row of the chart's own height. */}
          <SectionHeader
            title={t('dashboard.monthlyLeaveTrend')}
            aside={
              <div className="flex items-center gap-3 ml-auto">
                <LegendDot color={status.success} label={t('statuses.approved')} />
                <LegendDot color={status.warning} label={t('statuses.pending')} />
                <LegendDot color={status.danger} label={t('statuses.rejected')} />
              </div>
            }
          />
          <CardContent className="flex min-h-0 flex-1 flex-col px-2 pb-4 sm:px-3">
            {hasTrend ? (
              <div className="min-h-[220px] flex-1">
                <ResponsiveContainer width="100%" height="100%">
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
                      cursor={{ fill: hoverFill }}
                    />
                    <Bar
                      dataKey="approved"
                      name={t('statuses.approved')}
                      fill={status.success}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={22}
                    />
                    <Bar
                      dataKey="pending"
                      name={t('statuses.pending')}
                      fill={status.warning}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={22}
                    />
                    <Bar
                      dataKey="rejected"
                      name={t('statuses.rejected')}
                      fill={status.danger}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={22}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
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

      {/* Pie — natural height, donut + legend side by side. The legend is the
          body text of this card, not a caption squeezed under a stretched
          donut, so the card never grows dead space. */}
      <motion.div variants={itemVariants}>
        <Card className="glass-panel">
          <SectionHeader title={t('dashboard.leaveDistribution')} />
          <CardContent className="px-4 pb-4 sm:px-5">
            {pieData.length > 0 ? (
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
                <div
                  className="relative shrink-0"
                  // Safety net: if the pointer leaves the chart faster than
                  // Recharts reports it, the highlight would otherwise stick.
                  onMouseLeave={() => setActiveSlice(null)}
                >
                  <ResponsiveContainer width={150} height={150}>
                    <PieChart onMouseLeave={() => setActiveSlice(null)}>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        innerRadius={48}
                        outerRadius={72}
                        paddingAngle={2}
                        dataKey="value"
                        onMouseEnter={(_: unknown, index: number) => setActiveSlice(index)}
                        onMouseLeave={() => setActiveSlice(null)}
                      >
                        {pieData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.color}
                            stroke="none"
                            // Dim the rest so the tooltip is unmistakably about
                            // the slice under the pointer.
                            opacity={activeSlice === null || activeSlice === index ? 1 : 0.3}
                          />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={tooltipStyle}
                        itemStyle={{ color: tooltipColor }}
                        labelStyle={{ color: tooltipColor }}
                        formatter={(value, name) => [
                          `${value} · ${pieTotal > 0 ? Math.round((Number(value) / pieTotal) * 100) : 0}%`,
                          name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* The hole in the middle is where the total belongs — except
                      while a slice is hovered, when the pointer-anchored tooltip
                      occupies that space. Fading it out beats letting the two
                      overlap.

                      The delay only applies to coming *back*: moving from one
                      slice straight to its neighbour briefly reports "left a
                      slice" before "entered a slice", and without the delay the
                      total flashed on for that frame. */}
                  <div
                    aria-hidden={activeSlice !== null}
                    className={cn(
                      'absolute inset-0 flex flex-col items-center justify-center pointer-events-none transition-opacity duration-150 motion-reduce:transition-none',
                      activeSlice === null ? 'opacity-100 delay-100' : 'opacity-0 delay-0',
                    )}
                  >
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
                <ul className="w-full flex-1 min-w-0 space-y-1.5">
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
