/**
 * Meeting rooms — admin-managed rooms plus member bookings.
 *
 * Design notes:
 *  - All times are epoch milliseconds. Overlap is `aStart < bEnd && bStart < aEnd`
 *    (end is exclusive), which lets a meeting start exactly when another ends.
 *  - The live "free / busy" indicator is computed on the client from the
 *    bookings returned here, so the UI can tick every few seconds without
 *    hammering the backend. The server only guarantees the data and the
 *    conflict-free invariant.
 *  - Room CRUD requires an organization admin; booking is open to any active
 *    member of the same organization.
 */

import { v } from 'convex/values';
import {
  mutation,
  query,
  internalMutation,
  type QueryCtx,
  type MutationCtx,
} from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getAuthCaller, type AuthenticatedCaller } from './lib/getAuthCaller';
import { isSuperadmin } from './lib/auth';
import { MAX_PAGE_SIZE } from './pagination';
import { notify } from './lib/notify';
import { assertModuleAccess, assertQuota, incrementUsage } from './lib/entitlements';

/** Equipment keys — kept in sync with `AMENITY_KEYS` in src/lib/meetingRooms.ts. */
const ALLOWED_AMENITIES = [
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

const MIN_DURATION_MS = 5 * 60 * 1000;
const MAX_DURATION_MS = 12 * 60 * 60 * 1000;
/** Bookings further out than this are almost always a date-picker mistake. */
const MAX_ADVANCE_MS = 365 * 24 * 60 * 60 * 1000;
/** Tolerance for "not in the past" so a click at :59.9 still succeeds. */
const PAST_GRACE_MS = 60 * 1000;
const MAX_TITLE_LENGTH = 120;
const MAX_TEXT_LENGTH = 2000;

type Caller = AuthenticatedCaller;

function assertOrgAccess(caller: Caller, organizationId: Id<'organizations'>): void {
  if (isSuperadmin(caller)) return;
  if (caller.organizationId !== organizationId) {
    throw new Error('Access denied: different organization');
  }
}

function canManageRooms(caller: Caller): boolean {
  return isSuperadmin(caller) || caller.role === 'admin';
}

function assertCanManageRooms(caller: Caller): void {
  if (!canManageRooms(caller)) {
    throw new Error('Insufficient permissions: organization admin required');
  }
}

/** Two half-open intervals intersect. */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function trimmedOrThrow(value: string, field: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} is required`);
  if (trimmed.length > max) throw new Error(`${field} is too long (max ${max} characters)`);
  return trimmed;
}

function normalizeAmenities(amenities: string[]): string[] {
  const unknown = amenities.filter((a) => !(ALLOWED_AMENITIES as readonly string[]).includes(a));
  if (unknown.length) throw new Error(`Unknown amenities: ${unknown.join(', ')}`);
  return [...new Set(amenities)];
}

function validateRange(startTime: number, endTime: number, now: number): void {
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    throw new Error('Invalid booking time');
  }
  if (endTime <= startTime) throw new Error('End time must be after start time');
  const duration = endTime - startTime;
  if (duration < MIN_DURATION_MS) throw new Error('Booking is too short (minimum 5 minutes)');
  if (duration > MAX_DURATION_MS) throw new Error('Booking is too long (maximum 12 hours)');
  if (startTime < now - PAST_GRACE_MS) throw new Error('Cannot book a room in the past');
  if (startTime > now + MAX_ADVANCE_MS) throw new Error('Booking is too far in the future');
}

/** Resolve user names once per id, reused across a whole enrichment pass. */
async function makeNameResolver(ctx: QueryCtx | MutationCtx) {
  const cache = new Map<string, string>();
  return async (userId: Id<'users'> | undefined): Promise<string | undefined> => {
    if (!userId) return undefined;
    const cached = cache.get(userId);
    if (cached) return cached;
    const user = await ctx.db.get(userId);
    const name = user?.name ?? 'Unknown';
    cache.set(userId, name);
    return name;
  };
}

// ---------------------------------------------------------------------------
// Attendee tracking + activity log
// ---------------------------------------------------------------------------

type AttendeeResponse = Doc<'roomBookingAttendees'>['response'];
type BookingEventType = Doc<'roomBookingEvents'>['type'];

/**
 * Append one entry to a booking's activity log.
 *
 * Actor and target names are snapshotted here rather than joined at read time,
 * so the log still reads correctly after somebody leaves the organization.
 */
async function logBookingEvent(
  ctx: MutationCtx,
  booking: Pick<Doc<'roomBookings'>, 'organizationId' | 'roomId'> & { _id: Id<'roomBookings'> },
  type: BookingEventType,
  actor: Caller | null,
  extra: {
    targetUserId?: Id<'users'>;
    targetName?: string;
    response?: AttendeeResponse;
    previousStartTime?: number;
    previousEndTime?: number;
    newStartTime?: number;
    newEndTime?: number;
    note?: string;
  } = {},
): Promise<void> {
  await ctx.db.insert('roomBookingEvents', {
    organizationId: booking.organizationId,
    bookingId: booking._id,
    roomId: booking.roomId,
    type,
    actorId: actor?._id,
    actorName: actor?.name ?? 'System',
    actorRole: actor?.role,
    createdAt: Date.now(),
    ...extra,
  });
}

/** Live attendee rows of a booking (uninvited people are excluded). */
async function activeAttendeeRows(
  ctx: QueryCtx | MutationCtx,
  bookingId: Id<'roomBookings'>,
): Promise<Doc<'roomBookingAttendees'>[]> {
  const rows = await ctx.db
    .query('roomBookingAttendees')
    .withIndex('by_booking', (q) => q.eq('bookingId', bookingId))
    .take(MAX_PAGE_SIZE);
  return rows.filter((row) => !row.removedAt);
}

async function attendeeRow(
  ctx: QueryCtx | MutationCtx,
  bookingId: Id<'roomBookings'>,
  userId: Id<'users'>,
): Promise<Doc<'roomBookingAttendees'> | null> {
  return await ctx.db
    .query('roomBookingAttendees')
    .withIndex('by_booking_user', (q) => q.eq('bookingId', bookingId).eq('userId', userId))
    .unique();
}

/**
 * Bring the tracking rows in line with a roster.
 *
 * Re-inviting somebody who was removed revives their row instead of inserting a
 * duplicate, and their previous answer is cleared — a fresh invitation deserves
 * a fresh reply. Emits one `attendee_added` / `attendee_removed` entry each so
 * the log shows who changed the guest list and when.
 */
async function syncAttendeeRows(
  ctx: MutationCtx,
  booking: Doc<'roomBookings'>,
  attendeeIds: Id<'users'>[],
  actor: Caller,
  options: { logChanges: boolean },
): Promise<void> {
  const resolveName = await makeNameResolver(ctx);
  const wanted = new Set<string>(attendeeIds);
  const existing = await ctx.db
    .query('roomBookingAttendees')
    .withIndex('by_booking', (q) => q.eq('bookingId', booking._id))
    .take(MAX_PAGE_SIZE);
  const byUser = new Map(existing.map((row) => [row.userId as string, row]));
  const now = Date.now();

  for (const userId of wanted) {
    const row = byUser.get(userId);
    if (row && !row.removedAt) continue;

    if (row) {
      await ctx.db.patch(row._id, {
        response: 'needs_action',
        respondedAt: undefined,
        comment: undefined,
        removedAt: undefined,
        removedBy: undefined,
        invitedAt: now,
        invitedBy: actor._id,
      });
    } else {
      await ctx.db.insert('roomBookingAttendees', {
        organizationId: booking.organizationId,
        bookingId: booking._id,
        roomId: booking.roomId,
        userId: userId as Id<'users'>,
        response: 'needs_action',
        invitedAt: now,
        invitedBy: actor._id,
      });
    }

    if (options.logChanges) {
      await logBookingEvent(ctx, booking, 'attendee_added', actor, {
        targetUserId: userId as Id<'users'>,
        targetName: await resolveName(userId as Id<'users'>),
      });
    }
  }

  for (const row of existing) {
    if (row.removedAt || wanted.has(row.userId)) continue;
    await ctx.db.patch(row._id, { removedAt: now, removedBy: actor._id });
    if (options.logChanges) {
      await logBookingEvent(ctx, booking, 'attendee_removed', actor, {
        targetUserId: row.userId,
        targetName: await resolveName(row.userId),
      });
    }
  }
}

/**
 * A moved meeting invalidates the answers people gave for the old slot, so the
 * responses go back to "needs action" — the same thing Outlook does when the
 * organizer changes the time.
 */
async function resetResponsesAfterReschedule(
  ctx: MutationCtx,
  booking: Doc<'roomBookings'>,
  actor: Caller,
): Promise<number> {
  const rows = await activeAttendeeRows(ctx, booking._id);
  let reset = 0;
  for (const row of rows) {
    if (row.response === 'needs_action') continue;
    await ctx.db.patch(row._id, {
      response: 'needs_action',
      respondedAt: undefined,
      comment: undefined,
    });
    reset += 1;
  }
  if (reset > 0) {
    await logBookingEvent(ctx, booking, 'responses_reset', actor, {
      note: `${reset}`,
    });
  }
  return reset;
}

export interface EnrichedBooking extends Doc<'roomBookings'> {
  roomName: string;
  roomColor?: string;
  /** Location parts, kept separate so the client can label them per language. */
  roomBuilding?: string;
  roomFloor?: string;
  roomNumber?: string;
  organizerName?: string;
  attendeeNames: string[];
  /** RSVP roll-up, so a list can show "3 ✓ · 1 ✗" without a second round-trip. */
  tracking: ResponseCounts;
  /** Video conference join link if this booking is linked to a calendar event with video. */
  videoUrl?: string;
  /** Which video platform the link points to. */
  videoProvider?: 'livekit' | 'teams' | 'zoom' | 'meet';
  /** Status of the linked meeting (scheduled / live / ended). */
  meetingStatus?: 'scheduled' | 'live' | 'ended';
}

export interface ResponseCounts {
  /** Invited internal attendees, excluding the organizer. */
  total: number;
  accepted: number;
  tentative: number;
  declined: number;
  needsAction: number;
  /** Attendees who confirmed they were in the room. */
  checkedIn: number;
}

/**
 * Roll up the RSVP state of one booking.
 *
 * Bookings created before tracking existed have no attendee rows, so a missing
 * row counts as "needs action" rather than vanishing from the totals.
 */
async function countResponses(
  ctx: QueryCtx | MutationCtx,
  booking: Doc<'roomBookings'>,
): Promise<ResponseCounts> {
  const rows = await activeAttendeeRows(ctx, booking._id);
  const byUser = new Map(rows.map((row) => [row.userId as string, row]));
  const roster = booking.attendeeIds ?? [];
  const counts: ResponseCounts = {
    total: 0,
    accepted: 0,
    tentative: 0,
    declined: 0,
    needsAction: 0,
    checkedIn: 0,
  };

  const ids = new Set<string>([...roster, ...rows.map((row) => row.userId as string)]);
  for (const id of ids) {
    counts.total += 1;
    const row = byUser.get(id);
    const response: AttendeeResponse = row?.response ?? 'needs_action';
    if (response === 'accepted') counts.accepted += 1;
    else if (response === 'tentative') counts.tentative += 1;
    else if (response === 'declined') counts.declined += 1;
    else counts.needsAction += 1;
    if (row?.checkedInAt) counts.checkedIn += 1;
  }
  return counts;
}

async function enrichBookings(
  ctx: QueryCtx | MutationCtx,
  bookings: Doc<'roomBookings'>[],
): Promise<EnrichedBooking[]> {
  const resolveName = await makeNameResolver(ctx);
  const roomCache = new Map<string, Doc<'meetingRooms'> | null>();

  const enriched: EnrichedBooking[] = [];
  for (const booking of bookings) {
    if (!roomCache.has(booking.roomId)) {
      roomCache.set(booking.roomId, await ctx.db.get(booking.roomId));
    }
    const room = roomCache.get(booking.roomId) ?? null;
    const attendeeNames: string[] = [];
    for (const id of booking.attendeeIds ?? []) {
      const name = await resolveName(id);
      if (name) attendeeNames.push(name);
    }

    // Look up the linked calendar event for video conference info.
    const linkedEvent = await ctx.db
      .query('calendarEvents')
      .withIndex('by_room_booking', (q) => q.eq('roomBookingId', booking._id))
      .first();

    // Resolve the live meeting status if a video conference is linked.
    let meetingStatus: 'scheduled' | 'live' | 'ended' | undefined;
    if (linkedEvent?.videoUrl) {
      const meeting = await ctx.db
        .query('meetings')
        .withIndex('by_event', (q) => q.eq('eventId', linkedEvent._id))
        .unique();
      meetingStatus = meeting?.status;
    }

    enriched.push({
      ...booking,
      roomName: room?.name ?? 'Unknown room',
      roomColor: room?.color,
      roomBuilding: room?.building,
      roomFloor: room?.floor,
      roomNumber: room?.roomNumber,
      organizerName: await resolveName(booking.organizerId),
      attendeeNames: [...attendeeNames, ...(booking.externalAttendees ?? [])],
      tracking: await countResponses(ctx, booking),
      videoUrl: booking.videoUrl ?? linkedEvent?.videoUrl,
      videoProvider: (booking.videoProvider as EnrichedBooking['videoProvider']) ?? undefined,
      meetingStatus,
    });
  }
  return enriched;
}

/** Confirmed bookings of one room that intersect a range. */
async function bookingsInRange(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<'meetingRooms'>,
  startTime: number,
  endTime: number,
): Promise<Doc<'roomBookings'>[]> {
  // Indexed on startTime; a booking can start before the window, so we walk
  // back by the maximum allowed duration instead of scanning the whole room.
  const rows = await ctx.db
    .query('roomBookings')
    .withIndex('by_room_start', (q) =>
      q
        .eq('roomId', roomId)
        .gte('startTime', startTime - MAX_DURATION_MS)
        .lt('startTime', endTime),
    )
    .take(MAX_PAGE_SIZE * 5);
  return rows.filter(
    (b) => b.status === 'confirmed' && overlaps(b.startTime, b.endTime, startTime, endTime),
  );
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** All rooms of an organization. Archived rooms are opt-in. */
export const listRooms = query({
  args: {
    organizationId: v.id('organizations'),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    if (!isSuperadmin(caller) && caller.organizationId !== args.organizationId) return [];

    const rooms = args.includeArchived
      ? await ctx.db
          .query('meetingRooms')
          .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
          .take(MAX_PAGE_SIZE)
      : await ctx.db
          .query('meetingRooms')
          .withIndex('by_org_active', (q) =>
            q.eq('organizationId', args.organizationId).eq('isActive', true),
          )
          .take(MAX_PAGE_SIZE);

    return rooms.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Rooms plus the bookings needed to render their live status.
 *
 * `from`/`to` default to "now − 1h … now + 48h", which covers the current
 * meeting, the rest of the day and tomorrow morning — enough for the board to
 * answer "free now?", "free until when?" and "what's next?".
 */
export const getRoomsWithBookings = query({
  args: {
    organizationId: v.id('organizations'),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    if (!isSuperadmin(caller) && caller.organizationId !== args.organizationId) return [];

    const now = Date.now();
    const from = args.from ?? now - 60 * 60 * 1000;
    const to = args.to ?? now + 48 * 60 * 60 * 1000;

    const rooms = args.includeArchived
      ? await ctx.db
          .query('meetingRooms')
          .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
          .take(MAX_PAGE_SIZE)
      : await ctx.db
          .query('meetingRooms')
          .withIndex('by_org_active', (q) =>
            q.eq('organizationId', args.organizationId).eq('isActive', true),
          )
          .take(MAX_PAGE_SIZE);

    const resolveName = await makeNameResolver(ctx);

    const withBookings = await Promise.all(
      rooms.map(async (room) => {
        const raw = await bookingsInRange(ctx, room._id, from, to);
        const bookings = await Promise.all(
          raw
            .sort((a, b) => a.startTime - b.startTime)
            .map(async (b) => ({
              _id: b._id,
              title: b.title,
              startTime: b.startTime,
              endTime: b.endTime,
              organizerId: b.organizerId,
              organizerName: await resolveName(b.organizerId),
              attendeeCount: (b.attendeeIds?.length ?? 0) + (b.externalAttendees?.length ?? 0),
              checkedInAt: b.checkedInAt,
            })),
        );
        return { ...room, bookings };
      }),
    );

    return withBookings.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Confirmed bookings across the organization that intersect a range. */
export const listBookings = query({
  args: {
    organizationId: v.id('organizations'),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    if (!isSuperadmin(caller) && caller.organizationId !== args.organizationId) return [];

    const rows = await ctx.db
      .query('roomBookings')
      .withIndex('by_org_start', (q) =>
        q
          .eq('organizationId', args.organizationId)
          .gte('startTime', args.startTime - MAX_DURATION_MS)
          .lt('startTime', args.endTime),
      )
      .take(MAX_PAGE_SIZE * 5);

    const relevant = rows.filter(
      (b) =>
        b.status === 'confirmed' && overlaps(b.startTime, b.endTime, args.startTime, args.endTime),
    );
    const enriched = await enrichBookings(ctx, relevant);
    return enriched.sort((a, b) => a.startTime - b.startTime);
  },
});

/** Bookings of a single room in a range — powers the room timeline. */
export const getRoomBookings = query({
  args: {
    roomId: v.id('meetingRooms'),
    startTime: v.number(),
    endTime: v.number(),
    includeCancelled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    const room = await ctx.db.get(args.roomId);
    if (!room) return [];
    if (!isSuperadmin(caller) && caller.organizationId !== room.organizationId) return [];

    const rows = await ctx.db
      .query('roomBookings')
      .withIndex('by_room_start', (q) =>
        q
          .eq('roomId', args.roomId)
          .gte('startTime', args.startTime - MAX_DURATION_MS)
          .lt('startTime', args.endTime),
      )
      .take(MAX_PAGE_SIZE * 5);

    const relevant = rows.filter(
      (b) =>
        (args.includeCancelled || b.status === 'confirmed') &&
        overlaps(b.startTime, b.endTime, args.startTime, args.endTime),
    );
    const enriched = await enrichBookings(ctx, relevant);
    return enriched.sort((a, b) => a.startTime - b.startTime);
  },
});

/**
 * Is a slot free? Returns the blocking bookings so the UI can explain the
 * clash instead of just refusing.
 */
export const checkAvailability = query({
  args: {
    roomId: v.id('meetingRooms'),
    startTime: v.number(),
    endTime: v.number(),
    excludeBookingId: v.optional(v.id('roomBookings')),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return { available: false, conflicts: [] };
    const room = await ctx.db.get(args.roomId);
    if (!room) return { available: false, conflicts: [] };
    if (!isSuperadmin(caller) && caller.organizationId !== room.organizationId) {
      return { available: false, conflicts: [] };
    }
    if (args.endTime <= args.startTime) return { available: false, conflicts: [] };

    const resolveName = await makeNameResolver(ctx);
    const clashes = (await bookingsInRange(ctx, args.roomId, args.startTime, args.endTime)).filter(
      (b) => b._id !== args.excludeBookingId,
    );

    const conflicts = await Promise.all(
      clashes.map(async (b) => ({
        _id: b._id,
        title: b.title,
        startTime: b.startTime,
        endTime: b.endTime,
        organizerName: await resolveName(b.organizerId),
      })),
    );

    return { available: conflicts.length === 0, conflicts };
  },
});

/**
 * Everything known about one booking: the roster with each answer and its
 * timestamp, plus the append-only activity log.
 *
 * Who sees what:
 *  - roster and answers: any member of the organization who can see the room,
 *    the same visibility the booking list already has;
 *  - activity log: the organizer and organization staff (admin / supervisor).
 *    It records who moved a meeting, who uninvited whom and who cancelled, which
 *    is management information rather than something every participant needs.
 *
 * `viewer` tells the client which actions to render, so the UI never has to
 * re-derive the permission rules.
 */
export const getBookingTracking = query({
  args: { bookingId: v.id('roomBookings') },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return null;
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) return null;
    if (!isSuperadmin(caller) && caller.organizationId !== booking.organizationId) return null;

    const room = await ctx.db.get(booking.roomId);
    const organizer = await ctx.db.get(booking.organizerId);
    const rows = await activeAttendeeRows(ctx, booking._id);
    const byUser = new Map(rows.map((row) => [row.userId as string, row]));

    // Union of the roster and the tracking rows: bookings made before tracking
    // existed have no rows, and a row can outlive its roster entry for one
    // render while a guest list is being edited.
    const ids = new Set<string>([
      ...(booking.attendeeIds ?? []),
      ...rows.map((row) => row.userId as string),
    ]);

    const attendees = await Promise.all(
      [...ids].map(async (id) => {
        const user = await ctx.db.get(id as Id<'users'>);
        const row = byUser.get(id);
        return {
          userId: id as Id<'users'>,
          name: user?.name ?? 'Unknown',
          email: user?.email,
          avatarUrl: user?.avatarUrl,
          department: user?.department,
          position: user?.position,
          response: (row?.response ?? 'needs_action') as AttendeeResponse,
          respondedAt: row?.respondedAt,
          comment: row?.comment,
          isOptional: row?.isOptional ?? false,
          invitedAt: row?.invitedAt ?? booking.createdAt,
          checkedInAt: row?.checkedInAt,
        };
      }),
    );

    // Answered first (accepted → tentative → declined), then by name, so the
    // list reads like Outlook's tracking tab.
    const order: Record<AttendeeResponse, number> = {
      accepted: 0,
      tentative: 1,
      declined: 2,
      needs_action: 3,
    };
    attendees.sort((a, b) => order[a.response] - order[b.response] || a.name.localeCompare(b.name));

    const isOrganizer = booking.organizerId === caller._id;
    const canManage = canManageRooms(caller);
    const isStaff = canManage || caller.role === 'supervisor';
    const timelineVisible = isOrganizer || isStaff;

    const events = timelineVisible
      ? await ctx.db
          .query('roomBookingEvents')
          .withIndex('by_booking', (q) => q.eq('bookingId', booking._id))
          .order('desc')
          .take(MAX_PAGE_SIZE)
      : [];

    const myRow = byUser.get(caller._id);
    const isAttendee = Boolean(myRow) || (booking.attendeeIds ?? []).includes(caller._id);
    const now = Date.now();

    return {
      booking: {
        _id: booking._id,
        title: booking.title,
        description: booking.description,
        startTime: booking.startTime,
        endTime: booking.endTime,
        status: booking.status,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
        checkedInAt: booking.checkedInAt,
        cancelledAt: booking.cancelledAt,
        cancelReason: booking.cancelReason,
        externalAttendees: booking.externalAttendees ?? [],
      },
      room: room
        ? { _id: room._id, name: room.name, color: room.color, capacity: room.capacity }
        : null,
      organizer: {
        userId: booking.organizerId,
        name: organizer?.name ?? 'Unknown',
        email: organizer?.email,
        avatarUrl: organizer?.avatarUrl,
        checkedInAt: booking.checkedInAt,
      },
      attendees,
      counts: await countResponses(ctx, booking),
      timeline: events.map((event) => ({
        _id: event._id,
        type: event.type,
        actorId: event.actorId,
        actorName: event.actorName,
        actorRole: event.actorRole,
        targetName: event.targetName,
        response: event.response,
        previousStartTime: event.previousStartTime,
        previousEndTime: event.previousEndTime,
        newStartTime: event.newStartTime,
        newEndTime: event.newEndTime,
        note: event.note,
        createdAt: event.createdAt,
      })),
      timelineVisible,
      viewer: {
        userId: caller._id,
        isOrganizer,
        isAttendee,
        canManage,
        isStaff,
        myResponse: (myRow?.response ?? null) as AttendeeResponse | null,
        myRespondedAt: myRow?.respondedAt,
        canRespond: isAttendee && booking.status === 'confirmed' && booking.endTime > now,
        canCheckIn:
          (isAttendee || isOrganizer) &&
          booking.status === 'confirmed' &&
          !(isOrganizer ? booking.checkedInAt : myRow?.checkedInAt) &&
          now >= booking.startTime - 15 * 60 * 1000 &&
          now <= booking.endTime,
      },
    };
  },
});

/** Bookings organized by, or including, the caller — "my bookings". */
export const getMyBookings = query({
  args: {
    organizationId: v.id('organizations'),
    from: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    if (!isSuperadmin(caller) && caller.organizationId !== args.organizationId) return [];

    const from = args.from ?? Date.now() - 60 * 60 * 1000;
    const rows = await ctx.db
      .query('roomBookings')
      .withIndex('by_org_start', (q) =>
        q.eq('organizationId', args.organizationId).gte('startTime', from),
      )
      .take(MAX_PAGE_SIZE * 5);

    const mine = rows.filter(
      (b) =>
        b.status === 'confirmed' &&
        (b.organizerId === caller._id || (b.attendeeIds ?? []).includes(caller._id)),
    );
    const enriched = await enrichBookings(ctx, mine);
    return enriched.sort((a, b) => a.startTime - b.startTime);
  },
});

// ---------------------------------------------------------------------------
// Room mutations (admin)
// ---------------------------------------------------------------------------

const roomFields = {
  name: v.string(),
  description: v.optional(v.string()),
  building: v.optional(v.string()),
  floor: v.optional(v.string()),
  roomNumber: v.optional(v.string()),
  capacity: v.number(),
  amenities: v.array(v.string()),
  color: v.optional(v.string()),
  photoUrl: v.optional(v.string()),
  openFrom: v.optional(v.string()),
  openTo: v.optional(v.string()),
};

async function assertNameIsFree(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
  name: string,
  exceptRoomId?: Id<'meetingRooms'>,
): Promise<void> {
  const existing = await ctx.db
    .query('meetingRooms')
    .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
    .take(MAX_PAGE_SIZE);
  const clash = existing.find(
    (r) => r._id !== exceptRoomId && r.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (clash) throw new Error('A room with this name already exists');
}

export const createRoom = mutation({
  args: { organizationId: v.id('organizations'), ...roomFields },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'meetingRooms');
    await assertQuota(ctx, 'meetingRooms', 'rooms', 1);
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    assertOrgAccess(caller, args.organizationId);
    assertCanManageRooms(caller);

    const name = trimmedOrThrow(args.name, 'Room name', MAX_TITLE_LENGTH);
    if (!Number.isInteger(args.capacity) || args.capacity < 1 || args.capacity > 1000) {
      throw new Error('Capacity must be between 1 and 1000');
    }
    await assertNameIsFree(ctx, args.organizationId, name);

    const now = Date.now();
    const roomId = await ctx.db.insert('meetingRooms', {
      organizationId: args.organizationId,
      name,
      description: args.description?.trim() || undefined,
      building: args.building?.trim() || undefined,
      floor: args.floor?.trim() || undefined,
      roomNumber: args.roomNumber?.trim() || undefined,
      capacity: args.capacity,
      amenities: normalizeAmenities(args.amenities),
      color: args.color,
      photoUrl: args.photoUrl?.trim() || undefined,
      openFrom: args.openFrom,
      openTo: args.openTo,
      isActive: true,
      createdBy: caller._id,
      createdAt: now,
      updatedAt: now,
    });
    await incrementUsage(ctx, args.organizationId, 'meetingRooms', 'rooms', 1);
    return roomId;
  },
});

export const updateRoom = mutation({
  args: { roomId: v.id('meetingRooms'), ...roomFields },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'meetingRooms');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error('Room not found');
    assertOrgAccess(caller, room.organizationId);
    assertCanManageRooms(caller);

    const name = trimmedOrThrow(args.name, 'Room name', MAX_TITLE_LENGTH);
    if (!Number.isInteger(args.capacity) || args.capacity < 1 || args.capacity > 1000) {
      throw new Error('Capacity must be between 1 and 1000');
    }
    await assertNameIsFree(ctx, room.organizationId, name, room._id);

    await ctx.db.patch(args.roomId, {
      name,
      description: args.description?.trim() || undefined,
      building: args.building?.trim() || undefined,
      floor: args.floor?.trim() || undefined,
      roomNumber: args.roomNumber?.trim() || undefined,
      capacity: args.capacity,
      amenities: normalizeAmenities(args.amenities),
      color: args.color,
      photoUrl: args.photoUrl?.trim() || undefined,
      openFrom: args.openFrom,
      openTo: args.openTo,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

/**
 * Archive or restore a room. Archiving cancels its future bookings — leaving
 * them would show meetings in a room nobody can use.
 */
export const setRoomActive = mutation({
  args: { roomId: v.id('meetingRooms'), isActive: v.boolean(), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'meetingRooms');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error('Room not found');
    assertOrgAccess(caller, room.organizationId);
    assertCanManageRooms(caller);

    const now = Date.now();
    await ctx.db.patch(args.roomId, { isActive: args.isActive, updatedAt: now });

    let cancelled = 0;
    if (!args.isActive) {
      const future = await ctx.db
        .query('roomBookings')
        .withIndex('by_room_start', (q) => q.eq('roomId', args.roomId).gte('startTime', now))
        .take(MAX_PAGE_SIZE * 5);
      for (const booking of future) {
        if (booking.status !== 'confirmed') continue;
        await ctx.db.patch(booking._id, {
          status: 'cancelled',
          cancelledAt: now,
          cancelledBy: caller._id,
          cancelReason: args.reason?.trim() || 'Room archived',
          updatedAt: now,
        });
        cancelled += 1;
        await logBookingEvent(ctx, booking, 'cancelled', caller, {
          note: args.reason?.trim() || 'Room archived',
          previousStartTime: booking.startTime,
          previousEndTime: booking.endTime,
        });
        await notifyBookingCancelled(ctx, booking, room.name, caller);
      }
    }

    return { success: true, cancelledBookings: cancelled };
  },
});

/** Hard delete — only allowed while a room has no history at all. */
export const deleteRoom = mutation({
  args: { roomId: v.id('meetingRooms') },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'meetingRooms');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const room = await ctx.db.get(args.roomId);
    if (!room) return { success: true };
    assertOrgAccess(caller, room.organizationId);
    assertCanManageRooms(caller);

    const anyBooking = await ctx.db
      .query('roomBookings')
      .withIndex('by_room', (q) => q.eq('roomId', args.roomId))
      .first();
    if (anyBooking) {
      throw new Error('Room has bookings — archive it instead of deleting');
    }

    await ctx.db.delete(args.roomId);
    return { success: true };
  },
});

// ---------------------------------------------------------------------------
// Booking mutations (members)
// ---------------------------------------------------------------------------

async function notifyAttendees(
  ctx: MutationCtx,
  booking: {
    organizationId: Id<'organizations'>;
    organizerId: Id<'users'>;
    attendeeIds?: Id<'users'>[];
    title: string;
  },
  roomName: string,
  message: { key: string; fallback: string },
  actorName: string,
  type: 'room_booked' | 'room_booking_cancelled',
): Promise<void> {
  const recipients = new Set<string>(booking.attendeeIds ?? []);
  recipients.delete(booking.organizerId);
  for (const userId of recipients) {
    await notify(ctx, {
      organizationId: booking.organizationId,
      userId: userId as Id<'users'>,
      type,
      titleKey: 'notifications.titles.roomBooking',
      messageKey: message.key,
      params: {
        bookingTitle: booking.title,
        roomName,
        actorName,
      },
      fallbackTitle: `${booking.title} · ${roomName}`,
      fallbackMessage: message.fallback,
      route: '/rooms',
    });
  }
}

async function notifyBookingCancelled(
  ctx: MutationCtx,
  booking: Doc<'roomBookings'>,
  roomName: string,
  actor: Caller,
): Promise<void> {
  await notifyAttendees(
    ctx,
    booking,
    roomName,
    {
      key: 'notifications.messages.roomCancelled',
      fallback: `Meeting cancelled by ${actor.name}`,
    },
    actor.name,
    'room_booking_cancelled',
  );
}

export const bookRoom = mutation({
  args: {
    roomId: v.id('meetingRooms'),
    title: v.string(),
    description: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.number(),
    attendeeIds: v.optional(v.array(v.id('users'))),
    externalAttendees: v.optional(v.array(v.string())),
    videoUrl: v.optional(v.string()),
    videoProvider: v.optional(
      v.union(v.literal('livekit'), v.literal('teams'), v.literal('zoom'), v.literal('meet')),
    ),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'meetingRooms');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    return await reserveRoom(ctx, caller, args);
  },
});

/**
 * Marker prefix for "the room is already taken" failures.
 *
 * Callers check availability before submitting, so this normally only fires on a
 * genuine race (somebody booked the same slot a second earlier). Encoding the
 * blocking interval lets the UI say "busy until 15:30" instead of showing a
 * generic error.
 */
export const ROOM_BUSY_ERROR = 'ROOM_BUSY';

function roomBusyError(conflict: Doc<'roomBookings'>): Error {
  return new Error(
    `${ROOM_BUSY_ERROR}|${conflict.startTime}|${conflict.endTime}|${conflict.title.replace(/\|/g, '/')}`,
  );
}

/**
 * Creates a reservation after checking everything that protects a room:
 * organization access, the room being bookable, a sane duration, capacity and —
 * most importantly — no overlap with an existing meeting.
 *
 * Shared by the booking dialog and by calendar events that reserve a room in the
 * same transaction, so both paths enforce identical rules and write the same
 * attendee rows and audit entries.
 */
export async function reserveRoom(
  ctx: MutationCtx,
  caller: Caller,
  args: {
    roomId: Id<'meetingRooms'>;
    title: string;
    description?: string;
    startTime: number;
    endTime: number;
    attendeeIds?: Id<'users'>[];
    externalAttendees?: string[];
    videoUrl?: string;
    videoProvider?: 'livekit' | 'teams' | 'zoom' | 'meet';
    /** Set when re-booking an event so its own reservation does not block it. */
    excludeBookingId?: Id<'roomBookings'>;
  },
): Promise<Id<'roomBookings'>> {
  const room = await ctx.db.get(args.roomId);
  if (!room) throw new Error('Room not found');
  assertOrgAccess(caller, room.organizationId);
  if (!room.isActive) throw new Error('This room is archived and cannot be booked');

  const now = Date.now();
  const title = trimmedOrThrow(args.title, 'Title', MAX_TITLE_LENGTH);
  if (args.description && args.description.length > MAX_TEXT_LENGTH) {
    throw new Error('Description is too long');
  }
  validateRange(args.startTime, args.endTime, now);

  // Deduplicate and drop the organizer — they are counted separately.
  const attendeeIds = [...new Set(args.attendeeIds ?? [])].filter((id) => id !== caller._id);
  const externalAttendees = (args.externalAttendees ?? [])
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 50);
  const headcount = 1 + attendeeIds.length + externalAttendees.length;
  if (headcount > room.capacity) {
    throw new Error(`Too many participants for this room (capacity ${room.capacity})`);
  }

  const conflicts = (await bookingsInRange(ctx, args.roomId, args.startTime, args.endTime)).filter(
    (candidate) => candidate._id !== args.excludeBookingId,
  );
  if (conflicts.length > 0) throw roomBusyError(conflicts[0]!);

  const bookingId = await ctx.db.insert('roomBookings', {
    organizationId: room.organizationId,
    roomId: args.roomId,
    title,
    description: args.description?.trim() || undefined,
    startTime: args.startTime,
    endTime: args.endTime,
    organizerId: caller._id,
    attendeeIds: attendeeIds.length ? attendeeIds : undefined,
    externalAttendees: externalAttendees.length ? externalAttendees : undefined,
    videoUrl: args.videoUrl?.trim() || undefined,
    videoProvider: args.videoProvider,
    status: 'confirmed',
    createdAt: now,
    updatedAt: now,
  });

  const booking = await ctx.db.get(bookingId);
  if (booking) {
    // Invitations start at "needs action"; the log gets one 'created' entry
    // rather than one per guest, so the timeline stays readable.
    await syncAttendeeRows(ctx, booking, attendeeIds, caller, { logChanges: false });
    await logBookingEvent(ctx, booking, 'created', caller, {
      newStartTime: args.startTime,
      newEndTime: args.endTime,
      note: title,
    });
  }

  await notifyAttendees(
    ctx,
    { organizationId: room.organizationId, organizerId: caller._id, attendeeIds, title },
    room.name,
    {
      key: 'notifications.messages.roomInvited',
      fallback: `${caller.name} invited you to a meeting`,
    },
    caller.name,
    'room_booked',
  );

  return bookingId;
}

export const updateBooking = mutation({
  args: {
    bookingId: v.id('roomBookings'),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    attendeeIds: v.optional(v.array(v.id('users'))),
    externalAttendees: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error('Booking not found');
    assertOrgAccess(caller, booking.organizationId);
    if (booking.organizerId !== caller._id && !canManageRooms(caller)) {
      throw new Error('Only the organizer or an admin can change this booking');
    }
    if (booking.status !== 'confirmed') throw new Error('This booking is cancelled');

    const room = await ctx.db.get(booking.roomId);
    if (!room) throw new Error('Room not found');

    const now = Date.now();
    const startTime = args.startTime ?? booking.startTime;
    const endTime = args.endTime ?? booking.endTime;
    const timesChanged = startTime !== booking.startTime || endTime !== booking.endTime;
    if (timesChanged) {
      validateRange(startTime, endTime, now);
      const conflicts = (await bookingsInRange(ctx, booking.roomId, startTime, endTime)).filter(
        (b) => b._id !== booking._id,
      );
      if (conflicts.length > 0) throw new Error('Room is already booked for the new time');
    }

    const attendeeIds =
      args.attendeeIds === undefined
        ? booking.attendeeIds
        : [...new Set(args.attendeeIds)].filter((id) => id !== booking.organizerId);
    const externalAttendees =
      args.externalAttendees === undefined
        ? booking.externalAttendees
        : args.externalAttendees
            .map((a) => a.trim())
            .filter(Boolean)
            .slice(0, 50);
    const headcount = 1 + (attendeeIds?.length ?? 0) + (externalAttendees?.length ?? 0);
    if (headcount > room.capacity) {
      throw new Error(`Too many participants for this room (capacity ${room.capacity})`);
    }

    await ctx.db.patch(args.bookingId, {
      title: args.title ? trimmedOrThrow(args.title, 'Title', MAX_TITLE_LENGTH) : booking.title,
      description:
        args.description === undefined ? booking.description : args.description.trim() || undefined,
      startTime,
      endTime,
      attendeeIds: attendeeIds?.length ? attendeeIds : undefined,
      externalAttendees: externalAttendees?.length ? externalAttendees : undefined,
      updatedAt: now,
    });

    const updated = (await ctx.db.get(args.bookingId)) ?? booking;

    if (args.attendeeIds !== undefined) {
      await syncAttendeeRows(ctx, updated, attendeeIds ?? [], caller, { logChanges: true });
    }

    if (timesChanged) {
      await logBookingEvent(ctx, updated, 'rescheduled', caller, {
        previousStartTime: booking.startTime,
        previousEndTime: booking.endTime,
        newStartTime: startTime,
        newEndTime: endTime,
      });
      await resetResponsesAfterReschedule(ctx, updated, caller);
    }

    // Field edits that are not a reschedule still belong in the log — "who
    // renamed the meeting" is a question admins do ask.
    const changedFields: string[] = [];
    if (args.title && args.title.trim() !== booking.title) changedFields.push('title');
    if (
      args.description !== undefined &&
      (args.description.trim() || undefined) !== booking.description
    ) {
      changedFields.push('description');
    }
    if (args.externalAttendees !== undefined) changedFields.push('externalAttendees');
    if (changedFields.length > 0) {
      await logBookingEvent(ctx, updated, 'updated', caller, { note: changedFields.join(',') });
    }

    return { success: true };
  },
});

export const cancelBooking = mutation({
  args: { bookingId: v.id('roomBookings'), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    await cancelRoomBooking(ctx, caller, args.bookingId, args.reason);
    return { success: true };
  },
});

/**
 * Cancels a reservation on behalf of `caller`. Shared with calendar events so
 * that deleting or re-scheduling an event releases the room it held.
 *
 * @returns whether a confirmed booking was actually released
 */
export async function cancelRoomBooking(
  ctx: MutationCtx,
  caller: Caller,
  bookingId: Id<'roomBookings'>,
  reason?: string,
): Promise<boolean> {
  const booking = await ctx.db.get(bookingId);
  if (!booking) return false;
  assertOrgAccess(caller, booking.organizationId);
  if (booking.organizerId !== caller._id && !canManageRooms(caller)) {
    throw new Error('Only the organizer or an admin can cancel this booking');
  }
  if (booking.status === 'cancelled') return false;

  const now = Date.now();
  await ctx.db.patch(bookingId, {
    status: 'cancelled',
    cancelledAt: now,
    cancelledBy: caller._id,
    cancelReason: reason?.trim() || undefined,
    updatedAt: now,
  });

  await logBookingEvent(ctx, booking, 'cancelled', caller, {
    note: reason?.trim() || undefined,
    previousStartTime: booking.startTime,
    previousEndTime: booking.endTime,
  });

  // A calendar event may be holding this reservation. Clearing the link keeps the
  // event from advertising a room it no longer has — the reverse of the rule that
  // deleting an event releases its room.
  const linkedEvents = await ctx.db
    .query('calendarEvents')
    .withIndex('by_room_booking', (q) => q.eq('roomBookingId', bookingId))
    .take(10);
  for (const event of linkedEvents) {
    await ctx.db.patch(event._id, {
      roomId: undefined,
      roomBookingId: undefined,
      updatedAt: now,
    });
  }

  const room = await ctx.db.get(booking.roomId);
  await notifyBookingCancelled(ctx, booking, room?.name ?? 'Meeting room', caller);
  return true;
}

/**
 * Accept, decline or tentatively accept an invitation.
 *
 * Only invited attendees answer — the organizer is attending by definition, and
 * nobody may answer on somebody else's behalf, which is why the target comes
 * from `ctx.auth` and not from the arguments. Answers stay editable while the
 * meeting has not ended: people change their minds, and the log keeps every
 * step.
 */
export const respondToBooking = mutation({
  args: {
    bookingId: v.id('roomBookings'),
    response: v.union(v.literal('accepted'), v.literal('tentative'), v.literal('declined')),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error('Booking not found');
    assertOrgAccess(caller, booking.organizationId);
    if (booking.status !== 'confirmed') throw new Error('This booking is cancelled');
    if (booking.endTime <= Date.now()) throw new Error('This meeting has already ended');
    if (booking.organizerId === caller._id) {
      throw new Error('The organizer does not need to respond');
    }

    const invited =
      (booking.attendeeIds ?? []).includes(caller._id) ||
      Boolean(await attendeeRow(ctx, args.bookingId, caller._id));
    if (!invited) throw new Error('Only invited participants can respond');

    const comment = args.comment?.trim().slice(0, MAX_TEXT_LENGTH) || undefined;
    const now = Date.now();
    const existing = await attendeeRow(ctx, args.bookingId, caller._id);

    if (existing) {
      await ctx.db.patch(existing._id, {
        response: args.response,
        respondedAt: now,
        comment,
        // Answering again after being uninvited and re-invited is fine; a stale
        // removal flag would hide the row from the roster.
        removedAt: undefined,
        removedBy: undefined,
      });
    } else {
      // Booking predates tracking — materialize the row on first answer.
      await ctx.db.insert('roomBookingAttendees', {
        organizationId: booking.organizationId,
        bookingId: booking._id,
        roomId: booking.roomId,
        userId: caller._id,
        response: args.response,
        respondedAt: now,
        comment,
        invitedAt: booking.createdAt,
        invitedBy: booking.organizerId,
      });
    }

    await logBookingEvent(ctx, booking, 'responded', caller, {
      targetUserId: caller._id,
      targetName: caller.name,
      response: args.response,
      note: comment,
    });

    // The organizer is the one who needs to know; attendees are not spammed.
    await notify(ctx, {
      organizationId: booking.organizationId,
      userId: booking.organizerId,
      type: 'room_booked',
      titleKey: 'notifications.titles.roomBookingResponse',
      messageKey: 'notifications.messages.attendeeResponded',
      params: {
        bookingTitle: booking.title,
        name: caller.name,
        response: args.response,
      },
      fallbackTitle: booking.title,
      fallbackMessage: `${caller.name} ${args.response} the invitation`,
      route: '/rooms',
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * Confirms somebody is actually in the room (anti no-show).
 *
 * The organizer's check-in marks the meeting as happening; an attendee's
 * check-in is recorded on their own tracking row, so "invited 8, showed up 5"
 * is answerable afterwards.
 */
export const checkInBooking = mutation({
  args: { bookingId: v.id('roomBookings') },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error('Booking not found');
    assertOrgAccess(caller, booking.organizationId);
    const isOrganizer = booking.organizerId === caller._id;
    const row = await attendeeRow(ctx, args.bookingId, caller._id);
    const isAttendee = (booking.attendeeIds ?? []).includes(caller._id) || Boolean(row);
    if (!isOrganizer && !isAttendee) {
      throw new Error('Only participants can check in');
    }
    if (booking.status !== 'confirmed') throw new Error('This booking is cancelled');

    const now = Date.now();
    if (now < booking.startTime - 15 * 60 * 1000 || now > booking.endTime) {
      throw new Error('Check-in is only possible around the meeting time');
    }

    if (isOrganizer) {
      if (booking.checkedInAt) return { success: true };
      await ctx.db.patch(args.bookingId, { checkedInAt: now, updatedAt: now });
    } else if (row) {
      if (row.checkedInAt) return { success: true };
      await ctx.db.patch(row._id, { checkedInAt: now });
    } else {
      // Booking predates tracking — materialize the row so the check-in sticks.
      await ctx.db.insert('roomBookingAttendees', {
        organizationId: booking.organizationId,
        bookingId: booking._id,
        roomId: booking.roomId,
        userId: caller._id,
        response: 'accepted',
        respondedAt: now,
        invitedAt: booking.createdAt,
        invitedBy: booking.organizerId,
        checkedInAt: now,
      });
    }

    await logBookingEvent(ctx, booking, 'checked_in', caller, {
      targetUserId: caller._id,
      targetName: caller.name,
    });
    return { success: true };
  },
});

// ---------------------------------------------------------------------------
// Platform usage stats
// ---------------------------------------------------------------------------

/**
 * Aggregated count of confirmed bookings per video platform, scoped to an
 * organization and an optional time range. Returns `{ livekit: 5, teams: 3, ... }`.
 */
export const VALID_LEAD_TIMES = [5, 10, 15, 30] as const;

/** Get the org's meeting reminder lead time (minutes). */
export const getMeetingReminderLeadTime = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, { organizationId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return 15;
    assertOrgAccess(caller, organizationId);
    const org = await ctx.db.get(organizationId);
    return org?.meetingReminderLeadTime ?? 15;
  },
});

/** Set the org's meeting reminder lead time. Admins only. */
export const updateMeetingReminderLeadTime = mutation({
  args: {
    organizationId: v.id('organizations'),
    leadTimeMinutes: v.number(),
  },
  handler: async (ctx, { organizationId, leadTimeMinutes }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    assertOrgAccess(caller, organizationId);
    if (!(caller.role === 'admin' || isSuperadmin(caller))) {
      throw new Error('Insufficient permissions');
    }
    if (!(VALID_LEAD_TIMES as readonly number[]).includes(leadTimeMinutes)) {
      throw new Error(`Invalid lead time. Allowed: ${VALID_LEAD_TIMES.join(', ')}`);
    }
    await ctx.db.patch(organizationId, {
      meetingReminderLeadTime: leadTimeMinutes,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const getBookingPlatformStats = query({
  args: {
    organizationId: v.id('organizations'),
    /** Only count bookings created after this epoch ms. Defaults to 30 days ago. */
    since: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, since }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return {};
    assertOrgAccess(caller, organizationId);

    const cutoff = since ?? Date.now() - 30 * 24 * 60 * 60 * 1000;
    const stats: Record<string, number> = {};

    // Walk confirmed bookings from the org index, newest first.
    const bookings = await ctx.db
      .query('roomBookings')
      .withIndex('by_org_start', (q) =>
        q.eq('organizationId', organizationId).gte('startTime', cutoff),
      )
      .take(MAX_PAGE_SIZE * 5);

    for (const b of bookings) {
      if (b.status !== 'confirmed') continue;
      const provider = b.videoProvider ?? 'none';
      stats[provider] = (stats[provider] ?? 0) + 1;
    }
    return stats;
  },
});

// ---------------------------------------------------------------------------
// Meeting reminders (cron)
// ---------------------------------------------------------------------------

/**
 * Sends a reminder notification to the organizer and every accepted attendee
 * of confirmed bookings starting in the next 15 minutes. If the booking has a
 * `videoUrl` / `videoProvider`, the notification includes the platform name
 * and link so participants can join remotely.
 *
 * Runs every 10 minutes via the cron dispatcher. The notification type is
 * `room_meeting_reminder`; the handler is idempotent — duplicate notifications
 * within a short window are harmless.
 */
export const sendMeetingReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // Use the maximum possible lead time (30 min) to fetch bookings,
    // then filter per-org when sending notifications.
    const MAX_LEAD_MS = 30 * 60 * 1000;
    const upperBound = now + MAX_LEAD_MS;

    // Walk bookings whose startTime falls inside [now, now + 15 min].
    // Query active rooms directly — the time window is narrow so a full
    // scan of active rooms is cheap.
    const allRooms = await ctx.db
      .query('meetingRooms')
      .filter((q) => q.eq(q.field('isActive'), true))
      .take(MAX_PAGE_SIZE * 10);
    const roomIds = new Set(allRooms.map((r) => r._id));

    let sent = 0;
    for (const roomId of roomIds) {
      const bookings = await ctx.db
        .query('roomBookings')
        .withIndex('by_room_start', (q) =>
          q.eq('roomId', roomId).gte('startTime', now).lt('startTime', upperBound),
        )
        .take(50);

      for (const booking of bookings) {
        if (booking.status !== 'confirmed') continue;

        // Check the org's configured lead time — skip if booking is still
        // outside the reminder window for this org.
        const org = await ctx.db.get(booking.organizationId);
        const leadMinutes = org?.meetingReminderLeadTime ?? 15;
        const leadMs = leadMinutes * 60 * 1000;
        const timeUntilStart = booking.startTime - now;
        if (timeUntilStart > leadMs) continue; // too early for this org

        const room = await ctx.db.get(booking.roomId);
        if (!room) continue;

        // Build the platform label from the videoProvider.
        const platformLabels: Record<string, string> = {
          livekit: 'LiveKit',
          teams: 'Microsoft Teams',
          zoom: 'Zoom',
          meet: 'Google Meet',
        };
        const platformName = (booking.videoProvider && platformLabels[booking.videoProvider]) || '';

        const timeStr = new Date(booking.startTime).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });

        // Notify organizer + every accepted attendee.
        const recipientIds = new Set<string>(booking.attendeeIds ?? []);
        recipientIds.add(booking.organizerId as string);

        for (const userId of recipientIds) {
          const user = await ctx.db.get(userId as Id<'users'>);
          if (!user) continue;

          const messageParts: string[] = [
            `${booking.title} · ${room.name}`,
            `Starts at ${timeStr}`,
          ];
          if (platformName) messageParts.push(`Platform: ${platformName}`);
          if (booking.videoUrl) messageParts.push(booking.videoUrl);

          // The platform belongs in the sentence, so each language decides where
          // it goes: one key without it, one with. Building the fragment here
          // (" Platform: Zoom") would hardcode English into every translation,
          // and an i18next placeholder cannot hold a conditional expression.
          const messageKey = platformName
            ? 'notifications.messages.roomMeetingReminderWithPlatform'
            : 'notifications.messages.roomMeetingReminder';

          await notify(ctx, {
            organizationId: booking.organizationId,
            userId: userId as Id<'users'>,
            type: 'room_meeting_reminder',
            titleKey: 'notifications.titles.roomMeetingReminder',
            messageKey,
            params: {
              bookingTitle: booking.title,
              roomName: room.name,
              startTime: timeStr,
              platform: platformName,
            },
            fallbackTitle: `${booking.title} starts in 15 min`,
            fallbackMessage: messageParts.join(' — '),
            route: '/rooms',
            extra: {
              videoUrl: booking.videoUrl,
              videoProvider: booking.videoProvider,
            },
          });
          sent++;
        }
      }
    }
    return { sent };
  },
});
