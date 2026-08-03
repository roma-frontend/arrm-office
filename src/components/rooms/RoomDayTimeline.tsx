'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { TimelineBooking } from './types';

/** Default visible window when a room has no explicit opening hours. */
const DEFAULT_OPEN_FROM = '08:00';
const DEFAULT_OPEN_TO = '20:00';

function parseHm(value: string | undefined, fallback: string): number {
  const [h, m] = (value ?? fallback).split(':').map(Number);
  if (Number.isNaN(h)) return parseHm(undefined, fallback);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * One-day occupancy bar for a room.
 *
 * Booked stretches are absolutely positioned as a percentage of the visible
 * window, so the bar scales with its container and needs no measurement. A
 * marker shows "now" whenever the current time falls inside the window, which
 * is what makes the bar readable at a glance: everything left of the marker is
 * history, everything right of it is still bookable.
 */
export function RoomDayTimeline({
  day,
  bookings,
  now,
  openFrom,
  openTo,
  color,
  variant = 'compact',
  onSelectBooking,
  formatTime,
  className,
}: {
  /** Any timestamp inside the day to render. */
  day: number;
  bookings: TimelineBooking[];
  now: number;
  openFrom?: string;
  openTo?: string;
  color?: string;
  variant?: 'compact' | 'detailed';
  onSelectBooking?: (booking: TimelineBooking) => void;
  formatTime: (ms: number) => string;
  className?: string;
}) {
  const { t } = useTranslation();

  const { windowStart, windowEnd, segments, nowPercent } = useMemo(() => {
    const base = new Date(day);
    base.setHours(0, 0, 0, 0);
    const start = base.getTime();
    const fromMin = parseHm(openFrom, DEFAULT_OPEN_FROM);
    const toMin = parseHm(openTo, DEFAULT_OPEN_TO);
    const winStart = start + fromMin * 60_000;
    const winEnd = start + Math.max(toMin, fromMin + 60) * 60_000;
    const span = winEnd - winStart;

    const clipped = bookings
      .filter((b) => b.endTime > winStart && b.startTime < winEnd)
      .sort((a, b) => a.startTime - b.startTime)
      .map((b) => {
        const from = Math.max(b.startTime, winStart);
        const to = Math.min(b.endTime, winEnd);
        return {
          booking: b,
          left: ((from - winStart) / span) * 100,
          width: Math.max(1.5, ((to - from) / span) * 100),
          isNow: b.startTime <= now && now < b.endTime,
        };
      });

    const insideWindow = now >= winStart && now <= winEnd;
    return {
      windowStart: winStart,
      windowEnd: winEnd,
      segments: clipped,
      nowPercent: insideWindow ? ((now - winStart) / span) * 100 : null,
    };
  }, [day, bookings, now, openFrom, openTo]);

  const accent = color ?? 'var(--primary)';
  const height = variant === 'detailed' ? 'h-9' : 'h-2.5';

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-full border border-(--border) bg-(--background-subtle)',
          height,
        )}
        role="img"
        aria-label={t('rooms.details.occupancyOf', {
          from: formatTime(windowStart),
          to: formatTime(windowEnd),
        })}
      >
        {segments.map(({ booking, left, width, isNow }) => (
          <button
            key={booking._id}
            type="button"
            tabIndex={onSelectBooking ? 0 : -1}
            aria-hidden={onSelectBooking ? undefined : true}
            onClick={
              onSelectBooking
                ? (event) => {
                    event.stopPropagation();
                    onSelectBooking(booking);
                  }
                : undefined
            }
            title={`${booking.title} · ${formatTime(booking.startTime)} – ${formatTime(booking.endTime)}`}
            className={cn(
              'absolute top-0 bottom-0 flex items-center overflow-hidden text-left transition-opacity',
              variant === 'detailed' ? 'rounded-lg px-2' : 'rounded-full',
              onSelectBooking ? 'cursor-pointer hover:opacity-80' : 'pointer-events-none',
              isNow && 'ring-2 ring-(--primary)/50',
            )}
            style={{
              left: `${left}%`,
              width: `${width}%`,
              background: isNow ? accent : `color-mix(in srgb, ${accent} 55%, transparent)`,
            }}
          >
            {variant === 'detailed' && width > 12 && (
              <span className="truncate text-[11px] font-semibold text-white drop-shadow">
                {booking.title}
              </span>
            )}
          </button>
        ))}

        {nowPercent !== null && (
          <span
            className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-(--text-primary)"
            style={{ left: `${nowPercent}%` }}
            aria-hidden="true"
          />
        )}
      </div>

      {variant === 'detailed' && (
        <div className="mt-1 flex justify-between text-[10px] font-medium text-(--text-muted)">
          <span>{formatTime(windowStart)}</span>
          {nowPercent !== null && <span>{t('rooms.details.now')}</span>}
          <span>{formatTime(windowEnd)}</span>
        </div>
      )}
    </div>
  );
}
