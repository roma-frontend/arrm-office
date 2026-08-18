/**
 * End-to-end enforcement of the plan editor ("what the plan says is what the
 * product enforces"), run against convex-test's in-memory database with the
 * real schema.
 *
 * The unit tests of the engine (convex-billing-plans.test.ts) prove the
 * resolution logic; these tests prove the *wiring*: a mutation that the
 * superadmin excluded from a published plan is refused on the server, a quota
 * limit stops a second resource, and superadmins bypass plan gating.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './departments.ts': () => import('../../convex/departments'),
  './documents.ts': () => import('../../convex/documents'),
  './leaveSettings.ts': () => import('../../convex/leaveSettings'),
  './meetings.ts': () => import('../../convex/meetings'),
  './messenger/conversations.ts': () => import('../../convex/messenger/conversations'),
  './calendarEvents.ts': () => import('../../convex/calendarEvents'),
  './meetingRooms.ts': () => import('../../convex/meetingRooms'),
  './pagination.ts': () => import('../../convex/pagination'),
  './lib/getAuthCaller.ts': () => import('../../convex/lib/getAuthCaller'),
  './lib/auth.ts': () => import('../../convex/lib/auth'),
  './lib/notify.ts': () => import('../../convex/lib/notify'),
  './lib/orgAccess.ts': () => import('../../convex/lib/orgAccess'),
  './lib/limits.ts': () => import('../../convex/lib/limits'),
  './lib/userProfile.ts': () => import('../../convex/lib/userProfile'),
  './lib/entitlements.ts': () => import('../../convex/lib/entitlements'),
  './superadmin/featureToggles.ts': () => import('../../convex/superadmin/featureToggles'),
  './billing/modules.ts': () => import('../../convex/billing/modules'),
  './billing/defaults.ts': () => import('../../convex/billing/defaults'),
  './billing/plans.ts': () => import('../../convex/billing/plans'),
  './subscriptions_admin.ts': () => import('../../convex/subscriptions_admin'),
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
      organizationId,
      name: 'Root',
      email: 'root@acme.test',
      role: 'superadmin',
    });

    return { organizationId, adminId, employeeId, superadminId };
  });
  return { t, ...ids };
}

const asAdmin = (c: Ctx) => c.t.withIdentity({ email: 'admin@acme.test' });
const asEmployee = (c: Ctx) => c.t.withIdentity({ email: 'employee@acme.test' });
const asSuperadmin = (c: Ctx) => c.t.withIdentity({ email: 'root@acme.test' });

/**
 * Publish a "Pro" plan snapshot where `departments` is excluded and
 * `videoConferences` allows exactly one monthly room, then point the org's
 * subscription at that published version.
 */
