/**
 * Tests for convex/supervisorRatings.ts — rating creation RBAC, scoring,
 * performance metrics updates and the ratings queries.
 *
 * Pattern: convex-tasks-rbac.test.ts — mock `_generated/server`, getAuthCaller,
 * lib/auth and lib/userProfile; require the module inside jest.isolateModules.
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

jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn(),
}));

// ── Module under test ────────────────────────────────────────────────────────
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockGetProfile: jest.Mock;

type Handler = (ctx: any, args: any) => Promise<unknown>;
const handlers: Record<string, Handler> = {};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  mockGetProfile = jest.requireMock('../../convex/lib/userProfile').getProfile;
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  mockGetProfile.mockReset();
  mockGetProfile.mockResolvedValue(null);
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/supervisorRatings');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      }
    }
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
const ORG_A = 'org-1';
const ORG_B = 'org-2';
const EMPLOYEE_ID = 'user_emp';
const SUPERVISOR_ID = 'user_sup';

function makeCaller(
  role: 'admin' | 'supervisor' | 'superadmin' | 'employee' | 'driver' = 'employee',
  org: string | undefined = ORG_A,
  id: string = EMPLOYEE_ID,
) {
  return { _id: id, role, email: 'caller@example.com', organizationId: org, name: 'Caller' };
}

function employeeDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: EMPLOYEE_ID,
    name: 'Anna',
    role: 'employee',
    organizationId: ORG_A,
    isActive: true,
    ...overrides,
  };
}

function ratingDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'rating_1',
    employeeId: EMPLOYEE_ID,
    supervisorId: SUPERVISOR_ID,
    qualityOfWork: 4,
    efficiency: 4,
    teamwork: 5,
    initiative: 4,
    communication: 5,
    reliability: 4,
    overallRating: 4.33,
    ratingPeriod: '2026-07',
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

function ratingArgs(overrides: Record<string, unknown> = {}) {
  return {
    employeeId: EMPLOYEE_ID,
    supervisorId: SUPERVISOR_ID,
    qualityOfWork: 4,
    efficiency: 4,
    teamwork: 5,
    initiative: 4,
    communication: 5,
    reliability: 4,
    strengths: 'Solid',
    areasForImprovement: 'Docs',
    generalComments: 'Keep it up',
    ratingPeriod: '2026-07',
    ...overrides,
  };
}

function makeCtx() {
  const get = jest.fn();
  const insert = jest.fn().mockResolvedValue('rating_1');
  const patch = jest.fn().mockResolvedValue(undefined);
  const take = jest.fn().mockResolvedValue([]);
  const first = jest.fn().mockResolvedValue(null);
  const order = jest.fn().mockReturnValue({ take, first });
  const withIndex = jest.fn().mockReturnValue({ order, take, first });
  const query = jest.fn().mockReturnValue({ withIndex, order, take, first });
  const db = { get, insert, patch, delete: jest.fn(), query };
  return { ctx: { db }, get, insert, patch, query, withIndex, order, take, first };
}

/**
 * Per-table query stub where every branch answers every terminal method.
 *
 * `createRating` reads four tables: its own ratings, performanceMetrics, and —
 * since point crediting moved behind `lib/points` — userPoints and
 * recognitionSettings. Stubs that only implement the terminals one test happens
 * to reach break as soon as the handler reads one more table, which is exactly
 * what happened when the wallet split landed. Passing `{}` for a table means
 * "no row": `first` resolves null and `take` resolves empty.
 */
function tableStub(rows: Record<string, { first?: unknown; take?: unknown }>) {
  return (table: string) => {
    const row = rows[table] ?? {};
    const terminals = {
      first: jest.fn().mockResolvedValue(row.first ?? null),
      take: jest.fn().mockResolvedValue(row.take ?? []),
      collect: jest.fn().mockResolvedValue(row.take ?? []),
    };
    const chain = { ...terminals, order: () => terminals };
    return { ...chain, withIndex: () => chain };
  };
}

/**
 * Model the wallet the way `lib/points` uses it: the insert returns a distinct
 * id and the follow-up read gives back a real wallet row, so credited totals in
 * the assertions are numbers rather than NaN.
 */
const WALLET_ID = 'points_new';

