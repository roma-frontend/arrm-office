/**
 * Tests for convex/dashboard.ts — auth checks, sorting, date logic.
 *
 * Covers getMyTasks, getUpcomingBirthdays, getOutOfOffice.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

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

jest.mock('../../convex/lib/reportingLine', () => ({
  getSubordinateIds: jest.fn(),
}));

// ═════════════════════════════════════════════════════════════════════════════
// MODULE LOADING
// ═════════════════════════════════════════════════════════════════════════════

let dashboard: any;
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockGetProfile: jest.Mock;
let mockGetSubordinateIds: jest.Mock;

const ORG_A = 'org-aaa';
const ORG_B = 'org-bbb';

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
    mockGetProfile = jest.requireMock('../../convex/lib/userProfile').getProfile;
    mockGetSubordinateIds = jest.requireMock('../../convex/lib/reportingLine').getSubordinateIds;

    dashboard = require('../../convex/dashboard');
  });
});

// ── Helpers ──

function makeQueryChain(fakeResult: any) {
  let chain: any = {
    withIndex: () => chain,
    filter: () => chain,
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
const callerB = {
  _id: 'user-caller-b',
  name: 'Caller B',
  email: 'c@b.com',
  role: 'admin',
  organizationId: ORG_B,
};
const superadmin = {
  _id: 'user-super',
  name: 'Super',
  email: 's@a.com',
  role: 'superadmin',
  organizationId: ORG_B,
};

// ═════════════════════════════════════════════════════════════════════════════
// getMyTasks
// ═════════════════════════════════════════════════════════════════════════════

describe('dashboard.getMyTasks', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
  });

  const makeTask = (id: string, overrides = {}) => ({
    _id: id,
    title: `Task ${id}`,
    status: 'pending',
    priority: 'medium',
    organizationId: ORG_A,
    deadline: Date.now() + 86400000,
    createdAt: Date.now(),
    assignedTo: 'user-caller',
    ...overrides,
  });

  it('returns empty when caller is unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const result = await dashboard.getMyTasks.handler(makeCtx([]), {});
    expect(result).toEqual([]);
  });

  it('returns tasks sorted by deadline (soonest first)', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const far = makeTask('t1', { deadline: Date.now() + 86400000 * 5 });
    const near = makeTask('t2', { deadline: Date.now() + 86400000 });
    // pending gets near, in_progress/review return empty
    const ctx = makeCtx([far, near]); // pending query
    // Override: make query chain return different results per call
    const result = await dashboard.getMyTasks.handler(ctx, {});
    // Only tasks matching caller's org, sorted soonest first
    expect(result.length).toBeGreaterThanOrEqual(2);
    if (result.length >= 2) {
      expect(result[0].deadline).toBeLessThanOrEqual(result[1].deadline!);
    }
  });

  it('puts undated tasks after dated ones', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const undated = makeTask('t1', { deadline: null });
    const dated = makeTask('t2', { deadline: Date.now() + 86400000 });
    const ctx = makeCtx([undated, dated]);
    const result = await dashboard.getMyTasks.handler(ctx, {});
    const datedIdx = result.findIndex((t: any) => t._id === 't2');
    const undatedIdx = result.findIndex((t: any) => t._id === 't1');
    expect(datedIdx).toBeLessThan(undatedIdx);
  });

  it('shows superadmin tasks from any org', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    mockIsSuperadmin.mockReturnValue(true);
    // 3 parallel queries each return the same 2 tasks → 6 total before sort
    const ctx = makeCtx([
      makeTask('t1', { organizationId: ORG_A }),
      makeTask('t2', { organizationId: ORG_B }),
    ]);
    const result = await dashboard.getMyTasks.handler(ctx, {});
    expect(result.length).toBe(6);
    // Both orgs represented
    const orgs = new Set(result.map((t: any) => t._id));
    expect(orgs.has('t1')).toBe(true);
    expect(orgs.has('t2')).toBe(true);
  });

  it('filters cross-org tasks for non-superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    // 3 parallel queries return 2 tasks each → 6 total, filter to ORG_A → 3
    const ctx = makeCtx([
      makeTask('t1', { organizationId: ORG_A }),
      makeTask('t2', { organizationId: ORG_B }),
    ]);
    const result = await dashboard.getMyTasks.handler(ctx, {});
    expect(result.length).toBe(3);
    result.forEach((t: any) => expect(t._id).toBe('t1'));
  });

  it('returns empty when no active tasks', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const ctx = makeCtx([]);
    const result = await dashboard.getMyTasks.handler(ctx, {});
    expect(result).toEqual([]);
  });

  it('maps task to minimal shape', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const task = makeTask('t1', {
      status: 'in_progress',
      priority: 'high',
      deadline: 1000,
      createdAt: 500,
    });
    // 3 parallel queries each return the same task → 3 total
    const ctx = makeCtx([task]);
    const result = await dashboard.getMyTasks.handler(ctx, {});
    expect(result.length).toBe(3);
    expect(result[0]).toEqual({
      _id: 't1',
      title: 'Task t1',
      status: 'in_progress',
      priority: 'high',
      deadline: 1000,
      createdAt: 500,
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getUpcomingBirthdays
// ═════════════════════════════════════════════════════════════════════════════

describe('dashboard.getUpcomingBirthdays', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns empty when caller is unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const result = await dashboard.getUpcomingBirthdays.handler(makeCtx([]), {});
    expect(result).toEqual([]);
  });

  it('returns empty when caller has no organizationId', async () => {
    mockGetAuthCaller.mockResolvedValue({
      _id: 'u1',
      name: 'No Org',
      role: 'employee',
      organizationId: null,
    });
    const result = await dashboard.getUpcomingBirthdays.handler(makeCtx([]), {});
    expect(result).toEqual([]);
  });

  it('returns birthdays within default 30 days', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    // Create a date 7 days from now
    const future = new Date(Date.now() + 7 * 86400000);
    const month = String(future.getUTCMonth() + 1).padStart(2, '0');
    const day = String(future.getUTCDate()).padStart(2, '0');
    const dob = `2000-${month}-${day}`; // ISO format

    const user = {
      _id: 'u-bday',
      name: 'Birthday Person',
      email: 'b@a.com',
      organizationId: ORG_A,
      isActive: true,
      dateOfBirth: dob,
    };
    mockGetProfile.mockResolvedValue(null);
    const ctx = makeCtx([user]);
    const result = await dashboard.getUpcomingBirthdays.handler(ctx, {});
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].name).toBe('Birthday Person');
    expect(result[0].daysUntil).toBeLessThanOrEqual(30);
  });

  it('returns empty when no birthdays within window', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    // Birthday 90 days away
    const future = new Date(Date.now() + 90 * 86400000);
    const month = String(future.getUTCMonth() + 1).padStart(2, '0');
    const day = String(future.getUTCDate()).padStart(2, '0');
    const dob = `2000-${month}-${day}`;

    const user = {
      _id: 'u-far',
      name: 'Far Birthday',
      email: 'f@a.com',
      organizationId: ORG_A,
      isActive: true,
      dateOfBirth: dob,
    };
    mockGetProfile.mockResolvedValue(null);
    const ctx = makeCtx([user]);
    const result = await dashboard.getUpcomingBirthdays.handler(ctx, { withinDays: 30 });
    expect(result).toEqual([]);
  });

  it('respects custom withinDays parameter', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const future = new Date(Date.now() + 5 * 86400000);
    const month = String(future.getUTCMonth() + 1).padStart(2, '0');
    const day = String(future.getUTCDate()).padStart(2, '0');
    const dob = `2000-${month}-${day}`;

    const user = {
      _id: 'u-custom',
      name: 'Custom',
      email: 'c@a.com',
      organizationId: ORG_A,
      isActive: true,
      dateOfBirth: dob,
    };
    mockGetProfile.mockResolvedValue(null);
    const ctx = makeCtx([user]);
    // withinDays=3 should exclude this birthday (5 days away)
    const result = await dashboard.getUpcomingBirthdays.handler(ctx, { withinDays: 3 });
    expect(result).toEqual([]);
  });

  it('rolls birthday to next year when already passed', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    // Birthday 2 months ago
    const past = new Date(Date.now() - 60 * 86400000);
    const month = String(past.getUTCMonth() + 1).padStart(2, '0');
    const day = String(past.getUTCDate()).padStart(2, '0');
    const dob = `2000-${month}-${day}`;

    const user = {
      _id: 'u-past',
      name: 'Past Birthday',
      email: 'p@a.com',
      organizationId: ORG_A,
      isActive: true,
      dateOfBirth: dob,
    };
    mockGetProfile.mockResolvedValue(null);
    const ctx = makeCtx([user]);
    // Birthday is in the past but was 60 days ago → next occurrence ≈ 305 days away
    const result = await dashboard.getUpcomingBirthdays.handler(ctx, { withinDays: 365 });
    // withinDays=365 should catch it (it's ~305 days to next birthday)
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].daysUntil).toBeGreaterThan(0);
  });

  it('falls back to profile dateOfBirth', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const future = new Date(Date.now() + 10 * 86400000);
    const month = String(future.getUTCMonth() + 1).padStart(2, '0');
    const day = String(future.getUTCDate()).padStart(2, '0');
    const dob = `2000-${month}-${day}`;

    // User has no dateOfBirth on record
    const user = {
      _id: 'u-profile-bday',
      name: 'Profile Bday',
      email: 'p@a.com',
      organizationId: ORG_A,
      isActive: true,
    };
    // Profile has it
    mockGetProfile.mockResolvedValue({ dateOfBirth: dob });
    const ctx = makeCtx([user]);
    const result = await dashboard.getUpcomingBirthdays.handler(ctx, {});
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('skips users with no dateOfBirth at all', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const user = {
      _id: 'u-no-dob',
      name: 'No DOB',
      email: 'n@a.com',
      organizationId: ORG_A,
      isActive: true,
    };
    mockGetProfile.mockResolvedValue(null);
    const ctx = makeCtx([user]);
    const result = await dashboard.getUpcomingBirthdays.handler(ctx, {});
    expect(result).toEqual([]);
  });

  it('sorts birthdays by soonest first', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const toDob = (offsetDays: number) => {
      const d = new Date(Date.now() + offsetDays * 86400000);
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `2000-${m}-${day}`;
    };

    const user1 = {
      _id: 'u1',
      name: 'Later',
      email: 'l@a.com',
      organizationId: ORG_A,
      isActive: true,
      dateOfBirth: toDob(20),
    };
    const user2 = {
      _id: 'u2',
      name: 'Soon',
      email: 's@a.com',
      organizationId: ORG_A,
      isActive: true,
      dateOfBirth: toDob(3),
    };

    mockGetProfile.mockResolvedValue(null);
    const ctx = makeCtx([user1, user2]);
    const result = await dashboard.getUpcomingBirthdays.handler(ctx, {});
    expect(result[0].name).toBe('Soon');
    expect(result[0].daysUntil).toBeLessThan(result[1].daysUntil);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getOutOfOffice
// ═════════════════════════════════════════════════════════════════════════════

describe('dashboard.getOutOfOffice', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const futureStr = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

  const sampleUser = {
    _id: 'user-ooo',
    name: 'Away Person',
    email: 'a@a.com',
    organizationId: ORG_A,
    isActive: true,
  };

  const makeLeave = (id: string, overrides = {}) => ({
    _id: id,
    userId: 'user-ooo',
    organizationId: ORG_A,
    status: 'approved',
    type: 'vacation' as const,
    startDate: todayStr,
    endDate: futureStr,
    ...overrides,
  });

  it('returns empty when caller is unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const result = await dashboard.getOutOfOffice.handler(makeCtx([]), {});
    expect(result).toEqual([]);
  });

  it('returns empty when caller has no organizationId', async () => {
    mockGetAuthCaller.mockResolvedValue({
      _id: 'u1',
      name: 'No Org',
      role: 'employee',
      organizationId: null,
    });
    const result = await dashboard.getOutOfOffice.handler(makeCtx([]), {});
    expect(result).toEqual([]);
  });

  it('returns leaves overlapping the window', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGetProfile.mockResolvedValue(null);

    const leave = makeLeave('lv-1');
    const ctx = makeCtx([leave]);
    // The handler fetches user data for enrichment using ctx.db.get
    ctx.db.get.mockResolvedValue(sampleUser);

    const result = await dashboard.getOutOfOffice.handler(ctx, {});
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].name).toBe('Away Person');
    expect(result[0].type).toBe('vacation');
  });

  it('returns empty when no leaves in window', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    // Leave that ended yesterday
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    const oldLeave = makeLeave('lv-old', { startDate: lastWeek, endDate: yesterday });
    const ctx = makeCtx([oldLeave]);
    const result = await dashboard.getOutOfOffice.handler(ctx, {});
    expect(result).toEqual([]);
  });

  it('handles overlapping leave with enrichment', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGetProfile.mockResolvedValue(null);

    const leave = makeLeave('lv-3');
    const ctx = makeCtx([leave]);
    ctx.db.get.mockResolvedValue(sampleUser);

    const result = await dashboard.getOutOfOffice.handler(ctx, {});
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Away Person');
  });

  it('enriches with user profile data', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGetProfile.mockResolvedValue({
      avatarUrl: 'https://avatar.com/img',
      department: 'Engineering',
    });

    const leave = makeLeave('lv-2');
    const ctx = makeCtx([leave]);
    ctx.db.get.mockResolvedValue(sampleUser);

    const result = await dashboard.getOutOfOffice.handler(ctx, {});
    expect(result[0].name).toBe('Away Person');
    expect(result[0].department).toBe('Engineering');
    expect(result[0].avatarUrl).toBe('https://avatar.com/img');
  });

  it('sorts results by startDate ascending', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGetProfile.mockResolvedValue(null);

    const later = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const sooner = todayStr;

    const leave1 = makeLeave('lv-s', { startDate: later });
    const leave2 = makeLeave('lv-f', { startDate: sooner });
    const ctx = makeCtx([leave1, leave2]);
    ctx.db.get.mockResolvedValue(sampleUser);

    const result = await dashboard.getOutOfOffice.handler(ctx, {});
    expect(result[0].startDate).toBe(sooner);
    expect(result[1].startDate).toBe(later);
  });

  it('marks isOutToday correctly', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGetProfile.mockResolvedValue(null);

    const todayLeave = makeLeave('lv-today', { startDate: todayStr, endDate: todayStr });
    const ctx = makeCtx([todayLeave]);
    ctx.db.get.mockResolvedValue(sampleUser);

    const result = await dashboard.getOutOfOffice.handler(ctx, {});
    expect(result[0].isOutToday).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getPendingReviewCount
// ═════════════════════════════════════════════════════════════════════════════

describe('dashboard.getPendingReviewCount', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
    mockGetSubordinateIds.mockResolvedValue([]);
  });

  const makeReviewTask = (id: string, overrides = {}) => ({
    _id: id,
    title: `Task ${id}`,
    status: 'review',
    organizationId: ORG_A,
    assignedTo: 'user-caller',
    ...overrides,
  });

  it('returns 0 for an unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const result = await dashboard.getPendingReviewCount.handler(makeCtx([]), {});
    expect(result).toBe(0);
  });

  it('returns 0 for an employee', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    const result = await dashboard.getPendingReviewCount.handler(makeCtx([]), {});
    expect(result).toBe(0);
  });

  it('counts review tasks in the admin org only', async () => {
    mockGetAuthCaller.mockResolvedValue(callerB);
    const ctx = makeCtx([
      makeReviewTask('r1', { organizationId: ORG_B }),
      makeReviewTask('r2', { organizationId: ORG_B }),
      makeReviewTask('r3', { organizationId: ORG_A }), // foreign — ignored
    ]);
    const result = await dashboard.getPendingReviewCount.handler(ctx, {});
    expect(result).toBe(2);
  });

  it('counts review tasks across a supervisor subtree', async () => {
    const supervisor = { ...callerB, role: 'supervisor' };
    mockGetAuthCaller.mockResolvedValue(supervisor);
    mockGetSubordinateIds.mockResolvedValue(['user-emp-1', 'user-emp-2']);
    // by_assigned_status queries return the subtree's review tasks (same org).
    const ctx = makeCtx([
      makeReviewTask('r1', { assignedTo: 'user-emp-1', organizationId: ORG_B }),
      makeReviewTask('r2', { assignedTo: 'user-emp-2', organizationId: ORG_B }),
    ]);
    const result = await dashboard.getPendingReviewCount.handler(ctx, {});
    // Caller + 2 reports = 3 people queried, each returning the same two tasks
    // from the shared chain mock — org filter keeps them, dedupe does not apply.
    expect(result).toBe(6);
  });
});
