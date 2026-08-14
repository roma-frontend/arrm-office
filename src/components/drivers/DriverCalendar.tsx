/**
 * Driver Calendar Component
 * Visual calendar showing trip schedule, availability, and time-off
 * Fully responsive - works on all screen sizes
 */

'use client';

import React, { useMemo, useState } from 'react';
import { useNow } from '@/hooks/useNow';
import { useMainRef } from '@/hooks/useMainRef';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import type { FunctionReference } from 'convex/server';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Calendar as CalendarIcon,
  Shield,
  Play,
  CheckCircle2,
} from 'lucide-react';
import { format, startOfWeek, addDays, isSameDay, isToday } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { TripDetailsModal } from './modals/TripDetailsModal';
import { BlockTimeWizard } from './BlockTimeWizard';
import { motion } from 'framer-motion';
import { useDraftResume } from '@/hooks/useDraftResume';
import { DraftResumeBar } from '@/components/ui/DraftResumeBar';

interface DriverCalendarProps {
  driverId: Id<'drivers'>;
  organizationId: Id<'organizations'>;
  userId?: Id<'users'>;
  role?: 'admin' | 'driver';
}

interface ScheduleItem {
  _id: Id<'driverSchedules'>;
  type: string;
  status: string;
  startTime: number;
  endTime: number;
  tripInfo?: {
    from?: string;
    to?: string;
    purpose?: string;
  };
  reason?: string;
  userName?: string;
}

