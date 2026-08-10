/**
 * Tests for convex/dashboard.ts reporting-line and branch gaps:
 *
 *  - getReportingLine: supervisor chain walk (bounded, cycle-safe), direct
 *    reports, cross-org denial, null shapes
 *  - getMyTasks: both-undated tie-break sort branch
 *  - getUpcomingBirthdays: dd-mm-yyyy parsing, invalid dates
 *  - getOutOfOffice: unknown-user name fallback, withinDays arg
 *
 * Pattern: convex-dashboard.test.ts — mock `_generated/server` to capture
 * handlers, mock getAuthCaller/isSuperadmin/getProfile, require the module
 * inside jest.isolateModules.
 */

import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';

// ═════════════════════════════════════════════════════════════════════════════
// MOCKS
// ═════════════════════════════════════════════════════════════════════════════

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

jest.mock('../../convex/lib/limits', () => ({
  DEFAULT_LIST_CAP: 50,
  SMALL_LIST_CAP: 10,
}));

// ═════════════════════════════════════════════════════════════════════════════
// MODULE LOADING
// ═════════════════════════════════════════════════════════════════════════════

let dashboard: any;
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockGetProfile: jest.Mock;

const ORG_A = 'org-aaa';
const ORG_B = 'org-bbb';

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
    mockGetProfile = jest.requireMock('../../convex/lib/userProfile').getProfile;
    dashboard = require('../../convex/dashboard');
  });
});

// ── Helpers ──

function makeQueryChain(fakeResult: any) {
  // q mimics the Convex expression builder so `withIndex`/`filter` callbacks
  // execute — covering the `q.eq`/`q.field` predicate lines.
  const q: any = {
    eq: (..._args: unknown[]) => q,
    field: (name: string) => ({ __field: name }),
    gte: (..._args: unknown[]) => q,
    lt: (..._args: unknown[]) => q,
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
      get: jest.fn(),
      query: () => qc,
    },
  };
}

const callerA = {
  _id: 'user-caller',
  name: 'Caller',
  email: 'c@a.com',
  role: 'employee',
  organizationId: ORG_A,
};

// ═════════════════════════════════════════════════════════════════════════════
// getReportingLine
// ═════════════════════════════════════════════════════════════════════════════

