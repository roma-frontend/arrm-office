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
import { mutation, query, type QueryCtx, type MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getAuthCaller, type AuthenticatedCaller } from './lib/getAuthCaller';
import { isSuperadmin } from './lib/auth';
import { MAX_PAGE_SIZE } from './pagination';

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

export interface EnrichedBooking extends Doc<'roomBookings'> {
  roomName: string;
  roomColor?: string;
  /** Location parts, kept separate so the client can label them per language. */
  roomBuilding?: string;
  roomFloor?: string;
  roomNumber?: string;
  organizerName?: string;
  attendeeNames: string[];
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
    enriched.push({
      ...booking,
      roomName: room?.name ?? 'Unknown room',
      roomColor: room?.color,
      roomBuilding: room?.building,
      roomFloor: room?.floor,
      roomNumber: room?.roomNumber,
      organizerName: await resolveName(booking.organizerId),
      attendeeNames: [...attendeeNames, ...(booking.externalAttendees ?? [])],
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
    return await ctx.db.insert('meetingRooms', {
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
  },
});

export const updateRoom = mutation({
  args: { roomId: v.id('meetingRooms'), ...roomFields },
  handler: async (ctx, args) => {
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
  message: string,
  type: 'room_booked' | 'room_booking_cancelled',
): Promise<void> {
  const recipients = new Set<string>(booking.attendeeIds ?? []);
  recipients.delete(booking.organizerId);
  for (const userId of recipients) {
    await ctx.db.insert('notifications', {
      organizationId: booking.organizationId,
      userId: userId as Id<'users'>,
      type,
      title: `${booking.title} · ${roomName}`,
      message,
      isRead: false,
      route: '/rooms',
      createdAt: Date.now(),
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
    `Meeting cancelled by ${actor.name}`,
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
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
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

    const conflicts = await bookingsInRange(ctx, args.roomId, args.startTime, args.endTime);
    if (conflicts.length > 0) {
      const first = conflicts[0]!;
      throw new Error(
        `Room is already booked from ${new Date(first.startTime).toISOString()} to ${new Date(
          first.endTime,
        ).toISOString()}`,
      );
    }

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
      status: 'confirmed',
      createdAt: now,
      updatedAt: now,
    });

    await notifyAttendees(
      ctx,
      { organizationId: room.organizationId, organizerId: caller._id, attendeeIds, title },
      room.name,
      `${caller.name} invited you to a meeting`,
      'room_booked',
    );

    return bookingId;
  },
});

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

    return { success: true };
  },
});

export const cancelBooking = mutation({
  args: { bookingId: v.id('roomBookings'), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) return { success: true };
    assertOrgAccess(caller, booking.organizationId);
    if (booking.organizerId !== caller._id && !canManageRooms(caller)) {
      throw new Error('Only the organizer or an admin can cancel this booking');
    }
    if (booking.status === 'cancelled') return { success: true };

    const now = Date.now();
    await ctx.db.patch(args.bookingId, {
      status: 'cancelled',
      cancelledAt: now,
      cancelledBy: caller._id,
      cancelReason: args.reason?.trim() || undefined,
      updatedAt: now,
    });

    const room = await ctx.db.get(booking.roomId);
    await notifyBookingCancelled(ctx, booking, room?.name ?? 'Meeting room', caller);

    return { success: true };
  },
});

/** Organizer confirms the meeting is actually happening (anti no-show). */
export const checkInBooking = mutation({
  args: { bookingId: v.id('roomBookings') },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error('Booking not found');
    assertOrgAccess(caller, booking.organizationId);
    if (booking.organizerId !== caller._id && !(booking.attendeeIds ?? []).includes(caller._id)) {
      throw new Error('Only participants can check in');
    }
    if (booking.status !== 'confirmed') throw new Error('This booking is cancelled');
    if (booking.checkedInAt) return { success: true };

    const now = Date.now();
    if (now < booking.startTime - 15 * 60 * 1000 || now > booking.endTime) {
      throw new Error('Check-in is only possible around the meeting time');
    }
    await ctx.db.patch(args.bookingId, { checkedInAt: now, updatedAt: now });
    return { success: true };
  },
});
