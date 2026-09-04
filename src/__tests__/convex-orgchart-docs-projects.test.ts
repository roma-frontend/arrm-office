/**
 * Tests for convex/orgchart.ts, convex/documents.ts, convex/projects.ts
 * Auth checks and default return paths.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
  internalQuery: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({ getAuthCaller: jest.fn() }));
jest.mock('../../convex/lib/auth', () => ({ isSuperadmin: jest.fn() }));
jest.mock('../../convex/lib/userProfile', () => ({ getProfile: jest.fn() }));
jest.mock('../../convex/lib/notify', () => ({ notify: jest.fn() }));
jest.mock('../../convex/lib/entitlements', () => ({ assertModuleAccess: jest.fn() }));
jest.mock('../../convex/lib/orgAccess', () => ({
  assertOrgStaff: jest.fn(),
  assertOrgScope: jest.fn(),
  resolveOrgScope: jest.fn(),
  scopeOwnsRecord: jest.fn(),
}));
jest.mock('../../convex/lib/reportingLine', () => ({
  resolveSupervisorId: jest.fn().mockResolvedValue(null),
  writeSupervisorId: jest.fn(),
  getOrgHeadId: jest.fn().mockResolvedValue(null),
  assertAssignable: jest.fn(),
}));
jest.mock('../../convex/lib/capabilities', () => ({
  requireCapability: jest.fn(),
}));

let orgchartHandlers: Record<string, any> = {};
let documentsHandlers: Record<string, any> = {};
let projectsHandlers: Record<string, any> = {};

beforeEach(() => {
  jest.clearAllMocks();
  jest.isolateModules(() => {
    const mod = require('../../convex/orgchart');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function')
        orgchartHandlers[name] = (def as any).handler;
    }
  });
  jest.isolateModules(() => {
    const mod = require('../../convex/documents');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function')
        documentsHandlers[name] = (def as any).handler;
    }
  });
  jest.isolateModules(() => {
    const mod = require('../../convex/projects');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function')
        projectsHandlers[name] = (def as any).handler;
    }
  });
});

function makeCtx() {
  const get = jest.fn().mockResolvedValue(null);
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
      take: jest.fn().mockResolvedValue([]),
      filter: jest.fn(() => ({
        take: jest.fn().mockResolvedValue([]),
      })),
      order: jest.fn(() => ({
        take: jest.fn().mockResolvedValue([]),
      })),
    })),
  };
  return { ctx: { db }, get, db };
}

// ═══════════════════════════════════════════════════════════════════════════
// ORGCHART
// ═══════════════════════════════════════════════════════════════════════════
describe('orgchart', () => {
  describe('getOrgChart', () => {
    it('returns empty when no auth', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx();
      const result = await orgchartHandlers.getOrgChart(ctx, { organizationId: 'org1' as any });
      expect(result).toEqual([]);
    });
  });

  describe('getOrgChartTree', () => {
    it('returns empty when no auth', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx();
      const result = await orgchartHandlers.getOrgChartTree(ctx, { organizationId: 'org1' as any });
      expect(result).toEqual([]);
    });
  });

  describe('debugOrgChart', () => {
    it('returns empty when no auth', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx();
      const result = await orgchartHandlers.debugOrgChart(ctx, { organizationId: 'org1' as any });
      expect(result).toEqual([]);
    });
  });

  describe('getLayouts', () => {
    it('returns empty when no auth', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx();
      const result = await orgchartHandlers.getLayouts(ctx, { organizationId: 'org1' as any });
      expect(result).toEqual([]);
    });
  });

  describe('createNode', () => {
    it('throws when not authenticated', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx();
      await expect(
        orgchartHandlers.createNode(ctx, { organizationId: 'org1' as any, name: 'Node' }),
      ).rejects.toThrow();
    });
  });

  describe('deleteNode', () => {
    it('throws when not authenticated', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx();
      await expect(orgchartHandlers.deleteNode(ctx, { nodeId: 'n1' as any })).rejects.toThrow();
    });
  });

  describe('moveNode', () => {
    it('throws when not authenticated', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx();
      await expect(orgchartHandlers.moveNode(ctx, { nodeId: 'n1' as any })).rejects.toThrow();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENTS
// ═══════════════════════════════════════════════════════════════════════════
describe('documents', () => {
  describe('listDocuments', () => {
    it('throws when no auth', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx();
      await expect(
        documentsHandlers.listDocuments(ctx, { organizationId: 'org1' as any }),
      ).rejects.toThrow();
    });
  });

  describe('getDocumentById', () => {
    it('returns null when not found', async () => {
      const { ctx } = makeCtx();
      const result = await documentsHandlers.getDocumentById(ctx, { documentId: 'doc_x' as any });
      expect(result).toBeNull();
    });
  });

  describe('getDocument', () => {
    it('throws when not found', async () => {
      const { ctx } = makeCtx();
      await expect(
        documentsHandlers.getDocument(ctx, { documentId: 'doc_x' as any }),
      ).rejects.toThrow();
    });
  });

  describe('deleteDocument', () => {
    it('throws when not found', async () => {
      const { ctx } = makeCtx();
      await expect(
        documentsHandlers.deleteDocument(ctx, { documentId: 'doc_x' as any }),
      ).rejects.toThrow();
    });
  });

  describe('getMyDocumentViews', () => {
    it('throws when no auth', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx();
      await expect(documentsHandlers.getMyDocumentViews(ctx, {})).rejects.toThrow();
    });
  });

  describe('getDocumentViews', () => {
    it('throws when no auth', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx();
      await expect(
        documentsHandlers.getDocumentViews(ctx, { documentId: 'doc_x' as any }),
      ).rejects.toThrow();
    });
  });

  describe('getDocumentCategories', () => {
    it('throws when no auth', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx();
      await expect(
        documentsHandlers.getDocumentCategories(ctx, { organizationId: 'org1' as any }),
      ).rejects.toThrow();
    });
  });

  describe('createDocumentCategory', () => {
    it('throws when not authenticated', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx();
      await expect(
        documentsHandlers.createDocumentCategory(ctx, {
          organizationId: 'org1' as any,
          name: 'Category',
        }),
      ).rejects.toThrow();
    });
  });

  describe('getTeamDocumentOverview', () => {
    it('returns null when no auth', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx();
      const result = await documentsHandlers.getTeamDocumentOverview(ctx, {
        organizationId: 'org1' as any,
      });
      expect(
        result === null || result === undefined || (Array.isArray(result) && result.length === 0),
      ).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════════════════════════════════════
describe('projects', () => {
  describe('listProjects', () => {
    it('returns empty when no auth', async () => {
      const { resolveOrgScope } = require('../../convex/lib/orgAccess');
      resolveOrgScope.mockResolvedValue(null);
      const { ctx } = makeCtx();
      const result = await projectsHandlers.listProjects(ctx, {});
      expect(result).toEqual([]);
    });
  });

  describe('getProject', () => {
    it('returns null when not found', async () => {
      const { ctx } = makeCtx();
      const result = await projectsHandlers.getProject(ctx, { projectId: 'proj_x' as any });
      expect(result).toBeNull();
    });
  });

  describe('createProject', () => {
    it('throws when not authenticated', async () => {
      const { getAuthCaller } = require('../../convex/lib/getAuthCaller');
      getAuthCaller.mockResolvedValue(null);
      const { ctx } = makeCtx();
      await expect(
        projectsHandlers.createProject(ctx, {
          name: 'New Project',
          organizationId: 'org1' as any,
        }),
      ).rejects.toThrow();
    });
  });
});
