'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { format } from 'date-fns';
import { DoorOpen, Plus } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DEFAULT_ROOM_COLOR, resolveRoomStatus } from '@/lib/meetingRooms';
import { useNow } from '@/hooks/useNow';
import { RoomStatusDot, useRoomStatusText } from './RoomStatusIndicator';
import type { RoomWithBookings } from './types';

/**
 * Compact live availability list for the calendar sidebar.
 *
 * Same source of truth as the rooms board (one reactive query plus a ticking
 * clock), so a room that becomes busy blinks over here too without the user
 * leaving the calendar.
 */
export function RoomAvailabilityStrip({
  organizationId,
  onOpenRoom,
  onBookRoom,
  limit = 6,
}: {
  organizationId: string | null;
  onOpenRoom: (room: RoomWithBookings) => void;
  onBookRoom: (room: RoomWithBookings) => void;
  limit?: number;
}) {
  const { t } = useTranslation();
  const now = useNow(15_000);
  const statusText = useRoomStatusText();

  const rooms = useQuery(
    api.meetingRooms.getRoomsWithBookings,
    organizationId ? { organizationId: organizationId as Id<'organizations'> } : 'skip',
  ) as RoomWithBookings[] | undefined;

  const formatTime = (ms: number) => format(new Date(ms), 'HH:mm');

  const ranked = useMemo(() => {
    // Free rooms first — that is what someone glancing at the calendar needs.
    const order = { free: 0, startingSoon: 1, endingSoon: 2, occupied: 3, archived: 4 } as const;
    return (rooms ?? [])
      .map((room) => ({
        room,
        info: resolveRoomStatus(room.bookings, now, { isActive: room.isActive }),
      }))
      .sort(
        (a, b) =>
          order[a.info.status] - order[b.info.status] || a.room.name.localeCompare(b.room.name),
      )
      .slice(0, limit);
  }, [rooms, now, limit]);

  const freeCount = ranked.filter(
    ({ info }) => info.status === 'free' || info.status === 'startingSoon',
  ).length;

  if (rooms !== undefined && rooms.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex min-w-0 items-center gap-1.5 text-sm uppercase tracking-wider text-(--text-muted)">
            <DoorOpen className="h-4 w-4 shrink-0" />
            <span className="truncate">{t('rooms.calendar.availability')}</span>
          </CardTitle>
          {rooms !== undefined && (
            <Badge
              variant="secondary"
              className="h-5 shrink-0 px-2 text-[10px] whitespace-nowrap tabular-nums"
            >
              {t('rooms.calendar.freeOf', { free: freeCount, total: rooms.length })}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4">
        {rooms === undefined
          ? [0, 1, 2].map((index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg bg-(--background-subtle)" />
            ))
          : ranked.map(({ room, info }) => {
              const { label, detail } = statusText(info, formatTime);
              // The sidebar column is narrow: show the status plus the single
              // time that matters, and keep the full sentence in the tooltip.
              const turningPoint = info.busyUntil ?? info.freeUntil;
              const compact = turningPoint ? `${label} · ${formatTime(turningPoint)}` : label;
              return (
                <div
                  key={room._id}
                  role="button"
                  tabIndex={0}
                  title={`${room.name} — ${detail}`}
                  onClick={() => onOpenRoom(room)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onOpenRoom(room);
                    }
                  }}
                  className={cn(
                    'group flex cursor-pointer items-center gap-2.5 rounded-lg border border-(--border) bg-(--background-subtle) p-2',
                    'transition-colors hover:border-(--primary)/50',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary)',
                  )}
                >
                  <span
                    className="h-8 w-1 shrink-0 rounded-full"
                    style={{ background: room.color ?? DEFAULT_ROOM_COLOR }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-(--text-primary)">
                      {room.name}
                    </p>
                    <p className="flex items-center gap-1 truncate text-[10px] text-(--text-muted)">
                      <RoomStatusDot status={info.status} size="sm" />
                      <span className="truncate">{compact}</span>
                    </p>
                  </div>
                  {room.isActive && (
                    <button
                      type="button"
                      aria-label={t('rooms.book')}
                      title={t('rooms.book')}
                      onClick={(event) => {
                        event.stopPropagation();
                        onBookRoom(room);
                      }}
                      className="shrink-0 rounded-lg p-1.5 text-(--text-muted) opacity-0 transition-all group-hover:opacity-100 hover:bg-(--primary)/10 hover:text-(--primary) focus-visible:opacity-100 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
      </CardContent>
    </Card>
  );
}
