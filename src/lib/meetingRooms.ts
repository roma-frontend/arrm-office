/**
 * Meeting-room domain logic — pure, framework-free and unit-tested.
 *
 * The live "free / busy" indicator is derived here from a list of bookings and
 * a timestamp, which keeps the ticking UI dumb: it re-runs `resolveRoomStatus`
 * every few seconds instead of subscribing to a server-computed status that
 * would go stale between fetches.
 *
 * All times are epoch milliseconds and every interval is half-open
 * `[start, end)`, so a meeting may start exactly when another ends.
 */

/** Equipment keys — kept in sync with `ALLOWED_AMENITIES` in convex/meetingRooms.ts. */
export const AMENITY_KEYS = [
  'projector',
  'tv',
  'whiteboard',
  'videoConference',
  'conferencePhone',
  'airConditioning',
  'naturalLight',
  'coffee',
  'water',
  'accessible',
  'standingDesk',
  'soundproof',
] as const;

export type AmenityKey = (typeof AMENITY_KEYS)[number];

/** Accent colours offered when creating a room. */
export const ROOM_COLORS = [
  '#0ea5e9',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f97316',
  '#f59e0b',
  '#10b981',
  '#14b8a6',
] as const;

export const DEFAULT_ROOM_COLOR = ROOM_COLORS[0];

/** A meeting is "ending soon" in its last 10 minutes. */
export const ENDING_SOON_MS = 10 * 60 * 1000;
/** A room is "starting soon" when the next meeting is within 15 minutes. */
export const STARTING_SOON_MS = 15 * 60 * 1000;
/** Gaps shorter than this are treated as back-to-back, not as free time. */
const CONTIGUOUS_GAP_MS = 60 * 1000;

export type RoomStatus = 'free' | 'startingSoon' | 'occupied' | 'endingSoon' | 'archived';

export interface RoomBookingLite {
  _id: string;
  title: string;
  startTime: number;
  endTime: number;
  organizerId?: string;
  organizerName?: string;
  attendeeCount?: number;
  checkedInAt?: number;
  /** Present on full booking documents; cancelled entries never count. */
  status?: string;
}

export interface RoomStatusInfo {
  status: RoomStatus;
  /** The meeting happening right now, if any. */
  current: RoomBookingLite | null;
  /** The next meeting after `now`, if any. */
  next: RoomBookingLite | null;
  /**
   * When the room becomes free. Follows back-to-back meetings, so a room booked
   * 10:00–11:00 and 11:00–12:00 reports 12:00, not 11:00.
   */
  busyUntil: number | null;
  /** When the room stops being free (start of the next meeting). */
  freeUntil: number | null;
  /** Whole minutes until `busyUntil` / `freeUntil`, rounded up. */
  minutesLeft: number | null;
  minutesUntilNext: number | null;
}