async function publishProPlan(c: Ctx) {
  return await c.t.run(async (ctx) => {
    const planId = await ctx.db.insert('billingPlans', {
      key: 'pro',
      name: 'Pro',
      currency: 'USD',
      isActive: true,
      isPopular: true,
      isCustom: false,
      sortOrder: 2,
      publishedVersion: 1,
      publishedAt: Date.now(),
      createdBy: c.superadminId,
      updatedAt: Date.now(),
    } as never);
    const snapshot = {
      plan: { name: 'Pro' },
      entitlements: [
        { moduleKey: 'employees', included: true, limits: { seats: 50 }, overLimit: 'block' },
        { moduleKey: 'departments', included: false, limits: null, overLimit: 'block' },
        { moduleKey: 'calendar', included: true, limits: null, overLimit: 'block' },
        {
          moduleKey: 'videoConferences',
          included: true,
          limits: { rooms: 1, recording: true, webinars: false },
          overLimit: 'block',
        },
      ],
    };
    await ctx.db.insert('billingPlanVersions', {
      planId,
      version: 1,
      snapshot: JSON.stringify(snapshot),
      publishedBy: c.superadminId,
      publishedAt: Date.now(),
    } as never);
    await ctx.db.insert('subscriptions', {
      organizationId: c.organizationId,
      stripeCustomerId: 'cus_test',
      stripeSubscriptionId: 'sub_test',
      plan: 'professional',
      status: 'active',
      cancelAtPeriodEnd: false,
      planId,
      planVersion: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);
    return planId;
  });
}

describe('published plan gating', () => {
  it('blocks a mutation whose module is excluded from the published plan', async () => {
    const c = await seed();
    await publishProPlan(c);

    await expect(
      asAdmin(c).mutation(api.departments.create, {
        organizationId: c.organizationId,
        name: 'R&D',
      }),
    ).rejects.toThrow('not included in your Pro plan');
  });

  it('lets a superadmin through even when the module is excluded', async () => {
    const c = await seed();
    await publishProPlan(c);

    const deptId = await asSuperadmin(c).mutation(api.departments.create, {
      organizationId: c.organizationId,
      name: 'R&D',
    });
    expect(deptId).toBeTruthy();
  });

  it('leaves everything open before any plan is published (permissive default)', async () => {
    const c = await seed();

    const deptId = await asAdmin(c).mutation(api.departments.create, {
      organizationId: c.organizationId,
      name: 'R&D',
    });
    expect(deptId).toBeTruthy();
  });

  it('enforces the documents quota and frees a slot on delete', async () => {
    const c = await seed();
    await c.t.run(async (ctx) => {
      const planId = await ctx.db.insert('billingPlans', {
        key: 'pro',
        name: 'Pro',
        currency: 'USD',
        isActive: true,
        isPopular: true,
        isCustom: false,
        sortOrder: 2,
        publishedVersion: 1,
        publishedAt: Date.now(),
        createdBy: c.superadminId,
        updatedAt: Date.now(),
      } as never);
      const snapshot = {
        plan: { name: 'Pro' },
        entitlements: [
          {
            moduleKey: 'documents',
            included: true,
            limits: { documents: 1, storageGB: 50 },
            overLimit: 'block',
          },
        ],
      };
      await ctx.db.insert('billingPlanVersions', {
        planId,
        version: 1,
        snapshot: JSON.stringify(snapshot),
        publishedBy: c.superadminId,
        publishedAt: Date.now(),
      } as never);
      await ctx.db.insert('subscriptions', {
        organizationId: c.organizationId,
        stripeCustomerId: 'cus_test',
        stripeSubscriptionId: 'sub_test',
        plan: 'professional',
        status: 'active',
        cancelAtPeriodEnd: false,
        planId,
        planVersion: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
    });

    const docArgs = (title: string) => ({
      organizationId: c.organizationId,
      title,
      category: 'policy' as const,
      fileUrl: 'https://example.com/file.pdf',
      fileName: 'file.pdf',
    });

    // First document fits the limit of 1.
    const first = await asAdmin(c).mutation(api.documents.createDocument, docArgs('First'));
    expect(first).toBeTruthy();

    // Second document exceeds it.
    await expect(
      asAdmin(c).mutation(api.documents.createDocument, docArgs('Second')),
    ).rejects.toThrow('Quota exceeded: documents limit is 1');

    // Deleting the first document frees its quota slot.
    await asAdmin(c).mutation(api.documents.deleteDocument, {
      documentId: first as Id<'documents'>,
    });
    const third = await asAdmin(c).mutation(api.documents.createDocument, docArgs('Third'));
    expect(third).toBeTruthy();
  });

  it('enforces the monthly room quota of the published plan', async () => {
    const c = await seed();
    await publishProPlan(c);

    const eventArgs = (title: string) => ({
      organizationId: c.organizationId,
      title,
      date: '2026-09-01',
      startTime: '10:00',
      endTime: '11:00',
      allDay: false,
      category: 'meeting',
      reminder: '30m',
    });

    // First room fits the limit of 1.
    const evt1 = await asAdmin(c).mutation(api.calendarEvents.create, eventArgs('First'));
    await asAdmin(c).mutation(api.meetings.register, {
      eventId: evt1 as Id<'calendarEvents'>,
      organizationId: c.organizationId,
      roomName: 'evt_1',
      mode: 'meeting',
    });

    // Second room exceeds it.
    const evt2 = await asAdmin(c).mutation(api.calendarEvents.create, eventArgs('Second'));
    await expect(
      asAdmin(c).mutation(api.meetings.register, {
        eventId: evt2 as Id<'calendarEvents'>,
        organizationId: c.organizationId,
        roomName: 'evt_2',
        mode: 'meeting',
      }),
    ).rejects.toThrow('Quota exceeded: rooms limit is 1');
  });

  it('enforces the leaveTypes quota and frees a slot on disable', async () => {
    const c = await seed();
    await c.t.run(async (ctx) => {
      const planId = await ctx.db.insert('billingPlans', {
        key: 'pro',
        name: 'Pro',
        currency: 'USD',
        isActive: true,
        isPopular: true,
        isCustom: false,
        sortOrder: 2,
        publishedVersion: 1,
        publishedAt: Date.now(),
        createdBy: c.superadminId,
        updatedAt: Date.now(),
      } as never);
      const snapshot = {
        plan: { name: 'Pro' },
        entitlements: [
          {
            moduleKey: 'leaves',
            included: true,
            limits: { leaveTypes: 1 },
            overLimit: 'block',
          },
        ],
      };
      await ctx.db.insert('billingPlanVersions', {
        planId,
        version: 1,
        snapshot: JSON.stringify(snapshot),
        publishedBy: c.superadminId,
        publishedAt: Date.now(),
      } as never);
      await ctx.db.insert('subscriptions', {
        organizationId: c.organizationId,
        stripeCustomerId: 'cus_test',
        stripeSubscriptionId: 'sub_test',
        plan: 'professional',
        status: 'active',
        cancelAtPeriodEnd: false,
        planId,
        planVersion: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
    });

    const configArgs = (type: 'paid' | 'sick') => ({
      organizationId: c.organizationId,
      type,
      isActive: true,
      defaultDaysPerYear: 20,
      requiresDocumentation: false,
      approvalChain: ['supervisor'],
      balanceEditable: true,
      color: '#2563eb',
      icon: '💰',
    });

    // First active type fits the limit of 1.
    await asAdmin(c).mutation(api.leaveSettings.upsertLeaveTypeConfig, configArgs('paid'));

    // Second active type exceeds it.
    await expect(
      asAdmin(c).mutation(api.leaveSettings.upsertLeaveTypeConfig, configArgs('sick')),
    ).rejects.toThrow('Quota exceeded: leaveTypes limit is 1');

    // Disabling the first type frees its quota slot.
    await asAdmin(c).mutation(api.leaveSettings.upsertLeaveTypeConfig, {
      ...configArgs('paid'),
      isActive: false,
    });
    await asAdmin(c).mutation(api.leaveSettings.upsertLeaveTypeConfig, configArgs('sick'));
  });

  it('enforces the chat channels quota on group conversations', async () => {
    const c = await seed();
    await c.t.run(async (ctx) => {
      const planId = await ctx.db.insert('billingPlans', {
        key: 'pro',
        name: 'Pro',
        currency: 'USD',
        isActive: true,
        isPopular: true,
        isCustom: false,
        sortOrder: 2,
        publishedVersion: 1,
        publishedAt: Date.now(),
        createdBy: c.superadminId,
        updatedAt: Date.now(),
      } as never);
      const snapshot = {
        plan: { name: 'Pro' },
        entitlements: [
          {
            moduleKey: 'chat',
            included: true,
            limits: { channels: 1 },
            overLimit: 'block',
          },
        ],
      };
      await ctx.db.insert('billingPlanVersions', {
        planId,
        version: 1,
        snapshot: JSON.stringify(snapshot),
        publishedBy: c.superadminId,
        publishedAt: Date.now(),
      } as never);
      await ctx.db.insert('subscriptions', {
        organizationId: c.organizationId,
        stripeCustomerId: 'cus_test',
        stripeSubscriptionId: 'sub_test',
        plan: 'professional',
        status: 'active',
        cancelAtPeriodEnd: false,
        planId,
        planVersion: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
    });

    const groupArgs = (name: string) => ({
      creatorId: c.adminId,
      name,
      participantIds: [c.employeeId],
    });

    // First channel fits the limit of 1.
    const first = await asAdmin(c).mutation(
      api.messenger.conversations.createGroupConversation,
      groupArgs('General'),
    );
    expect(first).toBeTruthy();

    // Second channel exceeds it.
    await expect(
      asAdmin(c).mutation(api.messenger.conversations.createGroupConversation, groupArgs('Random')),
    ).rejects.toThrow('Quota exceeded: channels limit is 1');
  });
});

describe('per-org custom Enterprise deal (customSnapshot)', () => {
  it('createManualSubscription stores the custom snapshot from the module selection', async () => {
    const c = await seed();

    await asSuperadmin(c).mutation(api.subscriptions_admin.createManualSubscription, {
      organizationId: c.organizationId,
      plan: 'enterprise',
      customPrice: 499,
      customModules: [
        { moduleKey: 'employees', included: true, limits: { seats: 200 } },
        { moduleKey: 'payroll', included: true, limits: null },
        // Everything else the org didn't pay for stays excluded.
      ],
    });

    const sub = await c.t.run(async (ctx) => {
      return ctx.db
        .query('subscriptions')
        .withIndex('by_org', (q) => q.eq('organizationId', c.organizationId))
        .first();
    });
    expect(sub?.customSnapshot).toBeTruthy();

    const parsed = JSON.parse(sub!.customSnapshot!) as {
      plan: { key: string; isCustom: boolean; priceMonthly: number | null };
      entitlements: Array<{ moduleKey: string; included: boolean; limits: unknown }>;
    };
    expect(parsed.plan.key).toBe('enterprise');
    expect(parsed.plan.isCustom).toBe(true);
    expect(parsed.plan.priceMonthly).toBe(499);
    expect(parsed.entitlements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ moduleKey: 'employees', included: true }),
        expect.objectContaining({ moduleKey: 'payroll', included: true }),
        expect.objectContaining({ moduleKey: 'departments', included: false }),
      ]),
    );
  });

  it('the custom snapshot gates modules the org did not pay for', async () => {
    const c = await seed();

    // Grant Enterprise with documents but NOT departments.
    await asSuperadmin(c).mutation(api.subscriptions_admin.createManualSubscription, {
      organizationId: c.organizationId,
      plan: 'enterprise',
      customModules: [
        { moduleKey: 'employees', included: true, limits: { seats: 200 } },
        { moduleKey: 'documents', included: true, limits: { documents: 100, storageGB: 50 } },
      ],
    });

    // Documents is included → creating one works.
    const docId = await asAdmin(c).mutation(api.documents.createDocument, {
      organizationId: c.organizationId,
      title: 'Policy',
      category: 'policy',
      fileUrl: 'https://example.com/file.pdf',
      fileName: 'file.pdf',
    });
    expect(docId).toBeTruthy();

    // Departments were not selected → blocked even though the catalog
    // Enterprise snapshot would normally include them.
    await expect(
      asAdmin(c).mutation(api.departments.create, {
        organizationId: c.organizationId,
        name: 'R&D',
      }),
    ).rejects.toThrow('not included in your Enterprise plan');
  });

  it('custom snapshot limits are enforced (documents quota from the deal)', async () => {
    const c = await seed();

    // Enterprise deal that allows only 1 document.
    await asSuperadmin(c).mutation(api.subscriptions_admin.createManualSubscription, {
      organizationId: c.organizationId,
      plan: 'enterprise',
      customModules: [
        { moduleKey: 'employees', included: true, limits: { seats: 200 } },
        { moduleKey: 'documents', included: true, limits: { documents: 1, storageGB: 50 } },
      ],
    });

    const docArgs = (title: string) => ({
      organizationId: c.organizationId,
      title,
      category: 'policy' as const,
      fileUrl: 'https://example.com/file.pdf',
      fileName: 'file.pdf',
    });

    // First document fits the custom limit of 1.
    const first = await asAdmin(c).mutation(api.documents.createDocument, docArgs('First'));
    expect(first).toBeTruthy();

    // Second document exceeds the deal's limit.
    await expect(
      asAdmin(c).mutation(api.documents.createDocument, docArgs('Second')),
    ).rejects.toThrow('Quota exceeded: documents limit is 1');
  });

  it('creating a manual subscription without modules keeps the catalog plan', async () => {
    const c = await seed();
    await publishProPlan(c);

    // No customModules → no snapshot; the published catalog drives rights.
    await asSuperadmin(c).mutation(api.subscriptions_admin.createManualSubscription, {
      organizationId: c.organizationId,
      plan: 'professional',
    });

    const sub = await c.t.run(async (ctx) => {
      return ctx.db
        .query('subscriptions')
        .withIndex('by_org', (q) => q.eq('organizationId', c.organizationId))
        .first();
    });
    expect(sub?.customSnapshot).toBeUndefined();
    expect(sub?.planId).toBeTruthy();
  });
});
