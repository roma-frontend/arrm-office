'use client';

import React from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { History, Clock, TrendingUp, CheckCircle, Coffee } from 'lucide-react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';

interface ShiftHistoryProps {
  driverId: Id<'drivers'>;
}

export function ShiftHistory({ driverId }: ShiftHistoryProps) {
  const { t, i18n } = useTranslation(['drivers', 'common']);
  const dfLocale = i18n.language === 'ru' ? ru : i18n.language === 'hy' ? hy : enUS;
  const shifts = useQuery(api.drivers.shifts_mutations.getShiftHistory, { driverId, limit: 10 });

  if (!shifts) return null;

  const formatDuration = (hours: number | null) => {
    if (!hours) return '-';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}${t('driver.shift.h', 'h')} ${m}${t('driver.shift.m', 'm')}`;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'success' | 'primary' | 'warning' | 'outline'> = {
      completed: 'success',
      active: 'primary',
      paused: 'warning',
      overtime: 'outline',
    };

    const labels: Record<string, string> = {
      completed: t('driver.shift.completed', 'Completed'),
      active: t('driver.shift.active', 'Active'),
      paused: t('driver.shift.paused', 'Paused'),
      overtime: t('driver.shift.overtime', 'Overtime'),
    };

    return (
      <Badge variant={variants[status] || 'outline'}>
        {status === 'completed' && <CheckCircle className="w-3 h-3 mr-1" />}
        {status === 'active' && (
          <span className="w-2 h-2 rounded-full bg-(--success) mr-1 animate-pulse" />
        )}
        {status === 'paused' && <Coffee className="w-3 h-3 mr-1" />}
        {labels[status] || status}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <History className="w-4 h-4 sm:w-5 sm:h-5" />
          {t('driver.shift.history', 'Shift History')}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 py-3 sm:px-6 sm:py-4">
        {shifts.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-muted-foreground">
            <History className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 opacity-50" />
            <p className="text-sm">{t('driver.shift.noHistory', 'No shift history yet')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {shifts.map((shift: any) => (
              <div
                key={shift._id}
                className="p-3 sm:p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex flex-col sm:flex-row items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm sm:text-base">
                        {format(shift.startTime, 'MMM dd, yyyy', { locale: dfLocale })}
                      </p>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {format(shift.startTime, 'HH:mm', { locale: dfLocale })} -{' '}
                        {shift.endTime
                          ? format(shift.endTime, 'HH:mm', { locale: dfLocale })
                          : t('driver.shift.now', 'Now')}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(shift.status)}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs sm:text-sm">
                  <div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      {t('driver.shift.duration', 'Duration')}
                    </p>
                    <p className="font-medium text-xs sm:text-sm">
                      {formatDuration(shift.duration)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      {t('driver.shift.trips', 'Trips')}
                    </p>
                    <p className="font-medium text-xs sm:text-sm">{shift.tripsCompleted}</p>
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      {t('driver.shift.distance', 'Distance')}
                    </p>
                    <p className="font-medium text-xs sm:text-sm">
                      {(shift.totalDistance || 0).toFixed(1)} {t('driver.shift.km', 'km')}
                    </p>
                  </div>
                  {shift.overtimeHours && shift.overtimeHours > 0 && (
                    <div>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        {t('driver.shift.overtime', 'Overtime')}
                      </p>
                      <p className="font-medium text-orange-600 text-xs sm:text-sm">
                        {shift.overtimeHours.toFixed(1)}
                        {t('driver.shift.h', 'h')}
                      </p>
                    </div>
                  )}
                </div>

                {shift.driverNotes && (
                  <div className="mt-3 p-2 bg-muted/50 rounded text-xs sm:text-sm">
                    <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">
                      📝 {t('driver.shift.notes', 'Notes')}
                    </p>
                    <p>{shift.driverNotes}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
