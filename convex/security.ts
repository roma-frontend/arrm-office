import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ── Default security settings ─────────────────────────────────────────────────
export const SECURITY_FEATURES = [
  {
    key: "audit_logging",
    description: "Log all login attempts with IP, device, and risk score",
  },
  {
    key: "adaptive_auth",
    description: "Adaptive authentication — block or challenge high-risk logins",
  },
  {
    key: "device_fingerprinting",
    description: "Track and recognize known devices per user",
  },
  {
    key: "keystroke_dynamics",
    description: "Analyze typing patterns to verify user identity",
  },
  {
    key: "continuous_face",
    description: "Periodically verify user identity via Face ID in background",
  },
  {
    key: "failed_login_lockout",
    description: "Auto-lock account after 5 failed login attempts",
  },
  {
    key: "new_device_alert",
    description: "Send notification to admin when user logs in from new device",
  },
] as const;

// ── Get all security settings ─────────────────────────────────────────────────
export const getAllSettings = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("securitySettings").collect();

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
  handler: async (ctx, { key }) => {
    const setting = await ctx.db
      .query("securitySettings")
      .withIndex("by_key", (q) => q.eq("key", key))
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
    updatedBy: v.id("users"),
  },
  handler: async (ctx, { key, enabled, updatedBy }) => {
    const existing = await ctx.db
      .query("securitySettings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { enabled, updatedBy, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("securitySettings", {
        key,
        enabled,
        updatedBy,
        updatedAt: Date.now(),
      });
    }

    // Log this action in audit logs
    const user = await ctx.db.get(updatedBy);
    if (user) {
      await ctx.db.insert("auditLogs", {
        organizationId: user.organizationId,
        userId: updatedBy,
        action: "security_setting_changed",
        target: key,
        details: `Security feature "${key}" ${enabled ? "enabled" : "disabled"} by superadmin`,
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
    userId: v.optional(v.id("users")),
    organizationId: v.optional(v.id("organizations")),
    success: v.boolean(),
    method: v.union(
      v.literal("password"),
      v.literal("face_id"),
      v.literal("webauthn"),
      v.literal("google"),
    ),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    deviceFingerprint: v.optional(v.string()),
    riskScore: v.optional(v.number()),
    riskFactors: v.optional(v.array(v.string())),
    blockedReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("loginAttempts", {
      ...args,
      createdAt: Date.now(),
    });

    // If failed, check if we need to lock the account
    if (!args.success && args.userId) {
      // Check failed attempts in last 15 minutes
      const fifteenMinAgo = Date.now() - 15 * 60 * 1000;
      const recentFails = await ctx.db
        .query("loginAttempts")
        .withIndex("by_user", (q) => q.eq("userId", args.userId!))
        .filter((q) =>
          q.and(
            q.eq(q.field("success"), false),
            q.gte(q.field("createdAt"), fifteenMinAgo)
          )
        )
        .collect();

      if (recentFails.length >= 5) {
        // Check if lockout feature is enabled
        const lockoutSetting = await ctx.db
          .query("securitySettings")
          .withIndex("by_key", (q) => q.eq("key", "failed_login_lockout"))
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
              .query("users")
              .withIndex("by_org_role", (q) =>
                q.eq("organizationId", user.organizationId!).eq("role", "admin")
              )
              .collect();
            for (const admin of admins) {
              await ctx.db.insert("notifications", {
                organizationId: user.organizationId,
                userId: admin._id,
                type: "system",
                title: "🚨 Account Locked",
                message: `${user.name} (${user.email}) was auto-locked after 5 failed login attempts.`,
                isRead: false,
                createdAt: Date.now(),
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
    userId: v.id("users"),
    fingerprint: v.string(),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, { userId, fingerprint, userAgent }) => {
    const existing = await ctx.db
      .query("deviceFingerprints")
      .withIndex("by_user_fingerprint", (q) =>
        q.eq("userId", userId).eq("fingerprint", fingerprint)
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
      await ctx.db.insert("deviceFingerprints", {
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
    userId: v.id("users"),
    fingerprint: v.string(),
  },
  handler: async (ctx, { userId, fingerprint }) => {
    const device = await ctx.db
      .query("deviceFingerprints")
      .withIndex("by_user_fingerprint", (q) =>
        q.eq("userId", userId).eq("fingerprint", fingerprint)
      )
      .unique();
    return device ?? null;
  },
});

// ── Get all devices for a user ────────────────────────────────────────────────
export const getUserDevices = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("deviceFingerprints")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

// ── Save / update keystroke profile ──────────────────────────────────────────
export const saveKeystrokeProfile = mutation({
  args: {
    userId: v.id("users"),
    avgDwell: v.number(),
    avgFlight: v.number(),
    stdDevDwell: v.optional(v.number()),
    stdDevFlight: v.optional(v.number()),
    sampleCount: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("keystrokeProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
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
      await ctx.db.insert("keystrokeProfiles", {
        ...args,
        updatedAt: Date.now(),
      });
    }
    return { success: true };
  },
});

// ── Get keystroke profile ─────────────────────────────────────────────────────
export const getKeystrokeProfile = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("keystrokeProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

// ── Get login attempts stats (for dashboard) ──────────────────────────────────
export const getLoginStats = query({
  args: {
    organizationId: v.optional(v.id("organizations")),
    hours: v.optional(v.number()), // last N hours, default 24
  },
  handler: async (ctx, { organizationId, hours = 24 }) => {
    const since = Date.now() - hours * 60 * 60 * 1000;

    let attempts = await ctx.db
      .query("loginAttempts")
      .withIndex("by_created", (q) => q.gte("createdAt", since))
      .collect();

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
      {} as Record<string, number>
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
    organizationId: v.optional(v.id("organizations")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, limit = 50 }) => {
    let logs;
    if (organizationId) {
      logs = await ctx.db
        .query("auditLogs")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .order("desc")
        .take(limit);
    } else {
      logs = await ctx.db
        .query("auditLogs")
        .order("desc")
        .take(limit);
    }

    // Enrich with user names
    const enriched = await Promise.all(
      logs.map(async (log) => {
        const user = await ctx.db.get(log.userId);
        return {
          ...log,
          userName: user?.name ?? "Unknown",
          userEmail: user?.email ?? "",
        };
      })
    );
    return enriched;
  },
});

// ── Unlock a locked account ───────────────────────────────────────────────────
export const unlockAccount = mutation({
  args: {
    userId: v.id("users"),
    unlockedBy: v.id("users"),
  },
  handler: async (ctx, { userId, unlockedBy }) => {
    await ctx.db.patch(userId, {
      faceIdBlocked: false,
      faceIdBlockedAt: undefined,
      faceIdFailedAttempts: 0,
    });
    const user = await ctx.db.get(userId);
    const unlocker = await ctx.db.get(unlockedBy);
    await ctx.db.insert("auditLogs", {
      organizationId: user?.organizationId,
      userId: unlockedBy,
      action: "account_unlocked",
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
const SUPERADMIN_EMAIL = "romangulanyan@gmail.com";
const AUTO_BLOCK_THRESHOLD = 80; // Auto-block if risk score >= 80
const AUTO_BLOCK_DURATION = 24; // 24 hours

export const notifySuperadminSuspiciousActivity = mutation({
  args: {
    userId: v.id("users"),
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
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", SUPERADMIN_EMAIL))
      .first();
    
    if (!superadmin) {
      console.error("Superadmin not found for notification");
      return null;
    }

    // Get the suspicious user
    const user = await ctx.db.get(args.userId);
    if (!user) {
      console.error("User not found for suspicious activity notification");
      return null;
    }

    // AUTO-BLOCK logic: if risk score is very high, block immediately
    let wasAutoBlocked = false;
    if (args.autoBlock !== false && args.riskScore >= AUTO_BLOCK_THRESHOLD) {
      const suspendedUntil = Date.now() + (AUTO_BLOCK_DURATION * 60 * 60 * 1000);
      
      await ctx.db.patch(args.userId, {
        isSuspended: true,
        suspendedUntil,
        suspendedReason: `AUTO-BLOCKED: High risk login (score: ${args.riskScore}). ${args.reason}`,
        suspendedBy: superadmin._id,
        suspendedAt: Date.now(),
      });

      wasAutoBlocked = true;

      // Create audit log for auto-block
      await ctx.db.insert("auditLogs", {
        organizationId: user.organizationId,
        userId: superadmin._id,
        action: "user_auto_suspended",
        target: user.email,
        details: `User auto-blocked for ${AUTO_BLOCK_DURATION}h due to high risk score (${args.riskScore}). Factors: ${args.riskFactors.join(", ")}`,
        createdAt: Date.now(),
      });

      // Notify the blocked user
      await ctx.db.insert("notifications", {
        organizationId: user.organizationId,
        userId: args.userId,
        type: "system",
        title: "🚫 Account Automatically Suspended",
        message: `Your account has been automatically suspended due to suspicious login activity (risk score: ${args.riskScore}). If this was you, please contact your administrator. Suspension will expire in ${AUTO_BLOCK_DURATION} hours.`,
        isRead: false,
        createdAt: Date.now(),
      });
    }

    // Create notification for superadmin with action metadata
    const notificationTitle = wasAutoBlocked 
      ? "🚫 User Auto-Blocked (High Risk)" 
      : "🚨 Suspicious Login Activity Detected";
    
    const notificationMessage = wasAutoBlocked
      ? `User: ${args.email}\nRisk Score: ${args.riskScore}\nStatus: AUTOMATICALLY BLOCKED for ${AUTO_BLOCK_DURATION}h\nReasons: ${args.riskFactors.join(", ")}\nIP: ${args.ip || "Unknown"}\n\nUser was automatically suspended. Review and unsuspend if needed.`
      : `User: ${args.email}\nRisk Score: ${args.riskScore}\nReasons: ${args.riskFactors.join(", ")}\nIP: ${args.ip || "Unknown"}\n\nReview this activity immediately.`;

    const notificationId = await ctx.db.insert("notifications", {
      organizationId: superadmin.organizationId,
      userId: superadmin._id,
      type: "security_alert",
      title: notificationTitle,
      message: notificationMessage,
      isRead: false,
      relatedId: args.userId,
      metadata: JSON.stringify({
        suspiciousUserId: args.userId,
        email: args.email,
        userName: user.name,
        riskScore: args.riskScore,
        riskFactors: args.riskFactors,
        ip: args.ip,
        deviceInfo: args.deviceInfo,
        timestamp: Date.now(),
        actionType: "suspicious_login",
        autoBlocked: wasAutoBlocked,
        blockDuration: wasAutoBlocked ? AUTO_BLOCK_DURATION : undefined,
      }),
      createdAt: Date.now(),
    });

    // Log the security event
    await ctx.db.insert("securityAuditLogs", {
      userId: args.userId,
      userName: user.name,
      userEmail: args.email,
      action: wasAutoBlocked ? "auto_blocked" : "superadmin_notified",
      success: false,
      blocked: wasAutoBlocked,
      riskScore: args.riskScore,
      riskFactors: args.riskFactors,
      ip: args.ip,
      deviceInfo: args.deviceInfo,
      details: wasAutoBlocked 
        ? `User auto-blocked for ${AUTO_BLOCK_DURATION}h. Risk: ${args.riskScore}, Factors: ${args.riskFactors.join(", ")}`
        : `Superadmin notified about suspicious activity. Risk: ${args.riskScore}, Factors: ${args.riskFactors.join(", ")}`,
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
    userId: v.id("users"),
    limit: v.optional(v.number())
  },
  handler: async (ctx, { userId, limit = 10 }) => {
    return await ctx.db
      .query("loginAttempts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Get all suspended users (for superadmin)
// ─────────────────────────────────────────────────────────────────────────────
export const getSuspendedUsers = query({
  args: {},
  handler: async (ctx) => {
    const allUsers = await ctx.db.query("users").collect();
    
    // Filter only suspended users
    const suspendedUsers = allUsers.filter(user => 
      user.isSuspended && user.suspendedUntil && user.suspendedUntil > Date.now()
    );

    // Sort by most recently suspended
    return suspendedUsers.sort((a, b) => 
      (b.suspendedAt || 0) - (a.suspendedAt || 0)
    );
  },
});