// Trip Card Component
function TripCard({
  item,
  onUpdateStatus,
  onOpenDetails,
  role,
}: {
  item: ScheduleItem;
  onUpdateStatus: (
    id: Id<'driverSchedules'>,
    status: 'in_progress' | 'completed' | 'cancelled',
  ) => void;
  onOpenDetails?: (item: ScheduleItem) => void;
  role?: 'admin' | 'driver';
}) {
  const { t, i18n } = useTranslation();
  const dfLocale = i18n.language === 'ru' ? ru : i18n.language === 'hy' ? hy : enUS;
  const startTime = format(new Date(item.startTime), 'HH:mm', { locale: dfLocale });
  const endTime = format(new Date(item.endTime), 'HH:mm', { locale: dfLocale });

  const isTimeOff = item.type === 'time_off';
  const isBlocked = item.type === 'blocked';
  const isMaintenance = item.type === 'maintenance';

  const getStatusConfig = () => {
    if (isTimeOff)
      return {
        bg: 'bg-(--badge-purple-bg)',
        border: 'border-(--badge-purple-border)/30',
        accent: 'bg-(--purple)',
        dot: 'bg-(--purple)',
        text: 'text-(--badge-purple-text)',
        textMuted: 'text-(--badge-purple-text)/70',
        btnBg: 'bg-(--purple) hover:bg-(--purple)/90',
        btnText: 'text-white',
      };
    if (isBlocked)
      return {
        bg: 'bg-(--badge-secondary-bg)',
        border: 'border-(--badge-secondary-border)/30',
        accent: 'bg-(--text-muted)',
        dot: 'bg-(--text-muted)',
        text: 'text-(--badge-secondary-text)',
        textMuted: 'text-(--badge-secondary-text)/70',
        btnBg: 'bg-(--text-muted) hover:bg-(--text-muted)/90',
        btnText: 'text-white',
      };
    if (isMaintenance)
      return {
        bg: 'bg-(--badge-warning-bg)',
        border: 'border-(--badge-warning-border)/30',
        accent: 'bg-(--warning)',
        dot: 'bg-(--warning)',
        text: 'text-(--badge-warning-text)',
        textMuted: 'text-(--badge-warning-text)/70',
        btnBg: 'bg-(--warning) hover:bg-(--warning)/90',
        btnText: 'text-white',
      };
    switch (item.status) {
      case 'completed':
        return {
          bg: 'bg-(--badge-success-bg)',
          border: 'border-(--badge-success-border)/30',
          accent: 'bg-(--success)',
          dot: 'bg-(--success)',
          text: 'text-(--badge-success-text)',
          textMuted: 'text-(--badge-success-text)/70',
          btnBg: 'bg-(--success) hover:bg-(--success)/90',
          btnText: 'text-white',
        };
      case 'in_progress':
        return {
          bg: 'bg-(--badge-primary-bg)',
          border: 'border-(--badge-primary-border)/30',
          accent: 'bg-(--primary)',
          dot: 'bg-(--primary)',
          text: 'text-(--badge-primary-text)',
          textMuted: 'text-(--badge-primary-text)/70',
          btnBg: 'bg-(--primary) hover:bg-(--primary)/90',
          btnText: 'text-white',
        };
      case 'cancelled':
        return {
          bg: 'bg-(--badge-danger-bg)',
          border: 'border-(--badge-danger-border)/30',
          accent: 'bg-(--destructive)',
          dot: 'bg-(--destructive)',
          text: 'text-(--badge-danger-text)',
          textMuted: 'text-(--badge-danger-text)/70',
          btnBg: 'bg-(--destructive) hover:bg-(--destructive)/90',
          btnText: 'text-white',
        };
      default:
        return {
          bg: 'bg-(--badge-secondary-bg)',
          border: 'border-(--badge-secondary-border)/30',
          accent: 'bg-(--text-muted)',
          dot: 'bg-(--text-muted)',
          text: 'text-(--badge-secondary-text)',
          textMuted: 'text-(--badge-secondary-text)/70',
          btnBg: 'bg-(--primary) hover:bg-(--primary)/90',
          btnText: 'text-white',
        };
    }
  };

  const config = getStatusConfig();

  const getTypeLabel = () => {
    if (isTimeOff) return t('driverCalendar.timeOff');
    if (isBlocked) return t('driverCalendar.blocked');
    if (isMaintenance) return t('driverCalendar.maintenance');
    return t('driverCalendar.trip');
  };

  const routeText =
    item.type === 'trip' && item.tripInfo
      ? `${item.tripInfo.from ?? ''} → ${item.tripInfo.to ?? ''}`
      : '';

  return (
    <div
      className={`group relative rounded-lg border ${config.border} ${config.bg} transition-all duration-200 hover:shadow-sm cursor-pointer`}
      onClick={() => onOpenDetails?.(item)}
    >
      {/* Left accent bar */}
      <div className={`absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full ${config.accent}`} />

      <div className="p-2 pl-3">
        {/* Time & Status */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1">
            <Clock className={`w-2.5 h-2.5 sm:w-3 sm:h-3 ${config.textMuted}`} />
            <span className={`text-[10px] sm:text-xs font-semibold ${config.text}`}>
              {startTime}
            </span>
            <span className="text-[8px] sm:text-[10px] text-muted-foreground/50">{endTime}</span>
          </div>
          <div className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${config.dot}`} />
        </div>

        {/* Route - single line, truncated */}
        {item.type === 'trip' && item.tripInfo ? (
          <div className="mb-1.5">
            <p className="text-[9px] sm:text-[11px] font-medium text-foreground truncate leading-tight">
              {routeText}
            </p>
            {item.tripInfo.purpose && (
              <p className="text-[8px] sm:text-[10px] text-muted-foreground truncate mt-0.5">
                {item.tripInfo.purpose}
              </p>
            )}
          </div>
        ) : (
          <p className="text-[9px] sm:text-[11px] text-muted-foreground truncate">
            {item.reason || getTypeLabel()}
          </p>
        )}

        {/* Action Button */}
        {item.type === 'trip' && item.status === 'scheduled' && role !== 'admin' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUpdateStatus(item._id, 'in_progress');
            }}
            className={`w-full mt-1 py-1.5 text-[9px] sm:text-[10px] font-semibold rounded-md ${config.btnBg} ${config.btnText} transition-colors flex items-center justify-center gap-1`}
          >
            <Play className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
            {t('driverCalendar.startTrip', 'Start')}
          </button>
        )}
        {item.type === 'trip' && item.status === 'in_progress' && role !== 'admin' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUpdateStatus(item._id, 'completed');
            }}
            className="w-full mt-1 py-1.5 text-[9px] sm:text-[10px] font-semibold rounded-md bg-(--success-solid) hover:opacity-90 text-white transition-colors flex items-center justify-center gap-1"
          >
            <CheckCircle2 className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
            {t('driverCalendar.completeTrip', 'Complete')}
          </button>
        )}
      </div>
    </div>
  );
}

export function DriverCalendar({ driverId, organizationId, userId, role }: DriverCalendarProps) {
  const { t, i18n } = useTranslation();
  const mainRef = useMainRef();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<ScheduleItem | null>(null);
  const [showTripModal, setShowTripModal] = useState(false);
  const blockDraft = useDraftResume('driver-block-time', !showBlockModal);
  const now = useNow();

  const dateFnsLocale = i18n.language === 'ru' ? ru : i18n.language === 'hy' ? hy : enUS;

  // Get current week
  const weekStart = useMemo(() => {
    const d = startOfWeek(selectedDate, { weekStartsOn: 1 });
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [selectedDate]);

  const weekEnd = useMemo(() => weekStart + 7 * 24 * 60 * 60 * 1000 - 1, [weekStart]);

  // Get schedule for the week
  const schedule = useQuery(
    api.drivers.queries.getDriverSchedule,
    driverId ? ({ driverId, startTime: weekStart, endTime: weekEnd } as const) : 'skip',
  );

  // Mutations
  const updateTripStatus = useMutation(
    api.drivers.driver_operations.updateTripStatus as FunctionReference<'mutation'>,
  );

  const handleUpdateTripStatus = async (
    scheduleId: Id<'driverSchedules'>,
    status: 'in_progress' | 'completed' | 'cancelled',
  ) => {
    if (!userId) {
      toast.error(t('driverCalendar.userIdRequired', 'User ID is required'));
      return;
    }
    try {
      await updateTripStatus({ scheduleId, userId, status });
      toast.success(
        t('driverCalendar.tripStatusUpdated', 'Trip status updated to {{status}}', { status }),
      );
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('driverCalendar.failedToUpdateStatus', 'Failed to update status'),
      );
    }
  };

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) =>
      addDays(startOfWeek(selectedDate, { weekStartsOn: 1 }), i),
    );
  }, [selectedDate]);

  const getScheduleForDay = (date: Date): ScheduleItem[] => {
    return (
      (schedule as ScheduleItem[])?.filter((s: ScheduleItem) =>
        isSameDay(new Date(s.startTime), date),
      ) || []
    );
  };

  // Mobile day view
  const [mobileViewDay, setMobileViewDay] = useState<number>(0);

  return (
    <div className="space-y-3 sm:space-y-4 p-2 sm:p-3 md:p-4 lg:p-6">
      {/* Calendar Header - Modern Design */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center bg-muted/50 rounded-xl p-1 gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg hover:bg-background"
              onClick={() => setSelectedDate(addDays(selectedDate, -7))}
              aria-label={t('driverCalendar.previousWeek', 'Previous week')}
            >
              <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 sm:h-9 px-2 sm:px-3 rounded-lg text-[11px] sm:text-xs font-medium hover:bg-background"
              onClick={() => {
                setSelectedDate(new Date());
                setMobileViewDay(0);
              }}
            >
              {t('driverCalendar.today', 'Today')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg hover:bg-background"
              onClick={() => setSelectedDate(addDays(selectedDate, 7))}
              aria-label={t('driverCalendar.nextWeek', 'Next week')}
            >
              <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </div>
          <div className="hidden sm:block">
            <h3 className="text-xs sm:text-sm font-semibold text-white">
              {format(weekStart, 'MMM d', { locale: dateFnsLocale })} —{' '}
              {format(new Date(weekEnd), 'MMM d, yyyy', { locale: dateFnsLocale })}
            </h3>
          </div>
        </div>
        {role === 'driver' && (
          <Button
            onClick={() => {
              const mainEl = mainRef.current;
              if (mainEl) {
                mainEl.scrollTo({ top: 0, behavior: 'smooth' });
              }
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setShowBlockModal(true);
            }}
            className="w-full sm:w-auto gap-2 rounded-xl bg-linear-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-sm hover:shadow-md transition-all text-xs sm:text-sm"
          >
            <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            {t('driverCalendar.blockTime', 'Block Time')}
          </Button>
        )}
      </div>

      {/* Week Range for Mobile */}
      <div className="sm:hidden text-center">
        <p className="text-xs sm:text-sm font-semibold text-white">
          {format(weekStart, 'MMM d', { locale: dateFnsLocale })} —{' '}
          {format(new Date(weekEnd), 'MMM d, yyyy', { locale: dateFnsLocale })}
        </p>
      </div>

      {/* Desktop Week View - Hidden on mobile */}
      <div className="hidden sm:block">
        <div className="grid grid-cols-7 gap-2 lg:gap-3">
          {weekDays.map((day) => {
            const daySchedule = getScheduleForDay(day);
            const today = isToday(day);

            return (
              <div
                key={day.toISOString()}
                className={`rounded-xl lg:rounded-2xl border transition-all duration-200 ${
                  today
                    ? 'border-primary/40 bg-linear-to-b from-primary/5 to-transparent shadow-lg shadow-primary/5'
                    : 'border-border/50 bg-card/50 hover:border-border'
                }`}
              >
                {/* Day Header */}
                <div className="p-2 lg:p-3 pb-1.5 lg:pb-2 border-b border-border/30">
                  <div className="text-center">
                    <div
                      className={`text-[9px] lg:text-[11px] font-semibold uppercase tracking-wider ${
                        today ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      {format(day, 'EEE', { locale: dateFnsLocale })}
                    </div>
                    <div
                      className={`text-lg lg:text-2xl font-bold mt-0.5 lg:mt-1 ${
                        today ? 'text-primary' : 'text-foreground'
                      }`}
                    >
                      {format(day, 'd')}
                    </div>
                  </div>
                </div>

                {/* Schedule Items */}
                <div className="p-1.5 lg:p-2 space-y-1.5 lg:space-y-2 max-h-64 lg:max-h-80 overflow-y-auto scrollbar-thin">
                  {daySchedule.length > 0 ? (
                    daySchedule
                      .sort((a: ScheduleItem, b: ScheduleItem) => a.startTime - b.startTime)
                      .map((s: ScheduleItem) => (
                        <TripCard
                          key={s._id}
                          item={s}
                          onUpdateStatus={handleUpdateTripStatus}
                          onOpenDetails={(item) => {
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                            const mainEl = mainRef.current;
                            if (mainEl) {
                              mainEl.scrollTo({ top: 0, behavior: 'smooth' });
                            }
                            setSelectedTrip(item);
                            setShowTripModal(true);
                          }}
                          role={role}
                        />
                      ))
                  ) : (
                    <div className="text-center py-6 lg:py-8">
                      <CalendarIcon className="w-6 h-6 lg:w-8 lg:h-8 mx-auto mb-1.5 lg:mb-2 text-muted-foreground/30" />
                      <span className="text-[9px] lg:text-[11px] text-muted-foreground">
                        {t('driverCalendar.noTrips')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile Day View - Horizontal Scroll */}
      <div className="sm:hidden">
        <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
          {/* Day Selector */}
          <div className="p-2 pb-1.5 border-b border-border/30">
            <ScrollArea className="w-full">
              <div className="flex gap-1.5 pb-1.5">
                {weekDays.map((day, index) => {
                  const today = isToday(day);
                  const isSelected = index === mobileViewDay;
                  const daySchedule = getScheduleForDay(day);

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setMobileViewDay(index)}
                      className={`flex flex-col items-center justify-center min-w-12 p-2 rounded-xl transition-all duration-200 ${
                        isSelected
                          ? today
                            ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                            : 'bg-muted text-foreground shadow-sm'
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <span
                        className={`text-[9px] font-semibold uppercase ${
                          isSelected ? 'opacity-80' : 'text-muted-foreground'
                        }`}
                      >
                        {format(day, 'EEE', { locale: dateFnsLocale })}
                      </span>
                      <span
                        className={`text-lg font-bold mt-0.5 ${
                          isSelected ? '' : today ? 'text-primary' : ''
                        }`}
                      >
                        {format(day, 'd', { locale: dateFnsLocale })}
                      </span>
                      {daySchedule.length > 0 && (
                        <div
                          className={`w-1 h-1 rounded-full mt-1 ${
                            isSelected
                              ? 'bg-primary-foreground'
                              : today
                                ? 'bg-primary'
                                : 'bg-primary/60'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>

          {/* Schedule Content */}
          <div className="p-2 space-y-2 max-h-80 overflow-y-auto">
            {weekDays[mobileViewDay] && getScheduleForDay(weekDays[mobileViewDay]).length > 0 ? (
              getScheduleForDay(weekDays[mobileViewDay])
                .sort((a: ScheduleItem, b: ScheduleItem) => a.startTime - b.startTime)
                .map((s: ScheduleItem) => (
                  <TripCard
                    key={s._id}
                    item={s}
                    onUpdateStatus={handleUpdateTripStatus}
                    onOpenDetails={(item) => {
                      const mainEl = mainRef.current;
                      if (mainEl) {
                        mainEl.scrollTo({ top: 0, behavior: 'smooth' });
                      } else {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                      setSelectedTrip(item);
                      setShowTripModal(true);
                    }}
                    role={role}
                  />
                ))
            ) : (
              <div className="text-center py-8">
                <CalendarIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground/20" />
                <p className="text-xs font-medium text-foreground">
                  {t('driverCalendar.noTripsScheduled')}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {format(weekDays[mobileViewDay] ?? new Date(), 'EEEE, MMM d', {
                    locale: dateFnsLocale,
                  })}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Legend - Modern Design */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 p-2.5 sm:p-4 rounded-xl bg-muted/30 border border-border/30">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
          <span className="text-[10px] sm:text-xs text-muted-foreground">
            {t('driverCalendar.completed')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" />
          <span className="text-[10px] sm:text-xs text-muted-foreground">
            {t('driverCalendar.inProgress')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-slate-400 shadow-sm shadow-slate-400/50" />
          <span className="text-[10px] sm:text-xs text-muted-foreground">
            {t('driverCalendar.scheduled')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-purple-500 shadow-sm shadow-purple-500/50" />
          <span className="text-[10px] sm:text-xs text-muted-foreground">
            {t('driverCalendar.timeOff')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-orange-500 shadow-sm shadow-orange-500/50" />
          <span className="text-[10px] sm:text-xs text-muted-foreground">
            {t('driverCalendar.maintenance')}
          </span>
        </div>
      </div>

      {showBlockModal &&
        createPortal(
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm pointer-events-auto"
            onClick={() => setShowBlockModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-4xl max-h-[95vh] overflow-y-auto bg-(--card) rounded-xl sm:rounded-2xl border border-(--border) shadow-2xl pointer-events-auto"
            >
              <BlockTimeWizard
                driverId={driverId}
                organizationId={organizationId}
                onComplete={() => setShowBlockModal(false)}
                onCancel={() => setShowBlockModal(false)}
              />
            </motion.div>
          </motion.div>,
          document.body,
        )}

      {/* Trip Details Modal - Rendered via Portal outside Dialog */}
      {showTripModal &&
        selectedTrip &&
        createPortal(
          <div
            className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md"
            style={{ pointerEvents: 'auto' }}
            onClick={() => {
              setShowTripModal(false);
              setSelectedTrip(null);
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl h-[85vh]"
              style={{ pointerEvents: 'auto' }}
            >
              <TripDetailsModal
                schedule={selectedTrip}
                currentTime={now}
                onClose={() => {
                  setShowTripModal(false);
                  setSelectedTrip(null);
                }}
                userId={userId!}
                isAdmin={role === 'admin'}
              />
            </div>
          </div>,
          document.body,
        )}

      {/* "Draft saved. Restore?" — the block-time wizard keeps its contents
          after an accidental close; this is what tells the user so. */}
      <DraftResumeBar
        show={blockDraft.available}
        label={t('driver.blockTime', 'Block Time')}
        step={blockDraft.step}
        onResume={() => {
          blockDraft.dismiss();
          setShowBlockModal(true);
        }}
        onDismiss={blockDraft.dismiss}
        onDiscard={blockDraft.discard}
      />
    </div>
  );
}
