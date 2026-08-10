/**
 * Integration tests for convex/meetingRooms — room CRUD guards, booking
 * queries, attendee-row sync on updates, archiving, deletion guards and
 * validation edges, run against convex-test's in-memory database with the real
 * schema.
 *
 * Complements the unit suite (convex-meetingRooms.test.ts) by exercising the
 * real index-based queries (listRooms, getRoomsWithBookings, listBookings,
 * getRoomBookings, checkAvailability, getMyBookings) and the mutation paths
 * that touch roomBookingAttendees / roomBookingEvents.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './meetingRooms.ts': () => import('../../convex/meetingRooms'),
  './lib/getAuthCaller.ts': () => import('../../convex/lib/getAuthCaller'),
  './lib/auth.ts': () => import('../../convex/lib/auth'),
  './pagination.ts': () => import('../../convex/pagination'),
  './lib/notify.ts': () => import('../../convex/lib/notify'),
} as unknown as Record<string, () => Promise<unknown>>;

type Ctx = Awaited<ReturnType<typeof seed>>;

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Acme',
      slug: `acme-${Math.random().toString(36).slice(2)}`,
      plan: 'professional',
      isActive: true,
      createdBySuperadmin: false,
      employeeLimit: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);
    const otherOrgId = await ctx.db.insert('organizations', {
      name: 'Other',
      slug: `other-${Math.random().toString(36).slice(2)}`,
      plan: 'starter',
      isActive: true,
      createdBySuperadmin: false,
      employeeLimit: 10,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);

    const baseUser = {
      passwordHash: 'x',
      employeeType: 'staff' as const,
      isActive: true,
      isApproved: true,
      travelAllowance: 0,
      paidLeaveBalance: 10,
      sickLeaveBalance: 5,
      familyLeaveBalance: 5,
      dayOffBalance: 4,
      createdAt: Date.now(),
    };

    const adminId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Admin',
      email: 'admin@acme.test',
      role: 'admin',
    });
    const employeeId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Employee',
      email: 'employee@acme.test',
      role: 'employee',
    });
    const peerId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Peer',
      email: 'peer@acme.test',
      role: 'employee',
    });
    const foreignId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId: otherOrgId,
      name: 'Foreign',
      email: 'foreign@other.test',
      role: 'employee',
    });

    const roomId = await ctx.db.insert('meetingRooms', {
      organizationId,
      name: 'Boardroom',
      capacity: 4,
      amenities: ['projector', 'whiteboard'],
      isActive: true,
      createdBy: adminId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { organizationId, otherOrgId, adminId, employeeId, peerId, foreignId, roomId };
  });
  return { t, ...ids };
}

const HOUR = 60 * 60 * 1000;
const now = Date.now();
const window = (offsetMs = 0, durMs = 60 * 60 * 1000) => ({
  startTime: now + HOUR + offsetMs,
  endTime: now + HOUR + offsetMs + durMs,
});

const asEmp = (c: Ctx) => c.t.withIdentity({ email: 'employee@acme.test' });
const asAdmin = (c: Ctx) => c.t.withIdentity({ email: 'admin@acme.test' });

async function createBooking(
  c: Ctx,
  overrides: Record<string, unknown> = {},
): Promise<Id<'roomBookings'>> {
  return await asEmp(c).mutation(api.meetingRooms.bookRoom, {
    roomId: c.roomId,
    title: 'Team sync',
    attendeeIds: [c.peerId],
    ...window(),
    ...overrides,
  } as never);
}

// ── Room listing queries ─────────────────────────────────────────────────────
describe('room listing queries', () => {
  it('listRooms returns only active rooms by default and all with includeArchived', async () => {
    const c = await seed();
    await c.t.run(async (ctx) => {
      await ctx.db.insert('meetingRooms', {
        organizationId: c.organizationId,
        name: 'Old Room',
        capacity: 2,
        amenities: [],
        isActive: false,
        createdBy: c.adminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
    });
    const active = await asEmp(c).query(api.meetingRooms.listRooms, {
      organizationId: c.organizationId,
    });
    expect(active.map((r) => r.name)).toEqual(['Boardroom']);
    const all = await asEmp(c).query(api.meetingRooms.listRooms, {
      organizationId: c.organizationId,
      includeArchived: true,
    });
    expect(all.map((r) => r.name).sort()).toEqual(['Boardroom', 'Old Room']);
  });

  it('getRoomsWithBookings returns bookings for the default window and archived flag', async () => {
    const c = await seed();
    await createBooking(c);
    const res = await asEmp(c).query(api.meetingRooms.getRoomsWithBookings, {
      organizationId: c.organizationId,
    });
    expect(res).toHaveLength(1);
    expect(res[0]?.name).toBe('Boardroom');
    expect(res[0]?.bookings?.length).toBeGreaterThan(0);
    expect(res[0]?.bookings[0]?.title).toBe('Team sync');
  });

  it('getRoomsWithBookings returns an empty list for other-org callers', async () => {
    const c = await seed();
    await createBooking(c);
    const res = await c.t
      .withIdentity({ email: 'foreign@other.test' })
      .query(api.meetingRooms.getRoomsWithBookings, { organizationId: c.organizationId });
    expect(res).toEqual([]);
  });

  it('listBookings returns only confirmed overlapping bookings in range', async () => {
    const c = await seed();
    await createBooking(c);
    const res = await asEmp(c).query(api.meetingRooms.listBookings, {
      organizationId: c.organizationId,
      startTime: now + 30 * 60 * 1000,
      endTime: now + 2 * HOUR,
    });
    expect(res).toHaveLength(1);
    expect(res[0]?.title).toBe('Team sync');
  });

  it('getRoomBookings honours includeCancelled', async () => {
    const c = await seed();
    const bookingId = await createBooking(c);
    await asEmp(c).mutation(api.meetingRooms.cancelBooking, { bookingId, reason: 'changed mind' });
    const confirmedOnly = await asEmp(c).query(api.meetingRooms.getRoomBookings, {
      roomId: c.roomId,
      startTime: now,
      endTime: now + 3 * HOUR,
    });
    expect(confirmedOnly).toHaveLength(0);
    const withCancelled = await asEmp(c).query(api.meetingRooms.getRoomBookings, {
      roomId: c.roomId,
      startTime: now,
      endTime: now + 3 * HOUR,
      includeCancelled: true,
    });
    expect(withCancelled).toHaveLength(1);
    expect(withCancelled[0]?.status).toBe('cancelled');
  });

  it('checkAvailability reports conflicts and respects cross-org scoping', async () => {
    const c = await seed();
    await createBooking(c);
    const busy = await asEmp(c).query(api.meetingRooms.checkAvailability, {
      roomId: c.roomId,
      ...window(),
    });
    expect(busy.available).toBe(false);
    expect(busy.conflicts.length).toBeGreaterThan(0);

    const free = await asEmp(c).query(api.meetingRooms.checkAvailability, {
      roomId: c.roomId,
      ...window(3 * HOUR),
    });
    expect(free.available).toBe(true);

    const crossOrg = await c.t
      .withIdentity({ email: 'foreign@other.test' })
      .query(api.meetingRooms.checkAvailability, { roomId: c.roomId, ...window(4 * HOUR) });
    expect(crossOrg).toEqual({ available: false, conflicts: [] });
  });

  it('checkAvailability returns unavailable for invalid ranges', async () => {
    const c = await seed();
    const res = await asEmp(c).query(api.meetingRooms.checkAvailability, {
      roomId: c.roomId,
      startTime: now + HOUR,
      endTime: now + HOUR - 1000,
    });
    expect(res.available).toBe(false);
  });

  it('getMyBookings returns bookings where the caller is organizer or attendee', async () => {
    const c = await seed();
    await createBooking(c);
    const mine = await asEmp(c).query(api.meetingRooms.getMyBookings, {
      organizationId: c.organizationId,
    });
    expect(mine).toHaveLength(1);
    expect(mine[0]?.title).toBe('Team sync');
  });
});

// ── Room mutations: guards ──────────────────────────────────────────────────
describe('room CRUD guards', () => {
  it('rejects a duplicate room name', async () => {
    const c = await seed();
    await expect(
      asAdmin(c).mutation(api.meetingRooms.createRoom, {
        organizationId: c.organizationId,
        name: 'Boardroom',
        capacity: 2,
        amenities: [],
      } as never),
    ).rejects.toThrow('A room with this name already exists');
  });

  it('updateRoom rejects an invalid capacity', async () => {
    const c = await seed();
    await expect(
      asAdmin(c).mutation(api.meetingRooms.updateRoom, {
        roomId: c.roomId,
        name: 'Boardroom',
        capacity: 0,
        amenities: [],
      } as never),
    ).rejects.toThrow('Capacity must be between 1 and 1000');
  });

  it('setRoomActive archives a room and cancels its future bookings', async () => {
    const c = await seed();
    await createBooking(c);
    await asAdmin(c).mutation(api.meetingRooms.setRoomActive, {
      roomId: c.roomId,
      isActive: false,
      reason: 'Renovation',
    } as never);
    const room = await c.t.run((ctx) => ctx.db.get(c.roomId));
    expect(room?.isActive).toBe(false);
    const bookings = await c.t.run((ctx) =>
      ctx.db
        .query('roomBookings')
        .withIndex('by_room', (q) => q.eq('roomId', c.roomId))
        .collect(),
    );
    expect(bookings.every((b) => b.status === 'cancelled')).toBe(true);
  });

  it('deleteRoom refuses while bookings exist', async () => {
    const c = await seed();
    await createBooking(c);
    await expect(
      asAdmin(c).mutation(api.meetingRooms.deleteRoom, { roomId: c.roomId }),
    ).rejects.toThrow('Room has bookings — archive it instead of deleting');
  });

  it('deleteRoom removes a booking-free room', async () => {
    const c = await seed();
    await asAdmin(c).mutation(api.meetingRooms.deleteRoom, { roomId: c.roomId });
    const room = await c.t.run((ctx) => ctx.db.get(c.roomId));
    expect(room).toBeNull();
  });
});

// ── Booking validation edges ────────────────────────────────────────────────
describe('booking validation', () => {
  it('rejects non-finite booking times', async () => {
    const c = await seed();
    await expect(
      asEmp(c).mutation(api.meetingRooms.bookRoom, {
        roomId: c.roomId,
        title: 'Bad',
        startTime: NaN,
        endTime: now + HOUR,
      } as never),
    ).rejects.toThrow('Invalid booking time');
  });

  it('rejects an overlong description', async () => {
    const c = await seed();
    await expect(
      asEmp(c).mutation(api.meetingRooms.bookRoom, {
        roomId: c.roomId,
        title: 'Long',
        description: 'x'.repeat(2001),
        ...window(),
      } as never),
    ).rejects.toThrow('Description is too long');
  });

  it('rejects bookings that exceed room capacity', async () => {
    const c = await seed();
    // A 1-seat room: organizer + any single attendee already overflows.
    const tinyRoomId = await asAdmin(c).mutation(api.meetingRooms.createRoom, {
      organizationId: c.organizationId,
      name: 'Phone Booth',
      capacity: 1,
      amenities: [],
    } as never);
    await expect(
      asEmp(c).mutation(api.meetingRooms.bookRoom, {
        roomId: tinyRoomId,
        title: 'Too many',
        attendeeIds: [c.peerId],
        ...window(6 * HOUR),
      } as never),
    ).rejects.toThrow('Too many participants');
  });

  it('rejects an invalid range (end before start)', async () => {
    const c = await seed();
    await expect(
      asEmp(c).mutation(api.meetingRooms.bookRoom, {
        roomId: c.roomId,
        title: 'Backwards',
        startTime: now + 2 * HOUR,
        endTime: now + HOUR,
      } as never),
    ).rejects.toThrow('End time must be after start time');
  });

  it('rejects bookings in the past', async () => {
    const c = await seed();
    await expect(
      asEmp(c).mutation(api.meetingRooms.bookRoom, {
        roomId: c.roomId,
        title: 'Past',
        startTime: now - 2 * HOUR,
        endTime: now - HOUR,
      } as never),
    ).rejects.toThrow('Cannot book a room in the past');
  });

  it('rejects bookings too far in the future', async () => {
    const c = await seed();
    await expect(
      asEmp(c).mutation(api.meetingRooms.bookRoom, {
        roomId: c.roomId,
        title: 'Far',
        startTime: now + 366 * 24 * HOUR,
        endTime: now + 366 * 24 * HOUR + HOUR,
      } as never),
    ).rejects.toThrow('Booking is too far in the future');
  });
});

// ── updateBooking: attendee sync + field logging ────────────────────────────
describe('updateBooking', () => {
  it('syncs attendee rows when the roster changes', async () => {
    const c = await seed();
    const bookingId = await createBooking(c); // attendee: peer (employee is organizer)
    await asEmp(c).mutation(api.meetingRooms.updateBooking, {
      bookingId,
      attendeeIds: [c.peerId, c.adminId],
    } as never);
    const rows = await c.t.run((ctx) =>
      ctx.db
        .query('roomBookingAttendees')
        .withIndex('by_booking', (q) => q.eq('bookingId', bookingId))
        .collect(),
    );
    const active = rows.filter((r) => !r.removedAt);
    expect(active).toHaveLength(2);
    expect(active.map((r) => r.userId)).toContain(c.adminId);
  });

  it('removes attendee rows no longer on the roster', async () => {
    const c = await seed();
    const bookingId = await createBooking(c); // attendee: peer
    await asEmp(c).mutation(api.meetingRooms.updateBooking, {
      bookingId,
      attendeeIds: [],
    } as never);
    const rows = await c.t.run((ctx) =>
      ctx.db
        .query('roomBookingAttendees')
        .withIndex('by_booking', (q) => q.eq('bookingId', bookingId))
        .collect(),
    );
    const peerRow = rows.find((r) => r.userId === c.peerId);
    expect(peerRow?.removedAt).toBeGreaterThan(0);
    expect(peerRow?.removedBy).toBe(c.employeeId);
  });

  it('rejects a reschedule into a busy slot', async () => {
    const c = await seed();
    await createBooking(c); // occupies window()
    const second = await asEmp(c).mutation(api.meetingRooms.bookRoom, {
      roomId: c.roomId,
      title: 'Second',
      ...window(2 * HOUR),
    } as never);
    await expect(
      asEmp(c).mutation(api.meetingRooms.updateBooking, {
        bookingId: second,
        startTime: now + HOUR,
        endTime: now + 2 * HOUR,
      } as never),
    ).rejects.toThrow('Room is already booked for the new time');
  });

  it('logs updated events when the title or description changes', async () => {
    const c = await seed();
    const bookingId = await createBooking(c);
    await asEmp(c).mutation(api.meetingRooms.updateBooking, {
      bookingId,
      title: 'Renamed sync',
      description: 'New agenda',
    } as never);
    const events = await c.t.run((ctx) =>
      ctx.db
        .query('roomBookingEvents')
        .withIndex('by_booking', (q) => q.eq('bookingId', bookingId))
        .collect(),
    );
    expect(events.some((e) => e.type === 'updated')).toBe(true);
    const updated = events.find((e) => e.type === 'updated');
    expect(updated?.note).toContain('title');
    expect(updated?.note).toContain('description');
  });

  it('rejects capacity overflow after an attendee change', async () => {
    const c = await seed();
    // A 2-seat room: organizer + 2 attendees overflows on the attendee change.
    const smallRoomId = await asAdmin(c).mutation(api.meetingRooms.createRoom, {
      organizationId: c.organizationId,
      name: 'Team Pod',
      capacity: 2,
      amenities: [],
    } as never);
    const bookingId = await asEmp(c).mutation(api.meetingRooms.bookRoom, {
      roomId: smallRoomId,
      title: 'Pod sync',
      attendeeIds: [c.peerId],
      ...window(8 * HOUR),
    } as never);
    await expect(
      asEmp(c).mutation(api.meetingRooms.updateBooking, {
        bookingId,
        attendeeIds: [c.peerId, c.adminId],
      } as never),
    ).rejects.toThrow('Too many participants');
  });
});
