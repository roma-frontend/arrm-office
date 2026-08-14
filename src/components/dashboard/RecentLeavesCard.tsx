'use client';

import React, { useCallback, useState } from 'react';
import { motion } from '@/lib/cssMotion';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import { format } from 'date-fns';
import { enUS, ru, hy, de } from 'date-fns/locale';
import i18n from 'i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader, SectionEmpty } from '@/components/dashboard/SectionHeader';
import { LeaveSheet } from '@/components/leaves/LeaveSheet';
import { cn } from '@/lib/utils';
import type { LeaveEnriched } from '@/lib/convex-types';
import type { LeaveStatus } from '@/lib/types';
import type { Id } from '../../../convex/_generated/dataModel';

interface RecentLeavesCardProps {
  recentLeaves: LeaveEnriched[];
}

function formatDate(dateStr: string | undefined | null, fmt: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const lang = i18n.language || 'en';
  const dfLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : lang === 'de' ? de : enUS;
  return format(d, fmt, { locale: dfLocale });
}

const STATUS_VARIANTS: Record<LeaveStatus, 'warning' | 'success' | 'destructive'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  cancel_requested: 'warning',
};

const StatusBadgeMemo = React.memo(({ status, label }: { status: LeaveStatus; label: string }) => (
  <Badge variant={STATUS_VARIANTS[status]}>{label}</Badge>
));
StatusBadgeMemo.displayName = 'StatusBadgeMemo';

/**
 * Recent leave activity.
 *
 * This card used to be a dead end: six rows of name, dates and a status badge,
 * read-only, with the only way onward being "view all" in the header. Since the
 * Focus Feed above now owns *what needs a decision*, the job left for this card is
 * recent history — and history is only useful if you can open an entry from it.
 * So every row opens the same detail slide-over the requests list uses.
 *
 * Rows also show the leave *type* now. "Anna, Mar 3–7, approved" does not say
 * what was approved, which was most of the reason the card got skipped.
 */
export function RecentLeavesCard({ recentLeaves }: RecentLeavesCardProps) {
  const { t } = useTranslation();
  const [sheetLeave, setSheetLeave] = useState<{
    id: Id<'leaveRequests'>;
    requesterName: string;
  } | null>(null);

  const openLeave = useCallback((leave: LeaveEnriched) => {
    setSheetLeave({
      id: leave._id as Id<'leaveRequests'>,
      requesterName: leave.userName ?? '',
    });
  }, []);

  return (
    <motion.div variants={itemVariants} className="lg:col-span-1">
      <Card className="h-full glass-panel">
        {/* The arrow in this corner used to be decoration that looked like a
            control. It is now the link it pretended to be. */}
        <SectionHeader
          title={t('dashboard.recentLeaves')}
          action={{ href: '/leaves', label: t('dashboard.viewAll') }}
        />
        <CardContent className="px-4 sm:px-5 pb-4">
          {recentLeaves.length > 0 ? (
            <ul className="divide-y divide-(--border-subtle)">
              {recentLeaves.map((leave) => (
                <li key={leave._id} className="first:pt-0 last:pb-0">
                  <button
                    type="button"
                    data-slot="recent-leave"
                    onClick={() => openLeave(leave)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-control px-1.5 py-2.5 text-left text-sm',
                      'transition-colors duration-140 ease-spark hover:bg-(--surface-2)',
                      'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {/* Initials instead of an icon: at a glance the row is about
                          a person, and the name is what identifies it. */}
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-(--surface-2) text-[11px] font-semibold text-(--text-3)">
                        {initialsOf(leave.userName)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-(--text-1)">{leave.userName}</p>
                        <p className="num truncate text-xs text-(--text-3)">
                          {t(`leaveTypes.${leave.type}`, leave.type)} ·{' '}
                          {formatDate(leave.startDate, 'MMM d')} –{' '}
                          {formatDate(leave.endDate, 'MMM d')}
                        </p>
                      </div>
                    </div>
                    {/* Was a three-branch ternary that sent `cancel_requested`
                        down the `else`, labelling a cancellation request
                        "rejected". Keyed off the status directly instead. */}
                    <StatusBadgeMemo
                      status={leave.status}
                      label={t(`statuses.${leave.status}`, leave.status)}
                    />
                  </button>
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

      <LeaveSheet
        leaveId={sheetLeave?.id ?? null}
        requesterName={sheetLeave?.requesterName}
        onClose={() => setSheetLeave(null)}
      />
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
