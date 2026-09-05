/**
 * Deep coverage tests for convex/superadmin/operatorTools.ts
 * NOTE: requireSuperadmin and getSuperadminOrNull are local functions in this
 * file that call getAuthCaller directly. We mock getAuthCaller to return a
 * superadmin, not the rbac module.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
  internalAction: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

let tools: any;
let mockGetAuthCaller: jest.Mock;

const superadmin = {
  _id: 'super_1',
  name: 'Super',
  email: 'super@x.com',
  role: 'superadmin',
  organizationId: undefined,
};

function makeCtx(tableRows: Record<string, any[]> = {}) {
  const insertedById = new Map<string, any>();
  for (const arr of Object.values(tableRows)) {
    for (const row of arr as any[]) {
      if (row._id) insertedById.set(row._id, row);
    }
  }

  function chain(table: string) {
    const rows = tableRows[table] ?? [];
    let eqFilters: Record<string, unknown> = {};
    let orderDir: 'asc' | 'desc' = 'asc';
    const c: any = {
      withIndex: (idxName: string, cb: any) => {
        const cap = {
          eq: (k: string, v: unknown) => {
            eqFilters[k] = v;
            return cap;
          },
        };
        if (cb) cb(cap);
        return c;
      },
      eq: (k: string, v: unknown) => {
        eqFilters[k] = v;
        return c;
      },
      order: (dir: string) => {
        orderDir = dir as any;
        return c;
      },
      filter: () => c,
      take: async () => {
        let filtered = rows.filter((r) => {
          for (const [k, v] of Object.entries(eqFilters)) {
            if (r[k] !== v) return false;
          }
          return true;
        });
        if (orderDir === 'desc') filtered = [...filtered].reverse();
        return filtered;
      },
      first: async () => {
        const filtered = rows.filter((r) => {
          for (const [k, v] of Object.entries(eqFilters)) {
            if (r[k] !== v) return false;
          }
          return true;
        });
        return filtered[0] ?? null;
      },
    };
    return c;
  }

  return {
    db: {
      get: async (id: string) => {
        for (const arr of Object.values(tableRows)) {
          const found = (arr as any[]).find((r: any) => r._id === id);
          if (found) return found;
        }
        return null;
      },
      insert: async (table: string, doc: Record<string, unknown>) => {
        const arr = (tableRows[table] ??= []);
        const id = `auto-${table}-${arr.length}`;
        const full = { _id: id, ...doc };
        arr.push(full);
        insertedById.set(id, full);
        return id;
      },
      patch: async (id: string, patchDoc: Record<string, unknown>) => {
        const row = insertedById.get(id);
        if (row) Object.assign(row, patchDoc);
      },
      delete: async (id: string) => {
        for (const table of Object.keys(tableRows)) {
          const idx = tableRows[table].findIndex((r: any) => r._id === id);
          if (idx >= 0) {
            tableRows[table].splice(idx, 1);
            break;
          }
        }
      },
      query: (table: string) => chain(table),
    },
    tableRows,
  };
}

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    tools = require('../../convex/superadmin/operatorTools');
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller.mockResolvedValue(superadmin);
});

// ─── listPlatformLimits ─────────────────────────────────────────────────────

describe('listPlatformLimits', () => {
  it('merges defaults with DB overrides', async () => {
    const rows: any = {
      platformLimits: [{ key: 'files.maxUploadMB', value: 50, updatedBy: 'u1', updatedAt: 1000 }],
    };
    const ctx = makeCtx(rows);
    const result = await tools.listPlatformLimits.handler(ctx, {});
    expect(result.length).toBe(5);
    const uploadLimit = result.find((r: any) => r.key === 'files.maxUploadMB');
    expect(uploadLimit.value).toBe(50);
    expect(uploadLimit.default).toBe(25);
    const timeout = result.find((r: any) => r.key === 'session.timeoutMinutes');
    expect(timeout.value).toBe(timeout.default);
  });

  it('returns empty for non-superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue({
      _id: 'u1',
      name: 'A',
      email: 'a@x.com',
      role: 'admin',
      organizationId: 'org1',
    });
    const ctx = makeCtx({});
    const result = await tools.listPlatformLimits.handler(ctx, {});
    expect(result).toEqual([]);
  });
});

// ─── setPlatformLimit ───────────────────────────────────────────────────────

describe('setPlatformLimit', () => {
  it('inserts a new limit', async () => {
    const ctx = makeCtx({});
    const result = await tools.setPlatformLimit.handler(ctx, {
      key: 'files.maxUploadMB',
      value: 100,
    });
    expect(result).toEqual({ ok: true });
    const rows = ctx.tableRows['platformLimits'] ?? [];
    expect(rows.length).toBe(1);
    expect(rows[0].key).toBe('files.maxUploadMB');
    expect(rows[0].value).toBe(100);
  });

  it('updates an existing limit', async () => {
    const rows: any = {
      platformLimits: [{ _id: 'pl_1', key: 'files.maxUploadMB', value: 25 }],
    };
    const ctx = makeCtx(rows);
    await tools.setPlatformLimit.handler(ctx, { key: 'files.maxUploadMB', value: 75 });
    expect(ctx.tableRows['platformLimits'][0].value).toBe(75);
  });

  it('throws for unknown key', async () => {
    const ctx = makeCtx({});
    await expect(
      tools.setPlatformLimit.handler(ctx, { key: 'unknown.key', value: 1 }),
    ).rejects.toThrow('Unknown limit key');
  });

  it('throws for non-positive value', async () => {
    const ctx = makeCtx({});
    await expect(
      tools.setPlatformLimit.handler(ctx, { key: 'files.maxUploadMB', value: -5 }),
    ).rejects.toThrow('positive number');
  });

  it('throws for non-finite value', async () => {
    const ctx = makeCtx({});
    await expect(
      tools.setPlatformLimit.handler(ctx, { key: 'files.maxUploadMB', value: NaN }),
    ).rejects.toThrow();
  });
});

// ─── resetPlatformLimit ─────────────────────────────────────────────────────

describe('resetPlatformLimit', () => {
  it('deletes the override row', async () => {
    const rows: any = {
      platformLimits: [{ _id: 'pl_del', key: 'files.maxUploadMB', value: 100 }],
    };
    const ctx = makeCtx(rows);
    await tools.resetPlatformLimit.handler(ctx, { key: 'files.maxUploadMB' });
    expect(ctx.tableRows['platformLimits'].length).toBe(0);
  });

  it('no-ops when no override exists', async () => {
    const ctx = makeCtx({});
    await expect(
      tools.resetPlatformLimit.handler(ctx, { key: 'files.maxUploadMB' }),
    ).resolves.not.toThrow();
  });
});

// ─── DEFAULT_PLATFORM_LIMITS ────────────────────────────────────────────────

describe('DEFAULT_PLATFORM_LIMITS', () => {
  it('has all expected keys', () => {
    const keys = Object.keys(tools.DEFAULT_PLATFORM_LIMITS);
    expect(keys).toContain('session.timeoutMinutes');
    expect(keys).toContain('files.maxUploadMB');
    expect(keys).toContain('chat.messageMaxLength');
    expect(keys).toContain('tasks.maxPerOrg');
    expect(keys).toContain('attendance.maxCheckinsPerDay');
  });

  it('all limits have positive values', () => {
    for (const [key, def] of Object.entries(tools.DEFAULT_PLATFORM_LIMITS)) {
      expect((def as any).value).toBeGreaterThan(0);
      expect(typeof (def as any).description).toBe('string');
    }
  });
});

// ─── CRON_REGISTRY ─────────────────────────────────────────────────────────

describe('CRON_REGISTRY', () => {
  it('has expected cron jobs', () => {
    const keys = tools.CRON_REGISTRY.map((r: any) => r.jobKey);
    expect(keys).toContain('integration-scheduled-syncs');
    expect(keys).toContain('signature-archive-sweep');
    expect(keys).toContain('recurring-tasks-generate');
    expect(keys).toContain('survey-auto-activation');
  });

  it('all entries have required fields', () => {
    for (const entry of tools.CRON_REGISTRY) {
      expect(typeof entry.jobKey).toBe('string');
      expect(typeof entry.label).toBe('string');
      expect(typeof entry.description).toBe('string');
      expect(typeof entry.schedule).toBe('string');
    }
  });
});

// ─── listScheduledOps ───────────────────────────────────────────────────────

describe('listScheduledOps', () => {
  it('merges registry with DB state', async () => {
    const rows: any = {
      scheduledOps: [{ jobKey: 'integration-scheduled-syncs', isPaused: true, lastRunAt: 1000 }],
    };
    const ctx = makeCtx(rows);
    const result = await tools.listScheduledOps.handler(ctx, {});
    expect(result.length).toBe(tools.CRON_REGISTRY.length);
    const integration = result.find((r: any) => r.jobKey === 'integration-scheduled-syncs');
    expect(integration.isPaused).toBe(true);
    expect(integration.lastRunAt).toBe(1000);
  });

  it('returns empty for non-superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue({
      _id: 'u1',
      name: 'A',
      email: 'a@x.com',
      role: 'admin',
      organizationId: 'org1',
    });
    const ctx = makeCtx({});
    const result = await tools.listScheduledOps.handler(ctx, {});
    expect(result).toEqual([]);
  });
});

// ─── setScheduledOpPaused ───────────────────────────────────────────────────

describe('setScheduledOpPaused', () => {
  it('pauses a job (creates row if needed)', async () => {
    const ctx = makeCtx({});
    await tools.setScheduledOpPaused.handler(ctx, {
      jobKey: 'recurring-tasks-generate',
      isPaused: true,
    });
    const rows = ctx.tableRows['scheduledOps'] ?? [];
    expect(rows.length).toBe(1);
    expect(rows[0].jobKey).toBe('recurring-tasks-generate');
    expect(rows[0].isPaused).toBe(true);
  });

  it('updates existing job pause state', async () => {
    const rows: any = {
      scheduledOps: [{ _id: 'so_1', jobKey: 'survey-auto-activation', isPaused: false }],
    };
    const ctx = makeCtx(rows);
    await tools.setScheduledOpPaused.handler(ctx, {
      jobKey: 'survey-auto-activation',
      isPaused: true,
    });
    expect(ctx.tableRows['scheduledOps'][0].isPaused).toBe(true);
  });
});

// ─── runScheduledOpNow ──────────────────────────────────────────────────────

describe('runScheduledOpNow', () => {
  it('schedules a job run', async () => {
    const mockScheduler = { runAfter: jest.fn() };
    const ctx = makeCtx({});
    (ctx as any).scheduler = mockScheduler;
    const result = await tools.runScheduledOpNow.handler(ctx, { jobKey: 'test-job' });
    expect(result).toEqual({ ok: true });
    expect(mockScheduler.runAfter).toHaveBeenCalled();
  });
});

// ─── Maintenance Windows ────────────────────────────────────────────────────

describe('listMaintenanceWindows', () => {
  it('returns maintenance windows for superadmin', async () => {
    const rows: any = {
      maintenanceWindows: [
        { _id: 'mw1', title: 'Planned Outage', isActive: true },
        { _id: 'mw2', title: 'DB Migration', isActive: false },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await tools.listMaintenanceWindows.handler(ctx, {});
    expect(result.length).toBe(2);
  });

  it('returns empty for non-superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue({
      _id: 'u1',
      name: 'A',
      email: 'a@x.com',
      role: 'admin',
      organizationId: 'org1',
    });
    const ctx = makeCtx({});
    const result = await tools.listMaintenanceWindows.handler(ctx, {});
    expect(result).toEqual([]);
  });
});

describe('getActiveMaintenanceWindow', () => {
  it('returns active window within time range', async () => {
    const future = Date.now() + 3600000;
    const rows: any = {
      maintenanceWindows: [
        {
          _id: 'mw1',
          title: 'Maintenance',
          message: 'Working...',
          startsAt: Date.now(),
          endsAt: future,
          isActive: true,
        },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await tools.getActiveMaintenanceWindow.handler(ctx, {});
    expect(result).toBeDefined();
    expect(result.title).toBe('Maintenance');
  });

  it('returns null when no active window', async () => {
    const rows: any = {
      maintenanceWindows: [
        { _id: 'mw1', title: 'Past', startsAt: 100, endsAt: 200, isActive: false },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await tools.getActiveMaintenanceWindow.handler(ctx, {});
    expect(result).toBeNull();
  });
});

describe('createMaintenanceWindow', () => {
  it('creates a window with broadcast', async () => {
    const now = Date.now();
    const ctx = makeCtx({});
    const result = await tools.createMaintenanceWindow.handler(ctx, {
      title: 'Scheduled Maintenance',
      message: 'System will be down',
      startsAt: now + 3600000,
      endsAt: now + 7200000,
      broadcastTitle: 'Heads up!',
      broadcastMessage: 'Maintenance coming',
    });
    expect(result.id).toBeDefined();
    const rows = ctx.tableRows['maintenanceWindows'] ?? [];
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe('Scheduled Maintenance');
    expect(rows[0].broadcastMessage).toBe('Maintenance coming');
  });

  it('throws when endsAt <= startsAt', async () => {
    const ctx = makeCtx({});
    await expect(
      tools.createMaintenanceWindow.handler(ctx, {
        title: 'Bad',
        message: 'Bad window',
        startsAt: 200,
        endsAt: 100,
      }),
    ).rejects.toThrow('End time must be after start time');
  });

  it('marks as active if startsAt <= now', async () => {
    const ctx = makeCtx({});
    const result = await tools.createMaintenanceWindow.handler(ctx, {
      title: 'Immediate',
      message: 'Now!',
      startsAt: Date.now() - 1000,
      endsAt: Date.now() + 3600000,
    });
    const rows = ctx.tableRows['maintenanceWindows'] ?? [];
    expect(rows[0].isActive).toBe(true);
  });
});

describe('setMaintenanceWindowActive', () => {
  it('patches isActive', async () => {
    const rows: any = {
      maintenanceWindows: [{ _id: 'mw_patch', isActive: false }],
    };
    const ctx = makeCtx(rows);
    const result = await tools.setMaintenanceWindowActive.handler(ctx, {
      id: 'mw_patch' as any,
      isActive: true,
    });
    expect(result).toEqual({ ok: true });
    expect(ctx.tableRows['maintenanceWindows'][0].isActive).toBe(true);
  });
});

describe('deleteMaintenanceWindow', () => {
  it('deletes the window', async () => {
    const rows: any = {
      maintenanceWindows: [{ _id: 'mw_del', title: 'Delete Me' }],
    };
    const ctx = makeCtx(rows);
    const result = await tools.deleteMaintenanceWindow.handler(ctx, { id: 'mw_del' as any });
    expect(result).toEqual({ ok: true });
    expect(ctx.tableRows['maintenanceWindows'].length).toBe(0);
  });
});
