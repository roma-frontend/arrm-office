/**
 * Event timeline model.
 *
 * The calendar page mixes four unrelated kinds of entries — leave requests,
 * driver bookings, Google Calendar events and custom in-app events. Each has
 * its own shape, its own notion of "when" and its own lifecycle.
 *
 * This module normalizes all of them into a single `EventTimeline`: a start/end
 * window, a chronological list of milestones (created → reviewed → reminder →
 * start → now → end) and a flat list of facts the UI renders as detail cards.
 *
 * Everything here is pure — `now` is passed in rather than read from the clock,
 * and translation goes through the injected `t` — so the whole model is unit
 * testable and safe to call during render.
 */

import { getLocaleString } from './date-format';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type TimelineSource = 'leave' | 'driver' | 'google' | 'custom';

/** Where the event sits relative to `now`. */
export type TimelinePhase = 'upcoming' | 'live' | 'past';

/** Visual weight of a milestone / status, mapped to colors by the component. */
export type TimelineTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export type MilestoneIcon =
  | 'created'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'reminder'
  | 'start'
  | 'end'
  | 'now'
  | 'pickup'
  | 'dropoff'
  | 'arrived'
  | 'completed'
  | 'cancelled';

export type FactIcon =
  | 'user'
  | 'users'
  | 'location'
  | 'text'
  | 'tag'
  | 'bell'
  | 'clock'
  | 'calendar'
  | 'car'
  | 'route'
  | 'note'
  | 'link'
  | 'building'
  | 'star'
  | 'gauge';

export interface TimelineMilestone {
  id: string;
  /** Epoch ms, or `null` when the step has no date yet (e.g. awaiting review). */
  at: number | null;
  label: string;
  detail?: string;
  state: 'done' | 'current' | 'upcoming';
  tone: TimelineTone;
  icon: MilestoneIcon;
}

export interface TimelineFact {
  id: string;
  label: string;
  value: string;
  icon: FactIcon;
  /** Render across the full width (long free text: description, notes, route). */
  wide?: boolean;
  /** Turns the fact into a link. */
  href?: string;
}

export interface TimelinePerson {
  name: string;
  role?: string;
}

