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
  // q mimics the Convex expression builder so withIndex callbacks execute —
  // covering the `q.eq(...)` predicate lines.
  const q: any = { eq: (..._args: unknown[]) => q };
  const withIndex = jest.fn((_name: string, cb?: (q: any) => unknown) => {
    if (typeof cb === 'function') cb(q);
    return { order, take, first };
  });
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
    // Invoke index/filter predicates so the `q.eq(...)` builder lines are hit.
    const chain = {
      ...terminals,
      order: () => terminals,
      eq: () => chain,
      neq: () => chain,
      field: () => chain,
      and: () => chain,
      gte: () => chain,
      lte: () => chain,
    };
    return {
      ...chain,
      withIndex: (_name: string, cb?: (q: any) => any) => {
        if (typeof cb === 'function') cb(chain);
        return chain;
      },
      filter: (cb?: (q: any) => any) => {
        if (typeof cb === 'function') cb(chain);
        return chain;
      },
    };
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

  it('lets HR rate another admin — this is how the CEO rates HR', async () => {
    // The old rule refused any admin target outright, which made "equal role ⇒
    // nobody is senior" true again and left the CEO unable to rate their own HR.
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, SUPERVISOR_ID));
    const { ctx, get, insert } = makeCtx();
    get.mockResolvedValueOnce(employeeDoc({ role: 'admin' }));
    withWallet(ctx, get, insert);

    await expect(handlers.createRating(ctx, ratingArgs())).resolves.toBe('rating_1');
  });

  it('denies rating the platform superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, SUPERVISOR_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(employeeDoc({ role: 'superadmin' }));

    await expect(handlers.createRating(ctx, ratingArgs())).rejects.toThrow(
      'platform superadmin is not rated',
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
  it('refuses an employee rating themself', async () => {
    // Self-rating used to be allowed, and a 4+ review pays out points that buy
    // vouchers — so it was a self-service reward.
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A));
    const { ctx, get, insert } = makeCtx();
    get.mockResolvedValueOnce(employeeDoc());

    await expect(
      handlers.createRating(ctx, ratingArgs({ supervisorId: EMPLOYEE_ID })),
    ).rejects.toThrow('You cannot rate yourself');
    expect(insert).not.toHaveBeenCalled();
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

  it('patches existing performance metrics instead of inserting', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, SUPERVISOR_ID));
    const { ctx, get, insert, patch, query } = makeCtx();
    get.mockResolvedValueOnce(employeeDoc()); // target
    insert.mockImplementation(async (table: string) =>
      table === 'userPoints' ? WALLET_ID : 'rating_1',
    );
    get.mockImplementation(async (id: string) =>
      id === WALLET_ID
        ? { _id: WALLET_ID, balance: 0, totalEarned: 0, totalSpent: 0, updatedAt: 0 }
        : employeeDoc({ organizationId: ORG_A }),
    );
    query.mockImplementation(
      tableStub({
        performanceMetrics: {
          // An existing metrics row → updatePerformanceMetrics takes the patch path.
          first: { _id: 'perf_1', userId: EMPLOYEE_ID, kpiScore: 3 },
        },
        recognitionSettings: {},
        userPoints: {},
        supervisorRatings: { take: [ratingDoc()] },
      }),
    );

    await handlers.createRating(ctx, ratingArgs());

    expect(patch).toHaveBeenCalledWith(
      'perf_1',
      expect.objectContaining({ kpiScore: expect.any(Number), updatedBy: SUPERVISOR_ID }),
    );
    expect(insert).not.toHaveBeenCalledWith('performanceMetrics', expect.anything());
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

  it('getAverageRatings falls back to all ratings when none are recent', async () => {
    const { ctx, take } = makeCtx();
    // Every rating is older than the N-month cutoff → recentRatings is empty,
    // so the handler falls back to the full list (branch `recentRatings.length > 0`).
    take.mockResolvedValueOnce([
      ratingDoc({ _id: 'old1', ratingPeriod: '2020-01', qualityOfWork: 4, overallRating: 4 }),
      ratingDoc({ _id: 'old2', ratingPeriod: '2019-06', qualityOfWork: 2, overallRating: 2 }),
    ]);

    const result = (await handlers.getAverageRatings(ctx, { employeeId: EMPLOYEE_ID })) as any;

    expect(result.totalRatings).toBe(2);
    expect(result.qualityOfWork).toBe(3);
    expect(result.overall).toBe(3);
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
    // rating lookups: first() returns the latest rating per rateable person, in
    // list order — the inactive user is filtered out before these run.
    first
      .mockResolvedValueOnce(null) // user_emp: never rated
      .mockResolvedValueOnce(ratingDoc({ ratingPeriod: '2020-01' })) // user_admin: rated long ago
      .mockResolvedValueOnce(ratingDoc({ ratingPeriod: new Date().toISOString().slice(0, 7) })); // user_rated: rated this month
    mockGetProfile.mockResolvedValue({ userId: EMPLOYEE_ID, avatarUrl: 'avatar-1' });

    const result = (await handlers.getEmployeesNeedingRating(ctx, {})) as any[];

    expect(withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
    // The inactive user is dropped and the one already rated this month falls
    // out; the admin does not — an admin is somebody's report like anybody else,
    // which is what lets the CEO rate HR. Only the declared head of the
    // organization is excluded, and this org has none.
    expect(result.map((r) => r.employee._id).sort()).toEqual([EMPLOYEE_ID, 'user_admin'].sort());
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
