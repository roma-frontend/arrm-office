/**
 * Tests for the createRating RBAC in convex/supervisorRatings.ts.
 *
 * Pattern: convex-integrations-sync.test.ts — mock `_generated/server` to
 * capture mutation handlers, mock getAuthCaller, and require the module
 * inside jest.isolateModules.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────
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

// createRating never calls getProfile; mock it to keep the module graph light.
jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn(),
}));

// ── Module under test ────────────────────────────────────────────────────────
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockGetProfile: jest.Mock;
let createRatingHandler: (ctx: any, args: any) => Promise<unknown>;
let getEmployeesNeedingRatingHandler: (ctx: any) => Promise<unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  mockGetProfile = jest.requireMock('../../convex/lib/userProfile').getProfile;
  // clearAllMocks keeps implementations (e.g. mockReturnValue(true) from a
  // previous test), so reset the shared module mocks explicitly.
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  mockGetProfile.mockReset();
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ratings = require('../../convex/supervisorRatings');
    createRatingHandler = ratings.createRating.handler;
    getEmployeesNeedingRatingHandler = ratings.getEmployeesNeedingRating.handler;
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
const ORG_A = 'org-1';
const ORG_B = 'org-2';
const CALLER_ID = 'user_sup';
const EMPLOYEE_ID = 'user_emp';

function makeCaller(
  role: 'admin' | 'supervisor' | 'superadmin' | 'employee' = 'supervisor',
  org = ORG_A,
) {
  return { _id: CALLER_ID, role, email: 'caller@example.com', organizationId: org, name: 'Caller' };
}

function makeTarget(
  role: 'admin' | 'supervisor' | 'employee' | 'superadmin' = 'employee',
  org = ORG_A,
  isActive = true,
) {
  return { _id: EMPLOYEE_ID, role, organizationId: org, isActive };
}

/** ctx.db mock — query() returns [] so updatePerformanceMetrics bails early. */
function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    db: {
      get: jest.fn(),
      insert: jest.fn().mockResolvedValue('rating_1'),
      query: jest.fn().mockReturnValue({
        withIndex: jest.fn().mockReturnValue({
          take: jest.fn().mockResolvedValue([]),
        }),
      }),
    },
    ...overrides,
  };
}

function ratingArgs(overrides: Record<string, unknown> = {}) {
  // All 3s → overall 3.0 (< 4) so the points-award block is skipped.
  return {
    employeeId: EMPLOYEE_ID,
    supervisorId: CALLER_ID,
    qualityOfWork: 3,
    efficiency: 3,
    teamwork: 3,
    initiative: 3,
    communication: 3,
    reliability: 3,
    ...overrides,
  };
}

/**
 * ctx.db mock for getEmployeesNeedingRating — dispatches on table name:
 * 'users' → .withIndex('by_org').take() or plain .take(); 'supervisorRatings'
 * → .withIndex('by_employee').order('desc').first().
 */
function makeListCtx(overrides: Record<string, unknown> = {}) {
  const usersTake = jest.fn().mockResolvedValue([]);
  const usersWithIndex = jest.fn().mockReturnValue({ take: usersTake });
  const ratingFirst = jest.fn().mockResolvedValue(null);
  const db = {
    get: jest.fn(),
    query: jest.fn((table: string) => {
      if (table === 'users') {
        return { withIndex: usersWithIndex, take: usersTake };
      }
      // supervisorRatings
      return {
        withIndex: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({ first: ratingFirst }),
        }),
      };
    }),
  };
  return { ctx: { db, ...overrides }, usersTake, usersWithIndex, ratingFirst };
}

