'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useAuthUser } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DollarSign,
  Users,
  Cog,
  GraduationCap,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  ChevronRight,
  Sparkles,
  Activity,
  BarChart3,
  Info,
  Eye,
  EyeOff,
} from 'lucide-react';
import type {
  BalancedScorecardData,
  BscPerspective,
  BscPerspectiveData,
  BscScore,
} from '../../../convex/strategyMaps';

// ── Perspective Config ───────────────────────────────────────────────────────

const PERSPECTIVE_CONFIG: Record<
  BscPerspective,
  {
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    gradient: string;
    lightBg: string;
    lightBorder: string;
    darkBg: string;
    darkBorder: string;
  }
> = {
  financial: {
    icon: DollarSign,
    color: '#059669',
    gradient: 'from-(--success-solid) to-(--success-solid)',
    lightBg: 'bg-(--success-quiet)',
    lightBorder: 'border-(--success-outline)',
    darkBg: 'bg-(--success-solid)/30',
    darkBorder: 'border-(--success-outline)/30',
  },
  customer: {
    icon: Users,
    color: '#2563eb',
    gradient: 'from-(--brand) to-(--brand)',
    lightBg: 'bg-(--brand-quiet)',
    lightBorder: 'border-(--brand-outline)',
    darkBg: 'bg-(--brand)/30',
    darkBorder: 'border-(--brand-outline)/30',
  },
  internal: {
    icon: Cog,
    color: '#d97706',
    gradient: 'from-(--warning-solid) to-(--warning-solid)',
    lightBg: 'bg-(--warning-quiet)',
    lightBorder: 'border-(--warning-outline)',
    darkBg: 'bg-(--warning-solid)/30',
    darkBorder: 'border-(--warning-outline)/30',
  },
  learning: {
    icon: GraduationCap,
    color: '#7c3aed',
    gradient: 'from-(--brand) to-(--brand)',
    lightBg: 'bg-(--brand-quiet)',
    lightBorder: 'border-(--brand-outline)',
    darkBg: 'bg-(--brand)/30',
    darkBorder: 'border-(--brand-outline)/30',
  },
};

const _PERSPECTIVE_LABELS: Record<BscPerspective, string> = {
  financial: 'Financial',
  customer: 'Customer',
  internal: 'Internal Process',
  learning: 'Learning & Growth',
};

// ── Score Badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score, grade }: { score: number; grade: BscScore }) {
  const { t } = useTranslation(['common', 'modules']);
  const gradeConfig = {
    excellent: {
      color: 'text-(--success-text)',
      bg: 'bg-(--success-quiet) bg-(--success-solid)/30',
      label: 'Excellent',
    },
    good: { color: 'text-(--brand-text)', bg: 'bg-(--brand-quiet) bg-(--brand)/30', label: 'Good' },
    fair: {
      color: 'text-(--warning-text)',
      bg: 'bg-(--warning-quiet) bg-(--warning-solid)/30',
      label: 'Fair',
    },
    poor: {
      color: 'text-(--danger-text)',
      bg: 'bg-(--danger-quiet) bg-(--danger-solid)/30',
      label: 'Poor',
    },
  };
  const cfg = gradeConfig[grade];

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-14 h-14">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 36">
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-(--text-muted) text-(--text-primary)"
          />
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={`${score * 0.97} 100`}
            strokeLinecap="round"
            className={`transition-all duration-1000 ease-out ${grade === 'excellent' ? 'text-(--success-text)' : grade === 'good' ? 'text-(--brand-text)' : grade === 'fair' ? 'text-(--warning-text)' : 'text-(--danger-text)'}`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
          {score}
        </span>
      </div>
      <Badge variant="outline" className={`text-[10px] ${cfg.color} ${cfg.bg} border-0`}>
        {t(`bsc.grade.${grade}`, cfg.label)}
      </Badge>
    </div>
  );
}

// ── Direction Icon ───────────────────────────────────────────────────────────

function DirectionIcon({ direction }: { direction: 'up' | 'down' | 'neutral' }) {
  if (direction === 'up') return <TrendingUp className="w-3.5 h-3.5 text-(--success-text)" />;
  if (direction === 'down') return <TrendingDown className="w-3.5 h-3.5 text-(--danger-text)" />;
  return <Minus className="w-3.5 h-3.5 text-(--text-muted)" />;
}

// ── North Star ───────────────────────────────────────────────────────────────

