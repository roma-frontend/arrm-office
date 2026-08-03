'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'convex/react';
import { toast } from 'sonner';
import { Building2, Check, Loader2 } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AMENITY_KEYS, DEFAULT_ROOM_COLOR, ROOM_COLORS } from '@/lib/meetingRooms';
import { logger } from '@/lib/logger';
import { AmenityIcon } from './RoomCard';
import { RoomModalShell } from './RoomModalShell';
import type { RoomDoc } from './types';

interface RoomFormModalProps {
  open: boolean;
  onClose: () => void;
  organizationId: string | null;
  /** Present when editing; absent when creating. */
  room?: RoomDoc | null;
}

interface FormState {
  name: string;
  description: string;
  building: string;
  floor: string;
  roomNumber: string;
  capacity: string;
  amenities: string[];
  color: string;
  photoUrl: string;
  openFrom: string;
  openTo: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  building: '',
  floor: '',
  roomNumber: '',
  capacity: '6',
  amenities: [],
  color: DEFAULT_ROOM_COLOR,
  photoUrl: '',
  openFrom: '08:00',
  openTo: '20:00',
};

function toFormState(room: RoomDoc): FormState {
  return {
    name: room.name,
    description: room.description ?? '',
    building: room.building ?? '',
    floor: room.floor ?? '',
    roomNumber: room.roomNumber ?? '',
    capacity: String(room.capacity),
    amenities: [...room.amenities],
    color: room.color ?? DEFAULT_ROOM_COLOR,
    photoUrl: room.photoUrl ?? '',
    openFrom: room.openFrom ?? '08:00',
    openTo: room.openTo ?? '20:00',
  };
}

/** Admin dialog for creating and editing a meeting room. */
export function RoomFormModal({ open, onClose, organizationId, room }: RoomFormModalProps) {
  const { t } = useTranslation();
  const createRoom = useMutation(api.meetingRooms.createRoom);
  const updateRoom = useMutation(api.meetingRooms.updateRoom);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  // Re-seed the form whenever the dialog opens for a different room.
  useEffect(() => {
    if (!open) return;
    setForm(room ? toFormState(room) : EMPTY_FORM);
    setTouched(false);
  }, [open, room]);

  const capacityNumber = Number(form.capacity);
  const errors = useMemo(() => {
    const list: string[] = [];
    if (!form.name.trim()) list.push(t('rooms.form.nameRequired'));
    if (!Number.isInteger(capacityNumber) || capacityNumber < 1 || capacityNumber > 1000) {
      list.push(t('rooms.form.capacityRange'));
    }
    if (form.openFrom && form.openTo && form.openFrom >= form.openTo) {
      list.push(t('rooms.form.openHoursInvalid'));
    }
    return list;
  }, [form, capacityNumber, t]);

  const toggleAmenity = (amenity: string) =>
    setForm((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter((a) => a !== amenity)
        : [...prev.amenities, amenity],
    }));

  const handleSubmit = async () => {
    setTouched(true);
    if (errors.length > 0) return;
    if (!organizationId && !room) {
      toast.error(t('rooms.form.noOrganization'));
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      building: form.building.trim() || undefined,
      floor: form.floor.trim() || undefined,
      roomNumber: form.roomNumber.trim() || undefined,
      capacity: capacityNumber,
      amenities: form.amenities,
      color: form.color,
      photoUrl: form.photoUrl.trim() || undefined,
      openFrom: form.openFrom || undefined,
      openTo: form.openTo || undefined,
    };

    setSaving(true);
    try {
      if (room) {
        await updateRoom({ roomId: room._id as Id<'meetingRooms'>, ...payload });
        toast.success(t('rooms.form.updated'));
      } else {
        await createRoom({
          organizationId: organizationId as Id<'organizations'>,
          ...payload,
        });
        toast.success(t('rooms.form.created'));
      }
      onClose();
    } catch (error) {
      logger.error('Room save failed', error);
      const message = error instanceof Error ? error.message : '';
      toast.error(
        message.includes('already exists')
          ? t('rooms.form.duplicateName')
          : t('rooms.errors.generic'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <RoomModalShell
      open={open}
      onClose={onClose}
      title={room ? t('rooms.editRoom') : t('rooms.newRoom')}
      subtitle={t('rooms.form.subtitle')}
      icon={<Building2 className="h-6 w-6" />}
      accent={form.color}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-(--text-muted)">
            {touched && errors.length > 0 ? errors[0] : t('rooms.form.hint')}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              {t('buttons.cancel')}
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {room ? t('buttons.save') : t('rooms.form.create')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="room-name">{t('rooms.form.name')}</Label>
          <Input
            id="room-name"
            value={form.name}
            maxLength={120}
            placeholder={t('rooms.form.namePlaceholder')}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            aria-invalid={touched && !form.name.trim()}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="room-building">{t('rooms.form.building')}</Label>
            <Input
              id="room-building"
              value={form.building}
              onChange={(event) => setForm((prev) => ({ ...prev, building: event.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="room-floor">{t('rooms.form.floor')}</Label>
            <Input
              id="room-floor"
              value={form.floor}
              onChange={(event) => setForm((prev) => ({ ...prev, floor: event.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="room-number">{t('rooms.form.roomNumber')}</Label>
            <Input
              id="room-number"
              value={form.roomNumber}
              onChange={(event) => setForm((prev) => ({ ...prev, roomNumber: event.target.value }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="room-capacity">{t('rooms.form.capacity')}</Label>
            <Input
              id="room-capacity"
              type="number"
              min={1}
              max={1000}
              value={form.capacity}
              onChange={(event) => setForm((prev) => ({ ...prev, capacity: event.target.value }))}
              aria-invalid={touched && (capacityNumber < 1 || Number.isNaN(capacityNumber))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="room-open-from">{t('rooms.form.openFrom')}</Label>
            <Input
              id="room-open-from"
              type="time"
              value={form.openFrom}
              onChange={(event) => setForm((prev) => ({ ...prev, openFrom: event.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="room-open-to">{t('rooms.form.openTo')}</Label>
            <Input
              id="room-open-to"
              type="time"
              value={form.openTo}
              onChange={(event) => setForm((prev) => ({ ...prev, openTo: event.target.value }))}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="room-description">{t('rooms.form.description')}</Label>
          <Textarea
            id="room-description"
            rows={3}
            maxLength={2000}
            value={form.description}
            placeholder={t('rooms.form.descriptionPlaceholder')}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <Label>{t('rooms.amenities')}</Label>
          <div className="flex flex-wrap gap-2">
            {AMENITY_KEYS.map((amenity) => {
              const active = form.amenities.includes(amenity);
              return (
                <button
                  key={amenity}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleAmenity(amenity)}
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

        <div className="space-y-2">
          <Label>{t('rooms.form.color')}</Label>
          <div className="flex flex-wrap gap-2">
            {ROOM_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={color}
                aria-pressed={form.color === color}
                onClick={() => setForm((prev) => ({ ...prev, color }))}
                className={cn(
                  'h-8 w-8 rounded-full transition-transform cursor-pointer',
                  form.color === color
                    ? 'ring-2 ring-(--text-primary) ring-offset-2 ring-offset-(--card) scale-110'
                    : 'hover:scale-105',
                )}
                style={{ background: color }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="room-photo">{t('rooms.form.photoUrl')}</Label>
          <Input
            id="room-photo"
            type="url"
            inputMode="url"
            value={form.photoUrl}
            placeholder="https://…"
            onChange={(event) => setForm((prev) => ({ ...prev, photoUrl: event.target.value }))}
          />
        </div>
      </div>
    </RoomModalShell>
  );
}
