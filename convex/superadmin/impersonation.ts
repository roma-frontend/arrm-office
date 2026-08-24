import { v } from 'convex/values';
import { query, mutation } from '../_generated/server';
import { MAX_PAGE_SIZE } from '../pagination';
import { requireAuthUserOrThrow } from '../lib/auth';
import { getAuthCaller } from '../lib/getAuthCaller';
import { notify } from '../lib/notify';

// ─── IMPERSONATION ───────────────────────────────────────────────────────────
/**
 * 👤 Start impersonation session
 * Superadmin can temporarily act as another user
 */
export const startImpersonation = mutation({
  args: {
    targetUserId: v.id('users'),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiresAt = now + 3600000; // 1 hour

    const superadmin = await requireAuthUserOrThrow(ctx);
    if (superadmin.role !== 'superadmin') {
      throw new Error('Only superadmin can impersonate users');
    }

    // Get target user
    const targetUser = await ctx.db.get(args.targetUserId);
    if (!targetUser) {
      throw new Error('Target user not found');
    }

    // Get target user's organization
    if (!targetUser.organizationId) {
      throw new Error('Target user has no organization');
    }

    if (targetUser.role === 'superadmin') {
      throw new Error('Impersonating another superadmin is not allowed');
    }

    // Ensure there is only one active session per superadmin.
    const existing = await ctx.db
      .query('impersonationSessions')
      .withIndex('by_superadmin', (q) => q.eq('superadminId', superadmin._id))
      .filter((q) => q.eq(q.field('isActive'), true))
      .take(MAX_PAGE_SIZE);

    await Promise.all(
      existing.map((session) =>
        ctx.db.patch(session._id, {
          isActive: false,
          endedAt: now,
        }),
      ),
    );

    // Generate unique token
    const token = `imp_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 26)}`;

    // Create impersonation session
    const sessionId = await ctx.db.insert('impersonationSessions', {
      superadminId: superadmin._id,
      targetUserId: args.targetUserId,
      organizationId: targetUser.organizationId,
      reason: args.reason,
      token,
      expiresAt,
      startedAt: now,
      endedAt: undefined,
      isActive: true,
    });

    // Audit log
    await ctx.db.insert('auditLogs', {
      organizationId: targetUser.organizationId,
      userId: superadmin._id,
      action: 'IMPERSONATE_USER',
      target: args.targetUserId,
      details: JSON.stringify({
        reason: args.reason,
        targetEmail: targetUser.email,
        targetName: targetUser.name,
        sessionId,
        expiresAt,
      }),
      createdAt: now,
    });

    // Notify target user
    await notify(ctx, {
      organizationId: targetUser.organizationId,
      userId: args.targetUserId,
      type: 'security_alert',
      titleKey: 'notifications.titles.impersonation',
      messageKey: 'notifications.messages.impersonation',
      params: { name: superadmin.name, reason: args.reason },
      fallbackTitle: '👤 Superadmin impersonation',
      fallbackMessage: `${superadmin.name} has started an impersonation session on your account. Reason: ${args.reason}`,
      relatedId: `impersonation:${sessionId}`,
      route: '/settings',
      createdAt: now,
    });

    return {
      sessionId,
      token,
      expiresAt,
      targetUser: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        organizationId: targetUser.organizationId,
      },
    };
  },
});

/**
 * End impersonation session
 */
export const endImpersonation = mutation({
  args: {
    sessionId: v.id('impersonationSessions'),
  },
  handler: async (ctx, args) => {
    const caller = await requireAuthUserOrThrow(ctx);
    if (caller.role !== 'superadmin') {
      throw new Error('Only superadmin can end impersonation sessions');
    }

    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.superadminId !== caller._id) {
      throw new Error('Unauthorized');
    }

    const now = Date.now();

    await ctx.db.patch(args.sessionId, {
      isActive: false,
      endedAt: now,
    });

    // Audit log
    await ctx.db.insert('auditLogs', {
      organizationId: session.organizationId,
      userId: caller._id,
      action: 'END_IMPERSONATION',
      target: session.targetUserId,
      details: JSON.stringify({
        sessionId: args.sessionId,
        duration: now - session.startedAt,
      }),
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * Get active impersonation session for user
 */
export const getActiveImpersonation = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthCaller(ctx);
    if (!caller || caller.role !== 'superadmin') return null;

    const now = Date.now();
    const sessions = await ctx.db
      .query('impersonationSessions')
      .withIndex('by_superadmin', (q) => q.eq('superadminId', caller._id))
      .filter((q) => q.and(q.eq(q.field('isActive'), true), q.gt(q.field('expiresAt'), now)))
      .take(MAX_PAGE_SIZE);

    if (sessions.length === 0) return null;

    const session = sessions[0]!;
    const superadmin = await ctx.db.get(session.superadminId);
    const targetUser = await ctx.db.get(session.targetUserId);

    return {
      sessionId: session._id,
      superadminName: superadmin?.name || 'Unknown',
      superadminEmail: superadmin?.email || '',
      targetUser: targetUser
        ? {
            id: targetUser._id,
            name: targetUser.name,
            email: targetUser.email,
          }
        : null,
      reason: session.reason,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
    };
  },
});

/**
 * Get all impersonation sessions (for audit)
 */
export const getImpersonationHistory = query({
  args: {
    superadminId: v.optional(v.id('users')),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller || caller.role !== 'superadmin') return [];

    if (args.superadminId && args.superadminId !== caller._id) {
      throw new Error('Unauthorized');
    }

    let sessions = await ctx.db
      .query('impersonationSessions')
      .withIndex('by_superadmin', (q) => q.eq('superadminId', caller._id))
      .order('desc')
      .take(MAX_PAGE_SIZE);

    if (args.limit) {
      sessions = sessions.slice(0, args.limit);
    }

    // Enrich with user data
    const enrichedSessions = await Promise.all(
      sessions.map(async (session) => {
        const superadmin = await ctx.db.get(session.superadminId);
        const targetUser = await ctx.db.get(session.targetUserId);
        const org = await ctx.db.get(session.organizationId);

        return {
          ...session,
          superadminName: superadmin?.name || 'Unknown',
          superadminEmail: superadmin?.email || '',
          targetUserName: targetUser?.name || 'Unknown',
          targetUserEmail: targetUser?.email || '',
          organizationName: org?.name || null,
          duration: session.endedAt ? session.endedAt - session.startedAt : null,
        };
      }),
    );

    return enrichedSessions;
  },
});

