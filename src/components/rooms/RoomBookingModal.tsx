'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Loader2,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import {
  capacityFits,
  DEFAULT_ROOM_COLOR,
  suggestNextFreeSlot,
  type RoomBookingLite,
} from '@/lib/meetingRooms';
import { getInitials } from '@/lib/stringUtils';
import { useAuthStore } from '@/store/useAuthStore';
import { RoomModalShell } from './RoomModalShell';
import type { RoomDoc } from './types';

const DURATION_PRESETS = [30, 60, 90, 120];
const MS_PER_MINUTE = 60_000;

interface OrgUser {
  _id: string;
  name: string;
  position?: string;
  department?: string;
}

interface RoomBookingModalProps {
  open: boolean;
  onClose: () => void;
  organizationId: string | null;
  /** Bookable rooms, used for the room switcher. */
  rooms: RoomDoc[];
  initialRoomId?: string | null;
  /** Day the dialog should open on; defaults to today. */
  initialDate?: Date | null;
  onBooked?: (roomId: string) => void;
}

function toEpoch(dateStr: string, timeStr: string): number | null {
  if (!dateStr || !timeStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  if ([year, month, day, hour, minute].some((n) => n === undefined || Number.isNaN(n))) return null;
  return new Date(year!, month! - 1, day!, hour!, minute!, 0, 0).getTime();
}

/** Rounds up to the next quarter hour — the default people actually want. */
function nextQuarterHour(from: Date): Date {
  const date = new Date(from);
  date.setSeconds(0, 0);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15);
  return date;
}

/**
 * Booking dialog with live conflict feedback.
 *
 * Availability is a reactive Convex query, so if a colleague books the same slot
 * while this dialog is open the warning appears without any refresh. When the
 * slot is taken we also compute the nearest free window from the room's own
 * schedule and offer it as a one-click fix instead of making the user guess.
 */
