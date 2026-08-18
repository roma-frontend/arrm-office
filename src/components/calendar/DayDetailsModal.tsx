'use client';

import React from 'react';
import { motion } from '@/lib/cssMotion';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  Clock,
  CheckCircle,
  XCircle,
  X,
  MapPin,
  Car,
  CalendarPlus,
  ExternalLink,
  DoorOpen,
  Building2,
  Users,
  Video,
  Copy,
} from 'lucide-react';
import { format, isToday } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
// Migrated from a hand-rolled `createPortal` centered modal to the shared
// slide-over. The old wrapper had no `role="dialog"`, no `aria-modal`, no focus
// trap and no Escape handling — closing it was mouse-only. It also covered the
// middle of the screen, which is exactly where the calendar grid the user had
// just clicked lives; a right-side panel leaves the month visible.
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { getLeaveTypeLabel, type LeaveType, type LeaveStatus } from '@/lib/types';
import { getInitials } from '@/lib/stringUtils';
import type { CalendarEvent } from './CreateEventModal';
import {
  COMPANY_EVENT_ACCENTS,
  type CompanyTimelineData,
  type TimelineInput,
} from '@/lib/eventTimeline';
import type { RoomBookingDoc } from '@/components/rooms/types';

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
  createdAt?: number;
  reviewedAt?: number;
  reviewerName?: string;
  reviewComment?: string;
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
  createdAt?: number;
};

