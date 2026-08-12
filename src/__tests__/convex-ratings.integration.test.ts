/**
 * Integration tests for who may rate whom.
 *
 * Before: the queue listed the whole organization regardless of who managed
 * whom; `role === 'admin'` made somebody unrateable by anyone, so a CEO could
 * not rate their own HR admin (equal rank again); and the authorization check
 * let `caller._id === employeeId` through, so anyone could rate themselves 5/5
 * and collect the review points that buy vouchers.
 *
 * Now: a manager rates their own subtree, HR/admins rate anyone in the
 * organization, the head of the organization is rated by nobody, and nobody
 * rates themselves.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './supervisorRatings.ts': () => import('../../convex/supervisorRatings'),
  './lib/auth.ts': () => import('../../convex/lib/auth'),
  './lib/capabilities.ts': () => import('../../convex/lib/capabilities'),
  './lib/reportingLine.ts': () => import('../../convex/lib/reportingLine'),
  './lib/userProfile.ts': () => import('../../convex/lib/userProfile'),
  './lib/getAuthCaller.ts': () => import('../../convex/lib/getAuthCaller'),
  './lib/points.ts': () => import('../../convex/lib/points'),
  './lib/limits.ts': () => import('../../convex/lib/limits'),
} as unknown as Record<string, () => Promise<unknown>>;

type Ctx = Awaited<ReturnType<typeof seed>>;

async function seed() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Profix',
      slug: `profix-${Math.random().toString(36).slice(2)}`,
      plan: 'professional',
      isActive: true,
      createdBySuperadmin: false,
      employeeLimit: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);

    const base = {
      organizationId,
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

    const tigranId = await ctx.db.insert('users', {
      ...base,
      name: 'Tigran',
      email: 'tigran@profix.test',
      role: 'admin',
    });
    const karineId = await ctx.db.insert('users', {
      ...base,
      name: 'Karine',
      email: 'karine@profix.test',
      role: 'admin',
      supervisorId: tigranId,
    });
    const leadId = await ctx.db.insert('users', {
      ...base,
      name: 'Lead',
      email: 'lead@profix.test',
      role: 'supervisor',
      supervisorId: tigranId,
    });
    const annaId = await ctx.db.insert('users', {
      ...base,
      name: 'Anna',
      email: 'anna@profix.test',
      role: 'employee',
      supervisorId: leadId,
    });
    const borisId = await ctx.db.insert('users', {
      ...base,
      name: 'Boris',
      email: 'boris@profix.test',
      role: 'employee',
      supervisorId: karineId,
    });

    await ctx.db.patch(organizationId, { headUserId: tigranId });

    return { organizationId, tigranId, karineId, leadId, annaId, borisId };
  });

  return { t, ...ids };
}

const as = (c: Ctx, email: string) => c.t.withIdentity({ email });

const scores = {
  qualityOfWork: 5,
  efficiency: 5,
  teamwork: 5,
  initiative: 5,
  communication: 5,
  reliability: 5,
};

function rate(c: Ctx, email: string, raterId: Id<'users'>, employeeId: Id<'users'>) {
  return as(c, email).mutation(api.supervisorRatings.createRating, {
    employeeId,
    supervisorId: raterId,
    ...scores,
  });
}

describe('createRating', () => {
  it('lets HR rate anyone in the organization, chain or not', async () => {
    const c = await seed();
    // Anna reports to Lead, not to Karine — HR authority is org-wide.
    await rate(c, 'karine@profix.test', c.karineId, c.annaId);

    const ratings = await c.t.run((ctx) => ctx.db.query('supervisorRatings').collect());
    expect(ratings).toHaveLength(1);
    expect(ratings[0]!.supervisorId).toBe(c.karineId);
  });

  it('lets the CEO rate HR, who reports to him', async () => {
    const c = await seed();
    await rate(c, 'tigran@profix.test', c.tigranId, c.karineId);

    const ratings = await c.t.run((ctx) => ctx.db.query('supervisorRatings').collect());
    expect(ratings[0]!.employeeId).toBe(c.karineId);
  });

  it('rates nobody above: the head of the organization is not rated', async () => {
    const c = await seed();
    await expect(rate(c, 'karine@profix.test', c.karineId, c.tigranId)).rejects.toThrow(
      'head of the organization is not rated',
    );
  });

  it('lets a manager rate their own report', async () => {
    const c = await seed();
    await rate(c, 'lead@profix.test', c.leadId, c.annaId);
    const ratings = await c.t.run((ctx) => ctx.db.query('supervisorRatings').collect());
    expect(ratings).toHaveLength(1);
  });

  it('refuses a manager rating outside their subtree', async () => {
    const c = await seed();
    await expect(rate(c, 'lead@profix.test', c.leadId, c.borisId)).rejects.toThrow(
      'reporting line',
    );
  });

  it('refuses self-rating — it also paid out review points', async () => {
    const c = await seed();
    await expect(rate(c, 'anna@profix.test', c.annaId, c.annaId)).rejects.toThrow(
      'cannot rate yourself',
    );

    const points = await c.t.run((ctx) => ctx.db.query('pointTransactions').collect());
    expect(points).toHaveLength(0);
  });

  it('refuses an employee rating a colleague', async () => {
    const c = await seed();
    await expect(rate(c, 'anna@profix.test', c.annaId, c.borisId)).rejects.toThrow(
      'Not authorized to rate',
    );
  });

  it('refuses an unauthenticated caller', async () => {
    const c = await seed();
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.supervisorRatings.createRating, {
          employeeId: c.annaId,
          supervisorId: c.karineId,
          ...scores,
        }),
      ),
    ).rejects.toThrow('Not authenticated');
  });

  it('refuses a rater from another organization', async () => {
    const c = await seed();
    const outsiderId = await c.t.run(async (ctx) => {
      const otherOrgId = await ctx.db.insert('organizations', {
        name: 'Other',
        slug: `other-${Math.random().toString(36).slice(2)}`,
        plan: 'professional',
        isActive: true,
        createdBySuperadmin: false,
        employeeLimit: 10,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
      return ctx.db.insert('users', {
        organizationId: otherOrgId,
        passwordHash: 'x',
        employeeType: 'staff',
        name: 'Outsider',
        email: 'outsider@other.test',
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

    await expect(rate(c, 'outsider@other.test', outsiderId, c.annaId)).rejects.toThrow(
      'cross-organization',
    );
  });

  it('refuses rating an inactive employee', async () => {
    const c = await seed();
    await c.t.run((ctx) => ctx.db.patch(c.annaId, { isActive: false }));

    await expect(rate(c, 'karine@profix.test', c.karineId, c.annaId)).rejects.toThrow(
      'inactive employees',
    );
  });

  it('refuses rating the platform superadmin', async () => {
    const c = await seed();
    await c.t.run((ctx) => ctx.db.patch(c.annaId, { role: 'superadmin' }));

    await expect(rate(c, 'karine@profix.test', c.karineId, c.annaId)).rejects.toThrow(
      'platform superadmin is not rated',
    );
  });

  it('still refuses attributing a rating to somebody else', async () => {
    const c = await seed();
    await expect(
      as(c, 'karine@profix.test').mutation(api.supervisorRatings.createRating, {
        employeeId: c.annaId,
        supervisorId: c.tigranId,
        ...scores,
      }),
    ).rejects.toThrow('must match the authenticated user');
  });
});

describe('getEmployeesNeedingRating', () => {
  const namesOf = (rows: Array<{ employee: { name: string } }>) =>
    rows.map((r) => r.employee.name).sort();

  it('gives HR everyone except themselves and the CEO', async () => {
    const c = await seed();
    const rows = (await as(c, 'karine@profix.test').query(
      api.supervisorRatings.getEmployeesNeedingRating,
      {},
    )) as Array<{ employee: { name: string } }>;

    expect(namesOf(rows)).toEqual(['Anna', 'Boris', 'Lead']);
  });

  it('gives the CEO everyone below him, HR included', async () => {
    const c = await seed();
    const rows = (await as(c, 'tigran@profix.test').query(
      api.supervisorRatings.getEmployeesNeedingRating,
      {},
    )) as Array<{ employee: { name: string } }>;

    expect(namesOf(rows)).toEqual(['Anna', 'Boris', 'Karine', 'Lead']);
  });

  it('gives a manager only their own subtree', async () => {
    const c = await seed();
    const rows = (await as(c, 'lead@profix.test').query(
      api.supervisorRatings.getEmployeesNeedingRating,
      {},
    )) as Array<{ employee: { name: string } }>;

    expect(namesOf(rows)).toEqual(['Anna']);
  });

  it('gives an employee nothing', async () => {
    const c = await seed();
    const rows = await as(c, 'anna@profix.test').query(
      api.supervisorRatings.getEmployeesNeedingRating,
      {},
    );
    expect(rows).toEqual([]);
  });

  it('drops somebody once they have been rated this period', async () => {
    const c = await seed();
    await rate(c, 'lead@profix.test', c.leadId, c.annaId);

    const rows = (await as(c, 'lead@profix.test').query(
      api.supervisorRatings.getEmployeesNeedingRating,
      {},
    )) as unknown[];
    expect(rows).toEqual([]);
  });
});

// ── What the profile page asks before drawing the Rate button ───────────────
// The button used to be decided in the client with `employee.role !== 'admin'`,
// so HR's own profile was unrateable and the CEO had no way to rate them.
describe('getRatingEligibility', () => {
  const ask = (c: Ctx, email: string, employeeId: Id<'users'>) =>
    as(c, email).query(api.supervisorRatings.getRatingEligibility, { employeeId }) as Promise<{
      allowed: boolean;
      reason: string | null;
    }>;

  it('allows the CEO to rate HR', async () => {
    const c = await seed();
    expect(await ask(c, 'tigran@profix.test', c.karineId)).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it('allows HR to rate anyone in the organization', async () => {
    const c = await seed();
    expect((await ask(c, 'karine@profix.test', c.annaId)).allowed).toBe(true);
  });

  it('refuses rating the head of the organization', async () => {
    const c = await seed();
    const verdict = await ask(c, 'karine@profix.test', c.tigranId);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('head of the organization is not rated');
  });

  it('refuses a manager outside their subtree', async () => {
    const c = await seed();
    const verdict = await ask(c, 'lead@profix.test', c.borisId);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('reporting line');
  });

  it('refuses self-rating', async () => {
    const c = await seed();
    const verdict = await ask(c, 'anna@profix.test', c.annaId);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('cannot rate yourself');
  });

  it('refuses an employee rating a colleague', async () => {
    const c = await seed();
    expect((await ask(c, 'anna@profix.test', c.borisId)).allowed).toBe(false);
  });

  it('refuses an unauthenticated caller', async () => {
    const c = await seed();
    const verdict = await c.t.run((ctx) =>
      ctx.runQuery(api.supervisorRatings.getRatingEligibility, { employeeId: c.annaId }),
    );
    expect(verdict).toEqual({ allowed: false, reason: 'Not authenticated' });
  });
});
