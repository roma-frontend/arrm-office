/**
 * Integration tests for convex/subscriptions — Stripe subscription upsert and
 * status sync, user/org linking, lookups, contact inquiries and the
 * superadmin-only listing, run against convex-test's in-memory database with
 * the real schema.
 *
 * Covers: upsertSubscription (insert + update + org plan sync), status
 * transitions, linkSubscriptionToUser, getByCustomer / getSubscriptionByEmail /
 * getSubscriptionByUserId / getSubscriptionForContext (org-first, email
 * fallback, org-plan fallback), saveContactInquiry / listInquiries, and
 * listAll superadmin gating.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './subscriptions.ts': () => import('../../convex/subscriptions'),
  './lib/auth.ts': () => import('../../convex/lib/auth'),
  './lib/limits.ts': () => import('../../convex/lib/limits'),
} as unknown as Record<string, () => Promise<unknown>>;

type Ctx = Awaited<ReturnType<typeof seed>>;

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Acme',
      slug: `acme-${Math.random().toString(36).slice(2)}`,
      plan: 'starter',
      isActive: true,
      createdBySuperadmin: false,
      employeeLimit: 10,
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
    });
    const employeeId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Employee',
      email: 'employee@acme.test',
      role: 'employee',
    });
    const superadminId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Super',
      email: 'super@acme.test',
      role: 'superadmin',
    });

    return { organizationId, adminId, employeeId, superadminId };
  });
  return { t, ...ids };
}

const asSuper = (c: Ctx) => c.t.withIdentity({ email: 'super@acme.test' });

const subArgs = (c: Ctx, overrides: Record<string, unknown> = {}) => ({
  organizationId: c.organizationId,
  stripeCustomerId: 'cus_123',
  stripeSubscriptionId: 'sub_123',
  stripeSessionId: 'cs_test_1',
  plan: 'professional' as const,
  status: 'active' as const,
  email: 'billing@acme.test',
  currentPeriodStart: 1_700_000_000_000,
  currentPeriodEnd: 1_700_086_400_000,
  cancelAtPeriodEnd: false,
  ...overrides,
});

// ── upsertSubscription ───────────────────────────────────────────────────────
describe('upsertSubscription', () => {
  it('inserts a new subscription row with timestamps', async () => {
    const c = await seed();
    const id = await c.t.run((ctx) =>
      ctx.runMutation(api.subscriptions.upsertSubscription, subArgs(c)),
    );

    await c.t.run(async (ctx) => {
      const sub = await ctx.db.get(id as Id<'subscriptions'>);
      expect(sub?.stripeSubscriptionId).toBe('sub_123');
      expect(sub?.plan).toBe('professional');
      expect(sub?.status).toBe('active');
      expect(sub?.createdAt).toBeGreaterThan(0);
      expect(sub?.updatedAt).toBe(sub?.createdAt);
    });
  });

  it('syncs the organization plan + employee limit for active subscriptions', async () => {
    const c = await seed();
    await c.t.run((ctx) => ctx.runMutation(api.subscriptions.upsertSubscription, subArgs(c)));

    await c.t.run(async (ctx) => {
      const org = await ctx.db.get(c.organizationId);
      expect(org?.plan).toBe('professional');
      expect(org?.employeeLimit).toBe(50);
    });
  });

  it('does not downgrade the org plan for non-active statuses', async () => {
    const c = await seed();
    await c.t.run((ctx) =>
      ctx.runMutation(
        api.subscriptions.upsertSubscription,
        subArgs(c, { status: 'past_due', plan: 'starter' }),
      ),
    );

    await c.t.run(async (ctx) => {
      const org = await ctx.db.get(c.organizationId);
      expect(org?.plan).toBe('starter');
      expect(org?.employeeLimit).toBe(10);
    });
  });

  it('updates an existing subscription by stripe id instead of duplicating', async () => {
    const c = await seed();
    const first = await c.t.run((ctx) =>
      ctx.runMutation(api.subscriptions.upsertSubscription, subArgs(c)),
    );
    const second = await c.t.run((ctx) =>
      ctx.runMutation(
        api.subscriptions.upsertSubscription,
        subArgs(c, { plan: 'enterprise', status: 'trialing' }),
      ),
    );

    expect(second).toBe(first);
    await c.t.run(async (ctx) => {
      const subs = await ctx.db.query('subscriptions').collect();
      expect(subs).toHaveLength(1);
      expect(subs[0]?.plan).toBe('enterprise');
      expect(subs[0]?.status).toBe('trialing');
    });
  });
});

// ── updateSubscriptionStatus ─────────────────────────────────────────────────
describe('updateSubscriptionStatus', () => {
  it('returns null for an unknown subscription', async () => {
    const c = await seed();
    const res = await c.t.run((ctx) =>
      ctx.runMutation(api.subscriptions.updateSubscriptionStatus, {
        stripeSubscriptionId: 'sub_missing',
        status: 'canceled',
        cancelAtPeriodEnd: true,
      }),
    );
    expect(res).toBeNull();
  });

  it('patches status and period fields', async () => {
    const c = await seed();
    const id = await c.t.run((ctx) =>
      ctx.runMutation(api.subscriptions.upsertSubscription, subArgs(c)),
    );
    const res = await c.t.run((ctx) =>
      ctx.runMutation(api.subscriptions.updateSubscriptionStatus, {
        stripeSubscriptionId: 'sub_123',
        status: 'canceled',
        cancelAtPeriodEnd: true,
        currentPeriodStart: 111,
        currentPeriodEnd: 222,
      }),
    );

    expect(res).toBe(id);
    await c.t.run(async (ctx) => {
      const sub = await ctx.db.get(id as Id<'subscriptions'>);
      expect(sub?.status).toBe('canceled');
      expect(sub?.cancelAtPeriodEnd).toBe(true);
      expect(sub?.currentPeriodStart).toBe(111);
      expect(sub?.currentPeriodEnd).toBe(222);
    });
  });
});

// ── lookups ──────────────────────────────────────────────────────────────────
describe('subscription lookups', () => {
  it('getByCustomer finds by stripe customer id', async () => {
    const c = await seed();
    await c.t.run((ctx) => ctx.runMutation(api.subscriptions.upsertSubscription, subArgs(c)));
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.subscriptions.getByCustomer, { stripeCustomerId: 'cus_123' }),
    );
    expect(res?.stripeSubscriptionId).toBe('sub_123');
  });

  it('getByCustomer returns null for an unknown customer', async () => {
    const c = await seed();
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.subscriptions.getByCustomer, { stripeCustomerId: 'cus_nope' }),
    );
    expect(res).toBeNull();
  });

  it('getSubscriptionByEmail returns the newest match', async () => {
    const c = await seed();
    await c.t.run((ctx) => ctx.runMutation(api.subscriptions.upsertSubscription, subArgs(c)));
    await c.t.run((ctx) =>
      ctx.runMutation(
        api.subscriptions.upsertSubscription,
        subArgs(c, {
          stripeCustomerId: 'cus_456',
          stripeSubscriptionId: 'sub_456',
          email: 'other@x.test',
        }),
      ),
    );
    // Insert another row for the same email with a later createdAt.
    await c.t.run(async (ctx) => {
      await ctx.db.insert('subscriptions', {
        organizationId: c.organizationId,
        stripeCustomerId: 'cus_789',
        stripeSubscriptionId: 'sub_789',
        plan: 'starter',
        status: 'active',
        email: 'billing@acme.test',
        cancelAtPeriodEnd: false,
        createdAt: Date.now() + 1000,
        updatedAt: Date.now() + 1000,
      } as never);
    });

    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.subscriptions.getSubscriptionByEmail, { email: 'billing@acme.test' }),
    );
    expect(res?.stripeSubscriptionId).toBe('sub_789');
  });

  it('getSubscriptionByUserId finds a linked subscription', async () => {
    const c = await seed();
    await c.t.run((ctx) => ctx.runMutation(api.subscriptions.upsertSubscription, subArgs(c)));
    await c.t.run((ctx) =>
      ctx.runMutation(api.subscriptions.linkSubscriptionToUser, {
        email: 'billing@acme.test',
        userId: c.adminId,
      }),
    );
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.subscriptions.getSubscriptionByUserId, { userId: c.adminId }),
    );
    expect(res?.stripeSubscriptionId).toBe('sub_123');
    expect(res?.userId).toBe(c.adminId);
  });
});

// ── linkSubscriptionToUser ───────────────────────────────────────────────────
describe('linkSubscriptionToUser', () => {
  it('links the first unlinked subscription by email', async () => {
    const c = await seed();
    await c.t.run((ctx) => ctx.runMutation(api.subscriptions.upsertSubscription, subArgs(c)));
    const res = await c.t.run((ctx) =>
      ctx.runMutation(api.subscriptions.linkSubscriptionToUser, {
        email: 'billing@acme.test',
        userId: c.adminId,
      }),
    );

    expect(res).not.toBeNull();
    await c.t.run(async (ctx) => {
      const sub = await ctx.db.get(res as Id<'subscriptions'>);
      expect(sub?.userId).toBe(c.adminId);
    });
  });

  it('skips already-linked subscriptions', async () => {
    const c = await seed();
    await c.t.run((ctx) => ctx.runMutation(api.subscriptions.upsertSubscription, subArgs(c)));
    await c.t.run((ctx) =>
      ctx.runMutation(api.subscriptions.linkSubscriptionToUser, {
        email: 'billing@acme.test',
        userId: c.adminId,
      }),
    );
    const res = await c.t.run((ctx) =>
      ctx.runMutation(api.subscriptions.linkSubscriptionToUser, {
        email: 'billing@acme.test',
        userId: c.employeeId,
      }),
    );
    expect(res).toBeNull();
  });

  it('returns null when no subscription matches the email', async () => {
    const c = await seed();
    const res = await c.t.run((ctx) =>
      ctx.runMutation(api.subscriptions.linkSubscriptionToUser, {
        email: 'nobody@acme.test',
        userId: c.adminId,
      }),
    );
    expect(res).toBeNull();
  });
});

// ── getSubscriptionForContext ────────────────────────────────────────────────
describe('getSubscriptionForContext', () => {
  it('prefers the org-linked subscription over the email', async () => {
    const c = await seed();
    await c.t.run((ctx) =>
      ctx.runMutation(
        api.subscriptions.upsertSubscription,
        subArgs(c, { stripeSubscriptionId: 'sub_org' }),
      ),
    );
    await c.t.run((ctx) =>
      ctx.runMutation(
        api.subscriptions.upsertSubscription,
        subArgs(c, {
          organizationId: undefined,
          stripeCustomerId: 'cus_email',
          stripeSubscriptionId: 'sub_email',
          email: 'owner@acme.test',
        }),
      ),
    );

    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.subscriptions.getSubscriptionForContext, {
        organizationId: c.organizationId,
        email: 'owner@acme.test',
      }),
    );
    expect(res?.stripeSubscriptionId).toBe('sub_org');
  });

  it('falls back to the email when no org row exists', async () => {
    const c = await seed();
    await c.t.run((ctx) =>
      ctx.runMutation(
        api.subscriptions.upsertSubscription,
        subArgs(c, {
          organizationId: undefined,
          stripeCustomerId: 'cus_email',
          stripeSubscriptionId: 'sub_email',
          email: 'owner@acme.test',
        }),
      ),
    );

    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.subscriptions.getSubscriptionForContext, {
        organizationId: c.organizationId,
        email: 'owner@acme.test',
      }),
    );
    expect(res?.stripeSubscriptionId).toBe('sub_email');
  });

  it('synthesizes a subscription from the organization plan as a last resort', async () => {
    const c = await seed();
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.subscriptions.getSubscriptionForContext, {
        organizationId: c.organizationId,
        email: 'billing@acme.test',
      }),
    );

    expect(res?.plan).toBe('starter');
    expect(res?.status).toBe('active');
    expect(res?.source).toBe('organization');
    expect(res?.stripeSubscriptionId).toBeNull();
  });

  it('returns null when nothing can be resolved', async () => {
    const c = await seed();
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.subscriptions.getSubscriptionForContext, {}),
    );
    expect(res).toBeNull();
  });
});

// ── contact inquiries ────────────────────────────────────────────────────────
describe('contact inquiries', () => {
  it('saveContactInquiry persists a row with a createdAt', async () => {
    const c = await seed();
    const id = await c.t.run((ctx) =>
      ctx.runMutation(api.subscriptions.saveContactInquiry, {
        name: 'Jane',
        email: 'jane@x.test',
        company: 'X Corp',
        teamSize: '50-200',
        message: 'Hello',
        plan: 'enterprise',
      }),
    );

    await c.t.run(async (ctx) => {
      const inquiry = await ctx.db.get(id as Id<'contactInquiries'>);
      expect(inquiry?.name).toBe('Jane');
      expect(inquiry?.plan).toBe('enterprise');
      expect(inquiry?.createdAt).toBeGreaterThan(0);
    });
  });

  it('listInquiries returns the newest first', async () => {
    const c = await seed();
    await c.t.run(async (ctx) => {
      await ctx.db.insert('contactInquiries', {
        name: 'Old',
        email: 'old@x.test',
        message: 'first',
        createdAt: 100,
      } as never);
      await ctx.db.insert('contactInquiries', {
        name: 'New',
        email: 'new@x.test',
        message: 'second',
        createdAt: 200,
      } as never);
    });

    const res = await c.t.run((ctx) => ctx.runQuery(api.subscriptions.listInquiries, {}));
    expect(res).toHaveLength(2);
    expect(res[0]?.name).toBe('New');
  });
});

// ── listAll (superadmin gating) ──────────────────────────────────────────────
describe('listAll', () => {
  it('returns an empty list for unauthenticated callers', async () => {
    const c = await seed();
    const res = await c.t.run((ctx) => ctx.runQuery(api.subscriptions.listAll, {}));
    expect(res).toEqual([]);
  });

  it('returns an empty list for non-superadmin staff', async () => {
    const c = await seed();
    await c.t.run((ctx) => ctx.runMutation(api.subscriptions.upsertSubscription, subArgs(c)));
    const res = await c.t
      .withIdentity({ email: 'admin@acme.test' })
      .query(api.subscriptions.listAll, {});
    expect(res).toEqual([]);
  });

  it('lists all subscriptions for a superadmin', async () => {
    const c = await seed();
    await c.t.run((ctx) => ctx.runMutation(api.subscriptions.upsertSubscription, subArgs(c)));
    const res = await asSuper(c).query(api.subscriptions.listAll, {});
    expect(res).toHaveLength(1);
    expect(res[0]?.stripeSubscriptionId).toBe('sub_123');
  });
});
