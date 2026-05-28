import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { isSuperadmin } from './lib/auth';
import { DEFAULT_LIST_CAP } from './lib/limits';
import { withAuth } from './lib/withAuth';

// ── Upsert subscription after checkout.session.completed ─────────────────────
export const upsertSubscription = mutation({
  args: {
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
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_stripe_subscription', (q) =>
        q.eq('stripeSubscriptionId', args.stripeSubscriptionId),
      )
      .first();

    const now = Date.now();

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
  }),
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
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
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
  }),
});

// ── Get subscription by customer ID ──────────────────────────────────────────
export const getByCustomer = query({
  args: { stripeCustomerId: v.string() },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { stripeCustomerId } = args;
    return ctx.db
      .query('subscriptions')
      .withIndex('by_stripe_customer', (q) => q.eq('stripeCustomerId', stripeCustomerId))
      .first();
  }),
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
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    return await ctx.db.insert('contactInquiries', {
      ...args,
      createdAt: Date.now(),
    });
  }),
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
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
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
  }),
});

// ── Get subscription by userId ─────────────────────────────────────────────────
export const getSubscriptionByUserId = query({
  args: { userId: v.id('users') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { userId } = args;
    return ctx.db
      .query('subscriptions')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
  }),
});

// ── Get subscription by email ──────────────────────────────────────────────────
export const getSubscriptionByEmail = query({
  args: { email: v.string() },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { email } = args;
    return ctx.db
      .query('subscriptions')
      .withIndex('by_email', (q) => q.eq('email', email))
      .order('desc')
      .first();
  }),
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
