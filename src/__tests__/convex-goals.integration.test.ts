/**
 * Integration tests for convex/goals — OKR objectives, key results, check-ins
 * and progress computation, run against convex-test's in-memory database with
 * the real schema.
 *
 * Covers: createObjective (parent validation, team-level department rule, KR
 * creation), listObjectives/getObjective enrichment, update/delete objectives
 * (child blocking + KR/check-in cascade), addKeyResult guards, check-in value
 * updates + weighted progress recompute (incl. boolean and decrease KRs),
 * complete/cancel transitions, task stats queries, and the weekly check-in
 * reminder cron.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './goals.ts': () => import('../../convex/goals'),
  './lib/limits.ts': () => import('../../convex/lib/limits'),
  './lib/userProfile.ts': () => import('../../convex/lib/userProfile'),
  './lib/notify.ts': () => import('../../convex/lib/notify'),
  './lib/getAuthCaller.ts': () => import('../../convex/lib/getAuthCaller'),
  './lib/auth.ts': () => import('../../convex/lib/auth'),
} as unknown as Record<string, () => Promise<unknown>>;

type Ctx = Awaited<ReturnType<typeof seed>>;

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Acme',
      slug: `acme-${Math.random().toString(36).slice(2)}`,
      plan: 'professional',
      isActive: true,
      createdBySuperadmin: false,
      employeeLimit: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);

    const baseUser = {
      passwordHash: 'x',
      employeeType: 'staff' as const,
      isActive: true,
      isApproved: true,
      travelAllowance: 0,
      paidLeaveBalance: 10,
      sickLeaveBalance: 5,
      familyLeaveBalance: 5,
      dayOffBalance: 4,
      createdAt: Date.now(),
    };

    const managerId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Manager',
      email: 'manager@acme.test',
      role: 'supervisor',
      department: 'Eng',
    });
    const employeeId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Employee',
      email: 'employee@acme.test',
      role: 'employee',
      department: 'Eng',
      supervisorId: managerId,
    });

    return { organizationId, managerId, employeeId };
  });
  return { t, ...ids };
}

const PERIOD = {
  periodType: 'Q1' as const,
  periodYear: 2026,
  periodStart: 1_700_000_000_000,
  periodEnd: 1_700_000_000_000 + 90 * 24 * 60 * 60 * 1000,
};

function objectiveArgs(c: Ctx, overrides: Record<string, unknown> = {}) {
  return {
    organizationId: c.organizationId,
    title: 'Grow revenue',
    description: 'Company-wide',
    ownerId: c.managerId,
    level: 'company' as const,
    periodType: PERIOD.periodType,
    periodYear: PERIOD.periodYear,
    periodStart: PERIOD.periodStart,
    periodEnd: PERIOD.periodEnd,
    createdBy: c.managerId,
    keyResults: [],
    ...overrides,
  };
}

const krInput = (overrides: Record<string, unknown> = {}) => ({
  title: 'Increase signups',
  metricType: 'number' as const,
  direction: 'increase' as const,
  startValue: 0,
  targetValue: 100,
  weight: 100,
  ownerId: undefined,
  ...overrides,
});

async function createObjective(
  c: Ctx,
  overrides: Record<string, unknown> = {},
): Promise<Id<'objectives'>> {
  return (await c.t.run((ctx) =>
    ctx.runMutation(api.goals.createObjective, objectiveArgs(c, overrides)),
  )) as Id<'objectives'>;
}

// ── createObjective ──────────────────────────────────────────────────────────
describe('goals.createObjective', () => {
  it('creates an active objective with zero progress and its key results', async () => {
    const c = await seed();
    const id = await createObjective(c, {
      keyResults: [krInput({ title: 'KR 1', weight: 60 }), krInput({ title: 'KR 2', weight: 40 })],
    });

    await c.t.run(async (ctx) => {
      const obj = await ctx.db.get(id);
      expect(obj?.status).toBe('active');
      expect(obj?.progress).toBe(0);
      const krs = await ctx.db
        .query('keyResults')
        .withIndex('by_objective', (q) => q.eq('objectiveId', id))
        .collect();
      expect(krs).toHaveLength(2);
      expect(krs.map((k) => k.order).sort()).toEqual([0, 1]);
      expect(krs.every((k) => k.currentValue === k.startValue)).toBe(true);
      expect(krs.every((k) => k.confidence === 'none')).toBe(true);
    });
  });

  it('rejects a parent objective from another organization', async () => {
    const c = await seed();
    const otherOrgId = await c.t.run(async (ctx) =>
      ctx.db.insert('organizations', {
        name: 'Other',
        slug: `other-${Math.random().toString(36).slice(2)}`,
        plan: 'professional',
        isActive: true,
        createdBySuperadmin: false,
        employeeLimit: 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never),
    );
    const foreignParent = await c.t.run(async (ctx) =>
      ctx.db.insert('objectives', {
        organizationId: otherOrgId,
        title: 'Foreign',
        ownerId: c.managerId,
        level: 'company',
        periodType: 'Q1',
        periodYear: 2026,
        periodStart: 1,
        periodEnd: 2,
        status: 'active',
        progress: 0,
        createdBy: c.managerId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never),
    );

    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(
          api.goals.createObjective,
          objectiveArgs(c, { parentObjectiveId: foreignParent }),
        ),
      ),
    ).rejects.toThrow('Invalid parent objective');
  });

  it('requires a department for team-level objectives', async () => {
    const c = await seed();
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(
          api.goals.createObjective,
          objectiveArgs(c, { level: 'team', department: undefined }),
        ),
      ),
    ).rejects.toThrow('Team-level objectives require a department');
  });

  it('defaults KR owner to the objective owner', async () => {
    const c = await seed();
    const id = await createObjective(c, {
      keyResults: [krInput({ ownerId: undefined })],
    });
    await c.t.run(async (ctx) => {
      const kr = await ctx.db
        .query('keyResults')
        .withIndex('by_objective', (q) => q.eq('objectiveId', id))
        .first();
      expect(kr?.ownerId).toBe(c.managerId);
    });
  });
});

// ── listObjectives / getObjective ────────────────────────────────────────────
describe('objective queries', () => {
  it('listObjectives applies filters and enriches owner + KR/task counts', async () => {
    const c = await seed();
    await createObjective(c, { title: 'A', keyResults: [krInput()] });
    await createObjective(c, { title: 'B', level: 'individual', ownerId: c.employeeId });

    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.goals.listObjectives, {
        organizationId: c.organizationId,
        level: 'company',
      }),
    );
    expect(res).toHaveLength(1);
    expect(res[0]?.title).toBe('A');
    expect(res[0]?.ownerName).toBe('Manager');
    expect(res[0]?.keyResultsCount).toBe(1);
    expect(res[0]?.taskCount).toBe(0);
  });

  it('getObjective returns null for a missing objective', async () => {
    const c = await seed();
    const ghostId = await c.t.run(async (ctx) => {
      const id = await ctx.db.insert('objectives', {
        organizationId: c.organizationId,
        title: 'ghost',
        ownerId: c.managerId,
        level: 'company',
        periodType: 'Q1',
        periodYear: 2026,
        periodStart: 1,
        periodEnd: 2,
        status: 'active',
        progress: 0,
        createdBy: c.managerId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
      await ctx.db.delete(id);
      return id;
    });
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.goals.getObjective, { objectiveId: ghostId }),
    );
    expect(res).toBeNull();
  });

  it('getObjective returns owner info and ordered key results', async () => {
    const c = await seed();
    const id = await createObjective(c, {
      keyResults: [
        krInput({ title: 'first', weight: 40 }),
        krInput({ title: 'second', weight: 60 }),
      ],
    });
    const res = await c.t.run((ctx) => ctx.runQuery(api.goals.getObjective, { objectiveId: id }));
    expect(res?.title).toBe('Grow revenue');
    expect(res?.ownerName).toBe('Manager');
    expect(res?.keyResults.map((k: { title: string }) => k.title)).toEqual(['first', 'second']);
  });
});

// ── updateObjective / deleteObjective ────────────────────────────────────────
describe('objective mutations', () => {
  it('updateObjective patches title, description and status', async () => {
    const c = await seed();
    const id = await createObjective(c);
    await c.t.run((ctx) =>
      ctx.runMutation(api.goals.updateObjective, {
        objectiveId: id,
        title: 'Renamed',
        status: 'draft',
      }),
    );
    await c.t.run(async (ctx) => {
      const obj = await ctx.db.get(id);
      expect(obj?.title).toBe('Renamed');
      expect(obj?.status).toBe('draft');
    });
  });

  it('updateObjective throws for a missing objective', async () => {
    const c = await seed();
    const ghostId = await c.t.run(async (ctx) => {
      const id = await ctx.db.insert('objectives', {
        organizationId: c.organizationId,
        title: 'ghost',
        ownerId: c.managerId,
        level: 'company',
        periodType: 'Q1',
        periodYear: 2026,
        periodStart: 1,
        periodEnd: 2,
        status: 'active',
        progress: 0,
        createdBy: c.managerId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
      await ctx.db.delete(id);
      return id;
    });
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.goals.updateObjective, { objectiveId: ghostId, title: 'x' }),
      ),
    ).rejects.toThrow('Objective not found');
  });

  it('deleteObjective refuses when child objectives are aligned', async () => {
    const c = await seed();
    const parent = await createObjective(c);
    await createObjective(c, { parentObjectiveId: parent });
    await expect(
      c.t.run((ctx) => ctx.runMutation(api.goals.deleteObjective, { objectiveId: parent })),
    ).rejects.toThrow('Cannot delete objective with aligned child objectives');
  });

  it('deleteObjective cascades key results and their check-ins', async () => {
    const c = await seed();
    const id = await createObjective(c, { keyResults: [krInput()] });
    const kr = await c.t.run(async (ctx) =>
      ctx.db
        .query('keyResults')
        .withIndex('by_objective', (q) => q.eq('objectiveId', id))
        .first(),
    );
    await c.t.run(async (ctx) => {
      await ctx.db.insert('goalCheckins', {
        keyResultId: kr?._id as Id<'keyResults'>,
        objectiveId: id,
        organizationId: c.organizationId,
        userId: c.managerId,
        previousValue: 0,
        newValue: 10,
        confidence: 'high',
        createdAt: Date.now(),
      } as never);
    });

    await c.t.run((ctx) => ctx.runMutation(api.goals.deleteObjective, { objectiveId: id }));

    await c.t.run(async (ctx) => {
      expect(await ctx.db.get(id)).toBeNull();
      const krs = await ctx.db.query('keyResults').collect();
      const checkins = await ctx.db.query('goalCheckins').collect();
      expect(krs).toHaveLength(0);
      expect(checkins).toHaveLength(0);
    });
  });
});

// ── key results ──────────────────────────────────────────────────────────────
describe('key result mutations', () => {
  it('addKeyResult appends a KR with the next order index', async () => {
    const c = await seed();
    const id = await createObjective(c, { keyResults: [krInput()] });
    const krId = await c.t.run((ctx) =>
      ctx.runMutation(api.goals.addKeyResult, {
        objectiveId: id,
        title: 'New KR',
        metricType: 'number',
        direction: 'increase',
        startValue: 0,
        targetValue: 5,
        weight: 10,
        ownerId: c.employeeId,
      }),
    );

    await c.t.run(async (ctx) => {
      const kr = await ctx.db.get(krId as Id<'keyResults'>);
      expect(kr?.order).toBe(1);
      expect(kr?.currentValue).toBe(0);
      expect(kr?.confidence).toBe('none');
    });
  });

  it('addKeyResult refuses KRs on a completed objective', async () => {
    const c = await seed();
    const id = await createObjective(c);
    await c.t.run((ctx) => ctx.runMutation(api.goals.completeObjective, { objectiveId: id }));
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.goals.addKeyResult, {
          objectiveId: id,
          title: 'late',
          metricType: 'number',
          direction: 'increase',
          startValue: 0,
          targetValue: 1,
          weight: 100,
          ownerId: c.managerId,
        }),
      ),
    ).rejects.toThrow('Cannot add KR to closed objective');
  });

  it('updateKeyResult patches editable fields', async () => {
    const c = await seed();
    const id = await createObjective(c, { keyResults: [krInput()] });
    const krId = await c.t.run(async (ctx) =>
      ctx.db
        .query('keyResults')
        .withIndex('by_objective', (q) => q.eq('objectiveId', id))
        .first(),
    );
    await c.t.run((ctx) =>
      ctx.runMutation(api.goals.updateKeyResult, {
        keyResultId: krId?._id as Id<'keyResults'>,
        targetValue: 200,
        weight: 50,
      }),
    );
    await c.t.run(async (ctx) => {
      const kr = await ctx.db.get(krId?._id as Id<'keyResults'>);
      expect(kr?.targetValue).toBe(200);
      expect(kr?.weight).toBe(50);
    });
  });

  it('deleteKeyResult removes check-ins and recomputes objective progress', async () => {
    const c = await seed();
    const id = await createObjective(c, {
      keyResults: [krInput({ weight: 50 }), krInput({ title: 'other', weight: 50 })],
    });
    const krs = await c.t.run(async (ctx) =>
      ctx.db
        .query('keyResults')
        .withIndex('by_objective', (q) => q.eq('objectiveId', id))
        .collect(),
    );
    // Drive KR[0] to 100% so the objective progress is 50%.
    await c.t.run((ctx) =>
      ctx.runMutation(api.goals.checkin, {
        keyResultId: krs[0]?._id as Id<'keyResults'>,
        userId: c.managerId,
        newValue: 100,
        confidence: 'high',
      }),
    );
    const before = await c.t.run((ctx) => ctx.db.get(id));

    await c.t.run((ctx) =>
      ctx.runMutation(api.goals.deleteKeyResult, { keyResultId: krs[0]?._id as Id<'keyResults'> }),
    );

    await c.t.run(async (ctx) => {
      const after = await ctx.db.get(id);
      expect(before?.progress).toBe(50);
      // Only the untouched 0% KR remains → progress resets to 0.
      expect(after?.progress).toBe(0);
      const checkins = await ctx.db.query('goalCheckins').collect();
      expect(checkins).toHaveLength(0);
    });
  });
});

// ── checkin / progress ───────────────────────────────────────────────────────
describe('checkin and progress computation', () => {
  it('computes weighted progress across KRs', async () => {
    const c = await seed();
    const id = await createObjective(c, {
      keyResults: [
        krInput({ title: 'heavy', weight: 80, startValue: 0, targetValue: 100 }),
        krInput({ title: 'light', weight: 20, startValue: 0, targetValue: 100 }),
      ],
    });
    const krs = await c.t.run(async (ctx) =>
      ctx.db
        .query('keyResults')
        .withIndex('by_objective', (q) => q.eq('objectiveId', id))
        .collect(),
    );
    // heavy → 50%, light → 0% → weighted 40%.
    await c.t.run((ctx) =>
      ctx.runMutation(api.goals.checkin, {
        keyResultId: krs[0]?._id as Id<'keyResults'>,
        userId: c.managerId,
        newValue: 50,
        confidence: 'medium',
      }),
    );
    const obj = await c.t.run((ctx) => ctx.db.get(id));
    expect(obj?.progress).toBe(40);
  });

  it('handles decrease-direction KRs', async () => {
    const c = await seed();
    const id = await createObjective(c, {
      keyResults: [
        krInput({ title: 'reduce bugs', direction: 'decrease', startValue: 100, targetValue: 0 }),
      ],
    });
    const kr = await c.t.run(async (ctx) =>
      ctx.db
        .query('keyResults')
        .withIndex('by_objective', (q) => q.eq('objectiveId', id))
        .first(),
    );
    await c.t.run((ctx) =>
      ctx.runMutation(api.goals.checkin, {
        keyResultId: kr?._id as Id<'keyResults'>,
        userId: c.managerId,
        newValue: 25, // 75% of the way from 100 → 0
        confidence: 'high',
      }),
    );
    const obj = await c.t.run((ctx) => ctx.db.get(id));
    expect(obj?.progress).toBe(75);
  });

  it('handles boolean KRs as 0 or 100', async () => {
    const c = await seed();
    const id = await createObjective(c, {
      keyResults: [krInput({ metricType: 'boolean', startValue: 0, targetValue: 1 })],
    });
    const kr = await c.t.run(async (ctx) =>
      ctx.db
        .query('keyResults')
        .withIndex('by_objective', (q) => q.eq('objectiveId', id))
        .first(),
    );
    await c.t.run((ctx) =>
      ctx.runMutation(api.goals.checkin, {
        keyResultId: kr?._id as Id<'keyResults'>,
        userId: c.managerId,
        newValue: 1,
        confidence: 'high',
      }),
    );
    const obj = await c.t.run((ctx) => ctx.db.get(id));
    expect(obj?.progress).toBe(100);
  });

  it('rejects boolean values outside 0..1', async () => {
    const c = await seed();
    const id = await createObjective(c, {
      keyResults: [krInput({ metricType: 'boolean' })],
    });
    const kr = await c.t.run(async (ctx) =>
      ctx.db
        .query('keyResults')
        .withIndex('by_objective', (q) => q.eq('objectiveId', id))
        .first(),
    );
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.goals.checkin, {
          keyResultId: kr?._id as Id<'keyResults'>,
          userId: c.managerId,
          newValue: 2,
          confidence: 'high',
        }),
      ),
    ).rejects.toThrow('Boolean KR value must be 0 or 1');
  });

  it('records the check-in row with previous value and confidence', async () => {
    const c = await seed();
    const id = await createObjective(c, { keyResults: [krInput()] });
    const kr = await c.t.run(async (ctx) =>
      ctx.db
        .query('keyResults')
        .withIndex('by_objective', (q) => q.eq('objectiveId', id))
        .first(),
    );
    await c.t.run((ctx) =>
      ctx.runMutation(api.goals.checkin, {
        keyResultId: kr?._id as Id<'keyResults'>,
        userId: c.employeeId,
        newValue: 10,
        note: 'on track',
        confidence: 'low',
      }),
    );
    await c.t.run(async (ctx) => {
      const checkin = await ctx.db.query('goalCheckins').first();
      expect(checkin?.previousValue).toBe(0);
      expect(checkin?.newValue).toBe(10);
      expect(checkin?.userId).toBe(c.employeeId);
      expect(checkin?.confidence).toBe('low');
    });
  });

  it('blocks check-ins on closed objectives', async () => {
    const c = await seed();
    const id = await createObjective(c, { keyResults: [krInput()] });
    const kr = await c.t.run(async (ctx) =>
      ctx.db
        .query('keyResults')
        .withIndex('by_objective', (q) => q.eq('objectiveId', id))
        .first(),
    );
    await c.t.run((ctx) => ctx.runMutation(api.goals.cancelObjective, { objectiveId: id }));
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.goals.checkin, {
          keyResultId: kr?._id as Id<'keyResults'>,
          userId: c.managerId,
          newValue: 1,
          confidence: 'high',
        }),
      ),
    ).rejects.toThrow('Cannot check in on a closed objective');
  });
});

// ── complete / cancel ────────────────────────────────────────────────────────
describe('completeObjective / cancelObjective', () => {
  it('completes only active objectives', async () => {
    const c = await seed();
    const id = await createObjective(c);
    await c.t.run((ctx) => ctx.runMutation(api.goals.completeObjective, { objectiveId: id }));
    await expect(
      c.t.run((ctx) => ctx.runMutation(api.goals.completeObjective, { objectiveId: id })),
    ).rejects.toThrow('Only active objectives can be completed');
  });

  it('cancels an active objective but not a completed one', async () => {
    const c = await seed();
    const id = await createObjective(c);
    await c.t.run((ctx) => ctx.runMutation(api.goals.completeObjective, { objectiveId: id }));
    await expect(
      c.t.run((ctx) => ctx.runMutation(api.goals.cancelObjective, { objectiveId: id })),
    ).rejects.toThrow('Cannot cancel a completed objective');

    const id2 = await createObjective(c);
    await c.t.run((ctx) => ctx.runMutation(api.goals.cancelObjective, { objectiveId: id2 }));
    const obj = await c.t.run((ctx) => ctx.db.get(id2));
    expect(obj?.status).toBe('cancelled');
  });
});

// ── task stats + task creation selector ──────────────────────────────────────
describe('task-related queries', () => {
  it('getObjectiveTaskStats aggregates linked and completed tasks', async () => {
    const c = await seed();
    const id = await createObjective(c);
    await c.t.run(async (ctx) => {
      await ctx.db.insert('tasks', {
        organizationId: c.organizationId,
        objectiveId: id,
        title: 't1',
        assignedTo: c.employeeId,
        assignedBy: c.managerId,
        status: 'completed',
        priority: 'medium',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
      await ctx.db.insert('tasks', {
        organizationId: c.organizationId,
        objectiveId: id,
        title: 't2',
        assignedTo: c.employeeId,
        assignedBy: c.managerId,
        status: 'in_progress',
        priority: 'low',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
    });

    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.goals.getObjectiveTaskStats, { organizationId: c.organizationId }),
    );
    expect(res).toEqual({
      totalLinked: 2,
      totalCompleted: 1,
      objectivesWithTasks: 1,
      totalObjectives: 1,
    });
  });

  it('getTasksByObjective enriches the assignee', async () => {
    const c = await seed();
    const id = await createObjective(c);
    await c.t.run(async (ctx) => {
      await ctx.db.insert('tasks', {
        organizationId: c.organizationId,
        objectiveId: id,
        title: 't1',
        assignedTo: c.employeeId,
        assignedBy: c.managerId,
        status: 'pending',
        priority: 'medium',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
    });
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.goals.getTasksByObjective, { objectiveId: id }),
    );
    expect(res).toHaveLength(1);
    expect(res[0]?.assignedToUser?.name).toBe('Employee');
  });

  it('getObjectivesForTaskCreation returns only active objectives', async () => {
    const c = await seed();
    const active = await createObjective(c, { title: 'Active', keyResults: [krInput()] });
    const draft = await createObjective(c, { title: 'Draft' });
    await c.t.run((ctx) =>
      ctx.runMutation(api.goals.updateObjective, { objectiveId: draft, status: 'draft' }),
    );

    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.goals.getObjectivesForTaskCreation, {
        organizationId: c.organizationId,
      }),
    );
    expect(res.map((o: { _id: Id<'objectives'> }) => o._id)).toEqual([active]);
    expect(res[0]?.ownerName).toBe('Manager');
    expect(res[0]?.keyResults).toHaveLength(1);
  });

  it('getObjectivesForTaskCreation sorts user objectives first', async () => {
    const c = await seed();
    const mine = await createObjective(c, {
      title: 'Mine',
      ownerId: c.employeeId,
      keyResults: [krInput()],
    });
    const other = await createObjective(c, {
      title: 'Other',
      ownerId: c.managerId,
    });
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.goals.getObjectivesForTaskCreation, {
        organizationId: c.organizationId,
        userId: c.employeeId,
      }),
    );
    expect(res).toHaveLength(2);
    // The employee's objective should come first.
    expect(res[0]?.title).toBe('Mine');
  });

  it('getObjectiveTaskStats filters by periodYear', async () => {
    const c = await seed();
    const obj = await createObjective(c);
    await c.t.run(async (ctx) => {
      await ctx.db.insert('tasks', {
        organizationId: c.organizationId,
        objectiveId: obj,
        title: 't1',
        assignedTo: c.employeeId,
        assignedBy: c.managerId,
        status: 'completed',
        priority: 'medium',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
    });
    // Query with matching periodYear
    const matching = await c.t.run((ctx) =>
      ctx.runQuery(api.goals.getObjectiveTaskStats, {
        organizationId: c.organizationId,
        periodYear: 2026,
      }),
    );
    expect(matching.totalLinked).toBe(1);

    // Query with non-matching periodYear
    const empty = await c.t.run((ctx) =>
      ctx.runQuery(api.goals.getObjectiveTaskStats, {
        organizationId: c.organizationId,
        periodYear: 2025,
      }),
    );
    expect(empty.totalLinked).toBe(0);
  });
});

// ── getMyObjectives ──────────────────────────────────────────────────────────

describe('goals.getMyObjectives', () => {
  it('returns objectives owned by the user, enriched with KRs', async () => {
    const c = await seed();
    await createObjective(c, {
      title: 'My goal',
      ownerId: c.employeeId,
      keyResults: [krInput()],
    });
    // Another objective owned by someone else
    await createObjective(c, { title: 'Not mine', ownerId: c.managerId });

    const res = await c.t
      .withIdentity({ email: 'employee@acme.test' })
      .query(api.goals.getMyObjectives, {
        organizationId: c.organizationId,
        userId: c.employeeId,
      });
    expect(res).toHaveLength(1);
    expect(res[0]?.title).toBe('My goal');
    expect(res[0]?.keyResultsCount).toBe(1);
  });

  it('returns empty when the user has no objectives', async () => {
    const c = await seed();
    const res = await c.t
      .withIdentity({ email: 'employee@acme.test' })
      .query(api.goals.getMyObjectives, {
        organizationId: c.organizationId,
        userId: c.employeeId,
      });
    expect(res).toEqual([]);
  });
});

// ── getTeamProgress ──────────────────────────────────────────────────────────

describe('goals.getTeamProgress', () => {
  it('computes aggregated progress stats for the period', async () => {
    const c = await seed();
    const activeId = await createObjective(c, { title: 'Active' });
    const completedId = await createObjective(c, { title: 'Completed' });
    const cancelledId = await createObjective(c, { title: 'Canceled' });

    // Patch status and progress directly (createObjective validates its args).
    await c.t.run(async (ctx) => {
      await ctx.db.patch(activeId, { progress: 80 });
      await ctx.db.patch(completedId, { status: 'completed', progress: 100 });
      await ctx.db.patch(cancelledId, { status: 'cancelled' });
    });

    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.goals.getTeamProgress, {
        organizationId: c.organizationId,
        periodYear: 2026,
      }),
    );
    expect(res.total).toBe(3);
    expect(res.active).toBe(2); // active + completed
    expect(res.avgProgress).toBe(90); // (80 + 100) / 2
    expect(res.onTrack).toBe(2);
    expect(res.atRisk).toBe(0);
    expect(res.behind).toBe(0);
    expect(res.completed).toBe(1);
  });

  it('filters by periodType when provided', async () => {
    const c = await seed();
    await createObjective(c, { title: 'Q1 objective', periodType: 'Q1' });
    await createObjective(c, { title: 'Q2 objective', periodType: 'Q2' });

    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.goals.getTeamProgress, {
        organizationId: c.organizationId,
        periodYear: 2026,
        periodType: 'Q2',
      }),
    );
    expect(res.total).toBe(1);
    expect(res.byLevel.individual).toBe(0);
  });
});

// ── getCheckinHistory ────────────────────────────────────────────────────────

describe('goals.getCheckinHistory', () => {
  it('returns check-ins sorted newest first, enriched with user name', async () => {
    const c = await seed();
    const objId = await createObjective(c, { keyResults: [krInput()] });
    const krs = await c.t.run(async (ctx) => {
      return await ctx.db
        .query('keyResults')
        .withIndex('by_objective', (q) => q.eq('objectiveId', objId))
        .take(10);
    });
    const krId = krs[0]!._id;

    await c.t.run((ctx) =>
      ctx.runMutation(api.goals.checkin, {
        keyResultId: krId,
        userId: c.employeeId,
        newValue: 50,
        confidence: 'medium',
      }),
    );
    // Fast CI runners can land both check-ins in the same millisecond, which
    // makes the createdAt-desc sort a tie. Age the first one so the expected
    // order is deterministic.
    await c.t.run(async (ctx) => {
      const rows = await ctx.db
        .query('goalCheckins')
        .withIndex('by_kr', (q) => q.eq('keyResultId', krId))
        .collect();
      for (const row of rows) {
        await ctx.db.patch(row._id, { createdAt: Date.now() - 60000 });
      }
    });
    await c.t.run((ctx) =>
      ctx.runMutation(api.goals.checkin, {
        keyResultId: krId,
        userId: c.employeeId,
        newValue: 75,
        confidence: 'high',
      }),
    );

    const history = await c.t.run((ctx) =>
      ctx.runQuery(api.goals.getCheckinHistory, { keyResultId: krId }),
    );
    expect(history).toHaveLength(2);
    expect(history[0]?.newValue).toBe(75);
    expect(history[1]?.newValue).toBe(50);
    expect(history[0]?.userName).toBe('Employee');
  });

  it('returns empty when no check-ins exist', async () => {
    const c = await seed();
    const objId = await createObjective(c, { keyResults: [krInput()] });
    const krs = await c.t.run(async (ctx) => {
      return await ctx.db
        .query('keyResults')
        .withIndex('by_objective', (q) => q.eq('objectiveId', objId))
        .take(10);
    });
    const history = await c.t.run((ctx) =>
      ctx.runQuery(api.goals.getCheckinHistory, { keyResultId: krs[0]!._id }),
    );
    expect(history).toEqual([]);
  });
});

// ── getRevieweeObjectivesWithReviews ─────────────────────────────────────────

describe('goals.getRevieweeObjectivesWithReviews', () => {
  it('returns active + completed objectives for the user, enriched', async () => {
    const c = await seed();
    const objId = await createObjective(c, {
      title: 'Review goal',
      ownerId: c.employeeId,
      keyResults: [krInput()],
    });
    const cancelledId = await createObjective(c, {
      title: 'Cancelled',
      ownerId: c.employeeId,
    });
    await c.t.run(async (ctx) => {
      await ctx.db.patch(objId, { progress: 60 });
      await ctx.db.patch(cancelledId, { status: 'cancelled' });
    });

    const res = await c.t
      .withIdentity({ email: 'manager@acme.test' })
      .query(api.goals.getRevieweeObjectivesWithReviews, {
        organizationId: c.organizationId,
        userId: c.employeeId,
      });
    expect(res).toHaveLength(1);
    expect(res[0]?.title).toBe('Review goal');
    expect(res[0]?.keyResultsCount).toBe(1);
    expect(res[0]?.latestReview).toBeNull();
  });

  it('filters by periodStart / periodEnd', async () => {
    const c = await seed();
    await createObjective(c, {
      title: 'In range',
      ownerId: c.employeeId,
      periodStart: 1_800_000_000_000,
      periodEnd: 1_800_000_000_000 + 90 * 86400_000,
    });
    await createObjective(c, {
      title: 'Out of range',
      ownerId: c.employeeId,
      periodStart: 1_000_000_000_000,
      periodEnd: 1_000_000_000_000 + 90 * 86400_000,
    });

    const res = await c.t
      .withIdentity({ email: 'manager@acme.test' })
      .query(api.goals.getRevieweeObjectivesWithReviews, {
        organizationId: c.organizationId,
        userId: c.employeeId,
        periodStart: 1_800_000_000_000,
      });
    expect(res).toHaveLength(1);
    expect(res[0]?.title).toBe('In range');
  });

  it('sorts active before completed, then by progress desc', async () => {
    const c = await seed();
    const completedId = await createObjective(c, {
      title: 'Completed',
      ownerId: c.employeeId,
    });
    const activeId = await createObjective(c, {
      title: 'Active',
      ownerId: c.employeeId,
    });
    await c.t.run(async (ctx) => {
      await ctx.db.patch(completedId, { status: 'completed', progress: 100 });
      await ctx.db.patch(activeId, { progress: 50 });
    });

    const res = await c.t
      .withIdentity({ email: 'manager@acme.test' })
      .query(api.goals.getRevieweeObjectivesWithReviews, {
        organizationId: c.organizationId,
        userId: c.employeeId,
      });
    expect(res[0]?.title).toBe('Active');
    expect(res[1]?.title).toBe('Completed');
  });
});

// ── weekly check-in reminders ────────────────────────────────────────────────
describe('sendWeeklyCheckinReminders', () => {
  it('notifies KR owners without a recent check-in, once per week', async () => {
    const c = await seed();
    const id = await createObjective(c, { keyResults: [krInput()] });
    const kr = await c.t.run(async (ctx) =>
      ctx.db
        .query('keyResults')
        .withIndex('by_objective', (q) => q.eq('objectiveId', id))
        .first(),
    );

    await c.t.run((ctx) => ctx.runMutation(api.goals.sendWeeklyCheckinReminders, {}));
    const afterFirst = await c.t.run((ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user', (q) => q.eq('userId', c.managerId))
        .collect(),
    );
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]?.type).toBe('okr_checkin_reminder');
    expect(afterFirst[0]?.relatedId).toBe(kr?._id);

    // Second run must not duplicate.
    await c.t.run((ctx) => ctx.runMutation(api.goals.sendWeeklyCheckinReminders, {}));
    const afterSecond = await c.t.run((ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user', (q) => q.eq('userId', c.managerId))
        .collect(),
    );
    expect(afterSecond).toHaveLength(1);
  });

  it('skips KR owners who checked in this week', async () => {
    const c = await seed();
    const id = await createObjective(c, { keyResults: [krInput()] });
    const kr = await c.t.run(async (ctx) =>
      ctx.db
        .query('keyResults')
        .withIndex('by_objective', (q) => q.eq('objectiveId', id))
        .first(),
    );
    await c.t.run((ctx) =>
      ctx.runMutation(api.goals.checkin, {
        keyResultId: kr?._id as Id<'keyResults'>,
        userId: c.managerId,
        newValue: 5,
        confidence: 'high',
      }),
    );

    await c.t.run((ctx) => ctx.runMutation(api.goals.sendWeeklyCheckinReminders, {}));
    const notifications = await c.t.run((ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user', (q) => q.eq('userId', c.managerId))
        .collect(),
    );
    expect(notifications).toHaveLength(0);
  });
});
