/**
 * Tests for meeting-room attendee tracking: the RSVP mutation, the tracking
 * query and the activity log it feeds.
 *
 * The rules being pinned down:
 *   - only invited people answer, only for themselves, and never after the
 *     meeting ended or once it was cancelled;
 *   - the organizer does not RSVP — they are attending by definition;
 *   - bookings created before tracking existed still work: a missing attendee
 *     row reads as "no response" and is materialized on the first answer;
 *   - the activity log is management information — the organizer and staff see
 *     it, a plain attendee does not.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  action: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
  internalQuery: ({ handler, args }: any) => ({ handler, args }),
  internalAction: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
}));

type Handler = (ctx: any, args: any) => Promise<any>;
type Row = Record<string, any>;

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const ROOM_ID = 'room_1';
const BOOKING_ID = 'booking_1';
const ORGANIZER = 'user_organizer';
const ATTENDEE = 'user_attendee';
const OTHER = 'user_other';
const ADMIN = 'user_admin';

const HOUR = 60 * 60 * 1000;

let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let respondToBooking: Handler;
let getBookingTracking: Handler;
let checkInBooking: Handler;
let cancelBooking: Handler;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  mockIsSuperadmin.mockReturnValue(false);
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/meetingRooms');
    respondToBooking = mod.respondToBooking.handler;
    getBookingTracking = mod.getBookingTracking.handler;
    checkInBooking = mod.checkInBooking.handler;
    cancelBooking = mod.cancelBooking.handler;
  });
});

type Role = 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';

function login(id: string, role: Role = 'employee', org: string | undefined = ORG_A) {
  mockGetAuthCaller.mockResolvedValue({
    _id: id,
    role,
    email: `${id}@example.com`,
    organizationId: org,
    name: id,
  });
}

/**
 * Minimal in-memory Convex db. Index range bounds (gte/lt) are accepted and
 * ignored — the tests keep their fixtures inside one window, and equality
 * filters are what the tracking code relies on.
 */
function makeDb(tables: Record<string, Row[]>) {
  let seq = 0;
  const db = {
    get: jest.fn(async (id: string) => {
      for (const rows of Object.values(tables)) {
        const found = rows.find((row) => row._id === id);
        if (found) return found;
      }
      return null;
    }),
    insert: jest.fn(async (table: string, value: Row) => {
      const _id = `${table}_${++seq}`;
      (tables[table] ??= []).push({ _id, ...value });
      return _id;
    }),
    patch: jest.fn(async (id: string, patch: Row) => {
      for (const rows of Object.values(tables)) {
        const found = rows.find((row) => row._id === id);
        if (found) Object.assign(found, patch);
      }
    }),
    delete: jest.fn(async (id: string) => {
      for (const [table, rows] of Object.entries(tables)) {
        tables[table] = rows.filter((row) => row._id !== id);
      }
    }),
    query: jest.fn((table: string) => {
      const filters: Row = {};
      const builder: any = {
        eq: (field: string, value: unknown) => {
          filters[field] = value;
          return builder;
        },
        gte: () => builder,
        gt: () => builder,
        lte: () => builder,
        lt: () => builder,
      };
      const rows = () =>
        (tables[table] ?? []).filter((row) =>
          Object.entries(filters).every(([field, value]) => row[field] === value),
        );
      const chain: any = {
        withIndex: (_name: string, fn?: (q: any) => unknown) => {
          fn?.(builder);
          return chain;
        },
        order: () => chain,
        take: async () => rows(),
        collect: async () => rows(),
        first: async () => rows()[0] ?? null,
        unique: async () => rows()[0] ?? null,
      };
      return chain;
    }),
  };
  return { db, tables };
}