function NorthStarSection({ data }: { data: BalancedScorecardData }) {
  const { t } = useTranslation(['common', 'modules']);
  const { northStar, overallScore, overallGrade } = data;

  const gradeConfig = {
    excellent: { bar: 'bg-(--success-solid)', text: 'text-(--success-text)', label: 'Excellent' },
    good: { bar: 'bg-(--brand)', text: 'text-(--brand-text)', label: 'Good' },
    fair: { bar: 'bg-(--warning-solid)', text: 'text-(--warning-text)', label: 'Fair' },
    poor: { bar: 'bg-(--danger-solid)', text: 'text-(--danger-text)', label: 'Poor' },
  };
  const cfg = gradeConfig[overallGrade];

  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 shadow-xl shadow-black/20">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-(--success-solid)/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-(--brand)/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/[0.03] to-transparent" />
      </div>

      <CardContent className="p-6 relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-(--warning-solid) to-(--warning-solid) shadow-lg shadow-amber-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                {t('bsc.northStar', 'North Star')}
                <Badge className="bg-white/10 text-white/80 text-[10px] border-0">
                  {t('bsc.mostImportant', 'Most Important')}
                </Badge>
              </h2>
              <p className="text-sm text-white/60">
                {t('bsc.northStarDesc', 'Your single most important strategic metric')}
              </p>
            </div>
          </div>
          <Badge
            className={`text-xs font-semibold px-3 py-1 ${
              overallGrade === 'excellent'
                ? 'bg-(--success-solid)/20 text-(--success-text)'
                : overallGrade === 'good'
                  ? 'bg-(--brand)/20 text-(--brand-text)'
                  : overallGrade === 'fair'
                    ? 'bg-(--warning-solid)/20 text-(--warning-text)'
                    : 'bg-(--danger-solid)/20 text-(--danger-text)'
            } border-0`}
          >
            {t(`bsc.grade.${overallGrade}`, cfg.label)}
          </Badge>
        </div>

        {/* North Star Metric */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main metric */}
          <div className="md:col-span-2">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-white/60 mb-1">{northStar.label}</p>
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-bold text-white tracking-tight">
                    {northStar.value}
                  </span>
                  <span className="text-sm text-white/40">
                    {t('bsc.target', 'Target')}: {northStar.target}
                  </span>
                </div>
              </div>
              <div
                className={`p-2 rounded-lg ${overallGrade === 'excellent' || overallGrade === 'good' ? 'bg-(--success-solid)/20' : overallGrade === 'fair' ? 'bg-(--warning-solid)/20' : 'bg-(--danger-solid)/20'}`}
              >
                <DirectionIcon direction={northStar.direction} />
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-3">
              <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ease-out ${cfg.bar}`}
                  style={{ width: `${northStar.progress}%` }}
                />
              </div>
              <div className="flex justify-between mt-1.5 text-xs text-white/40">
                <span>0%</span>
                <span>
                  {t('bsc.progress', 'Progress')}: {northStar.progress}%
                </span>
                <span>{northStar.target}</span>
              </div>
            </div>
          </div>

          {/* Overall Score card */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 flex flex-col items-center justify-center">
            <p className="text-xs text-white/50 mb-2 uppercase tracking-wider">
              {t('bsc.overallScore', 'Overall BSC Score')}
            </p>
            <div className="relative w-24 h-24 mb-2">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 36">
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className="text-white/10"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeDasharray={`${overallScore * 0.97} 100`}
                  strokeLinecap="round"
                  className={`transition-all duration-1000 ease-out ${
                    overallGrade === 'excellent'
                      ? 'text-(--success-text)'
                      : overallGrade === 'good'
                        ? 'text-(--brand-text)'
                        : overallGrade === 'fair'
                          ? 'text-(--warning-text)'
                          : 'text-(--danger-text)'
                  }`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-white">{overallScore}</span>
              </div>
            </div>
            <p className="text-xs text-white/40">{t('bsc.outOf100', 'out of 100')}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Perspective Card ─────────────────────────────────────────────────────────

function PerspectiveCard({
  perspective,
  compact,
}: {
  perspective: BscPerspectiveData;
  compact: boolean;
}) {
  const { t } = useTranslation(['common', 'modules']);
  const config = PERSPECTIVE_CONFIG[perspective.id];
  const Icon = config.icon;

  const [expanded, setExpanded] = useState(!compact);

  return (
    <Card
      className={`group relative overflow-hidden border transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 ${config.lightBorder} ${config.darkBorder} ${config.lightBg} ${config.darkBg}`}
    >
      {/* Gradient accent bar */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${config.gradient} opacity-80`}
      />

      <CardContent className="p-5 relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl bg-gradient-to-br ${config.gradient} shadow-lg`}
              style={{ boxShadow: `0 8px 24px ${config.color}25` }}
            >
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">
                {t(`bsc.perspective.${perspective.id}`, perspective.name)}
              </h3>
              <p className="text-[10px] text-(--text-muted)">
                {perspective.objectivesCount} {t('bsc.objectives', 'objectives')}
              </p>
            </div>
          </div>
          <ScoreBadge score={perspective.score} grade={perspective.grade} />
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-(--text-muted) uppercase tracking-wider text-[10px] font-medium">
              {t('bsc.avgProgress', 'Avg Progress')}
            </span>
            <span
              className="font-bold text-sm"
              style={{
                color:
                  perspective.avgProgress >= 70
                    ? '#059669'
                    : perspective.avgProgress >= 40
                      ? '#d97706'
                      : '#dc2626',
              }}
            >
              {perspective.avgProgress}%
            </span>
          </div>
          <div className="h-2 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                perspective.avgProgress >= 70
                  ? 'bg-(--success-solid)'
                  : perspective.avgProgress >= 40
                    ? 'bg-(--warning-solid)'
                    : 'bg-(--danger-solid)'
              }`}
              style={{ width: `${perspective.avgProgress}%` }}
            />
          </div>
        </div>

        {/* Health indicators row */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center p-1.5 rounded-lg bg-(--success-solid)/10">
            <p className="text-sm font-bold text-(--success-text)">{perspective.onTrackCount}</p>
            <p className="text-[9px] text-(--text-muted) leading-tight">
              {t('strategyMap.onTrack', 'On Track')}
            </p>
          </div>
          <div className="text-center p-1.5 rounded-lg bg-(--warning-solid)/10">
            <p className="text-sm font-bold text-(--warning-text)">{perspective.atRiskCount}</p>
            <p className="text-[9px] text-(--text-muted) leading-tight">
              {t('strategyMap.atRisk', 'At Risk')}
            </p>
          </div>
          <div className="text-center p-1.5 rounded-lg bg-(--danger-solid)/10">
            <p className="text-sm font-bold text-(--danger-text)">{perspective.behindCount}</p>
            <p className="text-[9px] text-(--text-muted) leading-tight">
              {t('strategyMap.behind', 'Behind')}
            </p>
          </div>
        </div>

        {/* Trend sparkline */}
        {perspective.trend.length > 1 && (
          <div className="mb-3">
            <div className="flex items-center gap-1.5 text-[10px] text-(--text-muted) mb-1">
              <Activity className="w-3 h-3" />
              <span>{t('bsc.trend', 'Trend')}:</span>
              {perspective.trend.map((val, i) => (
                <span
                  key={i}
                  className={`font-medium ${
                    i === perspective.trend.length - 1
                      ? val >= (perspective.trend[i - 1] ?? 0)
                        ? 'text-(--success-text)'
                        : 'text-(--danger-text)'
                      : ''
                  }`}
                >
                  {val}%
                  {i < perspective.trend.length - 1 && (
                    <span className="text-(--text-muted) mx-0.5">→</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Key metrics */}
        {perspective.metrics.length > 0 && (
          <button onClick={() => setExpanded(!expanded)} className="w-full text-left">
            <div
              className={`space-y-1.5 transition-all duration-300 overflow-hidden ${
                expanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              {perspective.metrics.map((metric, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-1.5 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
                >
                  <span className="text-[10px] text-(--text-muted)">{metric.label}</span>
                  <span className="text-xs font-semibold flex items-center gap-1">
                    <DirectionIcon direction={metric.direction} />
                    {metric.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center mt-1.5 text-[10px] text-(--text-muted) hover:text-(--text) transition-colors">
              <ChevronRight
                className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
              />
              <span className="ml-1">
                {expanded
                  ? t('bsc.hideMetrics', 'Hide metrics')
                  : t('bsc.showMetrics', 'Show metrics')}
              </span>
            </div>
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// ── Strategy Heat Map ────────────────────────────────────────────────────────

function StrategyHeatMap({ data }: { data: BalancedScorecardData }) {
  const { t } = useTranslation(['common', 'modules']);

  const heatData = data.perspectives.map((p) => ({
    name: t(`bsc.perspective.${p.id}`, p.name),
    score: p.score,
    health: p.score >= 80 ? 'excellent' : p.score >= 60 ? 'good' : p.score >= 40 ? 'fair' : 'poor',
    objectives: p.objectivesCount,
    avgProgress: p.avgProgress,
  }));

  const getHeatColor = (score: number) => {
    if (score >= 80) return 'bg-(--success-solid)';
    if (score >= 60) return 'bg-(--brand)';
    if (score >= 40) return 'bg-(--warning-solid)';
    return 'bg-(--danger-solid)';
  };

  const getHeatIntensity = (score: number) => {
    // Higher score = more opaque
    return Math.max(0.3, score / 100);
  };

  return (
    <Card className="border-(--border)">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-(--text-muted)" />
          <h3 className="text-sm font-semibold">{t('bsc.heatMap', 'Strategy Heat Map')}</h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {heatData.map((item) => (
            <div
              key={item.name}
              className="group relative rounded-xl overflow-hidden border border-(--border) cursor-default transition-all duration-200 hover:shadow-md"
            >
              {/* Heat background */}
              <div
                className={`absolute inset-0 transition-opacity duration-500 ${getHeatColor(item.score)}`}
                style={{ opacity: getHeatIntensity(item.score) * 0.15 }}
              />

              <div className="relative p-3 text-center">
                <p className="text-xs font-medium text-(--text) truncate mb-1">{item.name}</p>
                <p
                  className={`text-2xl font-bold ${
                    item.health === 'excellent'
                      ? 'text-(--success-text)'
                      : item.health === 'good'
                        ? 'text-(--brand-text)'
                        : item.health === 'fair'
                          ? 'text-(--warning-text)'
                          : 'text-(--danger-text)'
                  }`}
                >
                  {item.score}
                </p>
                <div className="mt-1.5 h-1 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${getHeatColor(item.score)}`}
                    style={{ width: `${item.avgProgress}%` }}
                  />
                </div>
                <p className="text-[9px] text-(--text-muted) mt-1">
                  {item.objectives} {t('bsc.objectives_small', 'obj')} · {item.avgProgress}%
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function BalancedScorecardDashboard() {
  const { t } = useTranslation(['common', 'modules']);
  const user = useAuthUser();
  const selectedOrgId = useSelectedOrganization();
  const organizationId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;

  const [compact, setCompact] = useState(false);
  const year = new Date().getFullYear();

  const bscData = useQuery(
    api.strategyMaps.getBalancedScorecard,
    organizationId ? { organizationId, periodYear: year } : 'skip',
  );

  if (!user || !organizationId) return <ShieldLoader />;
  if (!bscData) {
    return (
      <div className="flex items-center justify-center py-16">
        <ShieldLoader />
      </div>
    );
  }

  // If no objectives exist, show empty state
  const hasData = bscData.perspectives.some((p) => p.objectivesCount > 0);

  if (!hasData) {
    return (
      <Card className="border-(--border)">
        <CardContent className="p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-(--warning-solid) to-(--warning-solid) shadow-lg shadow-amber-500/20 flex items-center justify-center mx-auto mb-4">
            <Target className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-lg font-semibold mb-1">
            {t('bsc.empty', 'No Balanced Scorecard data yet')}
          </h3>
          <p className="text-sm text-(--text-muted) mb-4 max-w-md mx-auto">
            {t(
              'bsc.emptyHint',
              'Create objectives across different areas (financial, customer, operations, learning) to see your Balanced Scorecard.',
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* North Star */}
      <NorthStarSection data={bscData} />

      {/* Compact toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Target className="w-4 h-4 text-(--brand-text)" />
            {t('bsc.perspectives', '4 Perspectives')}
          </h3>
          <p className="text-xs text-(--text-muted)">
            {t('bsc.perspectivesDesc', 'Financial · Customer Internal Process Learning & Growth')}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCompact(!compact)}
          className="text-xs gap-1.5 h-8"
        >
          {compact ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {compact ? t('bsc.expandAll', 'Expand All') : t('bsc.compact', 'Compact View')}
        </Button>
      </div>

      {/* 4 Perspective Cards in 2x2 grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {bscData.perspectives.map((p) => (
          <PerspectiveCard key={p.id} perspective={p} compact={compact} />
        ))}
      </div>

      {/* Strategy Heat Map */}
      <StrategyHeatMap data={bscData} />

      {/* Legend & Info */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-(--background-subtle)/50 border border-(--border) text-xs text-(--text-muted)">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Info className="w-3 h-3" />
            <span>{t('bsc.legend', 'Score legend:')}</span>
          </div>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-(--success-solid)" />
            80+
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-(--brand)" />
            60-79
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-(--warning-solid)" />
            40-59
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-(--danger-solid)" />
            &lt;40
          </span>
        </div>
        <span className="text-[10px]">
          {t('bsc.lastUpdated', 'Last updated')}: {new Date(bscData.lastUpdated).toLocaleString()}
        </span>
      </div>
    </div>
  );
}
