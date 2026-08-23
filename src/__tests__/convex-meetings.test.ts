/**
 * Tests for convex/meetings — meeting CRUD with mocked Convex context.
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
  assertQuota: jest.fn().mockResolvedValue(undefined),
  currentPeriodKey: jest.fn().mockReturnValue('2026-08'),
  incrementUsage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../convex/lib/notify', () => ({
  notify: jest.fn().mockResolvedValue(undefined),
}));

// ── Module under test ────────────────────────────────────────────────────────
let handlers: Record<string, (ctx: any, args: any) => Promise<any>> = {};

const getAuthCallerFn = jest.requireMock('../../convex/lib/getAuthCaller')
  .getAuthCaller as jest.Mock;
const isSuperadminFn = jest.requireMock('../../convex/lib/auth').isSuperadmin as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.isolateModules(() => {
    const mod = require('../../convex/meetings');
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
const MEETING_ID = 'meeting-1';
const EVENT_ID = 'event-1';

function callerDoc(overrides: Record<string, unknown> = {}) {
  return { _id: USER, role: 'admin', organizationId: ORG, name: 'Admin', ...overrides };
}

function meetingDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: MEETING_ID,
    eventId: EVENT_ID,
    organizationId: ORG,
    roomName: 'team-sync',
    hostUserId: USER,
    mode: 'meeting',
    status: 'scheduled',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
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
  const unique = dbOverrides.unique ?? jest.fn().mockResolvedValue(null);
  const order = jest.fn().mockReturnValue({ take, first, unique, collect });
  const withIndex = jest.fn().mockReturnValue({ order, take, first, unique, collect });
  const query = jest.fn().mockReturnValue({ withIndex, order, take, first, unique, collect });
  const db = { get, insert, patch, delete: remove, query };
  return {
    ctx: { db },
    get,
    insert,
    patch,
    remove,
    query,
    withIndex,
    take,
    first,
    unique,
    collect,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('register', () => {
  it('registers a new meeting for an event', async () => {
    mockCaller();
    const { ctx, insert, patch } = makeCtx();
    ctx.db.get.mockResolvedValue(eventDoc());

    const result = await handlers.register(ctx, {
      eventId: EVENT_ID,
      organizationId: ORG,
      roomName: 'team-sync',
      mode: 'meeting',
    });

    expect(result).toEqual({ success: true });
    expect(insert).toHaveBeenCalledWith(
      'meetings',
      expect.objectContaining({
        eventId: EVENT_ID,
        roomName: 'team-sync',
        hostUserId: USER,
        mode: 'meeting',
        status: 'scheduled',
      }),
    );
    expect(patch).toHaveBeenCalledWith(
      EVENT_ID,
      expect.objectContaining({
        videoUrl: expect.any(String),
        videoProvider: 'livekit',
      }),
    );
  });

  it('updates existing meeting instead of creating new', async () => {
    mockCaller();
    const { ctx, patch } = makeCtx();
    ctx.db.get.mockResolvedValue(eventDoc());
    // Meeting already exists
    ctx.db.query().withIndex().unique.mockResolvedValue(meetingDoc());

    const result = await handlers.register(ctx, {
      eventId: EVENT_ID,
      organizationId: ORG,
      roomName: 'team-sync',
      mode: 'webinar',
    });

    expect(result).toEqual({ success: true });
    expect(patch).toHaveBeenCalledWith(
      MEETING_ID,
      expect.objectContaining({
        mode: 'webinar',
      }),
    );
    expect(patch).toHaveBeenCalledWith(
      EVENT_ID,
      expect.objectContaining({
        videoUrl: expect.any(String),
      }),
    );
  });

  it('throws for non-existent event', async () => {
    mockCaller();
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(null);

    await expect(
      handlers.register(ctx, {
        eventId: EVENT_ID,
        organizationId: ORG,
        roomName: 'team-sync',
        mode: 'meeting',
      }),
    ).rejects.toThrow('not found');
  });

  it('allows admin to register video for any event', async () => {
    mockCaller({ role: 'admin' });
    const { ctx, insert } = makeCtx();
    ctx.db.get.mockResolvedValue(eventDoc({ createdBy: 'other-user' }));

    const result = await handlers.register(ctx, {
      eventId: EVENT_ID,
      organizationId: ORG,
      roomName: 'team-sync',
      mode: 'meeting',
    });

    expect(result).toEqual({ success: true });
  });

  it('allows admin to attach video to any event', async () => {
    mockCaller({ role: 'admin' });
    const { ctx, insert } = makeCtx();
    ctx.db.get.mockResolvedValue(eventDoc({ createdBy: 'other-user' }));

    const result = await handlers.register(ctx, {
      eventId: EVENT_ID,
      organizationId: ORG,
      roomName: 'team-sync',
      mode: 'meeting',
    });

    expect(result).toEqual({ success: true });
  });

  it('throws for different organization', async () => {
    mockCaller({ organizationId: 'other-org' });
    const { ctx } = makeCtx();
    ctx.db.get.mockResolvedValue(eventDoc());

    await expect(
      handlers.register(ctx, {
        eventId: EVENT_ID,
        organizationId: ORG,
        roomName: 'team-sync',
        mode: 'meeting',
      }),
    ).rejects.toThrow('different organization');
  });
});

describe('setStatus', () => {
  it('sets meeting status to live', async () => {
    mockCaller();
    const { ctx, patch } = makeCtx();
    ctx.db.query().withIndex().unique.mockResolvedValue(meetingDoc());

    const result = await handlers.setStatus(ctx, {
      roomName: 'team-sync',
      status: 'live',
    });

    expect(result).toEqual({ success: true });
    expect(patch).toHaveBeenCalledWith(
      MEETING_ID,
      expect.objectContaining({
        status: 'live',
      }),
    );
  });

  it('sets meeting status to ended', async () => {
    mockCaller();
    const { ctx, patch } = makeCtx();
    ctx.db
      .query()
      .withIndex()
      .unique.mockResolvedValue(meetingDoc({ status: 'live' }));

    const result = await handlers.setStatus(ctx, {
      roomName: 'team-sync',
      status: 'ended',
    });

    expect(result).toEqual({ success: true });
    expect(patch).toHaveBeenCalledWith(
      MEETING_ID,
      expect.objectContaining({
        status: 'ended',
      }),
    );
  });

  it('throws for non-existent meeting', async () => {
    mockCaller();
    const { ctx } = makeCtx();
    ctx.db.query().withIndex().unique.mockResolvedValue(null);

    await expect(
      handlers.setStatus(ctx, { roomName: 'nonexistent', status: 'live' }),
    ).rejects.toThrow('not found');
  });

  it('allows admin to change any meeting status', async () => {
    mockCaller({ role: 'admin' });
    const { ctx, patch } = makeCtx();
    ctx.db
      .query()
      .withIndex()
      .unique.mockResolvedValue(meetingDoc({ hostUserId: 'other-user' }));

    const result = await handlers.setStatus(ctx, {
      roomName: 'team-sync',
      status: 'live',
    });

    expect(result).toEqual({ success: true });
  });

  it('allows admin to change status of any meeting', async () => {
    mockCaller({ role: 'admin' });
    const { ctx, patch } = makeCtx();
    ctx.db
      .query()
      .withIndex()
      .unique.mockResolvedValue(meetingDoc({ hostUserId: 'other-user' }));

    const result = await handlers.setStatus(ctx, {
      roomName: 'team-sync',
      status: 'ended',
    });

    expect(result).toEqual({ success: true });
  });

  it('throws for different organization', async () => {
    mockCaller({ organizationId: 'other-org' });
    const { ctx } = makeCtx();
    ctx.db.query().withIndex().unique.mockResolvedValue(meetingDoc());

    await expect(
      handlers.setStatus(ctx, { roomName: 'team-sync', status: 'live' }),
    ).rejects.toThrow('different organization');
  });
});

describe('removeVideo', () => {
  it('removes video from a meeting', async () => {
    mockCaller();
    const { ctx, patch } = makeCtx();
    ctx.db.query().withIndex().unique.mockResolvedValue(meetingDoc());
    ctx.db.get
      .mockResolvedValueOnce(eventDoc()) // event lookup
      .mockResolvedValueOnce(null); // second lookup

    const result = await handlers.removeVideo(ctx, { roomName: 'team-sync' });

    expect(result).toEqual({ success: true });
  });

  it('throws for non-existent meeting', async () => {
    mockCaller();
    const { ctx } = makeCtx();
    ctx.db.query().withIndex().unique.mockResolvedValue(null);

    await expect(handlers.removeVideo(ctx, { roomName: 'nonexistent' })).rejects.toThrow(
      'not found',
    );
  });
});
