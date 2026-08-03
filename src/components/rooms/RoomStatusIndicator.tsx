'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  ROOM_STATUS_ACCENTS,
  splitMinutes,
  type RoomStatus,
  type RoomStatusInfo,
} from '@/lib/meetingRooms';

/**
 * Live free/busy indicator for a meeting room.
 *
 * The dot pulses while the status is "live" (free, busy, about to change) and
 * goes flat for archived rooms, so a glance at the board tells you whether the
 * information is ticking or frozen. The pulse is a separate ring element rather
 * than an opacity animation on the dot itself, which keeps the colour readable
 * for users with reduced-motion settings (the ring is disabled there).
 */
export function RoomStatusDot({
  status,
  size = 'md',
  className,
}: {
  status: RoomStatus;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const accent = ROOM_STATUS_ACCENTS[status];
  const box = size === 'sm' ? 'h-2 w-2' : size === 'lg' ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5';

  return (
    <span className={cn('relative inline-flex shrink-0', box, className)} aria-hidden="true">
      {accent.pulse && (
        <span
          className="absolute inset-0 rounded-full opacity-60 animate-ping motion-reduce:animate-none"
          style={{ background: accent.dot }}
        />
      )}
      <span
        className="relative inline-flex h-full w-full rounded-full"
        style={{ background: accent.dot, boxShadow: `0 0 0 3px ${accent.dot}22` }}
      />
    </span>
  );
}

/** Formats a minute count as "1 h 30 min" / "45 min" in the active language. */
export function useDurationLabel() {
  const { t } = useTranslation();
  return (totalMinutes: number | null): string => {
    if (totalMinutes === null) return '';
    const { hours, minutes } = splitMinutes(totalMinutes);
    if (hours > 0 && minutes > 0) return t('rooms.duration.hoursMinutes', { hours, minutes });
    if (hours > 0) return t('rooms.duration.hours', { count: hours });
    return t('rooms.duration.minutes', { count: minutes });
  };
}

/** Human-readable status headline plus the detail line under it. */
export function useRoomStatusText() {
  const { t } = useTranslation();
  const durationLabel = useDurationLabel();

  return (info: RoomStatusInfo, formatTime: (ms: number) => string) => {
    const label = t(`rooms.status.${info.status}`);

    let detail = '';
    if (info.status === 'archived') {
      detail = t('rooms.statusDetail.unavailable');
    } else if (info.current) {
      detail =
        info.minutesLeft !== null
          ? t('rooms.statusDetail.freeIn', {
              duration: durationLabel(info.minutesLeft),
              time: formatTime(info.busyUntil ?? info.current.endTime),
            })
          : t('rooms.statusDetail.busyUntil', { time: formatTime(info.current.endTime) });
    } else if (info.status === 'startingSoon' && info.next) {
      detail = t('rooms.statusDetail.startsIn', {
        duration: durationLabel(info.minutesUntilNext),
        time: formatTime(info.next.startTime),
      });
    } else if (info.next) {
      detail = t('rooms.statusDetail.freeUntil', { time: formatTime(info.next.startTime) });
    } else {
      detail = t('rooms.statusDetail.freeAllDay');
    }

    return { label, detail };
  };
}

/** Compact badge: pulsing dot + status word, tinted by status. */
export function RoomStatusPill({
  status,
  label,
  className,
}: {
  status: RoomStatus;
  label: string;
  className?: string;
}) {
  const accent = ROOM_STATUS_ACCENTS[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        accent.bg,
        accent.border,
        accent.text,
        className,
      )}
    >
      <RoomStatusDot status={status} size="sm" />
      {label}
    </span>
  );
}
