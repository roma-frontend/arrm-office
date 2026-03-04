"use client";

import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useAuthStore } from "@/store/useAuthStore";
import { useSelectedOrganization } from "@/hooks/useSelectedOrganization";
import { StatsCard } from "@/components/analytics/StatsCard";
import dynamic from "next/dynamic";

// Recharts is ~500KB — lazy load chart components so they don't block
// the initial analytics page render
const ChartSkeleton = () => (
  <div className="h-96 bg-[var(--background-subtle)] animate-pulse rounded-2xl" />
);
const LeavesTrendChart = dynamic(
  () => import("@/components/analytics/LeavesTrendChart").then(mod => ({ default: mod.LeavesTrendChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const DepartmentStats = dynamic(
  () => import("@/components/analytics/DepartmentStats").then(mod => ({ default: mod.DepartmentStats })),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const LeaveHeatmap = dynamic(
  () => import("@/components/analytics/LeaveHeatmap").then(mod => ({ default: mod.LeaveHeatmap })),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
import { Users, Clock, CheckCircle, XCircle, AlertCircle, TrendingUp } from "lucide-react";
import { redirect } from "next/navigation";
import { PlanGate } from "@/components/subscription/PlanGate";

export default function AnalyticsPage() {
  
  const { t } = useTranslation();
const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);

  // Only admin and supervisor can access
  if (user && user.role === "employee") {
    redirect("/dashboard");
  }

  // Determine which query to use based on selectedOrgId
  const shouldUseOrgQuery = mounted && selectedOrgId && user?.id;
  
  const analytics = useQuery(
    api.analytics.getAnalyticsOverview,
    mounted && user?.id
      ? shouldUseOrgQuery
        ? { organizationId: selectedOrgId as Id<"organizations"> }
        : {}
      : "skip"
  );

  if (!analytics) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-10 bg-[var(--background-subtle)] animate-pulse rounded-lg w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 bg-[var(--background-subtle)] animate-pulse rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map(i => (
            <div key={i} className="h-96 bg-[var(--background-subtle)] animate-pulse rounded-2xl" />
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
      feature="advancedAnalytics"
      title={t('planGate.analyticsTitle')}
      description={t('planGate.analyticsDescription')}
    >
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">
          {t('analytics.analyticsDashboard')}
        </h2>
        <p className="text-[var(--text-muted)] text-sm mt-1">
          {t('analytics.hrMetricsOverview')}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[var(--background)] rounded-2xl p-6 shadow-lg border border-[var(--border)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--text-muted)]">{t('analytics.pendingLeaves')}</p>
              <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-500 mt-1">{pendingLeaves}</p>
            </div>
            <div className="p-3 bg-yellow-500/20 dark:bg-yellow-500/30 rounded-xl">
              <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-500" />
            </div>
          </div>
        </div>

        <div className="bg-[var(--background)] rounded-2xl p-6 shadow-lg border border-[var(--border)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--text-muted)]">{t('analytics.approvedLeaves')}</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-500 mt-1">{approvedLeaves}</p>
            </div>
            <div className="p-3 bg-green-500/20 dark:bg-green-500/30 rounded-xl">
              <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-500" />
            </div>
          </div>
        </div>

        <div className="bg-[var(--background)] rounded-2xl p-6 shadow-lg border border-[var(--border)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--text-muted)]">{t('analytics.approvalRate')}</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-500 mt-1">{approvalRate}%</p>
            </div>
            <div className="p-3 bg-blue-500/20 dark:bg-blue-500/30 rounded-xl">
              <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LeavesTrendChart leaves={allLeaves} />
        <DepartmentStats users={allUsers} />
      </div>

      {/* Heatmap */}
      <LeaveHeatmap leaves={allLeaves} />
    </div>
    </PlanGate>
  );
}
