import { v } from 'convex/values';
import { query, mutation } from '../_generated/server';
import { Id } from '../_generated/dataModel';
import { MAX_PAGE_SIZE } from '../pagination';
import { withAuth } from '../lib/withAuth';

// ─── IMPERSONATION ───────────────────────────────────────────────────────────
/**
 * 👤 Start impersonation session
 * Superadmin can temporarily act as another user
 */
export const startImpersonation = mutation({
  args: {
    superadminId: v.id('users'),
    targetUserId: v.id('users'),
    reason: v.string(),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const now = Date.now();
    const expiresAt = now + 3600000; // 1 hour

    // Verify superadmin
    const superadmin = (await ctx.db.get(args.superadminId)) as any;
    if (!superadmin || superadmin.role !== 'superadmin') {
      throw new Error('Only superadmin can impersonate users');
    }

    // Get target user
    const targetUser = (await ctx.db.get(args.targetUserId)) as any;
    if (!targetUser) {
      throw new Error('Target user not found');
    }

    // Get target user's organization
    if (!targetUser.organizationId) {
      throw new Error('Target user has no organization');
    }

    // Generate unique token
    const token = `imp_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 26)}`;

    // Create impersonation session
    const sessionId = await ctx.db.insert('impersonationSessions', {
      superadminId: args.superadminId,
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
      userId: args.superadminId,
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
    await ctx.db.insert('notifications', {
      organizationId: targetUser.organizationId,
      userId: args.targetUserId,
      type: 'security_alert',
      title: '👤 Superadmin impersonation',
      message: `${superadmin.name} has started an impersonation session on your account. Reason: ${args.reason}`,
      isRead: false,
      relatedId: `impersonation:${sessionId}`,
      route: '/security',
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
  }),
});

/**
 * End impersonation session
 */
export const endImpersonation = mutation({
  args: {
    sessionId: v.id('impersonationSessions'),
    userId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const session = (await ctx.db.get(args.sessionId)) as any;
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.superadminId !== args.userId) {
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
      userId: args.userId,
      action: 'END_IMPERSONATION',
      target: session.targetUserId,
      details: JSON.stringify({
        sessionId: args.sessionId,
        duration: now - session.startedAt,
      }),
      createdAt: now,
    });

    return { success: true };
  }),
});

/**
 * Get active impersonation session for user
 */
export const getActiveImpersonation = query({
  args: { userId: v.id('users') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const sessions = await ctx.db
      .query('impersonationSessions')
      .withIndex('by_active', (q) => q.eq('isActive', true))
      .filter((q: any) => q.eq(q.field('targetUserId'), args.userId))
      .take(MAX_PAGE_SIZE);

    if (sessions.length === 0) return null;

    const session = sessions[0]!;
    const superadmin = (await ctx.db.get(session.superadminId)) as any;
    const targetUser = (await ctx.db.get(session.targetUserId)) as any;

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
  }),
});

/**
 * Get all impersonation sessions (for audit)
 */
export const getImpersonationHistory = query({
  args: {
    superadminId: v.optional(v.id('users')),
    limit: v.optional(v.number()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    let sessions = await ctx.db.query('impersonationSessions').order('desc').take(MAX_PAGE_SIZE);

    if (args.superadminId) {
      sessions = sessions.filter((s: any) => s.superadminId === args.superadminId);
    }

    if (args.limit) {
      sessions = sessions.slice(0, args.limit);
    }

    // Enrich with user data
    const enrichedSessions = await Promise.all(
      sessions.map(async (session) => {
        const superadmin = (await ctx.db.get(session.superadminId)) as any;
        const targetUser = (await ctx.db.get(session.targetUserId)) as any;
        const org = (await ctx.db.get(session.organizationId)) as any;

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
  }),
});
