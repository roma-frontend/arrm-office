'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import { addDays, format, isSameDay, startOfDay } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import {
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Radio,
  Share2,
  Trash2,
  UserCheck,
  Users,
  Video,
} from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import {
  DEFAULT_ROOM_COLOR,
  formatRoomLocation,
  resolveRoomStatus,
  utilizationPercent,
  type RoomBookingLite,
} from '@/lib/meetingRooms';
import { useAuthStore } from '@/store/useAuthStore';
import { useNow } from '@/hooks/useNow';
import { EmployeeHoverCard } from '@/components/employees/EmployeeHoverCard';
import { RoomDayTimeline } from './RoomDayTimeline';
import { RoomModalShell } from './RoomModalShell';
import { BookingTrackingPanel, ResponseSummaryChips } from './BookingTrackingPanel';
import { AmenityIcon } from './RoomCard';
import { RoomStatusDot, useRoomStatusText } from './RoomStatusIndicator';
import { ShareMeetingLink } from './ShareMeetingLink';
import type { RoomBookingDoc, RoomDoc } from './types';

const WORKDAY_START_HOUR = 8;
const WORKDAY_END_HOUR = 20;

/**
 * Everything about one room: live status, the day's schedule as a timeline and
 * a booking-by-booking breakdown with the actions the viewer is allowed to take.
 * The day can be stepped through so people can check tomorrow before booking.
 */
