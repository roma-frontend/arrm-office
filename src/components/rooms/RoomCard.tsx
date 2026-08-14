'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Accessibility,
  Archive,
  ArchiveRestore,
  Armchair,
  CalendarClock,
  Coffee,
  EarOff,
  GlassWater,
  Info,
  MapPin,
  MoreVertical,
  Pencil,
  Phone,
  Presentation,
  Projector,
  Snowflake,
  Sun,
  Trash2,
  Tv,
  Users,
  Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  DEFAULT_ROOM_COLOR,
  formatRoomLocation,
  resolveRoomStatus,
  type AmenityKey,
} from '@/lib/meetingRooms';
import { RoomDayTimeline } from './RoomDayTimeline';
import { RoomStatusDot, RoomStatusPill, useRoomStatusText } from './RoomStatusIndicator';
import type { RoomWithBookings } from './types';

const AMENITY_ICONS: Record<AmenityKey, React.ComponentType<{ className?: string }>> = {
  projector: Projector,
  tv: Tv,
  whiteboard: Presentation,
  videoConference: Video,
  conferencePhone: Phone,
  airConditioning: Snowflake,
  naturalLight: Sun,
  coffee: Coffee,
  water: GlassWater,
  accessible: Accessibility,
  standingDesk: Armchair,
  soundproof: EarOff,
};

/** Icon for an amenity key, or `null` for keys we do not know about. */
export function AmenityIcon({ amenity, className }: { amenity: string; className?: string }) {
  const Icon = AMENITY_ICONS[amenity as AmenityKey];
  return Icon ? <Icon className={className} /> : null;
}

const MAX_VISIBLE_AMENITIES = 5;

/**
 * A single room on the board: live status, where it is, what is inside, how the
 * day looks and the one action people actually want — booking it.
 */
