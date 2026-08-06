import { v } from 'convex/values';
import { mutation } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { isSuperadmin, SUPERADMIN_EMAIL } from '../lib/auth';
import { SMALL_LIST_CAP } from '../lib/limits';
import { resolveTravelAllowanceForOrg } from '../lib/travelAllowance';
import { notify } from '../lib/notify';

// ─────────────────────────────────────────────────────────────────────────────
// CREATE OAUTH USER — for Google OAuth sign in
// ─────────────────────────────────────────────────────────────────────────────
export const createOAuthUser = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { email, name, avatarUrl } = args;
    const emailLower = email.toLowerCase().trim();

    // Ensure name is never empty
    const finalName = name?.trim() || emailLower.split('@')[0] || 'User';

    // Check if user already exists
    const existing = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', emailLower))
      .first();

    if (existing) {
      const updates: Partial<Pick<typeof existing, 'avatarUrl' | 'name'>> = {};

      // Update avatar if provided
      if (avatarUrl && !existing.avatarUrl) {
        updates.avatarUrl = avatarUrl;
      }

      // Always update name if:
      // 1. It's different from existing name, OR
      // 2. Existing name is "User" (placeholder/email prefix) but we have a better real name
      const existingNameTrimmed = existing.name?.trim().toLowerCase();
      const isPlaceholderName = existingNameTrimmed === 'user' || !existing.name;
      const isBetterName = finalName && finalName.toLowerCase() !== 'user';

      const shouldUpdateName =
        finalName && (finalName !== existing.name || (isPlaceholderName && isBetterName));

      if (shouldUpdateName) {
        updates.name = finalName;
      }

      // Apply updates if any
      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(existing._id, updates);
      }

      return existing._id;
    }

    // For new OAuth users, check if they are superadmin
    const isSuperAdmin = emailLower === SUPERADMIN_EMAIL;

    // Get first organization or create error
    const allOrgs = await ctx.db.query('organizations').take(SMALL_LIST_CAP);

    if (allOrgs.length === 0) {
      throw new Error('No organization found. Please create an organization first.');
    }

    const organizationId = isSuperAdmin ? allOrgs[0]?._id : undefined;

    // Check if user is first member of the org (becomes admin) - only for superadmin
    const orgMembers = isSuperAdmin
      ? await ctx.db
          .query('users')
          .withIndex('by_org', (q) => q.eq('organizationId', organizationId!))
          .take(SMALL_LIST_CAP)
      : [];

    const _isFirstMember = orgMembers.length === 0;
    const role = isSuperAdmin ? 'superadmin' : 'employee';

    // Superadmin is auto-approved, regular users need onboarding (isApproved: false)
    const isApproved = isSuperAdmin;

    const userId = await ctx.db.insert('users', {
      organizationId,
      name: finalName,
      email: emailLower,
      passwordHash: '',
      role,
      employeeType: 'staff',
      department: isSuperAdmin ? 'Management' : undefined,
      position: isSuperAdmin ? 'Administrator' : undefined,
      isActive: true,
      isApproved,
      approvedAt: isSuperAdmin ? Date.now() : undefined,
      travelAllowance: await resolveTravelAllowanceForOrg(ctx, organizationId, 'staff'),
      paidLeaveBalance: 24,
      sickLeaveBalance: 10,
      familyLeaveBalance: 5,
      dayOffBalance: 6,
      maternityLeaveBalance: 0,
      studyLeaveBalance: 5,
      createdAt: Date.now(),
      avatarUrl,
    });

    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE SESSION
