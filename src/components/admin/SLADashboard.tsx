/**
 * 📊 SLA Dashboard Component
 *
 * Displays SLA metrics for leave request response times
 * - Average response time
 * - On-time vs breached percentage
 * - Warning/Critical alerts
 * - Trend over time
 */

'use client';

import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '@/../convex/_generated/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Calendar,
  Timer,
} from 'lucide-react';

interface SLAMetric {
  _id: string;
  leaveRequestId: string;
  submittedAt: number;
  respondedAt?: number;
  responseTimeHours?: number;
  targetResponseTimeHours: number;
  status: 'pending' | 'on_time' | 'breached';
  warningTriggered: boolean;
  criticalTriggered: boolean;
  slaScore?: number;
  createdAt: number;
}

interface SLADashboardProps {
  organizationId?: string;
}

function SLADashboard({ organizationId }: SLADashboardProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'hy' ? 'hy-AM' : 'en-US';
  const slaMetricsRaw = useQuery(api.sla.getSLAStats, { organizationId: organizationId as any });
  const slaMetrics = Array.isArray(slaMetricsRaw) ? slaMetricsRaw : [];
  const slaConfig = useQuery(api.sla.getSLAConfig);

  // Calculate statistics
  const totalMetrics = slaMetrics.length;
  const pendingMetrics = slaMetrics.filter((m: SLAMetric) => m.status === 'pending').length;
  const onTimeMetrics = slaMetrics.filter((m: SLAMetric) => m.status === 'on_time').length;
  const breachedMetrics = slaMetrics.filter((m: SLAMetric) => m.status === 'breached').length;

  // Calculate average response time (only for responded requests)
  const respondedMetrics = slaMetrics.filter((m: SLAMetric) => m.responseTimeHours !== undefined);
  const avgResponseTime =
    respondedMetrics.length > 0
      ? respondedMetrics.reduce(
          (sum: number, m: SLAMetric) => sum + (m.responseTimeHours || 0),
          0,
        ) / respondedMetrics.length
      : 0;

  // Calculate SLA compliance percentage
  const complianceRate = totalMetrics > 0 ? (onTimeMetrics / totalMetrics) * 100 : 100;

  // Calculate warning and critical counts
  const warningCount = slaMetrics.filter(
    (m: SLAMetric) => m.warningTriggered && !m.criticalTriggered,
  ).length;
  const criticalCount = slaMetrics.filter((m: SLAMetric) => m.criticalTriggered).length;

  // Trend calculation (compare last 7 days vs previous 7 days)
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

  const recentMetrics = slaMetrics.filter((m: SLAMetric) => m.createdAt >= sevenDaysAgo);
  const previousMetrics = slaMetrics.filter(
    (m: SLAMetric) => m.createdAt >= fourteenDaysAgo && m.createdAt < sevenDaysAgo,
  );

  const recentCompliance =
    recentMetrics.length > 0
      ? (recentMetrics.filter((m: SLAMetric) => m.status === 'on_time').length /
          recentMetrics.length) *
        100
      : 100;

  const previousCompliance =
    previousMetrics.length > 0
      ? (previousMetrics.filter((m: SLAMetric) => m.status === 'on_time').length /
          previousMetrics.length) *
        100
      : 100;

  const trend = recentCompliance - previousCompliance;
  const isImproving = trend > 0;

  // Target response time from config
  const targetHours = slaConfig?.targetResponseTimeHours || 24;

  if (slaMetricsRaw === undefined)
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Average Response Time */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('slaDashboard.avgResponseTime')}</CardTitle>
          <Timer className="h-4 w-4 text-(--text-muted)" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {avgResponseTime.toFixed(1)}
            {t('common.hoursShort')}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('slaDashboard.targetHours', { hours: targetHours })}
          </p>
          {avgResponseTime <= targetHours ? (
            <div className="flex items-center text-success text-xs mt-1">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {t('slaDashboard.withinTarget')}
            </div>
          ) : (
            <div className="flex items-center text-destructive text-xs mt-1">
              <AlertCircle className="h-3 w-3 mr-1" />
              {t('slaDashboard.aboveTarget')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SLA Compliance Rate */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('slaDashboard.slaCompliance')}</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-(--text-muted)" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{complianceRate.toFixed(1)}%</div>
          <Progress value={complianceRate} className="mt-2" />
          <div
            className={`flex items-center text-xs mt-1 ${isImproving ? 'text-success' : 'text-destructive'}`}
          >
            {isImproving ? (
              <TrendingUp className="h-3 w-3 mr-1" />
            ) : (
              <TrendingDown className="h-3 w-3 mr-1" />
            )}
            {t('slaDashboard.vsLastWeek', { trend: Math.abs(trend).toFixed(1) })}
          </div>
        </CardContent>
      </Card>

      {/* Pending Requests */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('slaDashboard.pendingRequests')}</CardTitle>
          <Clock className="h-4 w-4 text-(--text-muted)" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{pendingMetrics}</div>
          <p className="text-xs text-muted-foreground">
            {t('slaDashboard.onTimeBreached', { onTime: onTimeMetrics, breached: breachedMetrics })}
          </p>
          {pendingMetrics > 0 && (
            <Badge variant="secondary" className="mt-2">
              {t('slaDashboard.needsAttention')}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Alerts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('slaDashboard.alerts')}</CardTitle>
          <AlertTriangle className="h-4 w-4 text-(--text-muted)" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div>
              <div className="text-2xl font-bold text-warning">{warningCount}</div>
              <p className="text-xs text-muted-foreground">{t('slaDashboard.warnings')}</p>
            </div>
            <div>
              <div className="text-2xl font-bold text-destructive">{criticalCount}</div>
              <p className="text-xs text-muted-foreground">{t('slaDashboard.critical')}</p>
            </div>
          </div>
          {(warningCount > 0 || criticalCount > 0) && (
            <Badge variant="destructive" className="mt-2">
              {t('slaDashboard.actionRequired')}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Detailed SLA Breakdown */}
      <Card className="md:col-span-2 lg:col-span-4 my-6">
        <CardHeader>
          <CardTitle>{t('slaDashboard.performanceBreakdown')}</CardTitle>
          <CardDescription>{t('slaDashboard.responseTimeDistribution')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* On-time requests */}
            <div className="flex items-center gap-4">
              <div className="w-32 text-sm font-medium">{t('slaDashboard.onTime')}</div>
              <div className="flex-1">
                <Progress value={complianceRate} className="h-2" />
              </div>
              <div className="w-20 text-right text-sm">
                {onTimeMetrics} ({complianceRate.toFixed(0)}%)
              </div>
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>

            {/* Breached requests */}
            <div className="flex items-center gap-4">
              <div className="w-32 text-sm font-medium">{t('slaDashboard.breached')}</div>
              <div className="flex-1">
                <Progress value={100 - complianceRate} className="h-2 [&>div]:bg-destructive" />
              </div>
              <div className="w-20 text-right text-sm">
                {breachedMetrics} ({(100 - complianceRate).toFixed(0)}%)
              </div>
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>

            {/* Pending requests */}
            <div className="flex items-center gap-4">
              <div className="w-32 text-sm font-medium">{t('slaDashboard.pending')}</div>
              <div className="flex-1">
                <Progress
                  value={(pendingMetrics / totalMetrics) * 100}
                  className="h-2 [&>div]:bg-muted-foreground"
                />
              </div>
              <div className="w-20 text-right text-sm">
                {pendingMetrics} (
                {totalMetrics > 0 ? ((pendingMetrics / totalMetrics) * 100).toFixed(0) : 0}%)
              </div>
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>

          {/* SLA Config Info */}
          {slaConfig && (
            <div className="mt-6 p-4 bg-(--background-subtle) rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t('slaDashboard.slaConfiguration')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('slaDashboard.targetResponseTime', {
                      hours: slaConfig.targetResponseTimeHours,
                    })}
                  </p>
                </div>
                <Badge variant="outline">{t('slaDashboard.fullTime')}</Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default SLADashboard;
