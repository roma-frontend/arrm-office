/**
 * Tests for convex/recruitment.ts and convex/superadmin/operatorTools.ts
 * Auth checks, core query/mutation flows.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
  internalAction: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({ getAuthCaller: jest.fn() }));
jest.mock('../../convex/lib/auth', () => ({ isSuperadmin: jest.fn(() => false) }));
jest.mock('../../convex/lib/notify', () => ({ notify: jest.fn() }));
jest.mock('../../convex/lib/entitlements', () => ({ assertModuleAccess: jest.fn() }));
jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn(() => Promise.resolve(null)),
}));

let recruitmentHandlers: Record<string, any> = {};
let operatorHandlers: Record<string, any> = {};

beforeEach(() => {
  jest.clearAllMocks();
  jest.isolateModules(() => {
    const mod = require('../../convex/recruitment');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function')
        recruitmentHandlers[name] = (def as any).handler;
    }
  });
  jest.isolateModules(() => {
    const mod = require('../../convex/superadmin/operatorTools');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function')
        operatorHandlers[name] = (def as any).handler;
    }
  });
});

function makeCtx(tables: Record<string, any[]> = {}) {
  const get = jest.fn().mockResolvedValue(null);
  const db: any = {
    get,
    insert: jest.fn().mockResolvedValue('new_id'),
    patch: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    query: jest.fn((table: string) => {
      const rows = tables[table] ?? [];
      let filters: Record<string, any> = {};
      const chain: any = {
        withIndex: (idxName: string, cb: any) => {
          const cap = {
            eq: (k: string, v: any) => {
              filters[k] = v;
              return cap;
            },
          };
          if (cb) cb(cap);
          return chain;
        },
        filter: (cb: any) => chain,
        order: () => chain,
        take: jest.fn().mockResolvedValue(
          rows.filter((r) => {
            for (const [k, v] of Object.entries(filters)) {
              if (r[k] !== v) return false;
            }
            return true;
          }),
        ),
        first: jest.fn().mockResolvedValue(
          rows.filter((r) => {
            for (const [k, v] of Object.entries(filters)) {
              if (r[k] !== v) return false;
            }
            return true;
          })[0] ?? null,
        ),
        unique: jest.fn().mockResolvedValue(
          rows.filter((r) => {
            for (const [k, v] of Object.entries(filters)) {
              if (r[k] !== v) return false;
            }
            return true;
          })[0] ?? null,
        ),
      };
      return chain;
    }),
  };
  return { ctx: { db }, get, db };
}

// ═══════════════════════════════════════════════════════════════════════════
// RECRUITMENT
// ═══════════════════════════════════════════════════════════════════════════
describe('recruitment', () => {
  describe('listVacancies', () => {
    it('returns empty when no auth', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      const result = await recruitmentHandlers.listVacancies(ctx, {
        organizationId: 'org1' as any,
      });
      expect(result).toEqual([]);
    });

    it('returns vacancies', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'admin', organizationId: 'org1' });
      const { ctx } = makeCtx({
        vacancies: [{ _id: 'v1', organizationId: 'org1', title: 'Dev', isActive: true }],
      });
      const result = await recruitmentHandlers.listVacancies(ctx, {
        organizationId: 'org1' as any,
      });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getVacancy', () => {
    it('returns null when not found', async () => {
      const { ctx } = makeCtx({});
      const result = await recruitmentHandlers.getVacancy(ctx, { vacancyId: 'v_x' as any });
      expect(result).toBeNull();
    });
  });

  describe('getMyInterviews', () => {
    it('returns empty when no auth', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      const result = await recruitmentHandlers.getMyInterviews(ctx, {});
      expect(result).toEqual([]);
    });
  });

  describe('getPipelineStats', () => {
    it('returns stats', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'admin', organizationId: 'org1' });
      const { ctx } = makeCtx({
        recruitmentCandidates: [{ _id: 'c1', organizationId: 'org1', stage: 'applied' }],
      });
      const result = await recruitmentHandlers.getPipelineStats(ctx, {
        organizationId: 'org1' as any,
      });
      expect(result).toBeDefined();
    });
  });

  describe('createVacancy', () => {
    it('throws when not authenticated', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      await expect(
        recruitmentHandlers.createVacancy(ctx, {
          title: 'Dev',
          organizationId: 'org1' as any,
          department: 'Eng',
          description: 'Job',
        }),
      ).rejects.toThrow();
    });
  });

  describe('deleteVacancy', () => {
    it('throws when not authenticated', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      await expect(
        recruitmentHandlers.deleteVacancy(ctx, { vacancyId: 'v1' as any }),
      ).rejects.toThrow();
    });
  });

  describe('addCandidate', () => {
    it('throws when not authenticated', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      await expect(
        recruitmentHandlers.addCandidate(ctx, {
          vacancyId: 'v1' as any,
          name: 'Candidate',
          email: 'c@test.com',
        }),
      ).rejects.toThrow();
    });
  });

  describe('getCandidateHistory', () => {
    it('returns empty/null when no auth', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      const result = await recruitmentHandlers.getCandidateHistory(ctx, {
        candidateId: 'c1' as any,
      });
      expect(
        result === null || result === undefined || (Array.isArray(result) && result.length === 0),
      ).toBe(true);
    });
  });

  describe('listAllCandidates', () => {
    it('returns empty when no auth', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      const result = await recruitmentHandlers.listAllCandidates(ctx, {
        organizationId: 'org1' as any,
      });
      expect(result).toEqual([]);
    });
  });

  describe('blockCandidate', () => {
    it('throws when not authenticated', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      await expect(
        recruitmentHandlers.blockCandidate(ctx, { candidateId: 'c1' as any }),
      ).rejects.toThrow();
    });
  });

  describe('unblockCandidate', () => {
    it('throws when not authenticated', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      await expect(
        recruitmentHandlers.unblockCandidate(ctx, { candidateId: 'c1' as any }),
      ).rejects.toThrow();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OPERATOR TOOLS
// ═══════════════════════════════════════════════════════════════════════════
describe('operatorTools', () => {
  describe('listI18nOverrides', () => {
    it('returns empty when no auth', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      const result = await operatorHandlers.listI18nOverrides(ctx, {});
      expect(result).toEqual([]);
    });
  });

  describe('setI18nOverride', () => {
    it('throws when not authenticated', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      await expect(
        operatorHandlers.setI18nOverride(ctx, { key: 'k', value: 'v', locale: 'en' }),
      ).rejects.toThrow();
    });
  });

  describe('deleteI18nOverride', () => {
    it('throws when not authenticated', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      await expect(
        operatorHandlers.deleteI18nOverride(ctx, { overrideId: 'o1' as any }),
      ).rejects.toThrow();
    });
  });

  describe('listPlatformLimits', () => {
    it('returns limits for superadmin', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'superadmin' });
      const { ctx } = makeCtx({});
      const result = await operatorHandlers.listPlatformLimits(ctx, {});
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('setPlatformLimit', () => {
    it('throws when not authenticated', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      await expect(
        operatorHandlers.setPlatformLimit(ctx, { key: 'maxUsers', value: 100 }),
      ).rejects.toThrow();
    });
  });

  describe('resetPlatformLimit', () => {
    it('throws when not authenticated', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      await expect(operatorHandlers.resetPlatformLimit(ctx, { key: 'maxUsers' })).rejects.toThrow();
    });
  });

  describe('listScheduledOps', () => {
    it('returns ops for superadmin', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'superadmin' });
      const { ctx } = makeCtx({});
      const result = await operatorHandlers.listScheduledOps(ctx, {});
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('createMaintenanceWindow', () => {
    it('throws when not authenticated', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      await expect(
        operatorHandlers.createMaintenanceWindow(ctx, {
          title: 'Maintenance',
          startTime: Date.now(),
          endTime: Date.now() + 3600000,
        }),
      ).rejects.toThrow();
    });
  });

  describe('getActiveMaintenanceWindow', () => {
    it('returns null when no window active', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'superadmin' });
      const { ctx } = makeCtx({ maintenanceWindows: [] });
      const result = await operatorHandlers.getActiveMaintenanceWindow(ctx, {});
      expect(result).toBeNull();
    });
  });

  describe('deleteMaintenanceWindow', () => {
    it('throws when not authenticated', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      await expect(
        operatorHandlers.deleteMaintenanceWindow(ctx, { windowId: 'w1' as any }),
      ).rejects.toThrow();
    });
  });

  describe('setMaintenanceWindowActive', () => {
    it('throws when not authenticated', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx({});
      await expect(
        operatorHandlers.setMaintenanceWindowActive(ctx, { windowId: 'w1' as any, isActive: true }),
      ).rejects.toThrow();
    });
  });
});
