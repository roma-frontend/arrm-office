import { v } from 'convex/values';
import { getAuthCaller } from './lib/getAuthCaller';
import { mutation, query } from './_generated/server';
import { SUPERADMIN_EMAIL, isSuperadmin } from './lib/auth';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { notify } from './lib/notify';
import { resolveBillingPlanLink } from './billing/plans';

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: Create a self-service Starter organization (instant)
// ─────────────────────────────────────────────────────────────────────────────
export const createStarterOrganization = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    email: v.string(),
    password: v.string(),
    userName: v.string(),
    phone: v.optional(v.string()),
    country: v.optional(v.string()),
    industry: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Normalize slug
    const slug = args.slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!slug) throw new Error('Invalid organization slug');

    // Check slug uniqueness
    const existingOrg = await ctx.db
      .query('organizations')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (existingOrg) throw new Error(`Organization "${slug}" already exists`);

    // Check email uniqueness
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email.toLowerCase()))
      .unique();
    if (existingUser) throw new Error('This email is already registered');

    // Create organization (Starter plan)
    const orgId = await ctx.db.insert('organizations', {
      name: args.name,
      slug,
      plan: 'starter',
      isActive: true,
      createdBySuperadmin: false,
      timezone: 'UTC',
      country: args.country,
      industry: args.industry,
      employeeLimit: 10, // Starter limit
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Create admin user
    const userId = await ctx.db.insert('users', {
      organizationId: orgId,
      name: args.userName,
      email: args.email.toLowerCase(),
      passwordHash: args.password, // should be hashed on client
      role: 'admin',
      employeeType: 'staff',
      department: 'Management',
      position: 'Administrator',
      phone: args.phone,
      isActive: true,
      isApproved: true,
      approvedAt: Date.now(),
      // No travel allowance on org bootstrap: the organization has no
      // salarySettings yet, so there is no policy to resolve. An admin sets it
      // in Payroll → Settings, after which new employees inherit it.
      paidLeaveBalance: 24,
      sickLeaveBalance: 10,
      familyLeaveBalance: 5,
      dayOffBalance: 6,
      maternityLeaveBalance: 0,
      studyLeaveBalance: 5,
      createdAt: Date.now(),
    });

    // Create welcome notification
    await notify(ctx, {
      organizationId: orgId,
      userId,
      type: 'system',
      titleKey: 'notifications.titles.orgWelcome',
      messageKey: 'notifications.messages.orgCreated',
      params: { orgName: args.name, limit: 10 },
      fallbackTitle: '🎉 Welcome to Strata!',
      fallbackMessage: `Your organization "${args.name}" has been created successfully. You're on the Starter plan (10 employees max).`,
      route: '/dashboard',
    });

    // The chosen Starter plan becomes a real subscription pinned to the
    // billing-catalog plan row, so entitlements gate the org from day one.
    const planLink = await resolveBillingPlanLink(ctx, 'starter');
    const now = Date.now();
    await ctx.db.insert('subscriptions', {
      organizationId: orgId,
      userId,
      stripeCustomerId: `self_service_${orgId}`,
      stripeSubscriptionId: `self_service_${orgId}`,
      plan: 'starter',
      status: 'active',
      cancelAtPeriodEnd: false,
      planId: planLink.planId,
      planVersion: planLink.planVersion,
      createdAt: now,
      updatedAt: now,
    });

    return { organizationId: orgId, userId };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: Request Professional/Enterprise organization (requires approval)
// ─────────────────────────────────────────────────────────────────────────────
export const requestOrganization = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    email: v.string(),
    password: v.string(),
    userName: v.string(),
    phone: v.optional(v.string()),
    plan: v.union(v.literal('professional'), v.literal('enterprise')),
    country: v.optional(v.string()),
    industry: v.optional(v.string()),
    teamSize: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Normalize slug
    const slug = args.slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!slug) throw new Error('Invalid organization slug');

    // Check if slug is already taken
    const existingOrg = await ctx.db
      .query('organizations')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (existingOrg) throw new Error(`Organization "${slug}" already exists`);

    // Check if this email already requested
    const existingRequest = await ctx.db
      .query('organizationRequests')
      .withIndex('by_email', (q) => q.eq('requesterEmail', args.email.toLowerCase()))
      .filter((q) => q.eq(q.field('status'), 'pending'))
      .unique();
    if (existingRequest) throw new Error('You already have a pending organization request');

    // Check if email is already registered
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email.toLowerCase()))
      .unique();
    if (existingUser) throw new Error('This email is already registered');

    // Create request
    const requestId = await ctx.db.insert('organizationRequests', {
      requestedName: args.name,
      requestedSlug: slug,
      requesterName: args.userName,
      requesterEmail: args.email.toLowerCase(),
      requesterPhone: args.phone,
      requesterPassword: args.password, // hashed
      requestedPlan: args.plan,
      industry: args.industry,
      country: args.country,
      teamSize: args.teamSize,
      description: args.description,
      status: 'pending',
      createdAt: Date.now(),
    });

    // Notify superadmin
    const superadmin = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', SUPERADMIN_EMAIL))
      .unique();

    if (superadmin) {
      await notify(ctx, {
        organizationId: superadmin.organizationId,
        userId: superadmin._id,
        type: 'system',
        titleKey: 'notifications.titles.orgRequestNew',
        messageKey: 'notifications.messages.orgRequestNew',
        params: { userName: args.userName, orgName: args.name, plan: args.plan },
        fallbackTitle: '🏢 New Organization Request',
        fallbackMessage: `${args.userName} requested to create "${args.name}" (${args.plan} plan)`,
        relatedId: requestId,
        route: '/superadmin/organizations',
      });
    }

    return { requestId };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPERADMIN: Get all organization requests
