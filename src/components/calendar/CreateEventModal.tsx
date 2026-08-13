'use client';

import React, { useState, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import {
  Calendar,
  Clock,
  MapPin,
  AlignLeft,
  Tag,
  Bell,
  Video,
  Paperclip,
  X,
  FileText,
  Users,
  AlertTriangle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  DoorOpen,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { uploadTaskAttachment } from '@/actions/cloudinary';
import { getInitials } from '@/lib/stringUtils';
import { playNotificationSound, sendBrowserNotification } from '@/lib/notificationSound';
import { useWizardDraft } from '@/hooks/useWizardDraft';
import { WizardDraftNotice } from '@/components/ui/WizardDraftNotice';
import {
  capacityFits,
  DEFAULT_ROOM_COLOR,
  formatRoomLocation,
  slotAvailability,
  type RoomBookingLite,
} from '@/lib/meetingRooms';
import { AmenityIcon } from '@/components/rooms/RoomCard';
import type { RoomWithBookings } from '@/components/rooms/types';

/** All-day events hold a room for the working day rather than a full 24 hours. */
const ALL_DAY_ROOM_START = '08:00';
const ALL_DAY_ROOM_END = '20:00';

/** Local wall-clock ("2026-08-04", "10:00") → epoch ms in the viewer's zone. */
function toInstant(date: string, time: string): number | null {
  if (!date || !time) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if ([year, month, day, hour, minute].some((part) => part === undefined || Number.isNaN(part))) {
    return null;
  }
  return new Date(year!, month! - 1, day!, hour!, minute!, 0, 0).getTime();
}

interface CreateEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate?: Date | null;
  leaves?: Array<{ userId: string; startDate: string; endDate: string; status: string }>;
  onSave?: (event: CalendarEvent) => void;
  editEvent?: CalendarEvent | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string;
  description: string;
  category: string;
  reminder: string;
  /** Attendee names, for labels. Kept in step with `attendeeIds` by the backend. */
  attendees: string[];
  /**
   * The attendees themselves. Names alone cannot be re-selected in the picker,
   * so without the ids editing an event would silently drop its guest list.
   */
  attendeeIds?: string[];
  attachmentUrl?: string;
  /** Set when the event comes from the backend; absent for drafts. */
  createdAt?: number;
  /** Organizer id — set by the backend; used by the personal calendar scope. */
  createdBy?: string;
  /** Meeting room held by this event, when one was reserved. */
  roomId?: string;
  roomBookingId?: string;
  roomName?: string;
  roomColor?: string;
}

interface OrgUser {
  _id: Id<'users'>;
  name: string;
  position?: string;
  department?: string;
  avatarUrl?: string | null;
}

const STEPS = ['details', 'people', 'extras'] as const;
type Step = (typeof STEPS)[number];

export function CreateEventModal({
  open,
  onOpenChange,
  selectedDate,
  leaves = [],
  onSave,
  editEvent,
}: CreateEventModalProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const createEventMutation = useMutation(api.calendarEvents.create);
  const updateEventMutation = useMutation(api.calendarEvents.update);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('details');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('meeting');
  const [reminder, setReminder] = useState('15min');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [attendees, setAttendees] = useState<OrgUser[]>([]);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [showPeoplePicker, setShowPeoplePicker] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);

  const organizationId = (selectedOrgId ?? user?.organizationId) as Id<'organizations'> | undefined;
  const requesterId = user?.id as Id<'users'> | undefined;

  const orgUsers = useQuery(
    api.users.getUsersByOrganizationId,
    organizationId && requesterId ? { organizationId } : 'skip',
  ) as OrgUser[] | undefined;

  const filteredUsers = useMemo(() => {
    if (!orgUsers) return [];
    const q = attendeeSearch.toLowerCase().trim();
    const list = q
      ? orgUsers.filter(
          (u) => u.name.toLowerCase().includes(q) || (u.position ?? '').toLowerCase().includes(q),
        )
      : orgUsers;
    return list.filter((u) => !attendees.find((a) => a._id === u._id)).slice(0, 8);
  }, [orgUsers, attendeeSearch, attendees]);

  const getConflict = (userId: string): boolean => {
    if (!date) return false;
    return leaves.some(
      (l) =>
        l.userId === userId && l.status === 'approved' && l.startDate <= date && l.endDate >= date,
    );
  };

  // --- Meeting rooms ----------------------------------------------------------
  // The reservation window follows the event: a timed event books exactly its
  // slot, an all-day event holds the room for the working day (a full 24h block
  // would exceed the maximum booking length and help nobody).
  const roomStart = toInstant(date, allDay ? ALL_DAY_ROOM_START : startTime);
  const roomEnd = toInstant(date, allDay ? ALL_DAY_ROOM_END : endTime);
  const roomWindowValid = roomStart !== null && roomEnd !== null && roomEnd > roomStart;

  const dayBounds = useMemo(() => {
    const dayStart = toInstant(date, '00:00');
    if (dayStart === null) return null;
    return { from: dayStart, to: dayStart + 24 * 60 * 60 * 1000 };
  }, [date]);

  const rooms = useQuery(
    api.meetingRooms.getRoomsWithBookings,
    organizationId && dayBounds
      ? { organizationId, from: dayBounds.from, to: dayBounds.to }
      : 'skip',
  ) as RoomWithBookings[] | undefined;

  /**
   * Availability per room for the chosen slot, recomputed locally as the user
   * edits times — no round trip, so the list never lags behind the form. The
   * event's own reservation is excluded so that editing a meeting does not make
   * it clash with itself.
   */
  const roomAvailability = useMemo(() => {
    const map = new Map<string, ReturnType<typeof slotAvailability>>();
    if (!rooms || !roomWindowValid) return map;
    for (const room of rooms) {
      map.set(
        room._id,
        slotAvailability(
          room.bookings as RoomBookingLite[],
          roomStart!,
          roomEnd!,
          editEvent?.roomBookingId,
        ),
      );
    }
    return map;
  }, [rooms, roomWindowValid, roomStart, roomEnd, editEvent?.roomBookingId]);

  const selectedRoom = useMemo(
    () => rooms?.find((room) => room._id === roomId) ?? null,
    [rooms, roomId],
  );
  const selectedRoomAvailability = roomId ? roomAvailability.get(roomId) : undefined;
  /**
   * The slot can turn busy after a room was picked — the user goes back a step
   * and shifts the time onto somebody else's meeting. Surfacing it here beats
   * letting the save fail.
   */
  const selectedRoomBlocked = Boolean(
    selectedRoom && selectedRoomAvailability && !selectedRoomAvailability.available,
  );
  const headcount = attendees.length + 1;
  const formatTime = (ms: number) => format(new Date(ms), 'HH:mm');

  const handlePickRoom = (room: RoomWithBookings) => {
    if (room._id === roomId) {
      setRoomId(null);
      if (location === room.name) setLocation('');
      return;
    }
    if (!roomWindowValid) {
      toast.error(t('createMeeting.room.setTimeFirst'));
      setStep('details');
      return;
    }
    if (!capacityFits(room.capacity, attendees.length)) {
      toast.error(t('createMeeting.room.tooSmall', { room: room.name, max: room.capacity }));
      return;
    }
    const availability = roomAvailability.get(room._id);
    if (availability && !availability.available) {
      // The user asked for a busy room: say until when it is taken, and offer
      // the nearest slot that would fit instead of a dead end.
      toast.error(
        t('createMeeting.room.busyUntil', {
          room: room.name,
          time: formatTime(availability.busyUntil ?? roomEnd!),
        }),
        {
          description: availability.suggestion
            ? t('createMeeting.room.nextFreeSlot', {
                time: formatTime(availability.suggestion),
              })
            : availability.conflicts[0]?.title,
          duration: 6000,
        },
      );
      return;
    }
    setRoomId(room._id);
    // A room is a location: fill the field unless the user typed their own.
    if (!location.trim()) setLocation(room.name);
  };

  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  // Пока из черновика восстановлены данные, гидрация из editEvent не должна
  // затирать их: editEvent может прийти позже (асинхронный запрос родителя),
  // а restore выполняется в макротаске.
  const restoredDraftRef = useRef(false);

  const editId = editEvent?.id ?? null;
  React.useEffect(() => {
    if (!open) return;
    if (restoredDraftRef.current) return;
    if (editEvent) {
      setTitle(editEvent.title);
      setDate(editEvent.date);
      setStartTime(editEvent.startTime);
      setEndTime(editEvent.endTime);
      setAllDay(editEvent.allDay);
      setLocation(editEvent.location);
      setDescription(editEvent.description);
      setCategory(editEvent.category);
      setReminder(editEvent.reminder);
      setRoomId(editEvent.roomId ?? null);
    } else if (selectedDate) {
      setDate(format(selectedDate, 'yyyy-MM-dd'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId]);

  const resetForm = () => {
    setStep('details');
    setTitle('');
    setDate('');
    setStartTime('09:00');
    setEndTime('10:00');
    setAllDay(false);
    setLocation('');
    setDescription('');
    setCategory('meeting');
    setReminder('15min');
    setAttachment(null);
    setAttendees([]);
    setAttendeeSearch('');
    setShowPeoplePicker(false);
    setRoomId(null);
    setUploading(false);
  };

  // ── Черновик: введённые данные переживают случайное закрытие модалки ───────
  const draftData = useMemo(
    () => ({
      title,
      date,
      startTime,
      endTime,
      allDay,
      location,
      description,
      category,
      reminder,
      roomId,
      attendees,
    }),
    [
      title,
      date,
      startTime,
      endTime,
      allDay,
      location,
      description,
      category,
      reminder,
      roomId,
      attendees,
    ],
  );

  // «Нетронутая форма» — пустое состояние (или данные редактируемого события),
  // чтобы плашка не появлялась на формах без правок.
  const pristineForm = useMemo(
    () => ({
      title: editEvent?.title ?? '',
      date: editEvent?.date ?? (selectedDate ? format(selectedDate, 'yyyy-MM-dd') : ''),
      startTime: editEvent?.startTime ?? '09:00',
      endTime: editEvent?.endTime ?? '10:00',
      allDay: editEvent?.allDay ?? false,
      location: editEvent?.location ?? '',
      description: editEvent?.description ?? '',
      category: editEvent?.category ?? 'meeting',
      reminder: editEvent?.reminder ?? '15min',
      roomId: editEvent?.roomId ?? null,
    }),
    [editEvent, selectedDate],
  );

  const handleRestoreDraft = useCallback((d: typeof draftData, savedStep: number) => {
    restoredDraftRef.current = true;
    if (d.title !== undefined) setTitle(d.title);
    if (d.date !== undefined) setDate(d.date);
    if (d.startTime !== undefined) setStartTime(d.startTime);
    if (d.endTime !== undefined) setEndTime(d.endTime);
    if (d.allDay !== undefined) setAllDay(d.allDay);
    if (d.location !== undefined) setLocation(d.location);
    if (d.description !== undefined) setDescription(d.description);
    if (d.category !== undefined) setCategory(d.category);
    if (d.reminder !== undefined) setReminder(d.reminder);
    if (d.roomId !== undefined) setRoomId(d.roomId);
    if (Array.isArray(d.attendees)) setAttendees(d.attendees as OrgUser[]);
    setStep(STEPS[Math.min(Math.max(savedStep, 0), STEPS.length - 1)] as Step);
  }, []);

  const draft = useWizardDraft({
    key: `create-event:${editId ?? 'new'}`,
    enabled: open,
    data: draftData,
    step: stepIndex,
    defaults: pristineForm,
    onRestore: handleRestoreDraft,
  });
  const { clearDraft } = draft;

  const handleStartOver = () => {
    clearDraft();
    restoredDraftRef.current = false;
    // Вернуть «нетронутую» форму: данные редактируемого события или пустоту.
    resetForm();
    setTitle(pristineForm.title);
    setDate(pristineForm.date);
    setStartTime(pristineForm.startTime);
    setEndTime(pristineForm.endTime);
    setAllDay(pristineForm.allDay);
    setLocation(pristineForm.location);
    setDescription(pristineForm.description);
    setCategory(pristineForm.category);
    setReminder(pristineForm.reminder);
    setRoomId(pristineForm.roomId);
  };

  /**
   * Закрытие крестиком / Escape / кликом вне окна — сохраняет черновик.
   * Явная кнопка «Отмена» стирает его и сбрасывает форму.
   */
  const handleClose = (val: boolean) => {
    onOpenChange(val);
  };

  const handleCancel = () => {
    clearDraft();
    restoredDraftRef.current = false;
    resetForm();
    onOpenChange(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast.error(t('createMeeting.fileTooBig'));
      return;
    }
    setAttachment(file);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error(t('createMeeting.required'));
      setStep('details');
      return;
    }
    if (roomId && !roomWindowValid) {
      toast.error(t('createMeeting.room.setTimeFirst'));
      setStep('details');
      return;
    }
    if (selectedRoom && selectedRoomBlocked) {
      toast.error(
        t('createMeeting.room.busyUntil', {
          room: selectedRoom.name,
          time: formatTime(selectedRoomAvailability?.busyUntil ?? roomEnd ?? Date.now()),
        }),
        {
          description: selectedRoomAvailability?.suggestion
            ? t('createMeeting.room.nextFreeSlot', {
                time: formatTime(selectedRoomAvailability.suggestion),
              })
            : undefined,
        },
      );
      setStep('people');
      return;
    }
    setUploading(true);
    try {
      let attachmentUrl: string | undefined;
      if (attachment) {
        const base64 = await fileToBase64(attachment);
        attachmentUrl = await uploadTaskAttachment(base64, attachment.name, attachment.type);
      }

      const payload = {
        title,
        date,
        startTime: allDay ? '00:00' : startTime,
        endTime: allDay ? '23:59' : endTime,
        allDay,
        location: location || undefined,
        description: description || undefined,
        category,
        reminder,
        attendees: attendees.map((a) => a.name),
        attachmentUrl,
        // The room is reserved by the same mutation, so an event never claims a
        // room it did not get.
        roomId: (roomId as Id<'meetingRooms'> | null) ?? undefined,
        roomStartTime: roomId && roomWindowValid ? roomStart! : undefined,
        roomEndTime: roomId && roomWindowValid ? roomEnd! : undefined,
        attendeeIds: attendees.map((a) => a._id),
      };

      if (editEvent?.id && organizationId) {
        await updateEventMutation({ id: editEvent.id as Id<'calendarEvents'>, ...payload });
      } else if (organizationId) {
        await createEventMutation({ organizationId, ...payload });
      }

      toast.success(
        selectedRoom
          ? t('createMeeting.room.reserved', { room: selectedRoom.name })
          : t('createMeeting.saved'),
      );
      // Schedule reminder notification
      if (date && reminder !== 'none') {
        scheduleReminder(title, date, allDay ? '09:00' : startTime, reminder, t);
      }

      // Save event
      const event: CalendarEvent = {
        id: editEvent?.id ?? `evt_${Date.now()}`,
        title,
        date,
        startTime: allDay ? '00:00' : startTime,
        endTime: allDay ? '23:59' : endTime,
        allDay,
        location,
        description,
        category,
        reminder,
        attendees: attendees.map((a) => a.name),
        attachmentUrl,
        roomId: roomId ?? undefined,
        roomName: selectedRoom?.name,
        roomColor: selectedRoom?.color,
      };
      onSave?.(event);
      clearDraft();
      restoredDraftRef.current = false;
      resetForm();
      handleClose(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      const busy = parseRoomBusyError(message);
      if (busy) {
        // Somebody grabbed the room between the preview and the submit.
        toast.error(
          t('createMeeting.room.takenJustNow', {
            room: selectedRoom?.name ?? '',
            time: format(new Date(busy.endTime), 'HH:mm'),
          }),
          { description: busy.title, duration: 7000 },
        );
        setStep('people');
      } else if (message.includes('capacity')) {
        toast.error(
          t('createMeeting.room.tooSmall', {
            room: selectedRoom?.name ?? '',
            max: selectedRoom?.capacity ?? 0,
          }),
        );
        setStep('people');
      } else {
        toast.error(message || 'Error');
      }
    } finally {
      setUploading(false);
    }
  };

  const nextStep = () => {
    if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1] as Step);
    else handleSave();
  };
  const prevStep = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1] as Step);
  };
  const canNext = step === 'details' ? title.trim().length > 0 : true;

  const stepLabels = [
    t('createMeeting.date'),
    t('createMeeting.peopleAndRoom'),
    t('createMeeting.attachment'),
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[640px] max-h-[92vh] overflow-hidden p-0 gap-0 flex flex-col">
        {/* Header with stepper */}
        <div className="shrink-0 bg-(--card) border-b border-(--border) px-6 pt-5 pb-4">
          <h2 className="text-xl font-bold text-(--text-primary) mb-4">
            {t('createMeeting.title')}
          </h2>
          {/* Progress bar */}
          <div className="relative h-1.5 bg-(--background-subtle) rounded-full overflow-hidden mb-3">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          {/* Step indicators */}
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => (
              <button
                key={s}
                onClick={() => (i <= stepIndex || canNext) && setStep(s)}
                className="flex items-center gap-2 group"
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${i < stepIndex ? 'bg-blue-500 border-blue-500 text-white' : i === stepIndex ? 'border-blue-500 text-blue-500 bg-blue-500/10' : 'border-(--border) text-(--text-muted)'}`}
                >
                  {i < stepIndex ? <CheckCircle className="w-4 h-4" /> : i + 1}
                </div>
                <span
                  className={`text-xs font-medium hidden sm:inline ${i === stepIndex ? 'text-blue-500' : 'text-(--text-muted)'}`}
                >
                  {stepLabels[i]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <WizardDraftNotice
            show={draft.restored}
            step={draft.restoredStep}
            onReset={handleStartOver}
          />
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Step 1: Details */}
              {step === 'details' && (
                <div className="space-y-5">
                  {/* Title */}
                  <div>
                    <Label className="text-sm font-medium text-(--text-primary) mb-1.5 block">
                      {t('createMeeting.titlePlaceholder')} *
                    </Label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t('createMeeting.titlePlaceholder')}
                      className="h-12 text-base border-2 border-(--border) focus-visible:border-blue-500 rounded-xl"
                      autoFocus
                    />
                  </div>
                  {/* Date & Time */}
                  <div className="p-4 rounded-xl border border-(--border) bg-(--background-subtle)/50 space-y-3">
                    <div className="flex items-center gap-2 text-blue-500">
                      <Calendar className="w-4 h-4" />
                      <span className="text-sm font-semibold">{t('createMeeting.date')}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Input
                        type="date"
                        value={date}
                        min={editEvent ? undefined : format(new Date(), 'yyyy-MM-dd')}
                        onChange={(e) => setDate(e.target.value)}
                        className="h-10 rounded-lg"
                      />
                      {!allDay && (
                        <>
                          <div className="relative">
                            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                            <Input
                              type="time"
                              value={startTime}
                              onChange={(e) => setStartTime(e.target.value)}
                              className="h-10 pl-9 rounded-lg"
                            />
                          </div>
                          <div className="relative">
                            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                            <Input
                              type="time"
                              value={endTime}
                              onChange={(e) => setEndTime(e.target.value)}
                              className="h-10 pl-9 rounded-lg"
                            />
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={allDay} onCheckedChange={setAllDay} id="all-day" />
                      <Label
                        htmlFor="all-day"
                        className="text-sm text-(--text-muted) cursor-pointer"
                      >
                        {t('createMeeting.allDay')}
                      </Label>
                    </div>
                  </div>
                  {/* Location */}
                  <div>
                    <div className="flex items-center gap-2 text-(--text-muted) mb-1.5">
                      <MapPin className="w-4 h-4" />
                      <Label className="text-sm font-medium">{t('createMeeting.location')}</Label>
                    </div>
                    <Input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder={t('createMeeting.locationPlaceholder')}
                      className="h-10 rounded-xl"
                    />
                  </div>
                  {/* Description */}
                  <div>
                    <div className="flex items-center gap-2 text-(--text-muted) mb-1.5">
                      <AlignLeft className="w-4 h-4" />
                      <Label className="text-sm font-medium">
                        {t('createMeeting.description')}
                      </Label>
                    </div>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t('createMeeting.descriptionPlaceholder')}
                      className="min-h-[90px] resize-none rounded-xl"
                    />
                  </div>
                  {/* Category & Reminder */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-(--text-muted) mb-1.5">
                        <Tag className="w-4 h-4" />
                        <Label className="text-sm font-medium">{t('createMeeting.category')}</Label>
                      </div>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="h-10 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="meeting">
                            {t('createMeeting.categories.meeting')}
                          </SelectItem>
                          <SelectItem value="appointment">
                            {t('createMeeting.categories.appointment')}
                          </SelectItem>
                          <SelectItem value="conference">
                            {t('createMeeting.categories.conference')}
                          </SelectItem>
                          <SelectItem value="training">
                            {t('createMeeting.categories.training')}
                          </SelectItem>
                          <SelectItem value="other">
                            {t('createMeeting.categories.other')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-(--text-muted) mb-1.5">
                        <Bell className="w-4 h-4" />
                        <Label className="text-sm font-medium">{t('createMeeting.reminder')}</Label>
                      </div>
                      <Select value={reminder} onValueChange={setReminder}>
                        <SelectTrigger className="h-10 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('createMeeting.reminders.none')}</SelectItem>
                          <SelectItem value="5min">{t('createMeeting.reminders.5min')}</SelectItem>
                          <SelectItem value="15min">
                            {t('createMeeting.reminders.15min')}
                          </SelectItem>
                          <SelectItem value="30min">
                            {t('createMeeting.reminders.30min')}
                          </SelectItem>
                          <SelectItem value="1hour">
                            {t('createMeeting.reminders.1hour')}
                          </SelectItem>
                          <SelectItem value="1day">{t('createMeeting.reminders.1day')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: People */}
              {step === 'people' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-blue-500 mb-1">
                    <Users className="w-5 h-5" />
                    <span className="text-base font-semibold">{t('createMeeting.attendees')}</span>
                    {attendees.length > 0 && (
                      <span className="ml-auto text-xs bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full font-medium">
                        {attendees.length}
                      </span>
                    )}
                  </div>

                  {/* Search */}
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                    <Input
                      value={attendeeSearch}
                      onChange={(e) => {
                        setAttendeeSearch(e.target.value);
                        setShowPeoplePicker(true);
                      }}
                      onFocus={() => setShowPeoplePicker(true)}
                      placeholder={t('createMeeting.searchPeople')}
                      className="h-11 pl-10 rounded-xl text-sm"
                    />
                    {showPeoplePicker && (
                      <div className="absolute top-full left-0 right-0 mt-1 z-50 max-h-52 overflow-y-auto rounded-xl border border-(--border) bg-(--card) shadow-2xl">
                        {filteredUsers.length === 0 ? (
                          <p className="px-4 py-6 text-sm text-center text-(--text-muted)">
                            {t('createMeeting.noResults')}
                          </p>
                        ) : (
                          filteredUsers.map((u) => {
                            const hasConflict = getConflict(u._id);
                            return (
                              <button
                                key={u._id}
                                onClick={() => {
                                  setAttendees((p) => [...p, u]);
                                  setAttendeeSearch('');
                                  setShowPeoplePicker(false);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-500/5 transition-colors text-left border-b border-(--border) last:border-0"
                              >
                                <Avatar className="w-8 h-8 shrink-0">
                                  <AvatarFallback className="text-[10px] bg-gradient-to-br from-blue-500 to-indigo-500 text-white font-bold">
                                    {getInitials(u.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-(--text-primary) truncate">
                                    {u.name}
                                  </p>
                                  {u.position && (
                                    <p className="text-xs text-(--text-muted) truncate">
                                      {u.position}
                                    </p>
                                  )}
                                </div>
                                {hasConflict && (
                                  <span className="flex items-center gap-1 text-[10px] text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full shrink-0">
                                    <AlertTriangle className="w-3 h-3" />
                                    {t('createMeeting.conflict')}
                                  </span>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* Conflict warning */}
                  {attendees.some((a) => getConflict(a._id)) && (
                    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-400/30">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                      <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                        {t('createMeeting.conflict')}
                      </span>
                    </div>
                  )}

                  {/* Selected attendees */}
                  {attendees.length > 0 ? (
                    <div className="space-y-2">
                      {attendees.map((a) => {
                        const hasConflict = getConflict(a._id);
                        return (
                          <div
                            key={a._id}
                            className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${hasConflict ? 'border-amber-400/50 bg-amber-500/5' : 'border-(--border) bg-(--background-subtle)/50 hover:border-blue-300'}`}
                          >
                            <Avatar className="w-9 h-9 shrink-0">
                              <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-indigo-500 text-white font-bold">
                                {getInitials(a.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-(--text-primary) truncate">
                                {a.name}
                              </p>
                              <p className="text-xs text-(--text-muted) truncate">
                                {a.position ?? a.department ?? ''}
                              </p>
                            </div>
                            {hasConflict && (
                              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                            )}
                            <button
                              onClick={() => setAttendees((p) => p.filter((x) => x._id !== a._id))}
                              className="p-1.5 rounded-lg hover:bg-(--border) transition-colors"
                            >
                              <X className="w-4 h-4 text-(--text-muted)" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-(--text-muted)">
                      <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">{t('createMeeting.addAttendees')}</p>
                    </div>
                  )}

                  {/* Meeting rooms — reserved together with the event */}
                  <div className="pt-2 border-t border-(--border) space-y-3">
                    <div className="flex items-center gap-2 text-blue-500">
                      <DoorOpen className="w-5 h-5" />
                      <span className="text-base font-semibold">
                        {t('createMeeting.room.title')}
                      </span>
                      {selectedRoom && (
                        <span className="ml-auto inline-flex items-center gap-1 text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                          <CheckCircle className="w-3 h-3" />
                          {selectedRoom.name}
                        </span>
                      )}
                    </div>

                    {!roomWindowValid ? (
                      <p className="text-xs text-(--text-muted)">
                        {t('createMeeting.room.setTimeFirst')}
                      </p>
                    ) : (
                      <p className="text-xs text-(--text-muted)">
                        {t('createMeeting.room.slotHint', {
                          from: formatTime(roomStart!),
                          to: formatTime(roomEnd!),
                        })}
                      </p>
                    )}

                    {selectedRoomBlocked && selectedRoom && (
                      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-400/30">
                        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-red-600 dark:text-red-400">
                            {t('createMeeting.room.busyUntil', {
                              room: selectedRoom.name,
                              time: formatTime(
                                selectedRoomAvailability?.busyUntil ?? roomEnd ?? Date.now(),
                              ),
                            })}
                          </p>
                          {selectedRoomAvailability?.suggestion && (
                            <p className="text-xs text-(--text-muted) mt-0.5">
                              {t('createMeeting.room.nextFreeSlot', {
                                time: formatTime(selectedRoomAvailability.suggestion),
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {rooms === undefined ? (
                      <div className="space-y-2">
                        {[0, 1].map((i) => (
                          <div
                            key={i}
                            className="h-16 rounded-xl bg-(--background-subtle) animate-pulse"
                          />
                        ))}
                      </div>
                    ) : rooms.length === 0 ? (
                      <p className="text-xs text-(--text-muted)">
                        {t('createMeeting.room.noRooms')}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {rooms.map((room) => {
                          const availability = roomAvailability.get(room._id);
                          const fits = capacityFits(room.capacity, attendees.length);
                          const free = !roomWindowValid || availability?.available !== false;
                          const isSelected = room._id === roomId;
                          const roomLocation = formatRoomLocation(room, (key, options) =>
                            t(key, options),
                          );
                          return (
                            <button
                              key={room._id}
                              type="button"
                              onClick={() => handlePickRoom(room)}
                              aria-pressed={isSelected}
                              className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
                                isSelected
                                  ? 'border-blue-500 bg-blue-500/5'
                                  : free && fits
                                    ? 'border-(--border) bg-(--background-subtle)/50 hover:border-blue-300'
                                    : 'border-(--border) bg-(--background-subtle)/30 opacity-80 hover:border-red-300'
                              }`}
                            >
                              <span
                                className="w-1 self-stretch rounded-full shrink-0"
                                style={{ background: room.color ?? DEFAULT_ROOM_COLOR }}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-(--text-primary) truncate">
                                    {room.name}
                                  </p>
                                  <span className="text-[10px] text-(--text-muted) shrink-0 inline-flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    {room.capacity}
                                  </span>
                                </div>
                                {roomLocation && (
                                  <p className="text-xs text-(--text-muted) truncate mt-0.5">
                                    {roomLocation}
                                  </p>
                                )}
                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                  {!fits ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                                      <AlertTriangle className="w-3 h-3" />
                                      {t('createMeeting.room.tooSmallShort', {
                                        people: headcount,
                                        max: room.capacity,
                                      })}
                                    </span>
                                  ) : free ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                      <CheckCircle className="w-3 h-3" />
                                      {t('createMeeting.room.free')}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                                      <Clock className="w-3 h-3" />
                                      {t('createMeeting.room.busyUntilShort', {
                                        time: formatTime(
                                          availability?.busyUntil ?? roomEnd ?? Date.now(),
                                        ),
                                      })}
                                    </span>
                                  )}
                                  {room.amenities.slice(0, 4).map((amenity) => (
                                    <span
                                      key={amenity}
                                      title={t(`rooms.amenity.${amenity}`)}
                                      className="text-(--text-muted)"
                                    >
                                      <AmenityIcon amenity={amenity} className="w-3.5 h-3.5" />
                                    </span>
                                  ))}
                                </div>
                              </div>
                              {isSelected && (
                                <CheckCircle className="w-5 h-5 text-blue-500 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                        {roomId && (
                          <button
                            type="button"
                            onClick={() => {
                              const previous = selectedRoom?.name;
                              setRoomId(null);
                              if (previous && location === previous) setLocation('');
                            }}
                            className="w-full text-xs text-(--text-muted) hover:text-(--text-primary) py-2 rounded-lg hover:bg-(--background-subtle) transition-colors"
                          >
                            {t('createMeeting.room.clear')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: Extras */}
              {step === 'extras' && (
                <div className="space-y-5">
                  {/* Teams Meeting */}
                  <div className="flex items-center justify-between p-5 rounded-xl border border-(--border) bg-gradient-to-r from-purple-500/5 to-indigo-500/5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
                        <Video className="w-5 h-5 text-purple-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-(--text-primary)">
                          {t('createMeeting.teamsMeeting')}
                        </p>
                        <p className="text-xs text-(--text-muted)">
                          {t('createMeeting.teamsMeetingDesc')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-purple-500 bg-purple-500/10 px-2.5 py-1 rounded-full">
                        {t('createMeeting.comingSoon')}
                      </span>
                      <Switch disabled checked={false} />
                    </div>
                  </div>

                  {/* File Attachment */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-blue-500" />
                      <Label className="text-sm font-semibold text-(--text-primary)">
                        {t('createMeeting.attachment')}
                      </Label>
                      <span className="text-xs text-(--text-muted) ml-auto">
                        {t('createMeeting.maxFileSize')}
                      </span>
                    </div>
                    {attachment ? (
                      <div className="flex items-center gap-3 p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-500/5">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
                          <FileText className="w-5 h-5 text-blue-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-(--text-primary) truncate">
                            {attachment.name}
                          </p>
                          <p className="text-xs text-(--text-muted)">
                            {(attachment.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <button
                          onClick={() => setAttachment(null)}
                          className="p-2 rounded-lg hover:bg-(--border) transition-colors"
                        >
                          <X className="w-4 h-4 text-(--text-muted)" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex flex-col items-center justify-center gap-2 p-8 rounded-xl border-2 border-dashed border-(--border) hover:border-blue-400 hover:bg-blue-500/5 transition-all cursor-pointer group"
                      >
                        <div className="w-12 h-12 rounded-full bg-(--background-subtle) group-hover:bg-blue-500/10 flex items-center justify-center transition-colors">
                          <Paperclip className="w-5 h-5 text-(--text-muted) group-hover:text-blue-500 transition-colors" />
                        </div>
                        <span className="text-sm font-medium text-(--text-muted) group-hover:text-blue-500 transition-colors">
                          {t('createMeeting.attachFile')}
                        </span>
                        <span className="text-xs text-(--text-muted)">
                          {t('createMeeting.maxFileSize')}
                        </span>
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleFileChange}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg"
                    />
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="shrink-0 bg-(--card) border-t border-(--border) px-6 py-4 flex items-center justify-between gap-3">
          {stepIndex > 0 ? (
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={uploading}
              className="rounded-xl"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              {t('createMeeting.back')}
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={handleCancel}
              className="rounded-xl text-(--text-muted)"
            >
              {t('createMeeting.cancel')}
            </Button>
          )}
          <Button
            onClick={nextStep}
            disabled={!canNext || uploading}
            className="rounded-xl btn-gradient text-white font-medium shadow-md hover:shadow-lg px-6"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('createMeeting.uploading')}
              </>
            ) : stepIndex === STEPS.length - 1 ? (
              t('createMeeting.save')
            ) : (
              <>
                {t('createMeeting.next')}
                <ChevronRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Decodes the `ROOM_BUSY|start|end|title` marker thrown by the backend when a
 * reservation lost a race, so the toast can name the time the room frees up.
 */
function parseRoomBusyError(
  message: string,
): { startTime: number; endTime: number; title: string } | null {
  const marker = message.indexOf('ROOM_BUSY|');
  if (marker === -1) return null;
  const [, start, end, ...rest] = message.slice(marker).split('|');
  const startTime = Number(start);
  const endTime = Number(end);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
  return { startTime, endTime, title: rest.join('|').trim() };
}

const REMINDER_OFFSETS: Record<string, number> = {
  '5min': 5 * 60 * 1000,
  '15min': 15 * 60 * 1000,
  '30min': 30 * 60 * 1000,
  '1hour': 60 * 60 * 1000,
  '1day': 24 * 60 * 60 * 1000,
};

function scheduleReminder(
  title: string,
  date: string,
  time: string,
  reminder: string,
  t: (key: string, opts?: Record<string, string>) => string,
) {
  const offset = REMINDER_OFFSETS[reminder];
  if (!offset) return;

  const eventTime = new Date(`${date}T${time}`).getTime();
  const fireAt = eventTime - offset;
  const delay = fireAt - Date.now();

  if (delay <= 0) return; // Already passed

  setTimeout(() => {
    // Play sound
    playNotificationSound('new_request');
    // Show rich toast
    toast(t('createMeeting.reminderFired', { title }), {
      icon: '🔔',
      duration: 8000,
      style: {
        background: 'var(--card)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
      },
    });
    // Browser notification
    sendBrowserNotification(t('createMeeting.reminderFired', { title }), {
      body: `${date} ${time}`,
      soundType: 'new_request',
    });
  }, delay);
}
