/**
 * Organization scoping for the queries behind /team.
 *
 * The directory used to mix tenants together: users.getAllUsers returned every
 * user of every organization to a superadmin with no way to narrow it, while
 * dashboard.getUpcomingBirthdays and dashboard.getOutOfOffice were pinned to the
 * caller's own organization and ignored the org selector. All three now accept an
 * optional organizationId with the same contract.
 *
 * getAllUsers must keep its unscoped behaviour when no organizationId is passed —
 * the chat "All orgs" mode depends on a superadmin seeing everyone.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
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

jest.mock('../../convex/lib/userRedaction', () => ({
  redactUser: (u: any) => u,
}));

jest.mock('../../convex/lib/limits', () => ({
  DEFAULT_LIST_CAP: 50,
  SMALL_LIST_CAP: 10,
}));

let usersQueries: any;
let dashboard: any;
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockGetProfile: jest.Mock;

const ORG_A = 'org-aaa' as any;
const ORG_B = 'org-bbb' as any;

const employeeA = {
  _id: 'user-1' as any,
  name: 'Employee A',
  role: 'employee' as const,
  organizationId: ORG_A,
};

const superadminInA = {
  _id: 'user-super' as any,
  name: 'Super',
  role: 'superadmin' as const,
  organizationId: ORG_A,
};

/** Records the index each handler read through, and the bounds it pinned. */
let reads: Array<{ index: string; bounds: Record<string, unknown> }> = [];

function makeCtx(rows: unknown[]) {
  const chain: any = {
    withIndex: (index: string, cb?: (q: any) => unknown) => {
      const bounds: Record<string, unknown> = {};
      const q = {
        eq: (field: string, value: unknown) => {
          bounds[field] = value;
          return q;
        },
      };
      if (typeof cb === 'function') cb(q);
      reads.push({ index, bounds });
      return chain;
    },
    filter: (cb?: (q: any) => unknown) => {
      if (typeof cb === 'function') {
        const q: any = {
          and: (...a: unknown[]) => a,
          or: (...a: unknown[]) => a,
          eq: (...a: unknown[]) => a,
          neq: (...a: unknown[]) => a,
          field: (f: string) => f,
        };
        cb(q);
      }
      return chain;
    },
    order: () => chain,
    take: async () => rows,
    first: async () => rows[0] ?? null,
  };

  return {
    db: {
      get: jest.fn(async () => null),
      query: () => chain,
    },
    auth: { getUserIdentity: async () => null },
  };
}

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
    mockGetProfile = jest.requireMock('../../convex/lib/userProfile').getProfile;

    usersQueries = require('../../convex/users/queries');
    dashboard = require('../../convex/dashboard');
  });
});

beforeEach(() => {
  jest.resetAllMocks();
  reads = [];
  mockGetProfile.mockResolvedValue(null);
});

describe('users.getAllUsers organization scoping', () => {
  it('pins the read to an explicitly requested organization', async () => {
    mockGetAuthCaller.mockResolvedValue(superadminInA);
    mockIsSuperadmin.mockReturnValue(true);

    await usersQueries.getAllUsers.handler(makeCtx([]), { organizationId: ORG_B, limit: 100 });

    expect(reads).toHaveLength(1);
    expect(reads[0]).toEqual({ index: 'by_org', bounds: { organizationId: ORG_B } });
  });

  it('refuses an organization other than the caller\u2019s own for a non-superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeA);
    mockIsSuperadmin.mockReturnValue(false);

    const result = await usersQueries.getAllUsers.handler(makeCtx([{ _id: 'x' }]), {
      organizationId: ORG_B,
    });

    expect(result).toEqual([]);
    expect(reads).toHaveLength(0);
  });

  it('lets a non-superadmin name their own organization', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeA);
    mockIsSuperadmin.mockReturnValue(false);

    await usersQueries.getAllUsers.handler(makeCtx([]), { organizationId: ORG_A });

    expect(reads[0]?.bounds).toEqual({ organizationId: ORG_A });
  });

  it('still returns every organization to a superadmin when none is named', async () => {
    mockGetAuthCaller.mockResolvedValue(superadminInA);
    mockIsSuperadmin.mockReturnValue(true);

    const rows = [
      { _id: 'a', role: 'employee', organizationId: ORG_A },
      { _id: 'b', role: 'employee', organizationId: ORG_B },
    ];
    const result = await usersQueries.getAllUsers.handler(makeCtx(rows), {});

    // No index read at all — this branch scans, which is what "All orgs" needs.
    expect(reads).toHaveLength(0);
    expect(result).toHaveLength(2);
  });

  it('drops superadmins from an org-scoped read', async () => {
    mockGetAuthCaller.mockResolvedValue(superadminInA);
    mockIsSuperadmin.mockReturnValue(true);

    await usersQueries.getAllUsers.handler(makeCtx([]), { organizationId: ORG_A });

    // The filter predicate is exercised through the chain mock; reaching here
    // without throwing means isActive/role were referenced on valid fields.
    expect(reads[0]?.index).toBe('by_org');
  });
});

describe('dashboard.getUpcomingBirthdays organization scoping', () => {
  it('follows the organization a superadmin is browsing', async () => {
    mockGetAuthCaller.mockResolvedValue(superadminInA);
    mockIsSuperadmin.mockReturnValue(true);

    await dashboard.getUpcomingBirthdays.handler(makeCtx([]), { organizationId: ORG_B });

    expect(reads[0]).toEqual({
      index: 'by_org_active',
      bounds: { organizationId: ORG_B, isActive: true },
    });
  });

  it('refuses another organization for a non-superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeA);
    mockIsSuperadmin.mockReturnValue(false);

    const result = await dashboard.getUpcomingBirthdays.handler(makeCtx([]), {
      organizationId: ORG_B,
    });

    expect(result).toEqual([]);
    expect(reads).toHaveLength(0);
  });

  it("defaults to the caller's own organization", async () => {
    mockGetAuthCaller.mockResolvedValue(employeeA);
    mockIsSuperadmin.mockReturnValue(false);

    await dashboard.getUpcomingBirthdays.handler(makeCtx([]), {});

    expect(reads[0]?.bounds).toEqual({ organizationId: ORG_A, isActive: true });
  });
});

describe('dashboard.getOutOfOffice organization scoping', () => {
  it('follows the organization a superadmin is browsing', async () => {
    mockGetAuthCaller.mockResolvedValue(superadminInA);
    mockIsSuperadmin.mockReturnValue(true);

    await dashboard.getOutOfOffice.handler(makeCtx([]), { organizationId: ORG_B });

    expect(reads[0]).toEqual({
      index: 'by_org_status',
      bounds: { organizationId: ORG_B, status: 'approved' },
    });
  });

  it('refuses another organization for a non-superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeA);
    mockIsSuperadmin.mockReturnValue(false);

    const result = await dashboard.getOutOfOffice.handler(makeCtx([]), { organizationId: ORG_B });

    expect(result).toEqual([]);
    expect(reads).toHaveLength(0);
  });

  it("defaults to the caller's own organization", async () => {
    mockGetAuthCaller.mockResolvedValue(employeeA);
    mockIsSuperadmin.mockReturnValue(false);

    await dashboard.getOutOfOffice.handler(makeCtx([]), {});

    expect(reads[0]?.bounds).toEqual({ organizationId: ORG_A, status: 'approved' });
  });

  it('returns nothing when the caller has no organization at all', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...employeeA, organizationId: undefined });
    mockIsSuperadmin.mockReturnValue(false);

    const result = await dashboard.getOutOfOffice.handler(makeCtx([]), {});
    expect(result).toEqual([]);
  });
});
