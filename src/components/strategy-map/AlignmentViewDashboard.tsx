'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useAuthUser } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2,
  Users,
  User,
  Target,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  ListChecks,
  BarChart3,
  TrendingUp,
  Layers,
  Eye,
  EyeOff,
} from 'lucide-react';

type HealthStatus = 'on_track' | 'at_risk' | 'behind' | 'completed' | 'draft';

interface AlignmentNode {
  _id: string;
  title: string;
  level: 'company' | 'team' | 'individual';
  ownerName: string;
  progress: number;
  status: string;
  health: HealthStatus;
  keyResultsCount: number;
  taskCount: number;
  completedTaskCount: number;
  children: AlignmentNode[];
  depth: number;
}

// Level names are translated at render time via `goals.level.*` — no label here,
// so an untranslated English string cannot leak into the UI.
const LEVEL_CONFIG = {
  company: { icon: Building2, color: '#8b5cf6' },
  team: { icon: Users, color: '#3b82f6' },
  individual: { icon: User, color: '#10b981' },
};

function getHealthBg(health: HealthStatus): string {
  switch (health) {
    case 'on_track':
      return 'bg-(--success-quiet) dark:bg-(--success-quiet) text-(--success-text) dark:text-(--success-text)';
    case 'at_risk':
      return 'bg-(--warning-quiet) dark:bg-(--warning-quiet) text-(--warning-text) dark:text-(--warning-text)';
    case 'behind':
      return 'bg-(--danger-quiet) dark:bg-(--danger-quiet) text-(--danger-text) dark:text-(--danger-text)';
    case 'completed':
      return 'bg-(--brand-quiet) dark:bg-(--brand-quiet) text-(--brand-text) dark:text-(--brand-text)';
    default:
      return 'bg-(--surface-2) dark:bg-(--surface-3) text-(--text-3)';
  }
}

function getProgressBarColor(progress: number): string {
  if (progress >= 70) return 'bg-(--success-solid)';
  if (progress >= 40) return 'bg-(--warning-solid)';
  return 'bg-(--danger-solid)';
}

function getProgressColor(progress: number): string {
  if (progress >= 70) return 'text-(--success-text)';
  if (progress >= 40) return 'text-(--warning-text)';
  return 'text-(--danger-text)';
}