/**
 * Activate impersonation by token and issue session token for target user.
 * Intended for server API route usage.
 */
export const activateImpersonationSession = mutation({
  args: {
    sessionId: v.id('impersonationSessions'),
    token: v.string(),
    superadminId: v.id('users'),
    targetSessionToken: v.string(),
    targetSessionExpiry: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error('Session not found');
    if (!session.isActive) throw new Error('Session is not active');
    if (session.token !== args.token) throw new Error('Invalid impersonation token');
    if (session.superadminId !== args.superadminId) throw new Error('Unauthorized');
    if (session.expiresAt <= Date.now()) {
      await ctx.db.patch(session._id, { isActive: false, endedAt: Date.now() });
      throw new Error('Impersonation session expired');
    }

    const superadmin = await ctx.db.get(session.superadminId);
    if (!superadmin || superadmin.role !== 'superadmin') {
      throw new Error('Superadmin account not found');
    }

    const targetUser = await ctx.db.get(session.targetUserId);
    if (!targetUser) throw new Error('Target user not found');

    const targetOrg = targetUser.organizationId
      ? await ctx.db.get(targetUser.organizationId)
      : null;
    const superadminOrg = superadmin.organizationId
      ? await ctx.db.get(superadmin.organizationId)
      : null;

    await ctx.db.patch(targetUser._id, {
      sessionToken: args.targetSessionToken,
      sessionExpiry: args.targetSessionExpiry,
      lastLoginAt: Date.now(),
    });

    return {
      sessionId: session._id,
      expiresAt: session.expiresAt,
      token: session.token,
      targetUser: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        organizationId: targetUser.organizationId,
        organizationSlug: targetOrg?.slug,
        organizationName: targetOrg?.name,
        department: targetUser.department,
        position: targetUser.position,
        employeeType: targetUser.employeeType,
        avatar: targetUser.avatarUrl,
        isApproved: targetUser.isApproved,
      },
      superadmin: {
        id: superadmin._id,
        name: superadmin.name,
        email: superadmin.email,
        role: superadmin.role,
        organizationId: superadmin.organizationId,
        organizationSlug: superadminOrg?.slug,
        organizationName: superadminOrg?.name,
        department: superadmin.department,
        position: superadmin.position,
        employeeType: superadmin.employeeType,
        avatar: superadmin.avatarUrl,
        isApproved: superadmin.isApproved,
      },
    };
  },
});

/**
 * End impersonation by validating the original token and restoring a fresh
 * superadmin session token.
 */
export const endImpersonationWithToken = mutation({
  args: {
    sessionId: v.id('impersonationSessions'),
    token: v.string(),
    restoredSessionToken: v.string(),
    restoredSessionExpiry: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error('Session not found');
    if (session.token !== args.token) throw new Error('Invalid impersonation token');

    const now = Date.now();
    if (session.isActive) {
      await ctx.db.patch(session._id, {
        isActive: false,
        endedAt: now,
      });

      await ctx.db.insert('auditLogs', {
        organizationId: session.organizationId,
        userId: session.superadminId,
        action: 'END_IMPERSONATION',
        target: session.targetUserId,
        details: JSON.stringify({
          sessionId: session._id,
          duration: now - session.startedAt,
          endedBy: 'token_restore',
        }),
        createdAt: now,
      });
    }

    const superadmin = await ctx.db.get(session.superadminId);
    if (!superadmin || superadmin.role !== 'superadmin') {
      throw new Error('Superadmin account not found');
    }

    const superadminOrg = superadmin.organizationId
      ? await ctx.db.get(superadmin.organizationId)
      : null;

    await ctx.db.patch(superadmin._id, {
      sessionToken: args.restoredSessionToken,
      sessionExpiry: args.restoredSessionExpiry,
      lastLoginAt: now,
    });

    return {
      superadmin: {
        id: superadmin._id,
        name: superadmin.name,
        email: superadmin.email,
        role: superadmin.role,
        organizationId: superadmin.organizationId,
        organizationSlug: superadminOrg?.slug,
        organizationName: superadminOrg?.name,
        department: superadmin.department,
        position: superadmin.position,
        employeeType: superadmin.employeeType,
        avatar: superadmin.avatarUrl,
        isApproved: superadmin.isApproved,
      },
    };
  },
});
