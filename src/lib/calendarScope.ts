/**
 * Calendar scope — "my calendar" vs. the shared organization calendar.
 *
 * The calendar page aggregates four independent sources (leave requests,
 * driver bookings, custom events, Google Calendar). Switching the view has to
 * answer the same question for each of them — "does this entry belong to the
 * person looking at it?" — so the ownership rules live here as pure functions
 * and the UI only decides which scope is active.
 *
 * Ownership is resolved by id first and falls back to a name comparison,
 * because some enriched records only carry display names (legacy driver
 * bookings, event attendee lists are stored as names).
 */

export const CALENDAR_SCOPES = ['mine', 'team'] as const;
export type CalendarScope = (typeof CALENDAR_SCOPES)[number];

/** Persisted so the choice survives navigation and reloads. */
export const CALENDAR_SCOPE_STORAGE_KEY = 'strata:calendar-scope';

/** Roles that manage other people default to the shared view. */
const TEAM_FIRST_ROLES = new Set(['admin', 'supervisor', 'superadmin']);

export interface ScopeViewer {
  id: string;
  name?: string;
}

/** Minimal shapes — only the fields ownership depends on. */
export interface ScopedLeave {
  userId?: string;
  userName?: string;
}

export interface ScopedDriverEvent {
  /** Who booked the trip. */
  userId?: string;
  /** The user account behind the driver record. */
  driverUserId?: string;
  bookedByName?: string;
  driverName?: string;
}

export interface ScopedCustomEvent {
  createdBy?: string;
  attendees?: string[];
}

export interface ScopedRoomBooking {
  organizerId?: string;
  organizerName?: string;
  attendeeIds?: string[];
  attendeeNames?: string[];
}

function sameId(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a === b;
}

function sameName(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** A leave request belongs to the employee who requested it. */
export function isMyLeave(leave: ScopedLeave, viewer: ScopeViewer): boolean {
  return sameId(leave.userId, viewer.id) || sameName(leave.userName, viewer.name);
}

/**
 * A driver booking is personal both for the person who booked it and for the
 * driver who has to make the trip — both need it on their own calendar.
 */
export function isMyDriverEvent(event: ScopedDriverEvent, viewer: ScopeViewer): boolean {
  return (
    sameId(event.userId, viewer.id) ||
    sameId(event.driverUserId, viewer.id) ||
    sameName(event.bookedByName, viewer.name) ||
    sameName(event.driverName, viewer.name)
  );
}

/** A custom event is personal for its organizer and for every attendee. */
export function isMyCustomEvent(event: ScopedCustomEvent, viewer: ScopeViewer): boolean {
  if (sameId(event.createdBy, viewer.id)) return true;
  return (event.attendees ?? []).some((attendee) => sameName(attendee, viewer.name));
}

/**
 * Google Calendar entries come from the viewer's own connected account, so they
 * are personal by construction and stay visible in both scopes. Kept as an
 * explicit function so the rule is documented rather than implied by omission.
 */
export function isMyGoogleEvent(): boolean {
  return true;
}

/** A room booking is personal for its organizer and for every invited person. */
export function isMyRoomBooking(booking: ScopedRoomBooking, viewer: ScopeViewer): boolean {
  if (sameId(booking.organizerId, viewer.id)) return true;
  if (sameName(booking.organizerName, viewer.name)) return true;
  if ((booking.attendeeIds ?? []).some((id) => sameId(id, viewer.id))) return true;
  return (booking.attendeeNames ?? []).some((name) => sameName(name, viewer.name));
}

/** `team` shows everything; `mine` keeps only what the viewer owns. */
export function filterForScope<T>(
  items: T[],
  scope: CalendarScope,
  isMine: (item: T) => boolean,
): T[] {
  if (scope === 'team') return items;
  return items.filter(isMine);
}

export function isCalendarScope(value: unknown): value is CalendarScope {
  return typeof value === 'string' && (CALENDAR_SCOPES as readonly string[]).includes(value);
}

export function defaultScopeForRole(role?: string): CalendarScope {
  return role && TEAM_FIRST_ROLES.has(role) ? 'team' : 'mine';
}

/** Reads the persisted scope; returns `null` when absent or unusable. */
export function readStoredScope(): CalendarScope | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(CALENDAR_SCOPE_STORAGE_KEY);
    return isCalendarScope(stored) ? stored : null;
  } catch {
    // Private mode / blocked storage — fall back to the role default.
    return null;
  }
}

export function storeScope(scope: CalendarScope): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CALENDAR_SCOPE_STORAGE_KEY, scope);
  } catch {
    // Persistence is a convenience, never a requirement.
  }
}
