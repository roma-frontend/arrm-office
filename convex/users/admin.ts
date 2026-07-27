import { v } from 'convex/values';
import { getAuthCaller } from '../lib/getAuthCaller';
import { mutation } from '../_generated/server';
import type { MutationCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { MAX_PAGE_SIZE } from '../pagination';
import { SUPERADMIN_EMAIL, isSuperadmin } from '../lib/auth';
import { DEFAULT_LIST_CAP } from '../lib/limits';

// ── Security helpers ──────────────────────────────────────────────────────────
/** Verify caller has admin/superadmin role and return their organizationId */
async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const caller = await getAuthCaller(ctx);
  if (!caller) throw new Error('Not authenticated');
  const admin = (await ctx.db.get(caller._id)) as Doc<'users'> | null;
  if (!admin) throw new Error('Admin not found');
  if (admin.role !== 'admin' && admin.role !== 'superadmin') {
    throw new Error('Only org admins can perform this action');
  }
  return admin;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG — scoped to org
// ─────────────────────────────────────────────────────────────────────────────
export const logAudit = mutation({
  args: {
    userId: v.id('users'),
    action: v.string(),
    target: v.optional(v.string()),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('User not found');

    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId: args.userId,
      action: args.action,
      target: args.target,
      details: args.details,
      createdAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SEED ADMIN (bootstrap — creates first superadmin)
// ─────────────────────────────────────────────────────────────────────────────
export const seedAdmin = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const { name, email, passwordHash, organizationId } = args;
    const existing = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email.toLowerCase()))
      .unique();
    if (existing) return existing._id;

    return await ctx.db.insert('users', {
      organizationId,
      name,
      email: email.toLowerCase(),
      passwordHash,
      role: email.toLowerCase() === SUPERADMIN_EMAIL ? 'superadmin' : 'admin',
      employeeType: 'staff',
      department: 'Management',
      position: 'Administrator',
      isActive: true,
      isApproved: true,
      approvedAt: Date.now(),
      travelAllowance: 20000,
      paidLeaveBalance: 24,
      sickLeaveBalance: 10,
      familyLeaveBalance: 5,
      dayOffBalance: 6,
      maternityLeaveBalance: 0,
      studyLeaveBalance: 5,
      createdAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SUSPEND USER TEMPORARILY (for suspicious activity)
// ─────────────────────────────────────────────────────────────────────────────
export const suspendUser = mutation({
  args: {
    userId: v.id('users'),
    reason: v.string(),
    duration: v.optional(v.number()), // in hours, default 24
  },
  handler: async (ctx, args) => {
    const { userId, reason, duration = 24 } = args;
    const admin = await requireAdmin(ctx);
    const adminId = admin._id;
    const user = await ctx.db.get(userId);

    if (!user) {
      throw new Error('User not found');
    }

    // Verify same organization (unless superadmin)
    if (
      (admin as Doc<'users'>).organizationId !== user.organizationId &&
      !isSuperadmin(admin as Doc<'users'>)
    ) {
      throw new Error('Access denied: cannot suspend users from another organization');
    }

    const suspendedUntil = Date.now() + duration * 60 * 60 * 1000;

    await ctx.db.patch(userId, {
      isSuspended: true,
      suspendedUntil,
      suspendedReason: reason,
      suspendedBy: adminId,
      suspendedAt: Date.now(),
    });

    // Create audit log
    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId: adminId,
      action: 'user_suspended',
      target: user.email,
      details: `User suspended for ${duration}h. Reason: ${reason}`,
      createdAt: Date.now(),
    });

    // Notify user
    await ctx.db.insert('notifications', {
      organizationId: user.organizationId,
      userId,
      type: 'system',
      title: '⚠️ Account Temporarily Suspended',
      message: `Your account has been suspended until ${new Date(suspendedUntil).toLocaleString()}. Reason: ${reason}. Contact your administrator for more information.`,
      isRead: false,
      route: '/security',
      createdAt: Date.now(),
    });

    return { userId, suspendedUntil };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// UNSUSPEND USER
// ─────────────────────────────────────────────────────────────────────────────
export const unsuspendUser = mutation({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { userId } = args;
    const admin = await requireAdmin(ctx);
    const adminId = admin._id;
    const user = await ctx.db.get(userId);

    if (!user) {
      throw new Error('User not found');
    }

    // Verify same organization (unless superadmin)
    if (
      (admin as Doc<'users'>).organizationId !== user.organizationId &&
      !isSuperadmin(admin as Doc<'users'>)
    ) {
      throw new Error('Access denied: cannot unsuspend users from another organization');
    }

    await ctx.db.patch(userId, {
      isSuspended: false,
      suspendedUntil: undefined,
      suspendedReason: undefined,
      suspendedBy: undefined,
      suspendedAt: undefined,
    });

    // Create audit log
    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId: adminId,
      action: 'user_unsuspended',
      target: user.email,
      details: `User unsuspended by ${(admin as Doc<'users'>).name}`,
      createdAt: Date.now(),
    });

    // Notify user
    await ctx.db.insert('notifications', {
      organizationId: user.organizationId,
      userId,
      type: 'system',
      title: '✅ Account Unsuspended',
      message: `Your account has been reactivated by ${(admin as Doc<'users'>).name}. You can now log in again.`,
      isRead: false,
      route: '/security',
      createdAt: Date.now(),
    });

    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-UNSUSPEND expired suspensions (run periodically)
// ─────────────────────────────────────────────────────────────────────────────
export const autoUnsuspendExpired = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // NOTE: Using .take(DEFAULT_LIST_CAP) here because we must check ALL users for expired suspensions (scheduled maintenance task)
    const allUsers = await ctx.db.query('users').order('desc').take(MAX_PAGE_SIZE);

    let count = 0;
    for (const user of allUsers) {
      if (user.isSuspended && user.suspendedUntil && user.suspendedUntil <= now) {
        await ctx.db.patch(user._id, {
          isSuspended: false,
          suspendedUntil: undefined,
          suspendedReason: undefined,
          suspendedBy: undefined,
          suspendedAt: undefined,
        });

        // Notify user
        await ctx.db.insert('notifications', {
          organizationId: user.organizationId,
          userId: user._id,
          type: 'system',
          title: '✅ Suspension Expired',
          message: 'Your temporary suspension has ended. You can now log in again.',
          isRead: false,
          route: '/security',
          createdAt: Date.now(),
        });

        count++;
      }
    }

    return { unsuspended: count };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX SUPERADMIN ROLE - One-time utility to upgrade admin to superadmin
// ─────────────────────────────────────────────────────────────────────────────
export const upgradeSuperadminRole = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', SUPERADMIN_EMAIL))
      .first();

    if (!user) {
      throw new Error('Superadmin user not found');
    }

    if (user.role === 'superadmin') {
      return { message: 'User is already superadmin', email: user.email, role: user.role };
    }

    await ctx.db.patch(user._id, { role: 'superadmin' });

    return {
      message: 'Successfully upgraded to superadmin',
      email: user.email,
      oldRole: user.role,
      newRole: 'superadmin',
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// MIGRATE FACE TO AVATAR (utility)
// ─────────────────────────────────────────────────────────────────────────────
export const migrateFaceToAvatar = mutation({
  args: {},
  handler: async (ctx) => {
    // NOTE: Using .take(DEFAULT_LIST_CAP) here because we must migrate ALL users' face images to avatars (one-time migration task)
    const users = await ctx.db.query('users').order('desc').take(MAX_PAGE_SIZE);
    let count = 0;
    for (const user of users) {
      if (!user.avatarUrl && user.faceImageUrl) {
        await ctx.db.patch(user._id, { avatarUrl: user.faceImageUrl });
        count++;
      }
    }
    return { migrated: count };
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECURED MUTATIONS — verified identity via ctx.auth
// ═══════════════════════════════════════════════════════════════════════════════

export const secureSuspendUser = mutation({
  args: { userId: v.id('users'), reason: v.string(), duration: v.optional(v.number()) },
  handler: async (ctx, { userId, reason, duration = 24 }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    if (caller.role !== 'superadmin' && caller.organizationId !== user.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }

    const suspendedUntil = Date.now() + duration * 60 * 60 * 1000;
    await ctx.db.patch(userId, {
      isSuspended: true,
      suspendedUntil,
      suspendedReason: reason,
      suspendedBy: caller._id,
      suspendedAt: Date.now(),
    });

    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId: caller._id,
      action: 'user_suspended',
      target: user.email,
      details: `Suspended for ${duration}h. Reason: ${reason}`,
      createdAt: Date.now(),
    });

    return { userId, suspendedUntil };
  },
});

export const secureUnsuspendUser = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    if (caller.role !== 'superadmin' && caller.organizationId !== user.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }

    await ctx.db.patch(userId, {
      isSuspended: false,
      suspendedUntil: undefined,
      suspendedReason: undefined,
      suspendedBy: undefined,
      suspendedAt: undefined,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId: caller._id,
      action: 'user_unsuspended',
      target: user.email,
      details: `Unsuspended by ${caller.name}`,
      createdAt: Date.now(),
    });

    return userId;
  },
});
