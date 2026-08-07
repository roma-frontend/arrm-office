/**
 * Tests for convex/meetingRooms.ts — room CRUD, booking lifecycle, RSVP
 * tracking, check-in and the query/enrichment layer.
 *
 * Pattern: convex-tasks-rbac.test.ts — mock `_generated/server`, getAuthCaller,
 * lib/auth and lib/notify; require the module inside jest.isolateModules.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────
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

jest.mock('../../convex/lib/notify', () => ({
  notify: jest.fn(),
}));

// ── Module under test ────────────────────────────────────────────────────────
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockNotify: jest.Mock;

type Handler = (ctx: any, args: any) => Promise<unknown>;
const handlers: Record<string, Handler> = {};
const exported: Record<string, (...args: any[]) => unknown> = {};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  mockNotify = jest.requireMock('../../convex/lib/notify').notify;
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  mockNotify.mockReset();
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/meetingRooms');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      } else if (typeof def === 'function') {
        exported[name] = def as (...args: any[]) => unknown;
      }
    }
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
const ORG_A = 'org-1';
const ORG_B = 'org-2';
const ROOM_ID = 'room_1';
const BOOKING_ID = 'booking_1';
const ADMIN_ID = 'user_admin';
const USER_ID = 'user_1';

function makeCaller(
  role: 'admin' | 'supervisor' | 'superadmin' | 'employee' | 'driver' = 'employee',
  org: string | undefined = ORG_A,
  id: string = USER_ID,
) {
  return { _id: id, role, email: 'caller@example.com', organizationId: org, name: 'Caller' };
}

function roomDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: ROOM_ID,
    organizationId: ORG_A,
    name: 'Conference A',
    description: 'Main room',
    capacity: 10,
    amenities: ['projector', 'tv'],
    color: '#2563eb',
    building: 'HQ',
    floor: '2',
    roomNumber: '201',
    isActive: true,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function bookingDoc(overrides: Record<string, unknown> = {}) {
  const start = Date.now() + 60 * 60 * 1000;
  return {
    _id: BOOKING_ID,
    organizationId: ORG_A,
    roomId: ROOM_ID,
    title: 'Standup',
    description: 'Daily',
    startTime: start,
    endTime: start + 30 * 60 * 1000,
    organizerId: ADMIN_ID,
    attendeeIds: [USER_ID],
    externalAttendees: ['guest@example.com'],
    status: 'confirmed',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function attendeeRow(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'attendee_1',
    organizationId: ORG_A,
    bookingId: BOOKING_ID,
    roomId: ROOM_ID,
    userId: USER_ID,
    response: 'accepted',
    invitedAt: 1_700_000_000_000,
    invitedBy: ADMIN_ID,
    ...overrides,
  };
}

function makeChain() {
  const take = jest.fn().mockResolvedValue([]);
  const first = jest.fn().mockResolvedValue(null);
  const unique = jest.fn().mockResolvedValue(null);
  const tail = {
    order: jest.fn().mockReturnValue({ take }),
    take,
    first,
    unique,
  };
  const withIndex = jest.fn().mockReturnValue(tail);
  return { root: { withIndex, ...tail }, withIndex, order: tail.order, take, first, unique };
}

function makeCtx() {
  const get = jest.fn();
  const insert = jest.fn().mockResolvedValue('new_booking');
  const patch = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(undefined);
  const chains = new Map<string, ReturnType<typeof makeChain>>();
  const db = {
    get,
    insert,
    patch,
    delete: remove,
    query: jest.fn((table: string) => {
      if (!chains.has(table)) chains.set(table, makeChain());
      return chains.get(table)!.root;
    }),
  };
  return { ctx: { db }, get, insert, patch, remove, chains, db };
}

// ── Queries: scoping ─────────────────────────────────────────────────────────
describe('query scoping', () => {
  it('listRooms returns [] for unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();

    const result = await handlers.listRooms(ctx, { organizationId: ORG_A });

    expect(result).toEqual([]);
  });

  it('listRooms returns [] for a caller from a different organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_B, ADMIN_ID));
    const { ctx } = makeCtx();

    const result = await handlers.listRooms(ctx, { organizationId: ORG_A });

    expect(result).toEqual([]);
  });

  it('listRooms returns active rooms sorted by name', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, db } = makeCtx();
    db.query.mockImplementation(() => {
      const ch = makeChain();
      ch.take.mockResolvedValue([
        roomDoc({ name: 'Zebra' }),
        roomDoc({ _id: 'room_2', name: 'Alpha' }),
      ]);
      return ch.root;
    });

    const result = (await handlers.listRooms(ctx, { organizationId: ORG_A })) as any[];

    expect(result.map((r) => r.name)).toEqual(['Alpha', 'Zebra']);
  });

  it('listRooms uses the by_org_active index unless archived are requested', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, db } = makeCtx();
    db.query.mockImplementation(() => {
      const ch = makeChain();
      return ch.root;
    });

    await handlers.listRooms(ctx, { organizationId: ORG_A });
    const withIndexCalls = (db.query as jest.Mock).mock.results[0].value.withIndex.mock.calls;
    expect(withIndexCalls[0][0]).toBe('by_org_active');

    await handlers.listRooms(ctx, { organizationId: ORG_A, includeArchived: true });
    const calls2 = (db.query as jest.Mock).mock.results[1].value.withIndex.mock.calls;
    expect(calls2[0][0]).toBe('by_org');
  });

  it('getRoomsWithBookings returns [] for foreign orgs', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_B, ADMIN_ID));
    const { ctx } = makeCtx();

    const result = await handlers.getRoomsWithBookings(ctx, { organizationId: ORG_A });

    expect(result).toEqual([]);
  });

  it('getRoomsWithBookings enriches rooms with bookings in the window', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, db, get } = makeCtx();
    db.query.mockImplementation((table: string) => {
      const ch = makeChain();
      if (table === 'meetingRooms') {
        ch.take.mockResolvedValue([roomDoc()]);
      } else {
        // roomBookings in window
        ch.take.mockResolvedValue([bookingDoc()]);
      }
      return ch.root;
    });
    get.mockResolvedValue(userDocName('Boss'));

    const result = (await handlers.getRoomsWithBookings(ctx, {
      organizationId: ORG_A,
      from: 0,
      to: 1e15,
    })) as any[];

    expect(result).toHaveLength(1);
    expect(result[0].bookings[0]).toEqual(
      expect.objectContaining({ title: 'Standup', organizerName: 'Boss', attendeeCount: 2 }),
    );
  });

  it('listBookings returns [] for foreign orgs', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_B, ADMIN_ID));
    const { ctx } = makeCtx();

    const result = await handlers.listBookings(ctx, {
      organizationId: ORG_A,
      startTime: 0,
      endTime: 1e15,
    });

    expect(result).toEqual([]);
  });

  it('listBookings filters to confirmed overlapping bookings and enriches them', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, db, get } = makeCtx();
    const start = Date.now() + 60 * 60 * 1000;
    db.query.mockImplementation((table: string) => {
      const ch = makeChain();
      if (table === 'roomBookings') {
        ch.take.mockResolvedValue([
          bookingDoc({ status: 'confirmed' }),
          bookingDoc({ _id: 'b2', status: 'cancelled' }), // filtered
          bookingDoc({
            _id: 'b3',
            startTime: start + 40 * 60 * 1000,
            endTime: start + 41 * 60 * 1000,
          }), // outside window
        ]);
      }
      return ch.root;
    });
    get.mockImplementation((id: string) =>
      id === ROOM_ID ? roomDoc() : id === ADMIN_ID ? userDocName('Boss') : userDocName('Anna'),
    );

    const result = (await handlers.listBookings(ctx, {
      organizationId: ORG_A,
      startTime: start - 1000,
      endTime: start + 30 * 60 * 1000,
    })) as any[];

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({ roomName: 'Conference A', organizerName: 'Boss' }),
    );
    expect(result[0].tracking).toEqual(
      expect.objectContaining({ total: 1, accepted: 0, needsAction: 1 }),
    );
  });

  it('getRoomBookings returns [] for a missing room', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    const result = await handlers.getRoomBookings(ctx, {
      roomId: ROOM_ID,
      startTime: 0,
      endTime: 1e15,
    });

    expect(result).toEqual([]);
  });

  it('getRoomBookings keeps cancelled bookings only when requested', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, db, get } = makeCtx();
    const start = Date.now() + 1000;
    db.query.mockImplementation((table: string) => {
      const ch = makeChain();
      if (table === 'roomBookings') {
        ch.take.mockResolvedValue([
          bookingDoc({ status: 'confirmed' }),
          bookingDoc({ _id: 'b2', status: 'cancelled' }),
        ]);
      }
      return ch.root;
    });
    get.mockImplementation((id: string) =>
      id === ROOM_ID ? roomDoc() : id === ADMIN_ID ? userDocName('Boss') : userDocName('Anna'),
    );

    const withoutCancelled = (await handlers.getRoomBookings(ctx, {
      roomId: ROOM_ID,
      startTime: start - 1000,
      endTime: start + 3600_000,
    })) as any[];
    expect(withoutCancelled).toHaveLength(1);

    const withCancelled = (await handlers.getRoomBookings(ctx, {
      roomId: ROOM_ID,
      startTime: start - 1000,
      endTime: start + 3600_000,
      includeCancelled: true,
    })) as any[];
    expect(withCancelled).toHaveLength(2);
  });

  it('checkAvailability reports busy with the blocking conflict', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, db, get } = makeCtx();
    db.query.mockImplementation((table: string) => {
      const ch = makeChain();
      if (table === 'roomBookings') ch.take.mockResolvedValue([bookingDoc()]);
      return ch.root;
    });
    get.mockImplementation((id: string) =>
      id === ROOM_ID ? roomDoc() : id === ADMIN_ID ? userDocName('Boss') : userDocName('Anna'),
    );

    const result = (await handlers.checkAvailability(ctx, {
      roomId: ROOM_ID,
      startTime: Date.now() + 60 * 60 * 1000,
      endTime: Date.now() + 90 * 60 * 1000,
    })) as any;

    expect(result.available).toBe(false);
    expect(result.conflicts[0]).toEqual(expect.objectContaining({ title: 'Standup' }));
  });

  it('checkAvailability ignores the excluded booking id', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, db, get } = makeCtx();
    db.query.mockImplementation((table: string) => {
      const ch = makeChain();
      if (table === 'roomBookings') ch.take.mockResolvedValue([bookingDoc()]);
      return ch.root;
    });
    get.mockImplementation((id: string) =>
      id === ROOM_ID ? roomDoc() : id === ADMIN_ID ? userDocName('Boss') : userDocName('Anna'),
    );

    const result = (await handlers.checkAvailability(ctx, {
      roomId: ROOM_ID,
      startTime: Date.now() + 60 * 60 * 1000,
      endTime: Date.now() + 90 * 60 * 1000,
      excludeBookingId: BOOKING_ID,
    })) as any;

    expect(result.available).toBe(true);
    expect(result.conflicts).toEqual([]);
  });

  it('checkAvailability is unavailable for invalid ranges', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValue(roomDoc());

    const result = (await handlers.checkAvailability(ctx, {
      roomId: ROOM_ID,
      startTime: 2000,
      endTime: 1000,
    })) as any;

    expect(result.available).toBe(false);
    expect(result.conflicts).toEqual([]);
  });

  it('getBookingTracking returns null for foreign orgs', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_B, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(bookingDoc({ organizationId: ORG_A }));

    const result = await handlers.getBookingTracking(ctx, { bookingId: BOOKING_ID });

    expect(result).toBeNull();
  });

  it('getBookingTracking returns null when the booking is missing', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    const result = await handlers.getBookingTracking(ctx, { bookingId: BOOKING_ID });

    expect(result).toBeNull();
  });

  it('getBookingTracking returns the roster, counts, timeline and viewer', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, db } = makeCtx();
    get.mockImplementation((id: string) =>
      id === BOOKING_ID
        ? bookingDoc()
        : id === ROOM_ID
          ? roomDoc()
          : id === ADMIN_ID
            ? userDocName('Boss')
            : userDocName('Anna'),
    );
    const attendeesCh = makeChain();
    attendeesCh.take.mockResolvedValue([attendeeRow({ response: 'declined' })]);
    const eventsCh = makeChain();
    eventsCh.take.mockResolvedValue([
      {
        _id: 'event_1',
        type: 'created',
        actorId: ADMIN_ID,
        actorName: 'Boss',
        actorRole: 'admin',
        createdAt: 1,
      },
    ]);
    db.query.mockImplementation((table: string) =>
      table === 'roomBookingAttendees' ? attendeesCh.root : eventsCh.root,
    );

    const result = (await handlers.getBookingTracking(ctx, { bookingId: BOOKING_ID })) as any;

    expect(result.booking.title).toBe('Standup');
    expect(result.room).toEqual(expect.objectContaining({ name: 'Conference A', capacity: 10 }));
    expect(result.organizer.name).toBe('Boss');
    // only the roster member with the tracking row appears (the organizer is not a guest)
    expect(result.attendees).toHaveLength(1);
    expect(result.attendees[0]).toEqual(
      expect.objectContaining({ userId: USER_ID, response: 'declined' }),
    );
    expect(result.counts).toEqual(
      expect.objectContaining({ total: 1, declined: 1, needsAction: 0 }),
    );
    expect(result.timeline).toHaveLength(1);
    expect(result.timeline[0].type).toBe('created');
    // the admin caller is the organizer of this booking
    expect(result.viewer).toEqual(
      expect.objectContaining({
        userId: ADMIN_ID,
        isOrganizer: true,
        isAttendee: false,
        canRespond: false,
      }),
    );
  });

  it('hides the timeline from a plain attendee who is not staff', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('driver', ORG_A, 'user_driver'));
    const { ctx, get, db } = makeCtx();
    get.mockImplementation((id: string) =>
      id === BOOKING_ID
        ? bookingDoc({ organizerId: ADMIN_ID })
        : id === ROOM_ID
          ? roomDoc()
          : userDocName('Anna'),
    );
    const attendeesCh = makeChain();
    attendeesCh.take.mockResolvedValue([]);
    const eventsCh = makeChain();
    eventsCh.take.mockResolvedValue([]);
    db.query.mockImplementation((table: string) =>
      table === 'roomBookingAttendees' ? attendeesCh.root : eventsCh.root,
    );

    const result = (await handlers.getBookingTracking(ctx, { bookingId: BOOKING_ID })) as any;

    expect(result.timelineVisible).toBe(false);
    expect(result.timeline).toEqual([]);
  });

  it('getMyBookings returns only bookings the caller organizes or attends', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, db, get } = makeCtx();
    db.query.mockImplementation((table: string) => {
      const ch = makeChain();
      if (table === 'roomBookings') {
        ch.take.mockResolvedValue([
          bookingDoc({ organizerId: ADMIN_ID, attendeeIds: [USER_ID] }), // I attend
          bookingDoc({ _id: 'b2', organizerId: 'someone_else', attendeeIds: ['someone_else'] }), // not mine
        ]);
      }
      return ch.root;
    });
    get.mockImplementation((id: string) =>
      id === ROOM_ID ? roomDoc() : id === ADMIN_ID ? userDocName('Boss') : userDocName('Anna'),
    );

    const result = (await handlers.getMyBookings(ctx, { organizationId: ORG_A })) as any[];

    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe(BOOKING_ID);
  });
});

function userDocName(name: string) {
  return { _id: name === 'Boss' ? ADMIN_ID : USER_ID, name, email: `${name}@example.com` };
}

// ── Room mutations ───────────────────────────────────────────────────────────
describe('createRoom', () => {
  it('rejects unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();

    await expect(
      handlers.createRoom(ctx, { organizationId: ORG_A, name: 'Room', capacity: 5, amenities: [] }),
    ).rejects.toThrow('Not authenticated');
  });

  it('rejects cross-organization access', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_B, ADMIN_ID));
    const { ctx } = makeCtx();

    await expect(
      handlers.createRoom(ctx, { organizationId: ORG_A, name: 'Room', capacity: 5, amenities: [] }),
    ).rejects.toThrow('Access denied: different organization');
  });

  it('rejects non-admin roles', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx } = makeCtx();

    await expect(
      handlers.createRoom(ctx, { organizationId: ORG_A, name: 'Room', capacity: 5, amenities: [] }),
    ).rejects.toThrow('Insufficient permissions: organization admin required');
  });

  it('validates the room name', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx } = makeCtx();

    await expect(
      handlers.createRoom(ctx, { organizationId: ORG_A, name: '   ', capacity: 5, amenities: [] }),
    ).rejects.toThrow('Room name is required');
    await expect(
      handlers.createRoom(ctx, {
        organizationId: ORG_A,
        name: 'x'.repeat(121),
        capacity: 5,
        amenities: [],
      }),
    ).rejects.toThrow('Room name is too long');
  });

  it('validates the capacity', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx } = makeCtx();

    await expect(
      handlers.createRoom(ctx, { organizationId: ORG_A, name: 'Room', capacity: 0, amenities: [] }),
    ).rejects.toThrow('Capacity must be between 1 and 1000');
    await expect(
      handlers.createRoom(ctx, {
        organizationId: ORG_A,
        name: 'Room',
        capacity: 1001,
        amenities: [],
      }),
    ).rejects.toThrow('Capacity must be between 1 and 1000');
  });

  it('rejects duplicate room names', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, db } = makeCtx();
    db.query.mockImplementation(() => {
      const ch = makeChain();
      ch.take.mockResolvedValue([roomDoc()]);
      return ch.root;
    });

    await expect(
      handlers.createRoom(ctx, {
        organizationId: ORG_A,
        name: 'conference a',
        capacity: 5,
        amenities: [],
      }),
    ).rejects.toThrow('A room with this name already exists');
  });

  it('creates a room with normalized amenities', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, insert } = makeCtx();

    await handlers.createRoom(ctx, {
      organizationId: ORG_A,
      name: '  New Room  ',
      capacity: 8,
      amenities: ['projector', 'projector', 'tv'],
      building: ' HQ ',
    });

    expect(insert).toHaveBeenCalledWith(
      'meetingRooms',
      expect.objectContaining({
        name: 'New Room',
        capacity: 8,
        amenities: ['projector', 'tv'],
        building: 'HQ',
        isActive: true,
        createdBy: ADMIN_ID,
      }),
    );
  });

  it('rejects unknown amenities', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx } = makeCtx();

    await expect(
      handlers.createRoom(ctx, {
        organizationId: ORG_A,
        name: 'Room',
        capacity: 5,
        amenities: ['teleporter'],
      }),
    ).rejects.toThrow('Unknown amenities: teleporter');
  });
});

describe('updateRoom', () => {
  it('throws for a missing room', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    await expect(
      handlers.updateRoom(ctx, { roomId: ROOM_ID, name: 'New', capacity: 5, amenities: [] }),
    ).rejects.toThrow('Room not found');
  });

  it('rejects cross-organization updates', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_B, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(roomDoc({ organizationId: ORG_A }));

    await expect(
      handlers.updateRoom(ctx, { roomId: ROOM_ID, name: 'New', capacity: 5, amenities: [] }),
    ).rejects.toThrow('Access denied: different organization');
  });

  it('updates the room and patches the document', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch, insert } = makeCtx();
    get.mockResolvedValueOnce(roomDoc());

    const result = await handlers.updateRoom(ctx, {
      roomId: ROOM_ID,
      name: 'Renamed',
      capacity: 12,
      amenities: ['whiteboard'],
    });

    expect(result).toEqual({ success: true });
    expect(patch).toHaveBeenCalledWith(
      ROOM_ID,
      expect.objectContaining({ name: 'Renamed', capacity: 12, amenities: ['whiteboard'] }),
    );
  });
});

describe('setRoomActive', () => {
  it('archives a room and cancels its future confirmed bookings', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch, insert } = makeCtx();
    get.mockResolvedValueOnce(roomDoc());
    get.mockResolvedValueOnce(roomDoc()); // room name lookup in notifyBookingCancelled
    const ch = makeChain();
    ch.take.mockResolvedValue([
      bookingDoc({ status: 'confirmed' }),
      bookingDoc({ _id: 'b2', status: 'cancelled' }), // skipped
    ]);
    (ctx.db.query as jest.Mock).mockImplementation(() => ch.root);

    const result = (await handlers.setRoomActive(ctx, {
      roomId: ROOM_ID,
      isActive: false,
      reason: 'Renovation',
    })) as any;

    expect(result.cancelledBookings).toBe(1);
    expect(patch).toHaveBeenCalledWith(
      BOOKING_ID,
      expect.objectContaining({ status: 'cancelled', cancelReason: 'Renovation' }),
    );
    expect(insert).toHaveBeenCalledWith(
      'roomBookingEvents',
      expect.objectContaining({ type: 'cancelled' }),
    );
    expect(mockNotify).toHaveBeenCalled();
  });

  it('restores a room without touching bookings', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(roomDoc({ isActive: false }));

    const result = (await handlers.setRoomActive(ctx, { roomId: ROOM_ID, isActive: true })) as any;

    expect(result.cancelledBookings).toBe(0);
    expect(patch).toHaveBeenCalledWith(ROOM_ID, expect.objectContaining({ isActive: true }));
  });
});

describe('deleteRoom', () => {
  it('returns success when the room is already gone', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    const result = await handlers.deleteRoom(ctx, { roomId: ROOM_ID });

    expect(result).toEqual({ success: true });
  });

  it('refuses to delete a room that has bookings', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, db } = makeCtx();
    get.mockResolvedValueOnce(roomDoc());
    const ch = makeChain();
    ch.first.mockResolvedValueOnce(bookingDoc());
    db.query.mockImplementation(() => ch.root);

    await expect(handlers.deleteRoom(ctx, { roomId: ROOM_ID })).rejects.toThrow(
      'Room has bookings — archive it instead of deleting',
    );
  });

  it('deletes a room with no history', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, get, remove } = makeCtx();
    get.mockResolvedValueOnce(roomDoc());

    const result = await handlers.deleteRoom(ctx, { roomId: ROOM_ID });

    expect(result).toEqual({ success: true });
    expect(remove).toHaveBeenCalledWith(ROOM_ID);
  });
});

// ── Booking mutations ────────────────────────────────────────────────────────
describe('bookRoom / reserveRoom', () => {
  it('rejects unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();

    await expect(
      handlers.bookRoom(ctx, { roomId: ROOM_ID, title: 'T', startTime: 1, endTime: 2 }),
    ).rejects.toThrow('Not authenticated');
  });

  it('rejects booking an archived room', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(roomDoc({ isActive: false }));

    await expect(
      handlers.bookRoom(ctx, { roomId: ROOM_ID, title: 'T', startTime: 1, endTime: 2 }),
    ).rejects.toThrow('This room is archived and cannot be booked');
  });

  it('validates the time range', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get } = makeCtx();
    get.mockResolvedValue(roomDoc());

    await expect(
      handlers.bookRoom(ctx, { roomId: ROOM_ID, title: 'T', startTime: 2000, endTime: 1000 }),
    ).rejects.toThrow('End time must be after start time');
    await expect(
      handlers.bookRoom(ctx, { roomId: ROOM_ID, title: 'T', startTime: 0, endTime: 60_000 }),
    ).rejects.toThrow('Booking is too short');
    await expect(
      handlers.bookRoom(ctx, {
        roomId: ROOM_ID,
        title: 'T',
        startTime: Date.now() + 400 * 24 * 60 * 60 * 1000,
        endTime: Date.now() + 400 * 24 * 60 * 60 * 1000 + 3_600_000,
      }),
    ).rejects.toThrow('Booking is too far in the future');
  });

  it('rejects when the headcount exceeds the room capacity', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(roomDoc({ capacity: 1 }));

    await expect(
      handlers.bookRoom(ctx, {
        roomId: ROOM_ID,
        title: 'T',
        startTime: Date.now() + 60_000,
        endTime: Date.now() + 360_000,
        attendeeIds: [ADMIN_ID, USER_ID],
      }),
    ).rejects.toThrow('Too many participants');
  });

  it('throws a ROOM_BUSY error on a conflict', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get, db } = makeCtx();
    get.mockResolvedValueOnce(roomDoc());
    const ch = makeChain();
    ch.take.mockResolvedValue([bookingDoc()]);
    db.query.mockImplementation(() => ch.root);

    await expect(
      handlers.bookRoom(ctx, {
        roomId: ROOM_ID,
        title: 'T',
        startTime: Date.now() + 60 * 60 * 1000,
        endTime: Date.now() + 90 * 60 * 1000,
      }),
    ).rejects.toThrow('ROOM_BUSY');
  });

  it('creates the booking, attendee rows and the created log entry', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get, insert, db, patch } = makeCtx();
    get.mockResolvedValue(roomDoc());
    insert.mockResolvedValue(BOOKING_ID);
    const ch = makeChain();
    ch.take.mockResolvedValue([]); // no conflicts, no existing attendees
    ch.unique.mockResolvedValue(null);
    db.query.mockImplementation(() => ch.root);
    // after insert, reserveRoom does ctx.db.get(bookingId) to fetch the booking
    get.mockResolvedValueOnce(roomDoc()).mockResolvedValueOnce(bookingDoc());

    const id = await handlers.bookRoom(ctx, {
      roomId: ROOM_ID,
      title: '  Standup  ',
      description: 'Daily sync',
      startTime: Date.now() + 60_000,
      endTime: Date.now() + 360_000,
      attendeeIds: [USER_ID, USER_ID, ADMIN_ID],
      externalAttendees: ['  guest@example.com  ', ''],
    });

    expect(id).toBe(BOOKING_ID);
    expect(insert).toHaveBeenCalledWith(
      'roomBookings',
      expect.objectContaining({
        title: 'Standup',
        status: 'confirmed',
        organizerId: USER_ID,
        // the organizer is dropped from the roster
        attendeeIds: [ADMIN_ID],
      }),
    );
    // attendee rows inserted for the non-organizer guests (the organizer is dropped)
    expect(insert).toHaveBeenCalledWith(
      'roomBookingAttendees',
      expect.objectContaining({ userId: ADMIN_ID, response: 'needs_action' }),
    );
    // created log entry
    expect(insert).toHaveBeenCalledWith(
      'roomBookingEvents',
      expect.objectContaining({ type: 'created', actorId: USER_ID }),
    );
    // guests notified
    expect(mockNotify).toHaveBeenCalled();
  });

  it('reserveRoom can be called directly (shared with calendar events)', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get, insert } = makeCtx();
    get.mockResolvedValue(roomDoc());
    insert.mockResolvedValue(BOOKING_ID);
    const ch = makeChain();
    ch.take.mockResolvedValue([]);
    (ctx.db.query as jest.Mock).mockImplementation(() => ch.root);
    get.mockResolvedValueOnce(roomDoc()).mockResolvedValueOnce(bookingDoc());

    const id = await exported.reserveRoom(ctx, makeCaller('employee', ORG_A), {
      roomId: ROOM_ID,
      title: 'Direct booking',
      startTime: Date.now() + 60_000,
      endTime: Date.now() + 360_000,
    });

    expect(id).toBe(BOOKING_ID);
    expect(insert).toHaveBeenCalledWith(
      'roomBookings',
      expect.objectContaining({ title: 'Direct booking' }),
    );
  });
});

describe('updateBooking', () => {
  const now = Date.now();

  it('throws for a missing booking', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    await expect(handlers.updateBooking(ctx, { bookingId: BOOKING_ID })).rejects.toThrow(
      'Booking not found',
    );
  });

  it('denies a non-organizer employee', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(bookingDoc({ organizerId: ADMIN_ID }));

    await expect(handlers.updateBooking(ctx, { bookingId: BOOKING_ID })).rejects.toThrow(
      'Only the organizer or an admin can change this booking',
    );
  });

  it('rejects updates to a cancelled booking', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(bookingDoc({ status: 'cancelled' }));

    await expect(handlers.updateBooking(ctx, { bookingId: BOOKING_ID })).rejects.toThrow(
      'This booking is cancelled',
    );
  });

  it('rejects a reschedule that collides with another booking', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, db } = makeCtx();
    get.mockResolvedValueOnce(bookingDoc({ startTime: now, endTime: now + 3_600_000 }));
    get.mockResolvedValueOnce(roomDoc());
    const ch = makeChain();
    // the conflicting booking overlaps the requested new slot
    ch.take.mockResolvedValue([
      bookingDoc({
        _id: 'other_booking',
        startTime: now + 2 * 3_600_000,
        endTime: now + 2.5 * 3_600_000,
      }),
    ]);
    db.query.mockImplementation(() => ch.root);

    await expect(
      handlers.updateBooking(ctx, {
        bookingId: BOOKING_ID,
        startTime: now + 2 * 3_600_000,
        endTime: now + 3 * 3_600_000,
      }),
    ).rejects.toThrow('Room is already booked for the new time');
  });

  it('reschedules, resets attendee responses and logs the event', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch, db } = makeCtx();
    get.mockResolvedValueOnce(bookingDoc({ startTime: now, endTime: now + 3_600_000 }));
    get.mockResolvedValueOnce(roomDoc());
    // after patch: fetch the updated booking
    get.mockResolvedValueOnce(
      bookingDoc({ startTime: now + 2 * 3_600_000, endTime: now + 3 * 3_600_000 }),
    );
    const bookingCh = makeChain();
    bookingCh.take.mockResolvedValue([]); // conflicts
    const attendeesCh = makeChain();
    attendeesCh.take.mockResolvedValue([
      attendeeRow({ response: 'accepted' }),
      attendeeRow({ _id: 'a2', response: 'needs_action' }),
    ]);
    db.query.mockImplementation((table: string) =>
      table === 'roomBookingAttendees' ? attendeesCh.root : bookingCh.root,
    );

    const result = await handlers.updateBooking(ctx, {
      bookingId: BOOKING_ID,
      startTime: now + 2 * 3_600_000,
      endTime: now + 3 * 3_600_000,
    });

    expect(result).toEqual({ success: true });
    expect(patch).toHaveBeenCalledWith(
      BOOKING_ID,
      expect.objectContaining({ startTime: now + 2 * 3_600_000, endTime: now + 3 * 3_600_000 }),
    );
    // only the accepted response was reset; needs_action rows are left alone
    expect(patch).toHaveBeenCalledWith(
      'attendee_1',
      expect.objectContaining({ response: 'needs_action' }),
    );
    expect(patch).not.toHaveBeenCalledWith(
      'a2',
      expect.objectContaining({ response: 'needs_action' }),
    );
  });

  it('renames the booking and logs the field change', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch, db } = makeCtx();
    get.mockResolvedValueOnce(bookingDoc());
    get.mockResolvedValueOnce(roomDoc());
    const ch = makeChain();
    ch.take.mockResolvedValue([]);
    db.query.mockImplementation(() => ch.root);

    await handlers.updateBooking(ctx, { bookingId: BOOKING_ID, title: 'Renamed meeting' });

    expect(patch).toHaveBeenCalledWith(
      BOOKING_ID,
      expect.objectContaining({ title: 'Renamed meeting' }),
    );
  });
});

describe('cancelBooking / cancelRoomBooking', () => {
  it('returns false for a missing booking', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    const result = await exported.cancelRoomBooking(
      ctx,
      makeCaller('admin', ORG_A, ADMIN_ID),
      BOOKING_ID,
    );

    expect(result).toBe(false);
  });

  it('denies a non-organizer employee', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(bookingDoc({ organizerId: ADMIN_ID }));

    await expect(
      exported.cancelRoomBooking(
        ctx,
        makeCaller('employee', ORG_A),
        BOOKING_ID,
        'no longer needed',
      ),
    ).rejects.toThrow('Only the organizer or an admin can cancel this booking');
  });

  it('returns false for an already-cancelled booking', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(bookingDoc({ status: 'cancelled' }));

    const result = await exported.cancelRoomBooking(
      ctx,
      makeCaller('admin', ORG_A, ADMIN_ID),
      BOOKING_ID,
    );

    expect(result).toBe(false);
  });

  it('cancels the booking, unlinks calendar events and notifies attendees', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch, insert, db } = makeCtx();
    get.mockResolvedValueOnce(bookingDoc());
    get.mockResolvedValueOnce(roomDoc()); // room for notifyBookingCancelled
    const eventsCh = makeChain();
    eventsCh.take.mockResolvedValue([
      { _id: 'event_1', roomId: ROOM_ID, roomBookingId: BOOKING_ID },
    ]);
    db.query.mockImplementation(() => eventsCh.root);

    const result = await exported.cancelRoomBooking(
      ctx,
      makeCaller('admin', ORG_A, ADMIN_ID),
      BOOKING_ID,
      'rescheduled',
    );

    expect(result).toBe(true);
    expect(patch).toHaveBeenCalledWith(
      BOOKING_ID,
      expect.objectContaining({ status: 'cancelled', cancelReason: 'rescheduled' }),
    );
    expect(patch).toHaveBeenCalledWith('event_1', expect.objectContaining({ roomId: undefined }));
    expect(insert).toHaveBeenCalledWith(
      'roomBookingEvents',
      expect.objectContaining({ type: 'cancelled' }),
    );
    expect(mockNotify).toHaveBeenCalled();
  });

  it('cancelBooking mutation delegates and returns success', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch, insert, db } = makeCtx();
    get.mockResolvedValueOnce(bookingDoc());
    get.mockResolvedValueOnce(roomDoc());
    const ch = makeChain();
    ch.take.mockResolvedValue([]);
    db.query.mockImplementation(() => ch.root);

    const result = await handlers.cancelBooking(ctx, { bookingId: BOOKING_ID });

    expect(result).toEqual({ success: true });
  });
});

describe('respondToBooking', () => {
  const now = Date.now();

  it('rejects unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();

    await expect(
      handlers.respondToBooking(ctx, { bookingId: BOOKING_ID, response: 'accepted' }),
    ).rejects.toThrow('Not authenticated');
  });

  it('rejects the organizer', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(bookingDoc({ organizerId: ADMIN_ID }));

    await expect(
      handlers.respondToBooking(ctx, { bookingId: BOOKING_ID, response: 'accepted' }),
    ).rejects.toThrow('The organizer does not need to respond');
  });

  it('rejects an ended meeting', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(bookingDoc({ endTime: now - 1000 }));

    await expect(
      handlers.respondToBooking(ctx, { bookingId: BOOKING_ID, response: 'accepted' }),
    ).rejects.toThrow('This meeting has already ended');
  });

  it('rejects callers who are not invited', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, 'user_uninvited'));
    const { ctx, get, db } = makeCtx();
    get.mockResolvedValueOnce(bookingDoc({ endTime: now + 3_600_000 }));
    const ch = makeChain();
    ch.unique.mockResolvedValueOnce(null);
    db.query.mockImplementation(() => ch.root);

    await expect(
      handlers.respondToBooking(ctx, { bookingId: BOOKING_ID, response: 'declined' }),
    ).rejects.toThrow('Only invited participants can respond');
  });

  it('patches the existing attendee row on an answer', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get, patch, db } = makeCtx();
    get.mockResolvedValueOnce(bookingDoc({ endTime: now + 3_600_000 }));
    const ch = makeChain();
    ch.unique.mockResolvedValueOnce(attendeeRow({ response: 'accepted' }));
    db.query.mockImplementation(() => ch.root);

    const result = await handlers.respondToBooking(ctx, {
      bookingId: BOOKING_ID,
      response: 'tentative',
      comment: '  maybe  ',
    });

    expect(result).toEqual({ success: true });
    expect(patch).toHaveBeenCalledWith(
      'attendee_1',
      expect.objectContaining({
        response: 'tentative',
        comment: 'maybe',
        respondedAt: expect.any(Number),
      }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ userId: ADMIN_ID, type: 'room_booked' }),
    );
  });

  it('materializes a tracking row for bookings that predate tracking', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get, insert, db } = makeCtx();
    get.mockResolvedValueOnce(bookingDoc({ endTime: now + 3_600_000 }));
    const ch = makeChain();
    ch.unique.mockResolvedValueOnce(null);
    db.query.mockImplementation(() => ch.root);

    await handlers.respondToBooking(ctx, { bookingId: BOOKING_ID, response: 'accepted' });

    expect(insert).toHaveBeenCalledWith(
      'roomBookingAttendees',
      expect.objectContaining({ userId: USER_ID, response: 'accepted', invitedBy: ADMIN_ID }),
    );
  });
});

describe('checkInBooking', () => {
  const now = Date.now();

  it('rejects unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();

    await expect(handlers.checkInBooking(ctx, { bookingId: BOOKING_ID })).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('rejects a cancelled booking', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(bookingDoc({ status: 'cancelled' }));

    await expect(handlers.checkInBooking(ctx, { bookingId: BOOKING_ID })).rejects.toThrow(
      'This booking is cancelled',
    );
  });

  it('rejects check-in far outside the meeting window', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, db } = makeCtx();
    get.mockResolvedValueOnce(
      bookingDoc({ startTime: now + 3 * 60 * 60 * 1000, endTime: now + 4 * 60 * 60 * 1000 }),
    );
    const ch = makeChain();
    ch.unique.mockResolvedValueOnce(null);
    db.query.mockImplementation(() => ch.root);

    await expect(handlers.checkInBooking(ctx, { bookingId: BOOKING_ID })).rejects.toThrow(
      'Check-in is only possible around the meeting time',
    );
  });

  it('records the organizer check-in on the booking', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch, db } = makeCtx();
    get.mockResolvedValueOnce(
      bookingDoc({
        organizerId: ADMIN_ID,
        startTime: now - 5 * 60 * 1000,
        endTime: now + 5 * 60 * 1000,
      }),
    );
    const ch = makeChain();
    ch.unique.mockResolvedValueOnce(null);
    db.query.mockImplementation(() => ch.root);

    const result = await handlers.checkInBooking(ctx, { bookingId: BOOKING_ID });

    expect(result).toEqual({ success: true });
    expect(patch).toHaveBeenCalledWith(
      BOOKING_ID,
      expect.objectContaining({ checkedInAt: expect.any(Number) }),
    );
  });

  it('records an attendee check-in on their row', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get, patch, db } = makeCtx();
    get.mockResolvedValueOnce(
      bookingDoc({ startTime: now - 5 * 60 * 1000, endTime: now + 5 * 60 * 1000 }),
    );
    const ch = makeChain();
    ch.unique.mockResolvedValueOnce(attendeeRow());
    db.query.mockImplementation(() => ch.root);

    await handlers.checkInBooking(ctx, { bookingId: BOOKING_ID });

    expect(patch).toHaveBeenCalledWith(
      'attendee_1',
      expect.objectContaining({ checkedInAt: expect.any(Number) }),
    );
  });

  it('materializes a row for a pre-tracking attendee check-in', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get, insert, db } = makeCtx();
    get.mockResolvedValueOnce(
      bookingDoc({ startTime: now - 5 * 60 * 1000, endTime: now + 5 * 60 * 1000 }),
    );
    const ch = makeChain();
    ch.unique.mockResolvedValueOnce(null);
    db.query.mockImplementation(() => ch.root);

    await handlers.checkInBooking(ctx, { bookingId: BOOKING_ID });

    expect(insert).toHaveBeenCalledWith(
      'roomBookingAttendees',
      expect.objectContaining({ userId: USER_ID, checkedInAt: expect.any(Number) }),
    );
  });
});
