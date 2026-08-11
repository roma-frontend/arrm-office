/**
 * Tests for convex/recurringTasks.ts — permissions, organization isolation and
 * the guards that keep the hourly sweep from duplicating work.
 *
 * The sweep is the part worth pinning down: it runs unattended, so a missing
 * idempotency check would quietly file the same task every hour rather than fail
 * loudly.
 */

import { jest, describe, it, expect, beforeEach, beforeAll, afterAll } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
}));

jest.mock('../../convex/lib/notify', () => ({
  notify: jest.fn(async () => 'notification-1'),
}));

jest.mock('../../convex/lib/limits', () => ({
  DEFAULT_LIST_CAP: 50,
  SMALL_LIST_CAP: 10,
}));

let recurringTasks: any;
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockNotify: jest.Mock;
let mockGet: jest.Mock;
let mockInsert: jest.Mock;
let mockPatch: jest.Mock;
let mockDelete: jest.Mock;

const ORG_A = 'org-aaa' as any;
const ORG_B = 'org-bbb' as any;

const adminA = {
  _id: 'user-admin',
  name: 'Admin A',
  email: 'a@a.com',
  role: 'admin',
  organizationId: ORG_A,
};
const supervisorA = {
  _id: 'user-sup',
  name: 'Sup A',
  email: 's@a.com',
  role: 'supervisor',
  organizationId: ORG_A,
};
const employeeA = {
  _id: 'user-emp',
  name: 'Emp A',
  email: 'e@a.com',
  role: 'employee',
  organizationId: ORG_A,
};
const adminB = {
  _id: 'user-admin-b',
  name: 'Admin B',
  email: 'b@b.com',
  role: 'admin',
  organizationId: ORG_B,
};

const assigneeA = { _id: 'user-assignee', name: 'Assignee', organizationId: ORG_A, isActive: true };

/** 2026-08-10 12:00 UTC is a Monday, and still the 10th in the org's UTC+4. */
const MONDAY = Date.UTC(2026, 7, 10, 12, 0, 0);

function seriesDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'series-1',
    organizationId: ORG_A,
    title: 'Weekly report',
    assignedTo: assigneeA._id,
    assignedBy: adminA._id,
    priority: 'medium',
    frequency: 'weekly',
    daysOfWeek: [1],
    startDate: '2026-01-01',
    isActive: true,
    generatedCount: 3,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

/**
 * Minimal db double. `tableRows` decides what each table's query returns, so a
 * single ctx can serve both the series sweep and the by_recurring lookup.
 */
function makeCtx(tableRows: Record<string, unknown[]> = {}) {
  const chain = (table: string) => {
    const c: any = {
      withIndex: (_name: string, cb?: (q: any) => unknown) => {
        if (typeof cb === 'function') {
          const q: any = { eq: () => q };
          cb(q);
        }
        return c;
      },
      filter: () => c,
      order: () => c,
      take: async () => tableRows[table] ?? [],
      first: async () => (tableRows[table] ?? [])[0] ?? null,
    };
    return c;
  };

  return {
    db: {
      get: mockGet,
      insert: mockInsert,
      patch: mockPatch,
      delete: mockDelete,
      query: (table: string) => chain(table),
    },
  };
}

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
    mockNotify = jest.requireMock('../../convex/lib/notify').notify;
    mockGet = jest.fn();
    mockInsert = jest.fn(async () => 'inserted-1');
    mockPatch = jest.fn(async () => undefined);
    mockDelete = jest.fn(async () => undefined);

    recurringTasks = require('../../convex/recurringTasks');
  });
});

beforeEach(() => {
  jest.resetAllMocks();
  mockInsert.mockResolvedValue('inserted-1');
  mockNotify.mockResolvedValue('notification-1');
  jest.useFakeTimers().setSystemTime(MONDAY);
});

afterAll(() => {
  jest.useRealTimers();
});

// ── createRecurringTask ──────────────────────────────────────────────────────

