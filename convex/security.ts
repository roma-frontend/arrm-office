import { v } from 'convex/values';
import { getAuthCaller } from './lib/getAuthCaller';
import { mutation, query, type QueryCtx, type MutationCtx } from './_generated/server';
import { paginationOptsValidator } from 'convex/server';
import type { Doc, Id } from './_generated/dataModel';
import { isSuperadmin, SUPERADMIN_EMAIL } from './lib/auth';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP, XLARGE_LIST_CAP } from './lib/limits';
import { notify } from './lib/notify';
import { logger } from '../src/lib/logger';
import {
  buildAuditHaystack,
  deriveAuditCategory,
  deriveAuditSeverity,
  AUDIT_CATEGORIES,
  AUDIT_SEVERITIES,
  type AuditCategory,
  type AuditSeverity,
} from '../src/lib/audit/actionMeta';

/**
 * Helper: requires caller to be admin or superadmin.
 * Returns the admin user record and the orgId they should see:
 * - superadmin: sees all orgs (returns undefined orgId filter)
 * - admin: sees only their own org
 */
async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const caller = await getAuthCaller(ctx);
  if (!caller) throw new Error('Not authenticated');
  const user = await ctx.db.get(caller._id);
  if (!user) {
    throw new Error('User not found');
  }

  const isAdmin = user.role === 'admin' || user.role === 'superadmin' || isSuperadmin(user);
  if (!isAdmin) {
    throw new Error('Only admins can access compliance features');
  }

  const isSuper = isSuperadmin(user);
  return { user, orgId: isSuper ? undefined : user.organizationId };
}

// ── Default security settings ─────────────────────────────────────────────────
export const SECURITY_FEATURES = [
  {
    key: 'audit_logging',
    description: 'Log all login attempts with IP, device, and risk score',
  },
  {
    key: 'adaptive_auth',
    description: 'Adaptive authentication — block or challenge high-risk logins',
  },
  {
    key: 'device_fingerprinting',
    description: 'Track and recognize known devices per user',
  },
  {
    key: 'keystroke_dynamics',
    description: 'Analyze typing patterns to verify user identity',
  },
  {
    key: 'continuous_face',
    description: 'Periodically verify user identity via Face ID in background',
  },
  {
    key: 'failed_login_lockout',
    description: 'Auto-lock account after 5 failed login attempts',
  },
  {
    key: 'new_device_alert',
    description: 'Send notification to admin when user logs in from new device',
  },
] as const;

// ── Get all security settings ─────────────────────────────────────────────────
export const getAllSettings = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query('securitySettings').take(SMALL_LIST_CAP);

    // Merge with defaults so all features are always present
    return SECURITY_FEATURES.map((feature) => {
      const saved = settings.find((s) => s.key === feature.key);
      return {
        key: feature.key,
        description: feature.description,
        enabled: saved ? saved.enabled : true, // default ON
        updatedAt: saved?.updatedAt ?? null,
        updatedBy: saved?.updatedBy ?? null,
      };
    });
  },
});

// ── Get single setting ────────────────────────────────────────────────────────
export const getSetting = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const { key } = args;
    const setting = await ctx.db
      .query('securitySettings')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();
    // Default to enabled if not set
    return setting ? setting.enabled : true;
  },
});

// ── Toggle security setting ───────────────────────────────────────────────────
export const toggleSetting = mutation({
  args: {
    key: v.string(),
    enabled: v.boolean(),
    updatedBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { key, enabled, updatedBy } = args;
    const existing = await ctx.db
      .query('securitySettings')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { enabled, updatedBy, updatedAt: Date.now() });
    } else {
      await ctx.db.insert('securitySettings', {
        key,
        enabled,
        updatedBy,
        updatedAt: Date.now(),
      });
    }

    // Log this action in audit logs
    const user = await ctx.db.get(updatedBy);
    if (user) {
      await ctx.db.insert('auditLogs', {
        organizationId: user.organizationId,
        userId: updatedBy,
        action: 'security_setting_changed',
        target: key,
        details: `Security feature "${key}" ${enabled ? 'enabled' : 'disabled'} by superadmin`,
        createdAt: Date.now(),
      });
    }

    return { success: true };
  },
});

