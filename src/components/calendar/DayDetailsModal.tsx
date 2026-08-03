'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from '@/lib/cssMotion';
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
} from 'lucide-react';
import { format, isToday } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import { Badge } from '@/components/ui/badge';
import { getLeaveTypeLabel, type LeaveType, type LeaveStatus } from '@/lib/types';
import { getInitials } from '@/lib/stringUtils';
import type { CalendarEvent } from './CreateEventModal';
import type { TimelineInput } from '@/lib/eventTimeline';

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
  onClose: () => void;
  /** Double-clicking a row hands the entry up to the timeline modal. */
  onOpenTimeline?: (input: TimelineInput) => void;
}

export function DayDetailsModal({
  open,
  date,
  leaves,
  googleEvents,
  driverEvents,
  customEvents,
  onClose,
  onOpenTimeline,
}: DayDetailsModalProps) {
  const { t } = useTranslation();
  const lang = i18n.language || 'en';
  const locale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;
  const totalEvents =
    leaves.length + googleEvents.length + driverEvents.length + customEvents.length;

  // Spread onto an event row to make it open its timeline on double-click.
  const rowProps = (input: TimelineInput) =>
    onOpenTimeline
      ? {
          onDoubleClick: () => onOpenTimeline(input),
          title: t('eventTimeline.hints.doubleClick'),
        }
      : {};

  if (typeof window === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 lg:left-60 lg:top-16 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            transition={{ type: 'spring', damping: 30, stiffness: 400 }}
            className="relative z-10 w-full max-w-lg bg-(--card) rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative px-6 pt-6 pb-5 shrink-0 overflow-hidden">
              <div className="absolute inset-0 opacity-10 bg-gradient-to-br from-(--primary) to-transparent" />
              <div className="absolute top-0 right-0 w-32 h-32 rounded-full -mr-16 -mt-16 opacity-10 blur-3xl bg-(--primary)" />

              <div className="relative flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-(--primary)/10 border border-(--primary)/20 flex flex-col items-center justify-center shadow-lg">
                    <span className="text-lg font-bold text-(--primary) leading-none">
                      {format(date, 'd')}
                    </span>
                    <span className="text-[10px] font-medium text-(--primary)/70 uppercase">
                      {format(date, 'MMM', { locale })}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-(--text-primary) leading-tight">
                      {format(date, 'EEEE', { locale })}
                    </h3>
                    <p className="text-sm text-(--text-muted) mt-0.5">
                      {format(date, 'd MMMM yyyy', { locale })}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="text-(--text-muted) hover:text-(--text-primary) transition-colors p-2 rounded-full hover:bg-(--background-subtle) shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Summary badges */}
              <div className="relative flex flex-wrap gap-2 mt-4">
                {isToday(date) && (
                  <Badge className="bg-(--primary)/10 text-(--primary) border border-(--primary)/20 text-xs">
                    {t('timePeriods.today')}
                  </Badge>
                )}
                <Badge variant="secondary" className="text-xs">
                  {totalEvents} {t('dayDetails.events', 'events')}
                </Badge>
                {leaves.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="text-xs bg-blue-500/10 text-blue-600 border-blue-200"
                  >
                    {leaves.length} {t('dayDetails.leaves', 'leaves')}
                  </Badge>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="px-6 pb-6 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-(--border) scrollbar-track-transparent space-y-3">
              {totalEvents === 0 ? (
                <div className="py-10 text-center">
                  <CalendarDays className="w-12 h-12 text-(--border) mx-auto mb-3" />
                  <p className="text-sm text-(--text-muted)">
                    {t('dayDetails.noEvents', 'No events on this day')}
                  </p>
                </div>
              ) : (
                <>
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
                            style={{ background: LEAVE_TYPE_BG[leave.type] || '#6b7280' }}
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
                          className="flex items-start gap-3 p-3 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-500/5 hover:border-blue-400 transition-colors cursor-pointer"
                        >
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-blue-500 text-white">
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
                            {evt.description && (
                              <p className="text-xs text-(--text-muted) mt-1 line-clamp-2">
                                {evt.description}
                              </p>
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
                          className="flex items-start gap-3 p-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-500/5 hover:border-purple-400 transition-colors cursor-pointer"
                        >
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-purple-500 text-white">
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
                                className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 mt-1.5"
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
                          className="flex items-start gap-3 p-3 rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-500/5 hover:border-orange-400 transition-colors cursor-pointer"
                        >
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-orange-500 text-white">
                            <Car className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-(--text-primary) truncate">
                                {evt.driverName}
                              </p>
                              <Badge
                                variant="secondary"
                                className="text-[10px] h-5 px-1.5 shrink-0"
                              >
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
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
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
      color: 'text-emerald-600',
      bg: 'bg-emerald-500/10',
      label: t('leave.approved'),
    },
    rejected: {
      icon: XCircle,
      color: 'text-red-600',
      bg: 'bg-red-500/10',
      label: t('leave.rejected'),
    },
    pending: {
      icon: Clock,
      color: 'text-amber-600',
      bg: 'bg-amber-500/10',
      label: t('leave.pending'),
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
