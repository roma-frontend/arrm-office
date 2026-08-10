/**
 * Tests for convex/reporting.ts — auth checks, cycle detection, org scoping.
 *
 * Uses jest.isolateModules to avoid module caching conflicts with other test
 * files that also touch the Convex module graph.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ═════════════════════════════════════════════════════════════════════════════
// MOCKS — jest.mock is hoisted
// ═════════════════════════════════════════════════════════════════════════════

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

jest.mock('../../convex/lib/limits', () => ({
  DEFAULT_LIST_CAP: 50,
  XLARGE_LIST_CAP: 200,
}));

// ═════════════════════════════════════════════════════════════════════════════
// MODULE LOADING — inside isolateModules so mock instances are shared
// ═════════════════════════════════════════════════════════════════════════════

let reporting: any;
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockGetProfile: jest.Mock;
let mockInsert: jest.Mock;
let mockPatch: jest.Mock;
let mockGet: jest.Mock;

const ORG_A = 'org-aaa';
const ORG_B = 'org-bbb';

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
    mockGetProfile = jest.requireMock('../../convex/lib/userProfile').getProfile;

    mockInsert = jest.fn();
    mockPatch = jest.fn();
    mockGet = jest.fn();

    reporting = require('../../convex/reporting');
  });
});

// ── Test utilities ──

function makeQueryChain(fakeResult: any) {
  // q mimics the Convex expression builder so withIndex/filter callbacks
  // execute — covering the `q.eq`/`q.field` predicate lines.
  const q: any = {
    eq: (..._args: unknown[]) => q,
    field: (name: string) => ({ __field: name }),
  };
  let chain: any = {
    withIndex: (_name: string, cb?: (q: any) => unknown) => {
      if (cb) cb(q);
      return chain;
    },
    filter: (cb?: (q: any) => unknown) => {
      if (cb) cb(q);
      return chain;
    },
    order: () => chain,
    take: async () => (typeof fakeResult === 'function' ? fakeResult() : fakeResult),
    first: async () => (typeof fakeResult === 'function' ? fakeResult() : fakeResult),
  };
  return chain;
}

function makeCtx(queryResult?: any) {
  const qc = makeQueryChain(queryResult);
  return {
    db: {
      get: mockGet,
      insert: mockInsert,
      patch: mockPatch,
      query: () => qc,
    },
  };
}

// ── Shared test data ──

const adminCallerA = {
  _id: 'user-admin',
  name: 'Admin A',
  email: 'a@a.com',
  role: 'admin',
  organizationId: ORG_A,
};
const employeeCallerA = {
  _id: 'user-emp',
  name: 'Emp A',
  email: 'e@a.com',
  role: 'employee',
  organizationId: ORG_A,
};
const supervisorCallerA = {
  _id: 'user-sup',
  name: 'Sup A',
  email: 's@a.com',
  role: 'supervisor',
  organizationId: ORG_A,
};
const adminCallerB = {
  _id: 'user-admin-b',
  name: 'Admin B',
  email: 'a@b.com',
  role: 'admin',
  organizationId: ORG_B,
};

const sampleEmployee = {
  _id: 'user-target',
  name: 'Target User',
  email: 't@a.com',
  role: 'employee',
  organizationId: ORG_A,
  isActive: true,
  supervisorId: 'user-manager-1',
  employeeType: 'staff',
  position: 'Developer',
  department: 'Engineering',
  avatarUrl: undefined,
};

const sampleManager = {
  _id: 'user-manager-1',
  name: 'Manager One',
  email: 'm1@a.com',
  role: 'supervisor',
  organizationId: ORG_A,
  isActive: true,
  supervisorId: 'user-manager-2',
  employeeType: 'staff',
  position: 'Tech Lead',
  department: 'Engineering',
  avatarUrl: undefined,
};

const sampleTopManager = {
  _id: 'user-manager-2',
  name: 'Top Manager',
  email: 'm2@a.com',
  role: 'admin',
  organizationId: ORG_A,
  isActive: true,
  supervisorId: undefined,
  employeeType: 'staff',
  position: 'CTO',
  department: 'Engineering',
  avatarUrl: undefined,
};

const sampleDirectReport = {
  _id: 'user-report',
  name: 'Direct Report',
  email: 'dr@a.com',
  role: 'employee',
  organizationId: ORG_A,
  isActive: true,
  supervisorId: 'user-target',
  employeeType: 'staff',
  position: 'Junior Dev',
  department: 'Engineering',
  avatarUrl: undefined,
};

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: getReportingLine
// ═════════════════════════════════════════════════════════════════════════════

describe('reporting.getReportingLine', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
  });

  const args = { userId: 'user-target' as any, organizationId: ORG_A as any };

  it('returns null for unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    mockGet.mockResolvedValue(sampleEmployee);
    const result = await reporting.getReportingLine.handler(makeCtx(null), args);
    expect(result).toBeNull();
  });

  it('returns null when target user not found', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerA);
    mockGet.mockResolvedValue(null);
    const result = await reporting.getReportingLine.handler(makeCtx(null), args);
    expect(result).toBeNull();
  });

  it('returns null for cross-org caller (not superadmin)', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerB);
    mockGet.mockResolvedValue(sampleEmployee);
    const result = await reporting.getReportingLine.handler(makeCtx(null), args);
    expect(result).toBeNull();
  });

  it('returns reporting line for same-org caller', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerA);
    mockGet
      .mockResolvedValueOnce(sampleEmployee) // targetUser
      .mockResolvedValueOnce(sampleManager) // manager 1 (supervisor)
      .mockResolvedValueOnce(sampleTopManager); // manager 2 (top)
    mockGetProfile.mockResolvedValue(null);

    // Direct reports query returns: sampleDirectReport
    const ctx = makeCtx([sampleDirectReport]);
    const result = await reporting.getReportingLine.handler(ctx, args);

    expect(result).not.toBeNull();
    expect(result.subject.name).toBe('Target User');
    expect(result.ancestors).toHaveLength(2);
    expect(result.ancestors[0].name).toBe('Top Manager'); // reversed: top first
    expect(result.ancestors[1].name).toBe('Manager One');
    expect(result.directReports).toHaveLength(1);
    expect(result.directReports[0].name).toBe('Direct Report');
  });

  it('returns reporting line for superadmin from any org', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerB);
    mockIsSuperadmin.mockReturnValue(true);
    mockGet
      .mockResolvedValueOnce(sampleEmployee)
      .mockResolvedValueOnce(sampleManager)
      .mockResolvedValueOnce(sampleTopManager);
    mockGetProfile.mockResolvedValue(null);

    const ctx = makeCtx([sampleDirectReport]);
    const result = await reporting.getReportingLine.handler(ctx, args);

    expect(result).not.toBeNull();
    expect(result.subject.name).toBe('Target User');
  });

  it('stops chain walk when supervisor is inactive', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerA);
    mockGet
      .mockResolvedValueOnce(sampleEmployee)
      .mockResolvedValueOnce({ ...sampleManager, isActive: false });
    mockGetProfile.mockResolvedValue(null);

    const ctx = makeCtx([]);
    const result = await reporting.getReportingLine.handler(ctx, args);

    expect(result).not.toBeNull();
    expect(result.ancestors).toHaveLength(0);
  });

  it('stops chain walk at max 10 hops (cycle safety)', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerA);
    // Create a cycle: each node points to the next, last points back to first
    const nodes = Array.from({ length: 12 }, (_, i) => ({
      _id: `user-cycle-${i}`,
      name: `Cycle ${i}`,
      email: `c${i}@a.com`,
      role: 'employee',
      organizationId: ORG_A,
      isActive: true,
      supervisorId: `user-cycle-${(i + 1) % 12}`,
      employeeType: 'staff',
      position: 'Dev',
      department: 'Eng',
    }));
    // Set the target's supervisorId to start the cycle
    const targetWithCycle = { ...sampleEmployee, supervisorId: 'user-cycle-0' };

    // Each mockGet call returns the next node (uses call count tracking)
    mockGet.mockImplementation((id: string) => {
      const node = nodes.find((n) => n._id === id);
      return node ?? null;
    });
    mockGetProfile.mockResolvedValue(null);

    const ctx = makeCtx([]);
    // Need to first set the target to start chain
    mockGetAuthCaller.mockResolvedValue(adminCallerA);
    // Reset mockGet to handle target first
    mockGet
      .mockResolvedValueOnce(targetWithCycle) // targetUser
      .mockResolvedValueOnce(nodes[0]) // cycle-0
      .mockResolvedValueOnce(nodes[1]) // cycle-1
      .mockResolvedValueOnce(nodes[2]) // cycle-2
      .mockResolvedValueOnce(nodes[3]) // cycle-3
      .mockResolvedValueOnce(nodes[4]) // cycle-4
      .mockResolvedValueOnce(nodes[5]) // cycle-5
      .mockResolvedValueOnce(nodes[6]) // cycle-6
      .mockResolvedValueOnce(nodes[7]) // cycle-7
      .mockResolvedValueOnce(nodes[8]) // cycle-8
      .mockResolvedValueOnce(nodes[9]) // cycle-9
      .mockResolvedValueOnce(nodes[10]); // cycle-10 (11th call)

    const result = await reporting.getReportingLine.handler(ctx, args);
    expect(result).not.toBeNull();
    // Should have at most 10 ancestors (max hops)
    expect(result.ancestors.length).toBeLessThanOrEqual(10);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: getPotentialManagers
// ═════════════════════════════════════════════════════════════════════════════

describe('reporting.getPotentialManagers', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
  });

  it('returns empty for unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const result = await reporting.getPotentialManagers.handler(makeCtx([]), {
      organizationId: ORG_A as any,
    });
    expect(result).toEqual([]);
  });

  it('returns empty for cross-org caller', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerB);
    const result = await reporting.getPotentialManagers.handler(makeCtx([]), {
      organizationId: ORG_A as any,
    });
    expect(result).toEqual([]);
  });

  it('returns candidates for same-org admin', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerA);
    const candidates = [
      {
        _id: 'u1',
        name: 'Alice',
        email: 'a@a.com',
        role: 'admin',
        isActive: true,
        organizationId: ORG_A,
      },
      {
        _id: 'u2',
        name: 'Bob',
        email: 'b@a.com',
        role: 'supervisor',
        isActive: true,
        organizationId: ORG_A,
      },
      {
        _id: 'u3',
        name: 'Charlie',
        email: 'c@a.com',
        role: 'employee',
        isActive: true,
        organizationId: ORG_A,
      },
    ];
    const ctx = makeCtx(candidates);
    const result = await reporting.getPotentialManagers.handler(ctx, {
      organizationId: ORG_A as any,
    });
    // Admins first, then supervisors, then employees
    expect(result).toHaveLength(3);
    expect(result[0].role).toBe('admin');
    expect(result[1].role).toBe('supervisor');
    expect(result[2].role).toBe('employee');
  });

  it('excludes superadmin users from candidates', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerA);
    const candidates = [
      {
        _id: 'u1',
        name: 'Super',
        email: 's@a.com',
        role: 'superadmin',
        isActive: true,
        organizationId: ORG_A,
      },
      {
        _id: 'u2',
        name: 'Normal',
        email: 'n@a.com',
        role: 'admin',
        isActive: true,
        organizationId: ORG_A,
      },
    ];
    const ctx = makeCtx(candidates);
    const result = await reporting.getPotentialManagers.handler(ctx, {
      organizationId: ORG_A as any,
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Normal');
  });

  it('excludes self via excludeUserId', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerA);
    const candidates = [
      {
        _id: 'u1',
        name: 'Self',
        email: 's@a.com',
        role: 'admin',
        isActive: true,
        organizationId: ORG_A,
      },
      {
        _id: 'u2',
        name: 'Other',
        email: 'o@a.com',
        role: 'supervisor',
        isActive: true,
        organizationId: ORG_A,
      },
    ];
    const ctx = makeCtx(candidates);
    const result = await reporting.getPotentialManagers.handler(ctx, {
      organizationId: ORG_A as any,
      excludeUserId: 'u1' as any,
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Other');
  });

  it('filters by search query', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerA);
    const candidates = [
      {
        _id: 'u1',
        name: 'Alice Wonderland',
        email: 'alice@a.com',
        role: 'admin',
        isActive: true,
        organizationId: ORG_A,
        department: 'Engineering',
        position: 'TL',
      },
      {
        _id: 'u2',
        name: 'Bob Marvel',
        email: 'bob@a.com',
        role: 'supervisor',
        isActive: true,
        organizationId: ORG_A,
        department: 'Marketing',
        position: 'Manager',
      },
    ];
    const ctx = makeCtx(candidates);
    const result = await reporting.getPotentialManagers.handler(ctx, {
      organizationId: ORG_A as any,
      searchQuery: 'alice',
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice Wonderland');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: assignManager
// ═════════════════════════════════════════════════════════════════════════════

describe('reporting.assignManager', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
  });

  it('rejects unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      reporting.assignManager.handler(makeCtx(null), {
        employeeId: 'user-target' as any,
        supervisorId: 'user-manager' as any,
      }),
    ).rejects.toThrow('Not authenticated');
  });

  it('rejects employee caller', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeCallerA);
    await expect(
      reporting.assignManager.handler(makeCtx(null), {
        employeeId: 'user-target' as any,
        supervisorId: 'user-manager' as any,
      }),
    ).rejects.toThrow('Insufficient permissions');
  });

  it('rejects cross-org admin', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerB);
    mockGet.mockResolvedValue(sampleEmployee);
    await expect(
      reporting.assignManager.handler(makeCtx(null), {
        employeeId: 'user-target' as any,
        supervisorId: 'user-manager' as any,
      }),
    ).rejects.toThrow('Access denied');
  });

  it('throws when employee not found', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerA);
    mockGet.mockResolvedValue(null);
    await expect(
      reporting.assignManager.handler(makeCtx(null), {
        employeeId: 'ghost' as any,
        supervisorId: 'user-manager' as any,
      }),
    ).rejects.toThrow('Employee not found');
  });

  it('rejects self-assignment', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerA);
    mockGet.mockResolvedValue(sampleEmployee);
    await expect(
      reporting.assignManager.handler(makeCtx(null), {
        employeeId: 'user-target' as any,
        supervisorId: 'user-target' as any,
      }),
    ).rejects.toThrow('cannot be their own manager');
  });

  it('allows same-org admin to assign manager', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerA);
    mockGet
      .mockResolvedValueOnce(sampleEmployee) // employee
      .mockResolvedValueOnce(sampleManager) // supervisor (exists, active, same org)
      .mockResolvedValueOnce(sampleTopManager); // for audit log name lookup
    mockGetProfile.mockResolvedValue(null);
    // userProfiles query returns null (no existing profile)
    const ctx = makeCtx(null);
    const result = await reporting.assignManager.handler(ctx, {
      employeeId: 'user-target' as any,
      supervisorId: 'user-manager-1' as any,
    });
    expect(result.success).toBe(true);
    expect(result.supervisorId).toBe('user-manager-1');
    expect(mockPatch).toHaveBeenCalledWith('user-target', { supervisorId: 'user-manager-1' });
    // Audit log
    expect(mockInsert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({
        action: 'manager_assigned',
        userId: 'user-admin',
      }),
    );
  });

  it('allows supervisor role to assign manager', async () => {
    mockGetAuthCaller.mockResolvedValue(supervisorCallerA);
    mockGet
      .mockResolvedValueOnce(sampleEmployee)
      .mockResolvedValueOnce(sampleManager)
      .mockResolvedValueOnce(sampleTopManager);
    mockGetProfile.mockResolvedValue(null);
    const ctx = makeCtx(null);
    const result = await reporting.assignManager.handler(ctx, {
      employeeId: 'user-target' as any,
      supervisorId: 'user-manager-1' as any,
    });
    expect(result.success).toBe(true);
  });

  it('allows superadmin from any org', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerB);
    mockIsSuperadmin.mockReturnValue(true);
    mockGet
      .mockResolvedValueOnce(sampleEmployee)
      .mockResolvedValueOnce(sampleManager)
      .mockResolvedValueOnce(sampleTopManager);
    mockGetProfile.mockResolvedValue(null);
    const ctx = makeCtx(null);
    const result = await reporting.assignManager.handler(ctx, {
      employeeId: 'user-target' as any,
      supervisorId: 'user-manager-1' as any,
    });
    expect(result.success).toBe(true);
  });

  it('throws when supervisor not found', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerA);
    mockGet
      .mockResolvedValueOnce(sampleEmployee) // employee exists
      .mockResolvedValueOnce(null); // supervisor not found
    await expect(
      reporting.assignManager.handler(makeCtx(null), {
        employeeId: 'user-target' as any,
        supervisorId: 'ghost-manager' as any,
      }),
    ).rejects.toThrow('Supervisor not found');
  });

  it('throws when supervisor is inactive', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerA);
    mockGet
      .mockResolvedValueOnce(sampleEmployee)
      .mockResolvedValueOnce({ ...sampleManager, isActive: false });
    await expect(
      reporting.assignManager.handler(makeCtx(null), {
        employeeId: 'user-target' as any,
        supervisorId: 'user-manager-1' as any,
      }),
    ).rejects.toThrow('Supervisor account is inactive');
  });

  it('throws on cross-org supervisor', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerA);
    mockGet
      .mockResolvedValueOnce(sampleEmployee) // employee in ORG_A
      .mockResolvedValueOnce({ ...sampleManager, organizationId: ORG_B }); // supervisor in ORG_B
    await expect(
      reporting.assignManager.handler(makeCtx(null), {
        employeeId: 'user-target' as any,
        supervisorId: 'user-manager-1' as any,
      }),
    ).rejects.toThrow('Supervisor must be in the same organization');
  });

  it('detects circular reporting lines', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerA);
    // Target's supervisor points back to target → cycle
    const cycleEmployee = { ...sampleEmployee, supervisorId: 'user-manager-1' };
    const cycleManager = { ...sampleManager, supervisorId: 'user-target' };
    mockGet
      .mockResolvedValueOnce(cycleEmployee) // employee
      .mockResolvedValueOnce(cycleManager) // supervisor (reports back to target)
      .mockResolvedValueOnce(sampleTopManager); // for supervisor name in audit
    // getProfile returns supervisorId cycle
    mockGetProfile.mockImplementation((_ctx: any, id: string) => {
      if (id === 'user-manager-1') return { supervisorId: 'user-target' };
      return null;
    });
    await expect(
      reporting.assignManager.handler(makeCtx(null), {
        employeeId: 'user-target' as any,
        supervisorId: 'user-manager-1' as any,
      }),
    ).rejects.toThrow('circular reporting line');
  });

  it('removes manager when supervisorId is omitted', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerA);
    mockGet
      .mockResolvedValueOnce(sampleEmployee) // employee
      .mockResolvedValueOnce(null); // no supervisor name lookup needed
    mockGetProfile.mockResolvedValue(null);
    // userProfiles query returns null
    const ctx = makeCtx(null);
    const result = await reporting.assignManager.handler(ctx, {
      employeeId: 'user-target' as any,
      // supervisorId omitted = remove manager
    });
    expect(result.success).toBe(true);
    expect(result.supervisorId).toBeUndefined();
    expect(mockPatch).toHaveBeenCalledWith('user-target', { supervisorId: undefined });
    expect(mockInsert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({
        action: 'manager_removed',
      }),
    );
  });

  it('logs audit with correct action and details', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerA);
    mockGet
      .mockResolvedValueOnce(sampleEmployee)
      .mockResolvedValueOnce(sampleManager) // supervisor name lookup
      .mockResolvedValueOnce(sampleTopManager); // for name in audit
    mockGetProfile.mockResolvedValue(null);
    const ctx = makeCtx(null);
    await reporting.assignManager.handler(ctx, {
      employeeId: 'user-target' as any,
      supervisorId: 'user-manager-1' as any,
    });
    const auditCall = mockInsert.mock.calls.find((c: any) => c[0] === 'auditLogs');
    expect(auditCall).toBeDefined();
    expect(auditCall[1].action).toBe('manager_assigned');
    expect(auditCall[1].organizationId).toBe(ORG_A);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: getOrgHierarchyTree
// ═════════════════════════════════════════════════════════════════════════════

describe('reporting.getOrgHierarchyTree', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
  });

  it('returns empty for unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const result = await reporting.getOrgHierarchyTree.handler(makeCtx([]), {
      organizationId: ORG_A as any,
    });
    expect(result).toEqual([]);
  });

  it('returns empty for cross-org caller', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerB);
    const result = await reporting.getOrgHierarchyTree.handler(makeCtx([]), {
      organizationId: ORG_A as any,
    });
    expect(result).toEqual([]);
  });

  it('returns tree for same-org admin', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerA);
    const users = [
      {
        _id: 'root',
        name: 'Root',
        role: 'admin',
        isActive: true,
        organizationId: ORG_A,
        supervisorId: undefined,
        employeeType: 'staff',
      },
      {
        _id: 'child',
        name: 'Child',
        role: 'employee',
        isActive: true,
        organizationId: ORG_A,
        supervisorId: 'root',
        employeeType: 'staff',
      },
    ];
    const ctx = makeCtx(users);
    const result = await reporting.getOrgHierarchyTree.handler(ctx, {
      organizationId: ORG_A as any,
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Root');
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].name).toBe('Child');
    expect(result[0].directReportCount).toBe(1);
  });

  it('allows superadmin to see any org tree', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCallerB);
    mockIsSuperadmin.mockReturnValue(true);
    const users = [
      {
        _id: 'root',
        name: 'Root',
        role: 'admin',
        isActive: true,
        organizationId: ORG_A,
        supervisorId: undefined,
        employeeType: 'staff',
      },
    ];
    const ctx = makeCtx(users);
    const result = await reporting.getOrgHierarchyTree.handler(ctx, {
      organizationId: ORG_A as any,
    });
    expect(result).toHaveLength(1);
  });
});
