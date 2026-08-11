'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { StatsCard } from '@/components/analytics/StatsCard';
import dynamic from 'next/dynamic';
import { WidgetErrorBoundary } from '@/components/error/WidgetErrorBoundary';

// Recharts is ~500KB — lazy load chart components so they don't block
// the initial analytics page render
const ChartSkeleton = () => (
  <div className="h-96 bg-(--background-subtle) animate-pulse rounded-2xl" />
);
const LeavesTrendChart = dynamic(
  () =>
    import('@/components/analytics/LeavesTrendChart').then((mod) => ({
      default: (props: {
        leaves: Array<{ startDate: string; endDate: string; days: number; status: string }>;
      }) => (
        <WidgetErrorBoundary name="LeavesTrendChart">
          <mod.LeavesTrendChart {...props} />
        </WidgetErrorBoundary>
      ),
    })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
import type { User } from '@/components/analytics/DepartmentStats';
const DepartmentStats = dynamic(
  () =>
    import('@/components/analytics/DepartmentStats').then((mod) => ({
      default: (props: { users: User[] }) => (
        <WidgetErrorBoundary name="DepartmentStats">
          <mod.DepartmentStats {...props} />
        </WidgetErrorBoundary>
      ),
    })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const LeaveHeatmap = dynamic(
  () =>
    import('@/components/analytics/LeaveHeatmap').then((mod) => ({
      default: (props: {
        leaves: Array<{ startDate: string; endDate: string; status: string }>;
        month?: Date;
      }) => (
        <WidgetErrorBoundary name="LeaveHeatmap">
          <mod.LeaveHeatmap {...props} />
        </WidgetErrorBoundary>
      ),
    })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const AttritionRiskPanel = dynamic(
  () =>
    import('@/components/analytics/AttritionRiskPanel').then((mod) => ({
      default: (props: { organizationId: Id<'organizations'> | undefined }) => (
        <WidgetErrorBoundary name="AttritionRiskPanel">
          <mod.AttritionRiskPanel {...props} />
        </WidgetErrorBoundary>
      ),
    })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
import { Users, Clock, CheckCircle, AlertCircle, TrendingUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PlanGate } from '@/components/subscription/PlanGate';

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const router = useRouter();

  // Only admin and supervisor can access
  React.useEffect(() => {
    if (user && user.role === 'employee') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  // Determine organizationId to query
  // - For admin: ALWAYS use their organizationId (not selectedOrgId)
  // - For superadmin: use selectedOrgId if available, otherwise no filter
  const orgIdToQuery = user?.role === 'admin' ? user?.organizationId : selectedOrgId;

  const analytics = useQuery(
    api.analytics.getAnalyticsOverview,
    user?.id
      ? orgIdToQuery
        ? { organizationId: orgIdToQuery as Id<'organizations'> }
        : {}
      : 'skip',
  );

  if (!analytics) {
    return (
      <div className="p-3 sm:p-4 space-y-4 sm:space-y-6">
        <div className="h-10 bg-(--background-subtle) animate-pulse rounded-lg w-64" />
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-(--background-subtle) animate-pulse rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="h-96 bg-(--background-subtle) animate-pulse rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const {
    totalEmployees,
    pendingApprovals,
    totalLeaves,
    pendingLeaves,
    approvedLeaves,
    avgApprovalTime,
    users: allUsers,
    leaves: allLeaves,
  } = analytics;

  const approvalRate = totalLeaves > 0 ? ((approvedLeaves / totalLeaves) * 100).toFixed(1) : 0;

  return (
    <PlanGate
      feature={'advancedAnalytics' as const}
      title={t('planGate.analyticsTitle')}
      description={t('planGate.analyticsDescription')}
    >
      <div className="space-y-4 sm:space-y-6">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary)">
              {t('analytics.analyticsDashboard')}
            </h2>
            <p className="text-(--text-muted) text-sm mt-1">{t('analytics.hrMetricsOverview')}</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
          <StatsCard
            title={t('titles.totalEmployees')}
            value={totalEmployees}
            icon={Users}
            color="blue"
          />
          <StatsCard
            title={t('titles.pendingApprovals')}
            value={pendingApprovals}
            icon={AlertCircle}
            color="yellow"
          />
          <StatsCard
            title={t('titles.leaveRequests')}
            value={totalLeaves}
            icon={CheckCircle}
            color="purple"
          />
          <StatsCard
            title={t('titles.avgApprovalTime')}
            value={`${avgApprovalTime}h`}
            icon={Clock}
            color="green"
          />
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          <div className="bg-(--background-subtle) rounded-2xl p-4 sm:p-6 shadow-lg border border-(--border)">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-(--text-muted)">
                  {t('analytics.pendingLeaves')}
                </p>
                <p className="text-xl sm:text-2xl font-bold text-yellow-600 dark:text-yellow-500 mt-1">
                  {pendingLeaves}
                </p>
              </div>
              <div className="p-2 sm:p-3 bg-yellow-500/20 dark:bg-yellow-500/30 rounded-xl">
                <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600 dark:text-yellow-500" />
              </div>
            </div>
          </div>

          <div className="bg-(--background-subtle) rounded-2xl p-4 sm:p-6 shadow-lg border border-(--border)">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-(--text-muted)">
                  {t('analytics.approvedLeaves')}
                </p>
                <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-500 mt-1">
                  {approvedLeaves}
                </p>
              </div>
              <div className="p-2 sm:p-3 bg-green-500/20 dark:bg-green-500/30 rounded-xl">
                <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-500" />
              </div>
            </div>
          </div>

          <div className="bg-(--background-subtle) rounded-2xl p-4 sm:p-6 shadow-lg border border-(--border)">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-(--text-muted)">
                  {t('analytics.approvalRate')}
                </p>
                <p className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-500 mt-1">
                  {approvalRate}%
                </p>
              </div>
              <div className="p-2 sm:p-3 bg-blue-500/20 dark:bg-blue-500/30 rounded-xl">
                <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
          <LeavesTrendChart leaves={allLeaves} />
          <DepartmentStats users={allUsers} />
        </div>

        {/* Heatmap */}
        <LeaveHeatmap leaves={allLeaves} />

        {/* AI Attrition Risk */}
        <AttritionRiskPanel organizationId={orgIdToQuery as Id<'organizations'> | undefined} />
      </div>
    </PlanGate>
  );
}
