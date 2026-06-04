import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { isSuperadmin } from './lib/auth';
import { DEFAULT_LIST_CAP, PLAN_EMPLOYEE_LIMITS } from './lib/limits';

// ── Upsert subscription after checkout.session.completed ─────────────────────
export const upsertSubscription = mutation({
  args: {
    organizationId: v.optional(v.id('organizations')),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    stripeSessionId: v.optional(v.string()),
    plan: v.union(v.literal('starter'), v.literal('professional'), v.literal('enterprise')),
    status: v.union(
      v.literal('trialing'),
      v.literal('active'),
      v.literal('past_due'),
      v.literal('canceled'),
      v.literal('incomplete'),
    ),
    email: v.optional(v.string()),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    trialEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_stripe_subscription', (q) =>
        q.eq('stripeSubscriptionId', args.stripeSubscriptionId),
      )
      .first();

    const now = Date.now();

    // Keep the organization's plan in sync with its active subscription so that
    // org-scoped feature gating (organization.plan) matches the billing state.
    if (args.organizationId) {
      const isActive = args.status === 'active' || args.status === 'trialing';
      if (isActive) {
        await ctx.db.patch(args.organizationId, {
          plan: args.plan,
          employeeLimit: PLAN_EMPLOYEE_LIMITS[args.plan],
        });
      }
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert('subscriptions', {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ── Update status (for subscription.updated / deleted events) ─────────────────
export const updateSubscriptionStatus = mutation({
  args: {
    stripeSubscriptionId: v.string(),
    status: v.union(
      v.literal('trialing'),
      v.literal('active'),
      v.literal('past_due'),
      v.literal('canceled'),
      v.literal('incomplete'),
    ),
    cancelAtPeriodEnd: v.boolean(),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_stripe_subscription', (q) =>
        q.eq('stripeSubscriptionId', args.stripeSubscriptionId),
      )
      .first();

    if (!existing) return null;

    await ctx.db.patch(existing._id, {
      status: args.status,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
      updatedAt: Date.now(),
    });

    return existing._id;
  },
});

// ── Get subscription by customer ID ──────────────────────────────────────────
export const getByCustomer = query({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, args) => {
    const { stripeCustomerId } = args;
    return ctx.db
      .query('subscriptions')
      .withIndex('by_stripe_customer', (q) => q.eq('stripeCustomerId', stripeCustomerId))
      .first();
  },
});

// ── Save contact inquiry (Enterprise) ────────────────────────────────────────
export const saveContactInquiry = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    company: v.optional(v.string()),
    teamSize: v.optional(v.string()),
    message: v.string(),
    plan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('contactInquiries', {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// ── List all inquiries (admin only) ──────────────────────────────────────────
export const listInquiries = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query('contactInquiries').withIndex('by_created').order('desc').take(100);
  },
});

// ── Link subscription to user after registration ──────────────────────────────
// Called during registerAction: finds subscription by email and attaches userId
export const linkSubscriptionToUser = mutation({
  args: {
    email: v.string(),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { email, userId } = args;
    // Find unlinked subscription by email
    const subscription = await ctx.db
      .query('subscriptions')
      .withIndex('by_email', (q) => q.eq('email', email))
      .filter((q: any) => q.eq(q.field('userId'), undefined))
      .first();

    if (!subscription) return null;

    await ctx.db.patch(subscription._id, {
      userId,
      updatedAt: Date.now(),
    });

    return subscription._id;
  },
});

// ── Get subscription by userId ─────────────────────────────────────────────────
export const getSubscriptionByUserId = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const { userId } = args;
    return ctx.db
      .query('subscriptions')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
  },
});

// ── Get subscription by email ──────────────────────────────────────────────────
export const getSubscriptionByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const { email } = args;
    return ctx.db
      .query('subscriptions')
      .withIndex('by_email', (q) => q.eq('email', email))
      .order('desc')
      .first();
  },
});

// ── Get subscription for a context (organization first, email fallback) ───────
// Used by the settings/billing UI so a superadmin viewing a selected organization
// sees that organization's subscription. Legacy subscriptions that were created
// before org-linkage are still resolved by email.
export const getSubscriptionForContext = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.organizationId) {
      const orgId = args.organizationId;
      const byOrg = await ctx.db
        .query('subscriptions')
        .withIndex('by_org', (q) => q.eq('organizationId', orgId))
        .order('desc')
        .first();
      if (byOrg) return byOrg;
    }

    if (args.email) {
      const email = args.email;
      const byEmail = await ctx.db
        .query('subscriptions')
        .withIndex('by_email', (q) => q.eq('email', email))
        .order('desc')
        .first();
      if (byEmail) return byEmail;
    }

    // Fallback: no subscription row exists yet, but the organization may have a
    // plan assigned directly (e.g. set by an admin / superadmin). Surface that
    // plan so the billing UI reflects the organization's real tier instead of
    // defaulting to "free".
    if (args.organizationId) {
      const org = await ctx.db.get(args.organizationId);
      if (org?.plan) {
        return {
          _id: org._id,
          _creationTime: org._creationTime,
          organizationId: org._id,
          plan: org.plan,
          status: 'active' as const,
          email: args.email,
          trialEnd: undefined,
          currentPeriodStart: undefined,
          currentPeriodEnd: undefined,
          cancelAtPeriodEnd: false,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          source: 'organization' as const,
        };
      }
    }

    return null;
  },
});

// ── List all subscriptions (SUPERADMIN ONLY) ───────────────────────────────────
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const currentUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', identity.email!))
      .first();

    const isSuperAdmin = isSuperadmin(currentUser);

    if (!currentUser || !isSuperAdmin) return [];

    return ctx.db.query('subscriptions').take(DEFAULT_LIST_CAP);
  },
});