describe('createRating RBAC', () => {
  it('rejects a supervisor rating an admin of the same organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('admin', ORG_A));

    await expect(createRatingHandler(ctx, ratingArgs())).rejects.toThrow(
      'Admins and superadmins cannot be rated',
    );
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('rejects a supervisor rating a superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('superadmin', ORG_A));

    await expect(createRatingHandler(ctx, ratingArgs())).rejects.toThrow(
      'Admins and superadmins cannot be rated',
    );
  });

  it('rejects an admin rating another admin of the same organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('admin', ORG_A));

    await expect(createRatingHandler(ctx, ratingArgs())).rejects.toThrow(
      'Admins and superadmins cannot be rated',
    );
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('rejects a supervisor rating an employee of another organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_B));

    await expect(createRatingHandler(ctx, ratingArgs())).rejects.toThrow(
      'Not authorized to rate this employee',
    );
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('rejects a spoofed supervisorId that does not match the caller', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A));

    await expect(
      createRatingHandler(ctx, ratingArgs({ supervisorId: 'user_other' })),
    ).rejects.toThrow('supervisorId must match the authenticated user');
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const ctx = makeCtx();

    await expect(createRatingHandler(ctx, ratingArgs())).rejects.toThrow('Not authenticated');
  });

  it('allows a supervisor to rate an employee of the same organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A));

    const result = await createRatingHandler(ctx, ratingArgs());

    expect(result).toBe('rating_1');
    expect(ctx.db.insert).toHaveBeenCalledWith(
      'supervisorRatings',
      expect.objectContaining({ employeeId: EMPLOYEE_ID, supervisorId: CALLER_ID }),
    );
  });

  it('allows a superadmin to rate anyone regardless of role or organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined));
    mockIsSuperadmin.mockReturnValue(true);
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('admin', ORG_B));

    const result = await createRatingHandler(ctx, ratingArgs());

    expect(result).toBe('rating_1');
  });

  it('treats a bootstrap-email admin as superadmin (consistent with isSuperadmin)', async () => {
    // The real isSuperadmin() falls back to the env-pinned bootstrap email
    // when no superadmin role exists yet — createRating must grant the same
    // powers as getEmployeesNeedingRating/docs access do, so a bootstrap
    // admin can rate a cross-org admin.
    mockGetAuthCaller.mockResolvedValue({
      ...makeCaller('admin', ORG_A),
      email: 'bootstrap@example.com',
    });
    mockIsSuperadmin.mockReturnValue(true);
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('admin', ORG_B));

    const result = await createRatingHandler(ctx, ratingArgs());

    expect(result).toBe('rating_1');
    expect(ctx.db.insert).toHaveBeenCalledWith(
      'supervisorRatings',
      expect.objectContaining({ employeeId: EMPLOYEE_ID }),
    );
  });

  it('still allows a supervisor to rate another supervisor of the same organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('supervisor', ORG_A));

    const result = await createRatingHandler(ctx, ratingArgs());

    expect(result).toBe('rating_1');
  });

  it('rejects a supervisor rating an inactive employee of the same organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A, false));

    await expect(createRatingHandler(ctx, ratingArgs())).rejects.toThrow(
      'Cannot rate inactive employees',
    );
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('allows a superadmin to rate an inactive employee', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined));
    mockIsSuperadmin.mockReturnValue(true);
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_B, false));

    const result = await createRatingHandler(ctx, ratingArgs());

    expect(result).toBe('rating_1');
  });

  describe('error precedence for combined violations', () => {
    it('prioritizes the org-scope error over the inactive-target error', async () => {
      // Cross-org + inactive: the org check runs before the isActive check.
      mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A));
      const ctx = makeCtx();
      ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_B, false));

      await expect(createRatingHandler(ctx, ratingArgs())).rejects.toThrow(
        'Not authorized to rate this employee',
      );
      expect(ctx.db.insert).not.toHaveBeenCalled();
    });

    it('prioritizes the admin-target error over the inactive-target error', async () => {
      // Same-org inactive admin: the admin-target check runs before isActive.
      mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A));
      const ctx = makeCtx();
      ctx.db.get.mockResolvedValue(makeTarget('admin', ORG_A, false));

      await expect(createRatingHandler(ctx, ratingArgs())).rejects.toThrow(
        'Admins and superadmins cannot be rated',
      );
      expect(ctx.db.insert).not.toHaveBeenCalled();
    });

    it('prioritizes the inactive-target error over the supervisorId spoof error', async () => {
      // Inactive + spoofed supervisorId: the isActive check runs before the
      // anti-spoof check.
      mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A));
      const ctx = makeCtx();
      ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A, false));

      await expect(
        createRatingHandler(ctx, ratingArgs({ supervisorId: 'user_other' })),
      ).rejects.toThrow('Cannot rate inactive employees');
      expect(ctx.db.insert).not.toHaveBeenCalled();
    });
  });
});