export function RoomCard({
  room,
  now,
  canManage,
  onOpen,
  onBook,
  onEdit,
  onToggleActive,
  onDelete,
  formatTime,
}: {
  room: RoomWithBookings;
  now: number;
  canManage: boolean;
  onOpen: (room: RoomWithBookings) => void;
  onBook: (room: RoomWithBookings) => void;
  onEdit: (room: RoomWithBookings) => void;
  onToggleActive: (room: RoomWithBookings) => void;
  onDelete: (room: RoomWithBookings) => void;
  formatTime: (ms: number) => string;
}) {
  const { t } = useTranslation();
  const statusText = useRoomStatusText();

  const info = useMemo(
    () => resolveRoomStatus(room.bookings, now, { isActive: room.isActive }),
    [room.bookings, room.isActive, now],
  );
  const { label, detail } = statusText(info, formatTime);
  const color = room.color ?? DEFAULT_ROOM_COLOR;
  const location = formatRoomLocation(room, (key, options) => t(key, options));
  const visibleAmenities = room.amenities.slice(0, MAX_VISIBLE_AMENITIES);
  const hiddenAmenities = room.amenities.length - visibleAmenities.length;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(room)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(room);
        }
      }}
      className={cn(
        'group relative flex cursor-pointer flex-col gap-3 overflow-hidden rounded-2xl border bg-(--card) p-4 text-left',
        // No transform on hover: the cards sit in a grid, and lifting them made
        // the whole board twitch as the pointer moved across it.
        'transition-[border-color,box-shadow] duration-200 hover:border-(--primary)/50 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary)',
        room.isActive ? 'border-(--border)' : 'border-dashed border-(--border) opacity-75',
      )}
    >
      {/* Accent stripe in the room's colour */}
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: color }}
        aria-hidden="true"
      />

      <div className="flex items-start justify-between gap-2 pl-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-bold text-(--text-primary)">{room.name}</h3>
            {!room.isActive && (
              <span className="rounded-full border border-(--border) px-2 py-0.5 text-[10px] font-semibold text-(--text-muted)">
                {t('rooms.archived')}
              </span>
            )}
          </div>
          {location && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-(--text-muted)">
              <MapPin className="h-3 w-3 shrink-0" />
              {location}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <RoomStatusPill status={info.status} label={label} />
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('rooms.manageRoom')}
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {/* The card is clickable (opens details); stop the click from
                    bubbling up through the React tree, or picking an action
                    here would also pop the details modal on top of whatever
                    this action opens. */}
                <DropdownMenuItem
                  onSelect={() => onEdit(room)}
                  onClick={(event) => event.stopPropagation()}
                  className="gap-2"
                >
                  <Pencil className="h-4 w-4" />
                  {t('rooms.editRoom')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => onToggleActive(room)}
                  onClick={(event) => event.stopPropagation()}
                  className="gap-2"
                >
                  {room.isActive ? (
                    <>
                      <Archive className="h-4 w-4" />
                      {t('rooms.archive')}
                    </>
                  ) : (
                    <>
                      <ArchiveRestore className="h-4 w-4" />
                      {t('rooms.restore')}
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => onDelete(room)}
                  onClick={(event) => event.stopPropagation()}
                  className="gap-2 text-(--danger-text) focus:text-(--danger-text)"
                >
                  <Trash2 className="h-4 w-4" />
                  {t('rooms.deleteRoom')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Live detail line */}
      <div className="flex items-center gap-2 pl-2">
        <RoomStatusDot status={info.status} />
        <p className="min-w-0 truncate text-sm text-(--text-secondary)">{detail}</p>
      </div>

      {/* Current or next meeting */}
      {(info.current ?? info.next) && (
        <div className="ml-2 rounded-xl border border-(--border) bg-(--background-subtle) p-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">
            <CalendarClock className="h-3 w-3" />
            {info.current ? t('rooms.details.inProgress') : t('rooms.details.upNext')}
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-(--text-primary)">
            {(info.current ?? info.next)!.title}
          </p>
          <p className="mt-0.5 text-xs text-(--text-muted)">
            {formatTime((info.current ?? info.next)!.startTime)} –{' '}
            {formatTime((info.current ?? info.next)!.endTime)}
            {(info.current ?? info.next)!.organizerName
              ? ` · ${(info.current ?? info.next)!.organizerName}`
              : ''}
          </p>
        </div>
      )}

      {/* Capacity + amenities */}
      <div className="flex flex-wrap items-center gap-2 pl-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-(--background-subtle) px-2 py-1 text-xs font-medium text-(--text-secondary)">
          <Users className="h-3.5 w-3.5" />
          {t('rooms.capacityPeople', { count: room.capacity })}
        </span>
        {visibleAmenities.map((amenity) => (
          <span
            key={amenity}
            title={t(`rooms.amenity.${amenity}`)}
            className="inline-flex items-center gap-1 rounded-full bg-(--background-subtle) px-2 py-1 text-xs text-(--text-muted)"
          >
            <AmenityIcon amenity={amenity} className="h-3.5 w-3.5" />
          </span>
        ))}
        {hiddenAmenities > 0 && (
          <span className="text-xs text-(--text-muted)">+{hiddenAmenities}</span>
        )}
      </div>

      {/* Today at a glance */}
      <div className="pl-2">
        <RoomDayTimeline
          day={now}
          bookings={room.bookings}
          now={now}
          openFrom={room.openFrom}
          openTo={room.openTo}
          color={color}
          formatTime={formatTime}
        />
      </div>

      <div className="flex items-center gap-2 pl-2">
        <Button
          size="sm"
          className="flex-1"
          disabled={!room.isActive}
          onClick={(event) => {
            event.stopPropagation();
            onBook(room);
          }}
        >
          {t('rooms.book')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(room);
          }}
        >
          <Info className="h-4 w-4" />
          {t('rooms.details.open')}
        </Button>
      </div>
    </div>
  );
}
