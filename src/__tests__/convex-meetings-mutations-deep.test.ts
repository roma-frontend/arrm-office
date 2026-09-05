/**
 * Deep tests for convex/meetings.ts mutations.
 * Covers: register, setStatus, setRecording, removeVideo, updateLobbyAndRegistration.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
}));

jest.mock('../../convex/lib/entitlements', () => ({
  assertModuleAccess: jest.fn(),
  assertQuota: jest.fn(),
  incrementUsage: jest.fn(),
  currentPeriodKey: jest.fn(() => '2026-09'),
}));

let meetings: any;
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockAssertModuleAccess: jest.Mock;
let mockAssertQuota: jest.Mock;
let mockIncrementUsage: jest.Mock;

const ORG = 'org_1';
const adminUser = {
  _id: 'user_admin',
  name: 'Admin',
  email: 'admin@x.com',
  role: 'admin',
  organizationId: ORG,
};

function makeCtx(tableRows: Record<string, any[]> = {}) {
  const insertedById = new Map<string, any>();
  for (const arr of Object.values(tableRows)) {
    for (const row of arr as any[]) {
      if (row._id) insertedById.set(row._id, row);
    }
  }
  function chain(table: string) {
    const rows = tableRows[table] ?? [];
    let eqFilters: Record<string, unknown> = {};
    const c: any = {
      withIndex: (_: string, cb: any) => {
        const cap = {
          eq: (k: string, v: unknown) => {
            eqFilters[k] = v;
            return cap;
          },
        };
        if (cb) cb(cap);
        return c;
      },
      eq: (k: string, v: unknown) => {
        eqFilters[k] = v;
        return c;
      },
      order: () => c,
      filter: () => c,
      take: async () => rows.filter((r) => Object.entries(eqFilters).every(([k, v]) => r[k] === v)),
      first: async () =>
        rows.find((r) => Object.entries(eqFilters).every(([k, v]) => r[k] === v)) ?? null,
      unique: async () =>
        rows.find((r) => Object.entries(eqFilters).every(([k, v]) => r[k] === v)) ?? null,
    };
    return c;
  }
  return {
    db: {
      get: async (id: string) => {
        for (const arr of Object.values(tableRows)) {
          const found = (arr as any[]).find((r) => r._id === id);
          if (found) return found;
        }
        return null;
      },
      insert: async (table: string, doc: Record<string, unknown>) => {
        const arr = (tableRows[table] ??= []);
        const id = `auto-${table}-${arr.length}`;
        const full = { _id: id, ...doc };
        arr.push(full);
        insertedById.set(id, full);
        return id;
      },
      patch: async (id: string, p: Record<string, unknown>) => {
        const row = insertedById.get(id);
        if (row) Object.assign(row, p);
      },
      delete: async (id: string) => {
        for (const table of Object.keys(tableRows)) {
          const idx = tableRows[table].findIndex((r: any) => r._id === id);
          if (idx >= 0) {
            tableRows[table].splice(idx, 1);
            break;
          }
        }
      },
      query: (table: string) => chain(table),
    },
    tableRows,
  };
}

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
    mockAssertModuleAccess = jest.requireMock('../../convex/lib/entitlements').assertModuleAccess;
    mockAssertQuota = jest.requireMock('../../convex/lib/entitlements').assertQuota;
    mockIncrementUsage = jest.requireMock('../../convex/lib/entitlements').incrementUsage;
    meetings = require('../../convex/meetings');
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller.mockResolvedValue(adminUser);
  mockIsSuperadmin.mockReturnValue(false);
  mockAssertModuleAccess.mockResolvedValue(undefined);
  mockAssertQuota.mockResolvedValue(undefined);
  mockIncrementUsage.mockResolvedValue(undefined);
});

// ─── register ───────────────────────────────────────────────────────────────

describe('register', () => {
  it('creates a new meeting for an event', async () => {
    const rows: any = {
      calendarEvents: [{ _id: 'evt1', organizationId: ORG, createdBy: adminUser._id }],
    };
    const ctx = makeCtx(rows);
    const result = await meetings.register.handler(ctx, {
      eventId: 'evt1' as any,
      organizationId: ORG,
      roomName: 'test-room',
      mode: 'meeting',
    });
    expect(result).toEqual({ success: true });
    const meetingRows = ctx.tableRows['meetings'] ?? [];
    expect(meetingRows.length).toBe(1);
    expect(meetingRows[0].roomName).toBe('test-room');
    expect(meetingRows[0].status).toBe('scheduled');
    expect(meetingRows[0].hostUserId).toBe(adminUser._id);
    expect(mockAssertQuota).toHaveBeenCalled();
    expect(mockIncrementUsage).toHaveBeenCalled();
  });

  it('patches existing meeting on re-save (idempotent)', async () => {
    const rows: any = {
      calendarEvents: [{ _id: 'evt1', organizationId: ORG, createdBy: adminUser._id }],
      meetings: [
        {
          _id: 'mtg1',
          eventId: 'evt1',
          organizationId: ORG,
          roomName: 'test-room',
          status: 'scheduled',
        },
      ],
    };
    const ctx = makeCtx(rows);
    await meetings.register.handler(ctx, {
      eventId: 'evt1' as any,
      organizationId: ORG,
      roomName: 'test-room',
      mode: 'webinar',
      waitingRoomEnabled: true,
    });
    // Should patch, not insert
    expect(ctx.tableRows['meetings'].length).toBe(1);
    expect(ctx.tableRows['meetings'][0].mode).toBe('webinar');
    expect(ctx.tableRows['meetings'][0].waitingRoomEnabled).toBe(true);
  });

  it('sets registration fields and adds fullName if missing', async () => {
    const rows: any = {
      calendarEvents: [{ _id: 'evt1', organizationId: ORG, createdBy: adminUser._id }],
    };
    const ctx = makeCtx(rows);
    await meetings.register.handler(ctx, {
      eventId: 'evt1' as any,
      organizationId: ORG,
      roomName: 'reg-room',
      mode: 'webinar',
      registrationEnabled: true,
      registrationFields: [{ name: 'email', required: true }],
    });
    const meeting = ctx.tableRows['meetings'][0];
    expect(meeting.registrationFields).toHaveLength(2);
    expect(meeting.registrationFields.some((f: any) => f.name === 'fullName')).toBe(true);
  });

  it('throws when event not found', async () => {
    const ctx = makeCtx({});
    await expect(
      meetings.register.handler(ctx, {
        eventId: 'ghost' as any,
        organizationId: ORG,
        roomName: 'x',
        mode: 'meeting',
      }),
    ).rejects.toThrow('Event not found');
  });
});

// ─── setStatus ──────────────────────────────────────────────────────────────

describe('setStatus', () => {
  it('sets meeting status to live', async () => {
    const rows: any = {
      meetings: [
        {
          _id: 'mtg1',
          roomName: 'room1',
          organizationId: ORG,
          hostUserId: adminUser._id,
          status: 'scheduled',
        },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await meetings.setStatus.handler(ctx, { roomName: 'room1', status: 'live' });
    expect(result).toEqual({ success: true });
    expect(ctx.tableRows['meetings'][0].status).toBe('live');
  });

  it('sets meeting status to ended', async () => {
    const rows: any = {
      meetings: [
        {
          _id: 'mtg1',
          roomName: 'room1',
          organizationId: ORG,
          hostUserId: adminUser._id,
          status: 'live',
        },
      ],
    };
    const ctx = makeCtx(rows);
    await meetings.setStatus.handler(ctx, { roomName: 'room1', status: 'ended' });
    expect(ctx.tableRows['meetings'][0].status).toBe('ended');
  });

  it('throws when meeting not found', async () => {
    const ctx = makeCtx({});
    await expect(
      meetings.setStatus.handler(ctx, { roomName: 'nope', status: 'live' }),
    ).rejects.toThrow();
  });
});

// ─── setRecording ───────────────────────────────────────────────────────────

describe('setRecording', () => {
  it('attaches recording URL to event', async () => {
    const rows: any = {
      meetings: [{ _id: 'mtg1', roomName: 'room1', organizationId: ORG, eventId: 'evt1' }],
      calendarEvents: [{ _id: 'evt1', organizationId: ORG }],
    };
    const ctx = makeCtx(rows);
    const result = await meetings.setRecording.handler(ctx, {
      roomName: 'room1',
      recordingUrl: 'https://recording.url',
    });
    expect(result).toEqual({ success: true });
    expect(ctx.tableRows['calendarEvents'][0].videoRecordingUrl).toBe('https://recording.url');
  });

  it('throws when meeting not found', async () => {
    const ctx = makeCtx({});
    await expect(
      meetings.setRecording.handler(ctx, { roomName: 'nope', recordingUrl: 'x' }),
    ).rejects.toThrow();
  });
});

// ─── removeVideo ────────────────────────────────────────────────────────────

describe('removeVideo', () => {
  it('removes video link from event', async () => {
    const rows: any = {
      calendarEvents: [{ _id: 'evt1', organizationId: ORG, videoUrl: 'https://livekit.room' }],
    };
    const ctx = makeCtx(rows);
    const result = await meetings.removeVideo.handler(ctx, { eventId: 'evt1' as any });
    expect(result).toEqual({ success: true });
    const evt = ctx.tableRows['calendarEvents'][0];
    expect(evt.videoUrl).toBeUndefined();
    expect(evt.videoProvider).toBeUndefined();
  });

  it('throws when event not found', async () => {
    const ctx = makeCtx({});
    await expect(meetings.removeVideo.handler(ctx, { eventId: 'ghost' as any })).rejects.toThrow();
  });
});

// ─── updateLobbyAndRegistration ─────────────────────────────────────────────

describe('updateLobbyAndRegistration', () => {
  it('updates lobby settings on meeting', async () => {
    const rows: any = {
      meetings: [
        {
          _id: 'mtg1',
          roomName: 'room1',
          organizationId: ORG,
          hostUserId: adminUser._id,
          status: 'scheduled',
        },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await meetings.updateLobbyAndRegistration.handler(ctx, {
      roomName: 'room1',
      waitingRoomEnabled: true,
      registrationEnabled: false,
    });
    expect(result).toEqual({ success: true });
    expect(ctx.tableRows['meetings'][0].waitingRoomEnabled).toBe(true);
    expect(ctx.tableRows['meetings'][0].registrationEnabled).toBe(false);
  });
});
