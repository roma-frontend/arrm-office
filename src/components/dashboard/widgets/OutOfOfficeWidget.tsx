'use client';

/* eslint-disable @next/next/no-img-element */

import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import { PalmtreeIcon, UserCheck } from 'lucide-react';
import { api } from '../../../../convex/_generated/api';
import { getLeaveTypeLabel, type LeaveType, LEAVE_TYPE_COLORS } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function Avatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  if (avatarUrl) {
    return (
      <img src={avatarUrl} alt={name} className="w-9 h-9 rounded-full object-cover shrink-0" />
    );
  }
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-[#f59e0b]/10 text-[#f59e0b] flex items-center justify-center text-xs font-semibold shrink-0">
      {initials}
    </div>
  );
}

export const OutOfOfficeWidget = memo(function OutOfOfficeWidget() {
  const { t } = useTranslation();
  const lang = i18n.language || 'en';
  const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;

  const entries = useQuery(api.dashboard.getOutOfOffice, { withinDays: 7 });

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <PalmtreeIcon className="w-5 h-5 text-[#f59e0b]" />
          {t('dashboardWidgets.outOfOffice', 'Out of Office')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries === undefined ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 bg-(--background-subtle) animate-pulse rounded-lg" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8">
            <UserCheck className="w-12 h-12 text-(--text-muted) mx-auto mb-3 opacity-40" />
            <p className="text-sm text-(--text-muted)">
              {t('dashboardWidgets.everyoneIn', 'Everyone is in this week')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.slice(0, 6).map((e) => {
              const accent = LEAVE_TYPE_COLORS[e.type as LeaveType] ?? '#64748b';
              return (
                <div
                  key={e._id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-(--background-subtle) transition-colors"
                >
                  <Avatar name={e.name} avatarUrl={e.avatarUrl} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-(--text-primary) truncate">{e.name}</p>
                    <p className="text-xs text-(--text-muted)">
                      {format(new Date(e.startDate), 'MMM d', { locale: dateFnsLocale })} –{' '}
                      {format(new Date(e.endDate), 'MMM d', { locale: dateFnsLocale })}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className="text-[11px] font-medium px-2 py-0.5 rounded-md"
                      style={{ backgroundColor: `${accent}18`, color: accent }}
                    >
                      {getLeaveTypeLabel(e.type as LeaveType, t)}
                    </span>
                    {e.isOutToday && (
                      <Badge variant="warning" className="text-[10px]">
                        {t('dashboardWidgets.outNow', 'Out now')}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export default OutOfOfficeWidget;