function isConfirmed(booking: RoomBookingLite): boolean {
  return booking.status === undefined || booking.status === 'confirmed';
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Bookings that clash with `[start, end)`, sorted by start time. */
export function findConflicts(
  bookings: RoomBookingLite[],
  start: number,
  end: number,
  excludeId?: string,
): RoomBookingLite[] {
  return bookings
    .filter(
      (b) => isConfirmed(b) && b._id !== excludeId && overlaps(b.startTime, b.endTime, start, end),
    )
    .sort((a, b) => a.startTime - b.startTime);
}

export function isRoomFreeFor(
  bookings: RoomBookingLite[],
  start: number,
  end: number,
  excludeId?: string,
): boolean {
  return findConflicts(bookings, start, end, excludeId).length === 0;
}

/** Live status of a room derived from its bookings at `now`. */
export function resolveRoomStatus(
  bookings: RoomBookingLite[],
  now: number,
  options?: { isActive?: boolean },
): RoomStatusInfo {
  if (options?.isActive === false) {
    return {
      status: 'archived',
      current: null,
      next: null,
      busyUntil: null,
      freeUntil: null,
      minutesLeft: null,
      minutesUntilNext: null,
    };
  }

  const confirmed = bookings.filter(isConfirmed).sort((a, b) => a.startTime - b.startTime);
  const current = confirmed.find((b) => b.startTime <= now && now < b.endTime) ?? null;
  const next = confirmed.find((b) => b.startTime > now) ?? null;

  if (current) {
    // Walk the chain of back-to-back meetings to find the real free-again time.
    let busyUntil = current.endTime;
    for (const booking of confirmed) {
      if (booking.startTime - busyUntil <= CONTIGUOUS_GAP_MS && booking.endTime > busyUntil) {
        busyUntil = booking.endTime;
      }
    }
    const remaining = busyUntil - now;
    return {
      status: current.endTime - now <= ENDING_SOON_MS ? 'endingSoon' : 'occupied',
      current,
      next: confirmed.find((b) => b.startTime >= busyUntil) ?? null,
      busyUntil,
      freeUntil: null,
      minutesLeft: Math.max(0, Math.ceil(remaining / 60000)),
      minutesUntilNext: null,
    };
  }

  if (next && next.startTime - now <= STARTING_SOON_MS) {
    return {
      status: 'startingSoon',
      current: null,
      next,
      busyUntil: null,
      freeUntil: next.startTime,
      minutesLeft: null,
      minutesUntilNext: Math.max(0, Math.ceil((next.startTime - now) / 60000)),
    };
  }

  return {
    status: 'free',
    current: null,
    next,
    busyUntil: null,
    freeUntil: next ? next.startTime : null,
    minutesLeft: null,
    minutesUntilNext: next ? Math.max(0, Math.ceil((next.startTime - now) / 60000)) : null,
  };
}

/** Split a minute count into hours + minutes for readable, translatable output. */
export function splitMinutes(total: number): { hours: number; minutes: number } {
  const safe = Math.max(0, Math.round(total));
  return { hours: Math.floor(safe / 60), minutes: safe % 60 };
}

/**
 * First moment at or after `desiredStart` where the room is free for
 * `durationMs`. Candidate starts are the desired time itself plus the end of
 * every booking that blocks it — the earliest opening is always one of those.
 * Returns `null` when nothing fits inside `searchWindowMs`.
 */
export function suggestNextFreeSlot(
  bookings: RoomBookingLite[],
  desiredStart: number,
  durationMs: number,
  searchWindowMs: number = 24 * 60 * 60 * 1000,
  excludeId?: string,
): number | null {
  if (durationMs <= 0) return null;
  const limit = desiredStart + searchWindowMs;
  const candidates = [
    desiredStart,
    ...bookings
      .filter((b) => isConfirmed(b) && b._id !== excludeId && b.endTime > desiredStart)
      .map((b) => b.endTime),
  ]
    .filter((start) => start <= limit)
    .sort((a, b) => a - b);

  for (const start of candidates) {
    if (isRoomFreeFor(bookings, start, start + durationMs, excludeId)) return start;
  }
  return null;
}

/** Does the headcount (organizer + guests) fit the room? */
export function capacityFits(capacity: number, attendeeCount: number): boolean {
  return attendeeCount + 1 <= capacity;
}

/**
 * Human-readable room location, e.g. "Kamar Business Center · fl. 7 · no. 34".
 *
 * Bare numbers joined by dots ("Kamar Business Center · 7 · 34") are unreadable,
 * so floor and door number are labelled. The translator is injected to keep this
 * function pure and testable.
 */
export function formatRoomLocation(
  parts: { building?: string; floor?: string; roomNumber?: string },
  translate: (key: string, options: Record<string, unknown>) => string,
): string {
  const segments: string[] = [];
  const building = parts.building?.trim();
  const floor = parts.floor?.trim();
  const roomNumber = parts.roomNumber?.trim();
  if (building) segments.push(building);
  if (floor) segments.push(translate('rooms.locationParts.floor', { value: floor }));
  if (roomNumber) segments.push(translate('rooms.locationParts.room', { value: roomNumber }));
  return segments.join(' · ');
}

export interface RoomStatusAccent {
  /** Tailwind-ready colour classes for text and background. */
  text: string;
  bg: string;
  border: string;
  /** Raw colour for dots and glows. */
  dot: string;
  /** Whether the indicator should pulse (live, attention-worthy states). */
  pulse: boolean;
}

/** Single source of truth for status colours across the board and the calendar. */
export const ROOM_STATUS_ACCENTS: Record<RoomStatus, RoomStatusAccent> = {
  free: {
    text: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    dot: '#10b981',
    pulse: true,
  },
  startingSoon: {
    text: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    dot: '#f59e0b',
    pulse: true,
  },
  occupied: {
    text: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    dot: '#ef4444',
    pulse: true,
  },
  endingSoon: {
    text: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    dot: '#f97316',
    pulse: true,
  },
  archived: {
    text: 'text-(--text-muted)',
    bg: 'bg-(--background-subtle)',
    border: 'border-(--border)',
    dot: '#9ca3af',
    pulse: false,
  },
};

/** Percentage of the working day already booked — used by the board summary. */
export function utilizationPercent(
  bookings: RoomBookingLite[],
  dayStart: number,
  dayEnd: number,
): number {
  const span = dayEnd - dayStart;
  if (span <= 0) return 0;
  const booked = bookings.filter(isConfirmed).reduce((total, b) => {
    const start = Math.max(b.startTime, dayStart);
    const end = Math.min(b.endTime, dayEnd);
    return total + Math.max(0, end - start);
  }, 0);
  return Math.min(100, Math.round((booked / span) * 100));
}
