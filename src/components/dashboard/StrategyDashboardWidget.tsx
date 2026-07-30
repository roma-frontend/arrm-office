'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useAuthUser } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { motion } from '@/lib/cssMotion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Layers,
  Target,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Building2,
  Users,
  User,
  ListChecks,
} from 'lucide-react';

export default function StrategyDashboardWidget() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthUser();
  const selectedOrgId = useSelectedOrganization();
  const organizationId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;

  const year = new Date().getFullYear();

  const strategySummary = useQuery(
    api.strategyMaps.getStrategySummary,
    organizationId ? { organizationId, periodYear: year } : 'skip',
  );

  // Fetch task alignment stats
  const taskStats = useQuery(
    api.goals.getObjectiveTaskStats,
    organizationId ? { organizationId, periodYear: year } : 'skip',
  );

  if (!strategySummary || strategySummary.total === 0) return null;

  const progressColor =
    strategySummary.avgProgress >= 70
      ? 'text-emerald-500'
      : strategySummary.avgProgress >= 40
        ? 'text-amber-500'
        : 'text-red-500';

  const progressBarColor =
    strategySummary.avgProgress >= 70
      ? 'bg-emerald-500'
      : strategySummary.avgProgress >= 40
        ? 'bg-amber-500'
        : 'bg-red-500';

  const _totalActive = strategySummary.active;
  const issuesCount = strategySummary.atRisk + strategySummary.behind;
  const issuesColor =
    issuesCount === 0 ? 'text-emerald-500' : issuesCount <= 2 ? 'text-amber-500' : 'text-red-500';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <Card className="overflow-hidden border-(--border) relative">
        {/* Gradient accent */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(135deg, rgba(139,92,246,0.06) 0%, rgba(37,99,235,0.03) 100%)',
          }}
        />

        <CardContent className="p-5 relative">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 shadow-lg shadow-purple-500/20">
                <Layers className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  {t('strategyMap.title', 'Strategy Map')}
                  <span className="text-[10px] text-(--text-muted) font-normal">{year}</span>
                </h3>
                <p className="text-xs text-(--text-muted) mt-0.5">
                  {strategySummary.total} {t('strategyMap.totalObjectives', 'objectives')}
                </p>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/strategy')}
              className="text-xs gap-1 h-7 shrink-0"
            >
              {t('strategyMap.viewDetails', 'View')}
              <ArrowRight className="w-3 h-3" />
            </Button>
          </div>

          {/* Level breakdown */}
          <div className="flex items-center gap-4 mb-4 text-xs text-(--text-muted)">
            <span className="flex items-center gap-1">
              <Building2 className="w-3 h-3 text-purple-500" />
              {strategySummary.byLevel.company}
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3 text-blue-500" />
              {strategySummary.byLevel.team}
            </span>
            <span className="flex items-center gap-1">
              <User className="w-3 h-3 text-emerald-500" />
              {strategySummary.byLevel.individual}
            </span>
          </div>

          {/* Overall progress */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="font-medium text-xs text-(--text-muted) uppercase tracking-wider">
                {t('strategyMap.avgProgress', 'Avg Progress')}
              </span>
              <span className={`font-bold text-lg ${progressColor}`}>
                {strategySummary.avgProgress}%
              </span>
            </div>
            <div className="h-2.5 w-full bg-(--background-subtle) rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-out ${progressBarColor}`}
                style={{ width: `${strategySummary.avgProgress}%` }}
              />
            </div>
          </div>

          {/* Health indicators */}
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center p-2 rounded-lg bg-emerald-500/10">
              <p className="text-lg font-bold text-emerald-600">{strategySummary.onTrack}</p>
              <p className="text-[10px] text-(--text-muted) leading-tight">
                {t('strategyMap.onTrack', 'On Track')}
              </p>
            </div>
            <div className="text-center p-2 rounded-lg bg-amber-500/10">
              <p className="text-lg font-bold text-amber-600">{strategySummary.atRisk}</p>
              <p className="text-[10px] text-(--text-muted) leading-tight">
                {t('strategyMap.atRisk', 'At Risk')}
              </p>
            </div>
            <div className="text-center p-2 rounded-lg bg-red-500/10">
              <p className="text-lg font-bold text-red-600">{strategySummary.behind}</p>
              <p className="text-[10px] text-(--text-muted) leading-tight">
                {t('strategyMap.behind', 'Behind')}
              </p>
            </div>
            <div className="text-center p-2 rounded-lg bg-blue-500/10">
              <p className="text-lg font-bold text-blue-600">{strategySummary.completed}</p>
              <p className="text-[10px] text-(--text-muted) leading-tight">
                {t('strategyMap.completed', 'Done')}
              </p>
            </div>
          </div>

          {/* Task Alignment Metrics */}
          {taskStats && taskStats.totalLinked > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                    {t('strategyMap.tasksLinked', 'Tasks → Goals')}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {taskStats.totalLinked} {t('strategyMap.tasks', 'tasks')}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-emerald-500" />
                  {taskStats.totalCompleted} {t('strategyMap.doneTasks', 'done')}
                </span>
                <span className="flex items-center gap-1">
                  <Target className="w-3 h-3 text-purple-500" />
                  {taskStats.objectivesWithTasks}/{taskStats.totalObjectives}{' '}
                  {t('strategyMap.objectivesWithTasks', 'objectives with tasks')}
                </span>
              </div>
            </div>
          )}

          {/* Bottom CTA */}
          <div className="mt-4 flex items-center justify-between pt-3 border-t border-(--border)">
            <div className="flex items-center gap-2">
              {issuesCount > 0 ? (
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className={`w-3.5 h-3.5 ${issuesColor}`} />
                  <span className={`text-xs font-medium ${issuesColor}`}>
                    {issuesCount} {t('strategyMap.needsAttention', 'need attention')}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-xs text-emerald-600 font-medium">
                    {t('strategyMap.allGood', 'All objectives on track')}
                  </span>
                </div>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push('/goals')}
              className="text-xs gap-1.5 h-8"
            >
              <Target className="w-3.5 h-3.5" />
              {t('strategyMap.manageOkrs', 'Manage OKRs')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
