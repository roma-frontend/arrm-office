'use client';

/* eslint-disable @next/next/no-img-element */

import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import { Cake, Gift } from 'lucide-react';
import { api } from '../../../../convex/_generated/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// Initials fallback avatar (matches the muted-circle style used elsewhere).
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
    <div className="w-9 h-9 rounded-full bg-[#ec4899]/10 text-[#ec4899] flex items-center justify-center text-xs font-semibold shrink-0">
      {initials}
    </div>
  );
}

export const UpcomingBirthdaysWidget = memo(function UpcomingBirthdaysWidget() {
  const { t } = useTranslation();
  const lang = i18n.language || 'en';
  const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;

  const birthdays = useQuery(api.dashboard.getUpcomingBirthdays, { withinDays: 30 });

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Cake className="w-5 h-5 text-[#ec4899]" />
          {t('dashboardWidgets.upcomingBirthdays', 'Upcoming Birthdays')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {birthdays === undefined ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 bg-(--background-subtle) animate-pulse rounded-lg" />
            ))}
          </div>
        ) : birthdays.length === 0 ? (
          <div className="text-center py-8">
            <Gift className="w-12 h-12 text-(--text-muted) mx-auto mb-3 opacity-40" />
            <p className="text-sm text-(--text-muted)">
              {t('dashboardWidgets.noBirthdays', 'No birthdays in the next 30 days')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {birthdays.slice(0, 6).map((b) => {
              // month/day → a display date (year-agnostic; use a stable year).
              const displayDate = new Date(2000, b.month - 1, b.day);
              return (
                <div
                  key={b._id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-(--background-subtle) transition-colors"
                >
                  <Avatar name={b.name} avatarUrl={b.avatarUrl} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-(--text-primary) truncate">{b.name}</p>
                    <p className="text-xs text-(--text-muted)">
                      {format(displayDate, 'MMMM d', { locale: dateFnsLocale })}
                      {b.department ? ` · ${b.department}` : ''}
                    </p>
                  </div>
                  {b.isToday ? (
                    <Badge variant="success" className="shrink-0">
                      🎉 {t('dashboardWidgets.today', 'Today')}
                    </Badge>
                  ) : (
                    <span className="text-xs text-(--text-muted) shrink-0">
                      {b.daysUntil === 1
                        ? t('dashboardWidgets.tomorrow', 'Tomorrow')
                        : t('dashboardWidgets.inDays', 'in {{count}}d', { count: b.daysUntil })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export default UpcomingBirthdaysWidget;