function withWallet(
  ctx: any,
  get: jest.Mock,
  insert: jest.Mock,
  existing: Record<string, unknown> | null = null,
) {
  insert.mockImplementation(async (table: string) =>
    table === 'userPoints' ? WALLET_ID : 'rating_1',
  );
  get.mockImplementation(async (id: string) =>
    id === WALLET_ID
      ? { _id: WALLET_ID, balance: 0, totalEarned: 0, totalSpent: 0, updatedAt: 0 }
      : employeeDoc({ organizationId: ORG_A }),
  );
  ctx.db.query.mockImplementation(
    tableStub({
      performanceMetrics: {},
      recognitionSettings: {},
      userPoints: existing ? { first: existing } : {},
      supervisorRatings: { take: [ratingDoc()] },
    }),
  );
}

describe('createRating — RBAC', () => {
  it('rejects unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();

    await expect(handlers.createRating(ctx, ratingArgs())).rejects.toThrow('Not authenticated');
  });

  it('throws when the target employee does not exist', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, SUPERVISOR_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    await expect(handlers.createRating(ctx, ratingArgs())).rejects.toThrow('User not found');
  });

  it('denies a caller who is not staff and not the employee', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, 'user_other'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(employeeDoc());

    await expect(handlers.createRating(ctx, ratingArgs())).rejects.toThrow(
      'Not authorized to rate this employee',
    );
  });

  it('denies rating an admin or superadmin target', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, SUPERVISOR_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(employeeDoc({ role: 'admin' }));

    await expect(handlers.createRating(ctx, ratingArgs())).rejects.toThrow(
      'Admins and superadmins cannot be rated',
    );
  });

  it('denies rating an inactive employee', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, SUPERVISOR_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(employeeDoc({ isActive: false }));

    await expect(handlers.createRating(ctx, ratingArgs())).rejects.toThrow(
      'Cannot rate inactive employees',
    );
  });

  it('denies a supervisorId that does not match the caller', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, SUPERVISOR_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(employeeDoc());

    await expect(
      handlers.createRating(ctx, ratingArgs({ supervisorId: 'user_impostor' })),
    ).rejects.toThrow('supervisorId must match the authenticated user');
  });

  it('rejects ratings outside the 1-5 range', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, SUPERVISOR_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(employeeDoc());

    await expect(handlers.createRating(ctx, ratingArgs({ qualityOfWork: 6 }))).rejects.toThrow(
      'All ratings must be between 1 and 5',
    );
  });
});

describe('createRating — success paths', () => {
  it('lets the employee rate themself', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get, insert } = makeCtx();
    get.mockResolvedValueOnce(employeeDoc());
    ctx.db.query.mockReturnValue({
      withIndex: () => ({
        take: jest.fn().mockResolvedValue([]),
        first: jest.fn().mockResolvedValue(null),
        order: () => ({ first: jest.fn().mockResolvedValue(null) }),
      }),
    });

    const id = await handlers.createRating(ctx, ratingArgs({ supervisorId: EMPLOYEE_ID }));

    expect(id).toBe('rating_1');
    expect(insert).toHaveBeenCalledWith(
      'supervisorRatings',
      expect.objectContaining({
        overallRating: (4 + 4 + 5 + 4 + 5 + 4) / 6,
        ratingPeriod: '2026-07',
      }),
    );
  });

  it('creates the rating, updates performance metrics and awards points for a 4+ review', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, SUPERVISOR_ID));
    const { ctx, get, insert, patch } = makeCtx();
    get.mockResolvedValueOnce(employeeDoc()); // target
    withWallet(ctx, get, insert);

    await handlers.createRating(ctx, ratingArgs());

    // performance metrics created
    expect(insert).toHaveBeenCalledWith(
      'performanceMetrics',
      expect.objectContaining({ userId: EMPLOYEE_ID, kpiScore: expect.any(Number) }),
    );
    // A wallet is opened empty and then credited, so the reward shows up in the
    // patch rather than in the insert.
    expect(insert).toHaveBeenCalledWith(
      'userPoints',
      expect.objectContaining({ balance: 0, totalEarned: 0, allowance: expect.any(Number) }),
    );
    expect(patch).toHaveBeenCalledWith(
      WALLET_ID,
      expect.objectContaining({ balance: 3, totalEarned: 3 }),
    );
    expect(insert).toHaveBeenCalledWith(
      'pointTransactions',
      expect.objectContaining({ amount: 3, type: 'earned_review', wallet: 'balance' }),
    );
  });

  it('patches an existing points record instead of inserting', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, SUPERVISOR_ID));
    const { ctx, get, insert, patch } = makeCtx();
    get.mockResolvedValueOnce(employeeDoc());
    withWallet(ctx, get, insert, {
      _id: 'points_1',
      balance: 5,
      totalEarned: 10,
      totalSpent: 0,
    });

    await handlers.createRating(ctx, ratingArgs());

    expect(patch).toHaveBeenCalledWith(
      'points_1',
      expect.objectContaining({ balance: 8, totalEarned: 13 }),
    );
    expect(insert).not.toHaveBeenCalledWith('userPoints', expect.anything());
  });

  it('does not award points for a review below 4', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, SUPERVISOR_ID));
    const { ctx, get, insert } = makeCtx();
    get.mockResolvedValueOnce(employeeDoc());
    withWallet(ctx, get, insert);

    await handlers.createRating(
      ctx,
      ratingArgs({
        qualityOfWork: 2,
        efficiency: 2,
        teamwork: 2,
        initiative: 2,
        communication: 2,
        reliability: 2,
      }),
    );

    expect(insert).not.toHaveBeenCalledWith('userPoints', expect.anything());
    expect(insert).not.toHaveBeenCalledWith('pointTransactions', expect.anything());
  });

  it('defaults the rating period to the current month', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, SUPERVISOR_ID));
    const { ctx, get, insert } = makeCtx();
    get.mockResolvedValueOnce(employeeDoc());
    withWallet(ctx, get, insert);

    await handlers.createRating(ctx, ratingArgs({ ratingPeriod: undefined }));

    const expected = new Date().toISOString().slice(0, 7);
    expect(insert).toHaveBeenCalledWith(
      'supervisorRatings',
      expect.objectContaining({ ratingPeriod: expected }),
    );
  });
});