export function RoomDetailsModal({
  open,
  onClose,
  room,
  canManage,
  onBook,
  initialDate,
}: {
  open: boolean;
  onClose: () => void;
  room: RoomDoc | null;
  canManage: boolean;
  onBook: (room: RoomDoc, day: Date) => void;
  /** A `yyyy-MM-dd` the viewer asked for (e.g. a booking's own day) — the
   *  modal opens there instead of today. */
  initialDate?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();
  const now = useNow(15_000);
  const statusText = useRoomStatusText();
  const cancelBooking = useMutation(api.meetingRooms.cancelBooking);
  const checkIn = useMutation(api.meetingRooms.checkInBooking);

  const [dayOffset, setDayOffset] = useState(0);

  // Land on the requested day (booking date from the calendar) rather than
  // today every time the room view opens.
  useEffect(() => {
    if (!open || !initialDate) return;
    const parsed = new Date(`${initialDate}T00:00:00`);
    if (isNaN(parsed.getTime())) return;
    const target = startOfDay(parsed).getTime();
    const base = startOfDay(new Date()).getTime();
    setDayOffset(Math.round((target - base) / (24 * 60 * 60 * 1000)));
  }, [open, initialDate]);
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);
  /** Only one tracking panel is expanded at a time — it is a tall block. */
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const [shareBooking, setShareBooking] = useState<{
    videoUrl: string;
    videoProvider: 'livekit' | 'teams' | 'zoom' | 'meet';
    title: string;
    startTime: number;
    endTime: number;
  } | null>(null);

  // Smooth fade when switching days — briefly set opacity to 0 then back to 1
  const [contentFading, setContentFading] = useState(false);
  const prevDayOffset = useRef(dayOffset);
  useEffect(() => {
    if (prevDayOffset.current !== dayOffset) {
      setContentFading(true);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setContentFading(false));
      });
      prevDayOffset.current = dayOffset;
      return () => cancelAnimationFrame(id);
    }
  }, [dayOffset]);

  const lang = i18n.language || 'en';
  const locale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;
  const formatTime = (ms: number) => format(new Date(ms), 'HH:mm');

  const day = useMemo(() => addDays(startOfDay(new Date(now)), dayOffset), [now, dayOffset]);
  const dayStart = day.getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  const bookings = useQuery(
    api.meetingRooms.getRoomBookings,
    open && room
      ? { roomId: room._id as Id<'meetingRooms'>, startTime: dayStart, endTime: dayEnd }
      : 'skip',
  ) as RoomBookingDoc[] | undefined;

  const dayBookings: RoomBookingLite[] = useMemo(
    () =>
      (bookings ?? []).map((booking) => ({
        _id: booking._id,
        title: booking.title,
        startTime: booking.startTime,
        endTime: booking.endTime,
        organizerId: booking.organizerId,
        organizerName: booking.organizerName,
        checkedInAt: booking.checkedInAt,
        status: booking.status,
      })),
    [bookings],
  );

  const info = useMemo(
    () => resolveRoomStatus(dayBookings, now, { isActive: room?.isActive ?? true }),
    [dayBookings, now, room?.isActive],
  );
  const { label, detail } = statusText(info, formatTime);
  const isToday = isSameDay(day, new Date(now));

  const utilization = useMemo(
    () =>
      utilizationPercent(
        dayBookings,
        dayStart + WORKDAY_START_HOUR * 3_600_000,
        dayStart + WORKDAY_END_HOUR * 3_600_000,
      ),
    [dayBookings, dayStart],
  );

  if (!room) return null;

  const accent = room.color ?? DEFAULT_ROOM_COLOR;
  const location = formatRoomLocation(room, (key, options) => t(key, options));

  const handleCancel = async (booking: RoomBookingDoc) => {
    setBusyBookingId(booking._id);
    try {
      await cancelBooking({ bookingId: booking._id as Id<'roomBookings'> });
      toast.success(t('rooms.booking.cancelled'));
    } catch (error) {
      logger.error('Cancel booking failed', error);
      toast.error(t('rooms.errors.generic'));
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleCheckIn = async (booking: RoomBookingDoc) => {
    setBusyBookingId(booking._id);
    try {
      await checkIn({ bookingId: booking._id as Id<'roomBookings'> });
      toast.success(t('rooms.booking.checkedIn'));
    } catch (error) {
      logger.error('Check-in failed', error);
      toast.error(t('rooms.booking.checkInWindow'));
    } finally {
      setBusyBookingId(null);
    }
  };

  return (
    <>
      <RoomModalShell
        open={open}
        onClose={onClose}
        title={room.name}
        subtitle={location || t('rooms.details.noLocation')}
        icon={<Building2 className="h-6 w-6" />}
        accent={accent}
        size="lg"
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-xs text-(--text-muted)">
              <RoomStatusDot status={info.status} size="sm" />
              {label} · {detail}
            </span>
            <Button size="sm" disabled={!room.isActive} onClick={() => onBook(room, day)}>
              <CalendarClock className="h-4 w-4" />
              {t('rooms.book')}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          {room.photoUrl && (
            // Remote room photos come from arbitrary URLs an admin pastes in, which
            // next/image cannot pre-configure; a plain img keeps that flexible.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={room.photoUrl}
              alt={room.name}
              className="h-40 w-full rounded-2xl object-cover"
              loading="lazy"
            />
          )}

          {room.description && (
            <p className="text-sm leading-relaxed text-(--text-secondary)">{room.description}</p>
          )}

          {/* Facts */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact
              icon={<Users className="h-4 w-4" />}
              label={t('rooms.capacity')}
              value={String(room.capacity)}
            />
            <Fact
              icon={<Clock className="h-4 w-4" />}
              label={t('rooms.form.openHours')}
              value={`${room.openFrom ?? '08:00'} – ${room.openTo ?? '20:00'}`}
            />
            <Fact
              icon={<MapPin className="h-4 w-4" />}
              label={t('rooms.location')}
              value={location || '—'}
            />
            <Fact
              icon={<CalendarClock className="h-4 w-4" />}
              label={t('rooms.details.utilization')}
              value={`${utilization}%`}
            />
          </div>

          {room.amenities.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {room.amenities.map((amenity) => (
                <span
                  key={amenity}
                  className="inline-flex items-center gap-1.5 rounded-full bg-(--background-subtle) px-2.5 py-1 text-xs text-(--text-secondary)"
                >
                  <AmenityIcon amenity={amenity} className="h-3.5 w-3.5" />
                  {t(`rooms.amenity.${amenity}`)}
                </span>
              ))}
            </div>
          )}

          {/* Day navigation + timeline */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
                {isToday ? t('rooms.details.today') : format(day, 'EEEE, d MMMM', { locale })}
              </h4>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('rooms.details.previousDay')}
                  onClick={() => setDayOffset((prev) => prev - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('rooms.details.nextDay')}
                  onClick={() => setDayOffset((prev) => prev + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <RoomDayTimeline
              day={dayStart}
              bookings={dayBookings}
              now={now}
              openFrom={room.openFrom}
              openTo={room.openTo}
              color={accent}
              variant="detailed"
              formatTime={formatTime}
            />
          </div>

          {/* Bookings */}
          <div
            className={cn(
              'min-h-[200px] space-y-2 transition-opacity duration-200',
              contentFading && 'opacity-0',
            )}
          >
            {bookings === undefined ? (
              <div className="space-y-2">
                {[0, 1].map((index) => (
                  <div
                    key={index}
                    className="h-16 animate-pulse rounded-xl bg-(--background-subtle)"
                  />
                ))}
              </div>
            ) : bookings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-(--border) py-8 text-center">
                <CalendarClock className="mx-auto mb-2 h-8 w-8 text-(--border)" />
                <p className="text-sm text-(--text-muted)">{t('rooms.details.noBookingsToday')}</p>
              </div>
            ) : (
              bookings.map((booking) => {
                const isCurrent = booking.startTime <= now && now < booking.endTime;
                const isMine = booking.organizerId === user?.id;
                const isAttendee = (booking.attendeeIds ?? []).includes(user?.id as string);
                const canCancel = (isMine || canManage) && booking.endTime > now;
                const canCheckIn =
                  isMine &&
                  !booking.checkedInAt &&
                  now >= booking.startTime - 15 * 60_000 &&
                  now <= booking.endTime;
                const isExpanded = expandedBookingId === booking._id;
                const counts = booking.tracking;
                // Show "Join Meeting" when there's a video link and the user is a participant.
                const hasVideo = !!booking.videoUrl;
                const isParticipant = isMine || isAttendee;
                const canJoinMeeting =
                  hasVideo &&
                  isParticipant &&
                  // Either the meeting is live (status override) or within the time window.
                  (booking.meetingStatus === 'live' ||
                    (booking.startTime <= now + 15 * 60_000 && booking.endTime > now));

                return (
                  <div
                    key={booking._id}
                    className={cn(
                      'overflow-hidden rounded-xl border transition-colors',
                      isCurrent
                        ? 'border-(--primary)/40 bg-(--primary)/5'
                        : 'border-(--border) bg-(--background-subtle)',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-(--text-primary)">
                            {booking.title}
                          </p>
                          {isCurrent && (
                            <Badge variant="info" className="h-5 shrink-0 px-1.5 text-[10px]">
                              {t('rooms.details.now')}
                            </Badge>
                          )}
                          {booking.checkedInAt && (
                            <Badge variant="success" className="h-5 shrink-0 px-1.5 text-[10px]">
                              {t('rooms.booking.checkedIn')}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-(--text-muted)">
                          {formatTime(booking.startTime)} – {formatTime(booking.endTime)}
                          {booking.organizerName ? (
                            <>
                              {' '}
                              ·{' '}
                              <EmployeeHoverCard
                                userId={booking.organizerId}
                                name={booking.organizerName}
                              >
                                <span className="cursor-pointer hover:underline hover:underline-offset-2">
                                  {booking.organizerName}
                                </span>
                              </EmployeeHoverCard>
                            </>
                          ) : (
                            ''
                          )}
                        </p>
                        {booking.attendeeNames.length > 0 && (
                          <p className="mt-1 truncate text-xs text-(--text-secondary)">
                            <Users className="mr-1 inline h-3 w-3" />
                            {booking.attendeeNames.join(', ')}
                          </p>
                        )}
                        {booking.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-(--text-muted)">
                            {booking.description}
                          </p>
                        )}
                        {counts && counts.total > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpandedBookingId(isExpanded ? null : booking._id)}
                            aria-expanded={isExpanded}
                            className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-full text-[11px] font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary)"
                          >
                            <ResponseSummaryChips counts={counts} />
                            <span className="inline-flex items-center gap-0.5">
                              {isExpanded
                                ? t('rooms.tracking.hideDetails')
                                : t('rooms.tracking.showDetails')}
                              <ChevronDown
                                className={cn(
                                  'h-3 w-3 transition-transform',
                                  isExpanded && 'rotate-180',
                                )}
                              />
                            </span>
                          </button>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col gap-1">
                        {canCheckIn && (
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={busyBookingId === booking._id}
                            onClick={() => handleCheckIn(booking)}
                          >
                            <UserCheck className="h-3 w-3" />
                            {t('rooms.booking.checkIn')}
                          </Button>
                        )}
                        {canJoinMeeting && (
                          <Button
                            size="xs"
                            className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                            onClick={() => router.push(booking.videoUrl!)}
                          >
                            {booking.meetingStatus === 'live' ? (
                              <Radio className="h-3 w-3 animate-pulse" />
                            ) : (
                              <Video className="h-3 w-3" />
                            )}
                            {t('rooms.booking.joinMeeting', 'Join Meeting')}
                            {booking.meetingStatus === 'live' && (
                              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                                <span className="size-1.5 animate-pulse rounded-full bg-white" />
                                LIVE
                              </span>
                            )}
                          </Button>
                        )}
                        {booking.videoUrl && (
                          <Button
                            size="xs"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() =>
                              setShareBooking({
                                videoUrl: booking.videoUrl!,
                                videoProvider:
                                  (booking.videoProvider as
                                    | 'livekit'
                                    | 'teams'
                                    | 'zoom'
                                    | 'meet') || 'livekit',
                                title: booking.title,
                                startTime: booking.startTime,
                                endTime: booking.endTime,
                              })
                            }
                          >
                            <Share2 className="h-3 w-3" />
                            {t('rooms.booking.shareLink', 'Share Link')}
                          </Button>
                        )}
                        {canCancel && (
                          <Button
                            variant="destructive"
                            size="xs"
                            disabled={busyBookingId === booking._id}
                            onClick={() => handleCancel(booking)}
                          >
                            <Trash2 className="h-3 w-3" />
                            {t('rooms.booking.cancel')}
                          </Button>
                        )}
                      </div>
                    </div>

                    {isExpanded && <BookingTrackingPanel bookingId={booking._id} />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </RoomModalShell>

      {/* Share meeting link dialog */}
      {shareBooking && (
        <ShareMeetingLink
          open={!!shareBooking}
          onClose={() => setShareBooking(null)}
          provider={shareBooking.videoProvider}
          videoUrl={shareBooking.videoUrl}
          meetingTitle={shareBooking.title}
          meetingTime={`${format(new Date(shareBooking.startTime), 'MMM d, HH:mm')} – ${format(new Date(shareBooking.endTime), 'HH:mm')}`}
        />
      )}
    </>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-(--border) bg-(--background-subtle) p-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-bold text-(--text-primary)">{value}</p>
    </div>
  );
}
