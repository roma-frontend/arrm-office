import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { MAX_PAGE_SIZE } from '../pagination';
import { isSuperadmin, requireAuthUser } from '../lib/auth';
import { getProfile } from '../lib/userProfile';
import { withAuth } from '../lib/withAuth';
import { logger } from '@/lib/logger';

// ── Employee limits by plan ──────────────────────────────────────────────────
const PLAN_EMPLOYEE_LIMITS: Record<string, number> = {
  starter: 10,
  professional: 50,
  enterprise: 999999,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SUPERADMIN: Create a new organization
// ─────────────────────────────────────────────────────────────────────────────
export const createOrganization = mutation({
  args: {
    superadminUserId: v.id('users'),
    name: v.string(),
    slug: v.string(),
    plan: v.union(v.literal('starter'), v.literal('professional'), v.literal('enterprise')),
    timezone: v.optional(v.string()),
    country: v.optional(v.string()),
    industry: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    // Verify caller is superadmin
    const caller = (await ctx.db.get(args.superadminUserId)) as any as any;
    if (!caller || !isSuperadmin(caller)) {
      throw new Error('Only the superadmin can create organizations');
    }

    // Normalize slug: lowercase, only letters/numbers/hyphens
    const slug = args.slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (!slug) throw new Error('Invalid organization slug');

    // Check slug uniqueness
    const existing = await ctx.db
      .query('organizations')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (existing) throw new Error(`Organization with slug "${slug}" already exists`);

    const orgId = await ctx.db.insert('organizations', {
      name: args.name,
      slug,
      plan: args.plan,
      isActive: true,
      createdBySuperadmin: true,
      timezone: args.timezone ?? 'UTC',
      country: args.country,
      industry: args.industry,
      employeeLimit: PLAN_EMPLOYEE_LIMITS[args.plan]!,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Audit log: organization created
    await ctx.db.insert('auditLogs', {
      organizationId: orgId,
      userId: args.superadminUserId,
      action: 'organization_created',
      target: orgId,
      details: JSON.stringify({
        name: args.name,
        slug,
        plan: args.plan,
        timezone: args.timezone,
        country: args.country,
        industry: args.industry,
      }),
      createdAt: Date.now(),
    });

    return { orgId, slug };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPERADMIN ONLY: List all organizations (for subscription management)
// ─────────────────────────────────────────────────────────────────────────────
export const listAll = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const currentUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', identity.email!))
      .first();

    // Only superadmin can access payment/subscription features
    if (!currentUser || !isSuperadmin(currentUser)) {
      return [];
    }

    const orgs = await ctx.db.query('organizations').take(MAX_PAGE_SIZE);

    // Enrich with employee counts
    return await Promise.all(
      orgs.map(async (org) => {
        const employees = await ctx.db
          .query('users')
          .withIndex('by_org', (q) => q.eq('organizationId', org._id))
          .take(MAX_PAGE_SIZE);

        // Filter out superadmins from employee counts
        const filteredEmployees = employees.filter((e: any) => e.role !== 'superadmin');

        return {
          ...org,
          employeeCount: filteredEmployees.length,
        };
      }),
    );
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPERADMIN: Get all organizations
// ─────────────────────────────────────────────────────────────────────────────
export const getAllOrganizations = query({
  args: { superadminUserId: v.optional(v.id('users')) },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    if (args.superadminUserId) {
      const caller = (await ctx.db.get(args.superadminUserId)) as any as any;
      if (!caller || !isSuperadmin(caller)) {
        throw new Error('Superadmin only');
      }
    }

    const orgs = await ctx.db.query('organizations').order('desc').take(MAX_PAGE_SIZE);

    // Enrich with employee counts and admin info
    return await Promise.all(
      orgs.map(async (org) => {
        const employees = await ctx.db
          .query('users')
          .withIndex('by_org', (q) => q.eq('organizationId', org._id))
          .take(MAX_PAGE_SIZE);

        // Filter out superadmins from employee counts
        const filteredEmployees = employees.filter((e: any) => e.role !== 'superadmin');
        const admins = filteredEmployees.filter((u: any) => u.role === 'admin');
        const activeCount = filteredEmployees.filter((u: any) => u.isActive && u.isApproved).length;

        return {
          ...org,
          totalEmployees: filteredEmployees.length,
          activeEmployees: activeCount,
          adminNames: admins.map((a: any) => a.name),
          memberCount: filteredEmployees.length,
        };
      }),
    );
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPERADMIN: Update organization plan / settings
// ─────────────────────────────────────────────────────────────────────────────
export const updateOrganization = mutation({
  args: {
    superadminUserId: v.id('users'),
    organizationId: v.id('organizations'),
    name: v.optional(v.string()),
    plan: v.optional(
      v.union(v.literal('starter'), v.literal('professional'), v.literal('enterprise')),
    ),
    isActive: v.optional(v.boolean()),
    timezone: v.optional(v.string()),
    country: v.optional(v.string()),
    industry: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { superadminUserId, organizationId, ...updates } = args;
    const caller = (await ctx.db.get(superadminUserId)) as any as any;
    if (!caller || !isSuperadmin(caller)) {
      throw new Error('Only the superadmin can update organizations');
    }

    const patch: Record<string, unknown> = { ...updates, updatedAt: Date.now() };
    if (updates.plan) {
      patch.employeeLimit = PLAN_EMPLOYEE_LIMITS[updates.plan];
    }

    await ctx.db.patch(organizationId, patch);

    // Audit log: organization updated
    await ctx.db.insert('auditLogs', {
      organizationId: organizationId,
      userId: superadminUserId,
      action: 'organization_updated',
      target: organizationId,
      details: JSON.stringify({ updatedFields: Object.keys(updates) }),
      createdAt: Date.now(),
    });

    return organizationId;
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPERADMIN: Assign first admin to an organization
// ─────────────────────────────────────────────────────────────────────────────
export const assignOrgAdmin = mutation({
  args: {
    superadminUserId: v.id('users'),
    userId: v.id('users'),
    organizationId: v.id('organizations'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { superadminUserId, userId, organizationId } = args;
    const caller = (await ctx.db.get(superadminUserId)) as any as any;
    if (!caller || !isSuperadmin(caller)) {
      throw new Error('Only the superadmin can assign org admins');
    }

    const user = (await ctx.db.get(userId)) as any as any;
    if (!user) throw new Error('User not found');

    await ctx.db.patch(userId, {
      organizationId,
      role: 'admin',
      isApproved: true,
      approvedAt: Date.now(),
    });

    // Audit log: org admin assigned
    await ctx.db.insert('auditLogs', {
      organizationId: organizationId,
      userId: superadminUserId,
      action: 'org_admin_assigned',
      target: userId,
      details: JSON.stringify({ assignedUserId: userId, assignedUserName: user.name }),
      createdAt: Date.now(),
    });

    return userId;
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Get organization info by ID with access control
// Superadmin can view any org, admin can only view their own
// ─────────────────────────────────────────────────────────────────────────────
export const getOrganizationById = query({
  args: {
    callerUserId: v.id('users'),
    organizationId: v.id('organizations'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { callerUserId, organizationId } = args;
    const caller = (await ctx.db.get(callerUserId)) as any as any;
    if (!caller) {
      throw new Error('User not found');
    }

    const org = (await ctx.db.get(organizationId)) as any as any;
    if (!org) {
      throw new Error('Organization not found');
    }

    // Check access
    const callerIsSuperadmin = isSuperadmin(caller);
    const isOwnOrg = caller.organizationId === organizationId && caller.role === 'admin';

    if (!callerIsSuperadmin && !isOwnOrg) {
      throw new Error("You don't have access to this organization");
    }

    // Get employee count
    const members = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(MAX_PAGE_SIZE);

    // Filter out superadmins from employee count
    const filteredMembers = members.filter((m: any) => m.role !== 'superadmin');

    return {
      ...org,
      employeeCount: filteredMembers.length,
    };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPERADMIN: Get all members of a specific organization
// ─────────────────────────────────────────────────────────────────────────────
export const getOrgMembers = query({
  args: {
    superadminUserId: v.id('users'),
    organizationId: v.id('organizations'),
    cursor: v.optional(v.id('users')),
    limit: v.optional(v.number()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { superadminUserId, organizationId, cursor, limit } = args;
    const DEFAULT_LIMIT = 50;
    const MAX_LIMIT = 100;
    const effectiveLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT);

    const caller = (await ctx.db.get(superadminUserId)) as any as any;
    if (!caller || !isSuperadmin(caller)) {
      throw new Error('Only the superadmin can view org members');
    }

    const org = (await ctx.db.get(organizationId)) as any as any;
    if (!org) throw new Error('Organization not found');

    let query = ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId));

    if (cursor) {
      query = (query as any).startAfter(cursor);
    }

    const members = await query.take(effectiveLimit + 1);

    // Filter out superadmins (should never be in org, but just in case)
    const filteredMembers = members.filter((m: any) => !isSuperadmin(m));

    // Load profiles in parallel for O(1) lookup
    const profiles = await Promise.all(filteredMembers.map((m: any) => getProfile(ctx, m._id)));
    const profileMap = new Map(filteredMembers.map((m, i) => [m._id, profiles[i]]));

    return filteredMembers.map((m: any) => {
      const profile = profileMap.get(m._id);
      return {
        _id: m._id,
        name: m.name,
        email: m.email,
        role: m.role,
        isActive: m.isActive,
        isApproved: m.isApproved,
        department: profile?.department ?? m.department,
        position: profile?.position ?? m.position,
        avatarUrl: profile?.avatarUrl ?? m.avatarUrl,
        createdAt: m.createdAt,
        supervisorId: profile?.supervisorId ?? m.supervisorId,
        employeeType: profile?.employeeType ?? m.employeeType,
        phone: profile?.phone ?? m.phone,
        travelAllowance: profile?.travelAllowance ?? m.travelAllowance,
        paidLeaveBalance: profile?.paidLeaveBalance ?? m.paidLeaveBalance,
        sickLeaveBalance: profile?.sickLeaveBalance ?? m.sickLeaveBalance,
        familyLeaveBalance: profile?.familyLeaveBalance ?? m.familyLeaveBalance,
      };
    });
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPERADMIN: Remove admin role (demote to employee)
// ─────────────────────────────────────────────────────────────────────────────
export const removeOrgAdmin = mutation({
  args: {
    superadminUserId: v.id('users'),
    userId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { superadminUserId, userId } = args;
    const caller = (await ctx.db.get(superadminUserId)) as any as any;
    if (!caller || !isSuperadmin(caller)) {
      throw new Error('Only the superadmin can remove org admins');
    }

    const user = (await ctx.db.get(userId)) as any as any;
    if (!user) throw new Error('User not found');
    if (user.role !== 'admin') throw new Error('User is not an admin');

    await ctx.db.patch(userId, {
      role: 'employee',
    });

    // Audit log: org admin removed
    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId: superadminUserId,
      action: 'org_admin_removed',
      target: userId,
      details: JSON.stringify({
        removedUserId: userId,
        removedUserName: user.name,
        previousRole: 'admin',
      }),
      createdAt: Date.now(),
    });

    return userId;
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: Search organizations by name/slug (for registration)
// ─────────────────────────────────────────────────────────────────────────────
export const searchOrganizations = query({
  args: { query: v.string() },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { query: searchQuery } = args;
    if (!searchQuery || searchQuery.trim().length < 2) return [];

    const q = searchQuery.toLowerCase().trim();

    // Try exact slug match first
    const bySlug = await ctx.db
      .query('organizations')
      .withIndex('by_slug', (qb) => qb.eq('slug', q))
      .take(MAX_PAGE_SIZE);

    // Get all active orgs and filter by name
    const all = await ctx.db
      .query('organizations')
      .withIndex('by_active', (qb) => qb.eq('isActive', true))
      .take(MAX_PAGE_SIZE);

    const byName = all.filter(
      (org: any) => org.name.toLowerCase().includes(q) || org.slug.includes(q),
    );

    // Merge and deduplicate
    const merged = [...bySlug, ...byName];
    const seen = new Set<string>();
    const result = merged.filter((org: any) => {
      if (seen.has(org._id)) return false;
      seen.add(org._id);
      return org.isActive;
    });

    // Return only safe public fields
    return result.slice(0, 5).map((org: any) => ({
      _id: org._id,
      name: org.name,
      slug: org.slug,
      industry: org.industry,
      plan: org.plan,
    }));
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: Get organization by slug (for join flow)
// ─────────────────────────────────────────────────────────────────────────────
export const getOrganizationBySlug = query({
  args: { slug: v.string() },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { slug } = args;
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', (q) => q.eq('slug', slug.toLowerCase()))
      .unique();

    if (!org || !org.isActive) return null;

    return {
      _id: org._id,
      name: org.name,
      slug: org.slug,
      industry: org.industry,
      plan: org.plan,
    };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE: Submit a join request to an organization
// ─────────────────────────────────────────────────────────────────────────────
export const requestToJoinOrganization = mutation({
  args: {
    organizationId: v.id('organizations'),
    requestedByEmail: v.string(),
    requestedByName: v.string(),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const org = (await ctx.db.get(args.organizationId)) as any as any;
    if (!org || !org.isActive) throw new Error('Organization not found or inactive');

    // Check for duplicate pending request from same email
    const existing = await ctx.db
      .query('organizationInvites')
      .withIndex('by_email', (q) => q.eq('requestedByEmail', args.requestedByEmail))
      .take(MAX_PAGE_SIZE);

    const alreadyPending = existing.find(
      (inv) => inv.organizationId === args.organizationId && inv.status === 'pending',
    );
    if (alreadyPending) throw new Error('You already have a pending request for this organization');

    // Check if user already belongs to this org
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.requestedByEmail))
      .unique();
    if (existingUser && existingUser.organizationId === args.organizationId) {
      throw new Error('You are already a member of this organization');
    }

    const inviteId = await ctx.db.insert('organizationInvites', {
      organizationId: args.organizationId,
      requestedByEmail: args.requestedByEmail,
      requestedByName: args.requestedByName,
      requestedAt: Date.now(),
      status: 'pending',
      createdAt: Date.now(),
    });

    // Notify all org admins
    const admins = await ctx.db
      .query('users')
      .withIndex('by_org_role', (q) =>
        q.eq('organizationId', args.organizationId).eq('role', 'admin'),
      )
      .take(MAX_PAGE_SIZE);

    for (const admin of admins) {
      await ctx.db.insert('notifications', {
        organizationId: args.organizationId,
        userId: admin._id,
        type: 'join_request',
        title: '🙋 New Join Request',
        message: `${args.requestedByName} (${args.requestedByEmail}) wants to join ${org.name}.`,
        isRead: false,
        relatedId: inviteId,
        route: '/organization',
        createdAt: Date.now(),
      });
    }

    // Audit log: join request submitted (only if user already exists in system)
    if (existingUser) {
      await ctx.db.insert('auditLogs', {
        organizationId: args.organizationId,
        userId: existingUser._id,
        action: 'join_request_submitted',
        target: inviteId,
        details: JSON.stringify({
          requestedByEmail: args.requestedByEmail,
          requestedByName: args.requestedByName,
        }),
        createdAt: Date.now(),
      });
    }

    return inviteId;
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// ORG ADMIN: Get all pending join requests for their org
// ─────────────────────────────────────────────────────────────────────────────
export const getJoinRequests = query({
  args: {
    adminId: v.id('users'),
    status: v.optional(v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected'))),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { adminId, status } = args;
    const admin = (await ctx.db.get(adminId)) as any as any;
    if (!admin || (admin.role !== 'admin' && !isSuperadmin(admin))) {
      throw new Error('Only org admins can view join requests');
    }

    // For admin: must have organizationId
    // For superadmin: can view all if no organizationId is set
    if (!admin.organizationId && admin.role === 'admin') {
      return [];
    }

    const orgId = admin.organizationId;

    let invites;

    if (!orgId) {
      // Superadmin without org - return all invites
      if (status) {
        invites = await ctx.db
          .query('organizationInvites')
          .withIndex('by_status', (q) => q.eq('status', status))
          .take(MAX_PAGE_SIZE);
      } else {
        invites = await ctx.db.query('organizationInvites').take(MAX_PAGE_SIZE);
      }
    } else {
      // Admin or superadmin with org - return org-specific invites
      if (status) {
        invites = await ctx.db
          .query('organizationInvites')
          .withIndex('by_org_status', (q) => q.eq('organizationId', orgId).eq('status', status))
          .order('desc')
          .take(MAX_PAGE_SIZE);
      } else {
        invites = await ctx.db
          .query('organizationInvites')
          .withIndex('by_org', (q) => q.eq('organizationId', orgId))
          .order('desc')
          .take(MAX_PAGE_SIZE);
      }
    }

    return invites;
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// ORG ADMIN: Approve a join request → create user account
// ─────────────────────────────────────────────────────────────────────────────
export const approveJoinRequest = mutation({
  args: {
    adminId: v.id('users'),
    inviteId: v.id('organizationInvites'),
    role: v.union(v.literal('employee'), v.literal('supervisor')),
    department: v.optional(v.string()),
    position: v.optional(v.string()),
    passwordHash: v.string(), // admin sets temp password; user changes on first login
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const admin = (await ctx.db.get(args.adminId)) as any as any;
    if (!admin || (admin.role !== 'admin' && !isSuperadmin(admin))) {
      throw new Error('Only org admins can approve join requests');
    }

    const invite = (await ctx.db.get(args.inviteId)) as any as any;
    if (!invite) throw new Error('Invite not found');
    if (invite.status !== 'pending') throw new Error('This request has already been reviewed');

    if (!admin.organizationId) {
      throw new Error('Admin must belong to an organization');
    }

    if (invite.organizationId !== admin.organizationId) {
      throw new Error('This request belongs to a different organization');
    }

    // Check employee limit
    const org = (await ctx.db.get(invite.organizationId)) as any as any;
    if (!org) throw new Error('Organization not found');

    const currentCount = await ctx.db
      .query('users')
      .withIndex('by_org_active', (q) =>
        q.eq('organizationId', invite.organizationId).eq('isActive', true),
      )
      .take(MAX_PAGE_SIZE);

    if (currentCount.length >= org.employeeLimit) {
      throw new Error(
        `Employee limit reached (${org.employeeLimit}). Upgrade your plan to add more employees.`,
      );
    }

    // Check if user already exists (from OAuth sign up)
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', invite.requestedByEmail.toLowerCase()))
      .first();

    let userId;

    if (existingUser) {
      // User already exists (e.g., from OAuth) — update instead of creating new
      logger.log(
        `[approveJoinRequest] User ${invite.requestedByEmail} already exists, updating...`,
      );

      userId = existingUser._id;

      await ctx.db.patch(userId, {
        organizationId: invite.organizationId,
        role: args.role,
        employeeType: 'staff',
        department: args.department,
        position: args.position,
        isActive: true,
        isApproved: true,
        approvedBy: args.adminId,
        approvedAt: Date.now(),
        travelAllowance: 20000,
        paidLeaveBalance: 24,
        sickLeaveBalance: 10,
        familyLeaveBalance: 5,
      });
    } else {
      // No existing user — create new (for invite link flow)
      logger.log(`[approveJoinRequest] Creating new user for ${invite.requestedByEmail}`);

      userId = await ctx.db.insert('users', {
        organizationId: invite.organizationId,
        name: invite.requestedByName,
        email: invite.requestedByEmail,
        passwordHash: args.passwordHash,
        role: args.role,
        employeeType: 'staff',
        department: args.department,
        position: args.position,
        isActive: true,
        isApproved: true,
        approvedBy: args.adminId,
        approvedAt: Date.now(),
        travelAllowance: 20000,
        paidLeaveBalance: 24,
        sickLeaveBalance: 10,
        familyLeaveBalance: 5,
        createdAt: Date.now(),
      });
    }

    // Update invite record
    await ctx.db.patch(args.inviteId, {
      status: 'approved',
      reviewedBy: args.adminId,
      reviewedAt: Date.now(),
      userId,
    });

    // Notify the requester (they need to log in now)
    // We can't notify by userId yet since account was just created —
    // notify via the newly created userId
    await ctx.db.insert('notifications', {
      organizationId: invite.organizationId,
      userId,
      type: 'join_approved',
      title: '✅ Welcome to ' + org.name + '!',
      message: `Your request to join ${org.name} has been approved by ${admin.name}. You can now log in.`,
      isRead: false,
      relatedId: userId,
      route: '/organization',
      createdAt: Date.now(),
    });

    // Audit log: join request approved
    await ctx.db.insert('auditLogs', {
      organizationId: invite.organizationId,
      userId: args.adminId,
      action: 'join_request_approved',
      target: userId,
      details: JSON.stringify({
        inviteId: args.inviteId,
        email: invite.requestedByEmail,
        name: invite.requestedByName,
        role: args.role,
      }),
      createdAt: Date.now(),
    });

    return { userId, inviteId: args.inviteId };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// ORG ADMIN: Reject a join request
// ─────────────────────────────────────────────────────────────────────────────
export const rejectJoinRequest = mutation({
  args: {
    adminId: v.id('users'),
    inviteId: v.id('organizationInvites'),
    reason: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const admin = (await ctx.db.get(args.adminId)) as any as any;
    if (!admin || (admin.role !== 'admin' && !isSuperadmin(admin))) {
      throw new Error('Only org admins can reject join requests');
    }

    const invite = (await ctx.db.get(args.inviteId)) as any as any;
    if (!invite) throw new Error('Invite not found');
    if (invite.status !== 'pending') throw new Error('This request has already been reviewed');

    if (!admin.organizationId) {
      throw new Error('Admin must belong to an organization');
    }

    if (invite.organizationId !== admin.organizationId) {
      throw new Error('This request belongs to a different organization');
    }

    await ctx.db.patch(args.inviteId, {
      status: 'rejected',
      reviewedBy: args.adminId,
      reviewedAt: Date.now(),
      rejectionReason: args.reason,
    });

    // Audit log: join request rejected
    await ctx.db.insert('auditLogs', {
      organizationId: invite.organizationId,
      userId: args.adminId,
      action: 'join_request_rejected',
      target: args.inviteId,
      details: JSON.stringify({
        email: invite.requestedByEmail,
        name: invite.requestedByName,
        reason: args.reason,
      }),
      createdAt: Date.now(),
    });

    return args.inviteId;
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// ORG ADMIN: Generate an invite link token
// ─────────────────────────────────────────────────────────────────────────────
export const generateInviteToken = mutation({
  args: {
    adminId: v.id('users'),
    inviteEmail: v.optional(v.string()),
    expiryHours: v.optional(v.number()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const admin = (await ctx.db.get(args.adminId)) as any as any;
    if (!admin || (admin.role !== 'admin' && !isSuperadmin(admin))) {
      throw new Error('Only org admins can generate invite links');
    }

    // Generate a cryptographically secure random token
    const token = crypto.randomUUID().replace(/-/g, '');

    const expiryHours = args.expiryHours ?? 72;
    const expiry = Date.now() + expiryHours * 60 * 60 * 1000;

    if (!admin.organizationId) {
      throw new Error('Admin must belong to an organization');
    }

    const inviteId = await ctx.db.insert('organizationInvites', {
      organizationId: admin.organizationId,
      requestedByEmail: args.inviteEmail ?? '',
      requestedByName: '',
      requestedAt: Date.now(),
      status: 'pending',
      inviteToken: token,
      inviteEmail: args.inviteEmail,
      inviteExpiry: expiry,
      createdAt: Date.now(),
    });

    // Audit log: invite token generated
    await ctx.db.insert('auditLogs', {
      organizationId: admin.organizationId,
      userId: args.adminId,
      action: 'invite_token_generated',
      target: inviteId,
      details: JSON.stringify({ inviteEmail: args.inviteEmail, expiryHours: expiryHours }),
      createdAt: Date.now(),
    });

    return { token, inviteId, expiresAt: expiry };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: Validate invite token (used during registration)
// ─────────────────────────────────────────────────────────────────────────────
export const validateInviteToken = query({
  args: { token: v.string() },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { token } = args;
    const invite = await ctx.db
      .query('organizationInvites')
      .withIndex('by_token', (q) => q.eq('inviteToken', token))
      .unique();

    if (!invite) return { valid: false, reason: 'Token not found' };
    if (invite.status === 'approved') return { valid: false, reason: 'Already used' };
    if (invite.inviteExpiry && invite.inviteExpiry < Date.now()) {
      return { valid: false, reason: 'Token expired' };
    }

    if (!invite.organizationId) return { valid: false, reason: 'Invite has no organization' };
    const org = (await ctx.db.get(invite.organizationId)) as any as any;
    if (!org || !org.isActive) return { valid: false, reason: 'Organization inactive' };

    return {
      valid: true,
      organizationId: invite.organizationId,
      organizationName: org.name,
      organizationSlug: org.slug,
      prefilledEmail: invite.inviteEmail,
      inviteId: invite._id,
    };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Get organization details (for logged-in users)
// ─────────────────────────────────────────────────────────────────────────────
export const getMyOrganization = query({
  args: { userId: v.id('users') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { userId } = args;
    const user = (await ctx.db.get(userId)) as any as any;
    if (!user || !user.organizationId) return null;

    const org = (await ctx.db.get(user.organizationId)) as any as any;
    return org;
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Get pending join request count for org admin badge
// ─────────────────────────────────────────────────────────────────────────────
export const getPendingJoinRequestCount = query({
  args: { adminId: v.id('users') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { adminId } = args;
    const admin = (await ctx.db.get(adminId)) as any as any;
    if (!admin || (admin.role !== 'admin' && !isSuperadmin(admin))) {
      return 0;
    }
    if (!admin.organizationId) {
      return 0;
    }

    const orgId = admin.organizationId;

    const pending = await ctx.db
      .query('organizationInvites')
      .withIndex('by_org_status', (q) => q.eq('organizationId', orgId).eq('status', 'pending'))
      .take(MAX_PAGE_SIZE);

    return pending.length;
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPERADMIN: Remove a member from organization (deactivate them)
// Does NOT delete the user — just removes them from the org
// ─────────────────────────────────────────────────────────────────────────────
export const removeMemberFromOrganization = mutation({
  args: {
    superadminUserId: v.id('users'),
    userId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { superadminUserId, userId } = args;
    const caller = (await ctx.db.get(superadminUserId)) as any as any;
    if (!caller || !isSuperadmin(caller)) {
      throw new Error('Only the superadmin can remove members from organizations');
    }

    const user = (await ctx.db.get(userId)) as any as any;
    if (!user) throw new Error('User not found');

    // Protection: cannot remove superadmin themselves
    if (isSuperadmin(user)) {
      throw new Error('Cannot remove the superadmin from any organization');
    }

    // Remove from organization: set organizationId to undefined and deactivate
    await ctx.db.patch(userId, {
      organizationId: undefined,
      isActive: false,
    });

    // Audit log: member removed from organization
    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId: superadminUserId,
      action: 'member_removed_from_org',
      target: userId,
      details: JSON.stringify({
        removedEmail: user.email,
        removedName: user.name,
        previousOrgId: user.organizationId,
      }),
      createdAt: Date.now(),
    });

    logger.log(`[removeMemberFromOrganization] ✅ Removed ${user.email} from organization`);

    return userId;
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// GET ORGANIZATIONS FOR PICKER — for chat UI
// ─────────────────────────────────────────────────────────────────────────────
export const getOrganizationsForPicker = query({
  args: { userId: v.id('users') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { userId } = args;
    const user = (await ctx.db.get(userId)) as any as any;
    if (!user) throw new Error('User not found');

    if (isSuperadmin(user)) {
      const orgs = await ctx.db
        .query('organizations')
        .withIndex('by_active', (q) => q.eq('isActive', true))
        .take(MAX_PAGE_SIZE);
      return orgs.map((o: any) => ({ _id: o._id, name: o.name, slug: o.slug }));
    }

    // Regular users: only their own org
    if (!user.organizationId) return [];
    const org = (await ctx.db.get(user.organizationId)) as any as any;
    if (!org) return [];
    return [{ _id: org._id, name: org.name, slug: org.slug }];
  }),
});