function fixtures(over: { booking?: Row; attendees?: Row[]; events?: Row[] } = {}) {
  const now = Date.now();
  const booking = {
    _id: BOOKING_ID,
    organizationId: ORG_A,
    roomId: ROOM_ID,
    title: 'Midyear review',
    startTime: now + HOUR,
    endTime: now + 2 * HOUR,
    organizerId: ORGANIZER,
    attendeeIds: [ATTENDEE],
    externalAttendees: ['Ministry of Finance'],
    status: 'confirmed',
    createdAt: now - HOUR,
    updatedAt: now - HOUR,
    ...over.booking,
  };
  return makeDb({
    roomBookings: [booking],
    meetingRooms: [
      { _id: ROOM_ID, organizationId: ORG_A, name: 'Ararat Room', capacity: 16, isActive: true },
    ],
    users: [
      { _id: ORGANIZER, name: 'Roman', email: 'roman@example.com', organizationId: ORG_A },
      {
        _id: ATTENDEE,
        name: 'Cane Corso',
        email: 'cane@example.com',
        organizationId: ORG_A,
        position: 'Analyst',
        department: 'Finance',
      },
      { _id: OTHER, name: 'Petros', email: 'petros@example.com', organizationId: ORG_A },
      { _id: ADMIN, name: 'Admin', email: 'admin@example.com', organizationId: ORG_A },
    ],
    roomBookingAttendees: over.attendees ?? [],
    roomBookingEvents: over.events ?? [],
    notifications: [],
  });
}

// ── RSVP ─────────────────────────────────────────────────────────────────────
describe('respondToBooking', () => {
  it('records an answer for an invited attendee and logs it', async () => {
    const ctx = fixtures();
    login(ATTENDEE);

    await respondToBooking(ctx, {
      bookingId: BOOKING_ID,
      response: 'accepted',
      comment: 'joining remotely',
    });

    const row = ctx.tables.roomBookingAttendees[0];
    expect(row).toEqual(
      expect.objectContaining({
        userId: ATTENDEE,
        bookingId: BOOKING_ID,
        response: 'accepted',
        comment: 'joining remotely',
      }),
    );
    expect(row.respondedAt).toEqual(expect.any(Number));

    const event = ctx.tables.roomBookingEvents[0];
    expect(event).toEqual(
      expect.objectContaining({
        type: 'responded',
        response: 'accepted',
        actorName: ATTENDEE,
        targetUserId: ATTENDEE,
      }),
    );
  });

  it('notifies the organizer, not the other attendees', async () => {
    const ctx = fixtures();
    login(ATTENDEE);

    await respondToBooking(ctx, { bookingId: BOOKING_ID, response: 'declined' });

    expect(ctx.tables.notifications).toHaveLength(1);
    expect(ctx.tables.notifications[0]).toEqual(
      expect.objectContaining({ userId: ORGANIZER, organizationId: ORG_A }),
    );
  });

  it('updates an existing answer instead of adding a second row', async () => {
    const ctx = fixtures({
      attendees: [
        {
          _id: 'att_1',
          organizationId: ORG_A,
          bookingId: BOOKING_ID,
          roomId: ROOM_ID,
          userId: ATTENDEE,
          response: 'accepted',
          respondedAt: 1,
          invitedAt: 1,
          invitedBy: ORGANIZER,
        },
      ],
    });
    login(ATTENDEE);

    await respondToBooking(ctx, { bookingId: BOOKING_ID, response: 'tentative' });

    expect(ctx.tables.roomBookingAttendees).toHaveLength(1);
    expect(ctx.tables.roomBookingAttendees[0].response).toBe('tentative');
  });

  it('refuses the organizer', async () => {
    const ctx = fixtures();
    login(ORGANIZER);

    await expect(
      respondToBooking(ctx, { bookingId: BOOKING_ID, response: 'accepted' }),
    ).rejects.toThrow(/organizer does not need to respond/);
  });

  it('refuses somebody who was not invited', async () => {
    const ctx = fixtures();
    login(OTHER);

    await expect(
      respondToBooking(ctx, { bookingId: BOOKING_ID, response: 'accepted' }),
    ).rejects.toThrow(/Only invited participants/);
  });

  it('refuses a caller from another organization', async () => {
    const ctx = fixtures();
    login(ATTENDEE, 'admin', ORG_B);

    await expect(
      respondToBooking(ctx, { bookingId: BOOKING_ID, response: 'accepted' }),
    ).rejects.toThrow(/different organization/);
  });

  it('refuses a cancelled booking and a meeting that already ended', async () => {
    const cancelled = fixtures({ booking: { status: 'cancelled' } });
    login(ATTENDEE);
    await expect(
      respondToBooking(cancelled, { bookingId: BOOKING_ID, response: 'accepted' }),
    ).rejects.toThrow(/cancelled/);

    const past = fixtures({
      booking: { startTime: Date.now() - 3 * HOUR, endTime: Date.now() - 2 * HOUR },
    });
    login(ATTENDEE);
    await expect(
      respondToBooking(past, { bookingId: BOOKING_ID, response: 'accepted' }),
    ).rejects.toThrow(/already ended/);
  });
});