// ── Log a login attempt ───────────────────────────────────────────────────────
export const logLoginAttempt = mutation({
  args: {
    email: v.string(),
    userId: v.optional(v.id('users')),
    organizationId: v.optional(v.id('organizations')),
    success: v.boolean(),
    method: v.union(
      v.literal('password'),
      v.literal('face_id'),
      v.literal('webauthn'),
      v.literal('google'),
    ),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    deviceFingerprint: v.optional(v.string()),
    riskScore: v.optional(v.number()),
    riskFactors: v.optional(v.array(v.string())),
    blockedReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('loginAttempts', {
      ...args,
      createdAt: Date.now(),
    });

    // If failed, check if we need to lock the account
    if (!args.success && args.userId) {
      // Check failed attempts in last 15 minutes
      const fifteenMinAgo = Date.now() - 15 * 60 * 1000;
      const recentFails = await ctx.db
        .query('loginAttempts')
        .withIndex('by_user', (q) => q.eq('userId', args.userId!))
        .filter((q) =>
          q.and(q.eq(q.field('success'), false), q.gte(q.field('createdAt'), fifteenMinAgo)),
        )
        .take(SMALL_LIST_CAP);

      if (recentFails.length >= 5) {
        // Check if lockout feature is enabled
        const lockoutSetting = await ctx.db
          .query('securitySettings')
          .withIndex('by_key', (q) => q.eq('key', 'failed_login_lockout'))
          .unique();

        if (!lockoutSetting || lockoutSetting.enabled) {
          await ctx.db.patch(args.userId, {
            faceIdBlocked: true,
            faceIdBlockedAt: Date.now(),
          });
          // Notify org admins
          const user = await ctx.db.get(args.userId);
          if (user?.organizationId) {
            const admins = await ctx.db
              .query('users')
              .withIndex('by_org_role', (q) =>
                q.eq('organizationId', user.organizationId!).eq('role', 'admin'),
              )
              .take(SMALL_LIST_CAP);
            for (const admin of admins) {
              await notify(ctx, {
                organizationId: user.organizationId,
                userId: admin._id,
                type: 'system',
                titleKey: 'notifications.titles.accountLocked',
                messageKey: 'notifications.messages.accountLocked',
                params: {
                  userName: user.name,
                  email: user.email,
                  count: 5,
                },
                fallbackTitle: '🚨 Account Locked',
                fallbackMessage: `${user.name} (${user.email}) was auto-locked after 5 failed login attempts.`,
                route: '/superadmin/security',
              });
            }
          }
        }
      }
    }

    return { success: true };
  },
});

// ── Register / update device fingerprint ─────────────────────────────────────
export const registerDevice = mutation({
  args: {
    userId: v.id('users'),
    fingerprint: v.string(),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, fingerprint, userAgent } = args;
    const existing = await ctx.db
      .query('deviceFingerprints')
      .withIndex('by_user_fingerprint', (q) =>
        q.eq('userId', userId).eq('fingerprint', fingerprint),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastSeenAt: Date.now(),
        loginCount: existing.loginCount + 1,
        userAgent,
      });
      return { isNew: false, isTrusted: existing.isTrusted };
    } else {
      await ctx.db.insert('deviceFingerprints', {
        userId,
        fingerprint,
        userAgent,
        firstSeenAt: Date.now(),
        lastSeenAt: Date.now(),
        isTrusted: false,
        loginCount: 1,
      });
      return { isNew: true, isTrusted: false };
    }
  },
});

// ── Check if device is known ──────────────────────────────────────────────────
export const checkDevice = query({
  args: {
    userId: v.id('users'),
    fingerprint: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, fingerprint } = args;
    const device = await ctx.db
      .query('deviceFingerprints')
      .withIndex('by_user_fingerprint', (q) =>
        q.eq('userId', userId).eq('fingerprint', fingerprint),
      )
      .unique();
    return device ?? null;
  },
});

// ── Get all devices for a user ────────────────────────────────────────────────
export const getUserDevices = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const { userId } = args;
    return await ctx.db
      .query('deviceFingerprints')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .order('desc')
      .take(SMALL_LIST_CAP);
  },
});