// ─────────────────────────────────────────────────────────────────────────────
export const getOrganizationRequests = query({
  args: {
    superadminUserId: v.id('users'),
    status: v.optional(v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected'))),
  },
  handler: async (ctx, args) => {
    const { superadminUserId, status } = args;
    const superadmin = await ctx.db.get(superadminUserId);
    if (!superadmin || !isSuperadmin(superadmin)) {
      throw new Error('Superadmin only');
    }

    let requests;
    if (status) {
      requests = await ctx.db
        .query('organizationRequests')
        .withIndex('by_status', (q) => q.eq('status', status))
        .order('desc')
        .take(DEFAULT_LIST_CAP);
    } else {
      requests = await ctx.db.query('organizationRequests').order('desc').take(DEFAULT_LIST_CAP);
    }

    return requests;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPERADMIN: Approve organization request
// ─────────────────────────────────────────────────────────────────────────────
export const approveOrganizationRequest = mutation({
  args: {
    superadminUserId: v.id('users'),
    requestId: v.id('organizationRequests'),
  },
  handler: async (ctx, args) => {
    const { superadminUserId, requestId } = args;
    const superadmin = await ctx.db.get(superadminUserId);
    if (!superadmin || !isSuperadmin(superadmin)) {
      throw new Error('Only superadmin can approve organization requests');
    }

    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('Request not found');
    if (request.status !== 'pending') throw new Error('This request has already been reviewed');

    // Check slug availability again
    const existingOrg = await ctx.db
      .query('organizations')
      .withIndex('by_slug', (q) => q.eq('slug', request.requestedSlug))
      .unique();
    if (existingOrg) throw new Error('Organization slug is already taken');

    // Determine employee limit
    const employeeLimit = request.requestedPlan === 'professional' ? 50 : 999999;

    // Create organization
    const orgId = await ctx.db.insert('organizations', {
      name: request.requestedName,
      slug: request.requestedSlug,
      plan: request.requestedPlan,
      isActive: true,
      createdBySuperadmin: true,
      timezone: 'UTC',
      country: request.country,
      industry: request.industry,
      employeeLimit,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Create admin user
    const userId = await ctx.db.insert('users', {
      organizationId: orgId,
      name: request.requesterName,
      email: request.requesterEmail,
      passwordHash: request.requesterPassword,
      role: 'admin',
      employeeType: 'staff',
      department: 'Management',
      position: 'Administrator',
      phone: request.requesterPhone,
      isActive: true,
      isApproved: true,
      approvedBy: superadminUserId,
      approvedAt: Date.now(),
      // No travel allowance on org bootstrap: the organization has no
      // salarySettings yet, so there is no policy to resolve. An admin sets it
      // in Payroll → Settings, after which new employees inherit it.
      paidLeaveBalance: 24,
      sickLeaveBalance: 10,
      familyLeaveBalance: 5,
      dayOffBalance: 6,
      maternityLeaveBalance: 0,
      studyLeaveBalance: 5,
      createdAt: Date.now(),
    });

    // Update request status
    await ctx.db.patch(requestId, {
      status: 'approved',
      reviewedBy: superadminUserId,
      reviewedAt: Date.now(),
      organizationId: orgId,
      userId,
    });

    // Notify the requester
    await notify(ctx, {
      organizationId: orgId,
      userId,
      type: 'system',
      titleKey: 'notifications.titles.orgApproved',
      messageKey: 'notifications.messages.orgApproved',
      params: { orgName: request.requestedName },
      fallbackTitle: '✅ Organization Approved!',
      fallbackMessage: `Your organization "${request.requestedName}" has been approved! You can now log in and start managing your team.`,
      relatedId: requestId,
      route: '/dashboard',
    });

    // The approved Professional/Enterprise plan becomes a real subscription
    // pinned to the billing-catalog plan row (the org pays by invoice; Stripe
    // checkout later replaces this row with a live subscription).
    const planLink = await resolveBillingPlanLink(ctx, request.requestedPlan);
    const now = Date.now();
    await ctx.db.insert('subscriptions', {
      organizationId: orgId,
      userId,
      stripeCustomerId: `manual_${orgId}_${now}`,
      stripeSubscriptionId: `manual_sub_${orgId}_${now}`,
      plan: request.requestedPlan,
      status: 'active',
      cancelAtPeriodEnd: false,
      planId: planLink.planId,
      planVersion: planLink.planVersion,
      metadata: {
        manual: true,
        createdBy: superadminUserId,
        createdAt: now,
      },
      createdAt: now,
      updatedAt: now,
    });

    return { organizationId: orgId, userId };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPERADMIN: Reject organization request
// ─────────────────────────────────────────────────────────────────────────────
export const rejectOrganizationRequest = mutation({
  args: {
    superadminUserId: v.id('users'),
    requestId: v.id('organizationRequests'),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { superadminUserId, requestId, reason } = args;
    const superadmin = await ctx.db.get(superadminUserId);
    if (!superadmin || !isSuperadmin(superadmin)) {
      throw new Error('Only superadmin can reject organization requests');
    }

    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('Request not found');
    if (request.status !== 'pending') throw new Error('This request has already been reviewed');

    await ctx.db.patch(requestId, {
      status: 'rejected',
      reviewedBy: superadminUserId,
      reviewedAt: Date.now(),
      rejectionReason: reason,
    });

    return { requestId };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: Get pending request count (for superadmin badge)
// ─────────────────────────────────────────────────────────────────────────────
export const getPendingRequestCount = query({
  args: { superadminUserId: v.id('users') },
  handler: async (ctx, args) => {
    const { superadminUserId } = args;
    const superadmin = await ctx.db.get(superadminUserId);
    if (!superadmin || !isSuperadmin(superadmin)) {
      return 0;
    }

    const pending = await ctx.db
      .query('organizationRequests')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .take(SMALL_LIST_CAP);

    return pending.length;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SECURED: APPROVE ORG REQUEST — verified identity via ctx.auth
// ─────────────────────────────────────────────────────────────────────────────
export const secureApproveOrgRequest = mutation({
  args: { requestId: v.id('organizationRequests') },
  handler: async (ctx, { requestId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('Request not found');
    if (request.status !== 'pending') throw new Error('Already reviewed');

    const existingOrg = await ctx.db
      .query('organizations')
      .withIndex('by_slug', (q) => q.eq('slug', request.requestedSlug))
      .unique();
    if (existingOrg) throw new Error('Organization slug is already taken');

    const employeeLimit = request.requestedPlan === 'professional' ? 50 : 999999;

    const orgId = await ctx.db.insert('organizations', {
      name: request.requestedName,
      slug: request.requestedSlug,
      plan: request.requestedPlan,
      isActive: true,
      createdBySuperadmin: true,
      timezone: 'UTC',
      country: request.country,
      industry: request.industry,
      employeeLimit,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const userId = await ctx.db.insert('users', {
      organizationId: orgId,
      name: request.requesterName,
      email: request.requesterEmail,
      passwordHash: request.requesterPassword,
      role: 'admin',
      employeeType: 'staff',
      department: 'Management',
      position: 'Administrator',
      phone: request.requesterPhone,
      isActive: true,
      isApproved: true,
      approvedBy: caller._id,
      approvedAt: Date.now(),
      // No travel allowance on org bootstrap: the organization has no
      // salarySettings yet, so there is no policy to resolve. An admin sets it
      // in Payroll → Settings, after which new employees inherit it.
      paidLeaveBalance: 24,
      sickLeaveBalance: 10,
      familyLeaveBalance: 5,
      dayOffBalance: 6,
      maternityLeaveBalance: 0,
      studyLeaveBalance: 5,
      createdAt: Date.now(),
    });

    await ctx.db.patch(requestId, {
      status: 'approved',
      reviewedBy: caller._id,
      reviewedAt: Date.now(),
      organizationId: orgId,
      userId,
    });

    return { organizationId: orgId, userId };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SECURED: REJECT ORG REQUEST — verified identity via ctx.auth
// ─────────────────────────────────────────────────────────────────────────────
export const secureRejectOrgRequest = mutation({
  args: { requestId: v.id('organizationRequests'), reason: v.optional(v.string()) },
  handler: async (ctx, { requestId, reason }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('Request not found');
    if (request.status !== 'pending') throw new Error('Already reviewed');

    await ctx.db.patch(requestId, {
      status: 'rejected',
      reviewedBy: caller._id,
      reviewedAt: Date.now(),
      rejectionReason: reason,
    });
  },
});
