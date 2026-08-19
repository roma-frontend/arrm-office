/**
 * Integration tests for convex/calendarEvents — the free-form calendar events
 * and their meeting-room reservations, run against convex-test's in-memory
 * database with the real schema.
 *
 * Covers: create (auth, cross-org denial, title trim, room reservation in the
 * same transaction, room-busy rollback), update (organizer/admin rules, room
 * re-booking with old-reservation release), getByOrganization (scoping +
 * room enrichment) and remove (room release, RBAC, missing event).
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './calendarEvents.ts': () => import('../../convex/calendarEvents'),
  './meetingRooms.ts': () => import('../../convex/meetingRooms'),
  './lib/getAuthCaller.ts': () => import('../../convex/lib/getAuthCaller'),
  './lib/auth.ts': () => import('../../convex/lib/auth'),
  './lib/notify.ts': () => import('../../convex/lib/notify'),
  './pagination.ts': () => import('../../convex/pagination'),
} as unknown as Record<string, () => Promise<unknown>>;

type Ctx = Awaited<ReturnType<typeof seed>>;

const EVENT = {
  organizationId: undefined as unknown as Id<'organizations'>,
  title: 'Team sync',
  date: '2026-09-01',
  startTime: '10:00',
  endTime: '11:00',
  allDay: false,
  location: 'HQ / 3F',
  description: 'Weekly planning',
  category: 'meeting',
  reminder: '30m',
} as const;

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
      plan: 'professional',
      isActive: true,
      createdBySuperadmin: false,
      employeeLimit: 100,
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
    const colleagueId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Colleague',
      email: 'colleague@acme.test',
      role: 'employee',
    });
    const otherAdminId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId: otherOrgId,
      name: 'Other Admin',
      email: 'other@acme.test',
      role: 'admin',
    });

    return { organizationId, otherOrgId, adminId, employeeId, colleagueId, otherAdminId };
  });
  return { t, ...ids };
}

const asAdmin = (c: Ctx) => c.t.withIdentity({ email: 'admin@acme.test' });
const asEmployee = (c: Ctx) => c.t.withIdentity({ email: 'employee@acme.test' });
const asOther = (c: Ctx) => c.t.withIdentity({ email: 'other@acme.test' });

function eventArgs(c: Ctx, overrides: Record<string, unknown> = {}) {
  return { ...EVENT, organizationId: c.organizationId, ...overrides };
}

async function insertRoom(
  c: Ctx,
  overrides: Record<string, unknown> = {},
): Promise<Id<'meetingRooms'>> {
  return await c.t.run(async (ctx) =>
    ctx.db.insert('meetingRooms', {
      organizationId: c.organizationId,
      name: 'Room A',
      capacity: 10,
      amenities: ['projector'],
      isActive: true,
      createdBy: c.adminId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    } as never),
  );
}

/** A booking window in the near future, within the 5min–12h duration rules. */
function window(minFromNow = 60 * 60 * 1000, length = 60 * 60 * 1000) {
  const start = Date.now() + minFromNow;
  return { roomStartTime: start, roomEndTime: start + length };
}