// ─────────────────────────────────────────────────────────────────────────────
export const updateSession = mutation({
  args: {
    userId: v.id('users'),
    sessionToken: v.string(),
    sessionExpiry: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId, sessionToken, sessionExpiry } = args;
    await ctx.db.patch(userId, {
      sessionToken,
      sessionExpiry,
      lastLoginAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// CLEAR SESSION
// ─────────────────────────────────────────────────────────────────────────────
export const clearSession = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const { userId } = args;
    await ctx.db.patch(userId, {
      sessionToken: undefined,
      sessionExpiry: undefined,
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// WEBAUTHN: SET CHALLENGE
// ─────────────────────────────────────────────────────────────────────────────
export const setWebauthnChallenge = mutation({
  args: { userId: v.id('users'), challenge: v.string() },
  handler: async (ctx, args) => {
    const { userId, challenge } = args;
    await ctx.db.patch(userId, { webauthnChallenge: challenge });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// WEBAUTHN: ADD CREDENTIAL
// ─────────────────────────────────────────────────────────────────────────────
export const addWebauthnCredential = mutation({
  args: {
    userId: v.id('users'),
    credentialId: v.string(),
    publicKey: v.string(),
    counter: v.number(),
    deviceName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('webauthnCredentials', {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// WEBAUTHN: UPDATE COUNTER
// ─────────────────────────────────────────────────────────────────────────────
export const updateWebauthnCounter = mutation({
  args: { credentialId: v.string(), counter: v.number() },
  handler: async (ctx, args) => {
    const { credentialId, counter } = args;
    const cred = await ctx.db
      .query('webauthnCredentials')
      .withIndex('by_credential_id', (q) => q.eq('credentialId', credentialId))
      .unique();
    if (!cred) throw new Error('Credential not found');
    await ctx.db.patch(cred._id, { counter, lastUsedAt: Date.now() });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// FACE ID: RECORD ATTEMPT
// ─────────────────────────────────────────────────────────────────────────────
export const recordFaceIdAttempt = mutation({
  args: {
    email: v.optional(v.string()),
    userId: v.optional(v.id('users')),
    success: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { email, userId, success } = args;
    // Find user by email or userId
    let user;
    if (userId) {
      user = await ctx.db.get(userId);
    } else if (email) {
      user = await ctx.db
        .query('users')
        .withIndex('by_email', (q) => q.eq('email', email.toLowerCase()))
        .first();
    } else {
      throw new Error('Either email or userId must be provided');
    }

    if (!user) {
      throw new Error('User not found');
    }

    if (success) {
      // Successful login - reset failed attempts
      await ctx.db.patch(user._id, {
        faceIdFailedAttempts: 0,
        faceIdLastAttempt: Date.now(),
        faceIdBlocked: false,
      });
      return { blocked: false, attempts: 0, email: user.email };
    } else {
      // Failed attempt - increment counter
      const currentAttempts = (user.faceIdFailedAttempts || 0) + 1;
      const isBlocked = currentAttempts >= 3;

      await ctx.db.patch(user._id, {
        faceIdFailedAttempts: currentAttempts,
        faceIdLastAttempt: Date.now(),
        faceIdBlocked: isBlocked,
        faceIdBlockedAt: isBlocked ? Date.now() : undefined,
      });

      // Create audit log for security tracking
      await ctx.db.insert('auditLogs', {
        organizationId: user.organizationId,
        userId: user._id,
        action: 'face_id_failed_attempt',
        details: `Failed Face ID attempt ${currentAttempts}/3`,
        createdAt: Date.now(),
      });

      if (isBlocked) {
        // Send notification about blocked Face ID
        await notify(ctx, {
          organizationId: user.organizationId,
          userId: user._id,
          type: 'system',
          titleKey: 'notifications.titles.faceIdBlocked',
          messageKey: 'notifications.messages.faceIdBlocked',
          fallbackTitle: '🚫 Face ID Blocked',
          fallbackMessage:
            'Your Face ID has been blocked due to too many failed attempts. Please use email/password login.',
          route: '/dashboard',
        });
      }

      return { blocked: isBlocked, attempts: currentAttempts, email: user.email };
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// FACE ID: UNBLOCK (Admin only)
// ─────────────────────────────────────────────────────────────────────────────
export const unblockFaceId = mutation({
  args: {
    adminId: v.id('users'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { adminId, userId } = args;
    const admin = await ctx.db.get(adminId);
    if (!admin || (admin.role !== 'admin' && admin.role !== 'superadmin')) {
      throw new Error('Only org admins can perform this action');
    }
    const user = await ctx.db.get(userId);

    if (!user) {
      throw new Error('User not found');
    }

    // Verify same organization (unless superadmin)
    if (admin.organizationId !== user.organizationId && !isSuperadmin(admin)) {
      throw new Error('Access denied: cannot unblock users from another organization');
    }

    await ctx.db.patch(userId, {
      faceIdBlocked: false,
      faceIdFailedAttempts: 0,
      faceIdBlockedAt: undefined,
    });

    // Create audit log
    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId: admin._id as Id<'users'>,
      action: 'face_id_unblocked',
      target: user.email,
      details: `Face ID unblocked by ${admin.name} for ${user.name}`,
      createdAt: Date.now(),
    });

    // Notify user
    await notify(ctx, {
      organizationId: user.organizationId,
      userId,
      type: 'system',
      titleKey: 'notifications.titles.faceIdUnlocked',
      messageKey: 'notifications.messages.faceIdUnlockedBy',
      params: { adminName: admin.name },
      fallbackTitle: '✅ Face ID Unlocked',
      fallbackMessage: `Your Face ID has been unlocked by ${admin.name}. You can try again.`,
      route: '/dashboard',
    });

    return userId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// FACE ID: AUTO-UNBLOCK after successful email/password login
// ─────────────────────────────────────────────────────────────────────────────
export const autoUnblockFaceId = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const { userId } = args;
    const user = await ctx.db.get(userId);

    if (!user) {
      throw new Error('User not found');
    }

    // Only unblock if it was blocked
    if (user.faceIdBlocked) {
      await ctx.db.patch(userId, {
        faceIdBlocked: false,
        faceIdFailedAttempts: 0,
        faceIdBlockedAt: undefined,
      });

      // Notify user
      await notify(ctx, {
        organizationId: user.organizationId,
        userId,
        type: 'system',
        titleKey: 'notifications.titles.faceIdAutoUnlocked',
        messageKey: 'notifications.messages.faceIdAutoUnlocked',
        fallbackTitle: '✅ Face ID Automatically Unlocked',
        fallbackMessage:
          'Your Face ID has been automatically unlocked after a successful password login.',
        route: '/dashboard',
      });
    }

    return userId;
  },
});