describe('recurringTasks.createRecurringTask', () => {
  const validArgs = {
    title: 'Weekly report',
    assignedTo: assigneeA._id as any,
    priority: 'medium' as const,
    frequency: 'weekly' as const,
    daysOfWeek: [1],
    startDate: '2026-01-01',
  };

  it('refuses an unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      recurringTasks.createRecurringTask.handler(makeCtx(), validArgs),
    ).rejects.toThrow();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('refuses an employee: series are scheduling policy', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeA);
    mockIsSuperadmin.mockReturnValue(false);
    await expect(
      recurringTasks.createRecurringTask.handler(makeCtx(), validArgs),
    ).rejects.toThrow();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('lets a supervisor create one', async () => {
    mockGetAuthCaller.mockResolvedValue(supervisorA);
    mockIsSuperadmin.mockReturnValue(false);
    mockGet.mockImplementation(async (id: string) =>
      id === assigneeA._id ? assigneeA : id === 'inserted-1' ? null : null,
    );

    await recurringTasks.createRecurringTask.handler(makeCtx(), validArgs);

    expect(mockInsert).toHaveBeenCalledWith(
      'recurringTasks',
      expect.objectContaining({
        organizationId: ORG_A,
        title: 'Weekly report',
        assignedBy: supervisorA._id,
        frequency: 'weekly',
        daysOfWeek: [1],
        isActive: true,
        generatedCount: 0,
      }),
    );
  });

  it('takes the series owner from the verified identity, not from an argument', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    mockIsSuperadmin.mockReturnValue(false);
    mockGet.mockImplementation(async (id: string) => (id === assigneeA._id ? assigneeA : null));

    await recurringTasks.createRecurringTask.handler(makeCtx(), {
      ...validArgs,
      // A client trying to file the series under somebody else.
      assignedBy: 'user-someone-else',
    } as any);

    const inserted = mockInsert.mock.calls.find(
      (c: any[]) => c[0] === 'recurringTasks',
    )?.[1] as any;
    expect(inserted.assignedBy).toBe(adminA._id);
  });

  it('refuses an assignee from another organization', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    mockIsSuperadmin.mockReturnValue(false);
    mockGet.mockResolvedValue({ ...assigneeA, organizationId: ORG_B });

    await expect(
      recurringTasks.createRecurringTask.handler(makeCtx(), validArgs),
    ).rejects.toThrow();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('refuses a weekly rule with no weekdays', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    mockIsSuperadmin.mockReturnValue(false);
    mockGet.mockResolvedValue(assigneeA);

    await expect(
      recurringTasks.createRecurringTask.handler(makeCtx(), { ...validArgs, daysOfWeek: [] }),
    ).rejects.toThrow();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('refuses a negative deadline offset', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    mockIsSuperadmin.mockReturnValue(false);
    mockGet.mockResolvedValue(assigneeA);

    await expect(
      recurringTasks.createRecurringTask.handler(makeCtx(), {
        ...validArgs,
        deadlineOffsetDays: -1,
      }),
    ).rejects.toThrow();
  });

  it('drops the weekday list when the frequency is monthly', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    mockIsSuperadmin.mockReturnValue(false);
    mockGet.mockImplementation(async (id: string) => (id === assigneeA._id ? assigneeA : null));

    await recurringTasks.createRecurringTask.handler(makeCtx(), {
      ...validArgs,
      frequency: 'monthly',
      daysOfWeek: [1, 2],
      dayOfMonth: 15,
    });

    const inserted = mockInsert.mock.calls.find(
      (c: any[]) => c[0] === 'recurringTasks',
    )?.[1] as any;
    expect(inserted.daysOfWeek).toBeUndefined();
    expect(inserted.dayOfMonth).toBe(15);
  });

  it('materializes the first occurrence when the series starts today', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    mockIsSuperadmin.mockReturnValue(false);
    // The series row read back after insert, then the assignee lookup.
    mockGet.mockImplementation(async (id: string) => {
      if (id === assigneeA._id) return assigneeA;
      if (id === 'inserted-1') return seriesDoc({ _id: 'inserted-1', lastGeneratedKey: undefined });
      return null;
    });

    const result = await recurringTasks.createRecurringTask.handler(makeCtx(), validArgs);

    expect(mockInsert).toHaveBeenCalledWith(
      'tasks',
      expect.objectContaining({ status: 'pending' }),
    );
    expect(result.firstTaskId).toBe('inserted-1');
  });
});

// ── toggle / delete ──────────────────────────────────────────────────────────

describe('recurringTasks.toggleRecurringTask', () => {
  it('refuses a caller from another organization', async () => {
    mockGetAuthCaller.mockResolvedValue(adminB);
    mockIsSuperadmin.mockReturnValue(false);
    mockGet.mockResolvedValue(seriesDoc());

    await expect(
      recurringTasks.toggleRecurringTask.handler(makeCtx(), {
        seriesId: 'series-1' as any,
        isActive: false,
      }),
    ).rejects.toThrow();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('pauses without touching the tasks already created', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    mockIsSuperadmin.mockReturnValue(false);
    mockGet.mockResolvedValue(seriesDoc());

    await recurringTasks.toggleRecurringTask.handler(makeCtx(), {
      seriesId: 'series-1' as any,
      isActive: false,
    });

    expect(mockPatch).toHaveBeenCalledWith(
      'series-1',
      expect.objectContaining({ isActive: false }),
    );
    // Only the series was patched; no task was cancelled as a side effect.
    expect(mockPatch).toHaveBeenCalledTimes(1);
  });
});

describe('recurringTasks.deleteRecurringTask', () => {
  it('keeps the tasks it produced and only detaches them', async () => {
    mockGetAuthCaller.mockResolvedValue(adminA);
    mockIsSuperadmin.mockReturnValue(false);
    mockGet.mockResolvedValue(seriesDoc());

    const ctx = makeCtx({ tasks: [{ _id: 'task-1' }, { _id: 'task-2' }] });
    const result = await recurringTasks.deleteRecurringTask.handler(ctx, {
      seriesId: 'series-1' as any,
    });

    expect(result.detachedTasks).toBe(2);
    expect(mockPatch).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ recurringTaskId: undefined }),
    );
    expect(mockDelete).toHaveBeenCalledWith('series-1');
    // No task row was deleted — only the rule.
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});

