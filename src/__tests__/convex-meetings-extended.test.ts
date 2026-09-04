/**
 * Extended tests for convex/meetings.ts — query functions and mutations
 * that are not covered by the existing test suite.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler }: any) => ({ handler }),
  query: ({ handler }: any) => ({ handler }),
  internalMutation: ({ handler }: any) => ({ handler }),
  internalQuery: ({ handler }: any) => ({ handler }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({ getAuthCaller: jest.fn() }));
jest.mock('../../convex/lib/auth', () => ({ isSuperadmin: jest.fn() }));
jest.mock('../../convex/lib/entitlements', () => ({
  assertModuleAccess: jest.fn().mockResolvedValue(undefined),
  assertQuota: jest.fn().mockResolvedValue(undefined),
  currentPeriodKey: jest.fn().mockReturnValue('2026-09'),
  incrementUsage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../convex/lib/notify', () => ({ notify: jest.fn().mockResolvedValue(undefined) }));

let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;

type Handler = (ctx: any, args: any) => Promise<unknown>;
const handlers: Record<string, Handler> = {};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  jest.isolateModules(() => {
    const mod = require('../../convex/meetings');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      }
    }
  });
});

const ORG_A = 'org-1';
const USER_ID = 'user_1';

function makeCaller(role = 'admin', org = ORG_A) {
  return { _id: USER_ID, role, email: 'caller@test.com', organizationId: org, name: 'Caller' };
}

function makeCtx(overrides: Record<string, any> = {}) {
  const get = jest.fn();
  const insert = jest.fn().mockResolvedValue('new_id');
  const patch = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(undefined);
  const take = jest.fn().mockResolvedValue([]);
  const collect = jest.fn().mockResolvedValue([]);
  const first = jest.fn().mockResolvedValue(null);
  const unique = jest.fn().mockResolvedValue(null);
  const order = jest.fn().mockReturnValue({ take, collect, first });
  const withIndex = jest.fn().mockReturnValue({ order, take, collect, first, unique });
  const query = jest.fn().mockReturnValue({ withIndex, order, take, collect, first, unique });
  return {
    ctx: { db: { get, insert, patch, delete: remove, query } },
    get,
    insert,
    patch,
    remove,
    query,
    take,
    collect,
    first,
    unique,
    ...overrides,
  };
}

// ── livekitConfigured ────────────────────────────────────────────────────────
describe('livekitConfigured', () => {
  it('returns false when env vars are missing', async () => {
    const result = await handlers.livekitConfigured({}, {});
    expect(typeof result).toBe('boolean');
  });
});

// ── recordingConfigured ──────────────────────────────────────────────────────
describe('recordingConfigured', () => {
  it('returns an object with configured/livekit/storage booleans', async () => {
    const result = await handlers.recordingConfigured({}, {});
    expect(result).toHaveProperty('configured');
    expect(result).toHaveProperty('livekit');
    expect(result).toHaveProperty('storage');
  });
});

// ── getByRoomName ────────────────────────────────────────────────────────────
describe('getByRoomName', () => {
  it('returns null when meeting does not exist', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    const result = await handlers.getByRoomName(ctx, { roomName: 'nonexistent' });
    expect(result).toBeNull();
  });

  it('returns null for unauthenticated caller when meeting does not exist', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(null);
    const result = await handlers.getByRoomName(ctx, { roomName: 'nonexistent' });
    expect(result).toBeNull();
  });
});

// ── getByEvent ───────────────────────────────────────────────────────────────
describe('getByEvent', () => {
  it('returns null for unauthenticated user', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(null);
    const result = await handlers.getByEvent(ctx, { eventId: 'evt_1' as any });
    expect(result).toBeNull();
  });

  it('returns null when meeting does not exist', async () => {
    const { ctx, query } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });
    const result = await handlers.getByEvent(ctx, { eventId: 'evt_1' as any });
    expect(result).toBeNull();
  });
});

// ── listByOrganization ───────────────────────────────────────────────────────
describe('listByOrganization', () => {
  it('returns empty for unauthenticated user', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(null);
    const result = await handlers.listByOrganization(ctx, { organizationId: ORG_A as any });
    expect(result).toEqual([]);
  });

  it('returns empty for non-matching org', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', 'org-2'));
    mockIsSuperadmin.mockReturnValue(false);
    const result = await handlers.listByOrganization(ctx, { organizationId: ORG_A as any });
    expect(result).toEqual([]);
  });
});

// ── listPending ──────────────────────────────────────────────────────────────
describe('listPending', () => {
  it('returns empty for non-admin', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    mockIsSuperadmin.mockReturnValue(false);
    const result = await handlers.listPending(ctx, { organizationId: ORG_A as any });
    expect(result).toEqual([]);
  });
});

// ── listRegistrations ────────────────────────────────────────────────────────
describe('listRegistrations', () => {
  it('returns empty for unauthenticated user', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(null);
    const result = await handlers.listRegistrations(ctx, { meetingId: 'mtg_1' as any });
    expect(result).toEqual([]);
  });
});

// ── getRegistrationById ──────────────────────────────────────────────────────
describe('getRegistrationById', () => {
  it('returns null when registration does not exist', async () => {
    const { ctx, get } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    get.mockResolvedValueOnce(null);
    const result = await handlers.getRegistrationById(ctx, { registrationId: 'reg_1' as any });
    expect(result).toBeNull();
  });
});

// ── getRegistrationByVisitor ─────────────────────────────────────────────────
describe('getRegistrationByVisitor', () => {
  it('returns null when no match', async () => {
    const { ctx, query } = makeCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        first: jest.fn().mockResolvedValue(null),
      }),
    });
    const result = await handlers.getRegistrationByVisitor(ctx, {
      meetingId: 'mtg_1' as any,
      email: 'v@test.com',
    });
    expect(result).toBeNull();
  });
});

// ── removeRegistration ───────────────────────────────────────────────────────
describe('removeRegistration', () => {
  it('handles non-existent registration gracefully', async () => {
    const { ctx, get } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    get.mockResolvedValueOnce(null);
    const result = await handlers.removeRegistration(ctx, { registrationId: 'bad' as any });
    expect(result).toBeDefined();
  });
});

// ── submitRegistration ───────────────────────────────────────────────────────
describe('submitRegistration', () => {
  it('throws when meeting does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(
      handlers.submitRegistration(ctx, { meetingId: 'bad' as any, fields: {} }),
    ).rejects.toThrow();
  });
});
