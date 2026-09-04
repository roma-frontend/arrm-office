/**
 * Tests for convex/recurringTasks.ts and convex/meetingRooms.ts
 * Auth checks and default return paths.
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
jest.mock('../../convex/lib/entitlements', () => ({
  assertModuleAccess: jest.fn(),
}));
jest.mock('../../convex/lib/orgAccess', () => ({
  assertOrgStaff: jest.fn(),
  assertOrgScope: jest.fn(),
  resolveOrgScope: jest.fn(),
  scopeOwnsRecord: jest.fn(),
}));
jest.mock('../../convex/lib/rbac', () => ({
  canAccessUser: jest.fn(),
}));
jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn(),
}));
jest.mock('../../convex/lib/notify', () => ({
  notify: jest.fn(),
}));

let recurringHandlers: Record<string, any> = {};
let meetingHandlers: Record<string, any> = {};

beforeEach(() => {
  jest.clearAllMocks();

  jest.isolateModules(() => {
    const mod = require('../../convex/recurringTasks');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        recurringHandlers[name] = (def as any).handler;
      }
    }
  });

  jest.isolateModules(() => {
    const mod = require('../../convex/meetingRooms');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        meetingHandlers[name] = (def as any).handler;
      }
    }
  });
});

function makeCtx(userOverride?: any) {
  const get = jest.fn();
  const db: any = {
    get,
    insert: jest.fn().mockResolvedValue('new_id'),
    patch: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(() => ({
      withIndex: jest.fn(() => ({
        first: jest.fn().mockResolvedValue(null),
        filter: jest.fn(() => ({
          first: jest.fn().mockResolvedValue(null),
          take: jest.fn().mockResolvedValue([]),
        })),
        take: jest.fn().mockResolvedValue([]),
        order: jest.fn(() => ({
          take: jest.fn().mockResolvedValue([]),
        })),
      })),
      filter: jest.fn(() => ({
        take: jest.fn().mockResolvedValue([]),
      })),
      order: jest.fn(() => ({
        take: jest.fn().mockResolvedValue([]),
      })),
      take: jest.fn().mockResolvedValue([]),
    })),
  };
  return { ctx: { db }, get, db };
}

describe('recurringTasks', () => {
  describe('listRecurringTasks', () => {
    it('returns empty when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      const result = await recurringHandlers.listRecurringTasks(ctx, {
        organizationId: 'org_1' as any,
      });
      expect(result).toEqual([]);
    });
  });

  describe('listRecurringTaskComments', () => {
    it('throws when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      await expect(
        recurringHandlers.listRecurringTaskComments(ctx, {
          recurringTaskId: 'rt_1' as any,
        }),
      ).rejects.toThrow();
    });
  });

  describe('getRecurringTaskOccurrences', () => {
    it('returns empty when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      const result = await recurringHandlers.getRecurringTaskOccurrences(ctx, {
        recurringTaskId: 'rt_1' as any,
      });
      expect(result).toEqual([]);
    });
  });

  describe('deleteRecurringTask', () => {
    it('throws when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      await expect(
        recurringHandlers.deleteRecurringTask(ctx, {
          recurringTaskId: 'rt_1' as any,
        }),
      ).rejects.toThrow('Not authenticated');
    });
  });

  describe('deleteRecurringTaskComment', () => {
    it('throws when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      await expect(
        recurringHandlers.deleteRecurringTaskComment(ctx, {
          commentId: 'c_1' as any,
        }),
      ).rejects.toThrow('Not authenticated');
    });
  });
});

describe('meetingRooms', () => {
  describe('listRooms', () => {
    it('returns empty when no auth', async () => {
      const { ctx } = makeCtx();
      const { resolveOrgScope } = require('../../convex/lib/orgAccess');
      resolveOrgScope.mockResolvedValue(null);

      const result = await meetingHandlers.listRooms(ctx, {
        organizationId: 'org_1' as any,
      });
      expect(result).toEqual([]);
    });
  });

  describe('getMyBookings', () => {
    it('returns empty when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      const result = await meetingHandlers.getMyBookings(ctx, {});
      expect(result).toEqual([]);
    });
  });

  describe('cancelBooking', () => {
    it('throws when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      await expect(
        meetingHandlers.cancelBooking(ctx, {
          bookingId: 'b_1' as any,
        }),
      ).rejects.toThrow('Not authenticated');
    });
  });

  describe('respondToBooking', () => {
    it('throws when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      await expect(
        meetingHandlers.respondToBooking(ctx, {
          bookingId: 'b_1' as any,
          response: 'accept' as any,
        }),
      ).rejects.toThrow('Not authenticated');
    });
  });

  describe('checkInBooking', () => {
    it('throws when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      await expect(
        meetingHandlers.checkInBooking(ctx, {
          bookingId: 'b_1' as any,
        }),
      ).rejects.toThrow('Not authenticated');
    });
  });

  describe('getBookingPlatformStats', () => {
    it('returns empty when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      const result = await meetingHandlers.getBookingPlatformStats(ctx, {
        organizationId: 'org_1' as any,
      });
      expect(result).toEqual({});
    });
  });
});
