/**
 * Integration tests for convex/performance — 360° review cycles, templates,
 * assignments, review submissions, result aggregation, deadline reminders and
 * secured deletion, run against convex-test's in-memory database with the real
 * schema.
 *
 * Covers: createTemplate (default flipping), createCycle (template/default
 * competency resolution), launchCycle (self/manager/peer auto-assignment +
 * guards), addPeerAssignment (duplicate + active-only), submitReview (rating
 * validation, already-submitted/cancelled guards, supervisorRatings mirroring
 * for manager reviews), getMyAssignments (active-cycle filtering), result
 * queries (competency averages, peer anonymity threshold, summary ranking),
 * close/cancel/delete cycle transitions, getEligibleParticipants scoping, the
 * checkDeadlineNotifications cron (incl. 24h dedupe) and secureDeleteCycle
 * (auth + org scoping + audit log).
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './performance.ts': () => import('../../convex/performance'),
  './lib/getAuthCaller.ts': () => import('../../convex/lib/getAuthCaller'),
  './lib/limits.ts': () => import('../../convex/lib/limits'),
  './lib/userProfile.ts': () => import('../../convex/lib/userProfile'),
  './lib/notify.ts': () => import('../../convex/lib/notify'),
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

    const adminId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Admin',
      email: 'admin@acme.test',
      role: 'admin',
      department: 'Eng',
    });
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
    const peerId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Peer',
      email: 'peer@acme.test',
      role: 'employee',
      department: 'Eng',
      supervisorId: managerId,
    });
    const superadminId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Super',
      email: 'super@acme.test',
      role: 'superadmin',
    });

    return { organizationId, adminId, managerId, employeeId, peerId, superadminId };
  });
  return { t, ...ids };
}

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

const COMPETENCIES = [
  { id: 'quality', name: 'Quality of Work', description: 'Accuracy', weight: 40 },
  { id: 'teamwork', name: 'Teamwork', description: 'Collaboration', weight: 30 },
  { id: 'leadership', name: 'Leadership', description: 'Guidance', weight: 30 },
];

function cycleArgs(c: Ctx, overrides: Record<string, unknown> = {}) {
  return {
    organizationId: c.organizationId,
    title: 'Q3 Performance Review',
    description: 'Quarterly',
    type: 'quarterly' as const,
    startDate: now - 7 * DAY,
    endDate: now + 7 * DAY,
    includesSelf: true,
    includesPeer: true,
    includesManager: true,
    includesDirectReport: false,
    createdBy: c.adminId,
    ...overrides,
  };
}

function templateArgs(c: Ctx, overrides: Record<string, unknown> = {}) {
  return {
    organizationId: c.organizationId,
    name: 'Engineering Template',
    description: 'Eng competencies',
    competencies: COMPETENCIES,
    isDefault: true,
    createdBy: c.adminId,
    ...overrides,
  };
}

const RATINGS = [
  { competencyId: 'quality', competencyName: 'Quality of Work', score: 5 },
  { competencyId: 'teamwork', competencyName: 'Teamwork', score: 4 },
  { competencyId: 'leadership', competencyName: 'Leadership', score: 3 },
];

// ── createTemplate ───────────────────────────────────────────────────────────
describe('createTemplate', () => {
  it('creates a template with the given competencies', async () => {
    const c = await seed();
    const id = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createTemplate, templateArgs(c)),
    );
    const tpl = await c.t.run((ctx) => ctx.db.get(id));
    expect(tpl?.name).toBe('Engineering Template');
    expect(tpl?.competencies).toHaveLength(3);
    expect(tpl?.isDefault).toBe(true);
  });

  it('unsets a previous default when a new default is set', async () => {
    const c = await seed();
    const firstId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createTemplate, templateArgs(c)),
    );
    const secondId = await c.t.run((ctx) =>
      ctx.runMutation(
        api.performance.createTemplate,
        templateArgs(c, { name: 'Second', isDefault: true }),
      ),
    );
    const first = await c.t.run((ctx) => ctx.db.get(firstId));
    const second = await c.t.run((ctx) => ctx.db.get(secondId));
    expect(first?.isDefault).toBe(false);
    expect(second?.isDefault).toBe(true);
  });

  it('keeps an existing default untouched when a non-default is created', async () => {
    const c = await seed();
    const firstId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createTemplate, templateArgs(c)),
    );
    const secondId = await c.t.run((ctx) =>
      ctx.runMutation(
        api.performance.createTemplate,
        templateArgs(c, { name: 'Second', isDefault: false }),
      ),
    );
    const first = await c.t.run((ctx) => ctx.db.get(firstId));
    const second = await c.t.run((ctx) => ctx.db.get(secondId));
    expect(first?.isDefault).toBe(true);
    expect(second?.isDefault).toBe(false);
  });

  it('listTemplates returns only templates of the requested org', async () => {
    const c = await seed();
    await c.t.run((ctx) => ctx.runMutation(api.performance.createTemplate, templateArgs(c)));
    const otherOrg = await c.t.run(async (ctx) => {
      const orgId = await ctx.db.insert('organizations', {
        name: 'Other',
        slug: `other-${Math.random().toString(36).slice(2)}`,
        plan: 'starter',
        isActive: true,
        createdBySuperadmin: false,
        employeeLimit: 10,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
      return orgId;
    });
    const list = await c.t.run((ctx) =>
      ctx.runQuery(api.performance.listTemplates, { organizationId: otherOrg }),
    );
    expect(list).toHaveLength(0);
  });
});

// ── createCycle ──────────────────────────────────────────────────────────────
describe('createCycle', () => {
  it('creates a draft cycle with defaults', async () => {
    const c = await seed();
    const id = await c.t.run((ctx) => ctx.runMutation(api.performance.createCycle, cycleArgs(c)));
    const cycle = await c.t.run((ctx) => ctx.db.get(id));
    expect(cycle?.status).toBe('draft');
    expect(cycle?.peerAnonymityThreshold).toBe(2);
    expect(cycle?.showPeerIdentity).toBe(false);
    expect(cycle?.competencies).toHaveLength(5); // DEFAULT_COMPETENCIES
  });

  it('resolves competencies from the referenced template', async () => {
    const c = await seed();
    const templateId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createTemplate, templateArgs(c)),
    );
    const id = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createCycle, cycleArgs(c, { templateId })),
    );
    const cycle = await c.t.run((ctx) => ctx.db.get(id));
    expect(cycle?.competencies).toEqual(COMPETENCIES);
  });

  it('lets the referenced template override inline competencies', async () => {
    const c = await seed();
    const templateId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createTemplate, templateArgs(c)),
    );
    const inline = [{ id: 'custom', name: 'Custom', description: 'X', weight: 100 }];
    const id = await c.t.run((ctx) =>
      ctx.runMutation(
        api.performance.createCycle,
        cycleArgs(c, { templateId, competencies: inline }),
      ),
    );
    const cycle = await c.t.run((ctx) => ctx.db.get(id));
    // template competencies win over inline ones when a templateId is supplied
    expect(cycle?.competencies).toEqual(COMPETENCIES);
  });

  it('applies custom anonymity settings', async () => {
    const c = await seed();
    const id = await c.t.run((ctx) =>
      ctx.runMutation(
        api.performance.createCycle,
        cycleArgs(c, { peerAnonymityThreshold: 3, showPeerIdentity: true }),
      ),
    );
    const cycle = await c.t.run((ctx) => ctx.db.get(id));
    expect(cycle?.peerAnonymityThreshold).toBe(3);
    expect(cycle?.showPeerIdentity).toBe(true);
  });

  it('listCycles filters by status', async () => {
    const c = await seed();
    await c.t.run((ctx) => ctx.runMutation(api.performance.createCycle, cycleArgs(c)));
    const drafts = await c.t.run((ctx) =>
      ctx.runQuery(api.performance.listCycles, {
        organizationId: c.organizationId,
        status: 'draft',
      }),
    );
    const actives = await c.t.run((ctx) =>
      ctx.runQuery(api.performance.listCycles, {
        organizationId: c.organizationId,
        status: 'active',
      }),
    );
    expect(drafts).toHaveLength(1);
    expect(actives).toHaveLength(0);
  });

  it('listCycles returns all cycles when no status is given', async () => {
    const c = await seed();
    await c.t.run((ctx) => ctx.runMutation(api.performance.createCycle, cycleArgs(c)));
    const all = await c.t.run((ctx) =>
      ctx.runQuery(api.performance.listCycles, { organizationId: c.organizationId }),
    );
    expect(all).toHaveLength(1);
  });

  it('getCycleDetails returns null for a missing cycle', async () => {
    const c = await seed();
    const cycleId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createCycle, cycleArgs(c)),
    );
    await c.t.run((ctx) => ctx.runMutation(api.performance.deleteCycle, { cycleId }));
    const res = await c.t.run((ctx) => ctx.runQuery(api.performance.getCycleDetails, { cycleId }));
    expect(res).toBeNull();
  });
});

// ── launchCycle ──────────────────────────────────────────────────────────────
async function createAndLaunch(
  c: Ctx,
  overrides: Record<string, unknown> = {},
  launchOverrides: Record<string, unknown> = {},
) {
  const cycleId = await c.t.run((ctx) =>
    ctx.runMutation(api.performance.createCycle, cycleArgs(c, overrides)),
  );
  await c.t.run((ctx) =>
    ctx.runMutation(api.performance.launchCycle, {
      cycleId,
      launchedBy: c.adminId,
      participants: [c.managerId, c.employeeId, c.peerId],
      peerAssignments: [
        { reviewerId: c.peerId, revieweeId: c.employeeId },
        { reviewerId: c.employeeId, revieweeId: c.peerId },
      ],
      ...launchOverrides,
    } as never),
  );
  return cycleId;
}

describe('launchCycle', () => {
  it('throws for a missing cycle', async () => {
    const c = await seed();
    const cycleId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createCycle, cycleArgs(c)),
    );
    await c.t.run((ctx) => ctx.runMutation(api.performance.deleteCycle, { cycleId }));
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.performance.launchCycle, {
          cycleId,
          launchedBy: c.adminId,
          participants: [],
        }),
      ),
    ).rejects.toThrow('Cycle not found');
  });

  it('throws when the cycle is not in draft', async () => {
    const c = await seed();
    const cycleId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createCycle, cycleArgs(c)),
    );
    await c.t.run((ctx) => ctx.runMutation(api.performance.closeCycle, { cycleId }));
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.performance.launchCycle, {
          cycleId,
          launchedBy: c.adminId,
          participants: [c.employeeId],
        }),
      ),
    ).rejects.toThrow('Cycle must be in draft status to launch');
  });

  it('auto-assigns self, manager and peer reviews', async () => {
    const c = await seed();
    const cycleId = await createAndLaunch(c);
    const assignments = await c.t.run((ctx) =>
      ctx.db
        .query('reviewAssignments')
        .withIndex('by_cycle', (q) => q.eq('cycleId', cycleId))
        .collect(),
    );
    const self = assignments.filter((a) => a.type === 'self');
    const manager = assignments.filter((a) => a.type === 'manager');
    const peer = assignments.filter((a) => a.type === 'peer');
    // self for every participant
    expect(self).toHaveLength(3);
    // manager only for employees with a supervisorId (employeeId, peerId)
    expect(manager).toHaveLength(2);
    expect(manager.every((a) => a.reviewerId === c.managerId)).toBe(true);
    expect(manager.every((a) => a.revieweeId !== c.managerId)).toBe(true);
    // peer from the explicit list
    expect(peer).toHaveLength(2);
    expect(assignments.every((a) => a.status === 'pending')).toBe(true);
    expect(assignments.every((a) => a.dueDate === cycleArgs(c).endDate)).toBe(true);
  });

  it('skips self and manager when the cycle excludes them', async () => {
    const c = await seed();
    const cycleId = await c.t.run((ctx) =>
      ctx.runMutation(
        api.performance.createCycle,
        cycleArgs(c, { includesSelf: false, includesManager: false, includesPeer: true }),
      ),
    );
    await c.t.run((ctx) =>
      ctx.runMutation(api.performance.launchCycle, {
        cycleId,
        launchedBy: c.adminId,
        participants: [c.employeeId],
        peerAssignments: [{ reviewerId: c.peerId, revieweeId: c.employeeId }],
      }),
    );
    const assignments = await c.t.run((ctx) =>
      ctx.db
        .query('reviewAssignments')
        .withIndex('by_cycle', (q) => q.eq('cycleId', cycleId))
        .collect(),
    );
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.type).toBe('peer');
  });

  it('marks the cycle active with launch metadata', async () => {
    const c = await seed();
    const cycleId = await createAndLaunch(c);
    const cycle = await c.t.run((ctx) => ctx.db.get(cycleId));
    expect(cycle?.status).toBe('active');
    expect(cycle?.launchedBy).toBe(c.adminId);
    expect(cycle?.launchedAt).toBeGreaterThan(0);
  });

  it('getCycleDetails reports stats and completion rate', async () => {
    const c = await seed();
    const cycleId = await createAndLaunch(c);
    const details = await c.t.run((ctx) =>
      ctx.runQuery(api.performance.getCycleDetails, { cycleId }),
    );
    expect(details?.stats.total).toBe(7);
    expect(details?.stats.submitted).toBe(0);
    expect(details?.stats.pending).toBe(7);
    expect(details?.completionRate).toBe(0);
    expect(details?.createdByName).toBe('Admin');
  });
});

// ── addPeerAssignment ────────────────────────────────────────────────────────
describe('addPeerAssignment', () => {
  it('throws for a missing cycle', async () => {
    const c = await seed();
    const cycleId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createCycle, cycleArgs(c)),
    );
    await c.t.run((ctx) => ctx.runMutation(api.performance.deleteCycle, { cycleId }));
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.performance.addPeerAssignment, {
          cycleId,
          reviewerId: c.peerId,
          revieweeId: c.employeeId,
        }),
      ),
    ).rejects.toThrow('Cycle not found');
  });

  it('throws when the cycle is not active', async () => {
    const c = await seed();
    const cycleId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createCycle, cycleArgs(c)),
    );
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.performance.addPeerAssignment, {
          cycleId,
          reviewerId: c.peerId,
          revieweeId: c.employeeId,
        }),
      ),
    ).rejects.toThrow('Cycle is not active');
  });

  it('adds a peer assignment to an active cycle', async () => {
    const c = await seed();
    const cycleId = await createAndLaunch(c, {}, { peerAssignments: [] });
    const id = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.addPeerAssignment, {
        cycleId,
        reviewerId: c.peerId,
        revieweeId: c.employeeId,
      }),
    );
    const a = await c.t.run((ctx) => ctx.db.get(id));
    expect(a?.type).toBe('peer');
    expect(a?.status).toBe('pending');
  });

  it('rejects duplicate peer assignments', async () => {
    const c = await seed();
    const cycleId = await createAndLaunch(c, {}, { peerAssignments: [] });
    await c.t.run((ctx) =>
      ctx.runMutation(api.performance.addPeerAssignment, {
        cycleId,
        reviewerId: c.peerId,
        revieweeId: c.employeeId,
      }),
    );
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.performance.addPeerAssignment, {
          cycleId,
          reviewerId: c.peerId,
          revieweeId: c.employeeId,
        }),
      ),
    ).rejects.toThrow('Assignment already exists');
  });
});

// ── submitReview ─────────────────────────────────────────────────────────────
describe('submitReview', () => {
  async function selfAssignment(c: Ctx) {
    const cycleId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createCycle, cycleArgs(c, { includesPeer: false })),
    );
    await c.t.run((ctx) =>
      ctx.runMutation(api.performance.launchCycle, {
        cycleId,
        launchedBy: c.adminId,
        participants: [c.employeeId],
        peerAssignments: [],
      }),
    );
    const assignments = await c.t.run((ctx) =>
      ctx.db
        .query('reviewAssignments')
        .withIndex('by_cycle', (q) => q.eq('cycleId', cycleId))
        .collect(),
    );
    return { cycleId, assignmentId: assignments[0]!._id };
  }

  it('throws for a missing assignment', async () => {
    const c = await seed();
    const cycleId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createCycle, cycleArgs(c)),
    );
    const assignmentId = await c.t.run(async (ctx) => {
      return ctx.db.insert('reviewAssignments', {
        organizationId: c.organizationId,
        cycleId,
        reviewerId: c.employeeId,
        revieweeId: c.employeeId,
        type: 'self',
        status: 'pending',
        dueDate: now + 7 * DAY,
        createdAt: Date.now(),
      });
    });
    await c.t.run(async (ctx) => {
      await ctx.db.delete(assignmentId);
    });
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.performance.submitReview, {
          assignmentId,
          ratings: RATINGS,
        }),
      ),
    ).rejects.toThrow('Assignment not found');
  });

  it('throws when the cycle is not active', async () => {
    const c = await seed();
    const cycleId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createCycle, cycleArgs(c)),
    );
    const assignmentId = await c.t.run(async (ctx) => {
      return ctx.db.insert('reviewAssignments', {
        organizationId: c.organizationId,
        cycleId,
        reviewerId: c.employeeId,
        revieweeId: c.employeeId,
        type: 'self',
        status: 'pending',
        dueDate: now + 7 * DAY,
        createdAt: Date.now(),
      });
    });
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.performance.submitReview, { assignmentId, ratings: RATINGS }),
      ),
    ).rejects.toThrow('Cycle is not active');
  });

  it('rejects ratings outside 1–5', async () => {
    const c = await seed();
    const { assignmentId } = await selfAssignment(c);
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.performance.submitReview, {
          assignmentId,
          ratings: [{ competencyId: 'quality', competencyName: 'Quality', score: 9 }],
        }),
      ),
    ).rejects.toThrow('All ratings must be between 1 and 5');
  });

  it('rejects a second submission', async () => {
    const c = await seed();
    const { assignmentId } = await selfAssignment(c);
    await c.t.run((ctx) =>
      ctx.runMutation(api.performance.submitReview, { assignmentId, ratings: RATINGS }),
    );
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.performance.submitReview, { assignmentId, ratings: RATINGS }),
      ),
    ).rejects.toThrow('Already submitted');
  });

  it('creates a response with averaged score and per-competency ratings', async () => {
    const c = await seed();
    const { assignmentId } = await selfAssignment(c);
    const responseId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.submitReview, { assignmentId, ratings: RATINGS }),
    );
    const response = await c.t.run((ctx) => ctx.db.get(responseId));
    expect(response?.overallScore).toBe(4); // (5+4+3)/3
    expect(response?.type).toBe('self');
    expect(response?.submittedAt).toBeGreaterThan(0);
    const ratings = await c.t.run((ctx) =>
      ctx.db
        .query('reviewRatings')
        .withIndex('by_response', (q) => q.eq('responseId', responseId))
        .collect(),
    );
    expect(ratings).toHaveLength(3);
    const assignment = await c.t.run((ctx) => ctx.db.get(assignmentId));
    expect(assignment?.status).toBe('submitted');
    expect(assignment?.submittedAt).toBeGreaterThan(0);
  });

  it('mirrors manager reviews into supervisorRatings', async () => {
    const c = await seed();
    const cycleId = await createAndLaunch(c);
    const managerAssignments = await c.t.run((ctx) =>
      ctx.db
        .query('reviewAssignments')
        .withIndex('by_cycle', (q) => q.eq('cycleId', cycleId))
        .collect(),
    );
    const managerAss = managerAssignments.find(
      (a) => a.type === 'manager' && a.revieweeId === c.employeeId,
    )!;
    await c.t.run((ctx) =>
      ctx.runMutation(api.performance.submitReview, {
        assignmentId: managerAss._id,
        ratings: RATINGS,
        strengths: 'Great work',
        improvements: 'Communicate more',
        generalComments: 'Keep it up',
      }),
    );
    const ratings = await c.t.run((ctx) =>
      ctx.db
        .query('supervisorRatings')
        .withIndex('by_employee', (q) => q.eq('employeeId', c.employeeId))
        .collect(),
    );
    expect(ratings).toHaveLength(1);
    expect(ratings[0]?.supervisorId).toBe(c.managerId);
    expect(ratings[0]?.overallRating).toBe(4);
    expect(ratings[0]?.qualityOfWork).toBe(5);
    expect(ratings[0]?.teamwork).toBe(4);
    expect(ratings[0]?.strengths).toBe('Great work');
    expect(ratings[0]?.ratingPeriod).toMatch(/^\d{4}-\d{2}$/);
  });

  it('uses fallback score 3 for competencies missing from the rating map', async () => {
    const c = await seed();
    const cycleId = await createAndLaunch(c);
    const managerAssignments = await c.t.run((ctx) =>
      ctx.db
        .query('reviewAssignments')
        .withIndex('by_cycle', (q) => q.eq('cycleId', cycleId))
        .collect(),
    );
    const managerAss = managerAssignments.find(
      (a) => a.type === 'manager' && a.revieweeId === c.employeeId,
    )!;
    await c.t.run((ctx) =>
      ctx.runMutation(api.performance.submitReview, {
        assignmentId: managerAss._id,
        ratings: [{ competencyId: 'quality', competencyName: 'Quality', score: 2 }],
      }),
    );
    const ratings = await c.t.run((ctx) =>
      ctx.db
        .query('supervisorRatings')
        .withIndex('by_employee', (q) => q.eq('employeeId', c.employeeId))
        .collect(),
    );
    expect(ratings[0]?.qualityOfWork).toBe(2);
    expect(ratings[0]?.communication).toBe(3);
  });

  it('rejects submissions on cancelled assignments', async () => {
    const c = await seed();
    const { assignmentId } = await selfAssignment(c);
    await c.t.run(async (ctx) => {
      await ctx.db.patch(assignmentId, { status: 'cancelled' });
    });
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.performance.submitReview, { assignmentId, ratings: RATINGS }),
      ),
    ).rejects.toThrow('Assignment was cancelled');
  });
});

// ── getMyAssignments ─────────────────────────────────────────────────────────
describe('getMyAssignments', () => {
  it('only returns assignments for active cycles', async () => {
    const c = await seed();
    // draft cycle with a manual assignment
    const draftId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createCycle, cycleArgs(c)),
    );
    await c.t.run(async (ctx) => {
      await ctx.db.insert('reviewAssignments', {
        organizationId: c.organizationId,
        cycleId: draftId,
        reviewerId: c.employeeId,
        revieweeId: c.employeeId,
        type: 'self',
        status: 'pending',
        dueDate: now + 7 * DAY,
        createdAt: Date.now(),
      });
    });
    const activeCycleId = await createAndLaunch(c);
    const res = await c.t
      .withIdentity({ email: 'employee@acme.test' })
      .run((ctx) => ctx.runQuery(api.performance.getMyAssignments, { userId: c.employeeId }));
    // employee reviews as reviewer: self (employee→employee) + peer (employee→peer)
    expect(res).toHaveLength(2);
    expect(res.every((a) => a.cycleStatus === 'active')).toBe(true);
    expect(res.every((a) => a.cycleId !== draftId)).toBe(true);
    expect(res[0]?.cycleName).toBe('Q3 Performance Review');
    const reviewees = res.map((a) => a.revieweeName).sort();
    expect(reviewees).toEqual(['Employee', 'Peer']);
  });

  it('filters by assignment status', async () => {
    const c = await seed();
    await createAndLaunch(c);
    const res = await c.t
      .withIdentity({ email: 'employee@acme.test' })
      .run((ctx) =>
        ctx.runQuery(api.performance.getMyAssignments, { userId: c.employeeId, status: 'pending' }),
      );
    expect(res).toHaveLength(2);
    const submitted = await c.t.withIdentity({ email: 'employee@acme.test' }).run((ctx) =>
      ctx.runQuery(api.performance.getMyAssignments, {
        userId: c.employeeId,
        status: 'submitted',
      }),
    );
    expect(submitted).toHaveLength(0);
  });

  it('hides cancelled assignments when no status filter is given', async () => {
    const c = await seed();
    const cycleId = await createAndLaunch(c);
    const assignments = await c.t.run((ctx) =>
      ctx.db
        .query('reviewAssignments')
        .withIndex('by_cycle', (q) => q.eq('cycleId', cycleId))
        .collect(),
    );
    const selfAss = assignments.find((a) => a.type === 'self' && a.revieweeId === c.employeeId)!;
    await c.t.run(async (ctx) => {
      await ctx.db.patch(selfAss._id, { status: 'cancelled' });
    });
    const res = await c.t
      .withIdentity({ email: 'employee@acme.test' })
      .run((ctx) => ctx.runQuery(api.performance.getMyAssignments, { userId: c.employeeId }));
    // only the peer assignment remains — the cancelled self one is hidden
    expect(res).toHaveLength(1);
    expect(res[0]?.type).toBe('peer');
  });
});

// ── Result queries ───────────────────────────────────────────────────────────
describe('getRevieweeResults', () => {
  async function submitAll(c: Ctx) {
    const cycleId = await createAndLaunch(c);
    const assignments = await c.t.run((ctx) =>
      ctx.db
        .query('reviewAssignments')
        .withIndex('by_cycle', (q) => q.eq('cycleId', cycleId))
        .collect(),
    );
    for (const a of assignments) {
      if (a.revieweeId === c.employeeId) {
        await c.t.run((ctx) =>
          ctx.runMutation(api.performance.submitReview, { assignmentId: a._id, ratings: RATINGS }),
        );
      }
    }
    return { cycleId, assignments };
  }

  it('returns null for a missing cycle', async () => {
    const c = await seed();
    const cycleId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createCycle, cycleArgs(c)),
    );
    await c.t.run((ctx) => ctx.runMutation(api.performance.deleteCycle, { cycleId }));
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.performance.getRevieweeResults, {
        cycleId,
        revieweeId: c.employeeId,
      }),
    );
    expect(res).toBeNull();
  });

  it('aggregates overall and per-competency averages', async () => {
    const c = await seed();
    const { cycleId } = await submitAll(c);
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.performance.getRevieweeResults, { cycleId, revieweeId: c.employeeId }),
    );
    // self + manager + 1 peer = 3 responses, all with overallScore 4
    expect(res?.overallScore).toBe(4);
    expect(res?.totalResponses).toBe(3);
    expect(res?.selfReview?.overallScore).toBe(4);
    expect(res?.managerReviews).toHaveLength(1);
    // peer anonymity threshold is 2 → 1 peer review hides details
    expect(res?.peerReviews).toBeNull();
    expect(res?.peerCount).toBe(1);
    expect(res?.peerThreshold).toBe(2);
    const quality = res?.competencyAverages.find((x) => x.id === 'quality');
    expect(quality?.average).toBe(5);
    expect(quality?.count).toBe(3);
  });

  it('includes direct report reviews in the results', async () => {
    const c = await seed();
    const cycleId = await createAndLaunch(c);
    const assignmentId = await c.t.run(async (ctx) => {
      return ctx.db.insert('reviewAssignments', {
        organizationId: c.organizationId,
        cycleId,
        reviewerId: c.peerId,
        revieweeId: c.managerId,
        type: 'direct_report',
        status: 'pending',
        dueDate: now + 7 * DAY,
        createdAt: Date.now(),
      });
    });
    await c.t.run((ctx) =>
      ctx.runMutation(api.performance.submitReview, {
        assignmentId,
        ratings: [{ competencyId: 'quality', competencyName: 'Quality', score: 5 }],
      }),
    );
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.performance.getRevieweeResults, { cycleId, revieweeId: c.managerId }),
    );
    expect(res?.directReportReviews).toHaveLength(1);
    expect(res?.directReportReviews[0]?.overallScore).toBe(5);
  });

  it('reveals peer details once the anonymity threshold is met', async () => {
    const c = await seed();
    const cycleId = await createAndLaunch(
      c,
      {},
      { participants: [c.managerId, c.employeeId, c.peerId] },
    );
    // add a second peer reviewer for employee
    await c.t.run((ctx) =>
      ctx.runMutation(api.performance.addPeerAssignment, {
        cycleId,
        reviewerId: c.managerId,
        revieweeId: c.employeeId,
      }),
    );
    const assignments = await c.t.run((ctx) =>
      ctx.db
        .query('reviewAssignments')
        .withIndex('by_cycle', (q) => q.eq('cycleId', cycleId))
        .collect(),
    );
    for (const a of assignments) {
      if (a.revieweeId === c.employeeId) {
        await c.t.run((ctx) =>
          ctx.runMutation(api.performance.submitReview, { assignmentId: a._id, ratings: RATINGS }),
        );
      }
    }
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.performance.getRevieweeResults, { cycleId, revieweeId: c.employeeId }),
    );
    expect(res?.peerCount).toBe(2);
    expect(res?.peerReviews).toHaveLength(2);
  });

  it('returns zeroed averages when no responses exist', async () => {
    const c = await seed();
    const cycleId = await createAndLaunch(c);
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.performance.getRevieweeResults, { cycleId, revieweeId: c.peerId }),
    );
    expect(res?.totalResponses).toBe(0);
    expect(res?.overallScore).toBe(0);
    expect(res?.competencyAverages.every((x) => x.average === 0 && x.count === 0)).toBe(true);
  });
});

describe('getCycleSummary', () => {
  it('returns null for a missing cycle', async () => {
    const c = await seed();
    const cycleId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createCycle, cycleArgs(c)),
    );
    await c.t.run((ctx) => ctx.runMutation(api.performance.deleteCycle, { cycleId }));
    const res = await c.t.run((ctx) => ctx.runQuery(api.performance.getCycleSummary, { cycleId }));
    expect(res).toBeNull();
  });

  it('ranks reviewees by average score and lists review types', async () => {
    const c = await seed();
    const cycleId = await createAndLaunch(c);
    const assignments = await c.t.run((ctx) =>
      ctx.db
        .query('reviewAssignments')
        .withIndex('by_cycle', (q) => q.eq('cycleId', cycleId))
        .collect(),
    );
    for (const a of assignments) {
      // manager gets a high score, employees get RATINGS (4)
      const score = a.revieweeId === c.managerId ? 5 : 4;
      await c.t.run((ctx) =>
        ctx.runMutation(api.performance.submitReview, {
          assignmentId: a._id,
          ratings: [
            { competencyId: 'quality', competencyName: 'Quality', score },
            { competencyId: 'teamwork', competencyName: 'Teamwork', score },
            { competencyId: 'leadership', competencyName: 'Leadership', score },
          ],
        }),
      );
    }
    const res = await c.t.run((ctx) => ctx.runQuery(api.performance.getCycleSummary, { cycleId }));
    expect(res?.summaries).toHaveLength(3);
    // manager (5) ranks first, employees (4) tied after
    expect(res?.summaries[0]?.revieweeId).toBe(c.managerId);
    expect(res?.summaries[0]?.averageScore).toBe(5);
    expect(res?.summaries[0]?.name).toBe('Manager');
    const emp = res?.summaries.find((s) => s.revieweeId === c.employeeId);
    expect(emp?.averageScore).toBe(4);
    expect(emp?.reviewCount).toBe(3);
    expect(emp?.types).toContain('self');
    expect(emp?.types).toContain('manager');
    expect(emp?.types).toContain('peer');
  });
});

// ── Cycle lifecycle transitions ──────────────────────────────────────────────
describe('cycle transitions', () => {
  it('closeCycle cancels pending assignments and completes the cycle', async () => {
    const c = await seed();
    const cycleId = await createAndLaunch(c);
    await c.t.run((ctx) => ctx.runMutation(api.performance.closeCycle, { cycleId }));
    const cycle = await c.t.run((ctx) => ctx.db.get(cycleId));
    expect(cycle?.status).toBe('completed');
    expect(cycle?.closedAt).toBeGreaterThan(0);
    const assignments = await c.t.run((ctx) =>
      ctx.db
        .query('reviewAssignments')
        .withIndex('by_cycle', (q) => q.eq('cycleId', cycleId))
        .collect(),
    );
    expect(assignments.every((a) => a.status === 'cancelled')).toBe(true);
  });

  it('closeCycle keeps submitted assignments untouched', async () => {
    const c = await seed();
    const cycleId = await createAndLaunch(c);
    const assignments = await c.t.run((ctx) =>
      ctx.db
        .query('reviewAssignments')
        .withIndex('by_cycle', (q) => q.eq('cycleId', cycleId))
        .collect(),
    );
    const selfAss = assignments.find((a) => a.type === 'self' && a.revieweeId === c.employeeId)!;
    await c.t.run((ctx) =>
      ctx.runMutation(api.performance.submitReview, {
        assignmentId: selfAss._id,
        ratings: RATINGS,
      }),
    );
    await c.t.run((ctx) => ctx.runMutation(api.performance.closeCycle, { cycleId }));
    const after = await c.t.run((ctx) => ctx.db.get(selfAss._id));
    expect(after?.status).toBe('submitted');
  });

  it('throws for a missing cycle', async () => {
    const c = await seed();
    const cycleId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createCycle, cycleArgs(c)),
    );
    await c.t.run((ctx) => ctx.runMutation(api.performance.deleteCycle, { cycleId }));
    await expect(
      c.t.run((ctx) => ctx.runMutation(api.performance.closeCycle, { cycleId })),
    ).rejects.toThrow('Cycle not found');
  });

  it('cancelCycle leaves submitted reviews and cancels the rest', async () => {
    const c = await seed();
    const cycleId = await createAndLaunch(c);
    const assignments = await c.t.run((ctx) =>
      ctx.db
        .query('reviewAssignments')
        .withIndex('by_cycle', (q) => q.eq('cycleId', cycleId))
        .collect(),
    );
    const selfAss = assignments.find((a) => a.type === 'self' && a.revieweeId === c.employeeId)!;
    await c.t.run((ctx) =>
      ctx.runMutation(api.performance.submitReview, {
        assignmentId: selfAss._id,
        ratings: RATINGS,
      }),
    );
    await c.t.run((ctx) => ctx.runMutation(api.performance.cancelCycle, { cycleId }));
    const cycle = await c.t.run((ctx) => ctx.db.get(cycleId));
    expect(cycle?.status).toBe('cancelled');
    const after = await c.t.run((ctx) => ctx.db.get(selfAss._id));
    expect(after?.status).toBe('submitted');
    const others = await c.t.run((ctx) =>
      ctx.db
        .query('reviewAssignments')
        .withIndex('by_cycle', (q) => q.eq('cycleId', cycleId))
        .collect(),
    );
    expect(others.filter((a) => a._id !== selfAss._id).every((a) => a.status === 'cancelled')).toBe(
      true,
    );
  });

  it('deleteCycle only removes drafts', async () => {
    const c = await seed();
    const draftId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createCycle, cycleArgs(c)),
    );
    await c.t.run((ctx) => ctx.runMutation(api.performance.deleteCycle, { cycleId: draftId }));
    const gone = await c.t.run((ctx) => ctx.db.get(draftId));
    expect(gone).toBeNull();
  });

  it('deleteCycle rejects non-draft cycles', async () => {
    const c = await seed();
    const cycleId = await createAndLaunch(c);
    await expect(
      c.t.run((ctx) => ctx.runMutation(api.performance.deleteCycle, { cycleId })),
    ).rejects.toThrow('Only draft cycles can be deleted');
  });

  it('deleteCycle throws for a missing cycle', async () => {
    const c = await seed();
    const cycleId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createCycle, cycleArgs(c)),
    );
    await c.t.run((ctx) => ctx.runMutation(api.performance.deleteCycle, { cycleId }));
    await expect(
      c.t.run((ctx) => ctx.runMutation(api.performance.deleteCycle, { cycleId })),
    ).rejects.toThrow('Cycle not found');
  });
});

// ── getEligibleParticipants ──────────────────────────────────────────────────
describe('getEligibleParticipants', () => {
  it('excludes superadmins and inactive users', async () => {
    const c = await seed();
    await c.t.run(async (ctx) => {
      await ctx.db.insert('users', {
        organizationId: c.organizationId,
        passwordHash: 'x',
        employeeType: 'staff',
        name: 'Inactive',
        email: 'inactive@acme.test',
        role: 'employee',
        isActive: false,
        isApproved: true,
        travelAllowance: 0,
        paidLeaveBalance: 10,
        sickLeaveBalance: 5,
        familyLeaveBalance: 5,
        dayOffBalance: 4,
        createdAt: Date.now(),
      } as never);
    });
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.performance.getEligibleParticipants, { organizationId: c.organizationId }),
    );
    const names = res.map((u) => u.name);
    expect(names).not.toContain('Inactive');
    expect(names).not.toContain('Super');
    expect(names).toContain('Employee');
    const emp = res.find((u) => u.name === 'Employee');
    expect(emp?.supervisorId).toBe(c.managerId);
    expect(emp?.department).toBe('Eng');
  });
});

// ── checkDeadlineNotifications (cron) ────────────────────────────────────────
describe('checkDeadlineNotifications', () => {
  async function seedUrgentCycle(c: Ctx) {
    const cycleId = await c.t.run((ctx) =>
      ctx.runMutation(
        api.performance.createCycle,
        cycleArgs(c, { endDate: now + 2 * DAY, includesSelf: false, includesManager: true }),
      ),
    );
    await c.t.run((ctx) =>
      ctx.runMutation(api.performance.launchCycle, {
        cycleId,
        launchedBy: c.adminId,
        participants: [c.employeeId],
        peerAssignments: [],
      }),
    );
    return cycleId;
  }

  it('notifies reviewers about pending assignments near the deadline', async () => {
    const c = await seed();
    await seedUrgentCycle(c);
    await c.t.run((ctx) =>
      ctx.runMutation(api.performance.checkDeadlineNotifications, {} as never),
    );
    const notifications = await c.t.run((ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user', (q) => q.eq('userId', c.managerId))
        .collect(),
    );
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.type).toBe('review_deadline');
    expect(notifications[0]?.title).toMatch(/Review deadline in 2 days/);
    expect(notifications[0]?.isRead).toBe(false);
    expect(notifications[0]?.relatedId).toBeTruthy();
  });

  it('skips cycles whose deadline is further away than 3 days', async () => {
    const c = await seed();
    const cycleId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createCycle, cycleArgs(c)),
    );
    await c.t.run((ctx) =>
      ctx.runMutation(api.performance.launchCycle, {
        cycleId,
        launchedBy: c.adminId,
        participants: [c.employeeId],
        peerAssignments: [],
      }),
    );
    await c.t.run((ctx) =>
      ctx.runMutation(api.performance.checkDeadlineNotifications, {} as never),
    );
    const all = await c.t.run((ctx) => ctx.db.query('notifications').collect());
    expect(all).toHaveLength(0);
  });

  it('does not duplicate reminders within 24 hours', async () => {
    const c = await seed();
    await seedUrgentCycle(c);
    await c.t.run((ctx) =>
      ctx.runMutation(api.performance.checkDeadlineNotifications, {} as never),
    );
    await c.t.run((ctx) =>
      ctx.runMutation(api.performance.checkDeadlineNotifications, {} as never),
    );
    const notifications = await c.t.run((ctx) => ctx.db.query('notifications').collect());
    expect(notifications).toHaveLength(1);
  });
});

// ── secureDeleteCycle ────────────────────────────────────────────────────────
describe('secureDeleteCycle', () => {
  it('throws for unauthenticated callers', async () => {
    const c = await seed();
    const cycleId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createCycle, cycleArgs(c)),
    );
    await expect(
      c.t.run((ctx) => ctx.runMutation(api.performance.secureDeleteCycle, { cycleId })),
    ).rejects.toThrow('Not authenticated');
  });

  it('throws for a missing cycle', async () => {
    const c = await seed();
    const cycleId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createCycle, cycleArgs(c)),
    );
    await c.t.run((ctx) => ctx.runMutation(api.performance.deleteCycle, { cycleId }));
    await expect(
      c.t.withIdentity({ email: 'admin@acme.test' }).mutation(api.performance.secureDeleteCycle, {
        cycleId,
      }),
    ).rejects.toThrow('Review cycle not found');
  });

  it('blocks users from other organizations', async () => {
    const c = await seed();
    const cycleId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createCycle, cycleArgs(c)),
    );
    await c.t.run(async (ctx) => {
      const org2 = await ctx.db.insert('organizations', {
        name: 'Other',
        slug: `other-${Math.random().toString(36).slice(2)}`,
        plan: 'starter',
        isActive: true,
        createdBySuperadmin: false,
        employeeLimit: 10,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
      await ctx.db.insert('users', {
        organizationId: org2,
        passwordHash: 'x',
        employeeType: 'staff',
        name: 'Intruder',
        email: 'intruder@other.test',
        role: 'admin',
        isActive: true,
        isApproved: true,
        travelAllowance: 0,
        paidLeaveBalance: 10,
        sickLeaveBalance: 5,
        familyLeaveBalance: 5,
        dayOffBalance: 4,
        createdAt: Date.now(),
      } as never);
    });
    await expect(
      c.t
        .withIdentity({ email: 'intruder@other.test' })
        .mutation(api.performance.secureDeleteCycle, {
          cycleId,
        }),
    ).rejects.toThrow('Access denied');
  });

  it('lets a same-org admin delete and writes an audit log', async () => {
    const c = await seed();
    const cycleId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createCycle, cycleArgs(c)),
    );
    await c.t
      .withIdentity({ email: 'admin@acme.test' })
      .mutation(api.performance.secureDeleteCycle, { cycleId });
    const gone = await c.t.run((ctx) => ctx.db.get(cycleId));
    expect(gone).toBeNull();
    const logs = await c.t.run((ctx) => ctx.db.query('auditLogs').collect());
    expect(logs).toHaveLength(1);
    expect(logs[0]?.action).toBe('review_cycle_deleted');
    expect(logs[0]?.userId).toBe(c.adminId);
    expect(JSON.parse(logs[0]?.details ?? '{}')).toEqual({ name: 'Q3 Performance Review' });
  });

  it('lets a superadmin delete across organizations', async () => {
    const c = await seed();
    const cycleId = await c.t.run((ctx) =>
      ctx.runMutation(api.performance.createCycle, cycleArgs(c)),
    );
    await c.t
      .withIdentity({ email: 'super@acme.test' })
      .mutation(api.performance.secureDeleteCycle, { cycleId });
    const gone = await c.t.run((ctx) => ctx.db.get(cycleId));
    expect(gone).toBeNull();
  });
});