export interface EventTimeline {
  id: string;
  source: TimelineSource;
  title: string;
  subtitle: string;
  /** Localized source name, e.g. "Leave request". */
  sourceLabel: string;
  /** Hex accent color driving the whole modal palette. */
  accent: string;
  status: { label: string; tone: TimelineTone };
  /** Epoch ms. */
  start: number;
  /** Epoch ms. Always `>= start`. */
  end: number;
  allDay: boolean;
  phase: TimelinePhase;
  /** 0–100, how much of the event window has elapsed. */
  progress: number;
  durationMinutes: number;
  /** Localized duration, e.g. "2 h 30 min". */
  durationLabel: string;
  /** Localized countdown / elapsed line, e.g. "starts in 3 hours". */
  relativeLabel: string;
  milestones: TimelineMilestone[];
  facts: TimelineFact[];
  people: TimelinePerson[];
  /** External link (Google Calendar), when the source has one. */
  externalUrl?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Input shapes — structural subsets of what the calendar queries return
// ─────────────────────────────────────────────────────────────────────────────

export interface LeaveTimelineData {
  _id: string;
  userId: string;
  userName?: string;
  userDepartment?: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  status: string;
  comment?: string;
  createdAt?: number;
  reviewedAt?: number;
  reviewerName?: string;
  reviewComment?: string;
}

export interface DriverTimelineData {
  _id: string;
  driverId: string;
  driverName: string;
  driverVehicle?: {
    model: string;
    plateNumber: string;
    capacity: number;
    color?: string;
    year?: number;
  };
  bookedByName?: string;
  startTime: number;
  endTime: number;
  type: 'trip' | 'blocked' | 'maintenance' | string;
  status: string;
  tripInfo?: {
    from: string;
    to: string;
    purpose: string;
    passengerCount: number;
    notes?: string;
    distanceKm?: number;
    durationMinutes?: number;
    passengerPhone?: string;
  };
  reason?: string;
  createdAt?: number;
  arrivedAt?: number;
  passengerPickedUpAt?: number;
  waitTimeMinutes?: number;
  driverNotes?: string;
  mapData?: { distanceMeters: number; durationSeconds: number };
  driverFeedback?: { rating: number; comment?: string; completedAt: number };
}

export interface GoogleTimelineData {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string;
  htmlLink: string;
}

export interface CustomTimelineData {
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
  attendees: string[];
  attachmentUrl?: string;
  createdAt?: number;
}

export type TimelineInput =
  | { source: 'leave'; data: LeaveTimelineData }
  | { source: 'driver'; data: DriverTimelineData }
  | { source: 'google'; data: GoogleTimelineData }
  | { source: 'custom'; data: CustomTimelineData };

/** Minimal `t` contract — matches i18next's signature without importing it. */
export type TimelineT = (key: string, options?: Record<string, unknown>) => string;

export interface BuildTimelineOptions {
  now: number;
  lang: string;
  t: TimelineT;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const LEAVE_ACCENTS: Record<string, string> = {
  paid: '#2563eb',
  unpaid: '#f59e0b',
  sick: '#ef4444',
  family: '#10b981',
  doctor: '#06b6d4',
  day_off: '#8b5cf6',
  maternity: '#ec4899',
  paternity: '#14b8a6',
  study: '#6366f1',
};

const FALLBACK_ACCENT = '#6b7280';

export const TIMELINE_SOURCE_ACCENTS: Record<TimelineSource, string> = {
  leave: '#2563eb',
  driver: '#f97316',
  google: '#8b5cf6',
  custom: '#3b82f6',
};

/** Reminder id → offset before the start, in ms. Mirrors CreateEventModal. */
const REMINDER_OFFSETS: Record<string, number> = {
  '5min': 5 * 60 * 1000,
  '15min': 15 * 60 * 1000,
  '30min': 30 * 60 * 1000,
  '1hour': 60 * 60 * 1000,
  '1day': 24 * 60 * 60 * 1000,
};

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse `yyyy-MM-dd` (+ optional `HH:mm`) as **local** time.
 *
 * `new Date('2026-08-03')` is parsed as UTC midnight by spec, which shifts the
 * day backwards for negative offsets — a calendar cannot afford that.
 *
 * An unusable *date* returns `null`, but an unusable *time* only falls back to
 * local midnight. Callers resolve `null` to "now", which would move the entry to
 * an unrelated day; keeping the day and losing the clock is the smaller error.
 */
export function parseLocalDate(dateStr: string, timeStr = '00:00'): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!dateMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);

  const timeMatch = /^(\d{1,2}):(\d{2})/.exec((timeStr ?? '').trim());
  const rawHours = timeMatch ? Number(timeMatch[1]) : 0;
  const rawMinutes = timeMatch ? Number(timeMatch[2]) : 0;
  const timeIsValid = rawHours <= 23 && rawMinutes <= 59;
  const hours = timeIsValid ? rawHours : 0;
  const minutes = timeIsValid ? rawMinutes : 0;

  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  // `new Date(2026, 1, 31)` silently rolls over into March; round-tripping the
  // components is the only way to reject a day that does not exist.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    Number.isNaN(date.getTime())
  ) {
    return null;
  }
  return date.getTime();
}

function endOfLocalDay(dateStr: string): number | null {
  const start = parseLocalDate(dateStr);
  if (start === null) return null;
  return start + MS_PER_DAY - 1;
}

