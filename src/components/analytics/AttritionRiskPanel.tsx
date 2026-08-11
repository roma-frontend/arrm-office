'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@/lib/convex-typed';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import {
  AlertTriangle,
  Brain,
  ChevronDown,
  ChevronUp,
  Flame,
  ShieldCheck,
  UserMinus,
} from 'lucide-react';

const LEVEL_STYLES: Record<'high' | 'medium' | 'low', { badge: string; bar: string }> = {
  high: {
    badge: 'bg-red-100 text-red-800 border-red-200',
    bar: 'bg-red-500',
  },
  medium: {
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    bar: 'bg-amber-500',
  },
  low: {
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    bar: 'bg-emerald-500',
  },
};

/** Deterministic HR advice per risk factor (i18n keys under attrition.*). */
const FACTOR_ADVICE: Record<string, string> = {
  highTardiness: 'adviceFlexibleSchedule',
  moderateTardiness: 'adviceFlexibleSchedule',
  highAbsence: 'adviceOneOnOne',
  frequentEarlyLeave: 'adviceWorkloadReview',
  burnoutNoLeave: 'adviceEncourageLeave',
  sickLeaveSpike: 'adviceWellbeingCheck',
  recentUnpaidLeave: 'adviceOneOnOne',
  lowKpi: 'adviceGoalsReview',
  moderateKpi: 'adviceGoalsReview',
  lowDeadlineAdherence: 'adviceWorkloadReview',
  ratingDecline: 'adviceFeedbackSession',
  negativeNotes: 'adviceOneOnOne',
};

interface RiskEmployee {
  userId: Id<'users'>;
  name: string;
  department: string | null;
  position: string | null;
  riskScore: number;
  riskLevel: 'high' | 'medium' | 'low';
  factors: Array<{ key: string; weight: number }>;
}

/**
 * AI Attrition Risk panel: org-wide flight-risk scan with explainable factors
 * and concrete HR actions per signal. Supervisor/admin only (backend-gated).
 */
export function AttritionRiskPanel({
  organizationId,
}: {
  organizationId: Id<'organizations'> | undefined;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);

  const data = useQuery(
    api.attritionRisk.getAttritionRisks,
    organizationId ? { organizationId } : 'skip',
  );

  const attention = (data?.employees || []).filter((e) => e.riskLevel !== 'low').slice(0, 10);

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-purple-500/10">
            <Brain className="w-5 h-5 text-purple-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-(--text-primary) flex items-center gap-2">
              {t('attrition.title', 'Attrition Risk')}
              <Badge variant="outline" className="text-[10px] gap-1">
                <Brain className="w-2.5 h-2.5" /> AI
              </Badge>
            </h3>
            <p className="text-xs text-(--text-muted)">
              {t(
                'attrition.subtitle',
                'Predictive flight-risk analysis: attendance, leave patterns, performance trends',
              )}
            </p>
          </div>
        </div>

        {!data ? (
          <ShieldLoader />
        ) : data.employees.length === 0 ? (
          <p className="text-sm text-(--text-muted) py-4 text-center">
            {t('attrition.noData', 'Not enough data to analyze attrition risk yet.')}
          </p>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 text-center">
                <Flame className="w-4 h-4 mx-auto text-red-600 mb-1" />
                <p className="text-lg font-bold text-red-700 dark:text-red-400">
                  {data.summary.high}
                </p>
                <p className="text-[10px] text-(--text-muted)">
                  {t('attrition.highRisk', 'High risk')}
                </p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-3 text-center">
                <AlertTriangle className="w-4 h-4 mx-auto text-amber-600 mb-1" />
                <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                  {data.summary.medium}
                </p>
                <p className="text-[10px] text-(--text-muted)">
                  {t('attrition.mediumRisk', 'Medium risk')}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center">
                <ShieldCheck className="w-4 h-4 mx-auto text-emerald-600 mb-1" />
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                  {data.summary.low}
                </p>
                <p className="text-[10px] text-(--text-muted)">
                  {t('attrition.lowRisk', 'Low risk')}
                </p>
              </div>
            </div>

            {/* Attention list */}
            {attention.length === 0 ? (
              <p className="text-sm text-(--text-muted) py-2 text-center">
                ✅ {t('attrition.allGood', 'No employees at elevated risk right now.')}
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-(--text-muted) uppercase tracking-wide">
                  {t('attrition.needsAttention', 'Needs attention')}
                </p>
                {attention.map((emp: RiskEmployee) => {
                  const style = LEVEL_STYLES[emp.riskLevel];
                  const isOpen = expanded === emp.userId;
                  return (
                    <div key={emp.userId} className="rounded-xl border border-(--border)">
                      <button
                        className="w-full flex items-center gap-3 p-3 text-left hover:bg-(--background-subtle) transition-colors"
                        onClick={() => setExpanded(isOpen ? null : emp.userId)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{emp.name}</p>
                          <p className="text-xs text-(--text-muted) truncate">
                            {emp.position || emp.department || '—'}
                          </p>
                        </div>
                        {/* Risk bar */}
                        <div className="w-20 h-1.5 rounded-full bg-(--background-subtle) overflow-hidden hidden sm:block">
                          <div
                            className={`h-full ${style.bar}`}
                            style={{ width: `${emp.riskScore}%` }}
                          />
                        </div>
                        <Badge className={style.badge + ' border text-xs'}>{emp.riskScore}</Badge>
                        {isOpen ? (
                          <ChevronUp className="w-4 h-4 text-(--text-muted)" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-(--text-muted)" />
                        )}
                      </button>

                      {isOpen && (
                        <div className="px-3 pb-3 space-y-1.5 border-t border-(--border) pt-2">
                          {emp.factors.map((f) => (
                            <div key={f.key} className="flex items-start gap-2 text-xs">
                              <UserMinus className="w-3 h-3 mt-0.5 text-red-500 shrink-0" />
                              <span className="flex-1 text-(--text-primary)">
                                {t(`attrition.factor.${f.key}`, f.key)}
                                <span className="text-(--text-muted)"> (+{f.weight})</span>
                              </span>
                            </div>
                          ))}
                          <div className="mt-2 rounded-lg bg-purple-500/5 border border-purple-500/20 p-2">
                            <p className="text-[10px] font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide mb-1">
                              {t('attrition.recommended', 'Recommended actions')}
                            </p>
                            <ul className="space-y-1">
                              {Array.from(
                                new Set(
                                  emp.factors.map((f) => FACTOR_ADVICE[f.key] || 'adviceOneOnOne'),
                                ),
                              ).map((adviceKey) => (
                                <li
                                  key={adviceKey}
                                  className="text-xs text-(--text-primary) flex gap-1.5"
                                >
                                  <span className="text-purple-500">→</span>
                                  {t(`attrition.${adviceKey}`, adviceKey)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default AttritionRiskPanel;