// ── Tracking view ────────────────────────────────────────────────────────────
describe('getBookingTracking', () => {
  it('counts a booking with no attendee rows as awaiting answers', async () => {
    const ctx = fixtures();
    login(ORGANIZER);

    const tracking = await getBookingTracking(ctx, { bookingId: BOOKING_ID });

    expect(tracking.counts).toEqual({
      total: 1,
      accepted: 0,
      tentative: 0,
      declined: 0,
      needsAction: 1,
      checkedIn: 0,
    });
    expect(tracking.attendees[0]).toEqual(
      expect.objectContaining({ userId: ATTENDEE, name: 'Cane Corso', response: 'needs_action' }),
    );
  });

  it('surfaces answers, notes, check-ins and the organizer', async () => {
    const ctx = fixtures({
      attendees: [
        {
          _id: 'att_1',
          organizationId: ORG_A,
          bookingId: BOOKING_ID,
          roomId: ROOM_ID,
          userId: ATTENDEE,
          response: 'accepted',
          respondedAt: 1234,
          comment: 'on my way',
          checkedInAt: 5678,
          invitedAt: 1,
          invitedBy: ORGANIZER,
        },
      ],
    });
    login(ORGANIZER);

    const tracking = await getBookingTracking(ctx, { bookingId: BOOKING_ID });

    expect(tracking.counts).toEqual(
      expect.objectContaining({ accepted: 1, needsAction: 0, checkedIn: 1 }),
    );
    expect(tracking.attendees[0]).toEqual(
      expect.objectContaining({ respondedAt: 1234, comment: 'on my way', checkedInAt: 5678 }),
    );
    expect(tracking.organizer).toEqual(
      expect.objectContaining({ userId: ORGANIZER, name: 'Roman' }),
    );
    expect(tracking.booking.externalAttendees).toEqual(['Ministry of Finance']);
  });

  it('orders the roster accepted → tentative → declined → no answer', async () => {
    const row = (id: string, userId: string, response: string) => ({
      _id: id,
      organizationId: ORG_A,
      bookingId: BOOKING_ID,
      roomId: ROOM_ID,
      userId,
      response,
      invitedAt: 1,
      invitedBy: ORGANIZER,
    });
    const ctx = fixtures({
      booking: { attendeeIds: [ATTENDEE, OTHER, ADMIN] },
      attendees: [
        row('a1', ATTENDEE, 'declined'),
        row('a2', OTHER, 'accepted'),
        row('a3', ADMIN, 'tentative'),
      ],
    });
    login(ORGANIZER);

    const tracking = await getBookingTracking(ctx, { bookingId: BOOKING_ID });

    expect(tracking.attendees.map((a: Row) => a.response)).toEqual([
      'accepted',
      'tentative',
      'declined',
    ]);
  });

  it('excludes people who were uninvited', async () => {
    const ctx = fixtures({
      booking: { attendeeIds: [] },
      attendees: [
        {
          _id: 'att_1',
          organizationId: ORG_A,
          bookingId: BOOKING_ID,
          roomId: ROOM_ID,
          userId: ATTENDEE,
          response: 'accepted',
          invitedAt: 1,
          invitedBy: ORGANIZER,
          removedAt: 2,
        },
      ],
    });
    login(ORGANIZER);

    const tracking = await getBookingTracking(ctx, { bookingId: BOOKING_ID });

    expect(tracking.attendees).toEqual([]);
    expect(tracking.counts.total).toBe(0);
  });

  it('hides the activity log from a plain attendee and shows it to staff', async () => {
    const events = [
      {
        _id: 'ev_1',
        organizationId: ORG_A,
        bookingId: BOOKING_ID,
        roomId: ROOM_ID,
        type: 'created',
        actorName: 'Roman',
        createdAt: 1,
      },
    ];

    const asAttendee = fixtures({ events });
    login(ATTENDEE);
    const attendeeView = await getBookingTracking(asAttendee, { bookingId: BOOKING_ID });
    expect(attendeeView.timelineVisible).toBe(false);
    expect(attendeeView.timeline).toEqual([]);
    expect(attendeeView.viewer).toEqual(
      expect.objectContaining({ isAttendee: true, isOrganizer: false, canRespond: true }),
    );

    const asAdmin = fixtures({ events });
    login(ADMIN, 'admin');
    const adminView = await getBookingTracking(asAdmin, { bookingId: BOOKING_ID });
    expect(adminView.timelineVisible).toBe(true);
    expect(adminView.timeline).toHaveLength(1);
    expect(adminView.viewer).toEqual(
      expect.objectContaining({ canManage: true, isStaff: true, canRespond: false }),
    );

    const asSupervisor = fixtures({ events });
    login(OTHER, 'supervisor');
    const supervisorView = await getBookingTracking(asSupervisor, { bookingId: BOOKING_ID });
    expect(supervisorView.timelineVisible).toBe(true);
  });

  it('returns null across organizations and for anonymous callers', async () => {
    const crossOrg = fixtures();
    login(ADMIN, 'admin', ORG_B);
    await expect(getBookingTracking(crossOrg, { bookingId: BOOKING_ID })).resolves.toBeNull();

    const anonymous = fixtures();
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(getBookingTracking(anonymous, { bookingId: BOOKING_ID })).resolves.toBeNull();
  });
});

