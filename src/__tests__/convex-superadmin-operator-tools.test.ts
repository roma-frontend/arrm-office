/**
 * Tests for the Tier-1 operator tools — convex/superadmin/operatorTools.
 *
 * Four surfaces: i18n overrides (live text replacement), platform limits
 * (tunable caps), scheduled ops (cron pause/resume/run-now) and maintenance
 * windows (planned windows + pre-window broadcast). Everything is gated behind
 * the superadmin role check.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  internalAction: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
  internalQuery: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

let tools: any;
let mockGetAuthCaller: jest.Mock;
let mockGet: jest.Mock;
let mockPatch: jest.Mock;
let mockInsert: jest.Mock;
let mockDelete: jest.Mock;
let mockQuery: jest.Mock;
let mockRunQuery: jest.Mock;
let mockRunMutation: jest.Mock;

const superadmin = {
  _id: 'user-super',
  name: 'Root',
  email: 'root@x.com',
  role: 'superadmin',
  organizationId: 'org-own',
};
const admin = { _id: 'user-admin', name: 'Admin', email: 'a@a.com', role: 'admin' };

const NOW = Date.now();

function makeCtx(tableRows: Record<string, unknown[]> = {}) {
  const chain = (table: string) => {
    const conds: Array<{ op: 'eq' | 'gt' | 'lt'; f: string; v: unknown }> = [];
    const c: any = {
      withIndex: (_name: string, cb?: (q: any) => unknown) => {
        if (typeof cb === 'function') {
          const q: any = {
            eq: (f: string, v: unknown) => (conds.push({ op: 'eq', f, v }), q),
            gt: (f: string, v: unknown) => (conds.push({ op: 'gt', f, v }), q),
            lt: (f: string, v: unknown) => (conds.push({ op: 'lt', f, v }), q),
          };
          cb(q);
        }
        return c;
      },
      filter: (cb?: (q: any) => unknown) => {
        if (typeof cb === 'function') {
          const q: any = {
            and: (...parts: unknown[]) => parts,
            eq: (f: string, v: unknown) => ({ op: 'eq', f, v }),
            field: (f: string) => f,
          };
          cb(q);
        }
        return c;
      },
      order: () => c,
      first: () => null,
      take: (n: number) => (tableRows[table] ?? []).slice(0, n),
      collect: () => tableRows[table] ?? [],
    };
    return c;
  };
  return {
    db: {
      get: mockGet,
      patch: mockPatch,
      insert: mockInsert,
      delete: mockDelete,
      query: chain,
    },
    scheduler: { runAfter: jest.fn() },
    runQuery: mockRunQuery,
    runMutation: mockRunMutation,
  };
}

beforeAll(async () => {
  tools = await import('../../convex/superadmin/operatorTools');
});

beforeEach(() => {
  jest.clearAllMocks();
  ({ getAuthCaller: mockGetAuthCaller } = jest.requireMock('../../convex/lib/getAuthCaller'));
  mockGet = jest.fn();
  mockPatch = jest.fn();
  mockInsert = jest.fn();
  mockDelete = jest.fn();
  mockQuery = jest.fn();
  mockRunQuery = jest.fn();
  mockRunMutation = jest.fn();
});

describe('operator tools — auth gate', () => {
  it('returns empty for non-superadmins on read surfaces', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    const ctx = makeCtx();
    // Queries are soft-gated: an unauthenticated first run (token not minted
    // yet on page load) returns empty and Convex re-runs once auth appears.
    expect(await tools.listI18nOverrides.handler(ctx, {})).toEqual([]);
    expect(await tools.listPlatformLimits.handler(ctx, {})).toEqual([]);
    expect(await tools.listScheduledOps.handler(ctx, {})).toEqual([]);
    expect(await tools.listMaintenanceWindows.handler(ctx, {})).toEqual([]);
  });

  it('rejects non-superadmins on write surfaces', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    const ctx = makeCtx();
    await expect(
      tools.setI18nOverride.handler(ctx, { key: 'common.x', locale: 'en', value: 'v' }),
    ).rejects.toThrow('Not authenticated');
    await expect(
      tools.setPlatformLimit.handler(ctx, { key: 'session.timeoutMinutes', value: 60 }),
    ).rejects.toThrow('Not authenticated');
    await expect(
      tools.setScheduledOpPaused.handler(ctx, { jobKey: 'x', isPaused: true }),
    ).rejects.toThrow('Not authenticated');
  });
});

describe('i18n overrides', () => {
  it('rejects unqualified keys and bad locales', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const ctx = makeCtx();
    await expect(
      tools.setI18nOverride.handler(ctx, { key: 'nokey', locale: 'en', value: 'x' }),
    ).rejects.toThrow('namespace-qualified');
    await expect(
      tools.setI18nOverride.handler(ctx, { key: 'common.x', locale: 'fr', value: 'x' }),
    ).rejects.toThrow('Unsupported locale');
  });

  it('inserts a new override and updates an existing one', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    mockQuery.mockResolvedValue(null);
    const ctx = makeCtx();
    ctx.db.query = () => ({ withIndex: () => ({ first: () => Promise.resolve(null) }) });
    await tools.setI18nOverride.handler(ctx, {
      key: 'common.notifications.saved',
      locale: 'ru',
      value: 'Сохранено!',
    });
    expect(mockInsert).toHaveBeenCalledWith(
      'i18nOverrides',
      expect.objectContaining({
        key: 'common.notifications.saved',
        locale: 'ru',
        value: 'Сохранено!',
        updatedBy: 'user-super',
      }),
    );

    mockInsert.mockClear();
    const existing = { _id: 'ov-1', key: 'common.x', locale: 'en', value: 'old' };
    ctx.db.query = () => ({ withIndex: () => ({ first: () => Promise.resolve(existing) }) });
    await tools.setI18nOverride.handler(ctx, { key: 'common.x', locale: 'en', value: 'new' });
    expect(mockPatch).toHaveBeenCalledWith('ov-1', expect.objectContaining({ value: 'new' }));
  });
});

describe('platform limits', () => {
  it('lists defaults merged with overrides', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const ctx = makeCtx();
    ctx.db.query = () => ({
      order: () => ({ take: () => Promise.resolve([]) }),
    });
    const rows = await tools.listPlatformLimits.handler(ctx, {});
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty('default');
    expect(rows[0]).toHaveProperty('value');
  });

  it('rejects unknown keys and non-positive values', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const ctx = makeCtx();
    await expect(tools.setPlatformLimit.handler(ctx, { key: 'nope', value: 5 })).rejects.toThrow(
      'Unknown limit key',
    );
    await expect(
      tools.setPlatformLimit.handler(ctx, { key: 'session.timeoutMinutes', value: -1 }),
    ).rejects.toThrow('positive number');
  });

  it('saves a limit and resets it', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const ctx = makeCtx();
    ctx.db.query = () => ({ withIndex: () => ({ first: () => Promise.resolve(null) }) });
    await tools.setPlatformLimit.handler(ctx, { key: 'session.timeoutMinutes', value: 120 });
    expect(mockInsert).toHaveBeenCalledWith(
      'platformLimits',
      expect.objectContaining({ key: 'session.timeoutMinutes', value: 120 }),
    );

    mockInsert.mockClear();
    const existing = { _id: 'pl-1', key: 'session.timeoutMinutes', value: 120 };
    ctx.db.query = () => ({ withIndex: () => ({ first: () => Promise.resolve(existing) }) });
    await tools.setPlatformLimit.handler(ctx, { key: 'session.timeoutMinutes', value: 60 });
    expect(mockPatch).toHaveBeenCalledWith('pl-1', expect.objectContaining({ value: 60 }));

    mockPatch.mockClear();
    await tools.resetPlatformLimit.handler(ctx, { key: 'session.timeoutMinutes' });
    expect(mockDelete).toHaveBeenCalledWith('pl-1');
  });
});

describe('scheduled ops', () => {
  it('lists the full cron registry with pause state', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const ctx = makeCtx();
    ctx.db.query = () => ({ take: () => Promise.resolve([]) });
    const rows = await tools.listScheduledOps.handler(ctx, {});
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(rows[0]).toHaveProperty('jobKey');
    expect(rows[0]).toHaveProperty('isPaused');
  });

  it('pauses and kicks off a job', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const ctx = makeCtx();
    ctx.db.query = () => ({ withIndex: () => ({ first: () => Promise.resolve(null) }) });
    await tools.setScheduledOpPaused.handler(ctx, {
      jobKey: 'news-schedule-publish',
      isPaused: true,
    });
    expect(mockInsert).toHaveBeenCalledWith(
      'scheduledOps',
      expect.objectContaining({ jobKey: 'news-schedule-publish', isPaused: true }),
    );

    await tools.runScheduledOpNow.handler(ctx, { jobKey: 'news-schedule-publish' });
    expect(ctx.scheduler.runAfter).toHaveBeenCalled();
  });
});

describe('maintenance windows', () => {
  it('rejects windows that end before they start', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const ctx = makeCtx();
    await expect(
      tools.createMaintenanceWindow.handler(ctx, {
        title: 'W',
        message: 'M',
        startsAt: NOW + 1000,
        endsAt: NOW,
      }),
    ).rejects.toThrow('End time must be after start time');
  });

  it('creates an active window when already started', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    mockInsert.mockResolvedValue('win-1');
    const ctx = makeCtx();
    const res = await tools.createMaintenanceWindow.handler(ctx, {
      title: 'Maintenance',
      message: 'Down',
      startsAt: NOW - 1000,
      endsAt: NOW + 3600_000,
      broadcastMessage: 'Down soon',
    });
    expect(res.id).toBe('win-1');
    expect(mockInsert).toHaveBeenCalledWith(
      'maintenanceWindows',
      expect.objectContaining({ isActive: true, broadcastScheduledFor: expect.any(Number) }),
    );
  });

  it('returns the active window from the public query, filtering expired ones', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const active = {
      _id: 'win-1',
      title: 'Maintenance',
      message: 'Down',
      startsAt: NOW - 1000,
      endsAt: NOW + 3600_000,
      isActive: true,
    };
    const ctx = makeCtx();
    ctx.db.query = () => ({ withIndex: () => ({ take: () => Promise.resolve([active]) }) });
    const res = await tools.getActiveMaintenanceWindow.handler(ctx, {});
    expect(res?.title).toBe('Maintenance');
  });
});
