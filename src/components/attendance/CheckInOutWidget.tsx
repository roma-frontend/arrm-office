'use client';

import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, LogIn, LogOut, TrendingUp, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/useAuthStore';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';

export function CheckInOutWidget() {
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
    } catch (error: any) {
      toast.error(error.message || t('attendance.failedCheckIn'));
    }
  };

  const handleCheckOut = async () => {
    if (!user?.id) return;
    try {
      await checkOut({ userId: user.id as Id<'users'> });
      toast.success(t('toasts.checkedOutSuccess'));
    } catch (error: any) {
      toast.error(error.message || t('attendance.failedCheckOut'));
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

  return (
    <Card className="overflow-hidden">
      <CardHeader className="btn-gradient text-white font-medium shadow-md hover:shadow-lg">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Clock className="w-5 h-5" />
            {t('attendance.timeTracker')}
          </CardTitle>
          <div className="text-2xl font-mono">
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
          <Badge
            variant={isCheckedIn ? 'default' : isCheckedOut ? 'secondary' : 'outline'}
            className={
              isCheckedIn ? 'bg-green-500 text-white' : isCheckedOut ? 'bg-blue-500 text-white' : ''
            }
          >
            {!todayStatus && t('attendance.offline')}
            {isCheckedIn && t('attendance.online')}
            {isCheckedOut && t('attendance.offline')}
          </Badge>
        </div>

        {/* Check In/Out Times */}
        {todayStatus && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2 mb-1">
                <LogIn className="w-4 h-4 text-green-500" />
                <span className="text-xs text-(--text-muted)">{t('attendance.checkIn')}</span>
              </div>
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {formatTime(todayStatus.checkInTime)}
              </p>
              {todayStatus.isLate && todayStatus.lateMinutes && (
                <p className="text-xs text-red-500 mt-1">
                  {t('attendance.lateBy', { minutes: todayStatus.lateMinutes })}
                </p>
              )}
            </div>

            <div className="p-3 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2 mb-1">
                <LogOut className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-(--text-muted)">{t('attendance.checkOut')}</span>
              </div>
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {todayStatus.checkOutTime ? formatTime(todayStatus.checkOutTime) : '—'}
              </p>
              {todayStatus.isEarlyLeave && todayStatus.earlyLeaveMinutes && (
                <p className="text-xs text-orange-500 mt-1">
                  {t('attendance.leftEarlyBy', { minutes: todayStatus.earlyLeaveMinutes })}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Work Duration */}
        {todayStatus && todayStatus.totalWorkedMinutes && (
          <div className="p-4 rounded-lg bg-linear-to-r from-green-50 to-blue-50 dark:from-green-950 dark:to-blue-950">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {t('attendance.totalWorked')}
                </span>
              </div>
              <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                {formatDuration(todayStatus.totalWorkedMinutes)}
              </span>
            </div>
            {todayStatus.overtimeMinutes && todayStatus.overtimeMinutes > 0 && (
              <p className="text-sm text-green-600 dark:text-green-400 mt-2">
                +{formatDuration(todayStatus.overtimeMinutes)} {t('attendanceExtra.overtimeShort')}{' '}
                🌟
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          {!todayStatus && (
            <Button
              onClick={handleCheckIn}
              className="flex-1 bg-green-500 hover:bg-green-600 text-white"
              size="lg"
            >
              <LogIn className="w-5 h-5 mr-2" />
              {t('attendance.checkIn')}
            </Button>
          )}

          {isCheckedIn && (
            <Button onClick={handleCheckOut} className="flex-1 btn-gradient" size="lg">
              <LogOut className="w-5 h-5 mr-2" />
              {t('attendance.checkOut')}
            </Button>
          )}

          {isCheckedOut && (
            <div className="flex-1 p-4 rounded-lg bg-blue-50 dark:bg-blue-950 text-center">
              <p className="text-blue-600 dark:text-blue-400 font-medium">
                {t('attendance.seeYouTomorrow')}
              </p>
            </div>
          )}
        </div>

        {/* Info Message */}
        {!todayStatus && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950">
            <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5" />
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              {t('ui.notCheckedInWarning')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CheckInOutWidget;
