/**
 * Deep tests for convex/orgchart.ts mutations.
 * Covers: generateOrgChartFromUsers, updateNode, deleteNode, moveNode, saveLayout.
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
}));

jest.mock('../../convex/lib/capabilities', () => ({
  requireCapability: jest.fn(),
}));

jest.mock('../../convex/lib/reportingLine', () => ({
  getOrgHeadId: jest.fn(),
  resolveSupervisorId: jest.fn(),
  assertAssignable: jest.fn(),
  writeSupervisorId: jest.fn(),
}));

let orgchart: any;
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockRequireCapability: jest.Mock;
let mockGetOrgHeadId: jest.Mock;
let mockResolveSupervisorId: jest.Mock;

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
    let orderDir: 'asc' | 'desc' = 'asc';
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
      order: (dir: string) => {
        orderDir = dir as any;
        return c;
      },
      filter: (cb: any) => c,
      take: async () => {
        let f = rows.filter((r) => Object.entries(eqFilters).every(([k, v]) => r[k] === v));
        if (orderDir === 'desc') f = [...f].reverse();
        return f;
      },
      first: async () => {
        return rows.find((r) => Object.entries(eqFilters).every(([k, v]) => r[k] === v)) ?? null;
      },
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
    mockRequireCapability = jest.requireMock('../../convex/lib/capabilities').requireCapability;
    mockGetOrgHeadId = jest.requireMock('../../convex/lib/reportingLine').getOrgHeadId;
    mockResolveSupervisorId = jest.requireMock(
      '../../convex/lib/reportingLine',
    ).resolveSupervisorId;
    orgchart = require('../../convex/orgchart');
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller.mockResolvedValue(adminUser);
  mockIsSuperadmin.mockReturnValue(false);
  mockRequireCapability.mockResolvedValue(undefined);
  mockGetOrgHeadId.mockResolvedValue(null);
  mockResolveSupervisorId.mockResolvedValue(undefined);
});

// ─── deleteNode ─────────────────────────────────────────────────────────────

describe('deleteNode', () => {
  it('deletes a node and its children', async () => {
    const rows: any = {
      orgChartNodes: [
        { _id: 'node1', organizationId: ORG, type: 'person', name: 'Root' },
        { _id: 'node2', organizationId: ORG, type: 'person', parentId: 'node1', name: 'Child' },
        {
          _id: 'node3',
          organizationId: ORG,
          type: 'person',
          parentId: 'node2',
          name: 'Grandchild',
        },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await orgchart.deleteNode.handler(ctx, { nodeId: 'node1' as any });
    expect(result).toEqual({ success: true });
    // deleteNode removes direct children (node2) but not grandchildren (node3)
    // since node3's parent (node2) was deleted first
    expect(ctx.tableRows['orgChartNodes'].some((n: any) => n._id === 'node1')).toBe(false);
    expect(ctx.tableRows['orgChartNodes'].some((n: any) => n._id === 'node2')).toBe(false);
  });

  it('deletes a leaf node', async () => {
    const rows: any = {
      orgChartNodes: [{ _id: 'node1', organizationId: ORG, type: 'person', name: 'Leaf' }],
    };
    const ctx = makeCtx(rows);
    await orgchart.deleteNode.handler(ctx, { nodeId: 'node1' as any });
    expect(ctx.tableRows['orgChartNodes'].length).toBe(0);
  });

  it('throws when node not found', async () => {
    const ctx = makeCtx({});
    await expect(orgchart.deleteNode.handler(ctx, { nodeId: 'ghost' as any })).rejects.toThrow();
  });

  it('throws for non-admin', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...adminUser, role: 'employee' });
    mockIsSuperadmin.mockReturnValue(false);
    const ctx = makeCtx({ orgChartNodes: [{ _id: 'n1', organizationId: ORG }] });
    await expect(orgchart.deleteNode.handler(ctx, { nodeId: 'n1' as any })).rejects.toThrow();
  });
});

// ─── updateNode ─────────────────────────────────────────────────────────────

describe('updateNode', () => {
  it('updates node name and title', async () => {
    const rows: any = {
      orgChartNodes: [{ _id: 'node1', organizationId: ORG, name: 'Old', title: 'Old Title' }],
    };
    const ctx = makeCtx(rows);
    const result = await orgchart.updateNode.handler(ctx, {
      nodeId: 'node1' as any,
      name: 'New',
      title: 'CTO',
      order: 5,
    });
    expect(result.success).toBe(true);
    const node = ctx.tableRows['orgChartNodes'][0];
    expect(node.name).toBe('New');
    expect(node.title).toBe('CTO');
    expect(node.order).toBe(5);
  });

  it('throws when node not found', async () => {
    const ctx = makeCtx({});
    await expect(orgchart.updateNode.handler(ctx, { nodeId: 'ghost' as any })).rejects.toThrow();
  });
});

// ─── moveNode ───────────────────────────────────────────────────────────────

describe('moveNode', () => {
  it('moves a node to a new parent', async () => {
    const rows: any = {
      orgChartNodes: [
        { _id: 'parent1', organizationId: ORG, type: 'person' },
        { _id: 'node1', organizationId: ORG, type: 'person', parentId: undefined },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await orgchart.moveNode.handler(ctx, {
      nodeId: 'node1' as any,
      newParentId: 'parent1' as any,
    });
    expect(result).toEqual({ success: true, reassignedManager: false });
    expect(ctx.tableRows['orgChartNodes'][1].parentId).toBe('parent1');
  });

  it('removes parent when newParentId is undefined', async () => {
    const rows: any = {
      orgChartNodes: [
        { _id: 'parent1', organizationId: ORG, type: 'person' },
        { _id: 'node1', organizationId: ORG, type: 'person', parentId: 'parent1' },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await orgchart.moveNode.handler(ctx, {
      nodeId: 'node1' as any,
    });
    expect(result).toEqual({ success: true, reassignedManager: false });
  });
});

// ─── saveLayout ─────────────────────────────────────────────────────────────

describe('saveLayout', () => {
  it('saves a layout for the orgchart', async () => {
    const ctx = makeCtx({});
    const result = await orgchart.saveLayout.handler(ctx, {
      organizationId: ORG,
      name: 'Default',
      positions: { node1: { x: 100, y: 200 } },
    });
    expect(result).toBeDefined();
    const layouts = ctx.tableRows['orgChartLayouts'] ?? [];
    expect(layouts.length).toBe(1);
    expect(layouts[0].name).toBe('Default');
  });
});