function parseIso(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Human duration, composed from short unit labels so no plural rules are
 * needed — "2 d 4 h", "45 min".
 */
export function formatTimelineDuration(minutes: number, t: TimelineT): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 1) return `< 1 ${t('eventTimeline.units.minute')}`;

  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${t('eventTimeline.units.day')}`);
  if (hours > 0) parts.push(`${hours} ${t('eventTimeline.units.hour')}`);
  // Minutes are noise next to a multi-day span.
  if (mins > 0 && days === 0) parts.push(`${mins} ${t('eventTimeline.units.minute')}`);

  return parts.length > 0 ? parts.join(' ') : `< 1 ${t('eventTimeline.units.minute')}`;
}

/**
 * Locale-aware relative time ("in 3 hours", "2 days ago") for an arbitrary
 * `now`, so the caller controls the clock.
 */
export function formatTimelineRelative(target: number, now: number, lang: string): string {
  const locale = getLocaleString(lang);
  let rtf: Intl.RelativeTimeFormat;
  try {
    rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  } catch {
    rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
  }

  const diffSec = Math.round((target - now) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 2592000) return rtf.format(Math.round(diffSec / 86400), 'day');
  if (abs < 31536000) return rtf.format(Math.round(diffSec / 2592000), 'month');
  return rtf.format(Math.round(diffSec / 31536000), 'year');
}

// ─────────────────────────────────────────────────────────────────────────────
// Milestone helpers
// ─────────────────────────────────────────────────────────────────────────────

function milestoneState(at: number | null, now: number): 'done' | 'current' | 'upcoming' {
  if (at === null) return 'current';
  return at <= now ? 'done' : 'upcoming';
}

interface MilestoneDraft {
  id: string;
  at: number | null;
  label: string;
  detail?: string;
  tone?: TimelineTone;
  icon: MilestoneIcon;
}

function toMilestones(drafts: MilestoneDraft[], now: number): TimelineMilestone[] {
  const milestones = drafts.map((draft) => ({
    id: draft.id,
    at: draft.at,
    label: draft.label,
    ...(draft.detail !== undefined ? { detail: draft.detail } : {}),
    state: milestoneState(draft.at, now),
    tone: draft.tone ?? 'neutral',
    icon: draft.icon,
  }));
  return sortMilestones(milestones);
}

/**
 * Order dated milestones chronologically, leaving dateless ones at their
 * position in the sequence.
 *
 * The per-source builders push steps in narrative order, which is usually also
 * chronological — but not always: a driver can arrive *before* the scheduled
 * pickup, and a booking can be reviewed after it was due to start. Rendering
 * those out of order down a vertical rail reads as a bug, so the timestamps win
 * over the narrative. Dateless steps ("awaiting review") have nothing to sort
 * by, so they stay where the builder put them.
 */
function sortMilestones(milestones: TimelineMilestone[]): TimelineMilestone[] {
  const dated = milestones
    .filter((m) => m.at !== null)
    .sort((a, b) => (a.at as number) - (b.at as number));
  if (dated.length === milestones.length) return dated;

  const queue = [...dated];
  return milestones.map((milestone) => (milestone.at === null ? milestone : queue.shift()!));
}

/**
 * Drop the "now" marker into its chronological slot.
 *
 * The marker only appears when `now` falls strictly inside the milestone span —
 * which is wider than the event window, since it also covers the lead-up steps.
 * That is deliberate: on an approved-but-not-yet-started leave the marker sits
 * between "approved" and "leave starts" and shows how much of the wait is left.
 * Pinned to either end it would read as noise, so it is omitted there.
 */
function withNowMarker(
  milestones: TimelineMilestone[],
  now: number,
  t: TimelineT,
): TimelineMilestone[] {
  const dated = milestones.map((m) => m.at).filter((at): at is number => at !== null);
  const first = dated[0];
  const last = dated[dated.length - 1];
  if (first === undefined || last === undefined || now <= first || now >= last) return milestones;

  const marker: TimelineMilestone = {
    id: 'now',
    at: now,
    label: t('eventTimeline.milestones.now'),
    state: 'current',
    tone: 'accent',
    icon: 'now',
  };

  const index = milestones.findIndex((m) => m.at !== null && m.at > now);
  if (index === -1) return [...milestones, marker];
  return [...milestones.slice(0, index), marker, ...milestones.slice(index)];
}

function pushFact(
  facts: TimelineFact[],
  fact: { id: string; label: string; value: string | undefined | null } & Omit<
    TimelineFact,
    'id' | 'label' | 'value'
  >,
): void {
  const value = typeof fact.value === 'string' ? fact.value.trim() : '';
  if (!value) return;
  const { value: _ignored, ...rest } = fact;
  facts.push({ ...rest, value });
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-source builders
// ─────────────────────────────────────────────────────────────────────────────

interface PartialTimeline {
  id: string;
  title: string;
  subtitle: string;
  accent: string;
  status: { label: string; tone: TimelineTone };
  start: number;
  end: number;
  allDay: boolean;
  milestones: TimelineMilestone[];
  facts: TimelineFact[];
  people: TimelinePerson[];
  externalUrl?: string;
}

function buildLeaveTimeline(
  leave: LeaveTimelineData,
  { now, t }: BuildTimelineOptions,
): PartialTimeline {
  const start = parseLocalDate(leave.startDate) ?? now;
  const end = endOfLocalDay(leave.endDate) ?? start;
  const accent = LEAVE_ACCENTS[leave.type] ?? FALLBACK_ACCENT;
  const typeLabel = t(`leaveTypes.${leave.type}`, { defaultValue: leave.type });

  const statusTone: TimelineTone =
    leave.status === 'approved' ? 'success' : leave.status === 'rejected' ? 'danger' : 'warning';
  const statusLabel =
    leave.status === 'approved'
      ? t('leave.approved')
      : leave.status === 'rejected'
        ? t('leave.rejected')
        : t('leave.pending');

  const drafts: MilestoneDraft[] = [];
  if (leave.createdAt) {
    drafts.push({
      id: 'submitted',
      at: leave.createdAt,
      label: t('eventTimeline.milestones.submitted'),
      detail: leave.userName ?? undefined,
      icon: 'created',
    });
  }

  if (leave.status === 'pending') {
    drafts.push({
      id: 'review',
      at: null,
      label: t('eventTimeline.milestones.awaitingReview'),
      tone: 'warning',
      icon: 'pending',
    });
  } else {
    drafts.push({
      id: 'review',
      at: leave.reviewedAt ?? null,
      label:
        leave.status === 'approved'
          ? t('eventTimeline.milestones.approved')
          : t('eventTimeline.milestones.rejected'),
      detail: leave.reviewerName ?? undefined,
      tone: leave.status === 'approved' ? 'success' : 'danger',
      icon: leave.status === 'approved' ? 'approved' : 'rejected',
    });
  }

  drafts.push(
    {
      id: 'start',
      at: start,
      label: t('eventTimeline.milestones.leaveStarts'),
      detail: typeLabel,
      tone: 'accent',
      icon: 'start',
    },
    {
      id: 'end',
      at: end,
      label: t('eventTimeline.milestones.leaveEnds'),
      tone: 'accent',
      icon: 'end',
    },
  );

  const facts: TimelineFact[] = [];
  pushFact(facts, {
    id: 'employee',
    label: t('eventTimeline.facts.employee'),
    value: leave.userName,
    icon: 'user',
  });
  pushFact(facts, {
    id: 'department',
    label: t('eventTimeline.facts.department'),
    value: leave.userDepartment,
    icon: 'building',
  });
  pushFact(facts, {
    id: 'type',
    label: t('eventTimeline.facts.leaveType'),
    value: typeLabel,
    icon: 'tag',
  });
  pushFact(facts, {
    id: 'days',
    label: t('eventTimeline.facts.workingDays'),
    value: `${leave.days} ${t('eventTimeline.units.day')}`,
    icon: 'calendar',
  });
  pushFact(facts, {
    id: 'reviewer',
    label: t('eventTimeline.facts.reviewedBy'),
    value: leave.reviewerName,
    icon: 'user',
  });
  pushFact(facts, {
    id: 'reason',
    label: t('eventTimeline.facts.reason'),
    value: leave.reason,
    icon: 'text',
    wide: true,
  });
  pushFact(facts, {
    id: 'comment',
    label: t('eventTimeline.facts.comment'),
    value: leave.comment,
    icon: 'note',
    wide: true,
  });
  pushFact(facts, {
    id: 'reviewComment',
    label: t('eventTimeline.facts.reviewComment'),
    value: leave.reviewComment,
    icon: 'note',
    wide: true,
  });

  const people: TimelinePerson[] = [];
  if (leave.userName) {
    people.push({ name: leave.userName, role: t('eventTimeline.roles.employee') });
  }
  if (leave.reviewerName) {
    people.push({ name: leave.reviewerName, role: t('eventTimeline.roles.reviewer') });
  }

  return {
    id: leave._id,
    title: leave.userName ?? t('calendar.unknown'),
    subtitle: typeLabel,
    accent,
    status: { label: statusLabel, tone: statusTone },
    start,
    end,
    allDay: true,
    milestones: toMilestones(drafts, now),
    facts,
    people,
  };
}

function buildDriverTimeline(
  trip: DriverTimelineData,
  { now, t }: BuildTimelineOptions,
): PartialTimeline {
  const start = trip.startTime;
  const end = Math.max(trip.endTime, trip.startTime);

  const statusTone: TimelineTone =
    trip.status === 'completed'
      ? 'success'
      : trip.status === 'cancelled'
        ? 'danger'
        : trip.status === 'in_progress'
          ? 'accent'
          : 'warning';
  const statusLabel = t(`eventTimeline.driverStatus.${trip.status}`, { defaultValue: trip.status });
  const typeLabel = t(`eventTimeline.driverType.${trip.type}`, { defaultValue: trip.type });

  const drafts: MilestoneDraft[] = [];
  if (trip.createdAt) {
    drafts.push({
      id: 'booked',
      at: trip.createdAt,
      label: t('eventTimeline.milestones.booked'),
      detail: trip.bookedByName ?? undefined,
      icon: 'created',
    });
  }
  drafts.push({
    id: 'start',
    at: start,
    label: trip.tripInfo
      ? t('eventTimeline.milestones.pickup')
      : t('eventTimeline.milestones.blockStarts'),
    detail: trip.tripInfo?.from,
    tone: 'accent',
    icon: trip.tripInfo ? 'pickup' : 'start',
  });
  if (trip.arrivedAt) {
    drafts.push({
      id: 'arrived',
      at: trip.arrivedAt,
      label: t('eventTimeline.milestones.driverArrived'),
      tone: 'success',
      icon: 'arrived',
    });
  }
  if (trip.passengerPickedUpAt) {
    drafts.push({
      id: 'pickedUp',
      at: trip.passengerPickedUpAt,
      label: t('eventTimeline.milestones.passengerOnBoard'),
      tone: 'success',
      icon: 'pickup',
    });
  }
  drafts.push({
    id: 'end',
    at: end,
    label: trip.tripInfo
      ? t('eventTimeline.milestones.dropoff')
      : t('eventTimeline.milestones.blockEnds'),
    detail: trip.tripInfo?.to,
    tone: 'accent',
    icon: trip.tripInfo ? 'dropoff' : 'end',
  });
  if (trip.driverFeedback) {
    drafts.push({
      id: 'completed',
      at: trip.driverFeedback.completedAt,
      label: t('eventTimeline.milestones.tripClosed'),
      detail: `★ ${trip.driverFeedback.rating}`,
      tone: 'success',
      icon: 'completed',
    });
  }

  const facts: TimelineFact[] = [];
  pushFact(facts, {
    id: 'driver',
    label: t('eventTimeline.facts.driver'),
    value: trip.driverName,
    icon: 'user',
  });
  pushFact(facts, {
    id: 'bookedBy',
    label: t('eventTimeline.facts.bookedBy'),
    value: trip.bookedByName,
    icon: 'user',
  });
  pushFact(facts, {
    id: 'type',
    label: t('eventTimeline.facts.bookingType'),
    value: typeLabel,
    icon: 'tag',
  });
  if (trip.tripInfo) {
    pushFact(facts, {
      id: 'route',
      label: t('eventTimeline.facts.route'),
      value: `${trip.tripInfo.from} → ${trip.tripInfo.to}`,
      icon: 'route',
      wide: true,
    });
    pushFact(facts, {
      id: 'purpose',
      label: t('eventTimeline.facts.purpose'),
      value: trip.tripInfo.purpose,
      icon: 'text',
      wide: true,
    });
    pushFact(facts, {
      id: 'passengers',
      label: t('eventTimeline.facts.passengers'),
      value: String(trip.tripInfo.passengerCount || ''),
      icon: 'users',
    });
    pushFact(facts, {
      id: 'passengerPhone',
      label: t('eventTimeline.facts.passengerPhone'),
      value: trip.tripInfo.passengerPhone,
      icon: 'user',
    });
    pushFact(facts, {
      id: 'notes',
      label: t('eventTimeline.facts.notes'),
      value: trip.tripInfo.notes,
      icon: 'note',
      wide: true,
    });
  }
  if (trip.driverVehicle) {
    pushFact(facts, {
      id: 'vehicle',
      label: t('eventTimeline.facts.vehicle'),
      value: [trip.driverVehicle.model, trip.driverVehicle.year]
        .filter((part) => part !== undefined && part !== '')
        .join(' · '),
      icon: 'car',
    });
    pushFact(facts, {
      id: 'plate',
      label: t('eventTimeline.facts.plateNumber'),
      value: trip.driverVehicle.plateNumber,
      icon: 'tag',
    });
    pushFact(facts, {
      id: 'capacity',
      label: t('eventTimeline.facts.capacity'),
      value: trip.driverVehicle.capacity ? String(trip.driverVehicle.capacity) : '',
      icon: 'users',
    });
  }
  const distanceKm =
    trip.mapData?.distanceMeters !== undefined
      ? trip.mapData.distanceMeters / 1000
      : trip.tripInfo?.distanceKm;
  if (distanceKm !== undefined && distanceKm > 0) {
    pushFact(facts, {
      id: 'distance',
      label: t('eventTimeline.facts.distance'),
      value: `${distanceKm.toFixed(1)} ${t('eventTimeline.units.km')}`,
      icon: 'gauge',
    });
  }
  if (trip.waitTimeMinutes) {
    pushFact(facts, {
      id: 'waitTime',
      label: t('eventTimeline.facts.waitTime'),
      value: formatTimelineDuration(trip.waitTimeMinutes, t),
      icon: 'clock',
    });
  }
  pushFact(facts, {
    id: 'driverNotes',
    label: t('eventTimeline.facts.driverNotes'),
    value: trip.driverNotes,
    icon: 'note',
    wide: true,
  });
  pushFact(facts, {
    id: 'reason',
    label: t('eventTimeline.facts.reason'),
    value: trip.reason,
    icon: 'text',
    wide: true,
  });
  if (trip.driverFeedback) {
    pushFact(facts, {
      id: 'rating',
      label: t('eventTimeline.facts.rating'),
      value: `${trip.driverFeedback.rating} / 5`,
      icon: 'star',
    });
    pushFact(facts, {
      id: 'feedback',
      label: t('eventTimeline.facts.feedback'),
      value: trip.driverFeedback.comment,
      icon: 'note',
      wide: true,
    });
  }

  const people: TimelinePerson[] = [
    { name: trip.driverName, role: t('eventTimeline.roles.driver') },
  ];
  if (trip.bookedByName) {
    people.push({ name: trip.bookedByName, role: t('eventTimeline.roles.bookedBy') });
  }

  return {
    id: trip._id,
    title: trip.tripInfo ? `${trip.tripInfo.from} → ${trip.tripInfo.to}` : typeLabel,
    subtitle: trip.driverName,
    accent: TIMELINE_SOURCE_ACCENTS.driver,
    status: { label: statusLabel, tone: statusTone },
    start,
    end,
    allDay: false,
    milestones: toMilestones(drafts, now),
    facts,
    people,
  };
}

function buildGoogleTimeline(
  event: GoogleTimelineData,
  { now, t }: BuildTimelineOptions,
): PartialTimeline {
  const start = parseIso(event.startTime) ?? parseLocalDate(event.startDate) ?? now;
  // Google reports all-day ends as exclusive (the following midnight).
  const rawEnd = parseIso(event.endTime) ?? (event.endDate ? parseLocalDate(event.endDate) : null);
  const end = event.allDay && rawEnd !== null ? rawEnd - 1 : (rawEnd ?? start);

  const drafts: MilestoneDraft[] = [
    {
      id: 'start',
      at: start,
      label: t('eventTimeline.milestones.eventStarts'),
      detail: event.location || undefined,
      tone: 'accent',
      icon: 'start',
    },
    {
      id: 'end',
      at: Math.max(end, start),
      label: t('eventTimeline.milestones.eventEnds'),
      tone: 'accent',
      icon: 'end',
    },
  ];

  const facts: TimelineFact[] = [];
  pushFact(facts, {
    id: 'calendar',
    label: t('eventTimeline.facts.calendar'),
    value: t('calendar.googleCalendar'),
    icon: 'calendar',
  });
  pushFact(facts, {
    id: 'location',
    label: t('eventTimeline.facts.location'),
    value: event.location,
    icon: 'location',
  });
  pushFact(facts, {
    id: 'description',
    label: t('eventTimeline.facts.description'),
    value: event.description,
    icon: 'text',
    wide: true,
  });

  return {
    id: event.id,
    title: event.title,
    subtitle: t('calendar.googleCalendar'),
    accent: TIMELINE_SOURCE_ACCENTS.google,
    status: {
      label: event.allDay ? t('calendar.allDay') : t('eventTimeline.status.confirmed'),
      tone: 'accent',
    },
    start,
    end: Math.max(end, start),
    allDay: event.allDay,
    milestones: toMilestones(drafts, now),
    facts,
    people: [],
    ...(event.htmlLink ? { externalUrl: event.htmlLink } : {}),
  };
}

function buildCustomTimeline(
  event: CustomTimelineData,
  { now, t }: BuildTimelineOptions,
): PartialTimeline {
  const start = parseLocalDate(event.date, event.allDay ? '00:00' : event.startTime) ?? now;
  const rawEnd = parseLocalDate(event.date, event.allDay ? '23:59' : event.endTime);
  // An end before the start means the event runs past midnight.
  const end = rawEnd === null ? start : rawEnd < start ? rawEnd + MS_PER_DAY : rawEnd;

  const categoryLabel = t(`createMeeting.categories.${event.category}`, {
    defaultValue: event.category,
  });
  const reminderLabel = t(`createMeeting.reminders.${event.reminder}`, {
    defaultValue: event.reminder,
  });

  const drafts: MilestoneDraft[] = [];
  if (event.createdAt) {
    drafts.push({
      id: 'created',
      at: event.createdAt,
      label: t('eventTimeline.milestones.created'),
      icon: 'created',
    });
  }
  const reminderOffset = REMINDER_OFFSETS[event.reminder];
  if (reminderOffset !== undefined) {
    drafts.push({
      id: 'reminder',
      at: start - reminderOffset,
      label: t('eventTimeline.milestones.reminder'),
      detail: reminderLabel,
      tone: 'warning',
      icon: 'reminder',
    });
  }
  drafts.push(
    {
      id: 'start',
      at: start,
      label: t('eventTimeline.milestones.eventStarts'),
      detail: event.location || undefined,
      tone: 'accent',
      icon: 'start',
    },
    {
      id: 'end',
      at: end,
      label: t('eventTimeline.milestones.eventEnds'),
      tone: 'accent',
      icon: 'end',
    },
  );

  const facts: TimelineFact[] = [];
  pushFact(facts, {
    id: 'category',
    label: t('eventTimeline.facts.category'),
    value: categoryLabel,
    icon: 'tag',
  });
  pushFact(facts, {
    id: 'location',
    label: t('eventTimeline.facts.location'),
    value: event.location,
    icon: 'location',
  });
  pushFact(facts, {
    id: 'reminder',
    label: t('eventTimeline.facts.reminder'),
    value: reminderLabel,
    icon: 'bell',
  });
  pushFact(facts, {
    id: 'attendeeCount',
    label: t('eventTimeline.facts.attendees'),
    value: event.attendees.length ? String(event.attendees.length) : '',
    icon: 'users',
  });
  pushFact(facts, {
    id: 'description',
    label: t('eventTimeline.facts.description'),
    value: event.description,
    icon: 'text',
    wide: true,
  });
  if (event.attachmentUrl) {
    facts.push({
      id: 'attachment',
      label: t('eventTimeline.facts.attachment'),
      value: t('eventTimeline.facts.openAttachment'),
      icon: 'link',
      href: event.attachmentUrl,
    });
  }

  return {
    id: event.id,
    title: event.title,
    subtitle: categoryLabel,
    accent: TIMELINE_SOURCE_ACCENTS.custom,
    status: {
      label: event.allDay ? t('createMeeting.allDay') : t('eventTimeline.status.scheduled'),
      tone: 'accent',
    },
    start,
    end,
    allDay: event.allDay,
    milestones: toMilestones(drafts, now),
    facts,
    people: event.attendees.map((name) => ({ name, role: t('eventTimeline.roles.attendee') })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

/** Normalize any calendar entry into the timeline model the modal renders. */
export function buildEventTimeline(
  input: TimelineInput,
  options: BuildTimelineOptions,
): EventTimeline {
  const { now, lang, t } = options;

  const partial =
    input.source === 'leave'
      ? buildLeaveTimeline(input.data, options)
      : input.source === 'driver'
        ? buildDriverTimeline(input.data, options)
        : input.source === 'google'
          ? buildGoogleTimeline(input.data, options)
          : buildCustomTimeline(input.data, options);

  const end = Math.max(partial.end, partial.start);
  const phase: TimelinePhase = now < partial.start ? 'upcoming' : now > end ? 'past' : 'live';
  const span = end - partial.start;
  const progress =
    phase === 'past'
      ? 100
      : phase === 'upcoming'
        ? 0
        : span <= 0
          ? 100
          : ((now - partial.start) / span) * 100;

  const durationMinutes = Math.max(0, Math.round(span / MS_PER_MINUTE));
  const relativeAnchor = phase === 'upcoming' ? partial.start : end;
  const relativeValue = formatTimelineRelative(relativeAnchor, now, lang);
  const relativeLabel =
    phase === 'upcoming'
      ? t('eventTimeline.relative.starts', { value: relativeValue })
      : phase === 'live'
        ? t('eventTimeline.relative.endsIn', { value: relativeValue })
        : t('eventTimeline.relative.ended', { value: relativeValue });

  return {
    ...partial,
    source: input.source,
    sourceLabel: t(`eventTimeline.sources.${input.source}`),
    end,
    phase,
    progress: Math.min(100, Math.max(0, Math.round(progress))),
    durationMinutes,
    durationLabel: formatTimelineDuration(durationMinutes, t),
    relativeLabel,
    milestones: withNowMarker(partial.milestones, now, t),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Export helpers
// ─────────────────────────────────────────────────────────────────────────────

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function toIcsUtc(ms: number): string {
  return `${new Date(ms).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

function toIcsDate(ms: number): string {
  const d = new Date(ms);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}${month}${day}`;
}

/**
 * Single-event iCalendar payload, so any timeline can be pushed into the user's
 * own calendar app. All-day events use `VALUE=DATE` with an exclusive end, per
 * RFC 5545; timed events are emitted in UTC.
 */
export function buildTimelineIcs(timeline: EventTimeline, now: number): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Office//Event Timeline//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${timeline.source}-${timeline.id}@office`,
    `DTSTAMP:${toIcsUtc(now)}`,
  ];

  if (timeline.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${toIcsDate(timeline.start)}`);
    lines.push(`DTEND;VALUE=DATE:${toIcsDate(timeline.end + 1)}`);
  } else {
    lines.push(`DTSTART:${toIcsUtc(timeline.start)}`);
    lines.push(`DTEND:${toIcsUtc(timeline.end)}`);
  }

  lines.push(`SUMMARY:${escapeIcsText(timeline.title)}`);

  const description = timeline.facts.map((fact) => `${fact.label}: ${fact.value}`).join('\n');
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);

  const location = timeline.facts.find((fact) => fact.icon === 'location')?.value;
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
  if (timeline.externalUrl) lines.push(`URL:${timeline.externalUrl}`);

  lines.push('STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

/** Plain-text digest of the whole timeline, for the "copy details" action. */
export function buildTimelineSummary(
  timeline: EventTimeline,
  formatDateTime: (ms: number) => string,
): string {
  const lines: string[] = [
    timeline.title,
    `${timeline.sourceLabel} · ${timeline.status.label}`,
    `${formatDateTime(timeline.start)} — ${formatDateTime(timeline.end)} (${timeline.durationLabel})`,
    '',
  ];

  for (const milestone of timeline.milestones) {
    const when = milestone.at === null ? '—' : formatDateTime(milestone.at);
    lines.push(`• ${when} — ${milestone.label}${milestone.detail ? ` (${milestone.detail})` : ''}`);
  }

  if (timeline.facts.length > 0) {
    lines.push('');
    for (const fact of timeline.facts) {
      lines.push(`${fact.label}: ${fact.value}`);
    }
  }

  return lines.join('\n');
}
