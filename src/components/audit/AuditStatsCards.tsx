'use client';

/**
 * The four numbers an admin opening the audit log actually wants, plus a
 * per-day bar strip for spotting a spike.
 *
 * Every number describes the *current filter*, not the whole log — the header
 * says so, because "12 critical events" means nothing if the reader cannot tell
 * whether it covers a day or a year.
 */

import { Activity, AlertTriangle, ShieldAlert, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatDateTime } from '@/lib/date-format';
import type { AuditStats } from './types';

interface AuditStatsCardsProps {
  stats: AuditStats | undefined;
  /** Human-readable description of the active window, e.g. "Last 30 days". */
  rangeLabel: string;
}

export function AuditStatsCards({ stats, rangeLabel }: AuditStatsCardsProps) {
  const { t, i18n } = useTranslation();

  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      key: 'total',
      label: t('audit.stats.total', 'Events'),
      value: stats.capped ? `${stats.total}+` : String(stats.total),
      hint: rangeLabel,
      icon: Activity,
      tone: 'bg-(--brand-quiet) text-(--brand-text)',
    },
    {
      key: 'critical',
      label: t('audit.stats.critical', 'Critical'),
      value: String(stats.bySeverity.critical),
      hint:
        stats.criticalLast24h > 0
          ? t('audit.stats.criticalRecent', {
              count: stats.criticalLast24h,
              defaultValue: '{{count}} in the last 24h',
            })
          : t('audit.stats.criticalNoneRecent', 'None in the last 24h'),
      icon: ShieldAlert,
      tone: 'bg-(--danger-quiet) text-(--danger-text)',
    },
    {
      key: 'warning',
      label: t('audit.stats.warnings', 'Warnings'),
      value: String(stats.bySeverity.warning),
      hint: t('audit.stats.warningsHint', 'Deletions, rejections, revocations'),
      icon: AlertTriangle,
      tone: 'bg-(--warning-quiet) text-(--warning-text)',
    },
    {
      key: 'actors',
      label: t('audit.stats.actors', 'Active users'),
      value: String(stats.uniqueActors),
      hint:
        stats.lastEventAt !== null
          ? t('audit.stats.lastEvent', {
              date: formatDateTime(stats.lastEventAt, i18n.language, {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              }),
              defaultValue: 'Last event {{date}}',
            })
          : '',
      icon: Users,
      tone: 'bg-(--success-quiet) text-(--success-text)',
    },
  ];

  // Last 30 buckets: enough to see a weekly rhythm, few enough to stay legible
  // on a phone. `daily` is already ascending, so this is the recent tail.
  const days = stats.daily.slice(-30);
  const peak = days.reduce((max, day) => Math.max(max, day.total), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.key} className="border border-(--border) bg-(--card) p-4">
              <div
                className={`mb-3 flex size-9 items-center justify-center rounded-lg ${card.tone}`}
              >
                <Icon className="size-4" aria-hidden="true" />
              </div>
              <div className="text-2xl font-bold text-(--text-primary)">{card.value}</div>
              <div className="text-xs font-medium text-(--text-secondary)">{card.label}</div>
              {card.hint && (
                <div className="mt-0.5 text-[11px] text-(--text-muted)">{card.hint}</div>
              )}
            </Card>
          );
        })}
      </div>

      {days.length > 1 && (
        <Card className="border border-(--border) bg-(--card) p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-xs font-medium text-(--text-secondary)">
              {t('audit.stats.perDay', 'Events per day')}
            </span>
            <span className="text-[11px] text-(--text-muted)">{rangeLabel}</span>
          </div>
          <div
            className="flex h-16 items-end gap-1"
            role="img"
            aria-label={t('audit.stats.perDay', 'Events per day')}
          >
            {days.map((day) => {
              const height = peak === 0 ? 0 : Math.max(6, Math.round((day.total / peak) * 100));
              const label = `${formatDate(day.day, i18n.language, { month: 'short', day: 'numeric' })} — ${day.total}`;
              return (
                <div
                  key={day.day}
                  title={label}
                  className="flex-1 overflow-hidden rounded-sm bg-(--brand-quiet)"
                  style={{ height: `${height}%` }}
                >
                  {/* Critical share, capping the same bar. */}
                  {day.critical > 0 && (
                    <div
                      className="w-full bg-(--danger-solid)"
                      style={{ height: `${Math.round((day.critical / day.total) * 100)}%` }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