// ── create ───────────────────────────────────────────────────────────────────
describe('calendarEvents.create', () => {
  it('rejects unauthenticated callers', async () => {
    const c = await seed();
    await expect(c.t.mutation(api.calendarEvents.create, eventArgs(c))).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('rejects events for a different organization', async () => {
    const c = await seed();
    await expect(
      asAdmin(c).mutation(
        api.calendarEvents.create,
        eventArgs(c, { organizationId: c.otherOrgId }),
      ),
    ).rejects.toThrow('Access denied: different organization');
  });

  it('rejects a blank title', async () => {
    const c = await seed();
    await expect(
      asAdmin(c).mutation(api.calendarEvents.create, eventArgs(c, { title: '   ' })),
    ).rejects.toThrow('Title is required');
  });

  it('trims the title and persists the event', async () => {
    const c = await seed();
    const id = await asAdmin(c).mutation(
      api.calendarEvents.create,
      eventArgs(c, { title: '  Team sync  ' }),
    );

    await c.t.run(async (ctx) => {
      const event = await ctx.db.get(id as Id<'calendarEvents'>);
      expect(event?.title).toBe('Team sync');
      expect(event?.createdBy).toBe(c.adminId);
      expect(event?.organizationId).toBe(c.organizationId);
      expect(event?.roomId).toBeUndefined();
      expect(event?.roomBookingId).toBeUndefined();
    });
  });

  it('reserves a room inside the same mutation', async () => {
    const c = await seed();
    const roomId = await insertRoom(c);
    const id = await asAdmin(c).mutation(
      api.calendarEvents.create,
      eventArgs(c, { roomId, attendeeIds: [c.employeeId], ...window() }),
    );

    await c.t.run(async (ctx) => {
      const event = await ctx.db.get(id as Id<'calendarEvents'>);
      expect(event?.roomId).toBe(roomId);
      const booking = event?.roomBookingId
        ? await ctx.db.get(event.roomBookingId as Id<'roomBookings'>)
        : null;
      expect(booking?.status).toBe('confirmed');
      expect(booking?.organizerId).toBe(c.adminId);
    });
  });

  it('aborts without an orphan event when the room is busy', async () => {
    const c = await seed();
    const roomId = await insertRoom(c);
    const w = window();

    // First event takes the window.
    await asAdmin(c).mutation(api.calendarEvents.create, eventArgs(c, { roomId, ...w }));

    // Second event in the same window must fail and leave nothing behind.
    await expect(
      asEmployee(c).mutation(
        api.calendarEvents.create,
        eventArgs(c, { roomId, title: 'Conflict', ...w }),
      ),
    ).rejects.toThrow('ROOM_BUSY');

    const events = await c.t.run((ctx) => ctx.db.query('calendarEvents').collect());
    expect(events).toHaveLength(1);
    const bookings = await c.t.run((ctx) => ctx.db.query('roomBookings').collect());
    expect(bookings).toHaveLength(1);
  });

  it('stores the guest list and derives the names from it', async () => {
    const c = await seed();
    const id = await asAdmin(c).mutation(
      api.calendarEvents.create,
      eventArgs(c, { attendeeIds: [c.employeeId, c.colleagueId] }),
    );

    await c.t.run(async (ctx) => {
      const event = await ctx.db.get(id as Id<'calendarEvents'>);
      expect(event?.attendeeIds).toEqual([c.employeeId, c.colleagueId]);
      expect(event?.attendees).toEqual(['Employee', 'Colleague']);
    });
  });

  it('drops attendees from another organization and de-duplicates the rest', async () => {
    const c = await seed();
    const id = await asAdmin(c).mutation(
      api.calendarEvents.create,
      eventArgs(c, { attendeeIds: [c.employeeId, c.otherAdminId, c.employeeId] }),
    );

    await c.t.run(async (ctx) => {
      const event = await ctx.db.get(id as Id<'calendarEvents'>);
      expect(event?.attendeeIds).toEqual([c.employeeId]);
      expect(event?.attendees).toEqual(['Employee']);
    });
  });

  it('enforces the room capacity against attendees', async () => {
    const c = await seed();
    const roomId = await insertRoom(c, { capacity: 2 });
    await expect(
      asAdmin(c).mutation(
        api.calendarEvents.create,
        eventArgs(c, {
          roomId,
          attendeeIds: [c.employeeId, c.colleagueId, c.adminId],
          ...window(),
        }),
      ),
    ).rejects.toThrow('capacity');
  });
});

// ── update ───────────────────────────────────────────────────────────────────
describe('calendarEvents.update', () => {
  async function createEvent(c: Ctx, overrides: Record<string, unknown> = {}) {
    return (await asAdmin(c).mutation(
      api.calendarEvents.create,
      eventArgs(c, overrides),
    )) as Id<'calendarEvents'>;
  }

  it('lets the organizer edit their own event', async () => {
    const c = await seed();
    const id = await createEvent(c);
    const res = await asAdmin(c).mutation(api.calendarEvents.update, {
      id,
      title: '  Renamed  ',
      date: '2026-09-02',
      startTime: '14:00',
      endTime: '15:00',
      allDay: false,
      category: 'meeting',
      reminder: '1h',
    });

    expect(res).toEqual({ success: true });
    await c.t.run(async (ctx) => {
      const event = await ctx.db.get(id);
      expect(event?.title).toBe('Renamed');
      expect(event?.date).toBe('2026-09-02');
    });
  });

  it('keeps the guest list the caller sends back and can clear it', async () => {
    const c = await seed();
    const id = await createEvent(c, { attendeeIds: [c.employeeId, c.colleagueId] });

    const base = {
      id,
      title: 'Team sync',
      date: '2026-09-01',
      startTime: '10:00',
      endTime: '11:00',
      allDay: false,
      category: 'meeting',
      reminder: '1h',
    };

    // Editing anything else must leave the roster alone.
    await asAdmin(c).mutation(api.calendarEvents.update, {
      ...base,
      title: 'Renamed',
      attendeeIds: [c.employeeId, c.colleagueId],
    });
    await c.t.run(async (ctx) => {
      const event = await ctx.db.get(id);
      expect(event?.attendeeIds).toEqual([c.employeeId, c.colleagueId]);
      expect(event?.attendees).toEqual(['Employee', 'Colleague']);
    });

    // Removing everybody is a real edit, not an omission.
    await asAdmin(c).mutation(api.calendarEvents.update, { ...base, attendeeIds: [] });
    await c.t.run(async (ctx) => {
      const event = await ctx.db.get(id);
      expect(event?.attendeeIds).toBeUndefined();
      expect(event?.attendees).toBeUndefined();
    });
  });

  it('blocks a plain employee from editing someone elses event', async () => {
    const c = await seed();
    const id = await createEvent(c);
    await expect(
      asEmployee(c).mutation(api.calendarEvents.update, {
        id,
        title: 'Hijack',
        date: '2026-09-02',
        startTime: '14:00',
        endTime: '15:00',
        allDay: false,
        category: 'meeting',
        reminder: '1h',
      }),
    ).rejects.toThrow('Only the organizer or an admin can change this event');
  });

  it('lets an admin of the same org edit someone elses event', async () => {
    const c = await seed();
    const id = (await asEmployee(c).mutation(
      api.calendarEvents.create,
      eventArgs(c, { title: 'Emp event' }),
    )) as Id<'calendarEvents'>;

    const res = await asAdmin(c).mutation(api.calendarEvents.update, {
      id,
      title: 'Fixed by admin',
      date: '2026-09-02',
      startTime: '14:00',
      endTime: '15:00',
      allDay: false,
      category: 'meeting',
      reminder: '1h',
    });
    expect(res).toEqual({ success: true });
  });

  it('throws for a missing event', async () => {
    const c = await seed();
    const ghostId = await c.t.run(async (ctx) => {
      const id = await ctx.db.insert('calendarEvents', {
        organizationId: c.organizationId,
        createdBy: c.adminId,
        title: 'temp',
        date: '2026-09-01',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        category: 'meeting',
        reminder: '30m',
        createdAt: Date.now(),
      } as never);
      await ctx.db.delete(id);
      return id;
    });
    await expect(
      asAdmin(c).mutation(api.calendarEvents.update, {
        id: ghostId,
        title: 'x',
        date: '2026-09-01',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        category: 'meeting',
        reminder: '30m',
      }),
    ).rejects.toThrow('Event not found');
  });

  it('blocks a cross-org admin from updating the event', async () => {
    const c = await seed();
    const id = await createEvent(c);
    await expect(
      asOther(c).mutation(api.calendarEvents.update, {
        id,
        title: 'Meddling',
        date: '2026-09-02',
        startTime: '14:00',
        endTime: '15:00',
        allDay: false,
        category: 'meeting',
        reminder: '1h',
      }),
    ).rejects.toThrow('Access denied: different organization');
  });

  it('re-books the room on reschedule and releases the old reservation', async () => {
    const c = await seed();
    const roomId = await insertRoom(c);
    const first = window();
    const id = await createEvent(c, { roomId, ...first });

    const second = window(3 * 60 * 60 * 1000, 60 * 60 * 1000);
    await asAdmin(c).mutation(api.calendarEvents.update, {
      id,
      title: 'Moved',
      date: '2026-09-01',
      startTime: '11:00',
      endTime: '12:00',
      allDay: false,
      category: 'meeting',
      reminder: '30m',
      roomId,
      ...second,
    });

    await c.t.run(async (ctx) => {
      const event = await ctx.db.get(id);
      const bookings = await ctx.db.query('roomBookings').collect();
      // Old reservation cancelled, new one confirmed.
      const cancelled = bookings.filter((b) => b.status === 'cancelled');
      const confirmed = bookings.filter((b) => b.status === 'confirmed');
      expect(cancelled).toHaveLength(1);
      expect(confirmed).toHaveLength(1);
      expect(event?.roomBookingId).toBe(confirmed[0]?._id);
    });
  });

  it('preserves the old reservation when a re-booking conflicts', async () => {
    const c = await seed();
    const roomId = await insertRoom(c);
    const first = window();
    const id = await createEvent(c, { roomId, ...first });

    // Another event occupies a new window, so moving there must fail.
    const taken = window(5 * 60 * 60 * 1000, 60 * 60 * 1000);
    await asEmployee(c).mutation(
      api.calendarEvents.create,
      eventArgs(c, { roomId, title: 'Occupier', ...taken }),
    );

    await expect(
      asAdmin(c).mutation(api.calendarEvents.update, {
        id,
        title: 'Trying to move',
        date: '2026-09-01',
        startTime: '11:00',
        endTime: '12:00',
        allDay: false,
        category: 'meeting',
        reminder: '30m',
        roomId,
        ...taken,
      }),
    ).rejects.toThrow('ROOM_BUSY');

    // The failed re-booking must not have released the original reservation.
    await c.t.run(async (ctx) => {
      const event = await ctx.db.get(id);
      const booking = event?.roomBookingId
        ? await ctx.db.get(event.roomBookingId as Id<'roomBookings'>)
        : null;
      expect(booking?.status).toBe('confirmed');
    });
  });

  it('rejects a room without a reservation window', async () => {
    const c = await seed();
    const roomId = await insertRoom(c);
    await expect(
      asAdmin(c).mutation(api.calendarEvents.create, eventArgs(c, { roomId })),
    ).rejects.toThrow('Room reservation window is missing');
  });

  it('re-books the same room without clashing with its own reservation', async () => {
    const c = await seed();
    const roomId = await insertRoom(c);
    const w = window();
    const id = await createEvent(c, { roomId, ...w });

    // Keep the same window — the re-book must exclude its own reservation.
    const res = await asAdmin(c).mutation(api.calendarEvents.update, {
      id,
      title: 'Renamed, same room',
      date: '2026-09-01',
      startTime: '10:00',
      endTime: '11:00',
      allDay: false,
      category: 'meeting',
      reminder: '30m',
      roomId,
      ...w,
    });
    expect(res).toEqual({ success: true });

    await c.t.run(async (ctx) => {
      const bookings = await ctx.db.query('roomBookings').collect();
      const confirmed = bookings.filter((b) => b.status === 'confirmed');
      const cancelled = bookings.filter((b) => b.status === 'cancelled');
      expect(confirmed).toHaveLength(1);
      expect(cancelled).toHaveLength(1);
    });
  });

  it('releases the room when the update drops it', async () => {
    const c = await seed();
    const roomId = await insertRoom(c);
    const id = await createEvent(c, { roomId, ...window() });

    await asAdmin(c).mutation(api.calendarEvents.update, {
      id,
      title: 'No room',
      date: '2026-09-01',
      startTime: '10:00',
      endTime: '11:00',
      allDay: false,
      category: 'meeting',
      reminder: '30m',
    });

    await c.t.run(async (ctx) => {
      const event = await ctx.db.get(id);
      expect(event?.roomId).toBeUndefined();
      expect(event?.roomBookingId).toBeUndefined();
      const bookings = await ctx.db.query('roomBookings').collect();
      expect(bookings.filter((b) => b.status === 'cancelled')).toHaveLength(1);
    });
  });
});

// ── getByOrganization ────────────────────────────────────────────────────────
describe('calendarEvents.getByOrganization', () => {
  it('returns an empty list for unauthenticated callers', async () => {
    const c = await seed();
    const res = await c.t.query(api.calendarEvents.getByOrganization, {
      organizationId: c.organizationId,
    });
    expect(res).toEqual([]);
  });

  it('returns an empty list for a foreign organization', async () => {
    const c = await seed();
    await asAdmin(c).mutation(api.calendarEvents.create, eventArgs(c));
    const res = await asAdmin(c).query(api.calendarEvents.getByOrganization, {
      organizationId: c.otherOrgId,
    });
    expect(res).toEqual([]);
  });

  it('lists org events and enriches room name/color', async () => {
    const c = await seed();
    const roomId = await insertRoom(c, { name: 'Boardroom', color: '#ff0000' });
    await asEmployee(c).mutation(
      api.calendarEvents.create,
      eventArgs(c, { title: 'With room', roomId, ...window() }),
    );
    await asEmployee(c).mutation(api.calendarEvents.create, eventArgs(c, { title: 'No room' }));

    const res = await asEmployee(c).query(api.calendarEvents.getByOrganization, {
      organizationId: c.organizationId,
    });
    expect(res).toHaveLength(2);

    const withRoom = res.find((e) => e.title === 'With room');
    const noRoom = res.find((e) => e.title === 'No room');
    expect(withRoom?.roomName).toBe('Boardroom');
    expect(withRoom?.roomColor).toBe('#ff0000');
    expect(noRoom?.roomName).toBeUndefined();
    expect(noRoom?.roomColor).toBeUndefined();
  });

  it('exposes a deleted room as undefined enrichment', async () => {
    const c = await seed();
    const roomId = await insertRoom(c);
    const id = await asEmployee(c).mutation(
      api.calendarEvents.create,
      eventArgs(c, { roomId, ...window() }),
    );
    await c.t.run(async (ctx) => {
      await ctx.db.delete(roomId);
    });

    const res = await asAdmin(c).query(api.calendarEvents.getByOrganization, {
      organizationId: c.organizationId,
    });
    expect(res.find((e) => e._id === id)?.roomName).toBeUndefined();
  });
});

// ── remove ───────────────────────────────────────────────────────────────────
describe('calendarEvents.remove', () => {
  it('deletes a room-less event', async () => {
    const c = await seed();
    const id = await asEmployee(c).mutation(
      api.calendarEvents.create,
      eventArgs(c, { title: 'temp' }),
    );
    const res = await asEmployee(c).mutation(api.calendarEvents.remove, { id });
    expect(res).toEqual({ success: true, releasedRoom: false });
  });

  it('releases the room reservation when the event is deleted', async () => {
    const c = await seed();
    const roomId = await insertRoom(c);
    const id = await asEmployee(c).mutation(
      api.calendarEvents.create,
      eventArgs(c, { roomId, ...window() }),
    );

    const res = await asEmployee(c).mutation(api.calendarEvents.remove, { id });
    expect(res).toEqual({ success: true, releasedRoom: true });

    await c.t.run(async (ctx) => {
      expect(await ctx.db.get(id)).toBeNull();
      const bookings = await ctx.db.query('roomBookings').collect();
      expect(bookings.filter((b) => b.status === 'cancelled')).toHaveLength(1);
    });
  });

  it('blocks deleting another org event', async () => {
    const c = await seed();
    const id = (await asAdmin(c).mutation(
      api.calendarEvents.create,
      eventArgs(c),
    )) as Id<'calendarEvents'>;
    await expect(asOther(c).mutation(api.calendarEvents.remove, { id })).rejects.toThrow(
      'Access denied: different organization',
    );
  });

  it('blocks a plain employee from deleting someone elses event', async () => {
    const c = await seed();
    const id = (await asAdmin(c).mutation(
      api.calendarEvents.create,
      eventArgs(c),
    )) as Id<'calendarEvents'>;
    await expect(asEmployee(c).mutation(api.calendarEvents.remove, { id })).rejects.toThrow(
      'Only the organizer or an admin can delete this event',
    );
  });

  it('returns success for an already-missing event', async () => {
    const c = await seed();
    const ghostId = await c.t.run(async (ctx) => {
      const id = await ctx.db.insert('calendarEvents', {
        organizationId: c.organizationId,
        createdBy: c.adminId,
        title: 'temp',
        date: '2026-09-01',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        category: 'meeting',
        reminder: '30m',
        createdAt: Date.now(),
      } as never);
      await ctx.db.delete(id);
      return id;
    });
    const res = await asAdmin(c).mutation(api.calendarEvents.remove, { id: ghostId });
    expect(res).toEqual({ success: true, releasedRoom: false });
  });
});