/** Row data → timeline input, so a double-click opens the full event. */
function toCompanyTimeline(event: CompanyEvent): CompanyTimelineData {
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

const LEAVE_TYPE_BG: Record<string, string> = {
  paid: '#2563eb',
  unpaid: '#f59e0b',
  sick: '#ef4444',
  family: '#10b981',
  doctor: '#06b6d4',
};

interface DayDetailsModalProps {
  open: boolean;
  date: Date;
  leaves: LeaveRequest[];
  googleEvents: GoogleCalendarEvent[];
  driverEvents: DriverScheduleEvent[];
  customEvents: CalendarEvent[];
  /** Meeting-room bookings for the day. */
  roomBookings?: RoomBookingDoc[];
  /** Organization-wide events from `/admin/events`. */
  companyEvents?: CompanyEvent[];
  onClose: () => void;
  /** Double-clicking a row hands the entry up to the timeline modal. */
  onOpenTimeline?: (input: TimelineInput) => void;
  /** Clicking a room booking opens that room's details. */
  onOpenRoom?: (roomId: string) => void;
}

export function DayDetailsModal({
  open,
  date,
  leaves,
  googleEvents,
  driverEvents,
  customEvents,
  roomBookings = [],
  companyEvents = [],
  onClose,
  onOpenTimeline,
  onOpenRoom,
}: DayDetailsModalProps) {
  const { t } = useTranslation();
  const lang = i18n.language || 'en';
  const locale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;
  const totalEvents =
    leaves.length +
    googleEvents.length +
    driverEvents.length +
    customEvents.length +
    roomBookings.length +
    companyEvents.length;

  // Spread onto an event row to make it open its timeline on double-click.
  const rowProps = (input: TimelineInput) =>
    onOpenTimeline
      ? {
          onDoubleClick: () => onOpenTimeline(input),
          title: t('eventTimeline.hints.doubleClick'),
        }
      : {};

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        size="lg"
        hideClose
        closeLabel={t('common.close', 'Close')}
        className="p-0"
      >
        {/* Header. Sticky and non-shrinking (see `.spark-sheet-header`), so the
            date and the close control stay reachable however long the day is. */}
        <SheetHeader className="px-6 pb-5 pt-6 pr-6">
          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 flex-col items-center justify-center rounded-2xl border border-(--brand-outline) bg-(--brand-quiet)">
                <span className="num text-lg font-semibold leading-none text-(--brand-text)">
                  {format(date, 'd')}
                </span>
                <span className="text-[10px] font-medium uppercase text-(--brand-text)/70">
                  {format(date, 'MMM', { locale })}
                </span>
              </div>
              <div>
                <SheetTitle className="text-title leading-tight">
                  {format(date, 'EEEE', { locale })}
                </SheetTitle>
                <p className="mt-0.5 text-label text-(--text-3)">
                  {format(date, 'd MMMM yyyy', { locale })}
                </p>
              </div>
            </div>
            <SheetClose
              className="shrink-0 rounded-control p-2 text-(--text-3) transition-colors duration-140 ease-spark hover:bg-(--surface-2) hover:text-(--text-1) focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
              aria-label={t('common.close', 'Close')}
            >
              <X className="h-5 w-5" />
            </SheetClose>
          </div>

          {/* Summary badges */}
          <div className="relative mt-4 flex flex-wrap gap-2">
            {isToday(date) && <Badge variant="primary">{t('timePeriods.today')}</Badge>}
            <Badge variant="secondary">
              {totalEvents} {t('dayDetails.events', 'events')}
            </Badge>
            {leaves.length > 0 && (
              <Badge variant="info">
                {leaves.length} {t('dayDetails.leaves', 'leaves')}
              </Badge>
            )}
          </div>
        </SheetHeader>

        {/* Content */}
        <SheetBody className="space-y-3 px-6 pb-6">
          {totalEvents === 0 ? (
            <div className="py-10 text-center">
              <CalendarDays className="mx-auto mb-3 h-12 w-12 text-(--text-4)" />
              <p className="text-body text-(--text-3)">
                {t('dayDetails.noEvents', 'No events on this day')}
              </p>
            </div>
          ) : (
            <>
              {/* Company events — organization-wide, so they lead the day */}
              {companyEvents.length > 0 && (
                <Section title={t('dayDetails.companyEvents')}>
                  {companyEvents.map((event, i) => {
                    const accent = COMPANY_EVENT_ACCENTS[event.eventType] ?? '#0d9488';
                    const audience =
                      event.requiredDepartments.length > 0
                        ? event.requiredDepartments.join(', ')
                        : event.requiredEmployeeIds.length > 0
                          ? t('dayDetails.namedAttendees', {
                              count: event.requiredEmployeeIds.length,
                            })
                          : t('dayDetails.wholeCompany');
                    return (
                      <motion.div
                        key={event._id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        {...rowProps({ source: 'company', data: toCompanyTimeline(event) })}
                        className="flex items-start gap-3 p-3 rounded-xl border border-(--border) bg-(--background-subtle) hover:border-(--primary)/40 transition-colors cursor-pointer"
                      >
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: `${accent}1a`, color: accent }}
                        >
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-(--text-primary) truncate">
                              {event.name}
                            </p>
                            {event.priority && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] shrink-0"
                                style={{ background: `${accent}1a`, color: accent }}
                              >
                                {t(`priority.${event.priority}`, { defaultValue: event.priority })}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs mt-0.5" style={{ color: accent }}>
                            {t(`event.types.${event.eventType}`, { defaultValue: event.eventType })}
                          </p>
                          <p className="text-xs text-(--text-muted) mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3 shrink-0" />
                            {event.isAllDay === false
                              ? `${format(new Date(event.startDate), 'HH:mm')} – ${format(new Date(Math.max(event.endDate, event.startDate)), 'HH:mm')}`
                              : t('createMeeting.allDay')}
                          </p>
                          <p className="text-xs text-(--text-muted) mt-0.5 truncate">
                            {t('dayDetails.attendance', { audience })}
                          </p>
                          {event.description && (
                            <p className="text-xs text-(--text-muted) mt-1 line-clamp-2">
                              {event.description}
                            </p>
                          )}
                          <a
                            href={`/events/${event._id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs font-medium mt-1.5 inline-flex items-center gap-1 hover:underline"
                            style={{ color: accent }}
                          >
                            {t('dayDetails.openEvent')}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </motion.div>
                    );
                  })}
                </Section>
              )}

              {/* Leave Requests */}
              {leaves.length > 0 && (
                <Section title={t('dayDetails.leaveRequests', 'Leave Requests')}>
                  {leaves.map((leave, i) => (
                    <motion.div
                      key={leave._id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      {...rowProps({ source: 'leave', data: leave })}
                      className="flex items-start gap-3 p-3 rounded-xl border border-(--border) bg-(--background-subtle) hover:border-(--primary)/40 transition-colors cursor-pointer"
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
                        style={{ background: LEAVE_TYPE_BG[leave.type] || 'var(--text-4)' }}
                      >
                        {getInitials(leave.userName ?? '?')}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-(--text-primary) truncate">
                            {leave.userName ?? t('common.unknownUser', 'Unknown')}
                          </p>
                          <StatusBadge status={leave.status as LeaveStatus} t={t} />
                        </div>
                        {leave.userDepartment && (
                          <p className="text-xs text-(--text-muted) mt-0.5">
                            {leave.userDepartment}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: LEAVE_TYPE_BG[leave.type] }}
                          />
                          <span className="text-xs text-(--text-secondary)">
                            {getLeaveTypeLabel(leave.type as LeaveType, t)}
                          </span>
                          <span className="text-xs text-(--text-muted)">
                            · {leave.days} {t('leave.daysSuffix', 'd')}
                          </span>
                        </div>
                        {leave.reason && (
                          <p className="text-xs text-(--text-muted) mt-1.5 italic line-clamp-2">
                            &quot;{leave.reason}&quot;
                          </p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </Section>
              )}

              {/* Custom Events */}
              {customEvents.length > 0 && (
                <Section title={t('dayDetails.calendarEvents', 'Calendar Events')}>
                  {customEvents.map((evt, i) => (
                    <motion.div
                      key={evt.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      {...rowProps({ source: 'custom', data: evt })}
                      className="flex items-start gap-3 p-3 rounded-xl border border-(--brand-outline) dark:border-(--brand-outline) bg-(--brand-quiet) hover:border-(--brand-outline) transition-colors cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-(--brand) text-white">
                        <CalendarPlus className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-(--text-primary) truncate">
                          {evt.title}
                        </p>
                        <p className="text-xs text-(--text-muted) mt-0.5">
                          {evt.allDay
                            ? t('createMeeting.allDay')
                            : `${evt.startTime} – ${evt.endTime}`}
                        </p>
                        {evt.location && (
                          <p className="text-xs text-(--text-muted) mt-1 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {evt.location}
                          </p>
                        )}
                        {evt.attendees.length > 0 && (
                          <div
                            className="mt-1.5 flex items-center gap-1.5"
                            title={evt.attendees.join(', ')}
                          >
                            <Users className="h-3.5 w-3.5 shrink-0 text-(--text-muted)" />
                            <span className="flex -space-x-1">
                              {evt.attendees.slice(0, 4).map((name, ai) => (
                                <span
                                  key={`a-${ai}`}
                                  className="flex size-5 items-center justify-center rounded-full border border-(--card) bg-(--surface-2) text-[8px] font-bold text-(--text-secondary)"
                                >
                                  {getInitials(name).slice(0, 2)}
                                </span>
                              ))}
                              {evt.attendees.length > 4 && (
                                <span className="flex size-5 items-center justify-center rounded-full border border-(--card) bg-(--surface-3) text-[8px] font-bold text-(--text-secondary)">
                                  +{evt.attendees.length - 4}
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                        {evt.roomName && (
                          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-(--card) px-2 py-0.5 text-xs text-(--text-secondary)">
                            <DoorOpen className="h-3 w-3" />
                            {evt.roomName}
                          </p>
                        )}
                        {evt.description && (
                          <p className="text-xs text-(--text-muted) mt-1 line-clamp-2">
                            {evt.description}
                          </p>
                        )}
                        {evt.videoUrl && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <a
                              href={evt.videoUrl}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-(--brand) px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
                            >
                              <Video className="h-3.5 w-3.5" />
                              {t('meetings.joinNow')}
                            </a>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard
                                  ?.writeText(`${window.location.origin}${evt.videoUrl}`)
                                  .then(() => toast.success(t('meetings.linkCopied')))
                                  .catch(() => toast.error(t('meetings.copyFailed')));
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-(--border-default) bg-(--surface-1) px-2.5 py-1 text-xs font-medium text-(--text-secondary) transition-colors hover:bg-(--surface-2)"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              {t('meetings.copyLink')}
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </Section>
              )}

              {/* Google Calendar Events */}
              {googleEvents.length > 0 && (
                <Section title={t('dayDetails.googleEvents', 'Google Calendar')}>
                  {googleEvents.map((evt, i) => (
                    <motion.div
                      key={evt.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      {...rowProps({ source: 'google', data: evt })}
                      className="flex items-start gap-3 p-3 rounded-xl border border-(--purple-outline) dark:border-(--purple-outline) bg-(--purple-quiet) hover:border-(--purple-outline) transition-colors cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-(--purple) text-white">
                        <ExternalLink className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-(--text-primary) truncate">
                          {evt.title}
                        </p>
                        <p className="text-xs text-(--text-muted) mt-0.5">
                          {evt.allDay
                            ? t('createMeeting.allDay')
                            : evt.startTime && evt.endTime
                              ? `${evt.startTime} – ${evt.endTime}`
                              : format(new Date(evt.startDate), 'MMM d', { locale })}
                        </p>
                        {evt.location && (
                          <p className="text-xs text-(--text-muted) mt-1 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {evt.location}
                          </p>
                        )}
                        {evt.htmlLink && (
                          <a
                            href={evt.htmlLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-(--purple-text) hover:opacity-80 mt-1.5"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {t('calendar.openInGoogle', 'Open in Google Calendar')}
                          </a>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </Section>
              )}

              {/* Driver Events */}
              {driverEvents.length > 0 && (
                <Section title={t('dayDetails.driverBookings', 'Driver Bookings')}>
                  {driverEvents.map((evt, i) => (
                    <motion.div
                      key={evt._id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      {...rowProps({ source: 'driver', data: evt })}
                      className="flex items-start gap-3 p-3 rounded-xl border border-(--warning-outline) dark:border-(--warning-outline) bg-(--warning-quiet) hover:border-(--warning-outline) transition-colors cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-(--warning-solid) text-white">
                        <Car className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-(--text-primary) truncate">
                            {evt.driverName}
                          </p>
                          <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">
                            {evt.type}
                          </Badge>
                        </div>
                        <p className="text-xs text-(--text-muted) mt-0.5">
                          {format(new Date(evt.startTime), 'HH:mm', { locale })} –{' '}
                          {format(new Date(evt.endTime), 'HH:mm', { locale })}
                        </p>
                        {evt.tripInfo && (
                          <p className="text-xs text-(--text-muted) mt-1">
                            {evt.tripInfo.from} → {evt.tripInfo.to}
                          </p>
                        )}
                        {evt.driverVehicle && (
                          <p className="text-xs text-(--text-muted) mt-0.5">
                            🚗 {evt.driverVehicle.model} · {evt.driverVehicle.plateNumber}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </Section>
              )}
              {/* Meeting room bookings */}
              {roomBookings.length > 0 && (
                <Section title={t('rooms.calendar.roomBookings')}>
                  {roomBookings.map((booking, i) => {
                    const color = booking.roomColor ?? '#0ea5e9';
                    return (
                      <motion.div
                        key={booking._id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpenRoom?.(booking.roomId)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onOpenRoom?.(booking.roomId);
                          }
                        }}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-(--border) bg-(--background-subtle) p-3 transition-colors hover:border-(--primary)/40"
                      >
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                          style={{ background: color }}
                        >
                          <DoorOpen className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-(--text-primary)">
                            {booking.title}
                          </p>
                          <p className="mt-0.5 text-xs text-(--text-muted)">
                            {format(new Date(booking.startTime), 'HH:mm', { locale })} –{' '}
                            {format(new Date(booking.endTime), 'HH:mm', { locale })}
                            {booking.organizerName ? ` · ${booking.organizerName}` : ''}
                          </p>
                          <p className="mt-1 flex items-center gap-1 truncate text-xs text-(--text-secondary)">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{booking.roomName}</span>
                          </p>
                          {booking.attendeeNames.length > 0 && (
                            <p className="mt-1 truncate text-xs text-(--text-muted)">
                              {booking.attendeeNames.join(', ')}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </Section>
              )}
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider mb-2">
        {title}
      </h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: LeaveStatus;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const config = {
    approved: {
      icon: CheckCircle,
      color: 'text-(--success-text)',
      bg: 'bg-(--success-quiet)',
      label: t('leave.approved'),
    },
    rejected: {
      icon: XCircle,
      color: 'text-(--danger-text)',
      bg: 'bg-(--danger-quiet)',
      label: t('leave.rejected'),
    },
    pending: {
      icon: Clock,
      color: 'text-(--warning-text)',
      bg: 'bg-(--warning-quiet)',
      label: t('leave.pending'),
    },
    cancel_requested: {
      icon: Clock,
      color: 'text-(--warning-text)',
      bg: 'bg-(--warning-quiet)',
      label: t('leave.cancellationRequested'),
    },
  };
  const c = config[status] || config.pending;
  const Icon = c.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${c.color} ${c.bg}`}
    >
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  );
}
