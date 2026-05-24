'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useMainRef } from '@/hooks/useMainRef';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  CheckCircle,
  XCircle,
  Users,
  Plus,
  ExternalLink,
  Car,
} from 'lucide-react';
import {
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isToday,
  Locale,
} from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import {
  LEAVE_TYPE_LABELS,
  LEAVE_TYPE_COLORS,
  getLeaveTypeLabel,
  type LeaveType,
  type LeaveStatus,
} from '@/lib/types';
import { useAuthStore } from '@/store/useAuthStore';
import { LeaveRequestModal } from '@/components/leaves/LeaveRequestModal';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { DriverRequestModal } from './DriverRequestModal';
import { CreateEventModal } from './CreateEventModal';
import { getInitials } from '@/lib/stringUtils';
import { logger } from '@/lib/logger';

type LeaveRequest = {
  _id: string;
  userId: string;
  userName?: string;
  userDepartment?: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: string;
  comment?: string;
};

type DriverScheduleEvent = {
  _id: string;
  driverId: string;
  driverName: string;
  driverVehicle?: {
    model: string;
    plateNumber: string;
    capacity: number;
    color?: string;
    year?: number;
  };
  bookedByName?: string;
  startTime: number;
  endTime: number;
  type: 'trip' | 'blocked' | 'maintenance';
  status: string;
  tripInfo?: { from: string; to: string; purpose: string; passengerCount: number; notes?: string };
  reason?: string;
};

type GoogleCalendarEvent = {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string;
  htmlLink: string;
};

// --- Helpers ------------------------------------------------------------------
function safeDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function safeFormat(dateStr: string | undefined | null, fmt: string): string {
  const d = safeDate(dateStr);
  if (!d) return '';
  const lang = i18n.language || 'en';
  const dfLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;
  try {
    return format(d, fmt, { locale: dfLocale });
  } catch {
    return '';
  }
}

