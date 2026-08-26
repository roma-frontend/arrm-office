'use client';

import React, { useState, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
} from '@/components/ui/sheet';
import { WizardStepper } from '@/components/ui/wizard-stepper';
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
  Sparkles,
  Copy,
  ExternalLink,
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

function currentEventTimes(now = new Date()): { start: string; end: string } {
  const end = new Date(now);
  end.setMinutes(end.getMinutes() + 60);

  return {
    start: format(now, 'HH:mm'),
    end: end.getDate() === now.getDate() ? format(end, 'HH:mm') : '23:59',
  };
}

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
  /** LiveKit video conference link (`/meetings/{roomName}`), when enabled. */
  videoUrl?: string;
  videoProvider?: 'livekit' | 'teams' | 'zoom' | 'meet';
  /** The viewer's own RSVP answer, filled by the backend. */
  myResponse?: EventRsvpResponse;
  /** Answers aligned with the roster order — a name pairs with its dot by index. */
  responses?: EventRsvpResponse[];
  /** Answer summary for the organizer, filled by the backend. */
  responseCounts?: {
    total: number;
    accepted: number;
    tentative: number;
    declined: number;
    needsAction: number;
  };
}

export type EventRsvpResponse = 'needs_action' | 'accepted' | 'tentative' | 'declined';

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
  const ensureRoomAction = useAction(api.meetingsActions.ensureRoom);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Whether LiveKit env vars exist — the toggle can stay usable while video is
  // not configured, but the form must say so instead of failing silently.
  const livekitConfigured = useQuery(api.meetings.livekitConfigured, {}) ?? false;
  // The webinar/meeting mode lives on the `meetings` row, not the event, so it
  // takes a separate fetch to restore the picker state on edit.
  const editMeeting = useQuery(
    api.meetings.getByEvent,
    open && editEvent?.id ? { eventId: editEvent.id as Id<'calendarEvents'> } : 'skip',
  ) as
    | Partial<{
        mode: 'meeting' | 'webinar';
        waitingRoomEnabled: boolean;
        registrationEnabled: boolean;
        registrationFields: Array<{ name: 'fullName' | 'email' | 'phone'; required: boolean }>;
      }>
    | null
    | undefined;
  // `open` deliberately refreshes the timestamp for each new modal session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const defaultEventTimes = useMemo(() => currentEventTimes(), [open]);

  const [step, setStep] = useState<Step>('details');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState(() => currentEventTimes().start);
  const [endTime, setEndTime] = useState(() => currentEventTimes().end);
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
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [videoMode, setVideoMode] = useState<'meeting' | 'webinar'>('meeting');
  const [waitingRoomEnabled, setWaitingRoomEnabled] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [registrationFields, setRegistrationFields] = useState<
    Array<{ name: 'fullName' | 'email' | 'phone'; required: boolean }>
  >([
    { name: 'fullName', required: true },
    { name: 'email', required: true },
  ]);

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

  // --- Smart Time Finder ----------------------------------------------------
  // "Free for all three: 15:30–16:00". Scans the chosen day in 30-minute
  // steps, skipping slots that collide with any attendee's approved leave or
  // with the picked room's bookings, and offers the next few that work.
  const freeSlots = useMemo(() => {
    if (allDay || !date) return [];
    const dayStart = toInstant(date, '08:00');
    const dayEnd = toInstant(date, '20:00');
    if (dayStart === null || dayEnd === null) return [];
    const wanted = Math.max(
      30,
      Math.round(((toInstant(date, endTime) ?? 0) - (toInstant(date, startTime) ?? 0)) / 60000),
    );
    const slots: { start: string; end: string }[] = [];
    const stepMs = 30 * 60000;
    for (let t = dayStart; t + wanted * 60000 <= dayEnd; t += stepMs) {
      const s = t;
      const e = t + wanted * 60000;
      const anyAttendeeOnLeave = attendees.some((a) =>
        leaves.some(
          (l) =>
            l.userId === a._id &&
            l.status === 'approved' &&
            l.startDate <= date &&
            l.endDate >= date,
        ),
      );
      const roomBlocked =
        roomId !== null &&
        (() => {
          const av = roomAvailability.get(roomId);
          if (!av) return false;
          return av.conflicts.some((c) => c.startTime < e && c.endTime > s);
        })();
      if (!anyAttendeeOnLeave && !roomBlocked) {
        slots.push({ start: formatTime(s), end: formatTime(e) });
        if (slots.length === 3) break;
      }
    }
    return slots;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, allDay, startTime, endTime, attendees, roomId, leaves]);

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
      // The toggle reflects what the event actually has: a link or the provider
      // marker (the link may briefly be absent between save and room creation).
      setVideoEnabled(Boolean(editEvent.videoUrl || editEvent.videoProvider === 'livekit'));
      setVideoMode('meeting');
    } else {
      if (selectedDate) setDate(format(selectedDate, 'yyyy-MM-dd'));
      setStartTime(defaultEventTimes.start);
      setEndTime(defaultEventTimes.end);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId, defaultEventTimes]);

  // Editing: the picker needs the users themselves, not just names. Without
  // this the picker opens empty and a re-save would wipe the guest list —
  // `attendeeIds` (not `attendees`) is what survives a round-trip. Resolves
  // against the org roster once it loads; a restored draft takes precedence.
  const hydratedAttendeesRef = useRef<string | null>(null);
  React.useEffect(() => {
    if (!open || !editEvent?.attendeeIds?.length || !orgUsers) return;
    if (restoredDraftRef.current || hydratedAttendeesRef.current === editEvent.id) return;
    hydratedAttendeesRef.current = editEvent.id;
    const ids = new Set(editEvent.attendeeIds);
    setAttendees(orgUsers.filter((u) => ids.has(u._id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId, orgUsers]);

  // The saved webinar/meeting mode arrives asynchronously (separate table) —
  // apply it once per edit, after the base hydration above set the default.
  const restoredModeRef = useRef<string | null>(null);
  React.useEffect(() => {
    if (!open || !editEvent || !editMeeting || restoredModeRef.current === editEvent.id) return;
    restoredModeRef.current = editEvent.id;
    setVideoMode(editMeeting.mode ?? 'meeting');
    setWaitingRoomEnabled(Boolean(editMeeting.waitingRoomEnabled));
    setRegistrationEnabled(Boolean(editMeeting.registrationEnabled));
    if (Array.isArray(editMeeting.registrationFields) && editMeeting.registrationFields.length) {
      setRegistrationFields(editMeeting.registrationFields as typeof registrationFields);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId, editMeeting]);

  const resetForm = () => {
    setStep('details');
    setTitle('');
    setDate('');
    const nextTimes = currentEventTimes();
    setStartTime(nextTimes.start);
    setEndTime(nextTimes.end);
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
    setVideoEnabled(false);
    setVideoMode('meeting');
    setWaitingRoomEnabled(false);
    setRegistrationEnabled(false);
    setRegistrationFields([
      { name: 'fullName', required: true },
      { name: 'email', required: true },
    ]);
    setUploading(false);
    hydratedAttendeesRef.current = null;
    restoredModeRef.current = null;
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
      videoEnabled,
      videoMode,
      waitingRoomEnabled,
      registrationEnabled,
      registrationFields,
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
      videoEnabled,
      videoMode,
      waitingRoomEnabled,
      registrationEnabled,
      registrationFields,
    ],
  );

  // «Нетронутая форма» — пустое состояние (или данные редактируемого события),
  // чтобы плашка не появлялась на формах без правок.
  const pristineForm = useMemo(
    () => ({
      title: editEvent?.title ?? '',
      date: editEvent?.date ?? (selectedDate ? format(selectedDate, 'yyyy-MM-dd') : ''),
      startTime: editEvent?.startTime ?? defaultEventTimes.start,
      endTime: editEvent?.endTime ?? defaultEventTimes.end,
      allDay: editEvent?.allDay ?? false,
      location: editEvent?.location ?? '',
      description: editEvent?.description ?? '',
      category: editEvent?.category ?? 'meeting',
      reminder: editEvent?.reminder ?? '15min',
      roomId: editEvent?.roomId ?? null,
      videoEnabled: Boolean(editEvent?.videoUrl || editEvent?.videoProvider === 'livekit'),
      videoMode: 'meeting' as const,
    }),
    [defaultEventTimes, editEvent, selectedDate],
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
    if (d.videoEnabled !== undefined) setVideoEnabled(d.videoEnabled);
    if (d.videoMode !== undefined) setVideoMode(d.videoMode);
    if (d.waitingRoomEnabled !== undefined) setWaitingRoomEnabled(d.waitingRoomEnabled);
    if (d.registrationEnabled !== undefined) setRegistrationEnabled(d.registrationEnabled);
    if (Array.isArray(d.registrationFields) && d.registrationFields.length) {
      setRegistrationFields(d.registrationFields as typeof registrationFields);
    }
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
    hydratedAttendeesRef.current = null;
    restoredModeRef.current = null;
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
    setVideoEnabled(pristineForm.videoEnabled);
    setVideoMode('meeting');
    // Участники — тоже часть «нетронутой» состояния при редактировании.
    if (editEvent?.attendeeIds?.length && orgUsers) {
      const ids = new Set(editEvent.attendeeIds);
      setAttendees(orgUsers.filter((u) => ids.has(u._id)));
    }
  };

  // The stored link is a relative path (`/meetings/…`); a shareable one needs
  // the origin so a colleague can open it straight from a chat message.
  const absoluteVideoUrl = editEvent?.videoUrl
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}${editEvent.videoUrl}`
    : '';

  const copyVideoLink = async () => {
    if (!absoluteVideoUrl) return;
    try {
      await navigator.clipboard.writeText(absoluteVideoUrl);
      toast.success(t('createMeeting.linkCopied'));
    } catch {
      toast.error(t('eventTimeline.actions.copyFailed'));
    }
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
        attachmentUrl,
        // The room is reserved by the same mutation, so an event never claims a
        // room it did not get.
        roomId: (roomId as Id<'meetingRooms'> | null) ?? undefined,
        roomStartTime: roomId && roomWindowValid ? roomStart! : undefined,
        roomEndTime: roomId && roomWindowValid ? roomEnd! : undefined,
        // NOTE: no `attendees` names here — Convex rejects args keys the
        // mutation does not declare, and the backend derives the names itself
        // from `attendeeIds` (resolveAttendees), so a client cannot record
        // somebody under a name that is not theirs.
        attendeeIds: attendees.map((a) => a._id),
        videoEnabled,
        videoMode,
      };

      // `eventId` for the room creation — the update targets the existing
      // event, the create gets its freshly minted id back.
      let savedEventId: Id<'calendarEvents'> | undefined = editEvent?.id as
        | Id<'calendarEvents'>
        | undefined;
      let savedVideoUrl: string | undefined = editEvent?.videoUrl;

      if (editEvent?.id && organizationId) {
        await updateEventMutation({ id: editEvent.id as Id<'calendarEvents'>, ...payload });
      } else if (organizationId) {
        const createdId = await createEventMutation({ organizationId, ...payload });
        savedEventId = createdId;
      }

      // Video: the mutation above saved the event (and cleared the link when
      // the toggle is off). When it is on, create/refresh the LiveKit room —
      // idempotent, so re-saving an event with video never forks the room.
      if (videoEnabled && organizationId && savedEventId) {
        try {
          const result = await ensureRoomAction({
            eventId: savedEventId,
            organizationId,
            mode: videoMode,
            waitingRoomEnabled,
            registrationEnabled,
            registrationFields,
          });
          if (result.configured && result.videoUrl) {
            savedVideoUrl = result.videoUrl;
            toast.success(t('createMeeting.videoCreated'));
          } else {
            // Easy to miss as a blink-and-gone toast — spell out the fix.
            toast.warning(t('createMeeting.videoNotConfigured'), {
              description: 'LIVEKIT_URL · LIVEKIT_API_KEY · LIVEKIT_API_SECRET',
              duration: 8000,
            });
          }
        } catch (err) {
          toast.error(
            `${t('createMeeting.videoFailed')} — ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
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
        attendeeIds: attendees.map((a) => a._id),
        attachmentUrl,
        roomId: roomId ?? undefined,
        roomName: selectedRoom?.name,
        roomColor: selectedRoom?.color,
        // A re-book happened server-side when the room or slot changed, so the
        // old booking id is only still true when the room stayed the same.
        roomBookingId:
          roomId && roomId === editEvent?.roomId ? editEvent?.roomBookingId : undefined,
        videoUrl: savedVideoUrl,
        videoProvider: savedVideoUrl ? 'livekit' : undefined,
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

  const stepperSteps = STEPS.map((s, i) => ({ id: s, title: stepLabels[i] ?? s }));

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')} className="p-0">
        {/* Header — title plus the step map. The connector between the pills is
            the progress bar, so the header costs one row instead of two. */}
        <SheetHeader className="gap-3.5">
          <SheetTitle>
            {editEvent ? t('createMeeting.editTitle') : t('createMeeting.title')}
          </SheetTitle>
          <WizardStepper
            steps={stepperSteps}
            current={stepIndex}
            maxReachable={canNext ? STEPS.length - 1 : stepIndex}
            onStepClick={(i) => setStep(STEPS[i] as Step)}
          />
        </SheetHeader>

        {/* Content */}
        <SheetBody className="px-5 py-5 sm:px-6">
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
                    <Label className="text-label mb-1.5 block text-(--text-primary)">
                      {t('createMeeting.titlePlaceholder')} *
                    </Label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t('createMeeting.titlePlaceholder')}
                      className="h-11 text-base"
                      autoFocus
                    />
                  </div>
                  {/* Date & Time */}
                  <div className="surface-inset space-y-3 rounded-card p-4">
                    <div className="flex items-center gap-2 text-(--text-secondary)">
                      <Calendar className="w-4 h-4 text-(--brand)" />
                      <span className="text-label font-semibold">{t('createMeeting.date')}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Input
                        type="date"
                        value={date}
                        min={editEvent ? undefined : format(new Date(), 'yyyy-MM-dd')}
                        onChange={(e) => setDate(e.target.value)}
                        className="h-10"
                      />
                      {!allDay && (
                        <>
                          <div className="relative">
                            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                            <Input
                              type="time"
                              value={startTime}
                              onChange={(e) => setStartTime(e.target.value)}
                              className="h-10 pl-9"
                            />
                          </div>
                          <div className="relative">
                            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                            <Input
                              type="time"
                              value={endTime}
                              onChange={(e) => setEndTime(e.target.value)}
                              className="h-10 pl-9"
                            />
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={allDay} onCheckedChange={setAllDay} id="all-day" />
                      <Label
                        htmlFor="all-day"
                        className="text-label cursor-pointer text-(--text-muted)"
                      >
                        {t('createMeeting.allDay')}
                      </Label>
                    </div>

                    {/* Smart Time Finder — next slots that fit everyone */}
                    {!allDay && date && freeSlots.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 rounded-card border border-(--brand-quiet) bg-(--brand-quiet)/40 px-3 py-2">
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-(--brand)" />
                        <span className="text-caption font-medium text-(--text-secondary)">
                          {t('createMeeting.freeForEveryone', 'Free for everyone')}
                        </span>
                        {freeSlots.map((slot) => (
                          <button
                            key={`${slot.start}-${slot.end}`}
                            type="button"
                            onClick={() => {
                              setStartTime(slot.start);
                              setEndTime(slot.end);
                            }}
                            className="rounded-control border border-(--border-subtle) bg-(--card) px-2 py-0.5 text-caption font-semibold text-(--brand-text) transition-colors duration-140 ease-spark hover:border-(--brand) hover:bg-(--brand-quiet)"
                          >
                            {slot.start}–{slot.end}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Location */}
                  <div>
                    <div className="flex items-center gap-2 text-(--text-muted) mb-1.5">
                      <MapPin className="w-4 h-4" />
                      <Label className="text-label">{t('createMeeting.location')}</Label>
                    </div>
                    <Input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder={t('createMeeting.locationPlaceholder')}
                      className="h-10"
                    />
                  </div>
                  {/* Description */}
                  <div>
                    <div className="flex items-center gap-2 text-(--text-muted) mb-1.5">
                      <AlignLeft className="w-4 h-4" />
                      <Label className="text-label">{t('createMeeting.description')}</Label>
                    </div>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t('createMeeting.descriptionPlaceholder')}
                      className="min-h-[90px] resize-none"
                    />
                  </div>
                  {/* Category & Reminder */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-(--text-muted) mb-1.5">
                        <Tag className="w-4 h-4" />
                        <Label className="text-label">{t('createMeeting.category')}</Label>
                      </div>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="h-10 rounded-field">
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
                        <Label className="text-label">{t('createMeeting.reminder')}</Label>
                      </div>
                      <Select value={reminder} onValueChange={setReminder}>
                        <SelectTrigger className="h-10 rounded-field">
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
                  <div className="mb-1 flex items-center gap-2">
                    <Users className="w-4.5 h-4.5 text-(--brand)" />
                    <span className="text-heading text-(--text-primary)">
                      {t('createMeeting.attendees')}
                    </span>
                    {attendees.length > 0 && (
                      <span className="num ml-auto rounded-pill bg-(--brand-quiet) px-2 py-0.5 text-[11px] font-semibold text-(--brand-text)">
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
                      className="h-10 pl-9"
                    />
                    {showPeoplePicker && (
                      <div className="absolute top-full left-0 right-0 mt-1.5 z-(--z-dropdown) max-h-56 overflow-y-auto rounded-panel border border-(--border-default) bg-(--surface-1) shadow-elev-3">
                        {filteredUsers.length === 0 ? (
                          <p className="px-4 py-6 text-center text-label text-(--text-muted)">
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
                                className="flex w-full items-center gap-3 border-b border-(--border-subtle) px-3 py-2.5 text-left transition-colors duration-140 ease-spark last:border-0 hover:bg-(--surface-2)"
                              >
                                <Avatar className="w-8 h-8 shrink-0">
                                  <AvatarFallback className="btn-gradient text-[10px] font-semibold">
                                    {getInitials(u.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-label text-(--text-primary)">
                                    {u.name}
                                  </p>
                                  {u.position && (
                                    <p className="truncate text-caption text-(--text-muted)">
                                      {u.position}
                                    </p>
                                  )}
                                </div>
                                {hasConflict && (
                                  <span className="flex shrink-0 items-center gap-1 rounded-pill bg-(--warning-quiet) px-2 py-1 text-[10px] font-medium text-(--warning-text)">
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
                    <div className="flex items-center gap-2.5 rounded-card border border-(--warning-outline) bg-(--warning-quiet) px-4 py-3">
                      <AlertTriangle className="w-4.5 h-4.5 shrink-0 text-(--warning-solid)" />
                      <span className="text-label font-medium text-(--warning-text)">
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
                            className={`flex items-center gap-3 rounded-card border p-2.5 transition-colors duration-140 ease-spark ${hasConflict ? 'border-(--warning-outline) bg-(--warning-quiet)' : 'border-(--border-subtle) bg-(--surface-2)'}`}
                          >
                            <Avatar className="w-9 h-9 shrink-0">
                              <AvatarFallback className="btn-gradient text-xs font-semibold">
                                {getInitials(a.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-label text-(--text-primary)">{a.name}</p>
                              <p className="truncate text-caption text-(--text-muted)">
                                {a.position ?? a.department ?? ''}
                              </p>
                            </div>
                            {hasConflict && (
                              <AlertTriangle className="w-4 h-4 shrink-0 text-(--warning-solid)" />
                            )}
                            <button
                              onClick={() => setAttendees((p) => p.filter((x) => x._id !== a._id))}
                              className="press-subtle rounded-control p-1.5 text-(--text-muted) transition-colors duration-140 ease-spark hover:bg-(--surface-3) hover:text-(--text-primary)"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-card border border-dashed border-(--border-default) py-8 text-center text-(--text-muted)">
                      <Users className="mx-auto mb-2 h-9 w-9 opacity-30" />
                      <p className="text-label">{t('createMeeting.addAttendees')}</p>
                    </div>
                  )}

                  {/* Meeting rooms — reserved together with the event */}
                  <div className="hairline space-y-3 pt-4">
                    <div className="flex items-center gap-2">
                      <DoorOpen className="w-4.5 h-4.5 text-(--brand)" />
                      <span className="text-heading text-(--text-primary)">
                        {t('createMeeting.room.title')}
                      </span>
                      {selectedRoom && (
                        <span className="ml-auto inline-flex items-center gap-1 rounded-pill bg-(--success-quiet) px-2 py-0.5 text-[11px] font-medium text-(--success-text)">
                          <CheckCircle className="w-3 h-3" />
                          {selectedRoom.name}
                        </span>
                      )}
                    </div>

                    {!roomWindowValid ? (
                      <p className="text-caption text-(--text-muted)">
                        {t('createMeeting.room.setTimeFirst')}
                      </p>
                    ) : (
                      <p className="text-caption text-(--text-muted)">
                        {t('createMeeting.room.slotHint', {
                          from: formatTime(roomStart!),
                          to: formatTime(roomEnd!),
                        })}
                      </p>
                    )}

                    {selectedRoomBlocked && selectedRoom && (
                      <div className="flex items-start gap-2.5 rounded-card border border-(--danger-outline) bg-(--danger-quiet) px-4 py-3">
                        <AlertTriangle className="w-4.5 h-4.5 shrink-0 text-(--danger-solid)" />
                        <div className="min-w-0">
                          <p className="text-label font-medium text-(--danger-text)">
                            {t('createMeeting.room.busyUntil', {
                              room: selectedRoom.name,
                              time: formatTime(
                                selectedRoomAvailability?.busyUntil ?? roomEnd ?? Date.now(),
                              ),
                            })}
                          </p>
                          {selectedRoomAvailability?.suggestion && (
                            <p className="mt-0.5 text-caption text-(--text-muted)">
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
                          <div key={i} className="skeleton h-16 rounded-card" />
                        ))}
                      </div>
                    ) : rooms.length === 0 ? (
                      <p className="text-caption text-(--text-muted)">
                        {t('createMeeting.room.noRooms')}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {rooms.map((room) => {
                          const availability = roomAvailability.get(room._id);
                          const fits = capacityFits(room.capacity, attendees.length);
                          const free = !roomWindowValid || availability?.available !== false;
                          const isSelected = room._id === roomId;
                          // The event's own reservation is excluded from the
                          // busy check (so it cannot clash with itself), which
                          // would otherwise read as "not booked" — mark it.
                          const bookedByThisEvent = Boolean(
                            isSelected &&
                            editEvent?.roomBookingId &&
                            room.bookings?.some((b) => b._id === editEvent.roomBookingId),
                          );
                          const roomLocation = formatRoomLocation(room, (key, options) =>
                            t(key, options),
                          );
                          return (
                            <button
                              key={room._id}
                              type="button"
                              onClick={() => handlePickRoom(room)}
                              aria-pressed={isSelected}
                              className={`flex w-full items-start gap-3 rounded-card border-2 p-3 text-left transition-all duration-140 ease-spark ${
                                isSelected
                                  ? 'border-(--brand) bg-blue-50 dark:bg-blue-950/30 shadow-md ring-1 ring-(--brand)/30'
                                  : free && fits
                                    ? 'border-(--border-subtle) bg-(--surface-2) hover:border-(--brand) hover:bg-blue-50/50 dark:hover:bg-blue-950/20'
                                    : 'border-(--border-subtle) bg-(--surface-2) opacity-70 hover:opacity-100'
                              }`}
                            >
                              <span
                                className="w-1 self-stretch rounded-pill shrink-0"
                                style={{ background: room.color ?? DEFAULT_ROOM_COLOR }}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-label font-semibold text-(--text-primary)">
                                    {room.name}
                                  </p>
                                  <span className="num inline-flex shrink-0 items-center gap-1 text-[10px] text-(--text-muted)">
                                    <Users className="w-3 h-3" />
                                    {room.capacity}
                                  </span>
                                </div>
                                {roomLocation && (
                                  <p className="mt-0.5 truncate text-caption text-(--text-muted)">
                                    {roomLocation}
                                  </p>
                                )}
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  {!fits ? (
                                    <span className="inline-flex items-center gap-1 rounded-pill bg-(--warning-quiet) px-2 py-0.5 text-[10px] font-medium text-(--warning-text)">
                                      <AlertTriangle className="w-3 h-3" />
                                      {t('createMeeting.room.tooSmallShort', {
                                        people: headcount,
                                        max: room.capacity,
                                      })}
                                    </span>
                                  ) : bookedByThisEvent ? (
                                    <span className="inline-flex items-center gap-1 rounded-pill bg-(--brand-quiet) px-2 py-0.5 text-[10px] font-medium text-(--brand-text)">
                                      <CheckCircle className="w-3 h-3" />
                                      {t('createMeeting.room.bookedByThisEvent')}
                                    </span>
                                  ) : free ? (
                                    <span className="inline-flex items-center gap-1 rounded-pill bg-(--success-quiet) px-2 py-0.5 text-[10px] font-medium text-(--success-text)">
                                      <CheckCircle className="w-3 h-3" />
                                      {t('createMeeting.room.free')}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-pill bg-(--danger-quiet) px-2 py-0.5 text-[10px] font-medium text-(--danger-text)">
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
                                <CheckCircle className="w-4.5 h-4.5 shrink-0 text-(--brand)" />
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
                            className="w-full rounded-control py-2 text-caption text-(--text-muted) transition-colors duration-140 ease-spark hover:bg-(--surface-2) hover:text-(--text-primary)"
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
                  {/* Video conference (LiveKit) */}
                  <div className="overflow-hidden rounded-card border border-(--border-subtle) bg-(--surface-2)">
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-card bg-(--brand-quiet)">
                          <Video className="w-4.5 h-4.5 text-(--brand)" />
                        </div>
                        <div>
                          <p className="text-label font-semibold text-(--text-primary)">
                            {t('createMeeting.videoConference')}
                          </p>
                          <p className="text-caption text-(--text-muted)">
                            {t('createMeeting.videoConferenceDesc')}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={videoEnabled}
                        onCheckedChange={(v) => setVideoEnabled(Boolean(v))}
                      />
                    </div>
                    {videoEnabled && (
                      <>
                        <div className="flex items-center gap-3 border-t border-(--border-subtle) px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-caption font-medium text-(--text-secondary)">
                              {t('createMeeting.videoModeLabel')}
                            </p>
                            <p className="text-caption text-(--text-muted)">
                              {t('createMeeting.videoModeDesc')}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1.5 rounded-pill bg-(--surface-1) p-1">
                            {(['meeting', 'webinar'] as const).map((mode) => (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => setVideoMode(mode)}
                                className={
                                  'rounded-pill px-3 py-1.5 text-caption font-medium transition-colors duration-140 ease-spark ' +
                                  (videoMode === mode
                                    ? 'bg-(--brand) text-white'
                                    : 'text-(--text-muted) hover:text-(--text-primary)')
                                }
                              >
                                {t('createMeeting.videoMode.' + mode)}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 border-t border-(--border-subtle) px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-caption font-medium text-(--text-secondary)">
                              {t('createMeeting.waitingRoomLabel')}
                            </p>
                            <p className="text-caption text-(--text-muted)">
                              {t('createMeeting.waitingRoomDesc')}
                            </p>
                          </div>
                          <Switch
                            checked={waitingRoomEnabled}
                            onCheckedChange={(v) => setWaitingRoomEnabled(Boolean(v))}
                          />
                        </div>
                        <div className="space-y-2.5 border-t border-(--border-subtle) px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-caption font-medium text-(--text-secondary)">
                                {t('createMeeting.registrationLabel')}
                              </p>
                              <p className="text-caption text-(--text-muted)">
                                {t('createMeeting.registrationDesc')}
                              </p>
                            </div>
                            <Switch
                              checked={registrationEnabled}
                              onCheckedChange={(v) => setRegistrationEnabled(Boolean(v))}
                            />
                          </div>
                          {registrationEnabled && (
                            <div className="grid gap-1.5 rounded-field border border-(--border-subtle) bg-(--surface-1) p-2.5">
                              {(
                                [
                                  { name: 'fullName', label: t('createMeeting.fieldFullName') },
                                  { name: 'email', label: t('createMeeting.fieldEmail') },
                                  { name: 'phone', label: t('createMeeting.fieldPhone') },
                                ] as const
                              ).map((f) => {
                                const entry = registrationFields.find((rf) => rf.name === f.name);
                                const shown = !!entry;
                                const required = entry?.required ?? f.name === 'fullName';
                                return (
                                  <label
                                    key={f.name}
                                    className="flex items-center gap-2 rounded-control px-1.5 py-1 text-caption text-(--text-secondary) hover:bg-(--surface-2)"
                                  >
                                    <input
                                      type="checkbox"
                                      className="size-3.5 accent-(--brand)"
                                      checked={shown}
                                      disabled={f.name === 'fullName'}
                                      onChange={() => {
                                        if (f.name === 'fullName') return;
                                        setRegistrationFields((prev) =>
                                          prev.some((rf) => rf.name === f.name)
                                            ? prev.filter((rf) => rf.name !== f.name)
                                            : [...prev, { name: f.name, required: true }],
                                        );
                                      }}
                                    />
                                    <span className="flex-1">{f.label}</span>
                                    <button
                                      type="button"
                                      disabled={!shown || f.name === 'fullName'}
                                      onClick={() => {
                                        if (f.name === 'fullName') return;
                                        setRegistrationFields((prev) =>
                                          prev.map((rf) =>
                                            rf.name === f.name
                                              ? { ...rf, required: !rf.required }
                                              : rf,
                                          ),
                                        );
                                      }}
                                      className={
                                        'rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition ' +
                                        (required
                                          ? 'bg-(--brand-quiet) text-(--brand-text)'
                                          : 'bg-(--surface-2) text-(--text-muted)') +
                                        (!shown || f.name === 'fullName'
                                          ? ' cursor-not-allowed opacity-50'
                                          : '')
                                      }
                                    >
                                      {required
                                        ? t('createMeeting.fieldRequired')
                                        : t('createMeeting.fieldOptional')}
                                    </button>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                    {!livekitConfigured && (
                      <div className="flex items-start gap-2.5 border-t border-(--warning-outline) bg-(--warning-quiet) px-4 py-3">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-(--warning-text)" />
                        <p className="text-caption text-(--warning-text)">
                          {t('createMeeting.videoNotConfiguredHint')}
                        </p>
                      </div>
                    )}
                    {livekitConfigured && videoEnabled && editEvent && !editEvent.videoUrl && (
                      <div className="flex items-start gap-2.5 border-t border-(--border-subtle) px-4 py-3">
                        <Sparkles className="w-4 h-4 shrink-0 text-(--brand)" />
                        <p className="text-caption text-(--text-secondary)">
                          {t('createMeeting.videoWillBeCreated')}
                        </p>
                      </div>
                    )}
                    {editEvent?.videoUrl && (
                      <div className="space-y-2 border-t border-(--border-subtle) px-4 py-3">
                        <p className="text-caption font-medium text-(--text-secondary)">
                          {t('createMeeting.videoLinkLabel')}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <code className="min-w-0 flex-1 truncate rounded-field border border-(--border-subtle) bg-(--surface-1) px-2.5 py-1.5 text-caption text-(--text-secondary)">
                            {absoluteVideoUrl}
                          </code>
                          <button
                            type="button"
                            onClick={copyVideoLink}
                            title={t('createMeeting.copyLink')}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-control border border-(--border-subtle) bg-(--card) px-2.5 py-1.5 text-caption font-medium text-(--text-secondary) transition-colors duration-140 ease-spark hover:border-(--brand) hover:text-(--brand-text)"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            {t('createMeeting.copyLink')}
                          </button>
                          <a
                            href={absoluteVideoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={t('createMeeting.openLink')}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-control border border-(--border-subtle) bg-(--card) px-2.5 py-1.5 text-caption font-medium text-(--text-secondary) transition-colors duration-140 ease-spark hover:border-(--brand) hover:text-(--brand-text)"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {t('createMeeting.openLink')}
                          </a>
                        </div>
                        <p className="text-caption text-(--text-muted)">
                          {t('createMeeting.videoLinkHint')}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* File Attachment */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-(--brand)" />
                      <Label className="text-label font-semibold text-(--text-primary)">
                        {t('createMeeting.attachment')}
                      </Label>
                      <span className="ml-auto text-caption text-(--text-muted)">
                        {t('createMeeting.maxFileSize')}
                      </span>
                    </div>
                    {attachment ? (
                      <div className="flex items-center gap-3 rounded-card border border-(--brand-outline) bg-(--brand-quiet) p-3.5">
                        <div className="flex size-10 items-center justify-center rounded-field bg-(--surface-1)">
                          <FileText className="w-4.5 h-4.5 text-(--brand)" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-label font-medium text-(--text-primary)">
                            {attachment.name}
                          </p>
                          <p className="num text-caption text-(--text-muted)">
                            {(attachment.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <button
                          onClick={() => setAttachment(null)}
                          className="press-subtle rounded-control p-2 text-(--text-muted) transition-colors duration-140 ease-spark hover:bg-(--surface-1) hover:text-(--text-primary)"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="group flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-(--border-default) p-8 transition-colors duration-140 ease-spark hover:border-(--brand) hover:bg-(--brand-quiet)"
                      >
                        <div className="flex size-12 items-center justify-center rounded-pill bg-(--surface-2) transition-colors duration-140 ease-spark group-hover:bg-(--surface-1)">
                          <Paperclip className="w-4.5 h-4.5 text-(--text-muted) transition-colors duration-140 ease-spark group-hover:text-(--brand)" />
                        </div>
                        <span className="text-label font-medium text-(--text-secondary) transition-colors duration-140 ease-spark group-hover:text-(--brand-text)">
                          {t('createMeeting.attachFile')}
                        </span>
                        <span className="text-caption text-(--text-muted)">
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
        </SheetBody>

        {/* Footer */}
        <SheetFooter className="justify-between px-5 sm:px-6">
          {stepIndex > 0 ? (
            <Button variant="outline" onClick={prevStep} disabled={uploading}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              {t('createMeeting.back')}
            </Button>
          ) : (
            <Button variant="ghost" onClick={handleCancel}>
              {t('createMeeting.cancel')}
            </Button>
          )}
          <Button
            onClick={nextStep}
            disabled={!canNext || uploading}
            className="btn-gradient px-6 font-medium"
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
        </SheetFooter>
      </SheetContent>
    </Sheet>
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