export function RoomBookingModal({
  open,
  onClose,
  organizationId,
  rooms,
  initialRoomId,
  initialDate,
  onBooked,
}: RoomBookingModalProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const bookRoom = useMutation(api.meetingRooms.bookRoom);

  const bookableRooms = useMemo(() => rooms.filter((room) => room.isActive), [rooms]);

  const [roomId, setRoomId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [attendees, setAttendees] = useState<OrgUser[]>([]);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [externalInput, setExternalInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Seed the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const base = initialDate ? new Date(initialDate) : new Date();
    const isToday = new Date().toDateString() === base.toDateString();
    const suggestedStart = isToday
      ? nextQuarterHour(new Date())
      : new Date(base.setHours(10, 0, 0, 0));
    const suggestedEnd = new Date(suggestedStart.getTime() + 60 * MS_PER_MINUTE);
    // A slot that ends after midnight cannot be expressed with a single date
    // field — rolling the date alone would still produce end < start. Instead
    // move the default to 10:00 the next day (same as the non-today branch).
    // Built from local date parts so DST transitions cannot shift the day.
    const rollsPastMidnight = suggestedEnd.getDate() !== suggestedStart.getDate();
    const start = rollsPastMidnight
      ? new Date(
          suggestedStart.getFullYear(),
          suggestedStart.getMonth(),
          suggestedStart.getDate() + 1,
          10,
          0,
          0,
          0,
        )
      : suggestedStart;
    const end = new Date(start.getTime() + 60 * MS_PER_MINUTE);

    setRoomId(initialRoomId ?? bookableRooms[0]?._id ?? null);
    setDate(format(start, 'yyyy-MM-dd'));
    setStartTime(format(start, 'HH:mm'));
    setEndTime(format(end, 'HH:mm'));
    setTitle('');
    setDescription('');
    setAttendees([]);
    setAttendeeSearch('');
    setExternalInput('');
    // bookableRooms is intentionally read once per open — the list changing
    // mid-dialog must not reset what the user already typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialRoomId, initialDate]);

  const room = useMemo(
    () => rooms.find((candidate) => candidate._id === roomId) ?? null,
    [rooms, roomId],
  );

  const start = toEpoch(date, startTime);
  const end = toEpoch(date, endTime);
  const validRange = start !== null && end !== null && end > start;
  const durationMinutes = validRange ? Math.round((end! - start!) / MS_PER_MINUTE) : 0;
  const inPast = start !== null && start < Date.now() - MS_PER_MINUTE;

  const externalAttendees = useMemo(
    () =>
      externalInput
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    [externalInput],
  );
  const headcount = attendees.length + externalAttendees.length;
  const fits = room ? capacityFits(room.capacity, headcount) : true;

  // Live availability for the chosen slot.
  const availability = useQuery(
    api.meetingRooms.checkAvailability,
    roomId && validRange
      ? { roomId: roomId as Id<'meetingRooms'>, startTime: start!, endTime: end! }
      : 'skip',
  );

  // The room's schedule for the selected day powers the "next free slot" hint.
  const dayBounds = useMemo(() => {
    if (!date) return null;
    const dayStart = toEpoch(date, '00:00');
    if (dayStart === null) return null;
    return { from: dayStart, to: dayStart + 24 * 60 * MS_PER_MINUTE };
  }, [date]);

  const dayBookings = useQuery(
    api.meetingRooms.getRoomBookings,
    roomId && dayBounds
      ? {
          roomId: roomId as Id<'meetingRooms'>,
          startTime: dayBounds.from,
          endTime: dayBounds.to,
        }
      : 'skip',
  ) as RoomBookingLite[] | undefined;

  const suggestion = useMemo(() => {
    if (!validRange || availability?.available !== false || !dayBookings) return null;
    return suggestNextFreeSlot(dayBookings, start!, end! - start!);
  }, [validRange, availability?.available, dayBookings, start, end]);

  const orgUsers = useQuery(
    api.users.getUsersByOrganizationId,
    organizationId ? { organizationId: organizationId as Id<'organizations'> } : 'skip',
  ) as OrgUser[] | undefined;

  const userSuggestions = useMemo(() => {
    if (!orgUsers) return [];
    const query = attendeeSearch.trim().toLowerCase();
    return orgUsers
      .filter((candidate) => candidate._id !== user?.id)
      .filter((candidate) => !attendees.some((selected) => selected._id === candidate._id))
      .filter(
        (candidate) =>
          !query ||
          candidate.name.toLowerCase().includes(query) ||
          (candidate.position ?? '').toLowerCase().includes(query),
      )
      .slice(0, 6);
  }, [orgUsers, attendeeSearch, attendees, user?.id]);

  const applyDuration = (minutes: number) => {
    if (start === null) return;
    setEndTime(format(new Date(start + minutes * MS_PER_MINUTE), 'HH:mm'));
  };

  const applySuggestion = () => {
    if (suggestion === null || !validRange) return;
    const length = end! - start!;
    setDate(format(new Date(suggestion), 'yyyy-MM-dd'));
    setStartTime(format(new Date(suggestion), 'HH:mm'));
    setEndTime(format(new Date(suggestion + length), 'HH:mm'));
  };

  const blockingReason = !room
    ? t('rooms.booking.selectRoom')
    : !title.trim()
      ? t('rooms.booking.titleRequired')
      : !validRange
        ? t('rooms.booking.invalidRange')
        : inPast
          ? t('rooms.booking.pastNotAllowed')
          : !fits
            ? t('rooms.booking.capacityExceeded', { max: room.capacity })
            : availability?.available === false
              ? t('rooms.booking.unavailable')
              : null;

  const handleSubmit = async () => {
    if (blockingReason || !room || !validRange) return;
    setSubmitting(true);
    try {
      await bookRoom({
        roomId: room._id as Id<'meetingRooms'>,
        title: title.trim(),
        description: description.trim() || undefined,
        startTime: start!,
        endTime: end!,
        attendeeIds: attendees.map((attendee) => attendee._id as Id<'users'>),
        externalAttendees,
      });
      toast.success(t('rooms.booking.booked', { room: room.name }));
      onBooked?.(room._id);
      onClose();
    } catch (error) {
      logger.error('Room booking failed', error);
      const message = error instanceof Error ? error.message : '';
      toast.error(
        message.includes('already booked')
          ? t('rooms.errors.conflict')
          : message.includes('capacity')
            ? t('rooms.booking.capacityExceeded', { max: room.capacity })
            : message.includes('past')
              ? t('rooms.booking.pastNotAllowed')
              : t('rooms.errors.generic'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (ms: number) => format(new Date(ms), 'HH:mm');

  return (
    <RoomModalShell
      open={open}
      onClose={onClose}
      title={room ? t('rooms.booking.titleFor', { room: room.name }) : t('rooms.bookRoom')}
      subtitle={t('rooms.booking.subtitle')}
      icon={<CalendarClock className="h-6 w-6" />}
      accent={room?.color ?? DEFAULT_ROOM_COLOR}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-xs text-(--text-muted)">
            {blockingReason ??
              t('rooms.booking.readySummary', {
                duration: durationMinutes,
                people: headcount + 1,
              })}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
              {t('buttons.cancel')}
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting || !!blockingReason}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {t('rooms.book')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Room switcher */}
        {bookableRooms.length > 1 && (
          <div className="space-y-2">
            <Label>{t('rooms.booking.room')}</Label>
            <div className="flex flex-wrap gap-2">
              {bookableRooms.map((candidate) => (
                <button
                  key={candidate._id}
                  type="button"
                  aria-pressed={candidate._id === roomId}
                  onClick={() => setRoomId(candidate._id)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer',
                    candidate._id === roomId
                      ? 'border-(--primary) bg-(--primary)/10 text-(--primary)'
                      : 'border-(--border) bg-(--background-subtle) text-(--text-muted) hover:text-(--text-primary)',
                  )}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: candidate.color ?? DEFAULT_ROOM_COLOR }}
                  />
                  {candidate.name}
                  <span className="text-(--text-muted)">· {candidate.capacity}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="booking-title">{t('rooms.booking.meetingTitle')}</Label>
          <Input
            id="booking-title"
            value={title}
            maxLength={120}
            placeholder={t('rooms.booking.titlePlaceholder')}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="booking-date">{t('rooms.booking.date')}</Label>
            <Input
              id="booking-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="booking-start">{t('rooms.booking.from')}</Label>
            <Input
              id="booking-start"
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="booking-end">{t('rooms.booking.to')}</Label>
            <Input
              id="booking-end"
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              aria-invalid={!validRange}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-(--text-muted)">
            {t('rooms.booking.duration')}
          </span>
          {DURATION_PRESETS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => applyDuration(minutes)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer',
                durationMinutes === minutes
                  ? 'border-(--primary) bg-(--primary)/10 text-(--primary)'
                  : 'border-(--border) bg-(--background-subtle) text-(--text-muted) hover:text-(--text-primary)',
              )}
            >
              {t('rooms.duration.minutes', { count: minutes })}
            </button>
          ))}
        </div>

        {/* Live availability */}
        {validRange && roomId && (
          <div
            className={cn(
              'rounded-xl border p-3 text-sm',
              availability === undefined
                ? 'border-(--border) bg-(--background-subtle) text-(--text-muted)'
                : availability.available
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
            )}
            aria-live="polite"
          >
            {availability === undefined ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('rooms.booking.checkingAvailability')}
              </span>
            ) : availability.available ? (
              <span className="inline-flex items-center gap-2 font-semibold">
                <Check className="h-4 w-4" />
                {t('rooms.booking.available')}
              </span>
            ) : (
              <div className="space-y-2">
                <span className="inline-flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" />
                  {t('rooms.booking.unavailable')}
                </span>
                <ul className="space-y-1">
                  {availability.conflicts.map((conflict) => (
                    <li key={conflict._id} className="text-xs">
                      {t('rooms.booking.conflictWith', {
                        title: conflict.title,
                        from: formatTime(conflict.startTime),
                        to: formatTime(conflict.endTime),
                        organizer: conflict.organizerName ?? '',
                      })}
                    </li>
                  ))}
                </ul>
                {suggestion !== null && (
                  <button
                    type="button"
                    onClick={applySuggestion}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-(--border) bg-(--card) px-2.5 py-1.5 text-xs font-semibold text-(--text-primary) transition-colors hover:border-(--primary)/50 cursor-pointer"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-(--primary)" />
                    {t('rooms.booking.useSuggestion', { time: formatTime(suggestion) })}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Attendees */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t('rooms.booking.attendees')}</Label>
            <span
              className={cn(
                'text-xs font-medium',
                fits ? 'text-(--text-muted)' : 'text-red-600 dark:text-red-400',
              )}
            >
              <Users className="mr-1 inline h-3.5 w-3.5" />
              {headcount + 1}
              {room ? ` / ${room.capacity}` : ''}
            </span>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-(--text-muted)" />
            <Input
              className="pl-9"
              value={attendeeSearch}
              placeholder={t('rooms.booking.addAttendees')}
              onChange={(event) => setAttendeeSearch(event.target.value)}
            />
          </div>

          {attendeeSearch.trim().length > 0 && userSuggestions.length > 0 && (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-(--border) bg-(--background-subtle) p-1.5">
              {userSuggestions.map((candidate) => (
                <button
                  key={candidate._id}
                  type="button"
                  onClick={() => {
                    setAttendees((prev) => [...prev, candidate]);
                    setAttendeeSearch('');
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-(--card) cursor-pointer"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-(--primary)/15 text-[10px] font-bold text-(--primary)">
                    {getInitials(candidate.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-(--text-primary)">
                      {candidate.name}
                    </span>
                    {candidate.position && (
                      <span className="block truncate text-[10px] text-(--text-muted)">
                        {candidate.position}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

          {attendees.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attendees.map((attendee) => (
                <span
                  key={attendee._id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-(--primary)/10 px-2.5 py-1 text-xs font-medium text-(--primary)"
                >
                  {attendee.name}
                  <button
                    type="button"
                    aria-label={t('rooms.booking.removeAttendee', { name: attendee.name })}
                    onClick={() =>
                      setAttendees((prev) => prev.filter((item) => item._id !== attendee._id))
                    }
                    className="cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="booking-external">{t('rooms.booking.externalGuests')}</Label>
            <Input
              id="booking-external"
              value={externalInput}
              placeholder={t('rooms.booking.externalPlaceholder')}
              onChange={(event) => setExternalInput(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="booking-description">{t('rooms.booking.description')}</Label>
          <Textarea
            id="booking-description"
            rows={3}
            maxLength={2000}
            value={description}
            placeholder={t('rooms.booking.descriptionPlaceholder')}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>
    </RoomModalShell>
  );
}
