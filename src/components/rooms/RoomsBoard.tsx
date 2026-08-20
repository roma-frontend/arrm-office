'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Building2, DoorOpen, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { AMENITY_KEYS, resolveRoomStatus } from '@/lib/meetingRooms';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { useNow } from '@/hooks/useNow';
import { RoomCard, AmenityIcon } from './RoomCard';
import { RoomFormModal } from './RoomFormModal';
import { RoomBookingModal } from './RoomBookingModal';
import { RoomDetailsModal } from './RoomDetailsModal';
import type { RoomWithBookings } from './types';

const CAPACITY_STEPS = [0, 2, 4, 6, 10, 20];

/**
 * The meeting-room board.
 *
 * Statuses are recomputed from a ticking clock every 15 seconds, so a room
 * flips from "free" to "busy" on its own the moment a meeting starts — no
 * refetch, no page reload. Bookings themselves arrive through a reactive Convex
 * subscription, so someone else's booking appears here immediately too.
 */
export function RoomsBoard() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const organizationId = useSelectedOrganization();
  const now = useNow(15_000);

  const canManage = user?.role === 'admin' || user?.role === 'superadmin';

  const [search, setSearch] = useState('');
  const [minCapacity, setMinCapacity] = useState(0);
  const [requiredAmenities, setRequiredAmenities] = useState<string[]>([]);
  const [onlyFree, setOnlyFree] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [formRoom, setFormRoom] = useState<RoomWithBookings | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [bookingRoom, setBookingRoom] = useState<RoomWithBookings | null>(null);
  const [bookingDate, setBookingDate] = useState<Date | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [detailsRoom, setDetailsRoom] = useState<RoomWithBookings | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RoomWithBookings | null>(null);

  const setRoomActive = useMutation(api.meetingRooms.setRoomActive);
  const deleteRoom = useMutation(api.meetingRooms.deleteRoom);

  const rooms = useQuery(
    api.meetingRooms.getRoomsWithBookings,
    organizationId
      ? {
          organizationId: organizationId as Id<'organizations'>,
          includeArchived: showArchived,
        }
      : 'skip',
  ) as RoomWithBookings[] | undefined;

  const formatTime = useCallback((ms: number) => format(new Date(ms), 'HH:mm'), []);

  const stats = useMemo(() => {
    const list = rooms ?? [];
    let free = 0;
    let busy = 0;
    for (const room of list) {
      if (!room.isActive) continue;
      const status = resolveRoomStatus(room.bookings, now).status;
      if (status === 'occupied' || status === 'endingSoon') busy += 1;
      else free += 1;
    }
    return { total: list.filter((room) => room.isActive).length, free, busy };
  }, [rooms, now]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (rooms ?? []).filter((room) => {
      if (query) {
        const haystack = [room.name, room.building, room.floor, room.roomNumber, room.description]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (room.capacity < minCapacity) return false;
      if (requiredAmenities.some((amenity) => !room.amenities.includes(amenity))) return false;
      if (onlyFree) {
        const status = resolveRoomStatus(room.bookings, now, { isActive: room.isActive }).status;
        if (status !== 'free' && status !== 'startingSoon') return false;
      }
      return true;
    });
  }, [rooms, search, minCapacity, requiredAmenities, onlyFree, now]);

  const activeFilterCount =
    (search ? 1 : 0) + (minCapacity ? 1 : 0) + requiredAmenities.length + (onlyFree ? 1 : 0);

  const resetFilters = () => {
    setSearch('');
    setMinCapacity(0);
    setRequiredAmenities([]);
    setOnlyFree(false);
  };

  const openBooking = (room: RoomWithBookings, day?: Date) => {
    setBookingRoom(room);
    setBookingDate(day ?? null);
    setBookingOpen(true);
  };

  const handleToggleActive = async (room: RoomWithBookings) => {
    try {
      const result = await setRoomActive({
        roomId: room._id as Id<'meetingRooms'>,
        isActive: !room.isActive,
      });
      if (!room.isActive) {
        toast.success(t('rooms.restored', { room: room.name }));
      } else if (result.cancelledBookings > 0) {
        toast.success(
          t('rooms.archivedWithBookings', {
            room: room.name,
            bookings: result.cancelledBookings,
          }),
        );
      } else {
        toast.success(t('rooms.archivedRoom', { room: room.name }));
      }
    } catch (error) {
      logger.error('Toggle room state failed', error);
      toast.error(t('rooms.errors.generic'));
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteRoom({ roomId: pendingDelete._id as Id<'meetingRooms'> });
      toast.success(t('rooms.deleted', { room: pendingDelete.name }));
    } catch (error) {
      logger.error('Delete room failed', error);
      const message = error instanceof Error ? error.message : '';
      toast.error(
        message.includes('archive') ? t('rooms.errors.hasBookings') : t('rooms.errors.generic'),
      );
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between my-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-(--text-primary) sm:text-3xl">
            {t('rooms.title')}
          </h1>
          <p className="mt-1 text-sm text-(--text-muted)">{t('rooms.subtitle')}</p>
        </div>
        {canManage && (
          <Button
            size="sm"
            onClick={() => {
              setFormRoom(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {t('rooms.newRoom')}
          </Button>
        )}
      </div>

      {/* Live summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryTile label={t('rooms.board.freeNow')} value={stats.free} dot="#10b981" />
        <SummaryTile label={t('rooms.board.busyNow')} value={stats.busy} dot="#ef4444" />
        <SummaryTile label={t('rooms.board.total')} value={stats.total} dot="var(--primary)" />
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-(--text-muted)" />
            <Input
              className="pl-9"
              value={search}
              placeholder={t('rooms.filters.searchPlaceholder')}
              aria-label={t('rooms.filters.search')}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters((prev) => !prev)}
            aria-expanded={showFilters}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {t('rooms.filters.title')}
            {activeFilterCount > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-(--primary) px-1.5 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </Button>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="h-4 w-4" />
              {t('rooms.filters.reset')}
            </Button>
          )}
        </div>

        {showFilters && (
          <div className="space-y-4 rounded-2xl border border-(--border) bg-(--card) p-4">
            <div className="space-y-2">
              <Label>{t('rooms.filters.minCapacity')}</Label>
              <div className="flex flex-wrap gap-2">
                {CAPACITY_STEPS.map((step) => (
                  <button
                    key={step}
                    type="button"
                    aria-pressed={minCapacity === step}
                    onClick={() => setMinCapacity(step)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer',
                      minCapacity === step
                        ? 'border-(--primary) bg-(--primary)/10 text-(--primary)'
                        : 'border-(--border) bg-(--background-subtle) text-(--text-muted) hover:text-(--text-primary)',
                    )}
                  >
                    {step === 0 ? t('rooms.filters.any') : `${step}+`}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('rooms.filters.amenities')}</Label>
              <div className="flex flex-wrap gap-2">
                {AMENITY_KEYS.map((amenity) => {
                  const active = requiredAmenities.includes(amenity);
                  return (
                    <button
                      key={amenity}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setRequiredAmenities((prev) =>
                          prev.includes(amenity)
                            ? prev.filter((item) => item !== amenity)
                            : [...prev, amenity],
                        )
                      }
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer',
                        active
                          ? 'border-(--primary) bg-(--primary)/10 text-(--primary)'
                          : 'border-(--border) bg-(--background-subtle) text-(--text-muted) hover:text-(--text-primary)',
                      )}
                    >
                      <AmenityIcon amenity={amenity} className="h-3.5 w-3.5" />
                      {t(`rooms.amenity.${amenity}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch id="only-free" checked={onlyFree} onCheckedChange={setOnlyFree} />
                <Label htmlFor="only-free" className="cursor-pointer">
                  {t('rooms.filters.onlyFree')}
                </Label>
              </div>
              {canManage && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="show-archived"
                    checked={showArchived}
                    onCheckedChange={setShowArchived}
                  />
                  <Label htmlFor="show-archived" className="cursor-pointer">
                    {t('rooms.filters.showArchived')}
                  </Label>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Grid */}
      {rooms === undefined ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-64 animate-pulse rounded-2xl bg-(--background-subtle)" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-(--border) py-16 text-center">
          <DoorOpen className="mx-auto mb-3 h-12 w-12 text-(--border)" />
          <p className="text-sm font-semibold text-(--text-primary)">
            {rooms.length === 0 ? t('rooms.empty.noRooms') : t('rooms.empty.noMatches')}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-(--text-muted)">
            {rooms.length === 0
              ? canManage
                ? t('rooms.empty.noRoomsAdmin')
                : t('rooms.empty.noRoomsMember')
              : t('rooms.empty.tryFewerFilters')}
          </p>
          {rooms.length === 0 && canManage && (
            <Button
              size="sm"
              className="mt-4"
              onClick={() => {
                setFormRoom(null);
                setFormOpen(true);
              }}
            >
              <Building2 className="h-4 w-4" />
              {t('rooms.newRoom')}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((room) => (
            <RoomCard
              key={room._id}
              room={room}
              now={now}
              canManage={canManage}
              formatTime={formatTime}
              onOpen={setDetailsRoom}
              onBook={(target) => openBooking(target)}
              onEdit={(target) => {
                setFormRoom(target);
                setFormOpen(true);
              }}
              onToggleActive={handleToggleActive}
              onDelete={setPendingDelete}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <RoomFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        organizationId={organizationId}
        room={formRoom}
      />

      <RoomBookingModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        organizationId={organizationId}
        rooms={rooms ?? []}
        initialRoomId={bookingRoom?._id ?? null}
        initialDate={bookingDate}
      />

      <RoomDetailsModal
        open={detailsRoom !== null}
        onClose={() => setDetailsRoom(null)}
        room={detailsRoom}
        canManage={canManage}
        onBook={(target, day) => {
          setDetailsRoom(null);
          openBooking(target as RoomWithBookings, day);
        }}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('rooms.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('rooms.deleteConfirmBody', { room: pendingDelete?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('rooms.deleteRoom')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryTile({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-(--border) bg-(--card) px-4 py-3">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot }} />
      <span className="text-xl font-bold tabular-nums text-(--text-primary)">{value}</span>
      <span className="min-w-0 truncate text-xs text-(--text-muted)">{label}</span>
    </div>
  );
}

export default RoomsBoard;
