/**
 * Extended tests for convex/calendarEvents.ts — error paths and query functions.
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
    const mod = require('../../convex/calendarEvents');
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

function makeCtx() {
  const get = jest.fn();
  const insert = jest.fn().mockResolvedValue('new_id');
  const patch = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(undefined);
  const take = jest.fn().mockResolvedValue([]);
  const collect = jest.fn().mockResolvedValue([]);
  const first = jest.fn().mockResolvedValue(null);
  const order = jest.fn().mockReturnValue({ take, collect, first });
  const withIndex = jest.fn().mockReturnValue({ order, take, collect, first });
  const query = jest.fn().mockReturnValue({ withIndex, order, take, collect, first });
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
  };
}

// ── respondToEventInvite ─────────────────────────────────────────────────────
describe('respondToEventInvite', () => {
  it('throws when event does not exist', async () => {
    const { ctx, get } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    get.mockResolvedValueOnce(null);
    await expect(
      handlers.respondToEventInvite(ctx, { eventId: 'bad' as any, response: 'accepted' }),
    ).rejects.toThrow();
  });
});

// ── getMyAccessState ─────────────────────────────────────────────────────────
describe('getMyAccessState', () => {
  it('returns access state for authenticated user', async () => {
    const { ctx, query } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ first: jest.fn().mockResolvedValue(null) }),
    });
    const result = await handlers.getMyAccessState(ctx, {});
    expect(result).toBeDefined();
  });
});

// ── listPendingCalendarAccessRequests ────────────────────────────────────────
describe('listPendingCalendarAccessRequests', () => {
  it('returns empty for non-admin', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    mockIsSuperadmin.mockReturnValue(false);
    const result = await handlers.listPendingCalendarAccessRequests(ctx, {
      organizationId: ORG_A as any,
    });
    expect(result).toEqual([]);
  });
});

// ── requestCalendarAccess ────────────────────────────────────────────────────
describe('requestCalendarAccess', () => {
  it('throws when target user does not exist', async () => {
    const { ctx, get } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    get.mockResolvedValueOnce(null);
    await expect(
      handlers.requestCalendarAccess(ctx, { targetUserId: 'bad' as any }),
    ).rejects.toThrow();
  });
});

// ── respondToCalendarAccess ──────────────────────────────────────────────────
describe('respondToCalendarAccess', () => {
  it('throws when request does not exist', async () => {
    const { ctx, get } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    get.mockResolvedValueOnce(null);
    await expect(
      handlers.respondToCalendarAccess(ctx, { requestId: 'bad' as any, accept: true }),
    ).rejects.toThrow();
  });
});

// ── revokeCalendarAccess ─────────────────────────────────────────────────────
describe('revokeCalendarAccess', () => {
  it('handles non-existent viewer gracefully', async () => {
    const { ctx, get } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    get.mockResolvedValueOnce(null);
    const result = await handlers.revokeCalendarAccess(ctx, { viewerUserId: 'bad' as any });
    expect(result).toBeDefined();
  });
});

// ── rememberCalendarView ─────────────────────────────────────────────────────
describe('rememberCalendarView', () => {
  it('does not throw for valid input', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    await handlers.rememberCalendarView(ctx, { view: 'week', organizationId: ORG_A as any });
  });
});

// ── listMyCalendarViewers ────────────────────────────────────────────────────
describe('listMyCalendarViewers', () => {
  it('returns viewers for authenticated user', async () => {
    const { ctx, query } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ take: jest.fn().mockResolvedValue([]) }),
    });
    const result = await handlers.listMyCalendarViewers(ctx, {});
    expect(result).toEqual([]);
  });
});

// ── remove ───────────────────────────────────────────────────────────────────
describe('remove', () => {
  it('handles non-existent event gracefully', async () => {
    const { ctx, get } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    get.mockResolvedValueOnce(null);
    const result = await handlers.remove(ctx, { eventId: 'bad' as any });
    expect(result).toBeDefined();
  });
});

// ── getByOrganization ────────────────────────────────────────────────────────
describe('getByOrganization', () => {
  it('returns empty for non-matching org', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', 'org-2'));
    mockIsSuperadmin.mockReturnValue(false);
    const result = await handlers.getByOrganization(ctx, { organizationId: ORG_A as any });
    expect(result).toEqual([]);
  });
});

// ── RSVP_RESPONSES ───────────────────────────────────────────────────────────
describe('RSVP_RESPONSES', () => {
  it('includes all expected values', () => {
    const { RSVP_RESPONSES } = require('../../convex/calendarEvents');
    expect(RSVP_RESPONSES).toContain('accepted');
    expect(RSVP_RESPONSES).toContain('declined');
    expect(RSVP_RESPONSES).toContain('tentative');
    expect(RSVP_RESPONSES).toContain('needs_action');
  });
});