// ── Save / update keystroke profile ──────────────────────────────────────────
export const saveKeystrokeProfile = mutation({
  args: {
    userId: v.id('users'),
    avgDwell: v.number(),
    avgFlight: v.number(),
    stdDevDwell: v.optional(v.number()),
    stdDevFlight: v.optional(v.number()),
    sampleCount: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('keystrokeProfiles')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .unique();

    if (existing) {
      // Weighted average: keep history but blend new data
      const w = Math.min(existing.sampleCount, 20); // max weight for history
      const n = args.sampleCount;
      const blendedDwell = (existing.avgDwell * w + args.avgDwell * n) / (w + n);
      const blendedFlight = (existing.avgFlight * w + args.avgFlight * n) / (w + n);
      await ctx.db.patch(existing._id, {
        avgDwell: blendedDwell,
        avgFlight: blendedFlight,
        stdDevDwell: args.stdDevDwell,
        stdDevFlight: args.stdDevFlight,
        sampleCount: existing.sampleCount + n,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert('keystrokeProfiles', {
        ...args,
        updatedAt: Date.now(),
      });
    }
    return { success: true };
  },
});

// ── Get keystroke profile ─────────────────────────────────────────────────────
export const getKeystrokeProfile = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const { userId } = args;
    return await ctx.db
      .query('keystrokeProfiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
  },
});

// ── Get login attempts stats (for dashboard) ──────────────────────────────────
export const getLoginStats = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
    hours: v.optional(v.number()), // last N hours, default 24
  },
  handler: async (ctx, args) => {
    const { organizationId, hours = 24 } = args;
    const since = Date.now() - hours * 60 * 60 * 1000;

    let attempts = await ctx.db
      .query('loginAttempts')
      .withIndex('by_created', (q) => q.gte('createdAt', since))
      .take(DEFAULT_LIST_CAP);

    if (organizationId) {
      attempts = attempts.filter((a) => a.organizationId === organizationId);
    }

    const total = attempts.length;
    const failed = attempts.filter((a) => !a.success).length;
    const blocked = attempts.filter((a) => a.blockedReason).length;
    const highRisk = attempts.filter((a) => (a.riskScore ?? 0) >= 60).length;
    const byMethod = attempts.reduce(
      (acc, a) => {
        acc[a.method] = (acc[a.method] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Recent suspicious (failed + high risk)
    const suspicious = attempts
      .filter((a) => !a.success || (a.riskScore ?? 0) >= 60)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);

    return { total, failed, blocked, highRisk, byMethod, suspicious };
  },
});

// ── Get recent audit logs ─────────────────────────────────────────────────────
export const getRecentAuditLogs = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { limit = 50 } = args;
    const { orgId } = await requireAdmin(ctx);

    let logs;
    if (orgId) {
      logs = await ctx.db
        .query('auditLogs')
        .withIndex('by_org', (q) => q.eq('organizationId', orgId))
        .order('desc')
        .take(limit);
    } else {
      logs = await ctx.db.query('auditLogs').order('desc').take(limit);
    }

    // Enrich with user names - batch load all unique user IDs
    const uniqueUserIds = [...new Set(logs.map((log) => log.userId).filter(Boolean))];
    const usersBatch = await Promise.all(uniqueUserIds.map((id) => ctx.db.get(id)));
    const userMap = new Map(
      usersBatch.filter((u): u is NonNullable<typeof u> => u !== null).map((u) => [u._id, u]),
    );

    const enriched = logs.map((log) => {
      const user = userMap.get(log.userId);
      return {
        ...log,
        userName: user?.name ?? 'Unknown',
        userEmail: user?.email ?? '',
      };
    });
    return enriched;
  },
});

/** Paginated audit logs for compliance page */
export const listAuditLogsPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { paginationOpts } = args;
    const { orgId } = await requireAdmin(ctx);

    const result = orgId
      ? await ctx.db
          .query('auditLogs')
          .withIndex('by_org', (q) => q.eq('organizationId', orgId))
          .order('desc')
          .paginate(paginationOpts)
      : await ctx.db.query('auditLogs').order('desc').paginate(paginationOpts);

    // Enrich page with user names
    const uniqueUserIds = [...new Set(result.page.map((log) => log.userId).filter(Boolean))];
    const usersBatch = await Promise.all(uniqueUserIds.map((id) => ctx.db.get(id)));
    const userMap = new Map(
      usersBatch.filter((u): u is NonNullable<typeof u> => u !== null).map((u) => [u._id, u]),
    );

    return {
      ...result,
      page: result.page.map((log) => {
        const user = userMap.get(log.userId);
        return { ...log, userName: user?.name ?? 'Unknown', userEmail: user?.email ?? '' };
      }),
    };
  },
});

