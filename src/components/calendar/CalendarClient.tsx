'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMainRef } from '@/hooks/useMainRef';
import { useHydrated } from '@/hooks/useHydrated';
import { useScrollLock } from '@/hooks/useScrollLock';
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
  CalendarPlus,
  ClipboardCopy,
  Trash2,
  Eye,
  DoorOpen,
  Building2,
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
  isBefore,
  startOfDay,
} from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useQuery, useMutation } from 'convex/react';
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
import { CreateEventModal, type CalendarEvent } from './CreateEventModal';
import { DayDetailsModal } from './DayDetailsModal';
import { EventTimelineModal } from './EventTimelineModal';
import { DraftResumeBar } from '@/components/ui/DraftResumeBar';
import { useDraftResume } from '@/hooks/useDraftResume';
import { CalendarScopeSwitcher } from './CalendarScopeSwitcher';
import { RoomAvailabilityStrip } from '@/components/rooms/RoomAvailabilityStrip';
import { RoomBookingModal } from '@/components/rooms/RoomBookingModal';
import { RoomDetailsModal } from '@/components/rooms/RoomDetailsModal';
import type { RoomBookingDoc, RoomDoc } from '@/components/rooms/types';
import {
  defaultScopeForRole,
  filterForScope,
  isMyCompanyEvent,
  isMyCustomEvent,
  isMyDriverEvent,
  isMyLeave,
  isMyRoomBooking,
  readStoredScope,
  storeScope,
  type CalendarScope,
} from '@/lib/calendarScope';
import {
  COMPANY_EVENT_ACCENTS,
  type CompanyTimelineData,
  type TimelineInput,
} from '@/lib/eventTimeline';
import { getInitials } from '@/lib/stringUtils';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

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
  // Review trail — surfaced by the timeline view.
  createdAt?: number;
  reviewedAt?: number;
  reviewerName?: string;
  reviewComment?: string;
};

