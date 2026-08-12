'use client';

import React from 'react';
import { motion } from '@/lib/cssMotion';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader, SectionEmpty } from '@/components/dashboard/SectionHeader';
import type { LeaveEnriched } from '@/lib/convex-types';
import type { LeaveStatus } from '@/lib/types';

interface RecentLeavesCardProps {
  recentLeaves: LeaveEnriched[];
}

function formatDate(dateStr: string | undefined | null, fmt: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const lang = i18n.language || 'en';
  const dfLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;
  return format(d, fmt, { locale: dfLocale });
}

const StatusBadgeMemo = React.memo(({ status, label }: { status: LeaveStatus; label: string }) => {
  const variants: Record<LeaveStatus, 'warning' | 'success' | 'destructive'> = {
    pending: 'warning',
    approved: 'success',
    rejected: 'destructive',
    cancel_requested: 'warning',
  };
  return (
    <Badge variant={variants[status]} className="capitalize">
      {label}
    </Badge>
  );
});
StatusBadgeMemo.displayName = 'StatusBadgeMemo';

export function RecentLeavesCard({ recentLeaves }: RecentLeavesCardProps) {
  const { t } = useTranslation();

  return (
    <motion.div variants={itemVariants} className="lg:col-span-1">
      <Card className="h-full">
        {/* The arrow in this corner used to be decoration that looked like a
            control. It is now the link it pretended to be. */}
        <SectionHeader
          title={t('dashboard.recentLeaves')}
          action={{ href: '/leaves', label: t('dashboard.viewAll') }}
        />
        <CardContent className="px-4 sm:px-5 pb-4">
          {recentLeaves.length > 0 ? (
            <ul className="divide-y divide-(--border)">
              {recentLeaves.map((leave) => (
                <li
                  key={leave._id}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 text-sm"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Initials instead of an icon: at a glance the row is about
                        a person, and the name is what identifies it. */}
                    <span className="w-7 h-7 rounded-full bg-(--muted) text-(--text-muted) text-[11px] font-semibold flex items-center justify-center shrink-0">
                      {initialsOf(leave.userName)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-(--text-primary) truncate">{leave.userName}</p>
                      <p className="text-xs text-(--text-muted) truncate">
                        {formatDate(leave.startDate, 'MMM d')} –{' '}
                        {formatDate(leave.endDate, 'MMM d')}
                      </p>
                    </div>
                  </div>
                  <StatusBadgeMemo
                    status={leave.status}
                    label={
                      leave.status === 'approved'
                        ? t('titles.leaveStatus.approved')
                        : leave.status === 'pending'
                          ? t('titles.leaveStatus.pending')
                          : t('titles.leaveStatus.rejected')
                    }
                  />
                </li>
              ))}
            </ul>
          ) : (
            <SectionEmpty
              icon={<Clock className="w-4 h-4" />}
              message={t('dashboard.noRecentLeaves')}
            />
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/** Up to two initials; anonymous rows fall back to a dash rather than a blank. */
function initialsOf(name: string | undefined | null): string {
  if (!name) return '—';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};
