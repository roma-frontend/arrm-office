'use client';

import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, LogIn, LogOut, TrendingUp, AlertCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/useAuthStore';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';

interface CheckInOutWidgetProps {
  /** Compact single-row layout for the dashboard: clock, status, one action
   *  button and a link to the full /attendance page. */
  compact?: boolean;
}

export function CheckInOutWidget({ compact }: CheckInOutWidgetProps) {
  const { t, i18n } = useTranslation(['modules', 'common']);
  const dfLocale = i18n.language === 'ru' ? ru : i18n.language === 'hy' ? hy : enUS;
  const { user } = useAuthStore();
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  const todayStatus = useQuery(
    api.timeTracking.getTodayStatus,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  const checkIn = useMutation(api.timeTracking.checkIn);
  const checkOut = useMutation(api.timeTracking.checkOut);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleCheckIn = async () => {
    if (!user?.id) return;
    try {
      await checkIn({ userId: user.id as Id<'users'> });
      toast.success(t('toasts.checkedInSuccess'));
    } catch (error) {
      toast.error((error instanceof Error ? error.message : '') || t('attendance.failedCheckIn'));
    }
  };

  const handleCheckOut = async () => {
    if (!user?.id) return;
    try {
      await checkOut({ userId: user.id as Id<'users'> });
      toast.success(t('toasts.checkedOutSuccess'));
    } catch (error) {
      toast.error((error instanceof Error ? error.message : '') || t('attendance.failedCheckOut'));
    }
  };

  const isCheckedIn = todayStatus?.status === 'checked_in';
  const isCheckedOut = todayStatus?.status === 'checked_out';

  const formatTime = (timestamp: number) => {
    return format(new Date(timestamp), 'HH:mm:ss', { locale: dfLocale });
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}${t('attendanceExtra.hoursShort')} ${mins}${t('attendanceExtra.minutesShort')}`;
  };

  if (todayStatus === undefined)
    return (
      <div className="flex items-center justify-center p-8">
        <ShieldLoader size="md" />
      </div>
    );

  // ── Compact layout: one row on the dashboard — clock, status, one action,
  //    and a path to the full attendance page. The full widget (times, totals,
  //    overtime) lives at /attendance so the dashboard stays scannable. ──
  if (compact)
    return (
      <Card className="overflow-hidden glass-panel">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-5">
          {/* Clock + title */}
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-(--brand-text)"
              style={{ background: 'color-mix(in srgb, var(--primary) 10%, transparent)' }}
            >
              <Clock className="size-4.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight text-(--text-primary)">
                {t('attendance.timeTracker')}
              </p>
              <p
                className={cn(
                  'text-xs leading-tight',
                  isCheckedIn ? 'text-(--success-text)' : 'text-(--text-muted)',
                )}
              >
                {!todayStatus && t('attendance.notCheckedIn')}
                {isCheckedIn && t('attendance.atWork')}
                {isCheckedOut && t('attendance.finishedToday')}
              </p>
            </div>
          </div>

          {/* Live clock */}
          <div className="num ml-auto font-mono text-lg tabular-nums text-(--text-primary)">
            {format(currentTime, 'HH:mm:ss', { locale: dfLocale })}
          </div>

          {/* One action */}
          {!todayStatus && (
            <Button onClick={handleCheckIn} size="sm">
              <LogIn className="size-4" />
              {t('attendance.checkIn')}
            </Button>
          )}
          {isCheckedIn && (
            <Button onClick={handleCheckOut} size="sm">
              <LogOut className="size-4" />
              {t('attendance.checkOut')}
            </Button>
          )}
          {isCheckedOut && (
            <span className="text-sm font-medium text-(--success-text)">
              {t('attendance.seeYouTomorrow')}
            </span>
          )}

          {/* Full page */}
          <Link
            href="/attendance"
            className={cn(
              'flex items-center gap-1 rounded-control px-2 py-1 text-xs font-medium text-(--text-2)',
              'transition-colors duration-140 ease-spark hover:text-(--brand-text)',
              'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
            )}
          >
            {t('attendance.viewDetails', 'View details')}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </Card>
    );

  return (
    <Card className="overflow-hidden glass-panel">
      {/* Full-bleed header: `.brand-panel`, not `.btn-gradient` — a button fill
          spread across the width of a card reads as a lit slab. */}
      <CardHeader className="brand-panel font-medium">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Clock className="w-5 h-5" />
            {t('attendance.timeTracker')}
          </CardTitle>
          <div className="num text-2xl font-mono">
            {currentTime ? format(currentTime, 'HH:mm:ss', { locale: dfLocale }) : '--:--:--'}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-4">
        {/* Current Status */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-(--background-subtle)">
          <div>
            <p className="text-sm text-(--text-muted)">{t('attendance.status')}</p>
            <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              {!todayStatus && t('attendance.notCheckedIn')}
              {isCheckedIn && t('attendance.atWork')}
              {isCheckedOut && t('attendance.finishedToday')}
            </p>
          </div>
          <Badge variant={isCheckedIn ? 'success' : isCheckedOut ? 'info' : 'outline'}>
            {!todayStatus && t('attendance.offline')}
            {isCheckedIn && t('attendance.online')}
            {isCheckedOut && t('attendance.offline')}
          </Badge>
        </div>

        {/* Check In/Out Times */}
        {todayStatus && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-card border border-(--border-default) p-3">
              <div className="flex items-center gap-2 mb-1">
                <LogIn className="w-4 h-4 text-(--success-text)" />
                <span className="text-xs text-(--text-muted)">{t('attendance.checkIn')}</span>
              </div>
              <p className="num font-semibold text-(--text-primary)">
                {formatTime(todayStatus.checkInTime)}
              </p>
              {todayStatus.isLate && todayStatus.lateMinutes && (
                <p className="mt-1 text-xs text-(--danger-text)">
                  {t('attendance.lateBy', { minutes: todayStatus.lateMinutes })}
                </p>
              )}
            </div>

            <div className="rounded-card border border-(--border-default) p-3">
              <div className="flex items-center gap-2 mb-1">
                <LogOut className="w-4 h-4 text-(--brand-text)" />
                <span className="text-xs text-(--text-muted)">{t('attendance.checkOut')}</span>
              </div>
              <p className="num font-semibold text-(--text-primary)">
                {todayStatus.checkOutTime ? formatTime(todayStatus.checkOutTime) : '—'}
              </p>
              {todayStatus.isEarlyLeave && todayStatus.earlyLeaveMinutes && (
                <p className="mt-1 text-xs text-(--warning-text)">
                  {t('attendance.leftEarlyBy', { minutes: todayStatus.earlyLeaveMinutes })}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Work Duration */}
        {todayStatus && todayStatus.totalWorkedMinutes && (
          <div className="rounded-card border border-(--success-outline) bg-(--success-quiet) p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-(--success-text)" />
                <span className="font-medium text-(--text-primary)">
                  {t('attendance.totalWorked')}
                </span>
              </div>
              <span className="num text-2xl font-bold text-(--success-text)">
                {formatDuration(todayStatus.totalWorkedMinutes)}
              </span>
            </div>
            {todayStatus.overtimeMinutes && todayStatus.overtimeMinutes > 0 && (
              <p className="mt-2 text-sm text-(--success-text)">
                +{formatDuration(todayStatus.overtimeMinutes)} {t('attendanceExtra.overtimeShort')}
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          {!todayStatus && (
            <Button onClick={handleCheckIn} className="flex-1" size="lg">
              <LogIn className="w-5 h-5 mr-2" />
              {t('attendance.checkIn')}
            </Button>
          )}

          {isCheckedIn && (
            <Button onClick={handleCheckOut} className="flex-1" size="lg">
              <LogOut className="w-5 h-5 mr-2" />
              {t('attendance.checkOut')}
            </Button>
          )}

          {isCheckedOut && (
            <div className="flex-1 rounded-card border border-(--brand-outline) bg-(--brand-quiet) p-4 text-center">
              <p className="font-medium text-(--brand-text)">{t('attendance.seeYouTomorrow')}</p>
            </div>
          )}
        </div>

        {/* Info Message */}
        {!todayStatus && (
          <div className="flex items-start gap-2 rounded-card border border-(--warning-outline) bg-(--warning-quiet) p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-(--warning-text)" />
            <p className="text-sm text-(--warning-text)">{t('ui.notCheckedInWarning')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CheckInOutWidget;
