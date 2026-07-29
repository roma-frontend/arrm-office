'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useAuthUser } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';

import { PlanGate } from '@/components/subscription/PlanGate';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Target,
  Building2,
  Users,
  User,
  ChevronRight,
  ChevronDown,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Eye,
  EyeOff,
  BarChart3,
  TrendingUp,
  Layers,
  Zap,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type HealthStatus = 'on_track' | 'at_risk' | 'behind' | 'completed' | 'draft';

interface TreeNode {
  _id: string;
  title: string;
  description?: string;
  level: 'company' | 'team' | 'individual';
  department?: string;
  ownerId: string;
  ownerName: string;
  ownerAvatar?: string;
  progress: number;
  status: string;
  health: HealthStatus;
  periodType: string;
  periodYear: number;
  keyResultsCount: number;
  children: TreeNode[];
  depth: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const LEVEL_CONFIG = {
  company: {
    icon: Building2,
    label: 'company',
    color: '#8b5cf6',
    bgLight: 'from-purple-500/10 to-purple-500/5',
    border: 'border-purple-500/20',
    accent: 'purple',
  },
  team: {
    icon: Users,
    label: 'team',
    color: '#3b82f6',
    bgLight: 'from-blue-500/10 to-blue-500/5',
    border: 'border-blue-500/20',
    accent: 'blue',
  },
  individual: {
    icon: User,
    label: 'individual',
    color: '#10b981',
    bgLight: 'from-emerald-500/10 to-emerald-500/5',
    border: 'border-emerald-500/20',
    accent: 'emerald',
  },
};

function getHealthConfig(health: HealthStatus) {
  switch (health) {
    case 'on_track':
      return {
        color: 'text-emerald-600',
        bg: 'bg-emerald-100 dark:bg-emerald-900/30',
        icon: CheckCircle,
        label: 'On Track',
      };
    case 'at_risk':
      return {
        color: 'text-amber-600',
        bg: 'bg-amber-100 dark:bg-amber-900/30',
        icon: AlertTriangle,
        label: 'At Risk',
      };
    case 'behind':
      return {
        color: 'text-red-600',
        bg: 'bg-red-100 dark:bg-red-900/30',
        icon: AlertCircle,
        label: 'Behind',
      };
    case 'completed':
      return {
        color: 'text-blue-600',
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        icon: CheckCircle,
        label: 'Completed',
      };
    default:
      return {
        color: 'text-gray-400',
        bg: 'bg-gray-100 dark:bg-gray-800',
        icon: Eye,
        label: 'Draft',
      };
  }
}

function getProgressColor(progress: number): string {
  if (progress >= 70) return 'text-emerald-600';
  if (progress >= 40) return 'text-amber-600';
  return 'text-red-600';
}

function getProgressBarColor(progress: number): string {
  if (progress >= 70) return 'bg-emerald-500';
  if (progress >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

// ── Tree Node Component ──────────────────────────────────────────────────────

function TreeNodeCard({
  node,
  depth,
  defaultExpanded,
}: {
  node: TreeNode;
  depth: number;
  defaultExpanded: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [expanded, setExpanded] = useState(defaultExpanded || depth < 2);
  const levelCfg = LEVEL_CONFIG[node.level];
  const healthCfg = getHealthConfig(node.health);
  const HealthIcon = healthCfg.icon;
  const LevelIcon = levelCfg.icon;
  const hasChildren = node.children.length > 0;

  const indent = Math.min(depth * 24, 96);

  return (
    <div className="relative">
      {/* Connection line (vertical) */}
      {depth > 0 && (
        <div
          className="absolute left-[22px] top-0 bottom-1/2 w-px bg-(--border)"
          style={{ left: `${22 + indent - 24}px` }}
        />
      )}

      {/* Connection line (horizontal) */}
      {depth > 0 && (
        <div
          className="absolute left-[22px] top-1/2 h-px w-6 bg-(--border)"
          style={{ left: `${22 + indent - 24}px` }}
        />
      )}

      <div className="relative" style={{ marginLeft: `${indent}px` }}>
        {/* Node card */}
        <div
          className={`group relative rounded-xl border transition-all duration-200 hover:shadow-md hover:border-(--border) cursor-pointer ${
            node.health === 'behind'
              ? 'border-red-200 dark:border-red-900/40'
              : node.health === 'at_risk'
                ? 'border-amber-200 dark:border-amber-900/40'
                : 'border-(--border)'
          }`}
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, ${levelCfg.color} 6%, var(--card)), color-mix(in srgb, ${levelCfg.color} 2%, var(--card)))`,
          }}
          onClick={() => router.push(`/goals/${node._id}`)}
        >
          <div className="p-4">
            {/* Header row */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Expand/collapse for nodes with children */}
                {hasChildren ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded(!expanded);
                    }}
                    className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center hover:bg-(--background-subtle) transition-colors"
                  >
                    {expanded ? (
                      <ChevronDown className="w-4 h-4 text-(--text-muted)" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-(--text-muted)" />
                    )}
                  </button>
                ) : (
                  <div className="w-7 h-7 shrink-0 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-(--text-muted)" />
                  </div>
                )}

                {/* Level icon */}
                <div
                  className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    background: `color-mix(in srgb, ${levelCfg.color} 15%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${levelCfg.color} 25%, transparent)`,
                    color: levelCfg.color,
                  }}
                >
                  <LevelIcon className="w-5 h-5" />
                </div>

                {/* Title & meta */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm truncate">{node.title}</h3>
                    <Badge
                      variant="outline"
                      className="text-[10px] h-4 px-1.5 uppercase tracking-wider shrink-0"
                      style={{
                        borderColor: `color-mix(in srgb, ${levelCfg.color} 30%, transparent)`,
                        color: levelCfg.color,
                      }}
                    >
                      {t(`goals.level.${node.level}`, node.level)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-(--text-muted) mt-0.5">
                    <span>{node.ownerName}</span>
                    <span>·</span>
                    <span>
                      {node.periodType} {node.periodYear}
                    </span>
                    {node.department && (
                      <>
                        <span>·</span>
                        <span>{node.department}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Right side: progress + health */}
              <div className="flex items-center gap-3 shrink-0">
                {/* Key results count */}
                <div className="hidden sm:flex items-center gap-1 text-xs text-(--text-muted)">
                  <BarChart3 className="w-3 h-3" />
                  <span>{node.keyResultsCount}</span>
                </div>

                {/* Health badge */}
                <div
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${healthCfg.bg} ${healthCfg.color}`}
                >
                  <HealthIcon className="w-3 h-3" />
                  <span className="hidden sm:inline">
                    {t(`strategyMap.health.${node.health}`, healthCfg.label)}
                  </span>
                </div>

                {/* Progress */}
                <div className="text-right min-w-[48px]">
                  <p className={`text-sm font-bold ${getProgressColor(node.progress)}`}>
                    {node.progress}%
                  </p>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-3">
              <div className="h-1.5 w-full bg-(--background-subtle) rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${getProgressBarColor(node.progress)}`}
                  style={{ width: `${node.progress}%` }}
                />
              </div>
            </div>

            {/* Bottom row: health description + navigation hint */}
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2 text-[10px] text-(--text-muted)">
                {node.depth === 0 && node.children.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {t('strategyMap.alignedObjectives', '{{count}} aligned', {
                      count: countAllDescendants(node),
                    })}
                  </span>
                )}
                {node.description && (
                  <span className="truncate max-w-[200px] opacity-0 group-hover:opacity-100 transition-opacity">
                    {node.description}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-(--text-muted) opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                {t('strategyMap.viewDetails', 'View details')}
                <ChevronRight className="w-2.5 h-2.5" />
              </span>
            </div>
          </div>
        </div>

        {/* Children */}
        {hasChildren && expanded && (
          <div className="mt-2 space-y-2">
            {node.children.map((child) => (
              <TreeNodeCard
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

function countAllDescendants(node: TreeNode): number {
  let count = node.children.length;
  for (const child of node.children) {
    count += countAllDescendants(child);
  }
  return count;
}

// ── Stats Dashboard Header ───────────────────────────────────────────────────

function StrategyStats({
  summary,
  compact,
  onToggleCompact,
}: {
  summary: any;
  compact: boolean;
  onToggleCompact: () => void;
}) {
  const { t } = useTranslation();

  if (!summary) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
      <Card>
        <CardContent className="p-3 flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/30">
            <Target className="w-4 h-4 text-purple-700 dark:text-purple-400" />
          </div>
          <div>
            <p className="text-lg font-bold">{summary.total}</p>
            <p className="text-[10px] text-(--text-muted)">
              {t('strategyMap.totalObjectives', 'Total')}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <TrendingUp className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-lg font-bold">{summary.avgProgress}%</p>
            <p className="text-[10px] text-(--text-muted)">
              {t('strategyMap.avgProgress', 'Avg Progress')}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <CheckCircle className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-lg font-bold text-emerald-600">{summary.onTrack}</p>
            <p className="text-[10px] text-(--text-muted)">
              {t('strategyMap.onTrack', 'On Track')}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30">
            <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-lg font-bold text-amber-600">{summary.atRisk}</p>
            <p className="text-[10px] text-(--text-muted)">{t('strategyMap.atRisk', 'At Risk')}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30">
            <AlertCircle className="w-4 h-4 text-red-700 dark:text-red-400" />
          </div>
          <div>
            <p className="text-lg font-bold text-red-600">{summary.behind}</p>
            <p className="text-[10px] text-(--text-muted)">{t('strategyMap.behind', 'Behind')}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <CheckCircle className="w-4 h-4 text-blue-700 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-lg font-bold text-blue-600">{summary.completed}</p>
            <p className="text-[10px] text-(--text-muted)">
              {t('strategyMap.completed', 'Completed')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Compact toggle */}
      <div className="col-span-full flex justify-end">
        <Button variant="outline" size="sm" onClick={onToggleCompact} className="text-xs gap-1.5">
          {compact ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {compact
            ? t('strategyMap.showAll', 'Show All Levels')
            : t('strategyMap.compact', 'Hide Individuals')}
        </Button>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function StrategyMapsClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthUser();
  const selectedOrgId = useSelectedOrganization();
  const organizationId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;

  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterPeriod, setFilterPeriod] = useState<string>('all');
  const [compact, setCompact] = useState(false);

  const strategyTree = useQuery(
    api.strategyMaps.getStrategyTree,
    organizationId
      ? {
          organizationId,
          periodYear: filterYear,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          periodType: filterPeriod !== 'all' ? (filterPeriod as any) : undefined,
          compact: compact || undefined,
        }
      : 'skip',
  );

  const strategySummary = useQuery(
    api.strategyMaps.getStrategySummary,
    organizationId ? { organizationId, periodYear: filterYear } : 'skip',
  );

  // Group by level for the legend
  const levelBreakdown = useMemo(() => {
    if (!strategySummary) return null;
    return strategySummary.byLevel;
  }, [strategySummary]);

  if (!user || !organizationId) return <ShieldLoader />;

  const content = (
    <div>
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Layers className="w-7 h-7 text-purple-500" />
              {t('strategyMap.title', 'Strategy Map')}
            </h1>
            <p className="text-sm text-(--text-muted)">
              {t(
                'strategyMap.subtitle',
                'Visual cascade of company objectives to individual goals',
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(filterYear)} onValueChange={(v) => setFilterYear(Number(v))}>
              <SelectTrigger className="w-20 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
                <SelectItem value="2027">2027</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPeriod} onValueChange={setFilterPeriod}>
              <SelectTrigger className="w-20 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('goals.allPeriods', 'All')}</SelectItem>
                <SelectItem value="Q1">Q1</SelectItem>
                <SelectItem value="Q2">Q2</SelectItem>
                <SelectItem value="Q3">Q3</SelectItem>
                <SelectItem value="Q4">Q4</SelectItem>
                <SelectItem value="H1">H1</SelectItem>
                <SelectItem value="H2">H2</SelectItem>
                <SelectItem value="FY">FY</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="default"
              onClick={() => router.push('/goals')}
              className="gap-1.5"
            >
              <Target className="w-4 h-4" />
              {t('strategyMap.manageOkrs', 'Manage OKRs')}
            </Button>
          </div>
        </div>

        {/* Level legend */}
        {levelBreakdown && (
          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-(--text-muted)">
            <span className="flex items-center gap-1">
              <Building2 className="w-3 h-3 text-purple-500" />
              {t('strategyMap.company', 'Company')}: {levelBreakdown.company}
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3 text-blue-500" />
              {t('strategyMap.team', 'Team')}: {levelBreakdown.team}
            </span>
            <span className="flex items-center gap-1">
              <User className="w-3 h-3 text-emerald-500" />
              {t('strategyMap.individual', 'Individual')}: {levelBreakdown.individual}
            </span>
            <span className="sm:ml-auto flex items-center gap-2">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {t('strategyMap.onTrack', 'On Track')}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                {t('strategyMap.atRisk', 'At Risk')}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {t('strategyMap.behind', 'Behind')}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Stats */}
      <StrategyStats
        summary={strategySummary}
        compact={compact}
        onToggleCompact={() => setCompact(!compact)}
      />

      {/* Tree */}
      {!strategyTree ? (
        <ShieldLoader />
      ) : strategyTree.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Layers className="w-16 h-16 mx-auto text-(--text-muted) mb-4 opacity-40" />
            <h3 className="text-lg font-semibold mb-1">
              {t('strategyMap.empty', 'No objectives found')}
            </h3>
            <p className="text-sm text-(--text-muted) mb-4">
              {t(
                'strategyMap.emptyHint',
                'Create company-level objectives to build your strategy map',
              )}
            </p>
            <Button onClick={() => router.push('/goals')}>
              <Target className="w-4 h-4 mr-1" />
              {t('strategyMap.createFirst', 'Create Your First Objective')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {strategyTree.map((root: TreeNode) => (
            <TreeNodeCard key={root._id} node={root} depth={0} defaultExpanded={true} />
          ))}
        </div>
      )}

      {/* Cascade visualization summary */}
      {strategyTree && strategyTree.length > 0 && (
        <div className="mt-8 p-4 rounded-xl border border-(--border) bg-(--background-subtle)/50">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold">
              {t('strategyMap.alignmentTip', 'Alignment Tip')}
            </h3>
          </div>
          <p className="text-xs text-(--text-muted) leading-relaxed">
            {t(
              'strategyMap.alignmentHint',
              'Company objectives cascade down to teams and individuals through parent-child relationships. ' +
                'Each level aligns with the level above to ensure everyone works toward the same strategic goals. ' +
                'Click any objective to view details or create new aligned objectives from the Goals page.',
            )}
          </p>
        </div>
      )}
    </div>
  );

  // Wrap in PlanGate for Professional+ (Starter gets basic view)
  return (
    <PlanGate
      feature="strategyMaps"
      title={t('strategyMap.upgradeTitle', 'Strategy Maps')}
      description={t(
        'strategyMap.upgradeDesc',
        'Visualize your entire OKR cascade from company objectives down to individual goals. ' +
          'Upgrade to see the full strategy map with health indicators and drill-down.',
      )}
      mode="overlay"
    >
      {content}
    </PlanGate>
  );
}
