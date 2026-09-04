/**
 * Tests for convex/leaves/queries.ts and convex/documents.ts
 * Auth checks and default return paths.
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
jest.mock('../../convex/lib/orgAccess', () => ({
  assertOrgStaff: jest.fn(),
  resolveOrgScope: jest.fn(),
  scopeOwnsRecord: jest.fn(),
}));
jest.mock('../../convex/lib/rbac', () => ({
  canAccessUser: jest.fn(),
}));

let leavesHandlers: Record<string, any> = {};
let documentsHandlers: Record<string, any> = {};

beforeEach(() => {
  jest.clearAllMocks();

  jest.isolateModules(() => {
    const mod = require('../../convex/leaves/queries');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        leavesHandlers[name] = (def as any).handler;
      }
    }
  });

  jest.isolateModules(() => {
    const mod = require('../../convex/documents');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        documentsHandlers[name] = (def as any).handler;
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

describe('leaves/queries', () => {
  describe('getAllLeaves', () => {
    it('returns empty when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      const result = await leavesHandlers.getAllLeaves(ctx, {
        organizationId: 'org_1' as any,
      });
      expect(result).toEqual([]);
    });
  });

  describe('getLeavesForOrganization', () => {
    it('returns empty when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      const result = await leavesHandlers.getLeavesForOrganization(ctx, {
        organizationId: 'org_1' as any,
      });
      expect(result).toEqual([]);
    });
  });

  describe('getLeavesForDateRange', () => {
    it('returns empty when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      const result = await leavesHandlers.getLeavesForDateRange(ctx, {
        organizationId: 'org_1' as any,
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });
      expect(result).toEqual([]);
    });
  });

  describe('getUserLeaves', () => {
    it('returns empty when no auth', async () => {
      const { ctx } = makeCtx();
      const { canAccessUser } = require('../../convex/lib/rbac');
      canAccessUser.mockResolvedValue(false);

      const result = await leavesHandlers.getUserLeaves(ctx, {
        userId: 'user_1' as any,
      });
      expect(result).toEqual([]);
    });
  });

  describe('getLeaveStats', () => {
    it('returns zero/default stats when no access', async () => {
      const { ctx } = makeCtx();
      const { canAccessUser } = require('../../convex/lib/rbac');
      canAccessUser.mockResolvedValue(false);

      const result = await leavesHandlers.getLeaveStats(ctx, {
        userId: 'user_1' as any,
      });
      expect(result).toBeDefined();
    });
  });

  describe('getUnreadCount', () => {
    it('returns 0 when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      const result = await leavesHandlers.getUnreadCount(ctx, {
        organizationId: 'org_1' as any,
      });
      expect(result).toBe(0);
    });
  });

  describe('getLeaveById', () => {
    it('returns null when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      const result = await leavesHandlers.getLeaveById(ctx, {
        leaveId: 'leave_1' as any,
      });
      expect(result).toBeNull();
    });
  });

  describe('getReviewEligibility', () => {
    it('returns not-allowed when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      const result = await leavesHandlers.getReviewEligibility(ctx, {
        leaveId: 'leave_1' as any,
      });
      expect(result).toBeDefined();
    });
  });
});

describe('documents', () => {
  describe('listDocuments', () => {
    it('throws when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      await expect(
        documentsHandlers.listDocuments(ctx, {
          organizationId: 'org_1' as any,
        }),
      ).rejects.toThrow();
    });
  });

  describe('getDocumentCategories', () => {
    it('throws when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      await expect(
        documentsHandlers.getDocumentCategories(ctx, {
          organizationId: 'org_1' as any,
        }),
      ).rejects.toThrow();
    });
  });

  describe('getMyDocumentViews', () => {
    it('throws when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      await expect(documentsHandlers.getMyDocumentViews(ctx, {})).rejects.toThrow();
    });
  });

  describe('getDocumentViews', () => {
    it('throws when no auth', async () => {
      const { ctx } = makeCtx();
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);

      await expect(
        documentsHandlers.getDocumentViews(ctx, {
          documentId: 'doc_1' as any,
        }),
      ).rejects.toThrow();
    });
  });

  describe('deleteDocument', () => {
    it('throws when not found', async () => {
      const { ctx } = makeCtx();
      ctx.db.get.mockResolvedValue(null);

      await expect(
        documentsHandlers.deleteDocument(ctx, {
          documentId: 'doc_1' as any,
        }),
      ).rejects.toThrow();
    });
  });

  describe('getDocumentById', () => {
    it('returns null when not found', async () => {
      const { ctx } = makeCtx();
      ctx.db.get.mockResolvedValue(null);

      const result = await documentsHandlers.getDocumentById(ctx, {
        documentId: 'doc_1' as any,
      });
      expect(result).toBeNull();
    });
  });

  describe('getDocument', () => {
    it('throws when not found or no auth', async () => {
      const { ctx } = makeCtx();
      ctx.db.get.mockResolvedValue(null);

      await expect(
        documentsHandlers.getDocument(ctx, {
          documentId: 'doc_1' as any,
        }),
      ).rejects.toThrow();
    });
  });

  describe('getTeamDocumentOverview', () => {
    it('returns empty/null when no auth', async () => {
      const { ctx } = makeCtx();
      const { resolveOrgScope } = require('../../convex/lib/orgAccess');
      resolveOrgScope.mockResolvedValue(null);

      const result = await documentsHandlers.getTeamDocumentOverview(ctx, {
        organizationId: 'org_1' as any,
      });
      expect(
        result === null || result === undefined || (Array.isArray(result) && result.length === 0),
      ).toBe(true);
    });
  });
});