function AlignmentNodeCard({
  node,
  depth,
  defaultExpanded,
}: {
  node: AlignmentNode;
  depth: number;
  defaultExpanded: boolean;
}) {
  const { t } = useTranslation(['common', 'modules']);
  const router = useRouter();
  const [expanded, setExpanded] = useState(defaultExpanded || depth < 2);
  const levelCfg = LEVEL_CONFIG[node.level];
  const LevelIcon = levelCfg.icon;
  const hasChildren = node.children.length > 0;
  const indent = Math.min(depth * 20, 80);

  const taskCompletionPct =
    node.taskCount > 0 ? Math.round((node.completedTaskCount / node.taskCount) * 100) : 0;

  return (
    <div className="relative">
      {/* Connection lines */}
      {depth > 0 && (
        <>
          <div
            className="absolute left-[18px] top-0 bottom-1/2 w-px bg-border/60"
            style={{ left: `${18 + indent - 20}px` }}
          />
          <div
            className="absolute left-[18px] top-1/2 h-px w-5 bg-border/60"
            style={{ left: `${18 + indent - 20}px` }}
          />
        </>
      )}

      <div className="relative" style={{ marginLeft: `${indent}px` }}>
        <div
          className={`group relative rounded-xl border transition-all duration-200 hover:shadow-md cursor-pointer overflow-hidden ${
            node.health === 'behind'
              ? 'border-(--danger-outline) dark:border-(--danger-outline)'
              : node.health === 'at_risk'
                ? 'border-(--warning-outline) dark:border-(--warning-outline)'
                : 'border-border'
          }`}
          onClick={() => router.push(`/goals/${node._id}`)}
        >
          <CardContent className="p-3.5">
            <div className="flex items-start justify-between gap-3">
              {/* Left: expand + icon + info */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {hasChildren ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded(!expanded);
                    }}
                    className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center hover:bg-muted/50 transition-colors"
                  >
                    {expanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </button>
                ) : (
                  <div className="w-6 h-6 shrink-0 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                  </div>
                )}

                {/* Level icon */}
                <div
                  className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{
                    background: `${levelCfg.color}15`,
                    border: `1px solid ${levelCfg.color}25`,
                    color: levelCfg.color,
                  }}
                >
                  <LevelIcon className="w-4 h-4" />
                </div>

                {/* Title + meta */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm truncate">{node.title}</h3>
                    <Badge
                      variant="outline"
                      className="text-[9px] h-4 px-1.5 uppercase tracking-wider shrink-0"
                      style={{ borderColor: `${levelCfg.color}30`, color: levelCfg.color }}
                    >
                      {t(`goals.level.${node.level}`, node.level)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{node.ownerName}</p>
                </div>
              </div>

              {/* Right: stats badges */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {/* KRs */}
                {node.keyResultsCount > 0 && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-md">
                    <BarChart3 className="w-3 h-3" />
                    <span>{node.keyResultsCount}</span>
                  </div>
                )}

                {/* Tasks */}
                {node.taskCount > 0 && (
                  <div
                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md"
                    style={{
                      background:
                        taskCompletionPct >= 70
                          ? '#d1fae5'
                          : taskCompletionPct >= 40
                            ? '#fef3c7'
                            : '#fee2e2',
                      color:
                        taskCompletionPct >= 70
                          ? '#059669'
                          : taskCompletionPct >= 40
                            ? '#d97706'
                            : '#dc2626',
                    }}
                  >
                    <ListChecks className="w-3 h-3" />
                    <span>
                      {node.completedTaskCount}/{node.taskCount}
                    </span>
                  </div>
                )}

                {/* Health badge */}
                <div
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${getHealthBg(node.health)}`}
                >
                  {node.health === 'on_track' && <CheckCircle className="w-3 h-3" />}
                  {node.health === 'at_risk' && <AlertTriangle className="w-3 h-3" />}
                  {node.health === 'behind' && <AlertCircle className="w-3 h-3" />}
                  {node.health === 'completed' && <CheckCircle className="w-3 h-3" />}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-2.5">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground text-[10px] uppercase tracking-wider font-medium">
                  {t('goals.stats.progress', 'Progress')}
                </span>
                <span className={`font-bold text-sm ${getProgressColor(node.progress)}`}>
                  {node.progress}%
                </span>
              </div>
              <div className="h-2 w-full bg-muted/50 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${getProgressBarColor(node.progress)}`}
                  style={{ width: `${node.progress}%` }}
                />
              </div>
            </div>

            {/* Bottom: aligned count + tasks hint */}
            <div className="flex items-center justify-between mt-1.5">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                {hasChildren && (
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {node.children.length} {t('strategyMap.alignedObjectives', 'aligned')}
                  </span>
                )}
                {node.taskCount > 0 && (
                  <span className="flex items-center gap-1">
                    <ListChecks className="w-3 h-3" />
                    {node.completedTaskCount}/{node.taskCount}{' '}
                    {t('strategyMap.doneTasks', 'tasks done')}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                {t('strategyMap.viewDetails', 'View')}
                <ChevronRight className="w-2.5 h-2.5" />
              </span>
            </div>
          </CardContent>
        </div>

        {/* Children */}
        {hasChildren && expanded && (
          <div className="mt-1.5 space-y-1.5 ml-1">
            {node.children.map((child) => (
              <AlignmentNodeCard
                key={child._id}
                node={child}
                depth={depth + 1}
                defaultExpanded={depth < 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AlignmentViewDashboard() {
  const { t } = useTranslation(['common', 'modules']);
  const router = useRouter();
  const user = useAuthUser();
  const selectedOrgId = useSelectedOrganization();
  const organizationId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;

  const [filterYear, _setFilterYear] = useState(new Date().getFullYear());
  const [compact, setCompact] = useState(false);

  const alignmentTree = useQuery(
    api.strategyMaps.getAlignmentTree,
    organizationId ? { organizationId, periodYear: filterYear } : 'skip',
  );

  // Aggregate stats
  const stats = useMemo(() => {
    if (!alignmentTree) return null;
    let totalObjs = 0;
    let totalTasks = 0;
    let totalCompletedTasks = 0;
    let totalProgress = 0;
    let activeCount = 0;
    const byLevel = { company: 0, team: 0, individual: 0 };

    const walk = (nodes: AlignmentNode[]) => {
      for (const n of nodes) {
        totalObjs++;
        if (n.status === 'active') {
          activeCount++;
          totalProgress += n.progress;
        }
        byLevel[n.level]++;
        totalTasks += n.taskCount;
        totalCompletedTasks += n.completedTaskCount;
        walk(n.children);
      }
    };
    walk(alignmentTree);

    return {
      totalObjs,
      avgProgress: activeCount > 0 ? Math.round(totalProgress / activeCount) : 0,
      totalTasks,
      totalCompletedTasks,
      byLevel,
    };
  }, [alignmentTree]);

  // Tree + filtered
  const filteredTree = useMemo(() => {
    if (!alignmentTree) return [];
    if (compact) {
      const filterIndividuals = (nodes: AlignmentNode[]): AlignmentNode[] =>
        nodes
          .filter((n) => n.level !== 'individual')
          .map((n) => ({ ...n, children: filterIndividuals(n.children) }));
      return filterIndividuals(alignmentTree);
    }
    return alignmentTree;
  }, [alignmentTree, compact]);

  if (!user || !organizationId) return null;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-(--purple-quiet) dark:bg-(--purple-quiet)">
                <Target className="w-4 h-4 text-(--purple-text) dark:text-(--purple-text)" />
              </div>
              <div>
                <p className="text-xl font-bold">{stats.totalObjs}</p>
                <p className="text-[10px] text-muted-foreground">
                  {t('goals.stats.total', 'Total Objectives')}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-(--success-quiet) dark:bg-(--success-quiet)">
                <TrendingUp className="w-4 h-4 text-(--success-text) dark:text-(--success-text)" />
              </div>
              <div>
                <p className="text-xl font-bold">{stats.avgProgress}%</p>
                <p className="text-[10px] text-muted-foreground">
                  {t('goals.stats.avgProgress', 'Avg Progress')}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-(--brand-quiet) dark:bg-(--brand-quiet)">
                <Layers className="w-4 h-4 text-(--brand-text) dark:text-(--brand-text)" />
              </div>
              <div>
                <p className="text-xl font-bold">
                  {stats.byLevel.company}/{stats.byLevel.team}/{stats.byLevel.individual}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {t('strategyMap.company', 'C')}/{t('strategyMap.team', 'T')}/
                  {t('strategyMap.individual', 'I')}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-(--warning-quiet) dark:bg-(--warning-quiet)">
                <ListChecks className="w-4 h-4 text-(--warning-text) dark:text-(--warning-text)" />
              </div>
              <div>
                <p className="text-xl font-bold">{stats.totalTasks}</p>
                <p className="text-[10px] text-muted-foreground">
                  {t('alignmentView.totalTasks', 'Linked Tasks')}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {alignmentTree ? (
            <span className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-(--purple-text)" />
              <span>{t('alignmentView.cascade', 'Company → Team → Individual')}</span>
            </span>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCompact(!compact)}
          className="text-xs gap-1.5 h-8"
        >
          {compact ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {compact
            ? t('strategyMap.showAll', 'Show All')
            : t('strategyMap.compact', 'Hide Individuals')}
        </Button>
      </div>

      {/* Tree */}
      {!alignmentTree ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : filteredTree.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Layers className="w-14 h-14 mx-auto text-muted-foreground mb-3 opacity-40" />
            <h3 className="text-lg font-semibold mb-1">
              {t('strategyMap.empty', 'No objectives found')}
            </h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              {t(
                'alignmentView.emptyHint',
                'Create company-level objectives and link tasks to see the full alignment view with progress tracking.',
              )}
            </p>
            <Button onClick={() => router.push('/goals')}>
              <Target className="w-4 h-4 mr-1" />
              {t('strategyMap.createFirst', 'Create Your First Objective')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredTree.map((root) => (
            <AlignmentNodeCard key={root._id} node={root} depth={0} defaultExpanded={true} />
          ))}
        </div>
      )}
    </div>
  );
}