describe('ratings queries', () => {
  it('getEmployeeRatings returns ratings with supervisor info', async () => {
    const { ctx, withIndex, order, take, get } = makeCtx();
    take.mockResolvedValueOnce([ratingDoc()]);
    get.mockResolvedValueOnce(employeeDoc({ _id: SUPERVISOR_ID, name: 'Boss' }));

    const result = (await handlers.getEmployeeRatings(ctx, { employeeId: EMPLOYEE_ID })) as any[];

    expect(withIndex).toHaveBeenCalledWith('by_employee', expect.any(Function));
    expect(order).toHaveBeenCalledWith('desc');
    expect(result[0].supervisor).toEqual(expect.objectContaining({ name: 'Boss' }));
  });

  it('getLatestRating returns null when there is no rating', async () => {
    const { ctx, first } = makeCtx();
    first.mockResolvedValueOnce(null);

    const result = await handlers.getLatestRating(ctx, { employeeId: EMPLOYEE_ID });

    expect(result).toBeNull();
  });

  it('getLatestRating returns the rating with its supervisor', async () => {
    const { ctx, first, get } = makeCtx();
    first.mockResolvedValueOnce(ratingDoc());
    get.mockResolvedValueOnce(employeeDoc({ _id: SUPERVISOR_ID, name: 'Boss' }));

    const result = (await handlers.getLatestRating(ctx, { employeeId: EMPLOYEE_ID })) as any;

    expect(result.overallRating).toBe(4.33);
    expect(result.supervisor.name).toBe('Boss');
  });

  it('getAverageRatings returns zeros when there are no ratings', async () => {
    const { ctx } = makeCtx();

    const result = (await handlers.getAverageRatings(ctx, { employeeId: EMPLOYEE_ID })) as any;

    expect(result).toEqual({
      qualityOfWork: 0,
      efficiency: 0,
      teamwork: 0,
      initiative: 0,
      communication: 0,
      reliability: 0,
      overall: 0,
      totalRatings: 0,
    });
  });

  it('getAverageRatings computes averages from recent ratings', async () => {
    const { ctx, take } = makeCtx();
    const now = new Date().toISOString().slice(0, 7);
    take.mockResolvedValueOnce([
      ratingDoc({ ratingPeriod: now, qualityOfWork: 4, overallRating: 4.5 }),
      ratingDoc({ _id: 'r2', ratingPeriod: now, qualityOfWork: 2, overallRating: 3 }),
      ratingDoc({ _id: 'r3', ratingPeriod: '2020-01', qualityOfWork: 5, overallRating: 5 }),
    ]);

    const result = (await handlers.getAverageRatings(ctx, { employeeId: EMPLOYEE_ID })) as any;

    // Only the two recent ones count.
    expect(result.totalRatings).toBe(2);
    expect(result.qualityOfWork).toBe(3);
    expect(result.overall).toBe(3.75);
  });

  it('getRatingsBySupervisor returns ratings with employee info', async () => {
    const { ctx, withIndex, order, take, get } = makeCtx();
    take.mockResolvedValueOnce([ratingDoc()]);
    get.mockResolvedValueOnce(employeeDoc({ name: 'Anna' }));

    const result = (await handlers.getRatingsBySupervisor(ctx, {
      supervisorId: SUPERVISOR_ID,
    })) as any[];

    expect(withIndex).toHaveBeenCalledWith('by_supervisor', expect.any(Function));
    expect(result[0].employee).toEqual(expect.objectContaining({ name: 'Anna' }));
  });

  it('getRatingTrends returns ratings in chronological order', async () => {
    const { ctx, take } = makeCtx();
    take.mockResolvedValueOnce([ratingDoc({ _id: 'newest' }), ratingDoc({ _id: 'oldest' })]);

    const result = (await handlers.getRatingTrends(ctx, { employeeId: EMPLOYEE_ID })) as any[];

    expect(result.map((r) => r._id)).toEqual(['oldest', 'newest']);
  });
});