// ── the sweep ────────────────────────────────────────────────────────────────

describe('recurringTasks.generateDueRecurringTasks', () => {
  it('creates one task for a series whose rule lands today', async () => {
    mockGet.mockResolvedValue(assigneeA);
    const ctx = makeCtx({ recurringTasks: [seriesDoc()] });

    const result = await recurringTasks.generateDueRecurringTasks.handler(ctx, {});

    expect(result).toEqual({ generated: 1, skipped: 0, day: '2026-08-10' });
    expect(mockInsert).toHaveBeenCalledWith(
      'tasks',
      expect.objectContaining({
        organizationId: ORG_A,
        title: 'Weekly report',
        assignedTo: assigneeA._id,
        assignedBy: adminA._id,
        status: 'pending',
        recurringTaskId: 'series-1',
      }),
    );
  });

  it('does not create a second task on a day it already ran', async () => {
    mockGet.mockResolvedValue(assigneeA);
    const ctx = makeCtx({ recurringTasks: [seriesDoc({ lastGeneratedKey: '2026-08-10' })] });

    const result = await recurringTasks.generateDueRecurringTasks.handler(ctx, {});

    expect(result.generated).toBe(0);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('skips a day the rule does not land on', async () => {
    mockGet.mockResolvedValue(assigneeA);
    // Monday-only rule, but ask on a Tuesday.
    jest.setSystemTime(Date.UTC(2026, 7, 11, 12, 0, 0));
    const ctx = makeCtx({ recurringTasks: [seriesDoc()] });

    const result = await recurringTasks.generateDueRecurringTasks.handler(ctx, {});

    expect(result.generated).toBe(0);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('stops for an assignee who has been deactivated', async () => {
    mockGet.mockResolvedValue({ ...assigneeA, isActive: false });
    const ctx = makeCtx({ recurringTasks: [seriesDoc()] });

    const result = await recurringTasks.generateDueRecurringTasks.handler(ctx, {});

    expect(result.generated).toBe(0);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('stops for an assignee moved to another organization', async () => {
    mockGet.mockResolvedValue({ ...assigneeA, organizationId: ORG_B });
    const ctx = makeCtx({ recurringTasks: [seriesDoc()] });

    const result = await recurringTasks.generateDueRecurringTasks.handler(ctx, {});

    expect(result.generated).toBe(0);
  });

  it('records the day it ran and counts up, so the next pass is a no-op', async () => {
    mockGet.mockResolvedValue(assigneeA);
    const ctx = makeCtx({ recurringTasks: [seriesDoc()] });

    await recurringTasks.generateDueRecurringTasks.handler(ctx, {});

    expect(mockPatch).toHaveBeenCalledWith(
      'series-1',
      expect.objectContaining({ lastGeneratedKey: '2026-08-10', generatedCount: 4 }),
    );
  });

  it('notifies the assignee, since nobody asked for this task today', async () => {
    mockGet.mockResolvedValue(assigneeA);
    const ctx = makeCtx({ recurringTasks: [seriesDoc()] });

    await recurringTasks.generateDueRecurringTasks.handler(ctx, {});

    expect(mockNotify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: assigneeA._id, route: '/tasks' }),
    );
  });

  it('sets the deadline to the end of the offset day', async () => {
    mockGet.mockResolvedValue(assigneeA);
    const ctx = makeCtx({ recurringTasks: [seriesDoc({ deadlineOffsetDays: 6 })] });

    await recurringTasks.generateDueRecurringTasks.handler(ctx, {});

    const inserted = mockInsert.mock.calls.find((c: any[]) => c[0] === 'tasks')?.[1] as any;
    // Monday + 6 days = Sunday the 16th, expiring as the 17th begins locally.
    const expected = Date.parse('2026-08-17T00:00:00.000Z') - 4 * 3600_000 - 1;
    expect(inserted.deadline).toBe(expected);
  });

  it('carries on after a series that throws', async () => {
    // First assignee lookup explodes, the second is fine.
    mockGet.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(assigneeA);
    const ctx = makeCtx({
      recurringTasks: [seriesDoc({ _id: 'series-bad' }), seriesDoc({ _id: 'series-good' })],
    });

    const result = await recurringTasks.generateDueRecurringTasks.handler(ctx, {});

    expect(result.skipped).toBe(1);
    expect(result.generated).toBe(1);
  });
});