describe('getEmployeesNeedingRating auth & scoping', () => {
  it('returns an empty list for unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx, usersTake } = makeListCtx();

    const result = await getEmployeesNeedingRatingHandler(ctx);

    expect(result).toEqual([]);
    expect(usersTake).not.toHaveBeenCalled();
  });

  it('returns an empty list for employees (management view is admin/supervisor only)', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, usersTake } = makeListCtx();

    const result = await getEmployeesNeedingRatingHandler(ctx);

    expect(result).toEqual([]);
    expect(usersTake).not.toHaveBeenCalled();
  });

  it('scopes the list to the caller own organization, not any passed id', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A));
    const { ctx, usersTake, usersWithIndex } = makeListCtx();
    usersTake.mockResolvedValue([makeTarget('employee', ORG_A)]);
    mockGetProfile.mockResolvedValue(null);

    const result = (await getEmployeesNeedingRatingHandler(ctx)) as any[];

    // The users query must be scoped by the caller's org.
    expect(ctx.db.query).toHaveBeenCalledWith('users');
    expect(usersWithIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
    const eqMock = jest.fn();
    usersWithIndex.mock.calls[0][1]({ eq: eqMock });
    expect(eqMock).toHaveBeenCalledWith('organizationId', ORG_A);

    expect(result).toHaveLength(1);
    expect(result[0].employee._id).toBe(EMPLOYEE_ID);
    expect(result[0].lastRated).toBe('Never');
    expect(result[0].needsRating).toBe(true);
  });

  it('lets a superadmin list employees across all organizations', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, usersTake, usersWithIndex } = makeListCtx();
    usersTake.mockResolvedValue([makeTarget('employee', ORG_B)]);

    const result = (await getEmployeesNeedingRatingHandler(ctx)) as any[];

    expect(usersWithIndex).not.toHaveBeenCalled();
    expect(usersTake).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].employee.organizationId).toBe(ORG_B);
  });

  it('throws when a non-superadmin caller has no organization', async () => {
    // NB: makeCaller's default `org` would kick in for an explicit undefined,
    // so override organizationId explicitly.
    mockGetAuthCaller.mockResolvedValue({
      ...makeCaller('supervisor', ORG_A),
      organizationId: undefined,
    });
    const { ctx } = makeListCtx();

    await expect(getEmployeesNeedingRatingHandler(ctx)).rejects.toThrow(
      'User does not belong to an organization',
    );
  });

  it('excludes admins, superadmins and inactive employees from the list', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A));
    const { ctx, usersTake } = makeListCtx();
    usersTake.mockResolvedValue([
      makeTarget('employee', ORG_A), // keep
      { ...makeTarget('employee', ORG_A), _id: 'user_inactive', isActive: false }, // drop
      { ...makeTarget('admin', ORG_A), _id: 'user_admin' }, // drop
      { ...makeTarget('superadmin', ORG_A), _id: 'user_superadmin' }, // drop
    ]);

    const result = (await getEmployeesNeedingRatingHandler(ctx)) as any[];

    expect(result).toHaveLength(1);
    expect(result[0].employee._id).toBe(EMPLOYEE_ID);
  });

  it('excludes employees already rated in the current period', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A));
    const { ctx, usersTake, ratingFirst } = makeListCtx();
    usersTake.mockResolvedValue([makeTarget('employee', ORG_A)]);
    ratingFirst.mockResolvedValue({ ratingPeriod: new Date().toISOString().slice(0, 7) });

    const result = await getEmployeesNeedingRatingHandler(ctx);

    expect(result).toEqual([]);
  });

  it('enriches the avatar from the employee profile', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A));
    const { ctx, usersTake } = makeListCtx();
    usersTake.mockResolvedValue([makeTarget('employee', ORG_A)]);
    mockGetProfile.mockResolvedValue({ avatarUrl: 'https://cdn.example/avatar.jpg' });

    const result = (await getEmployeesNeedingRatingHandler(ctx)) as any[];

    expect(result[0].employee.avatarUrl).toBe('https://cdn.example/avatar.jpg');
  });
});
