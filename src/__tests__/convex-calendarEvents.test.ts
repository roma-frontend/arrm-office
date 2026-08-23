/**
 * Tests for convex/calendarEvents — event CRUD with mocked Convex context.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler }: any) => ({ handler }),
  query: ({ handler }: any) => ({ handler }),
  internalMutation: ({ handler }: any) => ({ handler }),
  internalQuery: ({ handler }: any) => ({ handler }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
}));

jest.mock('../../convex/lib/entitlements', () => ({
  assertModuleAccess: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../convex/lib/notify', () => ({
  notify: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../convex/meetingRooms', () => ({
  reserveRoom: jest.fn().mockResolvedValue('booking-1'),
  cancelRoomBooking: jest.fn().mockResolvedValue(undefined),
}));

// ── Module under test ────────────────────────────────────────────────────────
let handlers: Record<string, (ctx: any, args: any) => Promise<any>> = {};

// Get the mock functions directly (created by jest.mock above)
const getAuthCallerFn = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller as jest.Mock;
const isSuperadminFn = jest.requireMock('../../convex/lib/auth').isSuperadmin as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // Re-require after clearAllMocks to get fresh handlers
  jest.isolateModules(() => {
    const mod = require('../../convex/calendarEvents');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      }
    }
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
const ORG = 'org-1';
const USER = 'user-1';
const EVENT_ID = 'event-1';
const DAY = 86400000;

function callerDoc(overrides: Record<string, unknown> = {}) {
  return { _id: USER, role: 'admin', organizationId: ORG, name: 'Admin', ...overrides };
}

function eventDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: EVENT_ID,
    organizationId: ORG,
    createdBy: USER,
    title: 'Team Sync',
    date: '2026-08-25',
    startTime: '10:00',
    endTime: '11:00',
    allDay: false,
    category: 'meeting',
    reminder: '15min',
    attendees: ['Alice'],
    attendeeIds: ['emp-1'],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function mockCaller(overrides: Record<string, unknown> = {}) {
  const caller = callerDoc(overrides);
  getAuthCallerFn.mockResolvedValue(caller);
  isSuperadminFn.mockReturnValue(caller.role === 'superadmin');
  return caller;
}

function makeCtx(dbOverrides: Record<string, jest.Mock> = {}) {
  const get = dbOverrides.get ?? jest.fn();
  const insert = dbOverrides.insert ?? jest.fn().mockResolvedValue('new_id');
  const patch = dbOverrides.patch ?? jest.fn().mockResolvedValue(undefined);
  const remove = dbOverrides.delete ?? jest.fn().mockResolvedValue(undefined);
  const take = dbOverrides.take ?? jest.fn().mockResolvedValue([]);
  const collect = jest.fn().mockResolvedValue([]);
  const first = dbOverrides.first ?? jest.fn().mockResolvedValue(null);
  const order = jest.fn().mockReturnValue({ take, first, collect });
  const withIndex = jest.fn().mockReturnValue({ order, take, first, collect });
  const query = jest.fn().mockReturnValue({ withIndex, order, take, first, collect });
  const db = { get, insert, patch, delete: remove, query };
  return { ctx: { db }, get, insert, patch, remove, query, withIndex, take, first, collect };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('create', () => {
  it('creates an event and returns its id', async () => {
    mockCaller();
    const { ctx, insert } = makeCtx();

    const id = await handlers.create(ctx, {
      organizationId: ORG,
      title: 'Team Meeting',
      date: '2026-08-25',
      startTime: '10:00',
      endTime: '11:00',
      allDay: false,
      category: 'meeting',
      reminder: '15min',
    });

    expect(id).toBe('new_id');
    expect(insert).toHaveBeenCalledWith('calendarEvents', expect.objectContaining({
      title: 'Team Meeting',
      organizationId: ORG,
      createdBy: USER,
    }));
  });

  it('throws for empty title', async () => {
    mockCaller();
    const { ctx } = makeCtx();

    await expect(
      handlers.create(ctx, {
        organizationId: ORG,
        title: '   ',
        date: '2026-08-25',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        category: 'meeting',
        reminder: '15min',
      }),
    ).rejects.toThrow('Title is required');
  });

  it('throws for different organization', async () => {
    mockCaller({ organizationId: 'other-org' });
    const { ctx } = makeCtx();

    await expect(
      handlers.create(ctx, {
        organizationId: ORG,
        title: 'Meeting',
        date: '2026-08-25',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        category: 'meeting',
        reminder: '15min',
      }),
    ).rejects.toThrow('different organization');
  });

  it('creates event with room reservation', async () => {
    mockCaller();
    const { ctx, insert } = makeCtx();
    const now = Date.now();

    await handlers.create(ctx, {
      organizationId: ORG,
      title: 'Board Meeting',
      date: '2026-08-25',
      startTime: '10:00',
      endTime: '11:00',
      allDay: false,
      category: 'meeting',
      reminder: '15min',
      roomId: 'room-1',
      roomStartTime: now,
      roomEndTime: now + 3600000,
    });

    expect(insert).toHaveBeenCalledWith('calendarEvents', expect.objectContaining({
      roomId: 'room-1',
      roomBookingId: 'booking-1',
    }));
  });
});

describe('update', () => {
  it('updates an existing event', async () => {
    mockCaller();
    const { ctx, patch } = makeCtx();
    ctx.db.get.mockResolvedValue(eventDoc());

    await handlers.update(ctx, {
      id: EVENT_ID,
      title: 'Updated Meeting',
      date: '2026-08-26',
      startTime: '14:00',
      endTime: '15:00',
      allDay: false,
      category: 'meeting',
      reminder: '30min',
    });

    expect(patch).toHaveBeenCalledWith(EVENT_ID, expect.objectContaining({
      title: 'Updated Meeting',
      date: '2026-08-26',
    }));
  });

  it('throws for non-existent event', async () => {
    mockCaller();
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(null);

    await expect(
      handlers.update(ctx, {
        id: EVENT_ID,
        title: 'X',
        date: '2026-08-25',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        category: 'meeting',
        reminder: '15min',
      }),
    ).rejects.toThrow('not found');
  });

  it('allows owner to update their event', async () => {
    mockCaller();
    const { ctx, patch } = makeCtx();
    ctx.db.get.mockResolvedValue(eventDoc({ createdBy: USER }));

    await handlers.update(ctx, {
      id: EVENT_ID,
      title: 'Updated',
      date: '2026-08-25',
      startTime: '10:00',
      endTime: '11:00',
      allDay: false,
      category: 'meeting',
      reminder: '15min',
    });

    expect(patch).toHaveBeenCalled();
  });
});

describe('remove', () => {
  it('deletes an existing event', async () => {
    mockCaller();
    const { ctx, remove } = makeCtx();
    ctx.db.get.mockResolvedValue(eventDoc());

    await handlers.remove(ctx, { id: EVENT_ID });

    expect(remove).toHaveBeenCalledWith(EVENT_ID);
  });

  it('returns success when event does not exist (graceful)', async () => {
    mockCaller();
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(null);

    const result = await handlers.remove(ctx, { id: EVENT_ID });
    expect(result).toEqual({ success: true, releasedRoom: false });
  });

  it('allows owner to delete their event', async () => {
    mockCaller();
    const { ctx, remove } = makeCtx();
    ctx.db.get.mockResolvedValue(eventDoc({ createdBy: USER }));

    await handlers.remove(ctx, { id: EVENT_ID });

    expect(remove).toHaveBeenCalledWith(EVENT_ID);
  });

  it('removes event with room', async () => {
    mockCaller();
    const { ctx, remove } = makeCtx();
    ctx.db.get.mockResolvedValue(eventDoc({ roomBookingId: 'booking-1', roomId: 'room-1' }));

    await handlers.remove(ctx, { id: EVENT_ID });

    expect(remove).toHaveBeenCalled();
  });
});

describe('createFromBooking', () => {
  it('creates an event from a room booking', async () => {
    mockCaller();
    const { ctx, insert, patch } = makeCtx();
    const now = Date.now();
    const booking = {
      _id: 'booking-1',
      organizationId: ORG,
      roomId: 'room-1',
      title: 'Sprint Review',
      description: 'Review sprint',
      startTime: now,
      endTime: now + 3600000,
      attendeeIds: ['emp-1'],
      createdBy: USER,
    };
    ctx.db.get.mockResolvedValue(booking);

    const result = await handlers.createFromBooking(ctx, { roomBookingId: 'booking-1' });

    expect(result).toEqual(expect.objectContaining({
      eventId: expect.anything(),
    }));
    expect(insert).toHaveBeenCalledWith('calendarEvents', expect.objectContaining({
      title: 'Sprint Review',
      roomId: 'room-1',
      roomBookingId: 'booking-1',
    }));
  });

  it('throws for non-existent booking', async () => {
    mockCaller();
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(null);

    await expect(
      handlers.createFromBooking(ctx, { roomBookingId: 'unknown' }),
    ).rejects.toThrow('not found');
  });
});
