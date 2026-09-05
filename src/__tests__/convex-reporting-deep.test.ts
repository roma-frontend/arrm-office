/**
 * Deep coverage tests for convex/reporting.ts
 * Targets: getPotentialManagers, assignManager, getOrgHierarchyTree,
 * getOrganizationHead, setOrganizationHead, getUnassignedUsers.
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

jest.mock('../../convex/lib/rbac', () => ({
  requireCapability: jest.fn(),
}));

jest.mock('../../convex/lib/reportingLine', () => ({
  getOrgHeadId: jest.fn(),
  resolveSupervisorId: jest.fn(),
  assertAssignable: jest.fn(),
  writeSupervisorId: jest.fn(),
}));

jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn(),
}));

jest.mock('../../convex/lib/capabilities', () => ({
  requireCapability: jest.fn(),
}));

let reporting: any;
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockGetOrgHeadId: jest.Mock;
let mockResolveSupervisorId: jest.Mock;
let mockAssertAssignable: jest.Mock;
let mockWriteSupervisorId: jest.Mock;
let mockRequireCapability: jest.Mock;
let mockGetProfile: jest.Mock;

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
      withIndex: (idxName: string, cb: any) => {
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
      filter: () => c,
      take: async () => {
        let filtered = rows.filter((r) => {
          for (const [k, v] of Object.entries(eqFilters)) {
            if (r[k] !== v) return false;
          }
          return true;
        });
        if (orderDir === 'desc') filtered = [...filtered].reverse();
        return filtered;
      },
      first: async () => {
        const filtered = rows.filter((r) => {
          for (const [k, v] of Object.entries(eqFilters)) {
            if (r[k] !== v) return false;
          }
          return true;
        });
        return filtered[0] ?? null;
      },
    };
    return c;
  }

  return {
    db: {
      get: async (id: string) => {
        for (const arr of Object.values(tableRows)) {
          const found = (arr as any[]).find((r: any) => r._id === id);
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
      patch: async (id: string, patchDoc: Record<string, unknown>) => {
        const row = insertedById.get(id);
        if (row) Object.assign(row, patchDoc);
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
    mockGetOrgHeadId = jest.requireMock('../../convex/lib/reportingLine').getOrgHeadId;
    mockResolveSupervisorId = jest.requireMock(
      '../../convex/lib/reportingLine',
    ).resolveSupervisorId;
    mockAssertAssignable = jest.requireMock('../../convex/lib/reportingLine').assertAssignable;
    mockWriteSupervisorId = jest.requireMock('../../convex/lib/reportingLine').writeSupervisorId;
    mockRequireCapability = jest.requireMock('../../convex/lib/capabilities').requireCapability;
    mockGetProfile = jest.requireMock('../../convex/lib/userProfile').getProfile;
    reporting = require('../../convex/reporting');
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller.mockResolvedValue(adminUser);
  mockIsSuperadmin.mockReturnValue(false);
  mockGetOrgHeadId.mockResolvedValue(null);
  mockResolveSupervisorId.mockResolvedValue(undefined);
  mockAssertAssignable.mockResolvedValue(undefined);
  mockWriteSupervisorId.mockResolvedValue(undefined);
  mockRequireCapability.mockResolvedValue(undefined);
  mockGetProfile.mockResolvedValue(null);
});

// ─── getPotentialManagers ───────────────────────────────────────────────────

describe('getPotentialManagers', () => {
  it('returns active non-superadmin users sorted by name', async () => {
    const rows: any = {
      users: [
        {
          _id: 'u1',
          name: 'Charlie',
          email: 'c@x.com',
          role: 'employee',
          organizationId: ORG,
          isActive: true,
        },
        {
          _id: 'u2',
          name: 'Alice',
          email: 'a@x.com',
          role: 'admin',
          organizationId: ORG,
          isActive: true,
        },
        {
          _id: 'u3',
          name: 'Bob',
          email: 'b@x.com',
          role: 'employee',
          organizationId: ORG,
          isActive: true,
        },
        {
          _id: 'u4',
          name: 'Eve',
          email: 'e@x.com',
          role: 'superadmin',
          organizationId: ORG,
          isActive: true,
        },
        {
          _id: 'u5',
          name: 'Dave',
          email: 'd@x.com',
          role: 'employee',
          organizationId: ORG,
          isActive: false,
        },
      ],
      positions: [],
    };
    const ctx = makeCtx(rows);
    const result = await reporting.getPotentialManagers.handler(ctx, { organizationId: ORG });
    // Should exclude superadmin (u4) and inactive (u5), sorted alphabetically
    expect(result.length).toBe(3);
    expect(result[0].name).toBe('Alice');
    expect(result[1].name).toBe('Bob');
    expect(result[2].name).toBe('Charlie');
  });

  it('filters by search query', async () => {
    const rows: any = {
      users: [
        {
          _id: 'u1',
          name: 'Alice Smith',
          email: 'alice@x.com',
          role: 'admin',
          organizationId: ORG,
          isActive: true,
          department: 'Engineering',
        },
        {
          _id: 'u2',
          name: 'Bob Jones',
          email: 'bob@x.com',
          role: 'employee',
          organizationId: ORG,
          isActive: true,
        },
      ],
      positions: [],
    };
    const ctx = makeCtx(rows);
    const result = await reporting.getPotentialManagers.handler(ctx, {
      organizationId: ORG,
      searchQuery: 'alice',
    });
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Alice Smith');
  });

  it('excludes the user specified by excludeUserId', async () => {
    const rows: any = {
      users: [
        {
          _id: 'u1',
          name: 'Alice',
          email: 'a@x.com',
          role: 'admin',
          organizationId: ORG,
          isActive: true,
        },
        {
          _id: 'u2',
          name: 'Bob',
          email: 'b@x.com',
          role: 'employee',
          organizationId: ORG,
          isActive: true,
        },
      ],
      positions: [],
    };
    const ctx = makeCtx(rows);
    const result = await reporting.getPotentialManagers.handler(ctx, {
      organizationId: ORG,
      excludeUserId: 'u1' as any,
    });
    expect(result.length).toBe(1);
    expect(result[0]._id).toBe('u2');
  });

  it('returns empty for non-org member', async () => {
    const otherUser = { ...adminUser, organizationId: 'other_org' };
    mockGetAuthCaller.mockResolvedValue(otherUser);
    const ctx = makeCtx({
      users: [
        {
          _id: 'u1',
          name: 'A',
          email: 'a@x.com',
          role: 'admin',
          organizationId: ORG,
          isActive: true,
        },
      ],
      positions: [],
    });
    const result = await reporting.getPotentialManagers.handler(ctx, { organizationId: ORG });
    expect(result).toEqual([]);
  });

  it('returns empty when not authenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const ctx = makeCtx({});
    const result = await reporting.getPotentialManagers.handler(ctx, { organizationId: ORG });
    expect(result).toEqual([]);
  });
});

// ─── assignManager ──────────────────────────────────────────────────────────

describe('assignManager', () => {
  it('assigns a supervisor and creates audit log', async () => {
    const rows: any = {
      users: [
        { _id: 'emp1', name: 'Employee', organizationId: ORG, supervisorId: undefined },
        { _id: 'sup1', name: 'Supervisor', organizationId: ORG, isActive: true },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await reporting.assignManager.handler(ctx, {
      employeeId: 'emp1' as any,
      supervisorId: 'sup1' as any,
    });
    expect(result).toEqual({ success: true, supervisorId: 'sup1' });
    expect(mockWriteSupervisorId).toHaveBeenCalled();
    const logs = ctx.tableRows['auditLogs'] ?? [];
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe('manager_assigned');
  });

  it('removes a manager when supervisorId is omitted', async () => {
    const rows: any = {
      users: [{ _id: 'emp1', name: 'Employee', organizationId: ORG, supervisorId: 'old_sup' }],
    };
    const ctx = makeCtx(rows);
    const result = await reporting.assignManager.handler(ctx, {
      employeeId: 'emp1' as any,
    });
    expect(result).toEqual({ success: true, supervisorId: undefined });
    const logs = ctx.tableRows['auditLogs'] ?? [];
    expect(logs[0].action).toBe('manager_removed');
  });

  it('throws when employee not found', async () => {
    const ctx = makeCtx({});
    await expect(
      reporting.assignManager.handler(ctx, { employeeId: 'ghost' as any }),
    ).rejects.toThrow('Employee not found');
  });

  it('throws when non-admin tries to assign', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...adminUser, role: 'employee' });
    const ctx = makeCtx({});
    await expect(
      reporting.assignManager.handler(ctx, { employeeId: 'x' as any }),
    ).rejects.toThrow();
  });

  it('throws when supervisor not found', async () => {
    const rows: any = {
      users: [{ _id: 'emp1', name: 'Emp', organizationId: ORG }],
    };
    const ctx = makeCtx(rows);
    await expect(
      reporting.assignManager.handler(ctx, {
        employeeId: 'emp1' as any,
        supervisorId: 'ghost' as any,
      }),
    ).rejects.toThrow('Supervisor not found');
  });
});

// ─── getOrganizationHead ────────────────────────────────────────────────────

describe('getOrganizationHead', () => {
  it('returns head user with profile data', async () => {
    mockGetOrgHeadId.mockResolvedValue('head_1');
    const rows: any = {
      users: [
        {
          _id: 'head_1',
          name: 'CEO',
          email: 'ceo@x.com',
          role: 'admin',
          organizationId: ORG,
          isActive: true,
        },
      ],
    };
    const ctx = makeCtx(rows);
    mockGetProfile.mockResolvedValue({ position: 'CEO', department: 'Executive' });
    const result = await reporting.getOrganizationHead.handler(ctx, { organizationId: ORG });
    expect(result).toBeDefined();
    expect(result.name).toBe('CEO');
  });

  it('returns null when no head set', async () => {
    mockGetOrgHeadId.mockResolvedValue(null);
    const ctx = makeCtx({});
    const result = await reporting.getOrganizationHead.handler(ctx, { organizationId: ORG });
    expect(result).toBeNull();
  });

  it('returns null when not authenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const ctx = makeCtx({});
    const result = await reporting.getOrganizationHead.handler(ctx, { organizationId: ORG });
    expect(result).toBeNull();
  });
});

// ─── setOrganizationHead ────────────────────────────────────────────────────

describe('setOrganizationHead', () => {
  it('sets the head of the organization', async () => {
    const rows: any = {
      organizations: [{ _id: ORG, headUserId: undefined }],
      users: [
        { _id: 'new_head', name: 'New Head', organizationId: ORG, isActive: true, role: 'admin' },
      ],
    };
    const ctx = makeCtx(rows);
    mockResolveSupervisorId.mockResolvedValue(undefined);
    const result = await reporting.setOrganizationHead.handler(ctx, {
      organizationId: ORG,
      userId: 'new_head' as any,
    });
    expect(result).toEqual({ success: true, headUserId: 'new_head' });
    const logs = ctx.tableRows['auditLogs'] ?? [];
    expect(logs[0].action).toBe('org_head_set');
  });

  it('clears the head when userId is omitted', async () => {
    const rows: any = {
      organizations: [{ _id: ORG, headUserId: 'old_head' }],
    };
    const ctx = makeCtx(rows);
    const result = await reporting.setOrganizationHead.handler(ctx, { organizationId: ORG });
    expect(result).toEqual({ success: true, headUserId: undefined });
    const logs = ctx.tableRows['auditLogs'] ?? [];
    expect(logs[0].action).toBe('org_head_cleared');
  });

  it('throws when head user not found', async () => {
    const rows: any = {
      organizations: [{ _id: ORG }],
    };
    const ctx = makeCtx(rows);
    await expect(
      reporting.setOrganizationHead.handler(ctx, {
        organizationId: ORG,
        userId: 'ghost' as any,
      }),
    ).rejects.toThrow('User not found');
  });

  it('throws when head is superadmin', async () => {
    const rows: any = {
      organizations: [{ _id: ORG }],
      users: [{ _id: 'sa', name: 'SA', organizationId: ORG, isActive: true, role: 'superadmin' }],
    };
    const ctx = makeCtx(rows);
    await expect(
      reporting.setOrganizationHead.handler(ctx, {
        organizationId: ORG,
        userId: 'sa' as any,
      }),
    ).rejects.toThrow('superadmin cannot be the head');
  });

  it('throws when head has a supervisor', async () => {
    mockResolveSupervisorId.mockResolvedValue('some_manager');
    const rows: any = {
      organizations: [{ _id: ORG }],
      users: [
        { _id: 'has_mgr', name: 'HasMgr', organizationId: ORG, isActive: true, role: 'admin' },
      ],
    };
    const ctx = makeCtx(rows);
    await expect(
      reporting.setOrganizationHead.handler(ctx, {
        organizationId: ORG,
        userId: 'has_mgr' as any,
      }),
    ).rejects.toThrow('cannot report to anyone');
  });
});

// ─── getUnassignedUsers ─────────────────────────────────────────────────────

describe('getUnassignedUsers', () => {
  it('returns users with no manager and not head', async () => {
    mockGetOrgHeadId.mockResolvedValue('head_1');
    const rows: any = {
      users: [
        {
          _id: 'head_1',
          name: 'Head',
          email: 'h@x.com',
          role: 'admin',
          organizationId: ORG,
          isActive: true,
        },
        {
          _id: 'u1',
          name: 'Unassigned',
          email: 'u@x.com',
          role: 'employee',
          organizationId: ORG,
          isActive: true,
        },
        {
          _id: 'u2',
          name: 'Managed',
          email: 'm@x.com',
          role: 'employee',
          organizationId: ORG,
          isActive: true,
        },
      ],
    };
    const ctx = makeCtx(rows);
    // u2 has a manager, u1 and head don't
    mockResolveSupervisorId.mockImplementation(async (_ctx: any, user: any) => {
      if (user._id === 'u2') return 'some_manager';
      return undefined;
    });
    const result = await reporting.getUnassignedUsers.handler(ctx, { organizationId: ORG });
    // head_1 is excluded (is head), u2 is excluded (has manager)
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Unassigned');
  });

  it('returns empty when all users are managed', async () => {
    mockGetOrgHeadId.mockResolvedValue('head_1');
    mockResolveSupervisorId.mockResolvedValue('some_manager');
    const rows: any = {
      users: [
        {
          _id: 'head_1',
          name: 'Head',
          email: 'h@x.com',
          role: 'admin',
          organizationId: ORG,
          isActive: true,
        },
        {
          _id: 'u1',
          name: 'Managed',
          email: 'm@x.com',
          role: 'employee',
          organizationId: ORG,
          isActive: true,
        },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await reporting.getUnassignedUsers.handler(ctx, { organizationId: ORG });
    expect(result).toEqual([]);
  });

  it('returns empty for non-org member', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...adminUser, organizationId: 'other' });
    const ctx = makeCtx({});
    const result = await reporting.getUnassignedUsers.handler(ctx, { organizationId: ORG });
    expect(result).toEqual([]);
  });
});

// ─── getOrgHierarchyTree ────────────────────────────────────────────────────

describe('getOrgHierarchyTree', () => {
  it('builds a tree with head at root', async () => {
    mockGetOrgHeadId.mockResolvedValue('head_1');
    const rows: any = {
      users: [
        {
          _id: 'head_1',
          name: 'Head',
          role: 'admin',
          organizationId: ORG,
          isActive: true,
          email: 'h@x.com',
        },
        {
          _id: 'u1',
          name: 'Report',
          role: 'employee',
          organizationId: ORG,
          isActive: true,
          email: 'r@x.com',
        },
      ],
    };
    const ctx = makeCtx(rows);
    mockResolveSupervisorId.mockImplementation(async (_ctx: any, user: any) => {
      if (user._id === 'u1') return 'head_1';
      return undefined;
    });
    const result = await reporting.getOrgHierarchyTree.handler(ctx, { organizationId: ORG });
    expect(result.length).toBe(1); // head at root
    expect(result[0]._id).toBe('head_1');
    expect(result[0].isHead).toBe(true);
    expect(result[0].children.length).toBe(1);
    expect(result[0].children[0]._id).toBe('u1');
  });

  it('returns empty for non-org member', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...adminUser, organizationId: 'other' });
    const ctx = makeCtx({});
    const result = await reporting.getOrgHierarchyTree.handler(ctx, { organizationId: ORG });
    expect(result).toEqual([]);
  });
});
