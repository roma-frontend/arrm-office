/**
 * Tests for convex/birthdays.ts — daily/upcoming birthday detection and
 * notifications. `api` and `notify` are mocked; dates are injected via
 * jest.useFakeTimers + setSystemTime so the "today" logic is deterministic.
 *
 * NOTE: the module compares `new Date(dateOfBirth).getDate()` (date-only
 * strings parse as UTC midnight) against local day-of-month, so these tests
 * pin the process timezone to UTC to stay deterministic on any CI machine.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Must be set before any Date arithmetic runs in this file.
process.env.TZ = 'UTC';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/_generated/api', () => ({
  api: {
    birthdays: {
      checkBirthdaysToday: 'birthdays:checkBirthdaysToday',
      checkUpcomingBirthdays: 'birthdays:checkUpcomingBirthdays',
    },
  },
}));

jest.mock('../../convex/lib/notify', () => ({
  notify: jest.fn(),
}));

jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn(),
}));

let mockNotify: jest.Mock;
let mockGetProfile: jest.Mock;

let checkBirthdaysTodayHandler: (ctx: any, args: any) => Promise<unknown>;
let checkUpcomingBirthdaysHandler: (ctx: any, args: any) => Promise<unknown>;
let getBirthdaysForMonthHandler: (ctx: any, args: any) => Promise<unknown>;
let scheduledBirthdayCheckHandler: (ctx: any, args: any) => Promise<unknown>;
let setupBirthdaySchedulerHandler: (ctx: any, args: any) => Promise<unknown>;

const ORG_A = 'org-1';

// A fixed date: 2026-08-07
const NOW = new Date(2026, 7, 7, 9, 0, 0);

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.clearAllMocks();
  mockNotify = jest.requireMock('../../convex/lib/notify').notify;
  mockGetProfile = jest.requireMock('../../convex/lib/userProfile').getProfile;
  mockNotify.mockReset();
  mockGetProfile.mockReset();
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/birthdays');
    checkBirthdaysTodayHandler = mod.checkBirthdaysToday.handler;
    checkUpcomingBirthdaysHandler = mod.checkUpcomingBirthdays.handler;
    getBirthdaysForMonthHandler = mod.getBirthdaysForMonth.handler;
    scheduledBirthdayCheckHandler = mod.scheduledBirthdayCheck.handler;
    setupBirthdaySchedulerHandler = mod.setupBirthdayScheduler.handler;
  });
});

afterEach(() => {
  jest.useRealTimers();
});

function makeUsersCtx(users: unknown[]) {
  const take = jest.fn().mockResolvedValue(users);
  const withIndex = jest.fn().mockReturnValue({ take });
  const insert = jest.fn();
  const runMutation = jest.fn();
  return {
    ctx: {
      db: {
        query: jest.fn().mockReturnValue({ withIndex, take }),
        insert,
      },
      runMutation,
    },
    take,
    withIndex,
    insert,
    runMutation,
  };
}

function makeQueryCtx() {
  const take = jest.fn().mockResolvedValue([]);
  const withIndex = jest.fn().mockReturnValue({ take });
  return {
    ctx: { db: { query: jest.fn().mockReturnValue({ withIndex, take }) } },
    take,
    withIndex,
  };
}

function user(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'user_1',
    name: 'Alice',
    email: 'alice@example.com',
    role: 'employee',
    dateOfBirth: '1990-08-07',
    ...overrides,
  };
}

describe('checkBirthdaysToday', () => {
  it('returns zero results when nobody has a birthday today', async () => {
    const { ctx } = makeUsersCtx([
      user({ dateOfBirth: '1990-01-01' }),
      user({ _id: 'u2', dateOfBirth: undefined }),
    ]);
    const result = (await checkBirthdaysTodayHandler(ctx, { organizationId: ORG_A })) as any;

    expect(result.birthdaysFound).toBe(0);
    expect(result.notificationsSent).toBe(0);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('notifies colleagues and the birthday person', async () => {
    const birthday = user({ _id: 'u_bday', name: 'Bob', dateOfBirth: '1990-08-07' });
    const colleague = user({ _id: 'u_colleague', name: 'Cara', dateOfBirth: '1985-01-01' });
    const { ctx } = makeUsersCtx([birthday, colleague]);

    const result = (await checkBirthdaysTodayHandler(ctx, { organizationId: ORG_A })) as any;

    expect(result.birthdaysFound).toBe(1);
    // 1 colleague + 1 self notification
    expect(mockNotify).toHaveBeenCalledTimes(2);
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: 'u_colleague',
        fallbackMessage: expect.stringContaining("Bob's birthday"),
      }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: 'u_bday',
        extra: expect.objectContaining({ isBirthdayPerson: true, age: 36 }),
      }),
    );
  });

  it('excludes superadmins from notification targets', async () => {
    const birthday = user({ _id: 'u_bday', dateOfBirth: '1990-08-07' });
    const superadmin = user({ _id: 'u_super', role: 'superadmin', dateOfBirth: '1980-08-07' });
    const { ctx } = makeUsersCtx([birthday, superadmin]);

    const result = (await checkBirthdaysTodayHandler(ctx, { organizationId: ORG_A })) as any;

    expect(result.birthdaysFound).toBe(1);
    // Only the self-notification — superadmin excluded as a target
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).not.toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ userId: 'u_super' }),
    );
  });
});

describe('checkUpcomingBirthdays', () => {
  it('collects upcoming birthdays within the window', async () => {
    // Today 2026-08-07; Bob's birthday is 2026-08-09 (in 2 days)
    const bob = user({ _id: 'u_bday', name: 'Bob', dateOfBirth: '1990-08-09' });
    const { ctx } = makeUsersCtx([bob]);

    const result = (await checkUpcomingBirthdaysHandler(ctx, {
      organizationId: ORG_A,
      daysAhead: 7,
    })) as any;

    expect(result.upcomingBirthdays).toHaveLength(1);
    expect(result.upcomingBirthdays[0]).toMatchObject({
      name: 'Bob',
      daysUntil: 2,
      date: '2026-08-09',
    });
  });

  it('sends a 3-day reminder notification', async () => {
    // Birthday in exactly 3 days (2026-08-10)
    const bob = user({ _id: 'u_bday', name: 'Bob', dateOfBirth: '1990-08-10' });
    const colleague = user({ _id: 'u_colleague', name: 'Cara' });
    const { ctx } = makeUsersCtx([bob, colleague]);

    await checkUpcomingBirthdaysHandler(ctx, { organizationId: ORG_A, daysAhead: 7 });

    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: 'u_colleague',
        fallbackMessage: expect.stringContaining('in 3 days'),
      }),
    );
  });

  it('defaults to a 7-day window when daysAhead is omitted', async () => {
    const bob = user({ _id: 'u_bday', name: 'Bob', dateOfBirth: '2026-08-20' }); // 13 days out
    const { ctx } = makeUsersCtx([bob]);

    const result = (await checkUpcomingBirthdaysHandler(ctx, { organizationId: ORG_A })) as any;
    expect(result.upcomingBirthdays).toHaveLength(0);
  });
});

describe('getBirthdaysForMonth', () => {
  it('returns an empty list when there are no users', async () => {
    const { ctx } = makeQueryCtx();
    const result = await getBirthdaysForMonthHandler(ctx, { organizationId: ORG_A });
    expect(result).toEqual([]);
  });

  it('lists birthdays of the target month sorted by day', async () => {
    const later = user({ _id: 'u_later', name: 'Zed', dateOfBirth: '1992-08-20' });
    const earlier = user({ _id: 'u_earlier', name: 'Ann', dateOfBirth: '1991-08-05' });
    const otherMonth = user({ _id: 'u_other', name: 'No', dateOfBirth: '1990-03-03' });
    const { ctx, take } = makeUsersCtx([later, earlier, otherMonth]);
    mockGetProfile.mockResolvedValue({});

    const result = (await getBirthdaysForMonthHandler(ctx, {
      organizationId: ORG_A,
      month: 8,
    })) as any[];

    expect(result.map((b) => b.id)).toEqual(['u_earlier', 'u_later']);
    expect(result[0].name).toBe('Ann');
    expect(result[0].birthdayDate).toBe('5 августа');
  });

  it('flags today and past birthdays', async () => {
    const today = user({ _id: 'u_today', dateOfBirth: '1990-08-07' });
    const past = user({ _id: 'u_past', dateOfBirth: '1990-08-03' });
    const future = user({ _id: 'u_future', dateOfBirth: '1990-08-20' });
    const { ctx } = makeUsersCtx([today, past, future]);
    mockGetProfile.mockResolvedValue({});

    const result = (await getBirthdaysForMonthHandler(ctx, {
      organizationId: ORG_A,
      month: 8,
    })) as any[];

    expect(result.find((b) => b.id === 'u_today').isToday).toBe(true);
    expect(result.find((b) => b.id === 'u_today').isPast).toBe(false);
    expect(result.find((b) => b.id === 'u_past').isPast).toBe(true);
    expect(result.find((b) => b.id === 'u_future').isToday).toBe(false);
  });

  it('defaults to the current month', async () => {
    const aug = user({ _id: 'u_aug', dateOfBirth: '1990-08-10' });
    const { ctx } = makeUsersCtx([aug]);
    mockGetProfile.mockResolvedValue({});

    const result = (await getBirthdaysForMonthHandler(ctx, { organizationId: ORG_A })) as any[];
    expect(result).toHaveLength(1);
  });

  it('falls back to user fields when the profile has none', async () => {
    const aug = user({ _id: 'u_aug', dateOfBirth: '1990-08-10', department: 'Sales' });
    const { ctx } = makeUsersCtx([aug]);
    mockGetProfile.mockResolvedValue({});

    const result = (await getBirthdaysForMonthHandler(ctx, {
      organizationId: ORG_A,
      month: 8,
    })) as any[];
    expect(result[0].department).toBe('Sales');
    expect(result[0].age).toBe(36);
  });
});

describe('scheduledBirthdayCheck', () => {
  it('runs both daily and upcoming checks', async () => {
    const { ctx, runMutation } = makeUsersCtx([]);
    runMutation
      .mockResolvedValueOnce({ birthdaysFound: 0 })
      .mockResolvedValueOnce({ upcomingBirthdays: [] });

    const result = (await scheduledBirthdayCheckHandler(ctx, { organizationId: ORG_A })) as any;

    expect(runMutation).toHaveBeenCalledTimes(2);
    expect(runMutation).toHaveBeenCalledWith('birthdays:checkBirthdaysToday', {
      organizationId: ORG_A,
    });
    expect(runMutation).toHaveBeenCalledWith('birthdays:checkUpcomingBirthdays', {
      organizationId: ORG_A,
      daysAhead: 7,
    });
    expect(result.today).toEqual({ birthdaysFound: 0 });
    expect(result.upcoming).toEqual({ upcomingBirthdays: [] });
  });
});

describe('setupBirthdayScheduler', () => {
  it('inserts a scheduled job record', async () => {
    const { ctx, insert } = makeUsersCtx([]);
    insert.mockResolvedValueOnce('job_1');

    const result = (await setupBirthdaySchedulerHandler(ctx, { organizationId: ORG_A })) as any;

    expect(insert).toHaveBeenCalledWith(
      'scheduledJobs',
      expect.objectContaining({
        organizationId: ORG_A,
        functionName: 'birthdays:scheduledBirthdayCheck',
        schedule: '0 9 * * *',
        isActive: true,
      }),
    );
    expect(result.jobId).toBe('job_1');
    expect(result.message).toContain('Birthday scheduler setup');
  });
});