function getDateRange(start: string, end: string): Date[] {
  const dates: Date[] = [];
  const s = safeDate(start);
  const e = safeDate(end);
  if (!s || !e) return dates;
  const cur = new Date(s);
  while (cur <= e) {
    dates.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function StatusIcon({ status }: { status: LeaveStatus }) {
  if (status === 'approved') return <CheckCircle className="w-3 h-3 text-emerald-500" />;
  if (status === 'rejected') return <XCircle className="w-3 h-3 text-red-500" />;
  return <Clock className="w-3 h-3 text-amber-500" />;
}

const LEAVE_TYPE_BG: Record<string, string> = {
  paid: '#2563eb',
  unpaid: '#f59e0b',
  sick: '#ef4444',
  family: '#10b981',
  doctor: '#06b6d4',
};

// Days of week will be translated using i18n

// --- Calendar Day Cell ---------------------------------------------------------
const GOOGLE_EVENT_COLOR = '#8b5cf6';
const DRIVER_EVENT_COLOR = '#f97316'; // orange for driver bookings

function DayCell({
  date,
  currentMonth,
  selected,
  leaves,
  googleEvents,
  driverEvents,
  onClick,
}: {
  date: Date;
  currentMonth: Date;
  selected: Date | null;
  leaves: LeaveRequest[];
  googleEvents: GoogleCalendarEvent[];
  driverEvents: DriverScheduleEvent[];
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const isCurrentMonth = isSameMonth(date, currentMonth);
  const isTodayDate = isToday(date);
  const isSelected = selected ? isSameDay(date, selected) : false;
  const hasLeaves = leaves.length > 0 && isCurrentMonth;
  const hasGoogle = googleEvents.length > 0 && isCurrentMonth;
  const hasDriver = driverEvents.length > 0 && isCurrentMonth;
  const totalItems = leaves.length + googleEvents.length + driverEvents.length;

  return (
    <button
      onClick={onClick}
      className={[
        'relative w-full min-h-10 sm:min-h-22.5 rounded-xl p-1.5 text-left transition-all duration-200 border',
        isSelected
          ? 'btn-gradient border-(--primary) text-white shadow-lg shadow-(--primary)/20'
          : isTodayDate
            ? 'bg-(--primary)/10 border-(--primary)/40'
            : isCurrentMonth
              ? 'bg-(--card) border-(--border) hover:border-(--primary)/50 hover:bg-(--background-subtle)'
              : 'bg-transparent border-transparent opacity-40',
      ].join(' ')}
    >
      {/* Day number */}
      <span
        className={[
          'text-xs font-semibold leading-none block mb-1',
          isSelected
            ? 'text-white'
            : isTodayDate
              ? 'text-(--primary) font-bold'
              : isCurrentMonth
                ? 'text-(--text-primary)'
                : 'text-(--text-muted)',
        ].join(' ')}
      >
        {isTodayDate && !isSelected && (
          <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-(--primary)" />
        )}
        {date.getDate()}
      </span>

      {/* Event pills */}
      {(hasLeaves || hasGoogle || hasDriver) && (
        <div className="flex flex-col gap-0.5 mt-0.5">
          {/* Leave pills */}
          {leaves.slice(0, hasGoogle || hasDriver ? 1 : 2).map((l, i) => (
            <div
              key={`l-${i}`}
              className="flex items-center gap-1 rounded-full px-1.5 py-0.5"
              style={{
                background: isSelected ? 'rgba(255,255,255,0.2)' : `${LEAVE_TYPE_BG[l.type]}22`,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: isSelected ? '#fff' : LEAVE_TYPE_BG[l.type] }}
              />
              <span
                className="text-[9px] font-medium truncate hidden sm:block"
                style={{ color: isSelected ? '#fff' : LEAVE_TYPE_BG[l.type] }}
              >
                {(l.userName ?? t('calendar.unknown')).split(' ')[0]}
              </span>
            </div>
          ))}
          {/* Driver booking pills */}
          {driverEvents.slice(0, 1).map((evt, i) => (
            <div
              key={`d-${i}`}
              className="flex items-center gap-1 rounded-full px-1.5 py-0.5"
              style={{
                background: isSelected ? 'rgba(255,255,255,0.2)' : `${DRIVER_EVENT_COLOR}22`,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: isSelected ? '#fff' : DRIVER_EVENT_COLOR }}
              />
              <span
                className="text-[9px] font-medium truncate hidden sm:block"
                style={{ color: isSelected ? '#fff' : DRIVER_EVENT_COLOR }}
              >
                {evt.driverName.split(' ')[0]}
              </span>
            </div>
          ))}
          {/* Google Calendar pills */}
          {googleEvents.slice(0, hasLeaves || hasDriver ? 1 : 2).map((evt, i) => (
            <div
              key={`g-${i}`}
              className="flex items-center gap-1 rounded-full px-1.5 py-0.5"
              style={{
                background: isSelected ? 'rgba(255,255,255,0.2)' : `${GOOGLE_EVENT_COLOR}22`,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: isSelected ? '#fff' : GOOGLE_EVENT_COLOR }}
              />
              <span
                className="text-[9px] font-medium truncate hidden sm:block"
                style={{ color: isSelected ? '#fff' : GOOGLE_EVENT_COLOR }}
              >
                {evt.title}
              </span>
            </div>
          ))}
          {totalItems > 2 && (
            <span
              className={`text-[9px] pl-1 ${isSelected ? 'text-white/80' : 'text-(--text-muted)'}`}
            >
              +{totalItems - 2} more
            </span>
          )}
        </div>
      )}
    </button>
  );
}

// --- Main Component ------------------------------------------------------------
export const CalendarClient = React.memo(function CalendarClient() {
  const { t } = useTranslation();
  const mainRef = useMainRef();
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());
  const [mounted, setMounted] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [selectedDriverEvent, setSelectedDriverEvent] = useState<DriverScheduleEvent | null>(null);
  const [selectedGoogleEvent, setSelectedGoogleEvent] = useState<GoogleCalendarEvent | null>(null);
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const lang = i18n.language || 'en';
  const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;

  const DAYS_OF_WEEK = [
    t('weekdays.sun'),
    t('weekdays.mon'),
    t('weekdays.tue'),
    t('weekdays.wed'),
    t('weekdays.thu'),
    t('weekdays.fri'),
    t('weekdays.sat'),
  ];

  // Google Calendar events
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [googleConnected, setGoogleConnected] = useState(false);

  const fetchGoogleEvents = useCallback(async (month: Date) => {
    try {
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const timeMin = start.toISOString();
      const timeMax = end.toISOString();
      const res = await fetch(`/api/calendar/google/events?timeMin=${timeMin}&timeMax=${timeMax}`);
      const data = await res.json();
      setGoogleConnected(data.connected ?? false);
      setGoogleEvents(data.events ?? []);
    } catch {
      setGoogleEvents([]);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    logger.log('📅 CalendarClient mounted');
    fetchGoogleEvents(currentMonth);
  }, [currentMonth, fetchGoogleEvents]);

  // Block main scroll when any modal is open and scroll to top
  useEffect(() => {
    const anyModalOpen =
      selectedLeave ||
      selectedDriverEvent ||
      selectedGoogleEvent ||
      showLeaveModal ||
      showDriverModal ||
      showCreateEvent;
    const mainEl = mainRef.current;
    const scrollY = mainEl ? mainEl.scrollTop : window.scrollY;

    if (anyModalOpen) {
      document.body.style.overflow = 'hidden';
      if (mainEl) {
        mainEl.style.overflow = 'hidden';
        mainEl.style.paddingRight = '0px';
      }

      return () => {
        document.body.style.overflow = '';
        if (mainEl) {
          mainEl.style.overflow = '';
          mainEl.style.paddingRight = '';
          mainEl.scrollTo({ top: scrollY, behavior: 'instant' });
        }
      };
    }
  }, [
    selectedLeave,
    selectedDriverEvent,
    selectedGoogleEvent,
    showLeaveModal,
    showDriverModal,
    showCreateEvent,
    mainRef,
  ]);

  // Debug: Log whenever selectedOrgId changes
  useEffect(() => {
    if (mounted) {
      logger.log('📅 selectedOrgId changed to:', selectedOrgId);
    }
  }, [selectedOrgId, mounted]);

  // Determine which query to use based on selectedOrgId
  const shouldUseOrgQuery = mounted && selectedOrgId && user?.id;
  const queryParams = shouldUseOrgQuery
    ? { organizationId: selectedOrgId as Id<'organizations'> }
    : mounted && user?.id
      ? { requesterId: user.id as Id<'users'> }
      : ('skip' as const);

  // Use organization-specific query if org selected, otherwise use default
  const leavesData = useQuery(
    shouldUseOrgQuery ? api.leaves.getLeavesForOrganization : api.leaves.getAllLeaves,
    mounted && user?.id && queryParams !== 'skip' ? queryParams : 'skip',
  );
  const leaves: LeaveRequest[] = leavesData ?? [];

  // Debug: Log data load
  useEffect(() => {
    if (mounted) {
      logger.log('📅 Leaves loaded:', {
        selectedOrgId,
        count: leaves.length,
        usingOrgQuery: shouldUseOrgQuery,
        mounted,
      });
    }
  }, [leaves.length, selectedOrgId, mounted, shouldUseOrgQuery]);

  // Driver schedule events
  const monthStart = useMemo(() => startOfMonth(currentMonth).getTime(), [currentMonth]);
  const monthEnd = useMemo(() => endOfMonth(currentMonth).getTime(), [currentMonth]);

  const driverSchedules = useQuery(
    api.drivers.queries.getOrgDriverSchedules,
    mounted && selectedOrgId
      ? {
          organizationId: selectedOrgId as Id<'organizations'>,
          startTime: monthStart,
          endTime: monthEnd,
        }
      : 'skip',
  ) as DriverScheduleEvent[] | undefined;

  // Build driver schedule map
  const driverDateMap = useMemo(() => {
    const map = new Map<string, DriverScheduleEvent[]>();
    (driverSchedules ?? []).forEach((evt) => {
      // A schedule can span multiple days
      const startD = new Date(evt.startTime);
      const endD = new Date(evt.endTime);
      const cur = new Date(startD);
      cur.setHours(0, 0, 0, 0);
      while (cur <= endD) {
        const key = format(cur, 'yyyy-MM-dd');
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(evt);
        cur.setDate(cur.getDate() + 1);
      }
    });
    return map;
  }, [driverSchedules]);

  // Build leave map
  const leaveDateMap = useMemo(() => {
    const map = new Map<string, LeaveRequest[]>();
    leaves
      .filter((r) => r.status !== 'rejected')
      .forEach((req) => {
        getDateRange(req.startDate, req.endDate).forEach((d) => {
          const key = format(d, 'yyyy-MM-dd');
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(req);
        });
      });
    return map;
  }, [leaves]);

  // Build Google Calendar events map
  const googleDateMap = useMemo(() => {
    const map = new Map<string, GoogleCalendarEvent[]>();
    googleEvents.forEach((evt) => {
      // For all-day events, Google returns end as exclusive (next day)
      const endDate =
        evt.allDay && evt.endDate
          ? format(addDays(new Date(evt.endDate), -1), 'yyyy-MM-dd')
          : evt.endDate;
      const start = evt.startDate;
      if (!start) return;
      getDateRange(start, endDate || start).forEach((d) => {
        const key = format(d, 'yyyy-MM-dd');
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(evt);
      });
    });
    return map;
  }, [googleEvents]);

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end = endOfWeek(endOfMonth(currentMonth));
    const days: Date[] = [];
    let cur = start;
    while (cur <= end) {
      days.push(cur);
      cur = addDays(cur, 1);
    }
    return days;
  }, [currentMonth]);

  const selectedDayLeaves = useMemo(() => {
    if (!selectedDay) return [];
    return leaveDateMap.get(format(selectedDay, 'yyyy-MM-dd')) ?? [];
  }, [selectedDay, leaveDateMap]);

  const selectedDayGoogle = useMemo(() => {
    if (!selectedDay) return [];
    return googleDateMap.get(format(selectedDay, 'yyyy-MM-dd')) ?? [];
  }, [selectedDay, googleDateMap]);

  const selectedDayDriverEvents = useMemo(() => {
    if (!selectedDay) return [];
    return driverDateMap.get(format(selectedDay, 'yyyy-MM-dd')) ?? [];
  }, [selectedDay, driverDateMap]);

  const prevMonth = () => setCurrentMonth((m) => subMonths(m, 1));
  const nextMonth = () => setCurrentMonth((m) => addMonths(m, 1));
  const goToday = () => {
    const t = new Date();
    setCurrentMonth(t);
    setSelectedDay(t);
  };

  // Monthly summary
  const monthlySummary = useMemo(() => {
    return (Object.keys(LEAVE_TYPE_LABELS) as LeaveType[])
      .map((type) => {
        const count = leaves.filter(
          (r) =>
            r.type === type &&
            r.status !== 'rejected' &&
            (isSameMonth(new Date(r.startDate), currentMonth) ||
              isSameMonth(new Date(r.endDate), currentMonth)),
        ).length;
        return { type, count };
      })
      .filter((s) => s.count > 0);
  }, [leaves, currentMonth]);

  // On leave today
  const onLeaveToday = useMemo(() => {
    if (!mounted) return [];
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return leaves.filter(
      (r) => r.status === 'approved' && r.startDate <= todayStr && r.endDate >= todayStr,
    );
  }, [mounted, leaves]);

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      {/* -- Sticky Header -- */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary)">
              {t('calendarExtended.leaveCalendar')}
            </h2>
            <p className="text-(--text-muted) text-sm mt-1">
              {t('calendarExtended.visualOverview')}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToday} className="w-full sm:w-auto">
              <CalendarDays className="w-4 h-4" />
              {t('buttons.today')}
            </Button>
            <Button
              size="sm"
              onClick={() => setShowLeaveModal(true)}
              className="flex items-center gap-2 w-full sm:w-auto justify-center btn-gradient text-white font-medium shadow-md hover:shadow-lg"
            >
              <Plus className="w-4 h-4" />
              {t('calendar.newLeave')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCreateEvent(true)}
              className="flex items-center gap-2 w-full sm:w-auto justify-center"
            >
              <Plus className="w-4 h-4" />
              {t('createMeeting.title')}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* -- Calendar Panel -- */}
        <div className="xl:col-span-3 space-y-4">
          <Card className="overflow-hidden">
            {/* Month nav */}
            <CardHeader className="pb-0 px-4 pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button size="icon-sm" variant="ghost" onClick={prevMonth}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <motion.h3
                    key={format(currentMonth, 'yyyy-MM')}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-lg font-bold text-(--text-primary) min-w-40 text-center capitalize"
                  >
                    {format(currentMonth, 'MMMM yyyy', { locale: dateFnsLocale })}
                  </motion.h3>
                  <Button size="icon-sm" variant="ghost" onClick={nextMonth}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                {/* Quick month stats */}
                <div className="hidden sm:flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-(--text-muted)">
                      {
                        leaves.filter(
                          (r) =>
                            r.status === 'approved' &&
                            isSameMonth(new Date(r.startDate), currentMonth),
                        ).length
                      }{' '}
                      {t('leave.approved')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span className="text-(--text-muted)">
                      {
                        leaves.filter(
                          (r) =>
                            r.status === 'pending' &&
                            isSameMonth(new Date(r.startDate), currentMonth),
                        ).length
                      }{' '}
                      {t('leave.pending')}
                    </span>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-3 sm:p-4">
              {/* Day-of-week header */}
              <div className="grid grid-cols-7 gap-1.5 mb-3">
                {DAYS_OF_WEEK.map((d) => (
                  <div
                    key={d}
                    className="text-center text-xs font-semibold text-(--text-muted) py-2 border-b border-(--border)"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Day grid */}
              <AnimatePresence mode="wait">
                <div key={format(currentMonth, 'yyyy-MM')} className="grid grid-cols-7 gap-1.5">
                  {calendarDays.map((date, i) => {
                    const key = format(date, 'yyyy-MM-dd');
                    const leaves = leaveDateMap.get(key) ?? [];
                    const gEvents = googleDateMap.get(key) ?? [];
                    const dEvents = driverDateMap.get(key) ?? [];
                    return (
                      <DayCell
                        key={i}
                        date={date}
                        currentMonth={currentMonth}
                        selected={selectedDay}
                        leaves={leaves}
                        googleEvents={gEvents}
                        driverEvents={dEvents}
                        onClick={() => {
                          setSelectedDay(date);
                          setShowCreateEvent(true);
                        }}
                      />
                    );
                  })}
                </div>
              </AnimatePresence>
            </CardContent>
          </Card>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 px-1">
            {(Object.entries(LEAVE_TYPE_COLORS) as [LeaveType, string][]).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-xs text-(--text-muted)">{getLeaveTypeLabel(type, t)}</span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ background: DRIVER_EVENT_COLOR }}
              />
              <span className="text-xs text-(--text-muted)">
                {t('driver.driverBookings', 'Driver Bookings')}
              </span>
            </div>
            {googleConnected && (
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: GOOGLE_EVENT_COLOR }}
                />
                <span className="text-xs text-(--text-muted)">
                  {t('calendar.googleCalendar', 'Google Calendar')}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full border-2 border-(--primary) bg-(--primary)/10 shrink-0" />
              <span className="text-xs text-(--text-muted)">{t('timePeriods.today')}</span>
            </div>
          </div>
        </div>

        {/* -- Side Panel -- */}
        <motion.div
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-4 scrollbar-hide"
        >
          {/* Selected day details */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-(--text-muted)">
                {selectedDay
                  ? format(selectedDay, 'EEEE, MMM d', { locale: dateFnsLocale })
                  : t('calendar.selectADay')}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 scrollbar-hide">
              <AnimatePresence mode="wait">
                {selectedDayLeaves.length === 0 &&
                selectedDayGoogle.length === 0 &&
                selectedDayDriverEvents.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="py-6 text-center overflow-hidden"
                  >
                    <CalendarDays className="w-8 h-8 text-(--border) mx-auto mb-2" />
                    <p className="text-sm text-(--text-muted)">
                      {t('calendarExtended.noLeavesThisDay')}
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="list"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-2 max-h-80 overflow-y-auto scrollbar-hide"
                  >
                    {/* Leave requests */}
                    {selectedDayLeaves.map((leave, i) => (
                      <motion.div
                        key={leave._id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="flex items-start gap-2.5 p-2.5 rounded-lg border border-(--border) bg-(--background-subtle) cursor-pointer hover:border-(--primary)/50 transition-colors"
                        onClick={() => {
                          setSelectedLeave(leave);
                          setTimeout(() => {
                            const mainEl = mainRef.current;
                            if (mainEl) {
                              mainEl.scrollTo({ top: 0, behavior: 'smooth' });
                            }
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }, 100);
                        }}
                      >
                        <Avatar className="w-8 h-8 shrink-0">
                          <AvatarFallback
                            className="text-[10px] font-bold text-white"
                            style={{ background: LEAVE_TYPE_BG[leave.type] }}
                          >
                            {getInitials(leave.userName ?? '?')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs font-semibold text-(--text-primary) truncate">
                              {leave.userName ?? t('common.unknownUser', 'Unknown')}
                            </p>
                            <StatusIcon status={leave.status as LeaveStatus} />
                          </div>
                          <p className="text-[10px] text-(--text-muted) mt-0.5">
                            {leave.userDepartment ?? ''}
                          </p>
                          <div className="flex items-center gap-1 mt-1">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ background: LEAVE_TYPE_BG[leave.type] }}
                            />
                            <span className="text-[10px] text-(--text-secondary)">
                              {getLeaveTypeLabel(leave.type as LeaveType, t)}
                            </span>
                          </div>
                          <p className="text-[10px] text-(--text-muted) mt-0.5">
                            {safeFormat(leave.startDate, 'MMM d')} &ndash;{' '}
                            {safeFormat(leave.endDate, 'MMM d')} &middot; {leave.days}d
                          </p>
                          {leave.comment && (
                            <p className="text-[10px] text-(--text-muted) mt-1 italic line-clamp-2">
                              &quot;{leave.comment}&quot;
                            </p>
                          )}
                        </div>
                      </motion.div>
                    ))}

                    {/* Google Calendar events */}
                    {selectedDayGoogle.map((evt, i) => (
                      <motion.div
                        key={evt.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: (selectedDayLeaves.length + i) * 0.04 }}
                        className="flex items-start gap-2.5 p-2.5 rounded-lg border border-(--border) bg-(--background-subtle) cursor-pointer hover:border-(--primary)/50 transition-colors"
                        onClick={() => {
                          setSelectedGoogleEvent(evt);
                          setTimeout(() => {
                            const mainEl = mainRef.current;
                            if (mainEl) {
                              mainEl.scrollTo({ top: 0, behavior: 'smooth' });
                            }
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }, 100);
                        }}
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold text-white"
                          style={{ background: GOOGLE_EVENT_COLOR }}
                        >
                          G
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs font-semibold text-(--text-primary) truncate">
                              {evt.title}
                            </p>
                            {evt.htmlLink && (
                              <a
                                href={evt.htmlLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-(--text-muted) hover:text-(--primary) shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                          {evt.startTime && (
                            <p className="text-[10px] text-(--text-muted) mt-0.5">
                              {format(new Date(evt.startTime), 'HH:mm', { locale: dateFnsLocale })}
                              {evt.endTime &&
                                ` – ${format(new Date(evt.endTime), 'HH:mm', { locale: dateFnsLocale })}`}
                            </p>
                          )}
                          {!evt.startTime && (
                            <p className="text-[10px] text-(--text-muted) mt-0.5">
                              {t('calendar.allDay', 'All day')}
                            </p>
                          )}
                          {evt.location && (
                            <p className="text-[10px] text-(--text-muted) mt-0.5 truncate">
                              📍 {evt.location}
                            </p>
                          )}
                          <div className="flex items-center gap-1 mt-1">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ background: GOOGLE_EVENT_COLOR }}
                            />
                            <span className="text-[10px] text-(--text-secondary)">
                              {t('calendar.googleCalendar', 'Google Calendar')}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    ))}

                    {/* Driver booking events */}
                    {selectedDayDriverEvents.map((evt, i) => (
                      <motion.div
                        key={evt._id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          delay: (selectedDayLeaves.length + selectedDayGoogle.length + i) * 0.04,
                        }}
                        className="flex items-start gap-2.5 p-2.5 rounded-lg border border-(--border) bg-(--background-subtle) cursor-pointer hover:border-(--primary)/50 transition-colors"
                        onClick={() => {
                          setSelectedDriverEvent(evt);
                          setTimeout(() => {
                            const mainEl = mainRef.current;
                            if (mainEl) {
                              mainEl.scrollTo({ top: 0, behavior: 'smooth' });
                            }
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }, 100);
                        }}
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold text-white"
                          style={{ background: DRIVER_EVENT_COLOR }}
                        >
                          <Car className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs font-semibold text-(--text-primary) truncate">
                              {evt.driverName}
                            </p>
                            <Badge variant="secondary" className="text-[9px] h-4 px-1.5 shrink-0">
                              {t(`driver.${evt.type}`, { ns: 'drivers', defaultValue: evt.type })}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-(--text-muted) mt-0.5">
                            {format(new Date(evt.startTime), 'HH:mm', { locale: dateFnsLocale })} –{' '}
                            {format(new Date(evt.endTime), 'HH:mm', { locale: dateFnsLocale })}
                          </p>
                          {evt.tripInfo && (
                            <p className="text-[10px] text-(--text-muted) mt-0.5 truncate">
                              {evt.tripInfo.from} → {evt.tripInfo.to}
                            </p>
                          )}
                          <div className="flex items-center gap-1 mt-1">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ background: DRIVER_EVENT_COLOR }}
                            />
                            <span className="text-[10px] text-(--text-secondary)">
                              {t('driver.driverBookings', 'Driver Booking')}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>

          {/* Monthly summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-(--text-muted)">
                {format(currentMonth, 'MMMM', { locale: dateFnsLocale })} {t('calendar.summary')}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {monthlySummary.length === 0 ? (
                <p className="text-xs text-(--text-muted)">
                  {t('calendarExtended.noLeavesThisMonth')}
                </p>
              ) : (
                monthlySummary.map(({ type, count }) => (
                  <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ background: LEAVE_TYPE_BG[type] }}
                      />
                      <span className="text-xs text-(--text-secondary)">
                        {getLeaveTypeLabel(type, t)}
                      </span>
                    </div>
                    <Badge variant="secondary" className="text-xs h-5 px-2">
                      {count}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* On leave today */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm uppercase tracking-wider text-(--text-muted)">
                  {t('calendar.onLeaveToday')}
                </CardTitle>
                {onLeaveToday.length > 0 && (
                  <Badge variant="warning" className="text-[10px] h-5 px-2">
                    {onLeaveToday.length}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {onLeaveToday.length === 0 ? (
                <div className="flex items-center gap-2 py-2">
                  <Users className="w-4 h-4 text-(--border)" />
                  <p className="text-xs text-(--text-muted)">
                    {t('calendarExtended.everyoneInToday')}
                  </p>
                </div>
              ) : (
                onLeaveToday.map((l) => (
                  <div key={l._id} className="flex items-center gap-2.5">
                    <Avatar className="w-7 h-7 shrink-0">
                      <AvatarFallback
                        className="text-[9px] font-bold text-white"
                        style={{ background: LEAVE_TYPE_BG[l.type] }}
                      >
                        {getInitials(l.userName ?? '?')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-(--text-primary) truncate">
                        {l.userName ?? t('common.unknownUser', 'Unknown')}
                      </p>
                      <p className="text-[10px] text-(--text-muted)">
                        {getLeaveTypeLabel(l.type as LeaveType, t)}
                      </p>
                    </div>
                    <Badge className="ml-auto text-[9px] h-4 px-1.5 shrink-0" variant="success">
                      {t('calendarExtended.away')}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Leave Request Modal */}
      <LeaveRequestModal
        open={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        preselectedStartDate={selectedDay ? format(selectedDay, 'yyyy-MM-dd') : undefined}
      />

      {/* Driver Request Modal */}
      <DriverRequestModal
        open={showDriverModal}
        onOpenChange={setShowDriverModal}
        selectedDate={selectedDay ?? undefined}
      />

      {/* Create Event Modal */}
      <CreateEventModal
        open={showCreateEvent}
        onOpenChange={setShowCreateEvent}
        selectedDate={selectedDay}
        leaves={leaves}
      />

      {/* Modals rendered via portal to escape overflow/contain constraints */}
      {typeof document !== 'undefined' &&
        createPortal(
          <>
            {/* Leave Event Detail Modal - Modern Design */}
            <AnimatePresence>
              {selectedLeave && (
                <div className="fixed inset-0 lg:left-60 lg:top-16 z-50 flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-md"
                    onClick={() => setSelectedLeave(null)}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 30 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 30 }}
                    transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                    className="relative z-10 w-full max-w-lg bg-(--card) rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Hero Header */}
                    <div className="relative px-6 pt-6 pb-8 overflow-hidden shrink-0">
                      <div
                        className="absolute inset-0 opacity-15"
                        style={{
                          background: `linear-gradient(135deg, ${LEAVE_TYPE_BG[selectedLeave.type]} 0%, transparent 70%)`,
                        }}
                      />
                      <div
                        className="absolute top-0 right-0 w-40 h-40 rounded-full -mr-20 -mt-20 opacity-10 blur-3xl"
                        style={{ background: LEAVE_TYPE_BG[selectedLeave.type] }}
                      />

                      <div className="relative flex items-start justify-between">
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <div
                              className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg"
                              style={{
                                background: `linear-gradient(135deg, ${LEAVE_TYPE_BG[selectedLeave.type]}, ${LEAVE_TYPE_BG[selectedLeave.type]}dd)`,
                              }}
                            >
                              {getInitials(selectedLeave.userName ?? '?')}
                            </div>
                            <div
                              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-(--card) flex items-center justify-center"
                              style={{ background: LEAVE_TYPE_BG[selectedLeave.type] }}
                            >
                              {selectedLeave.status === 'approved' ? (
                                <CheckCircle className="w-3.5 h-3.5 text-white" />
                              ) : selectedLeave.status === 'rejected' ? (
                                <XCircle className="w-3.5 h-3.5 text-white" />
                              ) : (
                                <Clock className="w-3.5 h-3.5 text-white" />
                              )}
                            </div>
                          </div>
                          <div>
                            <h3 className="text-2xl font-bold leading-tight drop-shadow-md">
                              {selectedLeave.userName ?? t('common.unknownUser', 'Unknown')}
                            </h3>
                            <p className="text-sm mt-0.5 drop-shadow">
                              {selectedLeave.userDepartment ?? ''}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedLeave(null)}
                          className="text-(--text-muted) hover:text-(--text-primary) transition-colors p-2 rounded-full hover:bg-(--background-subtle) shrink-0"
                        >
                          <XCircle className="w-6 h-6" />
                        </button>
                      </div>

                      {/* Leave Type Badge */}
                      <div
                        className="relative mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full"
                        style={{
                          background: `${LEAVE_TYPE_BG[selectedLeave.type]}15`,
                          border: `1px solid ${LEAVE_TYPE_BG[selectedLeave.type]}30`,
                        }}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ background: LEAVE_TYPE_BG[selectedLeave.type] }}
                        />
                        <span
                          className="text-sm font-semibold"
                          style={{ color: LEAVE_TYPE_BG[selectedLeave.type] }}
                        >
                          {getLeaveTypeLabel(selectedLeave.type as LeaveType, t)}
                        </span>
                      </div>
                    </div>

                    {/* Content - Scrollable */}
                    <div className="px-6 pb-6 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-(--border) scrollbar-track-transparent">
                      <div className="bg-(--card) rounded-2xl border border-(--border) shadow-lg p-4 space-y-4">
                        {/* Date Timeline */}
                        <div className="flex items-center justify-between">
                          <div className="flex-1 text-center">
                            <p className="text-[10px] font-semibold text-(--text-muted) uppercase tracking-wider mb-1">
                              {t('driver.from', 'From')}
                            </p>
                            <p className="text-3xl font-bold text-(--text-primary) leading-none">
                              {safeFormat(selectedLeave.startDate, 'd')}
                            </p>
                            <p className="text-xs text-(--text-muted) mt-0.5">
                              {safeFormat(selectedLeave.startDate, 'MMM')}
                            </p>
                            <p className="text-[10px] text-(--text-muted)">
                              {safeFormat(selectedLeave.startDate, 'yyyy')}
                            </p>
                          </div>

                          <div className="flex-1 flex flex-col items-center px-2">
                            <div className="w-8 h-px bg-(--border) mb-1.5" />
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-(--background-subtle) border border-(--border)">
                              <CalendarDays className="w-3.5 h-3.5 text-(--text-muted)" />
                              <span className="text-sm font-bold text-(--text-primary)">
                                {selectedLeave.days}
                              </span>
                              <span className="text-[10px] text-(--text-muted) uppercase">
                                {t('common.daysShort', 'd')}
                              </span>
                            </div>
                            <div className="w-8 h-px bg-(--border) mt-1.5" />
                          </div>

                          <div className="flex-1 text-center">
                            <p className="text-[10px] font-semibold text-(--text-muted) uppercase tracking-wider mb-1">
                              {t('driver.to', 'To')}
                            </p>
                            <p className="text-3xl font-bold text-(--text-primary) leading-none">
                              {safeFormat(selectedLeave.endDate, 'd')}
                            </p>
                            <p className="text-xs text-(--text-muted) mt-0.5">
                              {safeFormat(selectedLeave.endDate, 'MMM')}
                            </p>
                            <p className="text-[10px] text-(--text-muted)">
                              {safeFormat(selectedLeave.endDate, 'yyyy')}
                            </p>
                          </div>
                        </div>

                        {/* Reason */}
                        {selectedLeave.comment && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider">
                                {t('leave.reason', 'Reason')}
                              </span>
                              <div className="flex-1 h-px bg-(--border)" />
                            </div>
                            <p className="text-sm text-(--text-secondary) leading-relaxed bg-(--background-subtle) rounded-xl p-3 border border-(--border)">
                              {selectedLeave.comment}
                            </p>
                          </div>
                        )}

                        {/* Status */}
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider">
                              {t('common.status', 'Status')}
                            </span>
                            <div className="flex-1 h-px bg-(--border)" />
                          </div>
                          <div
                            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl"
                            style={{
                              background:
                                selectedLeave.status === 'approved'
                                  ? '#10b98115'
                                  : selectedLeave.status === 'rejected'
                                    ? '#ef444415'
                                    : '#f59e0b15',
                              border: `1px solid ${
                                selectedLeave.status === 'approved'
                                  ? '#10b98130'
                                  : selectedLeave.status === 'rejected'
                                    ? '#ef444430'
                                    : '#f59e0b30'
                              }`,
                            }}
                          >
                            {selectedLeave.status === 'approved' ? (
                              <CheckCircle className="w-5 h-5 text-emerald-500" />
                            ) : selectedLeave.status === 'rejected' ? (
                              <XCircle className="w-5 h-5 text-red-500" />
                            ) : (
                              <Clock className="w-5 h-5 text-amber-500" />
                            )}
                            <span className="text-sm font-semibold text-(--text-primary)">
                              {selectedLeave.status === 'approved'
                                ? t('leave.approved')
                                : selectedLeave.status === 'rejected'
                                  ? t('leave.rejected')
                                  : t('leave.pending')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* Driver Event Detail Modal - Modern Design */}
            <AnimatePresence>
              {selectedDriverEvent && (
                <div className="fixed inset-0 lg:left-60 lg:top-16 z-50 flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-md"
                    onClick={() => setSelectedDriverEvent(null)}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 30 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 30 }}
                    transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                    className="relative z-10 w-full max-w-lg bg-(--card) rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Hero Header */}
                    <div className="relative px-6 pt-6 pb-8 overflow-hidden shrink-0">
                      <div
                        className="absolute inset-0 opacity-15"
                        style={{
                          background: `linear-gradient(135deg, ${DRIVER_EVENT_COLOR} 0%, transparent 70%)`,
                        }}
                      />
                      <div
                        className="absolute top-0 right-0 w-40 h-40 rounded-full -mr-20 -mt-20 opacity-10 blur-3xl"
                        style={{ background: DRIVER_EVENT_COLOR }}
                      />

                      <div className="relative flex items-start justify-between">
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <div
                              className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg"
                              style={{
                                background: `linear-gradient(135deg, ${DRIVER_EVENT_COLOR}, ${DRIVER_EVENT_COLOR}dd)`,
                              }}
                            >
                              <Car className="w-8 h-8" />
                            </div>
                            <div
                              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-(--card) flex items-center justify-center"
                              style={{ background: DRIVER_EVENT_COLOR }}
                            >
                              {selectedDriverEvent.status === 'completed' ? (
                                <CheckCircle className="w-3.5 h-3.5 text-white" />
                              ) : selectedDriverEvent.status === 'cancelled' ? (
                                <XCircle className="w-3.5 h-3.5 text-white" />
                              ) : (
                                <Clock className="w-3.5 h-3.5 text-white" />
                              )}
                            </div>
                          </div>
                          <div>
                            <h3 className="text-2xl font-bold leading-tight">
                              {selectedDriverEvent.driverName ?? t('common.unknownUser', 'Unknown')}
                            </h3>
                            <p className="text-sm mt-0.5">
                              {selectedDriverEvent.driverVehicle?.model || ''}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedDriverEvent(null)}
                          className="text-(--text-muted) hover:text-(--text-primary) transition-colors p-2 rounded-full hover:bg-(--background-subtle) shrink-0"
                        >
                          <XCircle className="w-6 h-6" />
                        </button>
                      </div>

                      {/* Event Type Badge */}
                      <div
                        className="relative mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full"
                        style={{
                          background: `${DRIVER_EVENT_COLOR}15`,
                          border: `1px solid ${DRIVER_EVENT_COLOR}30`,
                        }}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ background: DRIVER_EVENT_COLOR }}
                        />
                        <span
                          className="text-sm font-semibold"
                          style={{ color: DRIVER_EVENT_COLOR }}
                        >
                          {selectedDriverEvent.type === 'trip'
                            ? t('driver.trip', 'Trip')
                            : selectedDriverEvent.type === 'blocked'
                              ? t('driver.blocked', 'Blocked')
                              : t('driver.maintenance', 'Maintenance')}
                        </span>
                      </div>
                    </div>

                    {/* Content - Scrollable */}
                    <div className="px-6 pb-6 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-(--border) scrollbar-track-transparent">
                      <div className="bg-(--card) rounded-2xl border border-(--border) shadow-lg p-4 space-y-4">
                        {/* Date Timeline */}
                        <div className="flex items-center justify-between">
                          <div className="flex-1 text-center">
                            <p className="text-[10px] font-semibold text-(--text-muted) uppercase tracking-wider mb-1">
                              {t('driver.from', 'From')}
                            </p>
                            <p className="text-3xl font-bold text-(--text-primary) leading-none">
                              {format(new Date(selectedDriverEvent.startTime), 'd', {
                                locale: dateFnsLocale,
                              })}
                            </p>
                            <p className="text-xs text-(--text-muted) mt-1">
                              {format(new Date(selectedDriverEvent.startTime), 'MMM', {
                                locale: dateFnsLocale,
                              })}
                            </p>
                            <p className="text-[10px] text-(--text-muted) mt-0.5">
                              {format(new Date(selectedDriverEvent.startTime), 'HH:mm', {
                                locale: dateFnsLocale,
                              })}
                            </p>
                          </div>

                          <div className="flex-1 flex flex-col items-center px-4">
                            <div className="w-10 h-px bg-(--border) mb-2" />
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-(--background-subtle) border border-(--border)">
                              <Clock className="w-3.5 h-3.5 text-(--text-muted)" />
                              <span className="text-xs font-bold text-(--text-primary)">
                                {format(new Date(selectedDriverEvent.startTime), 'HH:mm', {
                                  locale: dateFnsLocale,
                                })}{' '}
                                -{' '}
                                {format(new Date(selectedDriverEvent.endTime), 'HH:mm', {
                                  locale: dateFnsLocale,
                                })}
                              </span>
                            </div>
                            <div className="w-10 h-px bg-(--border) mt-2" />
                          </div>

                          <div className="flex-1 text-center">
                            <p className="text-[10px] font-semibold text-(--text-muted) uppercase tracking-wider mb-1">
                              {t('driver.to', 'To')}
                            </p>
                            <p className="text-3xl font-bold text-(--text-primary) leading-none">
                              {format(new Date(selectedDriverEvent.endTime), 'd', {
                                locale: dateFnsLocale,
                              })}
                            </p>
                            <p className="text-xs text-(--text-muted) mt-1">
                              {format(new Date(selectedDriverEvent.endTime), 'MMM', {
                                locale: dateFnsLocale,
                              })}
                            </p>
                            <p className="text-[10px] text-(--text-muted) mt-0.5">
                              {format(new Date(selectedDriverEvent.endTime), 'HH:mm', {
                                locale: dateFnsLocale,
                              })}
                            </p>
                          </div>
                        </div>

                        {/* Route Info */}
                        {selectedDriverEvent.tripInfo && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider">
                                {t('driver.route', 'Route')}
                              </span>
                              <div className="flex-1 h-px bg-(--border)" />
                            </div>
                            <div className="bg-(--background-subtle) rounded-xl p-4 border border-(--border) space-y-3">
                              <div className="flex items-start gap-3">
                                <div className="w-3 h-3 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                                <div>
                                  <p className="text-[10px] text-(--text-muted) uppercase tracking-wider">
                                    {t('driver.pickup', 'Pickup')}
                                  </p>
                                  <p className="text-sm font-semibold text-(--text-primary) mt-0.5">
                                    {selectedDriverEvent.tripInfo.from}
                                  </p>
                                </div>
                              </div>
                              <div className="ml-1.5 border-l-2 border-dashed border-(--border)/40 h-6" />
                              <div className="flex items-start gap-3">
                                <div className="w-3 h-3 rounded-full bg-red-500 mt-1.5 shrink-0" />
                                <div>
                                  <p className="text-[10px] text-(--text-muted) uppercase tracking-wider">
                                    {t('driver.dropoff', 'Dropoff')}
                                  </p>
                                  <p className="text-sm font-semibold text-(--text-primary) mt-0.5">
                                    {selectedDriverEvent.tripInfo.to}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Purpose */}
                        {selectedDriverEvent.tripInfo?.purpose && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider">
                                {t('driver.purpose', 'Purpose')}
                              </span>
                              <div className="flex-1 h-px bg-(--border)" />
                            </div>
                            <p className="text-sm text-(--text-secondary) leading-relaxed bg-(--background-subtle) rounded-xl p-4 border border-(--border)">
                              {selectedDriverEvent.tripInfo.purpose}
                            </p>
                          </div>
                        )}

                        {/* Passengers */}
                        {selectedDriverEvent.tripInfo?.passengerCount && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider">
                                {t('driver.passengers', 'Passengers')}
                              </span>
                              <div className="flex-1 h-px bg-(--border)" />
                            </div>
                            <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-(--background-subtle) border border-(--border)">
                              <Users className="w-5 h-5 text-(--text-muted)" />
                              <span className="text-lg font-bold text-(--text-primary)">
                                {selectedDriverEvent.tripInfo.passengerCount}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Notes */}
                        {selectedDriverEvent.tripInfo?.notes && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider">
                                {t('driver.notes', 'Notes')}
                              </span>
                              <div className="flex-1 h-px bg-(--border)" />
                            </div>
                            <p className="text-sm text-(--text-secondary) leading-relaxed bg-(--background-subtle) rounded-xl p-4 border border-(--border)">
                              {selectedDriverEvent.tripInfo.notes}
                            </p>
                          </div>
                        )}

                        {/* Vehicle Info */}
                        {selectedDriverEvent.driverVehicle && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider">
                                {t('driver.vehicle', 'Vehicle')}
                              </span>
                              <div className="flex-1 h-px bg-(--border)" />
                            </div>
                            <div className="flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-(--background-subtle) border border-(--border)">
                              <Car className="w-5 h-5 text-(--text-muted)" />
                              <div className="text-center">
                                <p className="text-sm font-bold text-(--text-primary)">
                                  {selectedDriverEvent.driverVehicle.model}
                                </p>
                                <p className="text-xs text-(--text-muted)">
                                  {selectedDriverEvent.driverVehicle.plateNumber}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Status */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider">
                              {t('common.status', 'Status')}
                            </span>
                            <div className="flex-1 h-px bg-(--border)" />
                          </div>
                          <div
                            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl"
                            style={{
                              background:
                                selectedDriverEvent.status === 'completed'
                                  ? '#10b98115'
                                  : selectedDriverEvent.status === 'cancelled'
                                    ? '#ef444415'
                                    : '#f59e0b15',
                              border: `1px solid ${
                                selectedDriverEvent.status === 'completed'
                                  ? '#10b98130'
                                  : selectedDriverEvent.status === 'cancelled'
                                    ? '#ef444430'
                                    : '#f59e0b30'
                              }`,
                            }}
                          >
                            {selectedDriverEvent.status === 'completed' ? (
                              <CheckCircle className="w-5 h-5 text-emerald-500" />
                            ) : selectedDriverEvent.status === 'cancelled' ? (
                              <XCircle className="w-5 h-5 text-red-500" />
                            ) : (
                              <Clock className="w-5 h-5 text-amber-500" />
                            )}
                            <span className="text-sm font-semibold text-(--text-primary)">
                              {selectedDriverEvent.status === 'completed'
                                ? t('driver.status.completed', 'Completed')
                                : selectedDriverEvent.status === 'cancelled'
                                  ? t('driver.status.cancelled', 'Cancelled')
                                  : t('driver.status.scheduled', 'Scheduled')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
            {/* Google Calendar Event Detail Modal */}
            <AnimatePresence>
              {selectedGoogleEvent && (
                <div className="fixed inset-0 lg:left-60 lg:top-16 z-50 flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={() => setSelectedGoogleEvent(null)}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: 20 }}
                    transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                    className="relative z-10 w-full max-w-md rounded-2xl border border-(--border) bg-(--card) shadow-2xl overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Header with gradient */}
                    <div
                      className="px-5 pt-5 pb-4 flex items-center justify-between relative"
                      style={{
                        background: `linear-gradient(135deg, ${GOOGLE_EVENT_COLOR}22 0%, ${GOOGLE_EVENT_COLOR}08 100%)`,
                        borderBottom: `2px solid ${GOOGLE_EVENT_COLOR}33`,
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg"
                          style={{
                            background: `linear-gradient(135deg, ${GOOGLE_EVENT_COLOR}, ${GOOGLE_EVENT_COLOR}cc)`,
                          }}
                        >
                          <span className="text-lg font-bold">G</span>
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-lg font-bold text-(--text-primary) truncate">
                            {selectedGoogleEvent.title}
                          </h3>
                          <p className="text-xs text-(--text-muted)">Google Calendar</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedGoogleEvent(null)}
                        className="text-(--text-muted) hover:text-(--text-primary) transition-colors p-1.5 rounded-full hover:bg-(--background-subtle) shrink-0"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Content */}
                    <div className="px-5 pb-5 space-y-4">
                      {/* Date & Time */}
                      <div className="rounded-xl border border-(--border) bg-(--background-subtle) p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="w-4 h-4 text-(--text-muted) shrink-0" />
                          <span className="text-sm font-semibold text-(--text-primary)">
                            {safeFormat(selectedGoogleEvent.startDate, 'EEEE, MMMM d, yyyy')}
                          </span>
                        </div>
                        {selectedGoogleEvent.startTime ? (
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-(--text-muted) shrink-0" />
                            <span className="text-sm text-(--text-secondary)">
                              {format(new Date(selectedGoogleEvent.startTime), 'h:mm a', {
                                locale: dateFnsLocale,
                              })}
                              {selectedGoogleEvent.endTime &&
                                ` – ${format(new Date(selectedGoogleEvent.endTime), 'h:mm a', { locale: dateFnsLocale })}`}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-(--text-muted) shrink-0" />
                            <span className="text-sm text-(--text-secondary)">
                              {t('calendar.allDay', 'All day')}
                            </span>
                          </div>
                        )}
                        {/* Multi-day range */}
                        {selectedGoogleEvent.endDate &&
                          selectedGoogleEvent.startDate !==
                            (selectedGoogleEvent.allDay
                              ? format(
                                  addDays(new Date(selectedGoogleEvent.endDate), -1),
                                  'yyyy-MM-dd',
                                )
                              : selectedGoogleEvent.endDate) && (
                            <div className="flex items-center gap-2 pt-1 border-t border-(--border)">
                              <CalendarDays className="w-4 h-4 text-(--text-muted) shrink-0" />
                              <span className="text-xs text-(--text-secondary)">
                                {safeFormat(selectedGoogleEvent.startDate, 'MMM d')} &ndash;{' '}
                                {safeFormat(
                                  selectedGoogleEvent.allDay
                                    ? format(
                                        addDays(new Date(selectedGoogleEvent.endDate), -1),
                                        'yyyy-MM-dd',
                                      )
                                    : selectedGoogleEvent.endDate,
                                  'MMM d, yyyy',
                                )}
                              </span>
                            </div>
                          )}
                      </div>

                      {/* Location */}
                      {selectedGoogleEvent.location && (
                        <div className="space-y-1.5">
                          <span className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider flex items-center gap-1.5">
                            <span className="text-sm">📍</span>
                            {t('calendar.location', 'Location')}
                          </span>
                          <p className="text-sm text-(--text-secondary) bg-(--background-subtle) rounded-lg p-3 border border-(--border)">
                            {selectedGoogleEvent.location}
                          </p>
                        </div>
                      )}

                      {/* Description */}
                      {selectedGoogleEvent.description && (
                        <div className="space-y-1.5">
                          <span className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider">
                            {t('calendar.description', 'Description')}
                          </span>
                          <div className="text-sm text-(--text-secondary) bg-(--background-subtle) rounded-lg p-3 border border-(--border) leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                            {selectedGoogleEvent.description}
                          </div>
                        </div>
                      )}

                      {/* Open in Google Calendar */}
                      {selectedGoogleEvent.htmlLink && (
                        <a
                          href={selectedGoogleEvent.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-(--border) bg-(--background-subtle) text-sm font-medium text-(--text-primary) hover:bg-(--background) hover:border-(--primary)/50 transition-all"
                        >
                          <ExternalLink className="w-4 h-4" />
                          {t('calendar.openInGoogle', 'Open in Google Calendar')}
                        </a>
                      )}
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </>,
          document.body,
        )}
    </div>
  );
});

export default CalendarClient;