describe('getEmployeesNeedingRating', () => {
  it('returns [] for unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();

    const result = await handlers.getEmployeesNeedingRating(ctx, {});

    expect(result).toEqual([]);
  });

  it('returns [] for employees and drivers', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx, query } = makeCtx();

    const result = await handlers.getEmployeesNeedingRating(ctx, {});

    expect(result).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('throws for staff without an organization', async () => {
    mockGetAuthCaller.mockResolvedValue({
      _id: SUPERVISOR_ID,
      role: 'admin',
      email: 'admin@example.com',
      organizationId: undefined,
      name: 'Caller',
    });
    const { ctx } = makeCtx();

    await expect(handlers.getEmployeesNeedingRating(ctx, {})).rejects.toThrow(
      'User does not belong to an organization',
    );
  });

  it('lists active employees of the org who have not been rated this month', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, SUPERVISOR_ID));
    const { ctx, withIndex, take, first, query } = makeCtx();
    take.mockResolvedValueOnce([
      employeeDoc(),
      employeeDoc({ _id: 'user_inactive', isActive: false }),
      employeeDoc({ _id: 'user_admin', role: 'admin' }),
      employeeDoc({ _id: 'user_rated', name: 'Rated' }),
    ]);
    // rating lookups: first() returns latest rating per employee
    first
      .mockResolvedValueOnce(null) // employee 1: never rated
      .mockResolvedValueOnce(ratingDoc({ ratingPeriod: '2020-01' })) // rated long ago
      .mockResolvedValueOnce(ratingDoc({ ratingPeriod: '2020-01' })) // admin — filtered out earlier
      .mockResolvedValueOnce(ratingDoc({ ratingPeriod: new Date().toISOString().slice(0, 7) })); // rated this month
    mockGetProfile.mockResolvedValue({ userId: EMPLOYEE_ID, avatarUrl: 'avatar-1' });

    const result = (await handlers.getEmployeesNeedingRating(ctx, {})) as any[];

    expect(withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
    // employee 1 (never rated) and 'user_rated' (rated in an old period) need rating
    expect(result.map((r) => r.employee._id).sort()).toEqual([EMPLOYEE_ID, 'user_rated'].sort());
    expect(result[0].employee.avatarUrl).toBe('avatar-1');
    expect(result[0].lastRated).toBe('Never');
  });

  it('lets a superadmin list all users without org scoping', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined, SUPERVISOR_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, query, take, first } = makeCtx();
    take.mockResolvedValueOnce([employeeDoc()]);
    first.mockResolvedValueOnce(null);

    const result = (await handlers.getEmployeesNeedingRating(ctx, {})) as any[];

    expect(query).toHaveBeenCalledWith('users');
    expect(result).toHaveLength(1);
  });
});
