'use client';

import { useTranslation } from 'react-i18next';
import React from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brain, AlertCircle, CheckCircle, Minus, Briefcase } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { Id } from '../../../convex/_generated/dataModel';

interface AILeaveAssistantProps {
  leaveRequestId: Id<'leaveRequests'>;
  userId: Id<'users'>;
  onApprove?: (comment?: string) => void;
  onReject?: (comment?: string) => void;
}

export default function AILeaveAssistant({ leaveRequestId, userId }: AILeaveAssistantProps) {
  const { t } = useTranslation();
  const evaluation = useQuery(api.aiEvaluator.evaluateLeaveRequest, { leaveRequestId });

  // Загружаем информацию о заявке на отпуск для проверки конфликтов
  const leaveRequest = useQuery(api.leaves.getAllLeaves, userId && userId !== '' ? {} : 'skip');
  const currentLeave = leaveRequest?.find((l) => l._id === leaveRequestId);

  // Проверяем конфликты через Conflict Service
  const conflicts = useQuery(
    api.conflicts.detectAllConflicts,
    currentLeave?.organizationId
      ? {
          organizationId: currentLeave.organizationId,
          startDate: new Date(currentLeave.startDate).getTime(),
          endDate: new Date(currentLeave.endDate).getTime(),
          userId: currentLeave.userId,
        }
      : 'skip',
  );

  if (!evaluation) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5 text-(--text-muted) animate-pulse" />
            <p className="text-sm text-(--text-muted)">
              {t('aiLeave.analyzing', 'AI analyzing request...')}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { leaveEligibilityScore, breakdown, recommendation, confidence, reasoning } = evaluation;

  // Фильтруем конфликты, относящиеся к этой заявке
  const currentUserId = currentLeave?.userId;
  const currentUserDepartment = currentLeave?.userDepartment;
  const leaveConflicts =
    conflicts?.filter(
      (c) =>
        (currentUserId ? c.affectedUsers?.includes(currentUserId) : false) ||
        (currentUserDepartment ? c.affectedDepartments?.includes(currentUserDepartment) : false),
    ) || [];

  const criticalConflicts = leaveConflicts.filter((c) => c.severity === 'critical');
  const warningConflicts = leaveConflicts.filter((c) => c.severity === 'warning');

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getRecommendationBadge = () => {
    if (recommendation === 'APPROVE') {
      return (
        <Badge variant="success" className="flex items-center gap-1">
          <CheckCircle className="w-3 h-3" /> {t('aiLeave.approve')}
        </Badge>
      );
    } else if (recommendation === 'REVIEW') {
      return (
        <Badge variant="warning" className="flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> {t('aiLeave.review')}
        </Badge>
      );
    } else {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <Minus className="w-3 h-3" /> {t('aiLeave.reject')}
        </Badge>
      );
    }
  };

  return (
    <Card className="border-2 border-(--primary)/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-5 h-5 text-(--primary)" />
            {t('aiFeatures.aiLeaveAssistant')}
          </CardTitle>
          {getRecommendationBadge()}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-sm text-(--text-muted)">{t('aiLeave.confidence')}:</span>
          <Badge
            variant={
              confidence === 'HIGH'
                ? 'success'
                : confidence === 'MEDIUM'
                  ? 'warning'
                  : 'destructive'
            }
          >
            {confidence}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ═══════════════════════════════════════════════════════════════
            CONFLICT ALERTS — Новый раздел с конфликтами
            ═══════════════════════════════════════════════════════════════ */}
        {leaveConflicts.length > 0 && (
          <div className="space-y-3">
            {/* Critical Conflicts */}
            {criticalConflicts.length > 0 && (
              <div className="p-3 rounded-lg border-2 border-red-500/30 bg-red-500/5 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-semibold text-red-700">
                    {t('aiLeave.criticalConflicts', { count: criticalConflicts.length })}
                  </span>
                </div>
                {criticalConflicts.map((conflict, idx: number) => (
                  <div key={idx} className="text-sm">
                    <p className="font-medium text-red-800">{conflict.title}</p>
                    <p className="text-red-700 mt-1">{conflict.message}</p>
                    <div className="flex items-start gap-1 mt-2 text-red-600">
                      <Briefcase className="w-3 h-3 mt-0.5 shrink-0" />
                      <p className="text-xs">{conflict.suggestion}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Warning Conflicts */}
            {warningConflicts.length > 0 && (
              <div className="p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-yellow-600" />
                  <span className="text-sm font-semibold text-yellow-700">
                    {t('aiLeave.warnings', { count: warningConflicts.length })}
                  </span>
                </div>
                {warningConflicts.map((conflict, idx: number) => (
                  <div key={idx} className="text-sm">
                    <p className="font-medium text-yellow-800">{conflict.title}</p>
                    <p className="text-yellow-700 mt-1">{conflict.message}</p>
                    <div className="flex items-start gap-1 mt-2 text-yellow-600">
                      <Briefcase className="w-3 h-3 mt-0.5 shrink-0" />
                      <p className="text-xs">{conflict.suggestion}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* No Conflicts Message */}
        {leaveConflicts.length === 0 && (
          <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/5">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-700">{t('aiLeave.noConflicts')}</span>
            </div>
            <p className="text-xs text-green-600 mt-1">{t('aiLeave.noConflictsDesc')}</p>
          </div>
        )}

        {/* Overall Score */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{t('aiLeave.eligibilityScore')}</span>
            <span className={`text-2xl font-bold ${getScoreColor(leaveEligibilityScore)}`}>
              {leaveEligibilityScore}/100
            </span>
          </div>
          <Progress value={leaveEligibilityScore} className="h-2" />
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-(--text-muted)">{t('aiLeave.performance', 'Performance')}</span>
              <span className={`font-medium ${getScoreColor(breakdown.performance.score)}`}>
                {breakdown.performance.score}%
              </span>
            </div>
            <Progress value={breakdown.performance.score} className="h-1.5" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-(--text-muted)">{t('aiLeave.attendance', 'Attendance')}</span>
              <span className={`font-medium ${getScoreColor(breakdown.attendance.score)}`}>
                {breakdown.attendance.score}%
              </span>
            </div>
            <Progress value={breakdown.attendance.score} className="h-1.5" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-(--text-muted)">{t('aiLeave.behavior', 'Behavior')}</span>
              <span className={`font-medium ${getScoreColor(breakdown.behavior.score)}`}>
                {breakdown.behavior.score}%
              </span>
            </div>
            <Progress value={breakdown.behavior.score} className="h-1.5" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-(--text-muted)">{t('aiLeave.workload', 'Workload')}</span>
              <span className={`font-medium ${getScoreColor(breakdown.workload.score)}`}>
                {breakdown.workload.score}%
              </span>
            </div>
            <Progress value={breakdown.workload.score} className="h-1.5" />
          </div>
        </div>

        {/* AI Reasoning */}
        <div className="pt-3 border-t border-(--border)">
          <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
            <Brain className="w-4 h-4" />
            {t('aiFeatures.aiAnalysis')}
          </h4>
          <p className="text-sm text-(--text-muted) leading-relaxed">
            {t(`aiLeave.reasoning.${reasoning}`, reasoning)}
          </p>
        </div>

        {/* Key Factors */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">{t('aiLeave.keyFactors', 'Key Factors')}</h4>
          <div className="space-y-1.5">
            {(() => {
              const allFactors = [
                ...breakdown.performance.factors.slice(0, 2),
                ...breakdown.workload.factors.slice(0, 1),
              ];
              const negativeKeys = ['understaffed', 'disciplinaryConcerns'];
              const warningKeys = [
                'below',
                'some',
                'occasional',
                'attendanceConcerns',
                'lateArrivals',
                'highAbsence',
                'limited',
                'teamworkCould',
                'noLeave',
                'lowLeave',
                'teamMember',
              ];
              return allFactors.map((factor: string, i: number) => {
                let icon = <CheckCircle className="w-3 h-3 text-green-600 mt-0.5 shrink-0" />;
                if (negativeKeys.includes(factor)) {
                  icon = <Minus className="w-3 h-3 text-red-600 mt-0.5 shrink-0" />;
                } else if (warningKeys.some((k) => factor.includes(k))) {
                  icon = <AlertCircle className="w-3 h-3 text-yellow-600 mt-0.5 shrink-0" />;
                }
                return (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    {icon}
                    <span className="text-(--text-muted)">
                      {t(`aiLeave.factors.${factor}`, factor)}
                    </span>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