describe('dashboard.getReportingLine', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
    mockGetProfile.mockResolvedValue(null);
  });

  const user = (id: string, over = {}) => ({
    _id: id,
    name: `Name ${id}`,
    email: `${id}@a.com`,
    organizationId: ORG_A,
    position: undefined,
    supervisorId: undefined,
    isActive: true,
    ...over,
  });

  it('returns null when the caller is unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const ctx = makeCtx([]);
    const result = await dashboard.getReportingLine.handler(ctx, {});
    expect(result).toBeNull();
  });

  it('returns null when the target user does not exist', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const ctx = makeCtx([]);
    ctx.db.get.mockResolvedValue(null);
    const result = await dashboard.getReportingLine.handler(ctx, {});
    expect(result).toBeNull();
  });

  it('returns null when inspecting a user from another org', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const ctx = makeCtx([]);
    ctx.db.get.mockResolvedValue(user('user-other', { organizationId: ORG_B }));
    const result = await dashboard.getReportingLine.handler(ctx, { userId: 'user-other' });
    expect(result).toBeNull();
  });

  it('lets a superadmin inspect a user from any org', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockIsSuperadmin.mockReturnValue(true);
    const ctx = makeCtx([]); // no direct reports
    ctx.db.get.mockImplementation(async (id: string) =>
      id === 'user-other' ? user('user-other', { organizationId: ORG_B }) : null,
    );
    const result = await dashboard.getReportingLine.handler(ctx, { userId: 'user-other' });
    expect(result).not.toBeNull();
    expect(result!.self._id).toBe('user-other');
  });

  it('walks the manager chain nearest-first', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const me = user('user-caller', { supervisorId: 'user-m1' });
    const m1 = user('user-m1', { supervisorId: 'user-m2', position: 'Lead' });
    const m2 = user('user-m2');
    const ctx = makeCtx([]);
    ctx.db.get.mockImplementation(async (id: string) => {
      if (id === 'user-caller') return me;
      if (id === 'user-m1') return m1;
      if (id === 'user-m2') return m2;
      return null;
    });
    // myProfile carries the supervisorId (also exercised via the user doc).
    mockGetProfile.mockImplementation(async (_ctx: any, id: string) => {
      if (id === 'user-caller') return { supervisorId: 'user-m1' };
      if (id === 'user-m1') return { position: 'Lead', supervisorId: 'user-m2' };
      return null;
    });

    const result = await dashboard.getReportingLine.handler(ctx, {});
    expect(result!.managers.map((m: any) => m._id)).toEqual(['user-m1', 'user-m2']);
    expect(result!.managers[0].position).toBe('Lead');
    expect(result!.self._id).toBe('user-caller');
  });

  it('stops the chain at a missing manager', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const me = user('user-caller', { supervisorId: 'user-ghost' });
    const ctx = makeCtx([]);
    ctx.db.get.mockImplementation(async (id: string) => (id === 'user-caller' ? me : null));
    const result = await dashboard.getReportingLine.handler(ctx, {});
    expect(result!.managers).toEqual([]);
  });

  it('breaks a supervisor cycle instead of looping', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const me = user('user-caller', { supervisorId: 'user-m1' });
    const m1 = user('user-m1', { supervisorId: 'user-m1' }); // self-referential
    const ctx = makeCtx([]);
    ctx.db.get.mockImplementation(async (id: string) => {
      if (id === 'user-caller') return me;
      if (id === 'user-m1') return m1;
      return null;
    });
    mockGetProfile.mockImplementation(async (_ctx: any, id: string) =>
      id === 'user-caller' ? { supervisorId: 'user-m1' } : null,
    );

    const result = await dashboard.getReportingLine.handler(ctx, {});
    expect(result!.managers.map((m: any) => m._id)).toEqual(['user-m1']);
  });

  it('lists active direct reports sorted by name', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const me = user('user-caller');
    const r1 = user('user-r1', { supervisorId: 'user-caller' });
    const r2 = user('user-r2', { supervisorId: 'user-caller', isActive: false });
    const ctx = makeCtx([r2, r1]); // query returns both; inactive filtered out
    ctx.db.get.mockImplementation(async (id: string) => (id === 'user-caller' ? me : null));
    mockGetProfile.mockImplementation(async (_ctx: any, id: string) =>
      id === 'user-r1' ? { position: 'Engineer', department: 'Eng' } : null,
    );

    const result = await dashboard.getReportingLine.handler(ctx, {});
    expect(result!.directReports.map((r: any) => r._id)).toEqual(['user-r1']);
    expect(result!.directReports[0].position).toBe('Engineer');
    expect(result!.directReports[0].department).toBe('Eng');
  });

  it('sorts multiple active direct reports by name', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const me = user('user-caller');
    // Deliberately returned out of order → the localeCompare sort must fix it.
    const zed = user('user-zed', { supervisorId: 'user-caller', name: 'Zed' });
    const ann = user('user-ann', { supervisorId: 'user-caller', name: 'Ann' });
    const ctx = makeCtx([zed, ann]);
    ctx.db.get.mockImplementation(async (id: string) => (id === 'user-caller' ? me : null));
    mockGetProfile.mockResolvedValue(null);

    const result = await dashboard.getReportingLine.handler(ctx, {});
    expect(result!.directReports.map((r: any) => r._id)).toEqual(['user-ann', 'user-zed']);
    expect(result!.directReports.map((r: any) => r.name)).toEqual(['Ann', 'Zed']);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getMyTasks — both-undated tie-break
// ═════════════════════════════════════════════════════════════════════════════

describe('dashboard.getMyTasks branch', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
  });

  it('sorts two undated tasks by newest creation first', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const ctx = makeCtx([
      { _id: 't1', deadline: null, createdAt: 100, organizationId: ORG_A },
      { _id: 't2', deadline: null, createdAt: 200, organizationId: ORG_A },
    ]);
    const result = await dashboard.getMyTasks.handler(ctx, {});
    // Three parallel queries each return both tasks → 6 entries; newest first.
    expect(result[0]._id).toBe('t2');
    expect(result[0].createdAt).toBeGreaterThanOrEqual(result[1].createdAt);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getUpcomingBirthdays — date parsing branches
// ═════════════════════════════════════════════════════════════════════════════

describe('dashboard.getUpcomingBirthdays parsing', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetProfile.mockResolvedValue(null);
  });

  it('parses dd-mm-yyyy dates (day first)', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const future = new Date(Date.now() + 10 * 86400000);
    const day = String(future.getUTCDate()).padStart(2, '0');
    const month = String(future.getUTCMonth() + 1).padStart(2, '0');
    const dob = `${day}-${month}-2000`; // dd-mm-yyyy

    const ctx = makeCtx([
      { _id: 'u-dm', name: 'Day First', organizationId: ORG_A, isActive: true, dateOfBirth: dob },
    ]);
    const result = await dashboard.getUpcomingBirthdays.handler(ctx, {});
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].dateOfBirth).toBe(dob);
  });

  it('skips malformed date-of-birth strings', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const ctx = makeCtx([
      { _id: 'u-bad', name: 'Bad', organizationId: ORG_A, isActive: true, dateOfBirth: 'nope' },
      {
        _id: 'u-short',
        name: 'Short',
        organizationId: ORG_A,
        isActive: true,
        dateOfBirth: '01-02',
      },
    ]);
    const result = await dashboard.getUpcomingBirthdays.handler(ctx, {});
    expect(result).toEqual([]);
  });

  it('skips out-of-range months and days', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const ctx = makeCtx([
      {
        _id: 'u-m',
        name: 'Bad Month',
        organizationId: ORG_A,
        isActive: true,
        dateOfBirth: '2000-13-01',
      },
      {
        _id: 'u-d',
        name: 'Bad Day',
        organizationId: ORG_A,
        isActive: true,
        dateOfBirth: '2000-01-40',
      },
    ]);
    const result = await dashboard.getUpcomingBirthdays.handler(ctx, {});
    expect(result).toEqual([]);
  });

  it('marks a birthday as isToday when it falls on the current day', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const ctx = makeCtx([
      {
        _id: 'u-today',
        name: 'Today',
        organizationId: ORG_A,
        isActive: true,
        dateOfBirth: `2000-${month}-${day}`,
      },
    ]);
    const result = await dashboard.getUpcomingBirthdays.handler(ctx, {});
    expect(result[0].isToday).toBe(true);
    expect(result[0].daysUntil).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getOutOfOffice — name fallback + withinDays
// ═════════════════════════════════════════════════════════════════════════════

describe('dashboard.getOutOfOffice branches', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetProfile.mockResolvedValue(null);
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const futureStr = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

  it('falls back to "Unknown" for a leave whose user row is missing', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const ctx = makeCtx([
      {
        _id: 'lv-x',
        userId: 'user-gone',
        organizationId: ORG_A,
        status: 'approved',
        type: 'vacation',
        startDate: todayStr,
        endDate: futureStr,
      },
    ]);
    ctx.db.get.mockResolvedValue(null); // user gone

    const result = await dashboard.getOutOfOffice.handler(ctx, {});
    expect(result[0].name).toBe('Unknown');
    expect(result[0].userId).toBe('user-gone');
  });

  it('honours a custom withinDays window', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    // Leave starting 20 days out — outside a 7-day window, inside a 30-day one.
    const far = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    const farEnd = new Date(Date.now() + 22 * 86400000).toISOString().slice(0, 10);
    const ctx = makeCtx([
      {
        _id: 'lv-far',
        userId: 'user-a',
        organizationId: ORG_A,
        status: 'approved',
        type: 'vacation',
        startDate: far,
        endDate: farEnd,
      },
    ]);

    const tight = await dashboard.getOutOfOffice.handler(ctx, { withinDays: 7 });
    expect(tight).toEqual([]);

    const wide = await dashboard.getOutOfOffice.handler(ctx, { withinDays: 30 });
    expect(wide).toHaveLength(1);
  });
});
