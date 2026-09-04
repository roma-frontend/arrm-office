/**
 * Tests for convex/organizationRequests.ts — auth checks, validation,
 * and default return paths.
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
  SUPERADMIN_EMAIL: 'admin@strata.com',
}));
jest.mock('../../convex/lib/notify', () => ({
  notify: jest.fn(),
}));
jest.mock('../../convex/billing/plans', () => ({
  resolveBillingPlanLink: jest.fn().mockResolvedValue({ planId: 'plan_1', planVersion: 1 }),
}));

let handlers: Record<string, any> = {};

beforeEach(() => {
  jest.clearAllMocks();
  jest.isolateModules(() => {
    const mod = require('../../convex/organizationRequests');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      }
    }
  });
});

function makeCtx(userOverride?: any) {
  const get = jest.fn();
  const byEmail = jest.fn(() => ({
    unique: jest.fn().mockResolvedValue(userOverride ?? null),
  }));
  const bySlug = jest.fn(() => ({
    unique: jest.fn().mockResolvedValue(null),
  }));
  const byStatus = jest.fn(() => ({
    order: jest.fn(() => ({
      take: jest.fn().mockResolvedValue([]),
    })),
    take: jest.fn().mockResolvedValue([]),
  }));

  const db: any = {
    get,
    insert: jest.fn().mockResolvedValue('new_id'),
    patch: jest.fn().mockResolvedValue(undefined),
    query: jest.fn((table: string) => ({
      withIndex: jest.fn((idxName: string) => {
        if (idxName === 'by_email') return { unique: byEmail().unique };
        if (idxName === 'by_slug') return { unique: bySlug().unique };
        if (idxName === 'by_status') return byStatus();
        return { unique: jest.fn().mockResolvedValue(null), take: jest.fn().mockResolvedValue([]) };
      }),
      filter: jest.fn(() => ({
        unique: jest.fn().mockResolvedValue(null),
        take: jest.fn().mockResolvedValue([]),
      })),
      order: jest.fn(() => ({
        take: jest.fn().mockResolvedValue([]),
      })),
      take: jest.fn().mockResolvedValue([]),
    })),
  };
  return { ctx: { db }, get, db, byEmail, bySlug, byStatus };
}

describe('organizationRequests', () => {
  describe('getOrganizationRequests', () => {
    it('throws when not superadmin', async () => {
      const { ctx } = makeCtx();
      const { isSuperadmin } = require('../../convex/lib/auth');
      isSuperadmin.mockReturnValue(false);

      await expect(
        handlers.getOrganizationRequests(ctx, {
          superadminUserId: 'user_1' as any,
        }),
      ).rejects.toThrow('Superadmin only');
    });
  });

  describe('getPendingRequestCount', () => {
    it('returns 0 when not superadmin', async () => {
      const { ctx } = makeCtx();
      ctx.db.get.mockResolvedValue({ role: 'employee' });
      const { isSuperadmin } = require('../../convex/lib/auth');
      isSuperadmin.mockReturnValue(false);

      const result = await handlers.getPendingRequestCount(ctx, {
        superadminUserId: 'user_1' as any,
      });
      expect(result).toBe(0);
    });
  });

  describe('approveOrganizationRequest', () => {
    it('throws when not superadmin', async () => {
      const { ctx } = makeCtx();
      const { isSuperadmin } = require('../../convex/lib/auth');
      isSuperadmin.mockReturnValue(false);
      ctx.db.get.mockResolvedValue({ role: 'employee' });

      await expect(
        handlers.approveOrganizationRequest(ctx, {
          superadminUserId: 'user_1' as any,
          requestId: 'req_1' as any,
        }),
      ).rejects.toThrow('Only superadmin');
    });

    it('throws when request not found', async () => {
      const { ctx } = makeCtx();
      const { isSuperadmin } = require('../../convex/lib/auth');
      isSuperadmin.mockReturnValue(true);
      ctx.db.get.mockResolvedValueOnce({ role: 'superadmin' });
      ctx.db.get.mockResolvedValueOnce(null);

      await expect(
        handlers.approveOrganizationRequest(ctx, {
          superadminUserId: 'user_1' as any,
          requestId: 'req_1' as any,
        }),
      ).rejects.toThrow('Request not found');
    });

    it('throws when request already reviewed', async () => {
      const { ctx } = makeCtx();
      const { isSuperadmin } = require('../../convex/lib/auth');
      isSuperadmin.mockReturnValue(true);
      ctx.db.get.mockResolvedValueOnce({ role: 'superadmin' });
      ctx.db.get.mockResolvedValueOnce({ status: 'approved' });

      await expect(
        handlers.approveOrganizationRequest(ctx, {
          superadminUserId: 'user_1' as any,
          requestId: 'req_1' as any,
        }),
      ).rejects.toThrow('already been reviewed');
    });
  });

  describe('rejectOrganizationRequest', () => {
    it('throws when not superadmin', async () => {
      const { ctx } = makeCtx();
      const { isSuperadmin } = require('../../convex/lib/auth');
      isSuperadmin.mockReturnValue(false);
      ctx.db.get.mockResolvedValue({ role: 'employee' });

      await expect(
        handlers.rejectOrganizationRequest(ctx, {
          superadminUserId: 'user_1' as any,
          requestId: 'req_1' as any,
        }),
      ).rejects.toThrow('Only superadmin');
    });

    it('throws when request already reviewed', async () => {
      const { ctx } = makeCtx();
      const { isSuperadmin } = require('../../convex/lib/auth');
      isSuperadmin.mockReturnValue(true);
      ctx.db.get.mockResolvedValueOnce({ role: 'superadmin' });
      ctx.db.get.mockResolvedValueOnce({ status: 'rejected' });

      await expect(
        handlers.rejectOrganizationRequest(ctx, {
          superadminUserId: 'user_1' as any,
          requestId: 'req_1' as any,
        }),
      ).rejects.toThrow('already been reviewed');
    });
  });

  describe('secureApproveOrgRequest', () => {
    it('throws when not authenticated', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      await expect(
        handlers.secureApproveOrgRequest(ctx, {
          requestId: 'req_1' as any,
        }),
      ).rejects.toThrow('Not authenticated');
    });

    it('throws when request not found', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue({ _id: 'admin_1', role: 'admin' });
      ctx.db.get.mockResolvedValue(null);

      await expect(
        handlers.secureApproveOrgRequest(ctx, {
          requestId: 'req_1' as any,
        }),
      ).rejects.toThrow('Request not found');
    });
  });

  describe('secureRejectOrgRequest', () => {
    it('throws when not authenticated', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      await expect(
        handlers.secureRejectOrgRequest(ctx, {
          requestId: 'req_1' as any,
        }),
      ).rejects.toThrow('Not authenticated');
    });
  });
});
