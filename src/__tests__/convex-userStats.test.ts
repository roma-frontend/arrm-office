/**
 * Tests for convex/userStats.ts — unified user statistics aggregator
 * (leaves, tasks, messages, balances, productivity score).
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn(),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/rbac', () => ({
  canAccessUser: jest.fn().mockResolvedValue(true),
}));

let mockGetProfile: jest.Mock;
let getUserStatsHandler: (ctx: any, args: any) => Promise<unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetProfile = jest.requireMock('../../convex/lib/userProfile').getProfile;
  mockGetProfile.mockReset();
  const mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockGetAuthCaller.mockReset();
  mockGetAuthCaller.mockResolvedValue({
    _id: 'user_1',
    role: 'admin',
    email: 'alice@example.com',
    name: 'Alice',
  });
  const mockCanAccessUser = jest.requireMock('../../convex/lib/rbac').canAccessUser;
  mockCanAccessUser.mockReset();
  mockCanAccessUser.mockResolvedValue(true);
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/userStats');
    getUserStatsHandler = mod.getUserStats.handler;
  });
});

// q mimics the Convex expression builder so filter callbacks execute —
// covering the `q.eq(q.field(...), …)` predicate lines.
const q: any = {
  eq: (..._args: unknown[]) => q,
  field: (name: string) => ({ __field: name }),
};

function makeChain(result: unknown) {
  const take = jest.fn().mockResolvedValue(result);
  const order = jest.fn().mockReturnValue({ take });
  const filter = jest.fn((cb?: (q: any) => unknown) => {
    if (cb) cb(q);
    return { order };
  });
  return { query: jest.fn().mockReturnValue({ filter }), take, order, filter };
}

function makeCtx({ leaves = [], tasks = [], messages = [] } = {}) {
  const get = jest.fn();
  const leafChain = makeChain(leaves);
  const taskChain = makeChain(tasks);
  const msgChain = makeChain(messages);
  // First .query() call is leaveRequests, then tasks, then chatMessages.
  // The user doc is fetched via ctx.db.get() — tests set that themselves.
  return {
    ctx: {
      db: {
        get,
        query: jest
          .fn()
          .mockReturnValueOnce(leafChain.query())
          .mockReturnValueOnce(taskChain.query())
          .mockReturnValueOnce(msgChain.query()),
      },
      auth: {
        getUserIdentity: jest.fn().mockResolvedValue({ email: 'alice@example.com' }),
      },
    },
    get,
  };
}

const USER = {
  _id: 'user_1',
  name: 'Alice',
  createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
  paidLeaveBalance: 15,
  sickLeaveBalance: 8,
  familyLeaveBalance: 4,
};

function leave(overrides: Record<string, unknown> = {}) {
  return { _id: 'l1', userId: 'user_1', status: 'approved', days: 3, ...overrides };
}

function task(overrides: Record<string, unknown> = {}) {
  return { _id: 't1', assignedTo: 'user_1', status: 'completed', ...overrides };
}

function msg(overrides: Record<string, unknown> = {}) {
  return { _id: 'm1', senderId: 'user_1', createdAt: 1000, ...overrides };
}

describe('getUserStats', () => {
  it('returns null when the user does not exist', async () => {
    const mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockGetAuthCaller.mockResolvedValue({
      _id: 'user_1',
      role: 'admin',
      email: 'alice@example.com',
      name: 'Alice',
    });
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    const result = await getUserStatsHandler(ctx, { userId: 'ghost' });
    expect(result).toBeNull();
  });

  it('computes leave and task statistics', async () => {
    const { ctx, get } = makeCtx({
      leaves: [
        leave({ status: 'approved', days: 3 }),
        leave({ status: 'approved', days: 2 }),
        leave({ status: 'pending', days: 1 }),
        leave({ status: 'rejected', days: 5 }),
      ],
      tasks: [
        task({ status: 'completed' }),
        task({ status: 'in_progress' }),
        task({ status: 'completed' }),
      ],
      messages: [msg(), msg(), msg()],
    });
    get.mockResolvedValueOnce(USER);
    mockGetProfile.mockResolvedValue({ department: 'Eng', position: 'Dev' });

    const result = (await getUserStatsHandler(ctx, { userId: 'user_1' })) as any;

    expect(result.userName).toBe('Alice');
    expect(result.department).toBe('Eng');
    expect(result.position).toBe('Dev');
    expect(result.leaveStats.totalDaysUsed).toBe(5);
    expect(result.leaveStats.totalDaysPending).toBe(1);
    expect(result.leaveStats.approvedLeaves).toBe(2);
    expect(result.leaveStats.pendingLeaves).toBe(1);
    expect(result.leaveStats.rejectedLeaves).toBe(1);
    expect(result.leaveStats.balances).toEqual({ paid: 15, sick: 8, family: 4 });
    expect(result.taskStats.totalTasks).toBe(3);
    expect(result.taskStats.completedTasks).toBe(2);
    expect(result.taskStats.completionRate).toBe(67);
    expect(result.taskStats.pendingTasks).toBe(1);
    expect(result.activityStats.totalMessages).toBe(3);
    expect(result.activityStats.lastActive).toBe(1000);
    expect(result.projects).toBe(0);
    expect(result.leavesTaken).toBe(2);
    expect(result.tasksCompleted).toBe(2);
    expect(result.daysActive).toBe(10);
  });

  it('falls back to user balances when the profile is missing fields', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(USER);
    mockGetProfile.mockResolvedValue({});

    const result = (await getUserStatsHandler(ctx, { userId: 'user_1' })) as any;
    expect(result.leaveStats.balances).toEqual({ paid: 15, sick: 8, family: 4 });
  });

  it('applies default balances when neither user nor profile have them', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce({
      ...USER,
      paidLeaveBalance: undefined,
      sickLeaveBalance: undefined,
      familyLeaveBalance: undefined,
    });
    mockGetProfile.mockResolvedValue({});

    const result = (await getUserStatsHandler(ctx, { userId: 'user_1' })) as any;
    expect(result.leaveStats.balances).toEqual({ paid: 20, sick: 10, family: 5 });
  });

  it('returns null lastActive and zero completion with no data', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(USER);
    mockGetProfile.mockResolvedValue({});

    const result = (await getUserStatsHandler(ctx, { userId: 'user_1' })) as any;
    expect(result.taskStats.completionRate).toBe(0);
    expect(result.activityStats.lastActive).toBeNull();
    expect(result.productivityScore).toBe(0);
  });

  it('counts distinct projects from tasks', async () => {
    const { ctx, get } = makeCtx({
      tasks: [
        task({ status: 'done', projectId: 'p1' }),
        task({ status: 'todo', projectId: 'p1' }),
        task({ status: 'todo', projectId: 'p2' }),
      ],
    });
    get.mockResolvedValueOnce(USER);
    mockGetProfile.mockResolvedValue({});

    const result = (await getUserStatsHandler(ctx, { userId: 'user_1' })) as any;
    expect(result.projects).toBe(2);
  });
});