type DriverScheduleEvent = {
  _id: string;
  driverId: string;
  driverName: string;
  /** The user account behind the driver record — used by the personal scope. */
  driverUserId?: string;
  /** Who booked the trip. */
  userId?: string;
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
  tripInfo?: {
    from: string;
    to: string;
    purpose: string;
    passengerCount: number;
    notes?: string;
    distanceKm?: number;
    durationMinutes?: number;
    passengerPhone?: string;
  };
  reason?: string;
  // Trip lifecycle — surfaced by the timeline view.
  createdAt?: number;
  arrivedAt?: number;
  passengerPickedUpAt?: number;
  waitTimeMinutes?: number;
  driverNotes?: string;
  mapData?: { distanceMeters: number; durationSeconds: number };
  driverFeedback?: { rating: number; comment?: string; completedAt: number };
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

/**
 * A company-wide event from `companyEvents`.
 *
 * Dates are epoch milliseconds here, not `yyyy-MM-dd` like the other sources,
 * and an event may run across several days.
 */
type CompanyEvent = {
  _id: string;
  name: string;
  description?: string;
  startDate: number;
  endDate: number;
  isAllDay?: boolean;
  eventType: string;
  priority?: 'high' | 'medium' | 'low';
  requiredDepartments: string[];
  requiredEmployeeIds: string[];
  creatorName?: string;
  notifyDaysBefore?: number;
  createdBy?: string;
  createdAt?: number;
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

/** Does a date range touch the visible month at all? */
function overlapsMonth(start: string, end: string, month: Date): boolean {
  const s = safeDate(start);
  const e = safeDate(end);
  if (!s || !e) return false;
  return s <= endOfMonth(month) && e >= startOfMonth(month);
}

/**
 * Locale-correct date labels.
 *
 * date-fns formats months in the genitive case for Russian ("3 августа"), which
 * reads wrong when a month stands alone ("АВГУСТА СВОДКА"), and its fixed
 * pattern order puts the day after the month in every language. Intl handles
 * both: standalone months come out nominative and each locale gets its own
 * word order.
 */
function standaloneMonth(date: Date, lang: string, withYear = false): string {
  const label = new Intl.DateTimeFormat(lang, {
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function fullDayLabel(date: Date, lang: string): string {
  const label = new Intl.DateTimeFormat(lang, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * When a calendar day holds exactly one entry, double-clicking it can skip the
 * day list and open that entry's timeline directly. Returns `null` for empty
 * days and for days with more than one entry.
 */
function singleTimelineFor(
  leaves: LeaveRequest[],
  googleEvents: GoogleCalendarEvent[],
  driverEvents: DriverScheduleEvent[],
  customEvents: CalendarEvent[],
  companyEvents: CompanyEvent[] = [],
): TimelineInput | null {
  if (
    leaves.length +
      googleEvents.length +
      driverEvents.length +
      customEvents.length +
      companyEvents.length !==
    1
  ) {
    return null;
  }
  if (leaves[0]) return { source: 'leave', data: leaves[0] };
  if (driverEvents[0]) return { source: 'driver', data: driverEvents[0] };
  if (googleEvents[0]) return { source: 'google', data: googleEvents[0] };
  if (customEvents[0]) return { source: 'custom', data: customEvents[0] };
  if (companyEvents[0]) return { source: 'company', data: toCompanyTimelineData(companyEvents[0]) };
  return null;
}

/** Company event → timeline input. Kept next to the day list that also needs it. */
function toCompanyTimelineData(event: CompanyEvent): CompanyTimelineData {
  return {
    id: event._id,
    name: event.name,
    description: event.description,
    startDate: event.startDate,
    endDate: event.endDate,
    isAllDay: event.isAllDay,
    eventType: event.eventType,
    priority: event.priority,
    requiredDepartments: event.requiredDepartments,
    requiredCount: event.requiredEmployeeIds.length,
    creatorName: event.creatorName,
    notifyDaysBefore: event.notifyDaysBefore,
    createdAt: event.createdAt,
  };
}

/**
 * A single and a double click on the same event row mean different things —
 * quick preview vs. full timeline — so the single-click action waits just long
 * enough to see whether a second click follows. Without the delay the preview
 * modal would flash open on every double click.
 */
const DOUBLE_CLICK_WINDOW_MS = 220;

function useDualClick() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // The ref is touched only inside these callbacks, never while the factory
  // below runs. Reading `timer.current` during render would be flagged by the
  // React compiler (and is genuinely unsafe under concurrent rendering).
  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const scheduleSingle = useCallback(
    (onSingle: () => void) => {
      cancel();
      timer.current = setTimeout(() => {
        timer.current = null;
        onSingle();
      }, DOUBLE_CLICK_WINDOW_MS);
    },
    [cancel],
  );

  return useMemo(
    () => ({
      /** Fires `onSingle` unless a second click arrives within the window. */
      single: (onSingle: () => void) => scheduleSingle(onSingle),
      /** Cancels a pending single click, then runs `onDouble`. */
      double: (onDouble: () => void) => {
        cancel();
        onDouble();
      },
    }),
    [cancel, scheduleSingle],
  );
}

function StatusIcon({ status }: { status: LeaveStatus }) {
  if (status === 'approved') return <CheckCircle className="w-3 h-3 text-(--success-text)" />;
  if (status === 'rejected') return <XCircle className="w-3 h-3 text-(--danger-text)" />;
  return <Clock className="w-3 h-3 text-(--warning-text)" />;
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
const GOOGLE_EVENT_COLOR = 'var(--purple)';
const DRIVER_EVENT_COLOR = 'var(--warning-solid)'; // orange for driver bookings
const ROOM_EVENT_COLOR = 'var(--cyan)'; // sky blue fallback when a room has no colour
const COMPANY_EVENT_COLOR = 'var(--chart-2)'; // teal for organization-wide events

// A date is "past" if it is strictly before the start of today.
// Past days can be viewed but not booked.
function isPastDate(date: Date): boolean {
  return isBefore(startOfDay(date), startOfDay(new Date()));
}

function DayCell({
  date,
  currentMonth,
  selected,
  leaves,
  googleEvents,
  driverEvents,
  customEvents,
  roomBookings,
  companyEvents,
  onClick,
  onDoubleClick,
  onDropEvent,
}: {
  date: Date;
  currentMonth: Date;
  selected: Date | null;
  leaves: LeaveRequest[];
  googleEvents: GoogleCalendarEvent[];
  driverEvents: DriverScheduleEvent[];
  customEvents: CalendarEvent[];
  roomBookings: RoomBookingDoc[];
  companyEvents: CompanyEvent[];
  onClick: () => void;
  onDoubleClick: () => void;
  /** Drag & drop target — receives custom events dropped onto this day. */
  onDropEvent?: (event: CalendarEvent) => void;
}) {
  const { t } = useTranslation();
  const isCurrentMonth = isSameMonth(date, currentMonth);
  const isTodayDate = isToday(date);
  const isSelected = selected ? isSameDay(date, selected) : false;
  const hasLeaves = leaves.length > 0 && isCurrentMonth;
  const hasGoogle = googleEvents.length > 0 && isCurrentMonth;
  const hasDriver = driverEvents.length > 0 && isCurrentMonth;
  const hasCustom = customEvents.length > 0 && isCurrentMonth;
  const hasRooms = roomBookings.length > 0 && isCurrentMonth;
  const hasCompany = companyEvents.length > 0 && isCurrentMonth;
  const totalItems =
    leaves.length +
    googleEvents.length +
    driverEvents.length +
    customEvents.length +
    roomBookings.length +
    companyEvents.length;

  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onDragOver={(e) => {
        if (onDropEvent) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }
      }}
      onDrop={(e) => {
        if (!onDropEvent) return;
        e.preventDefault();
        try {
          const raw = e.dataTransfer.getData('application/json');
          if (raw) onDropEvent(JSON.parse(raw) as CalendarEvent);
        } catch {
          /* not one of our events — ignore */
        }
      }}
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
      {(hasLeaves || hasGoogle || hasDriver || hasCustom || hasRooms || hasCompany) && (
        <div className="flex flex-col gap-0.5 mt-0.5">
          {/* Company event pills — first, because they concern everyone */}
          {companyEvents.slice(0, 1).map((evt, i) => {
            const accent = COMPANY_EVENT_ACCENTS[evt.eventType] ?? COMPANY_EVENT_COLOR;
            return (
              <div
                key={`o-${i}`}
                className="flex items-center gap-1 rounded-full px-1.5 py-0.5"
                style={{ background: isSelected ? 'rgba(255,255,255,0.2)' : `${accent}22` }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: isSelected ? 'var(--n-0)' : accent }}
                />
                <span
                  className="text-[9px] font-semibold truncate hidden sm:block"
                  style={{ color: isSelected ? 'var(--n-0)' : accent }}
                >
                  {evt.name}
                </span>
              </div>
            );
          })}
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
                style={{ background: isSelected ? 'var(--n-0)' : LEAVE_TYPE_BG[l.type] }}
              />
              <span
                className="text-[9px] font-medium truncate hidden sm:block"
                style={{ color: isSelected ? 'var(--n-0)' : LEAVE_TYPE_BG[l.type] }}
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
                style={{ background: isSelected ? 'var(--n-0)' : DRIVER_EVENT_COLOR }}
              />
              <span
                className="text-[9px] font-medium truncate hidden sm:block"
                style={{ color: isSelected ? 'var(--n-0)' : DRIVER_EVENT_COLOR }}
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
                style={{ background: isSelected ? 'var(--n-0)' : GOOGLE_EVENT_COLOR }}
              />
              <span
                className="text-[9px] font-medium truncate hidden sm:block"
                style={{ color: isSelected ? 'var(--n-0)' : GOOGLE_EVENT_COLOR }}
              >
                {evt.title}
              </span>
            </div>
          ))}
          {/* Custom event pills — with attendee avatars, per the redesign brief */}
          {customEvents.slice(0, 1).map((evt) => {
            const avatars = evt.attendees.slice(0, 3);
            const overflow = evt.attendees.length - avatars.length;
            const attendeeNames = evt.attendees.length ? evt.attendees.join(', ') : undefined;
            return (
              <TooltipRoot key={evt.id} delayDuration={200}>
                <TooltipTrigger asChild>
                  <div
                    draggable={Boolean(onDropEvent)}
                    onDragStart={(e) => {
                      if (!onDropEvent) return;
                      e.dataTransfer.setData('application/json', JSON.stringify(evt));
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    className="group flex items-center gap-1.5 rounded-full px-1.5 py-0.5 cursor-grab active:cursor-grabbing"
                    style={{
                      background: isSelected
                        ? 'rgba(255,255,255,0.2)'
                        : 'color-mix(in srgb, var(--brand) 13%, transparent)',
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: isSelected ? 'var(--n-0)' : 'var(--brand)' }}
                    />
                    <span
                      className="text-[9px] font-medium truncate hidden sm:block"
                      style={{ color: isSelected ? 'var(--n-0)' : 'var(--brand)' }}
                    >
                      {evt.title}
                    </span>
                    {/* Attendee avatar stack — the guest list at a glance */}
                    {avatars.length > 0 && (
                      <span className="flex -space-x-1 shrink-0" aria-hidden>
                        {avatars.map((name, ai) => (
                          <span
                            key={`a-${ai}`}
                            className="flex size-3.5 items-center justify-center rounded-full border text-[6px] font-bold"
                            style={{
                              background: isSelected
                                ? 'rgba(255,255,255,0.85)'
                                : 'var(--surface-2)',
                              borderColor: isSelected ? 'rgba(255,255,255,0.6)' : 'var(--card)',
                              color: isSelected ? 'var(--brand)' : 'var(--text-secondary)',
                            }}
                          >
                            {getInitials(name).slice(0, 2)}
                          </span>
                        ))}
                        {overflow > 0 && (
                          <span
                            className="flex size-3.5 items-center justify-center rounded-full border text-[6px] font-bold"
                            style={{
                              background: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--surface-3)',
                              borderColor: isSelected ? 'rgba(255,255,255,0.6)' : 'var(--card)',
                              color: isSelected ? 'var(--brand)' : 'var(--text-secondary)',
                            }}
                          >
                            +{overflow}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-caption font-semibold text-(--text-primary)">{evt.title}</p>
                  {evt.startTime && !evt.allDay && (
                    <p className="num text-caption text-(--text-muted)">
                      {evt.startTime}–{evt.endTime}
                    </p>
                  )}
                  {attendeeNames && (
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {evt.attendees.map((name, ai) => (
                        <li key={`${evt.id}-n-${ai}`} className="flex items-center gap-1.5">
                          <span
                            className="flex size-4 shrink-0 items-center justify-center rounded-full border border-(--border-default) bg-(--surface-2) text-[7px] font-bold text-(--text-secondary)"
                            aria-hidden
                          >
                            {getInitials(name).slice(0, 2)}
                          </span>
                          <span className="truncate text-caption text-(--text-secondary)">
                            {name}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!attendeeNames && evt.location && (
                    <p className="mt-0.5 text-caption text-(--text-muted)">{evt.location}</p>
                  )}
                </TooltipContent>
              </TooltipRoot>
            );
          })}
          {/* Room booking pills */}
          {roomBookings.slice(0, 1).map((evt) => {
            const color = evt.roomColor ?? ROOM_EVENT_COLOR;
            return (
              <div
                key={`r-${evt._id}`}
                className="flex items-center gap-1 rounded-full px-1.5 py-0.5"
                style={{ background: isSelected ? 'rgba(255,255,255,0.2)' : `${color}22` }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: isSelected ? 'var(--n-0)' : color }}
                />
                <span
                  className="text-[9px] font-medium truncate hidden sm:block"
                  style={{ color: isSelected ? 'var(--n-0)' : color }}
                >
                  {evt.roomName}
                </span>
              </div>
            );
          })}
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
  const mounted = useHydrated();
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [showDayDetails, setShowDayDetails] = useState(false);
  const [showRoomBooking, setShowRoomBooking] = useState(false);
  const [roomBookingDate, setRoomBookingDate] = useState<Date | null>(null);
  const [roomBookingRoomId, setRoomBookingRoomId] = useState<string | null>(null);
  const [detailsRoom, setDetailsRoom] = useState<RoomDoc | null>(null);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);

  // Draft prompts. Watched only while the matching form is closed — an offer to
  // restore a draft on top of the form it belongs to would be nonsense.
  const eventDraft = useDraftResume('create-event:new', !showCreateEvent);
  const leaveDraft = useDraftResume('leave-request', !showLeaveModal);
  const deleteEventMutation = useMutation(api.calendarEvents.remove);
  const updateEventMutation = useMutation(api.calendarEvents.update);

  /**
   * Drag & drop: move a custom event onto another day. Only the date moves —
   * the room reservation, when one exists, is re-booked by the same mutation
   * against the new window, exactly like an edit from the modal.
   */
  const handleMoveEventToDay = useCallback(
    async (event: CalendarEvent, target: Date) => {
      if (event.date === format(target, 'yyyy-MM-dd')) return;
      try {
        const [hh, mm] = (event.startTime || '09:00').split(':').map(Number);
        const [eh, em] = (event.endTime || '10:00').split(':').map(Number);
        const roomStart = new Date(
          target.getFullYear(),
          target.getMonth(),
          target.getDate(),
          hh || 9,
          mm || 0,
        ).getTime();
        const roomEnd = new Date(
          target.getFullYear(),
          target.getMonth(),
          target.getDate(),
          eh || 10,
          em || 0,
        ).getTime();
        await updateEventMutation({
          id: event.id as Id<'calendarEvents'>,
          title: event.title,
          date: format(target, 'yyyy-MM-dd'),
          startTime: event.allDay ? '00:00' : event.startTime,
          endTime: event.allDay ? '23:59' : event.endTime,
          allDay: event.allDay,
          location: event.location || undefined,
          description: event.description || undefined,
          category: event.category,
          reminder: event.reminder,
          attachmentUrl: event.attachmentUrl,
          attendeeIds: (event.attendeeIds ?? []) as Id<'users'>[],
          roomId: event.roomId as Id<'meetingRooms'> | undefined,
          roomStartTime: event.roomId ? roomStart : undefined,
          roomEndTime: event.roomId ? roomEnd : undefined,
        });
        toast.success(t('calendar.eventMoved', 'Event moved'));
      } catch {
        toast.error(t('calendar.eventMoveFailed', 'Could not move event'));
      }
    },
    [updateEventMutation, t],
  );
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [selectedDriverEvent, setSelectedDriverEvent] = useState<DriverScheduleEvent | null>(null);
  const [selectedGoogleEvent, setSelectedGoogleEvent] = useState<GoogleCalendarEvent | null>(null);
  const [timelineInput, setTimelineInput] = useState<TimelineInput | null>(null);
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const lang = i18n.language || 'en';
  const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;

  // --- Calendar scope: personal vs. shared ------------------------------------
  // People who manage others land on the shared calendar, everyone else on
  // their own. An explicit choice is remembered and always beats the default.
  const [scope, setScope] = useState<CalendarScope>('mine');
  const scopeInitialized = useRef(false);

  useEffect(() => {
    if (scopeInitialized.current || !user) return;
    scopeInitialized.current = true;
    // One-time initialization from localStorage. It cannot move into the
    // useState initializer: this component is server-rendered, and reading
    // localStorage during render would produce a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-shot client-side init
    setScope(readStoredScope() ?? defaultScopeForRole(user.role));
  }, [user]);

  const changeScope = useCallback((next: CalendarScope) => {
    setScope(next);
    storeScope(next);
  }, []);

  /**
   * Deleting an event also frees the meeting room it held, so the confirmation
   * says so — otherwise people re-check the board to make sure.
   */
  const handleDeleteEvent = useCallback(
    async (event: CalendarEvent) => {
      try {
        const result = await deleteEventMutation({ id: event.id as Id<'calendarEvents'> });
        toast.success(
          result?.releasedRoom && event.roomName
            ? t('createMeeting.room.releasedWithEvent', { room: event.roomName })
            : t('createMeeting.deleted'),
        );
      } catch (error) {
        logger.error('Delete calendar event failed', error);
        toast.error(t('rooms.errors.generic'));
      }
    },
    [deleteEventMutation, t],
  );

  const viewer = useMemo(
    () => ({
      id: user?.id ?? '',
      name: user?.name,
      // Department decides whether a department-wide event belongs on the
      // personal calendar.
      department: (user as { department?: string } | null | undefined)?.department,
    }),
    [user],
  );
  const isPersonalScope = scope === 'mine';

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
      const data = (await res.json()) as {
        connected?: boolean;
        events?: GoogleCalendarEvent[];
      };
      setGoogleConnected(data.connected ?? false);
      setGoogleEvents(data.events ?? []);
    } catch {
      setGoogleEvents([]);
    }
  }, []);

  useEffect(() => {
    logger.log('📅 CalendarClient mounted');

    // Async fetch: the state updates land after the awaited response, not during
    // this effect. The lint rule cannot see across the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is set after the fetch resolves
    void fetchGoogleEvents(currentMonth);
  }, [currentMonth, fetchGoogleEvents]);

  // Freeze the page behind any open dialog. The shared hook also compensates
  // for the hidden scrollbar, so the content no longer jumps sideways the way
  // it did when the overflow was switched off without padding.
  const anyModalOpen = Boolean(
    selectedLeave ||
    selectedDriverEvent ||
    selectedGoogleEvent ||
    showLeaveModal ||
    showDriverModal ||
    showCreateEvent ||
    showDayDetails ||
    showRoomBooking ||
    detailsRoom ||
    timelineInput,
  );
  useScrollLock(anyModalOpen);

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
      ? {}
      : ('skip' as const);

  // Use organization-specific query if org selected, otherwise use default
  const leavesData = useQuery(
    shouldUseOrgQuery ? api.leaves.getLeavesForOrganization : api.leaves.getAllLeaves,
    mounted && user?.id && queryParams !== 'skip' ? queryParams : 'skip',
  );
  const leaves: LeaveRequest[] = useMemo(() => leavesData ?? [], [leavesData]);

  // Scoped views of every source. The queries stay organization-wide (a single
  // subscription, so toggling the scope is instant and needs no refetch) and the
  // personal view is a pure filter on top.
  const scopedLeaves = useMemo(
    () => filterForScope(leaves, scope, (leave) => isMyLeave(leave, viewer)),
    [leaves, scope, viewer],
  );

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

  const scopedDriverSchedules = useMemo(
    () => filterForScope(driverSchedules ?? [], scope, (evt) => isMyDriverEvent(evt, viewer)),
    [driverSchedules, scope, viewer],
  );

  // Calendar events (custom user events)
  const calendarEventsData = useQuery(
    api.calendarEvents.getByOrganization,
    mounted && selectedOrgId ? { organizationId: selectedOrgId as Id<'organizations'> } : 'skip',
  );
  const customEvents: CalendarEvent[] = useMemo(
    () =>
      (calendarEventsData ?? []).map((e) => ({
        id: e._id,
        title: e.title,
        date: e.date,
        startTime: e.startTime,
        endTime: e.endTime,
        allDay: e.allDay,
        location: e.location ?? '',
        description: e.description ?? '',
        category: e.category,
        reminder: e.reminder,
        attendees: e.attendees ?? [],
        attachmentUrl: e.attachmentUrl,
        createdAt: e.createdAt,
        createdBy: e.createdBy,
        roomId: e.roomId,
        roomBookingId: e.roomBookingId,
        roomName: e.roomName,
        roomColor: e.roomColor,
      })),
    [calendarEventsData],
  );

  const scopedCustomEvents = useMemo(
    () => filterForScope(customEvents, scope, (evt) => isMyCustomEvent(evt, viewer)),
    [customEvents, scope, viewer],
  );

  // --- Company events --------------------------------------------------------
  // Events created in /admin/events live in their own table and were never read
  // here, so an organization-wide event was invisible on the organization's own
  // calendar. Everyone in the org may read them; `requiredDepartments` and
  // `requiredEmployeeIds` say who must attend, not who may know.
  const companyEventsData = useQuery(
    api.events.getCompanyEvents,
    mounted && selectedOrgId
      ? {
          organizationId: selectedOrgId as Id<'organizations'>,
          startDate: monthStart,
          endDate: monthEnd,
        }
      : 'skip',
  );

  const companyEvents: CompanyEvent[] = useMemo(
    () =>
      (companyEventsData ?? []).map((e) => ({
        _id: e._id,
        name: e.name,
        description: e.description,
        startDate: e.startDate,
        endDate: e.endDate,
        isAllDay: e.isAllDay,
        eventType: e.eventType,
        priority: e.priority,
        requiredDepartments: e.requiredDepartments ?? [],
        requiredEmployeeIds: e.requiredEmployeeIds ?? [],
        creatorName: e.creatorName,
        notifyDaysBefore: e.notifyDaysBefore,
        createdBy: e.createdBy,
        createdAt: e.createdAt,
      })),
    [companyEventsData],
  );

  const scopedCompanyEvents = useMemo(
    () => filterForScope(companyEvents, scope, (evt) => isMyCompanyEvent(evt, viewer)),
    [companyEvents, scope, viewer],
  );

  // --- Meeting rooms ---------------------------------------------------------
  // Room bookings are a fifth calendar source. They live in their own module but
  // show up here so "what is happening this month" stays one screen.
  const roomBookingsData = useQuery(
    api.meetingRooms.listBookings,
    mounted && selectedOrgId
      ? {
          organizationId: selectedOrgId as Id<'organizations'>,
          startTime: monthStart,
          endTime: monthEnd,
        }
      : 'skip',
  ) as RoomBookingDoc[] | undefined;
  const roomBookings = useMemo(() => roomBookingsData ?? [], [roomBookingsData]);

  const scopedRoomBookings = useMemo(
    () => filterForScope(roomBookings, scope, (booking) => isMyRoomBooking(booking, viewer)),
    [roomBookings, scope, viewer],
  );

  const roomsData = useQuery(
    api.meetingRooms.listRooms,
    mounted && selectedOrgId ? { organizationId: selectedOrgId as Id<'organizations'> } : 'skip',
  ) as RoomDoc[] | undefined;
  const rooms = useMemo(() => roomsData ?? [], [roomsData]);

  const roomDateMap = useMemo(() => {
    const map = new Map<string, RoomBookingDoc[]>();
    scopedRoomBookings.forEach((booking) => {
      const cursor = new Date(booking.startTime);
      cursor.setHours(0, 0, 0, 0);
      const end = new Date(booking.endTime);
      while (cursor <= end) {
        const key = format(cursor, 'yyyy-MM-dd');
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(booking);
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return map;
  }, [scopedRoomBookings]);

  // Badge counts for the switcher — how much each scope holds in the visible
  // month, so switching is an informed choice instead of a guess.
  const scopeCounts = useMemo(() => {
    const monthLeaves = leaves.filter(
      (l) => l.status !== 'rejected' && overlapsMonth(l.startDate, l.endDate, currentMonth),
    );
    // Driver bookings are already queried for the visible month only.
    const monthDrivers = driverSchedules ?? [];
    const monthCustom = customEvents.filter((e) => {
      const d = safeDate(e.date);
      return d ? isSameMonth(d, currentMonth) : false;
    });
    // Google entries come from the viewer's own account — personal in both scopes.
    const googleCount = googleEvents.length;
    const monthRooms = roomBookings;
    return {
      mine:
        monthLeaves.filter((l) => isMyLeave(l, viewer)).length +
        monthDrivers.filter((d) => isMyDriverEvent(d, viewer)).length +
        monthCustom.filter((e) => isMyCustomEvent(e, viewer)).length +
        monthRooms.filter((b) => isMyRoomBooking(b, viewer)).length +
        googleCount,
      team:
        monthLeaves.length +
        monthDrivers.length +
        monthCustom.length +
        monthRooms.length +
        googleCount,
    };
  }, [leaves, driverSchedules, customEvents, googleEvents, roomBookings, currentMonth, viewer]);

  // Build driver schedule map
  const driverDateMap = useMemo(() => {
    const map = new Map<string, DriverScheduleEvent[]>();
    scopedDriverSchedules.forEach((evt) => {
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
  }, [scopedDriverSchedules]);

  // Build leave map
  const leaveDateMap = useMemo(() => {
    const map = new Map<string, LeaveRequest[]>();
    scopedLeaves
      .filter((r) => r.status !== 'rejected')
      .forEach((req) => {
        getDateRange(req.startDate, req.endDate).forEach((d) => {
          const key = format(d, 'yyyy-MM-dd');
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(req);
        });
      });
    return map;
  }, [scopedLeaves]);

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

  // Build custom events map
  const customEventsMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    scopedCustomEvents.forEach((evt) => {
      if (!map.has(evt.date)) map.set(evt.date, []);
      map.get(evt.date)!.push(evt);
    });
    return map;
  }, [scopedCustomEvents]);

  /**
   * Build the company events map.
   *
   * These carry timestamps rather than `yyyy-MM-dd`, and a multi-day event has to
   * appear on every day it covers — a three-day conference that only marked its
   * first day would look like it had been cancelled on the second.
   */
  const companyEventsMap = useMemo(() => {
    const map = new Map<string, CompanyEvent[]>();
    scopedCompanyEvents.forEach((evt) => {
      const cur = new Date(evt.startDate);
      cur.setHours(0, 0, 0, 0);
      const last = new Date(Math.max(evt.endDate, evt.startDate));
      last.setHours(0, 0, 0, 0);
      while (cur <= last) {
        const key = format(cur, 'yyyy-MM-dd');
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(evt);
        cur.setDate(cur.getDate() + 1);
      }
    });
    return map;
  }, [scopedCompanyEvents]);

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

  const selectedDayCustomEvents = useMemo(() => {
    if (!selectedDay) return [];
    return customEventsMap.get(format(selectedDay, 'yyyy-MM-dd')) ?? [];
  }, [selectedDay, customEventsMap]);

  const selectedDayRoomBookings = useMemo(() => {
    if (!selectedDay) return [];
    return roomDateMap.get(format(selectedDay, 'yyyy-MM-dd')) ?? [];
  }, [selectedDay, roomDateMap]);

  const selectedDayCompanyEvents = useMemo(() => {
    if (!selectedDay) return [];
    return companyEventsMap.get(format(selectedDay, 'yyyy-MM-dd')) ?? [];
  }, [selectedDay, companyEventsMap]);

  /**
   * How many entries the personal view hides on the selected day. Surfacing the
   * number (instead of silently dropping them) keeps the empty state honest and
   * gives a one-click way to reveal them.
   */
  const hiddenOnSelectedDay = useMemo(() => {
    if (!isPersonalScope || !selectedDay) return 0;
    const key = format(selectedDay, 'yyyy-MM-dd');
    const teamLeaves = leaves.filter(
      (l) => l.status !== 'rejected' && l.startDate <= key && l.endDate >= key,
    ).length;
    const teamDrivers = (driverSchedules ?? []).filter(
      (evt) =>
        format(new Date(evt.startTime), 'yyyy-MM-dd') <= key &&
        format(new Date(evt.endTime), 'yyyy-MM-dd') >= key,
    ).length;
    const teamCustom = customEvents.filter((evt) => evt.date === key).length;
    const teamCompany = companyEvents.filter(
      (evt) =>
        format(new Date(evt.startDate), 'yyyy-MM-dd') <= key &&
        format(new Date(Math.max(evt.endDate, evt.startDate)), 'yyyy-MM-dd') >= key,
    ).length;
    const teamRooms = roomBookings.filter(
      (booking) =>
        format(new Date(booking.startTime), 'yyyy-MM-dd') <= key &&
        format(new Date(booking.endTime), 'yyyy-MM-dd') >= key,
    ).length;
    const visible =
      selectedDayLeaves.length +
      selectedDayDriverEvents.length +
      selectedDayCustomEvents.length +
      selectedDayRoomBookings.length +
      selectedDayCompanyEvents.length;
    return Math.max(0, teamLeaves + teamDrivers + teamCustom + teamRooms + teamCompany - visible);
  }, [
    isPersonalScope,
    selectedDay,
    leaves,
    driverSchedules,
    customEvents,
    roomBookings,
    companyEvents,
    selectedDayLeaves.length,
    selectedDayDriverEvents.length,
    selectedDayCustomEvents.length,
    selectedDayRoomBookings.length,
    selectedDayCompanyEvents.length,
  ]);

  const prevMonth = () => setCurrentMonth((m) => subMonths(m, 1));
  const nextMonth = () => setCurrentMonth((m) => addMonths(m, 1));
  const goToday = () => {
    const t = new Date();
    setCurrentMonth(t);
    setSelectedDay(t);
  };

  // Booking is allowed only for today and future dates. Past days are view-only.
  const guardBooking = (date: Date | null, open: () => void) => {
    if (date && isPastDate(date)) {
      toast.error(t('calendar.cannotBookPast', 'You can only book today or future dates'));
      return;
    }
    open();
  };

  // Double-clicking any event row opens the full timeline; a single click keeps
  // the existing lightweight preview.
  const dualClick = useDualClick();
  const scrollToTop = useCallback(() => {
    setTimeout(() => {
      mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  }, [mainRef]);

  // Monthly summary
  const monthlySummary = useMemo(() => {
    return (Object.keys(LEAVE_TYPE_LABELS) as LeaveType[])
      .map((type) => {
        const count = scopedLeaves.filter(
          (r) =>
            r.type === type &&
            r.status !== 'rejected' &&
            (isSameMonth(new Date(r.startDate), currentMonth) ||
              isSameMonth(new Date(r.endDate), currentMonth)),
        ).length;
        return { type, count };
      })
      .filter((s) => s.count > 0);
  }, [scopedLeaves, currentMonth]);

  // On leave today
  const onLeaveToday = useMemo(() => {
    if (!mounted) return [];
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return scopedLeaves.filter(
      (r) => r.status === 'approved' && r.startDate <= todayStr && r.endDate >= todayStr,
    );
  }, [mounted, scopedLeaves]);

  if (!mounted) return null;

  return (
    <TooltipProvider delayDuration={250}>
      <div className="space-y-6">
        {/* -- Sticky Header -- */}
        <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary)">
                  {t(`calendarScope.${scope}.title`)}
                </h2>
                <p className="text-(--text-muted) text-sm mt-1">
                  {t(`calendarScope.${scope}.subtitle`)}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <Button variant="outline" size="sm" onClick={goToday} className="w-full sm:w-auto">
                  <CalendarDays className="w-4 h-4" />
                  {t('buttons.today')}
                </Button>
                <Button
                  size="sm"
                  onClick={() => guardBooking(selectedDay, () => setShowLeaveModal(true))}
                  className="flex items-center gap-2 w-full sm:w-auto justify-center btn-gradient text-white font-medium shadow-md hover:shadow-lg"
                >
                  <Plus className="w-4 h-4" />
                  {t('calendar.newLeave')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => guardBooking(selectedDay, () => setShowCreateEvent(true))}
                  className="flex items-center gap-2 w-full sm:w-auto justify-center"
                >
                  <Plus className="w-4 h-4" />
                  {t('createMeeting.title')}
                </Button>
              </div>
            </div>

            {/* Scope switcher — personal vs. shared calendar */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <CalendarScopeSwitcher value={scope} onChange={changeScope} counts={scopeCounts} />
              <p className="hidden lg:block text-xs text-(--text-muted)">
                {t(`calendarScope.${scope}.hint`)}
              </p>
              {/* Politely announced so the change is not silent for screen readers. */}
              <span aria-live="polite" className="sr-only">
                {t(`calendarScope.${scope}.announce`)}
              </span>
            </div>
          </div>
        </div>

        <div
          id="calendar-scope-panel"
          role="tabpanel"
          aria-labelledby={`calendar-scope-${scope}`}
          className="grid grid-cols-1 xl:grid-cols-4 gap-6"
        >
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
                      {standaloneMonth(currentMonth, lang, true)}
                    </motion.h3>
                    <Button size="icon-sm" variant="ghost" onClick={nextMonth}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Quick month stats */}
                  <div className="hidden sm:flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-(--success-solid)" />
                      <span className="text-(--text-muted)">
                        {
                          scopedLeaves.filter(
                            (r) =>
                              r.status === 'approved' &&
                              isSameMonth(new Date(r.startDate), currentMonth),
                          ).length
                        }{' '}
                        {t('leave.approved')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-(--warning-solid)" />
                      <span className="text-(--text-muted)">
                        {
                          scopedLeaves.filter(
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
                      const cEvents = customEventsMap.get(key) ?? [];
                      const rBookings = roomDateMap.get(key) ?? [];
                      const orgEvents = companyEventsMap.get(key) ?? [];
                      return (
                        <ContextMenu key={i}>
                          <ContextMenuTrigger>
                            <DayCell
                              date={date}
                              currentMonth={currentMonth}
                              selected={selectedDay}
                              leaves={leaves}
                              googleEvents={gEvents}
                              driverEvents={dEvents}
                              customEvents={cEvents}
                              roomBookings={rBookings}
                              companyEvents={orgEvents}
                              onClick={() => setSelectedDay(date)}
                              onDoubleClick={() => {
                                setSelectedDay(date);
                                // A day holding exactly one entry goes straight to
                                // its timeline; several entries need the day list
                                // first (each row there opens its own timeline).
                                // An empty day keeps the "create event" shortcut.
                                const single =
                                  rBookings.length === 0
                                    ? singleTimelineFor(
                                        leaves,
                                        gEvents,
                                        dEvents,
                                        cEvents,
                                        orgEvents,
                                      )
                                    : null;
                                if (single) {
                                  setTimelineInput(single);
                                } else if (
                                  leaves.length +
                                    gEvents.length +
                                    dEvents.length +
                                    cEvents.length +
                                    rBookings.length +
                                    orgEvents.length >
                                  0
                                ) {
                                  setShowDayDetails(true);
                                } else {
                                  guardBooking(date, () => setShowCreateEvent(true));
                                }
                              }}
                              onDropEvent={(event) => {
                                void handleMoveEventToDay(event, date);
                              }}
                            />
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-52">
                            <ContextMenuItem
                              disabled={isPastDate(date)}
                              onSelect={() =>
                                setTimeout(() => {
                                  setSelectedDay(date);
                                  guardBooking(date, () => setShowCreateEvent(true));
                                })
                              }
                              className="gap-2"
                            >
                              <CalendarPlus className="w-4 h-4 text-(--brand-text)" />
                              {t('createMeeting.contextMenu.newEvent')}
                            </ContextMenuItem>
                            <ContextMenuItem
                              disabled={isPastDate(date)}
                              onSelect={() =>
                                setTimeout(() => {
                                  setSelectedDay(date);
                                  guardBooking(date, () => setShowLeaveModal(true));
                                })
                              }
                              className="gap-2"
                            >
                              <CalendarDays className="w-4 h-4 text-(--success-text)" />
                              {t('createMeeting.contextMenu.newLeave')}
                            </ContextMenuItem>
                            <ContextMenuItem
                              disabled={isPastDate(date)}
                              onSelect={() =>
                                setTimeout(() => {
                                  setSelectedDay(date);
                                  guardBooking(date, () => setShowDriverModal(true));
                                })
                              }
                              className="gap-2"
                            >
                              <Car className="w-4 h-4 text-(--warning-text)" />
                              {t('createMeeting.contextMenu.bookDriver')}
                            </ContextMenuItem>
                            <ContextMenuItem
                              disabled={isPastDate(date) || rooms.length === 0}
                              onSelect={() =>
                                setTimeout(() => {
                                  setSelectedDay(date);
                                  guardBooking(date, () => {
                                    setRoomBookingRoomId(null);
                                    setRoomBookingDate(date);
                                    setShowRoomBooking(true);
                                  });
                                })
                              }
                              className="gap-2"
                            >
                              <DoorOpen className="w-4 h-4 text-(--brand-text)" />
                              {t('rooms.bookRoom')}
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              onSelect={() => {
                                setSelectedDay(date);
                                setShowDayDetails(true);
                              }}
                              className="gap-2"
                            >
                              <Clock className="w-4 h-4 text-(--text-muted)" />
                              {t('createMeeting.contextMenu.viewDay')}
                            </ContextMenuItem>
                            <ContextMenuItem
                              onSelect={() => {
                                navigator.clipboard.writeText(format(date, 'yyyy-MM-dd'));
                                toast.success(t('createMeeting.contextMenu.copyDate'));
                              }}
                              className="gap-2"
                            >
                              <ClipboardCopy className="w-4 h-4 text-(--text-muted)" />
                              {t('createMeeting.contextMenu.copyDate')}
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
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
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: ROOM_EVENT_COLOR }}
                />
                <span className="text-xs text-(--text-muted)">{t('rooms.calendar.legend')}</span>
              </div>
              {companyEvents.length > 0 && (
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: COMPANY_EVENT_COLOR }}
                  />
                  <span className="text-xs text-(--text-muted)">
                    {t('dayDetails.companyEvents')}
                  </span>
                </div>
              )}
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
                  {selectedDay ? fullDayLabel(selectedDay, lang) : t('calendar.selectADay')}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 scrollbar-hide">
                <AnimatePresence mode="wait">
                  {selectedDayLeaves.length === 0 &&
                  selectedDayGoogle.length === 0 &&
                  selectedDayDriverEvents.length === 0 &&
                  selectedDayCustomEvents.length === 0 &&
                  selectedDayRoomBookings.length === 0 &&
                  selectedDayCompanyEvents.length === 0 ? (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="py-6 text-center overflow-hidden"
                    >
                      <CalendarDays className="w-8 h-8 text-(--border) mx-auto mb-2" />
                      <p className="text-sm text-(--text-muted)">
                        {t(`calendarScope.${scope}.emptyDay`)}
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
                      {/* Company events — first, they concern the whole org */}
                      {selectedDayCompanyEvents.map((event, i) => {
                        const accent =
                          COMPANY_EVENT_ACCENTS[event.eventType] ?? COMPANY_EVENT_COLOR;
                        return (
                          <motion.div
                            key={event._id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}
                            title={t('eventTimeline.hints.doubleClick')}
                            className="flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors"
                            style={{ borderColor: `${accent}55`, background: `${accent}0f` }}
                            onClick={() =>
                              dualClick.single(() => {
                                setShowDayDetails(true);
                              })
                            }
                            onDoubleClick={() =>
                              dualClick.double(() =>
                                setTimelineInput({
                                  source: 'company',
                                  data: toCompanyTimelineData(event),
                                }),
                              )
                            }
                          >
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                              style={{ background: `${accent}1f`, color: accent }}
                            >
                              <Building2 className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-(--text-primary) truncate">
                                {event.name}
                              </p>
                              <p className="text-xs truncate" style={{ color: accent }}>
                                {t(`event.types.${event.eventType}`, {
                                  defaultValue: event.eventType,
                                })}
                              </p>
                              <p className="text-[11px] text-(--text-muted) mt-0.5 truncate">
                                {event.isAllDay === false
                                  ? `${format(new Date(event.startDate), 'HH:mm')} – ${format(
                                      new Date(Math.max(event.endDate, event.startDate)),
                                      'HH:mm',
                                    )}`
                                  : t('createMeeting.allDay')}
                                {event.requiredDepartments.length > 0
                                  ? ` · ${event.requiredDepartments.join(', ')}`
                                  : ` · ${t('dayDetails.wholeCompany')}`}
                              </p>
                            </div>
                          </motion.div>
                        );
                      })}

                      {/* Leave requests */}
                      {selectedDayLeaves.map((leave, i) => (
                        <motion.div
                          key={leave._id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.04 }}
                          title={t('eventTimeline.hints.doubleClick')}
                          className="flex items-start gap-2.5 p-2.5 rounded-lg border border-(--border) bg-(--background-subtle) cursor-pointer hover:border-(--primary)/50 transition-colors"
                          onClick={() =>
                            dualClick.single(() => {
                              setSelectedLeave(leave);
                              scrollToTop();
                            })
                          }
                          onDoubleClick={() =>
                            dualClick.double(() =>
                              setTimelineInput({ source: 'leave', data: leave }),
                            )
                          }
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
                          title={t('eventTimeline.hints.doubleClick')}
                          className="flex items-start gap-2.5 p-2.5 rounded-lg border border-(--border) bg-(--background-subtle) cursor-pointer hover:border-(--primary)/50 transition-colors"
                          onClick={() =>
                            dualClick.single(() => {
                              setSelectedGoogleEvent(evt);
                              scrollToTop();
                            })
                          }
                          onDoubleClick={() =>
                            dualClick.double(() =>
                              setTimelineInput({ source: 'google', data: evt }),
                            )
                          }
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
                                {format(new Date(evt.startTime), 'HH:mm', {
                                  locale: dateFnsLocale,
                                })}
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
                          title={t('eventTimeline.hints.doubleClick')}
                          className="flex items-start gap-2.5 p-2.5 rounded-lg border border-(--border) bg-(--background-subtle) cursor-pointer hover:border-(--primary)/50 transition-colors"
                          onClick={() =>
                            dualClick.single(() => {
                              setSelectedDriverEvent(evt);
                              scrollToTop();
                            })
                          }
                          onDoubleClick={() =>
                            dualClick.double(() =>
                              setTimelineInput({ source: 'driver', data: evt }),
                            )
                          }
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
                              {format(new Date(evt.startTime), 'HH:mm', { locale: dateFnsLocale })}{' '}
                              – {format(new Date(evt.endTime), 'HH:mm', { locale: dateFnsLocale })}
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

                      {/* Custom calendar events */}
                      {selectedDayCustomEvents.map((evt, i) => (
                        <motion.div
                          key={evt.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            delay:
                              (selectedDayLeaves.length +
                                selectedDayGoogle.length +
                                selectedDayDriverEvents.length +
                                i) *
                              0.04,
                          }}
                          title={t('eventTimeline.hints.doubleClick')}
                          className="flex items-start gap-2.5 p-2.5 rounded-lg border border-(--brand-outline) dark:border-(--brand-outline) bg-(--brand-quiet) cursor-pointer hover:border-(--brand-outline) transition-colors group"
                          onClick={() =>
                            dualClick.single(() => {
                              setEditEvent(evt);
                              setShowCreateEvent(true);
                            })
                          }
                          onDoubleClick={() =>
                            dualClick.double(() =>
                              setTimelineInput({ source: 'custom', data: evt }),
                            )
                          }
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-(--brand) text-white">
                            <CalendarPlus className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-(--text-primary) truncate">
                              {evt.title}
                            </p>
                            <p className="text-[10px] text-(--text-muted) mt-0.5">
                              {evt.allDay
                                ? t('createMeeting.allDay')
                                : `${evt.startTime} – ${evt.endTime}`}
                            </p>
                            {evt.location && (
                              <p className="text-[10px] text-(--text-muted) mt-0.5 truncate">
                                📍 {evt.location}
                              </p>
                            )}
                            <div className="flex items-center gap-1 mt-1">
                              <span className="w-2 h-2 rounded-full shrink-0 bg-(--brand)" />
                              <span className="text-[10px] text-(--text-secondary)">
                                {t('createMeeting.categories.' + evt.category, evt.category)}
                              </span>
                            </div>
                            {evt.roomName && (
                              <p className="mt-1 inline-flex max-w-full items-center gap-1 truncate rounded-full bg-(--background) px-1.5 py-0.5 text-[10px] text-(--text-secondary)">
                                <DoorOpen className="h-3 w-3 shrink-0" />
                                <span className="truncate">{evt.roomName}</span>
                              </p>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteEvent(evt);
                            }}
                            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-(--danger-quiet) transition-all shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-(--danger-text)" />
                          </button>
                        </motion.div>
                      ))}

                      {/* Room bookings */}
                      {selectedDayRoomBookings.map((booking, i) => {
                        const color = booking.roomColor ?? ROOM_EVENT_COLOR;
                        return (
                          <motion.div
                            key={booking._id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              delay:
                                (selectedDayLeaves.length +
                                  selectedDayGoogle.length +
                                  selectedDayDriverEvents.length +
                                  selectedDayCustomEvents.length +
                                  i) *
                                0.04,
                            }}
                            role="button"
                            tabIndex={0}
                            title={t('rooms.calendar.openRoom')}
                            onClick={() => {
                              const room = rooms.find((r) => r._id === booking.roomId);
                              if (room) setDetailsRoom(room);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                const room = rooms.find((r) => r._id === booking.roomId);
                                if (room) setDetailsRoom(room);
                              }
                            }}
                            className="flex items-start gap-2.5 p-2.5 rounded-lg border border-(--border) bg-(--background-subtle) cursor-pointer hover:border-(--primary)/50 transition-colors"
                          >
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white"
                              style={{ background: color }}
                            >
                              <DoorOpen className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-(--text-primary) truncate">
                                {booking.title}
                              </p>
                              <p className="text-[10px] text-(--text-muted) mt-0.5 truncate">
                                {format(new Date(booking.startTime), 'HH:mm', {
                                  locale: dateFnsLocale,
                                })}
                                {' – '}
                                {format(new Date(booking.endTime), 'HH:mm', {
                                  locale: dateFnsLocale,
                                })}
                                {booking.organizerName ? ` · ${booking.organizerName}` : ''}
                              </p>
                              <div className="flex items-center gap-1 mt-1 min-w-0">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ background: color }}
                                />
                                <span className="text-[10px] text-(--text-secondary) truncate">
                                  {booking.roomName}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Personal view: reveal what the shared calendar still holds. */}
                {hiddenOnSelectedDay > 0 && (
                  <button
                    type="button"
                    onClick={() => changeScope('team')}
                    className="mt-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-(--border) bg-(--background-subtle) px-3 py-2.5 text-left transition-colors hover:border-(--primary)/50 hover:bg-(--background) cursor-pointer"
                  >
                    <Eye className="h-4 w-4 shrink-0 text-(--primary)" />
                    <span className="min-w-0 flex-1 text-[11px] leading-snug text-(--text-secondary)">
                      {t('calendarScope.hiddenOnDay', { count: hiddenOnSelectedDay })}
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold text-(--primary)">
                      {t('calendarScope.showShared')}
                    </span>
                  </button>
                )}
              </CardContent>
            </Card>

            {/* Live meeting-room availability */}
            <RoomAvailabilityStrip
              organizationId={selectedOrgId}
              onOpenRoom={(room) => setDetailsRoom(room)}
              onBookRoom={(room) => {
                setRoomBookingRoomId(room._id);
                setRoomBookingDate(selectedDay ?? new Date());
                setShowRoomBooking(true);
              }}
            />

            {/* Monthly summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm uppercase tracking-wider text-(--text-muted)">
                  {t('calendarExtended.monthSummary', {
                    month: standaloneMonth(currentMonth, lang),
                  })}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {monthlySummary.length === 0 ? (
                  <p className="text-xs text-(--text-muted)">
                    {t(`calendarScope.${scope}.emptyMonth`)}
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
                    {isPersonalScope
                      ? t('calendarScope.mine.statusToday')
                      : t('calendar.onLeaveToday')}
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
                      {isPersonalScope
                        ? t('calendarScope.mine.youAreIn')
                        : t('calendarExtended.everyoneInToday')}
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
          onOpenChange={(v) => {
            setShowCreateEvent(v);
            if (!v) setEditEvent(null);
          }}
          selectedDate={selectedDay}
          // Deliberately unscoped: attendee conflict detection has to see every
          // leave in the organization, not just the ones the viewer owns.
          leaves={leaves}
          editEvent={editEvent}
        />

        {/* "Draft saved. Restore?" — the event wizard and the leave request both
          keep their contents after an accidental close; this is what tells the
          user so. One bar at a time: the event draft wins, because it is the
          longer form and the more expensive one to lose. */}
        <DraftResumeBar
          show={eventDraft.available}
          label={t('createMeeting.title')}
          step={eventDraft.step}
          onResume={() => {
            eventDraft.dismiss();
            setEditEvent(null);
            setShowCreateEvent(true);
          }}
          onDismiss={eventDraft.dismiss}
          onDiscard={eventDraft.discard}
        />
        <DraftResumeBar
          show={!eventDraft.available && leaveDraft.available}
          label={t('leaveRequest.newLeaveRequest', 'New Leave Request')}
          step={leaveDraft.step}
          onResume={() => {
            leaveDraft.dismiss();
            setShowLeaveModal(true);
          }}
          onDismiss={leaveDraft.dismiss}
          onDiscard={leaveDraft.discard}
        />

        {/* Day Details Modal */}
        {selectedDay && (
          <DayDetailsModal
            open={showDayDetails}
            date={selectedDay}
            leaves={selectedDayLeaves}
            googleEvents={selectedDayGoogle}
            driverEvents={selectedDayDriverEvents}
            customEvents={selectedDayCustomEvents}
            roomBookings={selectedDayRoomBookings}
            companyEvents={selectedDayCompanyEvents}
            onClose={() => setShowDayDetails(false)}
            onOpenTimeline={setTimelineInput}
            onOpenRoom={(roomId) => {
              const room = rooms.find((r) => r._id === roomId);
              if (room) {
                setShowDayDetails(false);
                setDetailsRoom(room);
              }
            }}
          />
        )}

        {/* Meeting room booking */}
        <RoomBookingModal
          open={showRoomBooking}
          onClose={() => setShowRoomBooking(false)}
          organizationId={selectedOrgId}
          rooms={rooms}
          initialRoomId={roomBookingRoomId}
          initialDate={roomBookingDate}
        />

        {/* Meeting room details */}
        <RoomDetailsModal
          open={detailsRoom !== null}
          onClose={() => setDetailsRoom(null)}
          room={detailsRoom}
          canManage={user?.role === 'admin' || user?.role === 'superadmin'}
          onBook={(room, day) => {
            setDetailsRoom(null);
            setRoomBookingRoomId(room._id);
            setRoomBookingDate(day);
            setShowRoomBooking(true);
          }}
        />

        {/* Full event timeline — opened by double-clicking any event */}
        <EventTimelineModal input={timelineInput} onClose={() => setTimelineInput(null)} />

        {/* Modals rendered via portal to escape overflow/contain constraints */}
        {typeof document !== 'undefined' &&
          createPortal(
            <>
              {/* Leave Event Detail Modal - Modern Design */}
              {selectedLeave && (
                <div className="fixed inset-0 lg:left-60 lg:top-16 z-50 flex items-center justify-center p-4">
                  <div
                    className="modal-backdrop-in absolute inset-0 bg-black/60 backdrop-blur-md"
                    onClick={() => setSelectedLeave(null)}
                  />
                  <div
                    className="modal-panel-in relative z-10 w-full max-w-lg bg-(--card) rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
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
                              <CheckCircle className="w-5 h-5 text-(--success-text)" />
                            ) : selectedLeave.status === 'rejected' ? (
                              <XCircle className="w-5 h-5 text-(--danger-text)" />
                            ) : (
                              <Clock className="w-5 h-5 text-(--warning-text)" />
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
                  </div>
                </div>
              )}

              {/* Driver Event Detail Modal - Modern Design */}
              {selectedDriverEvent && (
                <div className="fixed inset-0 lg:left-60 lg:top-16 z-50 flex items-center justify-center p-4">
                  <div
                    className="modal-backdrop-in absolute inset-0 bg-black/60 backdrop-blur-md"
                    onClick={() => setSelectedDriverEvent(null)}
                  />
                  <div
                    className="modal-panel-in relative z-10 w-full max-w-lg bg-(--card) rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
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
                                <div className="w-3 h-3 rounded-full bg-(--success-solid) mt-1.5 shrink-0" />
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
                                <div className="w-3 h-3 rounded-full bg-(--danger-solid) mt-1.5 shrink-0" />
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
                              <CheckCircle className="w-5 h-5 text-(--success-text)" />
                            ) : selectedDriverEvent.status === 'cancelled' ? (
                              <XCircle className="w-5 h-5 text-(--danger-text)" />
                            ) : (
                              <Clock className="w-5 h-5 text-(--warning-text)" />
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
                  </div>
                </div>
              )}
              {/* Google Calendar Event Detail Modal */}
              {selectedGoogleEvent && (
                <div className="fixed inset-0 lg:left-60 lg:top-16 z-50 flex items-center justify-center p-4">
                  <div
                    className="modal-backdrop-in absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={() => setSelectedGoogleEvent(null)}
                  />
                  <div
                    className="modal-panel-in relative z-10 w-full max-w-md rounded-2xl border border-(--border) bg-(--card) shadow-2xl overflow-hidden"
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
                  </div>
                </div>
              )}
            </>,
            document.body,
          )}
      </div>
    </TooltipProvider>
  );
});

export default CalendarClient;
