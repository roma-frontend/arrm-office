import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { withAuth } from './lib/withAuth';
import { DEFAULT_LIST_CAP } from './lib/limits';

// ─────────────────────────────────────────────────────────────────────────────
// ADB-ARRM ORGANIZATION RESTRICTION
// SharePoint integration is ONLY allowed for the ADB-ARRM organization.
// ─────────────────────────────────────────────────────────────────────────────
const RESTRICTED_ORG_SLUG = 'adb-arrm';

async function verifyRestrictedOrg(ctx: any, organizationId: string) {
  const org = (await ctx.db.get(organizationId)) as any;
  if (!org) {
    throw new Error('Organization not found');
  }
  if (org.slug !== RESTRICTED_ORG_SLUG) {
    throw new Error('SharePoint integration is restricted to ADB-ARRM organization only');
  }
  return org;
}

// ─────────────────────────────────────────────────────────────────────────────
// UPSERT SHAREPOINT USER — create or update a user from SharePoint data
// ─────────────────────────────────────────────────────────────────────────────
export const upsertSharePointUser = mutation({
  args: {
    adminId: v.id('users'),
    organizationId: v.id('organizations'),
    email: v.string(),
    name: v.string(),
    department: v.optional(v.string()),
    position: v.optional(v.string()),
    phone: v.optional(v.string()),
    location: v.optional(v.string()),
    employeeType: v.union(v.literal('staff'), v.literal('contractor')),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    // Verify admin
    const admin = (await ctx.db.get(args.adminId)) as any;
    if (!admin) throw new Error('Admin not found');
    if (admin.role !== 'admin' && admin.role !== 'superadmin') {
      throw new Error('Only admins can sync SharePoint users');
    }

    // 🛡️ RESTRICTED ORG CHECK: Only ADB-ARRM can use SharePoint sync
    await verifyRestrictedOrg(ctx, args.organizationId);

    const emailLower = args.email.toLowerCase().trim();

    // Check if user already exists in this org
    const existing = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', emailLower))
      .first();

    if (existing) {
      // Update existing user — only patch fields that come from SharePoint
      await ctx.db.patch(existing._id, {
        name: args.name,
        department: args.department,
        position: args.position,
        phone: args.phone,
        location: args.location,
        employeeType: args.employeeType,
        isActive: true, // Re-activate if previously deactivated
      });
      return { action: 'updated' as const, userId: existing._id };
    }

    // Create new user with default balances
    const isStaff = args.employeeType === 'staff';
    const now = Date.now();

    // Generate a random placeholder password hash (user will need to set real password)
    const randomHash = `sharepoint_sync_${now}_${Math.random().toString(36).slice(2)}`;

    const userId = await ctx.db.insert('users', {
      organizationId: args.organizationId,
      name: args.name,
      email: emailLower,
      passwordHash: randomHash,
      role: 'employee',
      employeeType: args.employeeType,
      department: args.department,
      position: args.position,
      phone: args.phone,
      location: args.location,
      isActive: true,
      isApproved: true,
      travelAllowance: isStaff ? 20000 : 12000,
      paidLeaveBalance: 20,
      sickLeaveBalance: 10,
      familyLeaveBalance: 5,
      createdAt: now,
    });

    return { action: 'created' as const, userId };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// DEACTIVATE SHAREPOINT USERS — set isActive=false for users not in the list
// ─────────────────────────────────────────────────────────────────────────────
export const deactivateSharePointUsers = mutation({
  args: {
    adminId: v.id('users'),
    organizationId: v.id('organizations'),
    activeEmails: v.array(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    // Verify admin
    const admin = (await ctx.db.get(args.adminId)) as any;
    if (!admin) throw new Error('Admin not found');
    if (admin.role !== 'admin' && admin.role !== 'superadmin') {
      throw new Error('Only admins can deactivate users');
    }

    // 🛡️ RESTRICTED ORG CHECK: Only ADB-ARRM can use SharePoint sync
    await verifyRestrictedOrg(ctx, args.organizationId);

    const activeEmailSet = new Set(args.activeEmails.map((e: any) => e.toLowerCase().trim()));

    // Get all active users in the org
    const orgUsers = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .take(DEFAULT_LIST_CAP);

    let deactivated = 0;

    for (const user of orgUsers) {
      // Skip admins and superadmins — they are not managed by SharePoint sync
      if (user.role === 'admin' || user.role === 'superadmin' || user.role === 'supervisor') {
        continue;
      }
      // If user email is NOT in the SharePoint list, deactivate
      if (!activeEmailSet.has(user.email.toLowerCase())) {
        await ctx.db.patch(user._id, { isActive: false });
        deactivated++;
      }
    }

    return { deactivated };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// LOG SYNC — record a sync attempt
// ─────────────────────────────────────────────────────────────────────────────
export const logSync = mutation({
  args: {
    organizationId: v.id('organizations'),
    triggeredBy: v.id('users'),
    created: v.number(),
    updated: v.number(),
    deactivated: v.number(),
    errors: v.number(),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    // 🛡️ RESTRICTED ORG CHECK: Only ADB-ARRM can use SharePoint sync
    await verifyRestrictedOrg(ctx, args.organizationId);

    return await ctx.db.insert('sharepointSyncLogs', {
      organizationId: args.organizationId,
      triggeredBy: args.triggeredBy,
      created: args.created,
      updated: args.updated,
      deactivated: args.deactivated,
      errors: args.errors,
      syncedAt: Date.now(),
    });
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// GET LAST SYNC — for showing "last synced at" in the UI
// ─────────────────────────────────────────────────────────────────────────────
export const getLastSync = query({
  args: { organizationId: v.id('organizations') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId } = args;
    // 🛡️ RESTRICTED ORG CHECK: Only ADB-ARRM can access SharePoint sync logs
    await verifyRestrictedOrg(ctx, organizationId);

    const logs = await ctx.db
      .query('sharepointSyncLogs')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .order('desc')
      .take(1);

    return logs[0] || null;
  }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECURED: Upsert SharePoint User — verified identity
// ═══════════════════════════════════════════════════════════════════════════════
export const secureUpsertSharePointUser = mutation({
  args: {
    organizationId: v.id('organizations'),
    email: v.string(),
    name: v.string(),
    department: v.optional(v.string()),
    position: v.optional(v.string()),
    phone: v.optional(v.string()),
    location: v.optional(v.string()),
    employeeType: v.union(v.literal('staff'), v.literal('contractor')),
  },
  handler: withAuth<
    MutationCtx,
    {
      organizationId: Id<'organizations'>;
      email: string;
      name: string;
      department?: string;
      position?: string;
      phone?: string;
      location?: string;
      employeeType: 'staff' | 'contractor';
    },
    { action: 'created' | 'updated'; userId: Id<'users'> }
  >({ minimumRole: 'admin' }, async (ctx, args, caller) => {
    await verifyRestrictedOrg(ctx, args.organizationId as any);

    if (caller.role !== 'superadmin' && caller.organizationId !== args.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }

    const emailLower = args.email.toLowerCase().trim();
    const existing = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', emailLower))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        department: args.department,
        position: args.position,
        phone: args.phone,
        location: args.location,
        employeeType: args.employeeType,
        isActive: true,
      });
      return { action: 'updated' as const, userId: existing._id };
    }

    const userId = await ctx.db.insert('users', {
      organizationId: args.organizationId,
      name: args.name,
      email: emailLower,
      passwordHash: `sharepoint_sync_${Date.now()}`,
      role: 'employee',
      employeeType: args.employeeType,
      department: args.department,
      position: args.position,
      phone: args.phone,
      location: args.location,
      isActive: true,
      isApproved: true,
      travelAllowance: args.employeeType === 'staff' ? 20000 : 12000,
      paidLeaveBalance: 20,
      sickLeaveBalance: 10,
      familyLeaveBalance: 5,
      createdAt: Date.now(),
    });

    return { action: 'created' as const, userId };
  }),
});