// ── Check-in ─────────────────────────────────────────────────────────────────
describe('checkInBooking', () => {
  const inProgress = { startTime: Date.now() - 5 * 60_000, endTime: Date.now() + HOUR };

  it("records an attendee's check-in on their own row, not on the booking", async () => {
    const ctx = fixtures({
      booking: inProgress,
      attendees: [
        {
          _id: 'att_1',
          organizationId: ORG_A,
          bookingId: BOOKING_ID,
          roomId: ROOM_ID,
          userId: ATTENDEE,
          response: 'accepted',
          invitedAt: 1,
          invitedBy: ORGANIZER,
        },
      ],
    });
    login(ATTENDEE);

    await checkInBooking(ctx, { bookingId: BOOKING_ID });

    expect(ctx.tables.roomBookingAttendees[0].checkedInAt).toEqual(expect.any(Number));
    expect(ctx.tables.roomBookings[0].checkedInAt).toBeUndefined();
    expect(ctx.tables.roomBookingEvents[0]).toEqual(
      expect.objectContaining({ type: 'checked_in', targetUserId: ATTENDEE }),
    );
  });

  it("marks the meeting as happening on the organizer's check-in", async () => {
    const ctx = fixtures({ booking: inProgress });
    login(ORGANIZER);

    await checkInBooking(ctx, { bookingId: BOOKING_ID });

    expect(ctx.tables.roomBookings[0].checkedInAt).toEqual(expect.any(Number));
  });

  it('materializes a row when an attendee checks in on a legacy booking', async () => {
    const ctx = fixtures({ booking: inProgress });
    login(ATTENDEE);

    await checkInBooking(ctx, { bookingId: BOOKING_ID });

    expect(ctx.tables.roomBookingAttendees).toHaveLength(1);
    expect(ctx.tables.roomBookingAttendees[0]).toEqual(
      expect.objectContaining({ userId: ATTENDEE, checkedInAt: expect.any(Number) }),
    );
  });

  it('refuses somebody who is not a participant', async () => {
    const ctx = fixtures({ booking: inProgress });
    login(OTHER);

    await expect(checkInBooking(ctx, { bookingId: BOOKING_ID })).rejects.toThrow(
      /Only participants/,
    );
  });
});

// ── Cancellation is logged ───────────────────────────────────────────────────
describe('cancelBooking', () => {
  it('writes a cancellation entry with the reason', async () => {
    const ctx = fixtures();
    login(ORGANIZER);

    await cancelBooking(ctx, { bookingId: BOOKING_ID, reason: 'moved to Teams' });

    expect(ctx.tables.roomBookings[0]).toEqual(
      expect.objectContaining({ status: 'cancelled', cancelledBy: ORGANIZER }),
    );
    expect(ctx.tables.roomBookingEvents[0]).toEqual(
      expect.objectContaining({ type: 'cancelled', note: 'moved to Teams', actorName: ORGANIZER }),
    );
  });
});
