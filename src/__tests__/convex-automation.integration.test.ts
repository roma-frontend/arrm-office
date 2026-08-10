/**
 * Integration tests for convex/automation — query stats/trends and the
 * automation-task/workflow mutations against convex-test's in-memory database
 * with the real schema.
 *
 * Covers: getStats (counts, 24h/7d trends, active workflows), getRecentTasks
 * (limits + ordering), getActiveWorkflows, runAutomation (task creation),
 * internal task lifecycle (createAutomationTask / completeAutomationTask),
 * toggleWorkflow (enable/disable + not-found), createWorkflow (defaults) and
 * deleteWorkflow.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './automation.ts': () => import('../../convex/automation'),
  './automationMutations.ts': () => import('../../convex/automationMutations'),
  './lib/limits.ts': () => import('../../convex/lib/limits'),
} as unknown as Record<string, () => Promise<unknown>>;

type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

async function insertTask(
  ctx: { db: { insert: (table: 'automationTasks', doc: never) => Promise<Id<'automationTasks'>> } },
  name: string,
  status: TaskStatus,
  createdAt: number,
): Promise<Id<'automationTasks'>> {
  return await ctx.db.insert('automationTasks', {
    name,
    status,
    createdAt,
    updatedAt: createdAt,
  } as never);
}

async function insertWorkflow(
  ctx: {
    db: {
      insert: (table: 'automationWorkflows', doc: never) => Promise<Id<'automationWorkflows'>>;
    };
  },
  name: string,
  isActive: boolean,
): Promise<Id<'automationWorkflows'>> {
  return await ctx.db.insert('automationWorkflows', {
    name,
    description: '',
    config: { steps: [] },
    isActive,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as never);
}

const HOUR = 60 * 60 * 1000;

// ── getStats ─────────────────────────────────────────────────────────────────
describe('getStats', () => {
  it('returns zeroed stats when the database is empty', async () => {
    const t = convexTest(schema, modules);
    const res = await t.run((ctx) => ctx.runQuery(api.automation.getStats));
    expect(res).toEqual({
      totalTasks: 0,
      completedTasks: 0,
      pendingTasks: 0,
      failedTasks: 0,
      tasksTrend: 0,
      completedTrend: 0,
      pendingTrend: 0,
      failedTrend: 0,
      activeWorkflows: 0,
    });
  });

  it('counts tasks by status and active workflows', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await insertTask(ctx, 'a', 'completed', now);
      await insertTask(ctx, 'b', 'pending', now);
      await insertTask(ctx, 'c', 'failed', now);
      await insertTask(ctx, 'd', 'running', now);
      await insertWorkflow(ctx, 'w1', true);
      await insertWorkflow(ctx, 'w2', false);
    });

    const res = await t.run((ctx) => ctx.runQuery(api.automation.getStats));
    expect(res.totalTasks).toBe(4);
    expect(res.completedTasks).toBe(1);
    expect(res.pendingTasks).toBe(1);
    expect(res.failedTasks).toBe(1);
    expect(res.activeWorkflows).toBe(1);
  });

  it('computes a 100% trend when previous period is empty but current is not', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      // Only tasks created within the last 24h.
      await insertTask(ctx, 'recent', 'completed', now - HOUR);
    });

    const res = await t.run((ctx) => ctx.runQuery(api.automation.getStats));
    expect(res.tasksTrend).toBe(100);
    expect(res.completedTrend).toBe(100);
  });

  it('returns 0 trend when both periods are empty', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      // Older than 7 days → outside both windows.
      await insertTask(ctx, 'old', 'completed', now - 8 * 24 * HOUR);
    });

    const res = await t.run((ctx) => ctx.runQuery(api.automation.getStats));
    expect(res.totalTasks).toBe(1);
    expect(res.tasksTrend).toBe(0);
    expect(res.completedTrend).toBe(0);
  });

  it('computes a rounded percentage trend between 24h and previous 7d periods', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      // Previous period: 2 completed tasks (7d..24h ago).
      await insertTask(ctx, 'prev1', 'completed', now - 6 * 24 * HOUR);
      await insertTask(ctx, 'prev2', 'completed', now - 5 * 24 * HOUR);
      // Current period: 4 completed tasks (last 24h).
      for (let i = 0; i < 4; i++) await insertTask(ctx, `cur${i}`, 'completed', now - i * HOUR);
      // A failed task in the current period that must NOT count as completed.
      await insertTask(ctx, 'curfail', 'failed', now - 2 * HOUR);
    });

    const res = await t.run((ctx) => ctx.runQuery(api.automation.getStats));
    expect(res.completedTasks).toBe(6);
    expect(res.completedTrend).toBe(100); // (4-2)/2 = 100%
    expect(res.failedTasks).toBe(1);
  });
});

// ── getRecentTasks ───────────────────────────────────────────────────────────
describe('getRecentTasks', () => {
  it('returns the most recent tasks by default limit of 10', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      for (let i = 0; i < 15; i++) await insertTask(ctx, `task-${i}`, 'pending', now + i);
    });

    const res = await t.run((ctx) => ctx.runQuery(api.automation.getRecentTasks, {}));
    expect(res).toHaveLength(10);
    // Ordered desc by _id insertion time; the newest inserted name first.
    expect(res[0].name).toBe('task-14');
    expect(res[9].name).toBe('task-5');
  });

  it('honors a custom limit', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      for (let i = 0; i < 5; i++) await insertTask(ctx, `task-${i}`, 'completed', now + i);
    });

    const res = await t.run((ctx) => ctx.runQuery(api.automation.getRecentTasks, { limit: 3 }));
    expect(res).toHaveLength(3);
  });

  it('returns an empty array when no tasks exist', async () => {
    const t = convexTest(schema, modules);
    const res = await t.run((ctx) => ctx.runQuery(api.automation.getRecentTasks, {}));
    expect(res).toEqual([]);
  });
});

// ── getActiveWorkflows ───────────────────────────────────────────────────────
describe('getActiveWorkflows', () => {
  it('returns all workflows regardless of active state', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await insertWorkflow(ctx, 'enabled', true);
      await insertWorkflow(ctx, 'disabled', false);
    });

    const res = await t.run((ctx) => ctx.runQuery(api.automation.getActiveWorkflows));
    expect(res).toHaveLength(2);
    expect(res.map((w) => w.name).sort()).toEqual(['disabled', 'enabled']);
  });
});

// ── runAutomation ────────────────────────────────────────────────────────────
describe('runAutomation (mutation)', () => {
  it('creates a running automation task and returns its id', async () => {
    const t = convexTest(schema, modules);
    const res = await t.run((ctx) => ctx.runMutation(api.automationMutations.runAutomation, {}));

    expect(res.success).toBe(true);
    await t.run(async (ctx) => {
      const task = await ctx.db.get(res.taskId as Id<'automationTasks'>);
      expect(task?.name).toBe('Manual automation run');
      expect(task?.status).toBe('running');
      expect(task?.createdAt).toBeGreaterThan(0);
      // createdAt/updatedAt are two separate Date.now() calls in the module;
      // allow a 1ms boundary crossing rather than asserting exact equality.
      expect(task?.updatedAt).toBeGreaterThanOrEqual(task?.createdAt ?? 0);
    });
  });
});

// ── internal task lifecycle ──────────────────────────────────────────────────
describe('internal automation task mutations', () => {
  it('createAutomationTask inserts a running task and returns its id', async () => {
    const t = convexTest(schema, modules);
    const res = await t.run((ctx) =>
      ctx.runMutation(api.automationMutations.createAutomationTask, { name: 'Scheduled sync' }),
    );

    await t.run(async (ctx) => {
      const task = await ctx.db.get(res as Id<'automationTasks'>);
      expect(task?.name).toBe('Scheduled sync');
      expect(task?.status).toBe('running');
    });
  });

  it('completeAutomationTask flips status to completed', async () => {
    const t = convexTest(schema, modules);
    const id = await t.run(async (ctx) => insertTask(ctx, 'job', 'running', Date.now()));

    const res = await t.run((ctx) =>
      ctx.runMutation(api.automationMutations.completeAutomationTask, { taskId: id }),
    );
    expect(res.success).toBe(true);

    await t.run(async (ctx) => {
      const task = await ctx.db.get(id);
      expect(task?.status).toBe('completed');
      expect(task?.updatedAt).toBeGreaterThanOrEqual(task?.createdAt ?? 0);
    });
  });
});

// ── toggleWorkflow ───────────────────────────────────────────────────────────
describe('toggleWorkflow', () => {
  it('disables an active workflow and reports the new state', async () => {
    const t = convexTest(schema, modules);
    const id = await t.run(async (ctx) => insertWorkflow(ctx, 'wf', true));

    const res = await t.run((ctx) =>
      ctx.runMutation(api.automationMutations.toggleWorkflow, { workflowId: id }),
    );
    expect(res.isActive).toBe(false);

    await t.run(async (ctx) => {
      const wf = await ctx.db.get(id);
      expect(wf?.isActive).toBe(false);
    });
  });

  it('re-enables a disabled workflow', async () => {
    const t = convexTest(schema, modules);
    const id = await t.run(async (ctx) => insertWorkflow(ctx, 'wf', false));

    const res = await t.run((ctx) =>
      ctx.runMutation(api.automationMutations.toggleWorkflow, { workflowId: id }),
    );
    expect(res.isActive).toBe(true);

    await t.run(async (ctx) => {
      const wf = await ctx.db.get(id);
      expect(wf?.isActive).toBe(true);
    });
  });

  it('throws for a missing workflow', async () => {
    const t = convexTest(schema, modules);
    const ghostId = await t.run(async (ctx) => {
      const id = await insertWorkflow(ctx, 'temp', true);
      await ctx.db.delete(id);
      return id;
    });

    await expect(
      t.run((ctx) =>
        ctx.runMutation(api.automationMutations.toggleWorkflow, { workflowId: ghostId }),
      ),
    ).rejects.toThrow('Workflow not found');
  });
});

// ── createWorkflow / deleteWorkflow ──────────────────────────────────────────
describe('createWorkflow / deleteWorkflow', () => {
  it('creates an active workflow with defaults', async () => {
    const t = convexTest(schema, modules);
    const res = await t.run((ctx) =>
      ctx.runMutation(api.automationMutations.createWorkflow, {
        name: 'Onboarding flow',
        config: { trigger: 'on_hire' },
      }),
    );

    expect(res.success).toBe(true);
    await t.run(async (ctx) => {
      const wf = await ctx.db.get(res.workflowId as Id<'automationWorkflows'>);
      expect(wf?.name).toBe('Onboarding flow');
      expect(wf?.description).toBe('');
      expect(wf?.config).toEqual({ trigger: 'on_hire' });
      expect(wf?.isActive).toBe(true);
    });
  });

  it('persists an explicit description', async () => {
    const t = convexTest(schema, modules);
    const res = await t.run((ctx) =>
      ctx.runMutation(api.automationMutations.createWorkflow, {
        name: 'Flow',
        description: 'Runs daily',
        config: { cron: '0 9 * * *' },
      }),
    );

    await t.run(async (ctx) => {
      const wf = await ctx.db.get(res.workflowId as Id<'automationWorkflows'>);
      expect(wf?.description).toBe('Runs daily');
    });
  });

  it('deletes a workflow', async () => {
    const t = convexTest(schema, modules);
    const id = await t.run(async (ctx) => insertWorkflow(ctx, 'to-delete', true));

    const res = await t.run((ctx) =>
      ctx.runMutation(api.automationMutations.deleteWorkflow, { workflowId: id }),
    );
    expect(res.success).toBe(true);

    await t.run(async (ctx) => {
      expect(await ctx.db.get(id)).toBeNull();
    });
  });
});
