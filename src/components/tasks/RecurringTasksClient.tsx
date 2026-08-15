/**
 * Recurring task series: what repeats, for whom, and when it next fires.
 *
 * Series live apart from the board on purpose — a rule has no status and nobody
 * completes it, so mixing it into the Kanban columns would put a template in
 * somebody's workload. This is where they are reviewed, paused and removed.
 */

'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import { ArrowLeft, CalendarClock, Pause, Play, Plus, Repeat, Trash2, User } from 'lucide-react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { getConvexErrorMessage } from '@/lib/error-handler';
import { cn } from '@/lib/utils';

interface RecurringTasksClientProps {
  userRole: 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';
}

/** Monday first, matching the wizard's weekday picker. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** Index 0-6 → the existing `weekdays.*` keys in the common namespace. */
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function RecurringTasksClient({ userRole }: RecurringTasksClientProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const selectedOrgId = useSelectedOrganization();
  const organizationId = (selectedOrgId ?? undefined) as Id<'organizations'> | undefined;

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<Id<'recurringTasks'> | null>(null);

  const series = useQuery(
    api.recurringTasks.listRecurringTasks,
    organizationId ? { organizationId, includeInactive: true } : { includeInactive: true },
  );
  const toggleSeries = useMutation(api.recurringTasks.toggleRecurringTask);
  const deleteSeries = useMutation(api.recurringTasks.deleteRecurringTask);

  const canManage = userRole === 'admin' || userRole === 'supervisor' || userRole === 'superadmin';

  const { active, paused } = useMemo(() => {
    const rows = series ?? [];
    return {
      active: rows.filter((s) => s.isActive),
      paused: rows.filter((s) => !s.isActive),
    };
  }, [series]);

  /** "Every Mon, Wed" / "Monthly on the 15th" — the rule in one line. */
  const describeRule = (row: NonNullable<typeof series>[number]): string => {
    if (row.frequency === 'monthly') {
      return t('recurringTasks.rule.monthly', { day: row.dayOfMonth ?? 1 });
    }
    const days = (row.daysOfWeek ?? [])
      .slice()
      .sort((a, b) => WEEKDAY_ORDER.indexOf(a as 0) - WEEKDAY_ORDER.indexOf(b as 0))
      .map((d) => t(`weekdays.${WEEKDAY_KEYS[d] ?? 'mon'}`))
      .join(', ');
    return t('recurringTasks.rule.weekly', { days });
  };

  const handleToggle = async (id: Id<'recurringTasks'>, next: boolean) => {
    setPendingId(id);
    try {
      await toggleSeries({ seriesId: id, isActive: next });
      toast.success(next ? t('recurringTasks.resumed') : t('recurringTasks.paused'));
    } catch (error) {
      toast.error(getConvexErrorMessage(error, t('recurringTasks.actionFailed')));
    } finally {
      setPendingId(null);
    }
  };

  const handleDelete = async (id: Id<'recurringTasks'>) => {
    setPendingId(id);
    try {
      const result = await deleteSeries({ seriesId: id });
      toast.success(t('recurringTasks.deleted', { count: result.detachedTasks }));
      setConfirmDeleteId(null);
    } catch (error) {
      toast.error(getConvexErrorMessage(error, t('recurringTasks.actionFailed')));
    } finally {
      setPendingId(null);
    }
  };

  const renderRow = (row: NonNullable<typeof series>[number]) => {
    const busy = pendingId === row._id;
    const confirming = confirmDeleteId === row._id;

    return (
      <div
        key={row._id}
        className={cn(
          'flex flex-col gap-3 rounded-2xl border border-(--border) bg-(--card) p-4 sm:flex-row sm:items-center sm:justify-between',
          !row.isActive && 'opacity-60',
        )}
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-(--text-primary)">{row.title}</p>
            <Badge variant="outline" className="shrink-0 text-xs">
              {t(`priority.${row.priority}`)}
            </Badge>
            {!row.isActive && (
              <Badge variant="outline" className="shrink-0 text-xs">
                {t('recurringTasks.pausedBadge')}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-(--text-muted)">
            <span className="flex items-center gap-1">
              <Repeat className="h-3.5 w-3.5" />
              {describeRule(row)}
            </span>
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              {row.assignedToName}
            </span>
            {row.nextOccurrence && (
              <span className="flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5" />
                {t('recurringTasks.nextRun', { date: row.nextOccurrence })}
              </span>
            )}
            <span>{t('recurringTasks.generatedCount', { count: row.generatedCount ?? 0 })}</span>
            {row.endDate && <span>{t('recurringTasks.until', { date: row.endDate })}</span>}
          </div>
        </div>

        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => handleToggle(row._id, !row.isActive)}
              className="gap-1.5"
            >
              {row.isActive ? (
                <>
                  <Pause className="h-3.5 w-3.5" />
                  {t('recurringTasks.pause')}
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  {t('recurringTasks.resume')}
                </>
              )}
            </Button>

            {confirming ? (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => setConfirmDeleteId(null)}
                >
                  {t('actions.cancel')}
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => handleDelete(row._id)}
                  className="bg-(--danger-solid) text-white hover:bg-(--danger-solid)"
                >
                  {t('recurringTasks.confirmDelete')}
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                disabled={busy}
                aria-label={t('recurringTasks.delete')}
                onClick={() => setConfirmDeleteId(row._id)}
                className="text-(--danger-text) hover:bg-(--danger-quiet)"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-4xl my-6">
      <div className="flex items-center justify-between gap-3 my-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/tasks')}
            aria-label={t('actions.back')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold md:text-2xl">
              {t('recurringTasks.title')}
            </h1>
            <p className="mt-0.5 text-sm text-(--text-muted)">{t('recurringTasks.subtitle')}</p>
          </div>
        </div>
        {canManage && (
          <Button onClick={() => router.push('/tasks/new')} className="shrink-0 gap-2">
            <Plus className="h-4 w-4" />
            {t('recurringTasks.newSeries')}
          </Button>
        )}
      </div>

      {series === undefined ? (
        <div className="flex justify-center py-16">
          <ShieldLoader size="sm" />
        </div>
      ) : series.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Repeat className="h-12 w-12 text-(--text-muted) opacity-30" />
            <div>
              <p className="font-semibold text-(--text-primary)">{t('recurringTasks.empty')}</p>
              <p className="mt-1 text-sm text-(--text-muted)">{t('recurringTasks.emptyHint')}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {t('recurringTasks.activeSection', { count: active.length })}
              </CardTitle>
              <CardDescription>{t('recurringTasks.activeSectionHint')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {active.length === 0 ? (
                <p className="py-4 text-center text-sm text-(--text-muted)">
                  {t('recurringTasks.noneActive')}
                </p>
              ) : (
                active.map(renderRow)
              )}
            </CardContent>
          </Card>

          {paused.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {t('recurringTasks.pausedSection', { count: paused.length })}
                </CardTitle>
                <CardDescription>{t('recurringTasks.pausedSectionHint')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">{paused.map(renderRow)}</CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export default RecurringTasksClient;
