import { v } from 'convex/values';
import { getAuthCaller } from '../lib/getAuthCaller';
import { mutation, internalMutation } from '../_generated/server';
import type { MutationCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { MAX_PAGE_SIZE } from '../pagination';
import { SUPERADMIN_EMAIL, isSuperadmin } from '../lib/auth';
import { resolveTravelAllowanceForOrg } from '../lib/travelAllowance';
import { notify } from '../lib/notify';
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
/**
 * Internal: an audit trail that any client could write, with any userId, is not
 * an audit trail — a caller could forge entries and attribute them to someone
 * else. Nothing calls this from the client (the secure* mutations below insert
 * their own entries), so it is server-only.
 */
export const logAudit = internalMutation({
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
/**
 * Internal: as a public mutation this was an account-creation backdoor — an
 * anonymous caller could insert an approved, active `admin` user into any
 * organization with a passwordHash of their choosing (or `superadmin`, if they
 * passed the bootstrap email), i.e. take over any tenant. No client calls it;
 * it is a bootstrap step run via `npx convex run`.
 */
export const seedAdmin = internalMutation({
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
      travelAllowance: await resolveTravelAllowanceForOrg(ctx, organizationId, 'staff'),
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
    // Kept locale-neutral: params are interpolated in the reader's language, so a
    // date pre-formatted for one locale here would be wrong for the other three.
    const until = new Date(suspendedUntil).toISOString().slice(0, 16).replace('T', ' ');

    await notify(ctx, {
      organizationId: user.organizationId,
      userId,
      type: 'system',
      titleKey: 'notifications.titles.accountSuspended',
      messageKey: 'notifications.messages.accountSuspended',
      params: { until, reason },
      fallbackTitle: '⚠️ Account Temporarily Suspended',
      fallbackMessage: `Your account has been suspended until ${until}. Reason: ${reason}. Contact your administrator for more information.`,
      route: '/settings',
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
    await notify(ctx, {
      organizationId: user.organizationId,
      userId,
      type: 'system',
      titleKey: 'notifications.titles.accountUnsuspended',
      messageKey: 'notifications.messages.accountUnsuspended',
      params: { adminName: (admin as Doc<'users'>).name },
      fallbackTitle: '✅ Account Unsuspended',
      fallbackMessage: `Your account has been reactivated by ${(admin as Doc<'users'>).name}. You can now log in again.`,
      route: '/settings',
    });

    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-UNSUSPEND expired suspensions (run periodically)
// ─────────────────────────────────────────────────────────────────────────────
export const autoUnsuspendExpired = internalMutation({
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
        await notify(ctx, {
          organizationId: user.organizationId,
          userId: user._id,
          type: 'system',
          titleKey: 'notifications.titles.suspensionExpired',
          messageKey: 'notifications.messages.suspensionExpired',
          fallbackTitle: '✅ Suspension Expired',
          fallbackMessage: 'Your temporary suspension has ended. You can now log in again.',
          route: '/dashboard',
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
/**
 * Internal: this grants the superadmin role by env-pinned email with no caller
 * check at all, so as a public mutation anyone on the internet could promote
 * that account. One-time utility, run via `npx convex run`.
 */
export const upgradeSuperadminRole = internalMutation({
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
/**
 * Backfills avatarUrl from faceImageUrl. The settings page fires this on mount
 * for admins, so it stays public — but it now requires an admin caller and only
 * touches that admin's own organization. Previously any caller could rewrite
 * the avatar of every user in every tenant.
 */
export const migrateFaceToAvatar = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    const users = await ctx.db.query('users').order('desc').take(MAX_PAGE_SIZE);
    let count = 0;
    for (const user of users) {
      if (!isSuperadmin(admin) && user.organizationId !== admin.organizationId) continue;
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
