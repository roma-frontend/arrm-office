'use client';

import React, { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../convex/_generated/api';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import type { Id } from '../../../convex/_generated/dataModel';
import { Clock, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { SectionHeader } from '@/components/dashboard/SectionHeader';

interface OvertimeWidgetProps {
  userId: Id<'users'>;
}

export default React.memo(
  function OvertimeWidget({ userId: _userId }: OvertimeWidgetProps) {
    const { t } = useTranslation();
    const stats = useQuery(api.overtime.getOvertimeStats, {});
    const limitsRemaining = useQuery(api.overtime.getOvertimeLimitsRemaining);
    const pendingRequests = useQuery(api.overtime.getMyOvertimeRequests);

    const pendingCount = useMemo(
      () => pendingRequests?.filter((r) => r.status === 'pending').length ?? 0,
      [pendingRequests],
    );

    if (!stats) {
      return (
        <div className="flex items-center justify-center p-8">
          <ShieldLoader size="sm" />
        </div>
      );
    }

    const monthProgress = limitsRemaining?.maxPerMonth
      ? Math.min(100, (stats.approvedHours / limitsRemaining.maxPerMonth) * 100)
      : null;

    return (
      <Card variant="flat" className="glass-panel">
        <SectionHeader
          title={t('overtime.title', 'Overtime')}
          aside={
            <span className="ml-auto flex size-7 items-center justify-center rounded-control bg-[#8b5cf6]/10 text-[#8b5cf6]">
              <Clock className="size-4" />
            </span>
          }
        />
        <CardContent className="space-y-4 px-4 pb-4 sm:px-5">
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-card border border-(--border-subtle) bg-(--surface-2) p-3">
              <p className="text-caption text-(--text-3)">
                {t('overtime.stats.totalHours', 'Total Hours')}
              </p>
              <p className="num text-heading text-[#8b5cf6]">{stats.totalHours}h</p>
            </div>
            <div className="rounded-card border border-(--border-subtle) bg-(--surface-2) p-3">
              <p className="text-caption text-(--text-3)">
                {t('overtime.stats.approved', 'Approved')}
              </p>
              <p className="num text-heading text-(--success-text)">{stats.approvedHours}h</p>
            </div>
            <div className="rounded-card border border-(--border-subtle) bg-(--surface-2) p-3">
              <p className="text-caption text-(--text-3)">
                {t('overtime.stats.pending', 'Pending')}
              </p>
              <p className="num text-heading text-(--warning-text)">{stats.pendingRequests}</p>
            </div>
            <div className="rounded-card border border-(--border-subtle) bg-(--surface-2) p-3">
              <p className="text-caption text-(--text-3)">
                {t('overtime.stats.approvedRequests', 'Requests')}
              </p>
              <p className="num text-heading text-(--text-1)">{stats.approvedRequests}</p>
            </div>
          </div>

          {/* Monthly limit progress */}
          {monthProgress !== null && limitsRemaining?.maxPerMonth && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-label text-(--text-2)">
                  {t('overtime.monthly', 'Monthly')} Limit
                </span>
                <span className="num text-label font-semibold text-(--text-1)">
                  {stats.approvedHours}h / {limitsRemaining.maxPerMonth}h
                </span>
              </div>
              <Progress value={monthProgress} className="h-2" />
              <p className="num mt-1 text-caption text-(--text-3)">
                {monthProgress.toFixed(0)}% {t('overtime.ofLimit', 'of limit')}
              </p>
            </div>
          )}

          {/* Pending badge */}
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 rounded-card border border-(--warning-outline) bg-(--warning-quiet) p-3">
              <Zap className="w-4 h-4 text-[#8b5cf6]" />
              <span className="text-label text-[#8b5cf6]">
                {pendingCount} {t('overtime.pendingRequests', 'pending request(s)')}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  },
  (prev, next) => prev.userId === next.userId,
);
