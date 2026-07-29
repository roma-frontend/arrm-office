'use client';

import { useTranslation } from 'react-i18next';
import { useTheme } from '@/components/ThemeProvider';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Clock, TrendingUp, AlertTriangle, CheckCircle2, XCircle, Activity } from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from '@/lib/dynamic-imports';

interface SLAStatsProps {
  startDate?: number;
  endDate?: number;
  organizationId?: string;
}

function ResponseTimeSLA({ startDate, endDate, organizationId }: SLAStatsProps) {
  const { t, i18n } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const locale = i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'hy' ? 'hy-AM' : 'en-US';

  const tooltipBg = isDark ? '#0f172a' : '#ffffff';
  const tooltipBorder = isDark ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.1)';
  const tooltipColor = isDark ? '#ffffff' : '#0f172a';
  const tooltipShadow = isDark ? '0 4px 12px rgba(0, 0, 0, 0.5)' : '0 4px 12px rgba(0, 0, 0, 0.1)';
  const textColor = isDark ? '#ffffff' : '#0f172a';
  const gridStroke = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';
  const axisTickFill = isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)';
  const stats = useQuery(api.sla.getSLAStats, {
    startDate,
    endDate,
    organizationId: organizationId as Id<'organizations'> | undefined,
  });
  const trend = useQuery(api.sla.getSLATrend, {
    days: 30,
    organizationId: organizationId as Id<'organizations'> | undefined,
  });
  const pendingWithSLA = useQuery(api.sla.getPendingWithSLA, {
    organizationId: organizationId as Id<'organizations'> | undefined,
  });

  if (!stats) {
    return (
      <div className="space-y-4 my-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-(--background-subtle) rounded w-24"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-(--background-subtle) rounded w-16"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const complianceColor =
    stats.complianceRate >= 95
      ? 'text-success'
      : stats.complianceRate >= 80
        ? 'text-warning'
        : 'text-destructive';

  return (
    <div className="space-y-6 my-6">
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Compliance Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('responseSLA.compliance')}</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-(--text-muted)" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${complianceColor}`}>{stats.complianceRate}%</div>
            <p className="text-xs text-(--text-muted)">{t('responseSLA.target95')}</p>
            <Progress value={stats.complianceRate} className="mt-2" />
          </CardContent>
        </Card>

        {/* Average Response Time */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('responseSLA.avgResponseTime')}
            </CardTitle>
            <Clock className="h-4 w-4 text-(--text-muted)" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgResponseTime}h</div>
            <p className="text-xs text-(--text-muted)">
              {t('responseSLA.target', { hours: stats.targetResponseTime })}
            </p>
            <Progress
              value={(stats.avgResponseTime / stats.targetResponseTime) * 100}
              className="mt-2"
            />
          </CardContent>
        </Card>

        {/* SLA Score */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('responseSLA.avgScore')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-(--text-muted)" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgSLAScore}/100</div>
            <p className="text-xs text-(--text-muted)">
              {t('responseSLA.onTimeBreachedShort', {
                onTime: stats.onTime,
                breached: stats.breached,
              })}
            </p>
            <Progress value={stats.avgSLAScore} className="mt-2" />
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('responseSLA.activeAlerts')}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-(--text-muted)" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-(--text-muted)">{t('responseSLA.critical')}</span>
                <Badge variant="destructive">{stats.criticalCount}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-(--text-muted)">{t('responseSLA.warning')}</span>
                <Badge variant="secondary">{stats.warningCount}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart */}
      {trend && trend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('responseSLA.performanceTrend')}</CardTitle>
            <CardDescription>{t('responseSLA.responseTimeCompliance')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: axisTickFill }}
                  tickFormatter={(value) =>
                    new Date(value).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
                  }
                />
                <YAxis yAxisId="left" tick={{ fill: axisTickFill }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: axisTickFill }} />
                <Tooltip
                  labelFormatter={(value) => new Date(value).toLocaleDateString(locale)}
                  contentStyle={{
                    background: tooltipBg,
                    border: `1px solid ${tooltipBorder}`,
                    borderRadius: '8px',
                    color: tooltipColor,
                    boxShadow: tooltipShadow,
                  }}
                  itemStyle={{ color: tooltipColor }}
                  labelStyle={{ color: tooltipColor }}
                />
                <Legend wrapperStyle={{ color: textColor }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="avgResponseTime"
                  stroke="#8884d8"
                  name={t('responseSLA.avgResponseTime')}
                  strokeWidth={2}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="complianceRate"
                  stroke="#82ca9d"
                  name={t('responseSLA.complianceRate')}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* On-Time vs Breached Chart */}
      {trend && trend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('responseSLA.slaStatusDistribution')}</CardTitle>
            <CardDescription>{t('responseSLA.onTimeVsBreached')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: axisTickFill }}
                  tickFormatter={(value) =>
                    new Date(value).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
                  }
                />
                <YAxis tick={{ fill: axisTickFill }} />
                <Tooltip
                  labelFormatter={(value) => new Date(value).toLocaleDateString(locale)}
                  contentStyle={{
                    background: tooltipBg,
                    border: `1px solid ${tooltipBorder}`,
                    borderRadius: '8px',
                    color: tooltipColor,
                    boxShadow: tooltipShadow,
                  }}
                  itemStyle={{ color: tooltipColor }}
                  labelStyle={{ color: tooltipColor }}
                />
                <Legend wrapperStyle={{ color: textColor }} />
                <Bar dataKey="onTime" fill="#10b981" name={t('responseSLA.onTime')} stackId="a" />
                <Bar
                  dataKey="breached"
                  fill="#ef4444"
                  name={t('responseSLA.breached')}
                  stackId="a"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Pending Requests with SLA Status */}
      {pendingWithSLA && pendingWithSLA.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('responseSLA.pendingRequests')}</CardTitle>
            <CardDescription>
              {t('responseSLA.requestsAwaiting', { count: pendingWithSLA.length })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingWithSLA.map((request) => {
                const statusConfig = {
                  normal: {
                    color: 'bg-success/10 text-success',
                    icon: Activity,
                    label: t('responseSLA.normal'),
                  },
                  warning: {
                    color: 'bg-warning/10 text-warning',
                    icon: Clock,
                    label: t('responseSLA.warning'),
                  },
                  critical: {
                    color: 'bg-warning/10 text-warning',
                    icon: AlertTriangle,
                    label: t('responseSLA.critical'),
                  },
                  breached: {
                    color: 'bg-destructive/10 text-destructive',
                    icon: XCircle,
                    label: t('responseSLA.breached'),
                  },
                } as const;

                const config = statusConfig[request.sla.status as keyof typeof statusConfig];
                const StatusIcon = config.icon;

                return (
                  <div
                    key={request._id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-(--card-hover) transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className={`p-2 rounded-full ${config.color}`}>
                        <StatusIcon className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{request.userName}</p>
                          <Badge variant="outline">{request.type}</Badge>
                        </div>
                        <p className="text-sm text-(--text-muted)">
                          {request.startDate} → {request.endDate} ({request.days}{' '}
                          {t('responseSLA.days')})
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {request.sla.elapsedHours}
                          {t('common.hoursShort')} / {request.sla.targetHours}
                          {t('common.hoursShort')}
                        </p>
                        <p className="text-xs text-(--text-muted)">
                          {request.sla.remainingHours > 0
                            ? t('responseSLA.remaining', { hours: request.sla.remainingHours })
                            : t('responseSLA.overdueBy', {
                                hours: Math.abs(request.sla.remainingHours),
                              })}
                        </p>
                      </div>
                      <div className="w-24">
                        <Progress value={request.sla.progressPercent} />
                      </div>
                      <Badge className={config.color}>{config.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">
              {t('responseSLA.onTime')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.onTime}</div>
            <p className="text-xs text-(--text-muted)">
              {stats.total > 0 ? Math.round((stats.onTime / stats.total) * 100) : 0}%{' '}
              {t('responseSLA.ofTotal')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">
              {t('responseSLA.pending')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.pending}</div>
            <p className="text-xs text-(--text-muted)">
              {stats.total > 0 ? Math.round((stats.pending / stats.total) * 100) : 0}%{' '}
              {t('responseSLA.ofTotal')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">
              {t('responseSLA.breached')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.breached}</div>
            <p className="text-xs text-(--text-muted)">
              {stats.total > 0 ? Math.round((stats.breached / stats.total) * 100) : 0}%{' '}
              {t('responseSLA.ofTotal')}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default ResponseTimeSLA;