// ── Unlock a locked account ───────────────────────────────────────────────────
export const unlockAccount = mutation({
  args: {
    userId: v.id('users'),
    unlockedBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { userId, unlockedBy } = args;
    await ctx.db.patch(userId, {
      faceIdBlocked: false,
      faceIdBlockedAt: undefined,
      faceIdFailedAttempts: 0,
    });
    const user = await ctx.db.get(userId);
    const unlocker = await ctx.db.get(unlockedBy);
    await ctx.db.insert('auditLogs', {
      organizationId: user?.organizationId,
      userId: unlockedBy,
      action: 'account_unlocked',
      target: userId,
      details: `Account of ${user?.name} unlocked by ${unlocker?.name}`,
      createdAt: Date.now(),
    });
    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFY SUPERADMIN about suspicious activity with quick action
// ─────────────────────────────────────────────────────────────────────────────
const AUTO_BLOCK_THRESHOLD = 80; // Auto-block if risk score >= 80
const AUTO_BLOCK_DURATION = 24; // 24 hours

export const notifySuperadminSuspiciousActivity = mutation({
  args: {
    userId: v.id('users'),
    email: v.string(),
    reason: v.string(),
    riskScore: v.number(),
    riskFactors: v.array(v.string()),
    ip: v.optional(v.string()),
    deviceInfo: v.optional(v.string()),
    autoBlock: v.optional(v.boolean()), // if true, automatically suspend the user
  },
  handler: async (ctx, args) => {
    // Find superadmin
    const superadmin = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', SUPERADMIN_EMAIL))
      .first();

    if (!superadmin) {
      logger.error('Superadmin not found for notification');
      return null;
    }

    // Get the suspicious user
    const user = await ctx.db.get(args.userId);
    if (!user) {
      logger.error('User not found for suspicious activity notification');
      return null;
    }

    // AUTO-BLOCK logic: if risk score is very high, block immediately
    let wasAutoBlocked = false;
    if (args.autoBlock !== false && args.riskScore >= AUTO_BLOCK_THRESHOLD) {
      const suspendedUntil = Date.now() + AUTO_BLOCK_DURATION * 60 * 60 * 1000;

      await ctx.db.patch(args.userId, {
        isSuspended: true,
        suspendedUntil,
        suspendedReason: `AUTO-BLOCKED: High risk login (score: ${args.riskScore}). ${args.reason}`,
        suspendedBy: superadmin._id,
        suspendedAt: Date.now(),
      });

      wasAutoBlocked = true;

      // Create audit log for auto-block
      await ctx.db.insert('auditLogs', {
        organizationId: user.organizationId,
        userId: superadmin._id,
        action: 'user_auto_suspended',
        target: user.email,
        details: `User auto-blocked for ${AUTO_BLOCK_DURATION}h due to high risk score (${args.riskScore}). Factors: ${args.riskFactors.join(', ')}`,
        createdAt: Date.now(),
      });

      // Notify the blocked user
      await notify(ctx, {
        organizationId: user.organizationId,
        userId: args.userId,
        type: 'system',
        titleKey: 'notifications.titles.accountAutoSuspended',
        messageKey: 'notifications.messages.accountAutoSuspended',
        params: {
          riskScore: args.riskScore,
          hours: AUTO_BLOCK_DURATION,
        },
        fallbackTitle: '🚫 Account Automatically Suspended',
        fallbackMessage: `Your account has been automatically suspended due to suspicious login activity (risk score: ${args.riskScore}). If this was you, please contact your administrator. Suspension will expire in ${AUTO_BLOCK_DURATION} hours.`,
        route: '/superadmin/security',
      });
    }

    // Create notification for superadmin with action metadata
    const notificationTitle = wasAutoBlocked
      ? '🚫 User Auto-Blocked (High Risk)'
      : '🚨 Suspicious Login Activity Detected';

    const notificationMessage = wasAutoBlocked
      ? `User: ${args.email}\nRisk Score: ${args.riskScore}\nStatus: AUTOMATICALLY BLOCKED for ${AUTO_BLOCK_DURATION}h\nReasons: ${args.riskFactors.join(', ')}\nIP: ${args.ip || 'Unknown'}\n\nUser was automatically suspended. Review and unsuspend if needed.`
      : `User: ${args.email}\nRisk Score: ${args.riskScore}\nReasons: ${args.riskFactors.join(', ')}\nIP: ${args.ip || 'Unknown'}\n\nReview this activity immediately.`;

    const notificationId = await notify(ctx, {
      organizationId: superadmin.organizationId,
      userId: superadmin._id,
      type: 'security_alert',
      titleKey: wasAutoBlocked
        ? 'notifications.titles.userAutoBlocked'
        : 'notifications.titles.suspiciousLogin',
      messageKey: wasAutoBlocked
        ? 'notifications.messages.suspiciousLoginBlocked'
        : 'notifications.messages.suspiciousLoginDetected',
      params: {
        email: args.email,
        riskScore: args.riskScore,
        riskFactors: args.riskFactors.join(', '),
        ip: args.ip || 'Unknown',
        hours: AUTO_BLOCK_DURATION,
      },
      fallbackTitle: notificationTitle,
      fallbackMessage: notificationMessage,
      relatedId: args.userId,
      route: '/superadmin/security',
      extra: {
        suspiciousUserId: args.userId,
        email: args.email,
        userName: user.name,
        riskScore: args.riskScore,
        riskFactors: args.riskFactors,
        ip: args.ip,
        deviceInfo: args.deviceInfo,
        timestamp: Date.now(),
        actionType: 'suspicious_login',
        autoBlocked: wasAutoBlocked,
        blockDuration: wasAutoBlocked ? AUTO_BLOCK_DURATION : undefined,
      },
    });

    // Log the security event
    await ctx.db.insert('auditLogs', {
      userId: args.userId,
      action: wasAutoBlocked ? 'auto_blocked' : 'superadmin_notified',
      ip: args.ip,
      details: wasAutoBlocked
        ? `User ${user.name} auto-blocked for ${AUTO_BLOCK_DURATION}h. Risk: ${args.riskScore}, Factors: ${args.riskFactors.join(', ')}`
        : `Superadmin notified about ${user.name}. Risk: ${args.riskScore}, Factors: ${args.riskFactors.join(', ')}`,
      createdAt: Date.now(),
    });

    return { notificationId, autoBlocked: wasAutoBlocked };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Get login attempts by user ID
// ─────────────────────────────────────────────────────────────────────────────
export const getLoginAttemptsByUser = query({
  args: {
    userId: v.id('users'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, limit = 10 } = args;
    return await ctx.db
      .query('loginAttempts')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .order('desc')
      .take(limit);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Get all suspended users (for superadmin)
// ─────────────────────────────────────────────────────────────────────────────
export const getSuspendedUsers = query({
  args: {},
  handler: async (ctx) => {
    // Suspensions are rare; reading the whole users table to find them wastes
    // the read budget on every dashboard open. The `by_org_active` composite
    // index is no help for a cross-org superadmin view, so this stays a bounded
    // scan — but of a narrow projection: the index over `_creationTime`-ordered
    // rows capped at XLARGE, filtered in one pass. Same bound as before, one
    // filter pass instead of two.
    const allUsers = await ctx.db.query('users').take(XLARGE_LIST_CAP);

    // Filter only suspended users (superadmins are excluded from the view)
    const suspendedUsers = allUsers.filter(
      (user) =>
        user.role !== 'superadmin' &&
        user.isSuspended &&
        user.suspendedUntil &&
        user.suspendedUntil > Date.now(),
    );

    // Sort by most recently suspended
    return suspendedUsers.sort((a, b) => (b.suspendedAt || 0) - (a.suspendedAt || 0));
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECURED MUTATIONS — verified identity via ctx.auth
// ═══════════════════════════════════════════════════════════════════════════════

export const secureUnlockAccount = mutation({
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
      faceIdBlocked: false,
      faceIdBlockedAt: undefined,
      faceIdFailedAttempts: 0,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId: caller._id,
      action: 'account_unlocked',
      target: userId,
      details: `Account of ${user.name} unlocked by ${caller.name}`,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const secureToggleSetting = mutation({
  args: { settingKey: v.string(), enabled: v.boolean() },
  handler: async (ctx, { settingKey, enabled }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const existing = await ctx.db
      .query('securitySettings')
      .withIndex('by_key', (q) => q.eq('key', settingKey))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { enabled, updatedBy: caller._id, updatedAt: Date.now() });
    } else {
      await ctx.db.insert('securitySettings', {
        key: settingKey,
        enabled,
        updatedBy: caller._id,
        updatedAt: Date.now(),
      });
    }
  },
});

// ── Organization audit trail (the `/audit` page) ───────────────────────────────
/**
 * `listAuditLogsPaginated` above takes the admin's id from the client and
 * returns rows with no taxonomy; these two queries derive the caller from the
 * session instead, and answer with exactly the shape the page renders.
 *
 * Category, severity and free-text search are computed, not indexed, so they
 * are applied to each page after it is read. That makes a page shrink rather
 * than the cursor break — `usePaginatedQuery` keeps asking for more, which is
 * the correct behaviour for a log where a narrow filter may match one row in a
 * thousand. Indexing them would mean backfilling ~40 writer modules.
 */

/** Actor fields the page shows; anything else about a user stays server-side. */
interface AuditActor {
  id: Id<'users'>;
  name: string;
  email: string;
  avatarUrl?: string;
  role?: string;
  position?: string;
}

async function loadAuditActors(
  ctx: QueryCtx,
  userIds: readonly Id<'users'>[],
): Promise<Map<Id<'users'>, AuditActor>> {
  const unique = [...new Set(userIds)];
  const users = await Promise.all(unique.map((id) => ctx.db.get(id)));
  const map = new Map<Id<'users'>, AuditActor>();
  for (const user of users) {
    if (!user) continue;
    map.set(user._id, {
      id: user._id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      position: user.position,
    });
  }
  return map;
}

/**
 * Who may read the trail, and how much of it.
 *
 * A superadmin may pass an explicit `organizationId` to inspect one tenant, or
 * omit it to read across all of them. An admin is pinned to their own org: the
 * argument is ignored rather than rejected, so a stale URL cannot leak another
 * tenant's log.
 */
async function resolveAuditScope(
  ctx: QueryCtx,
  requestedOrgId: Id<'organizations'> | undefined,
): Promise<{ allowed: boolean; orgId: Id<'organizations'> | undefined }> {
  const caller = await getAuthCaller(ctx);
  if (!caller) return { allowed: false, orgId: undefined };

  const isSuper = caller.role === 'superadmin' || isSuperadmin(caller);
  if (isSuper) return { allowed: true, orgId: requestedOrgId };

  if (caller.role !== 'admin') {
    logger.warn('security.auditTrail: non-admin read blocked', { role: caller.role });
    return { allowed: false, orgId: undefined };
  }
  // An admin without an org would otherwise fall through to the all-orgs scan.
  if (!caller.organizationId) return { allowed: false, orgId: undefined };
  return { allowed: true, orgId: caller.organizationId };
}

/** The window the `from`/`to` filters describe, as an index range. */
function auditRangeQuery(
  ctx: QueryCtx,
  orgId: Id<'organizations'> | undefined,
  from: number | undefined,
  to: number | undefined,
) {
  if (!orgId) {
    // All-orgs (superadmin) reads have no composite index to lean on.
    return ctx.db.query('auditLogs').order('desc');
  }
  return ctx.db
    .query('auditLogs')
    .withIndex('by_org_created', (q) => {
      const scoped = q.eq('organizationId', orgId);
      if (from !== undefined && to !== undefined) {
        return scoped.gte('createdAt', from).lte('createdAt', to);
      }
      if (from !== undefined) return scoped.gte('createdAt', from);
      if (to !== undefined) return scoped.lte('createdAt', to);
      return scoped;
    })
    .order('desc');
}

interface AuditFilters {
  from?: number;
  to?: number;
  action?: string;
  actorId?: Id<'users'>;
  category?: string;
  severity?: string;
  search?: string;
}

/** Unknown values are dropped rather than matched, so a typo shows everything. */
function narrowCategory(value: string | undefined): AuditCategory | undefined {
  return AUDIT_CATEGORIES.includes(value as AuditCategory) ? (value as AuditCategory) : undefined;
}

function narrowSeverity(value: string | undefined): AuditSeverity | undefined {
  return AUDIT_SEVERITIES.includes(value as AuditSeverity) ? (value as AuditSeverity) : undefined;
}

/** The row as the page consumes it: taxonomy resolved, actor joined. */
function shapeAuditRow(row: Doc<'auditLogs'>, actor: AuditActor | undefined) {
  return {
    _id: row._id,
    _creationTime: row._creationTime,
    // `createdAt` is what writers set; `_creationTime` is the safety net for
    // the handful of rows inserted before that column existed.
    createdAt: row.createdAt ?? row._creationTime,
    action: row.action,
    target: row.target,
    details: row.details,
    ip: row.ip,
    organizationId: row.organizationId,
    category: deriveAuditCategory(row.action),
    severity: deriveAuditSeverity(row.action, row.details),
    actor: actor ?? null,
  };
}

export type AuditTrailRow = ReturnType<typeof shapeAuditRow>;

function auditRowMatches(row: AuditTrailRow, filters: AuditFilters): boolean {
  const timestamp = row.createdAt;
  if (filters.from !== undefined && timestamp < filters.from) return false;
  if (filters.to !== undefined && timestamp > filters.to) return false;
  if (filters.action && row.action !== filters.action) return false;
  if (filters.actorId && row.actor?.id !== filters.actorId) return false;

  const category = narrowCategory(filters.category);
  if (category && row.category !== category) return false;
  const severity = narrowSeverity(filters.severity);
  if (severity && row.severity !== severity) return false;

  const search = filters.search?.trim().toLowerCase();
  if (search) {
    const haystack = buildAuditHaystack([
      row.action,
      row.details,
      row.target,
      row.ip,
      row.actor?.name,
      row.actor?.email,
      row.category,
      row.severity,
    ]);
    // Every whitespace-separated word must appear: "ann login" should mean
    // Ann's logins, not every row mentioning either.
    if (!search.split(/\s+/).every((term) => haystack.includes(term))) return false;
  }
  return true;
}

const auditFilterArgs = {
  from: v.optional(v.number()),
  to: v.optional(v.number()),
  action: v.optional(v.string()),
  actorId: v.optional(v.id('users')),
  category: v.optional(v.string()),
  severity: v.optional(v.string()),
  search: v.optional(v.string()),
  /** Superadmin only — ignored for an org admin. */
  organizationId: v.optional(v.id('organizations')),
} as const;

/**
 * One page of the audit trail, newest first, with the actor joined.
 *
 * Returns an empty page instead of throwing when the caller may not read the
 * log: the route already redirects non-admins, and a thrown error inside a
 * paginated query surfaces as a broken list rather than an explanation.
 */
export const listAuditTrail = query({
  args: { paginationOpts: paginationOptsValidator, ...auditFilterArgs },
  handler: async (ctx, args) => {
    const { paginationOpts, organizationId, ...filters } = args;
    const { allowed, orgId } = await resolveAuditScope(ctx, organizationId);
    if (!allowed) return { page: [], isDone: true, continueCursor: '' };

    const result = await auditRangeQuery(ctx, orgId, filters.from, filters.to).paginate(
      paginationOpts,
    );
    const actors = await loadAuditActors(
      ctx,
      result.page.map((row) => row.userId),
    );

    const page = result.page
      .map((row) => shapeAuditRow(row, actors.get(row.userId)))
      .filter((row) => auditRowMatches(row, filters));

    return { ...result, page };
  },
});

/**
 * Counters, breakdowns and the filter dropdown options in one read.
 *
 * The window is capped at {@link DEFAULT_LIST_CAP} rows so a tenant with years
 * of history cannot make the page time out; `capped` tells the client to say
 * "over N events" instead of pretending the number is exact.
 *
 * `category` and `severity` are deliberately *not* applied here: the breakdown
 * is what the filter chips count, so clicking "critical" must not collapse
 * every other bucket to zero. Every other filter is applied, so the cards and
 * the list always describe the same slice.
 */
export const getAuditTrailStats = query({
  args: auditFilterArgs,
  handler: async (ctx, args) => {
    const { organizationId, ...filters } = args;
    const { allowed, orgId } = await resolveAuditScope(ctx, organizationId);
    const empty = {
      allowed: false,
      total: 0,
      scanned: 0,
      capped: false,
      bySeverity: { critical: 0, warning: 0, info: 0 } as Record<AuditSeverity, number>,
      byCategory: {} as Record<AuditCategory, number>,
      uniqueActors: 0,
      criticalLast24h: 0,
      firstEventAt: null as number | null,
      lastEventAt: null as number | null,
      topActions: [] as { action: string; count: number }[],
      topActors: [] as (AuditActor & { count: number })[],
      daily: [] as { day: string; total: number; critical: number }[],
      actionOptions: [] as string[],
      actorOptions: [] as AuditActor[],
    };
    if (!allowed) return empty;

    const rows = await auditRangeQuery(ctx, orgId, filters.from, filters.to).take(DEFAULT_LIST_CAP);
    const actors = await loadAuditActors(
      ctx,
      rows.map((row) => row.userId),
    );

    // Breakdown-neutral: see the note above.
    const countingFilters: AuditFilters = {
      from: filters.from,
      to: filters.to,
      action: filters.action,
      actorId: filters.actorId,
      search: filters.search,
    };
    const matched = rows
      .map((row) => shapeAuditRow(row, actors.get(row.userId)))
      .filter((row) => auditRowMatches(row, countingFilters));

    const bySeverity: Record<AuditSeverity, number> = { critical: 0, warning: 0, info: 0 };
    const byCategory = Object.fromEntries(
      AUDIT_CATEGORIES.map((category) => [category, 0]),
    ) as Record<AuditCategory, number>;
    const actionCounts = new Map<string, number>();
    const actorCounts = new Map<Id<'users'>, number>();
    const dayBuckets = new Map<string, { total: number; critical: number }>();
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    let criticalLast24h = 0;
    let firstEventAt: number | null = null;
    let lastEventAt: number | null = null;

    for (const row of matched) {
      bySeverity[row.severity] += 1;
      byCategory[row.category] += 1;
      actionCounts.set(row.action, (actionCounts.get(row.action) ?? 0) + 1);
      if (row.actor) actorCounts.set(row.actor.id, (actorCounts.get(row.actor.id) ?? 0) + 1);

      if (row.severity === 'critical' && row.createdAt >= dayAgo) criticalLast24h += 1;
      if (firstEventAt === null || row.createdAt < firstEventAt) firstEventAt = row.createdAt;
      if (lastEventAt === null || row.createdAt > lastEventAt) lastEventAt = row.createdAt;

      // UTC days: the client labels them with the viewer's locale, and a shared
      // bucket key is the only way two viewers see the same chart.
      const day = new Date(row.createdAt).toISOString().slice(0, 10);
      const bucket = dayBuckets.get(day) ?? { total: 0, critical: 0 };
      bucket.total += 1;
      if (row.severity === 'critical') bucket.critical += 1;
      dayBuckets.set(day, bucket);
    }

    const topActions = [...actionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([action, count]) => ({ action, count }));

    const topActors = [...actorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .flatMap(([id, count]) => {
        const actor = actors.get(id);
        return actor ? [{ ...actor, count }] : [];
      });

    return {
      allowed: true,
      total: matched.length,
      scanned: rows.length,
      capped: rows.length >= DEFAULT_LIST_CAP,
      bySeverity,
      byCategory,
      uniqueActors: actorCounts.size,
      criticalLast24h,
      firstEventAt,
      lastEventAt,
      topActions,
      topActors,
      daily: [...dayBuckets.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([day, bucket]) => ({ day, ...bucket })),
      // Dropdown options come from the same window, so every option a user can
      // pick is guaranteed to match at least one row they are allowed to see.
      actionOptions: [...actionCounts.keys()].sort((a, b) => a.localeCompare(b)),
      actorOptions: [...actorCounts.keys()]
        .flatMap((id) => {
          const actor = actors.get(id);
          return actor ? [actor] : [];
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});
