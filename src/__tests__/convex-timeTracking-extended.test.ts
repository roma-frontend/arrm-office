/**
 * Tests for convex/timeTracking.ts — focused on pure helpers
 * and handler-level tests for check-in/check-out logic.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

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
jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn(),
}));
jest.mock('../../convex/lib/entitlements', () => ({
  assertModuleAccess: jest.fn(),
}));
jest.mock('../../convex/lib/capabilities', () => ({
  hasCapability: jest.fn(),
  hasOrgWideReach: jest.fn(),
}));
jest.mock('../../convex/lib/reportingLine', () => ({
  isAncestorOf: jest.fn(),
  getSubordinateIds: jest.fn(),
}));
jest.mock('../../convex/lib/rbac', () => ({
  canAccessUser: jest.fn(),
}));
jest.mock('../../convex/lib/points', () => ({
  creditBalance: jest.fn(),
  resolveRecognitionSettings: jest.fn(),
}));
jest.mock('../../convex/lib/systemAccounts', () => ({
  isSystemAccountEmail: jest.fn(),
}));

let handlers: Record<string, any> = {};

beforeEach(() => {
  jest.clearAllMocks();
  jest.isolateModules(() => {
    const mod = require('../../convex/timeTracking');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      }
    }
  });
});

function makeCtx() {
  const get = jest.fn();
  const db: any = {
    get,
    insert: jest.fn().mockResolvedValue('new_id'),
    patch: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(() => ({
      withIndex: jest.fn(() => ({
        first: jest.fn().mockResolvedValue(null),
        filter: jest.fn(() => ({
          first: jest.fn().mockResolvedValue(null),
        })),
        take: jest.fn().mockResolvedValue([]),
        order: jest.fn(() => ({
          take: jest.fn().mockResolvedValue([]),
        })),
      })),
      order: jest.fn(() => ({
        take: jest.fn().mockResolvedValue([]),
      })),
      take: jest.fn().mockResolvedValue([]),
    })),
  };
  return {
    ctx: { db, auth: { getUserIdentity: jest.fn().mockResolvedValue({ subject: 'user_1' }) } },
    get,
    db,
  };
}

describe('timeTracking', () => {
  describe('getTodayStatus', () => {
    it('returns null when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { canAccessUser } = require('../../convex/lib/rbac');
      canAccessUser.mockResolvedValue(false);

      const result = await handlers.getTodayStatus(ctx, { userId: 'user_1' as any });
      expect(result).toBeNull();
    });
  });

  describe('getUserHistory', () => {
    it('returns empty when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { canAccessUser } = require('../../convex/lib/rbac');
      canAccessUser.mockResolvedValue(false);

      const result = await handlers.getUserHistory(ctx, { userId: 'user_1' as any });
      expect(result).toEqual([]);
    });
  });

  describe('getRecentAttendance', () => {
    it('returns empty when no access', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { canAccessUser } = require('../../convex/lib/rbac');
      canAccessUser.mockResolvedValue(false);

      const result = await handlers.getRecentAttendance(ctx, { userId: 'user_1' as any });
      expect(result).toEqual([]);
    });
  });

  describe('getMonthlyStats', () => {
    it('returns default stats when no access', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { canAccessUser } = require('../../convex/lib/rbac');
      canAccessUser.mockResolvedValue(false);

      const result = await handlers.getMonthlyStats(ctx, {
        userId: 'user_1' as any,
        month: '2025-01',
      });
      expect(result.totalDays).toBe(0);
      expect(result.lateDays).toBe(0);
      expect(result.punctualityRate).toBe('100');
    });
  });

  describe('getTodayAttendanceSummary', () => {
    it('returns zero summary when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      const result = await handlers.getTodayAttendanceSummary(ctx, {
        adminId: 'admin_1' as any,
      });
      expect(result.totalActive).toBe(0);
      expect(result.checkedIn).toBe(0);
      expect(result.attendanceRate).toBe('0');
    });
  });

  describe('getCurrentlyAtWork', () => {
    it('returns empty when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      const result = await handlers.getCurrentlyAtWork(ctx, {
        adminId: 'admin_1' as any,
      });
      expect(result).toEqual([]);
    });
  });

  describe('getTodayAllAttendance', () => {
    it('returns empty when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      const result = await handlers.getTodayAllAttendance(ctx, {
        adminId: 'admin_1' as any,
      });
      expect(result).toEqual([]);
    });
  });
});
