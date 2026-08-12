import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import bcrypt from 'bcryptjs';
import { SUPERADMIN_EMAIL, isSuperadmin } from '../lib/auth';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from '../lib/limits';
import { notify } from '../lib/notify';
import { getStartingLeaveBalances } from '../lib/leaveBalances';
import { resolveOrgUnitsByName } from '../lib/orgUnits';
import { resolveTravelAllowanceForOrg } from '../lib/travelAllowance';
import { checkTempAccessStillValid } from '../superadmin/accessTokens';
import { logger } from '../../src/lib/logger';

// ── Password Hashing Helpers ─────────────────────────────────────────────────
const BCRYPT_ROUNDS = 12;

/**
 * Hash a password with bcrypt on the server side.
 * The client sends plaintext (or client-hash), we re-hash with bcrypt.
 *
 * Uses sync `bcrypt.hashSync`: the async variant relies on `setTimeout`
 * internally, which the Convex runtime forbids inside queries/mutations.
 */
async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hashSync(plaintext, BCRYPT_ROUNDS);
}

/**
 * Hex-string check used to recognise legacy SHA-256 hashes (64 hex chars).
 * Anything else hitting the legacy fallback would be a misuse — we refuse it.
 */
const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;

/**
 * Compare a plaintext password against a bcrypt hash.
 *
 * Uses sync `bcrypt.compareSync`: the async variant relies on `setTimeout`
 * internally, which the Convex runtime forbids inside queries/mutations.
 *
 * Legacy fallback: pre-bcrypt accounts stored a client-side SHA-256 hash.
 * We accept that ONLY when `hash` actually looks like SHA-256 hex —
 * arbitrary plaintext-equality is rejected to remove the
 * "plaintext-leaked-into-hash-field" backdoor risk.
 *
 * TODO(security): plan a forced-rotation migration so we can drop the
 * legacy fallback entirely.
 */
async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  // Try bcrypt first (new passwords)
  try {
    const match = bcrypt.compareSync(plaintext, hash);
    if (match) return true;
  } catch {
    // bcrypt.compare throws if `hash` is not a valid bcrypt hash (legacy users)
  }

  // Restricted legacy fallback: only honour SHA-256-shaped hashes.
  if (SHA256_HEX_RE.test(hash)) {
    return plaintext === hash;
  }
  return false;
}

// ── Error Handler Helper ─────────────────────────────────────────────────────
/**
 * Wraps convex mutations/queries with error handling
 * Logs errors and rethrows with sanitized messages for security
 */
function wrapConvexError<T>(fn: () => T, operation: string): T {
  try {
    return fn();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[Convex Auth] ${operation} error:`, errorMessage);

    // Don't expose internal errors to client
    if (
      error instanceof Error &&
      !errorMessage.includes('Invalid') &&
      !errorMessage.includes('not found')
    ) {
      throw new Error(`Operation failed: ${operation}`);
    }
    throw error;
  }
}

// ── Constants ────────────────────────────────────────────────────────────────
// SUPERADMIN_EMAIL is re-exported from lib/auth (env-driven).

/**
 * Check if a user is a superadmin (local re-export for backward compat).
 */
export { isSuperadmin } from '../lib/auth';

/**
 * Assert that a user is a superadmin, throw otherwise.
 */
export function assertSuperadmin(
  user:
    | {
        role?: string;
        email?: string;
      }
    | null
    | undefined,
  action: string = 'perform this action',
): void {
  if (!isSuperadmin(user)) {
    throw new Error(`Only superadmin can ${action}`);
  }
}

// ── Helper: build safe user return object ────────────────────────────────────
function safeUser(user: {
  _id: string;
  name: string;
  email: string;
  role: string;
  organizationId: string;
  department?: string;
  position?: string;
  employeeType: string;
  avatarUrl?: string;
  travelAllowance: number;
  isApproved: boolean;
  totpSecret?: string;
}) {
  return {
    userId: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    department: user.department,
    position: user.position,
    employeeType: user.employeeType,
    avatarUrl: user.avatarUrl,
    travelAllowance: user.travelAllowance,
    isApproved: user.isApproved,
    totpSecret: user.totpSecret,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER — two paths:
//   1. Superadmin email → role=superadmin, no org needed (org assigned later)
//   2. Everyone else → must provide organizationId (join existing) or create new
// ─────────────────────────────────────────────────────────────────────────────
export const register = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(), // actually a hash from client
    phone: v.optional(v.string()),
    // Multi-tenant fields
    organizationId: v.optional(v.id('organizations')), // join existing org
    inviteToken: v.optional(v.string()), // from invite link
    // Superadmin-only: create first org
    createOrgName: v.optional(v.string()),
    createOrgSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return wrapConvexError(async () => {
      const email = args.email.toLowerCase().trim();
      const userIsSuperadmin = email === SUPERADMIN_EMAIL;

      // ── 1. Check email not already registered ──────────────────────────────
      const existing = await ctx.db
        .query('users')
        .withIndex('by_email', (q) => q.eq('email', email))
        .unique();
      if (existing) throw new Error('Email already registered');

      // ── 2. Resolve organization ────────────────────────────────────────────
      let organizationId = args.organizationId;
      let isApproved = false;
      let role: 'superadmin' | 'admin' | 'employee' | 'supervisor' = 'employee';

      if (userIsSuperadmin) {
        // Superadmin path: create a special "platform" org or join first org
        role = 'superadmin';
        isApproved = true;

        // Superadmin must have an org (even a virtual one) — find or create
        const allOrgs = await ctx.db.query('organizations').take(DEFAULT_LIST_CAP);
        if (allOrgs.length === 0) {
          // Bootstrap: create the first platform organization
          if (!args.createOrgName || !args.createOrgSlug) {
            throw new Error('First registration requires organization name and slug');
          }
          const slug = args.createOrgSlug
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');

          organizationId = await ctx.db.insert('organizations', {
            name: args.createOrgName,
            slug,
            plan: 'enterprise',
            isActive: true,
            createdBySuperadmin: true,
            timezone: 'UTC',
            employeeLimit: 999999,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        } else {
          // Superadmin joins the first org by default
          const firstOrg = allOrgs[0];
          if (!firstOrg) {
            throw new Error('No organizations found');
          }
          organizationId = firstOrg._id;
        }
      } else {
        // Regular user path
        if (!organizationId && !args.inviteToken) {
          throw new Error('Please select an organization to join');
        }

        // Validate invite token if provided
        if (args.inviteToken) {
          const invite = await ctx.db
            .query('organizationInvites')
            .withIndex('by_token', (q) => q.eq('inviteToken', args.inviteToken!))
            .unique();

          if (!invite) throw new Error('Invalid invite link');
          if (invite.status === 'approved')
            throw new Error('This invite link has already been used');
          if (invite.inviteExpiry && invite.inviteExpiry < Date.now()) {
            throw new Error('This invite link has expired');
          }

          organizationId = invite.organizationId;

          // Mark invite as used
          await ctx.db.patch(invite._id, {
            status: 'approved',
            requestedByEmail: email,
            requestedByName: args.name,
            reviewedAt: Date.now(),
          });

          // Invited users are auto-approved
          isApproved = true;
        }

        if (!organizationId) throw new Error('Organization not found');

        // Verify org exists and is active
        const org = await ctx.db.get(organizationId);
        if (!org || !org.isActive) throw new Error('Organization is inactive or not found');
        if (org.frozenAt) {
          throw new Error(`ORG_FROZEN|${org.frozenReason ?? ''}`);
        }

        // Auto-approved joiners (invite-token path) are added to the org
        // immediately, so they must respect the employee limit. Pending-approval
        // registrations skip this — the limit is enforced at approval time in
        // approveJoinRequest, when the seat is actually taken.
        if (isApproved) {
          const currentMembers = await ctx.db
            .query('users')
            .withIndex('by_org_active', (q) =>
              q.eq('organizationId', organizationId!).eq('isActive', true),
            )
            .take(DEFAULT_LIST_CAP);
          if (currentMembers.length >= org.employeeLimit) {
            throw new Error(
              `This organization has reached its employee limit (${org.employeeLimit}). Contact your administrator.`,
            );
          }
        }

        // Check if first member of the org → becomes admin
        const orgMembers = await ctx.db
          .query('users')
          .withIndex('by_org', (q) => q.eq('organizationId', organizationId!))
          .take(DEFAULT_LIST_CAP);

        if (orgMembers.length === 0) {
          // First person in org → auto-admin, auto-approved
          role = 'admin';
          isApproved = true;
        }
      }

      if (!organizationId) throw new Error('Could not resolve organization');

      // ── 3. Create user ─────────────────────────────────────────────────────
      // SECURITY: Hash password server-side with bcrypt instead of storing client-side hash
      const hashedPassword = await hashPassword(args.password);

      // "Management" is a synthetic department for the first admin — resolve it
      // to a real record so the person is counted like everyone else.
      const adminUnits =
        role === 'admin' || userIsSuperadmin
          ? await resolveOrgUnitsByName(
              ctx,
              organizationId,
              { department: 'Management', position: 'Administrator' },
              { create: true },
            )
          : {};

      // A pending-approval registration has not joined any organization yet:
      // leave organizationId unset (the user does not exist inside the org),
      // otherwise they would show up in employee lists while still unapproved.
      const effectiveOrgId = isApproved ? organizationId : undefined;

      const userId = await ctx.db.insert('users', {
        organizationId: effectiveOrgId,
        name: args.name,
        email,
        passwordHash: hashedPassword,
        phone: args.phone,
        role,
        employeeType: 'staff',
        ...adminUnits,
        isActive: true,
        isApproved,
        approvedAt: isApproved ? Date.now() : undefined,
        travelAllowance: await resolveTravelAllowanceForOrg(ctx, organizationId, 'staff'),
        ...(await getStartingLeaveBalances(ctx, organizationId)),
        createdAt: Date.now(),
      });

      // ── 4. Pending approval → create a join-request invite ────────────────
      // Unified with the select-organization join flow: registering into an
      // existing organization produces the same `organizationInvites` record an
      // admin reviews in /join-requests. The account only joins the org (and
      // becomes visible in employee lists) once the admin approves.
      if (!isApproved) {
        const existing = await ctx.db
          .query('organizationInvites')
          .withIndex('by_email', (q) => q.eq('requestedByEmail', email))
          .filter((q) =>
            q.and(
              q.eq(q.field('organizationId'), organizationId),
              q.eq(q.field('status'), 'pending'),
            ),
          )
          .first();
        if (!existing) {
          const inviteId = await ctx.db.insert('organizationInvites', {
            organizationId,
            requestedByEmail: email,
            requestedByName: args.name,
            requestedAt: Date.now(),
            status: 'pending',
            userId,
            createdAt: Date.now(),
          });

          const org = await ctx.db.get(organizationId);
          const admins = await ctx.db
            .query('users')
            .withIndex('by_org_role', (q) =>
              q.eq('organizationId', organizationId!).eq('role', 'admin'),
            )
            .take(SMALL_LIST_CAP);

          for (const admin of admins) {
            await notify(ctx, {
              organizationId,
              userId: admin._id,
              type: 'join_request',
              titleKey: 'notifications.titles.joinRequestNew',
              messageKey: 'notifications.messages.joinRequestNew',
              params: {
                name: args.name,
                email,
                orgName: org?.name ?? 'your organization',
              },
              fallbackTitle: '🙋 New Join Request',
              fallbackMessage: `${args.name} (${email}) wants to join ${org?.name ?? 'your organization'}.`,
              relatedId: inviteId,
              route: '/join-requests',
            });
          }
        }
      }

      return { userId, role, needsApproval: !isApproved, organizationId: effectiveOrgId };
    }, 'register');
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN — validates credentials + organizationId scoping
//
// SECURITY MODEL:
//   - Password login (isFaceLogin=false): REQUIRES bcrypt.compare(password, passwordHash)
//     server-side. No bypass path.
//   - Face login (isFaceLogin=true): requires `faceVerificationToken` signed by
//     convex:faceRecognition.loginWithFace. Plain `isFaceLogin: true` WITHOUT a
//     valid token is rejected. This closes the auth-bypass reported in audit.
//
// Note: bcryptjs works in Convex mutations (see register / changePassword).
// ─────────────────────────────────────────────────────────────────────────────
export const login = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    sessionToken: v.string(),
    sessionExpiry: v.number(),
    isFaceLogin: v.optional(v.boolean()),
    /**
     * Short-lived verification token (5min) issued by faceRecognition.loginWithFace
     * when `isFaceLogin` is true. Must match user._id + recent timestamp.
     */
    faceVerificationToken: v.optional(v.string()),
    /**
     * When true, skips both password and face verification. Used exclusively
     * by the OAuth session exchange (Google → Convex user → JWT).
     */
    isOAuthLogin: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    {
      email,
      password,
      sessionToken,
      sessionExpiry,
      isFaceLogin,
      faceVerificationToken,
      isOAuthLogin,
    },
  ) => {
    return wrapConvexError(async () => {
      const user = await ctx.db
        .query('users')
        .withIndex('by_email', (q) => q.eq('email', email.toLowerCase().trim()))
        .unique();

      // Use generic error to avoid email enumeration
      if (!user) throw new Error('Invalid email or password');
      if (!user.isActive)
        throw new Error('Your account has been deactivated. Contact your administrator.');
      if (!user.isApproved) {
        throw new Error(
          'Your account is pending approval from your organization administrator. Please wait.',
        );
      }

      // ═══════════════════════════════════════════════════════════════
      // ACCOUNT LOCKOUT — block after 5 failed password attempts for 15 min
      // ═══════════════════════════════════════════════════════════════
      if (!isOAuthLogin && !isFaceLogin) {
        if (user.loginLockedUntil && user.loginLockedUntil > Date.now()) {
          const minutesLeft = Math.ceil((user.loginLockedUntil - Date.now()) / 60000);
          throw new Error(
            `Account temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minute(s).`,
          );
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // CREDENTIAL VERIFICATION — the core auth gate
      // ═══════════════════════════════════════════════════════════════
      if (isOAuthLogin) {
        // OAuth path: Google already verified identity, skip credential check
      } else if (isFaceLogin) {
        // Face-login path: require server-verified token
        if (!faceVerificationToken) {
          throw new Error('Face verification token is required for Face ID login');
        }

        const token = await ctx.db
          .query('faceLoginTokens')
          .withIndex('by_token', (q) => q.eq('token', faceVerificationToken))
          .unique();

        if (!token) throw new Error('Invalid or expired Face ID verification');
        if (token.userId !== user._id) {
          throw new Error('Face ID verification does not match this account');
        }
        if (token.consumedAt) throw new Error('Face ID verification has already been used');
        if (token.expiresAt < Date.now()) {
          throw new Error('Face ID verification has expired. Please try again.');
        }

        // One-time use — consume the token atomically
        await ctx.db.patch(token._id, { consumedAt: Date.now() });
      } else {
        // Password path: bcrypt.compare against stored hash
        if (!password) throw new Error('Invalid email or password');
        if (!user.passwordHash) {
          // OAuth-only user trying password login
          throw new Error('This account uses Google sign-in. Please sign in with Google.');
        }

        const passwordOk = await verifyPassword(password, user.passwordHash);
        if (!passwordOk) {
          // Increment failed attempts, lock after 5
          const attempts = (user.loginFailedAttempts || 0) + 1;
          const MAX_ATTEMPTS = 5;
          const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
          const patch: Record<string, unknown> = { loginFailedAttempts: attempts };
          if (attempts >= MAX_ATTEMPTS) {
            patch.loginLockedUntil = Date.now() + LOCKOUT_MS;
          }
          await ctx.db.patch(user._id, patch);

          // Audit failed attempt
          await ctx.db.insert('auditLogs', {
            organizationId: user.organizationId,
            userId: user._id,
            action: 'login_failed',
            details:
              attempts >= MAX_ATTEMPTS
                ? `Account locked after ${attempts} failed attempts`
                : 'Invalid password',
            createdAt: Date.now(),
          });
          throw new Error('Invalid email or password');
        }

        // Upgrade legacy hashes to modern bcrypt transparently
        if (!user.passwordHash.startsWith('$2')) {
          const upgraded = await hashPassword(password);
          await ctx.db.patch(user._id, { passwordHash: upgraded });
        }
      }

      // Verify org is still active
      if (!user.organizationId) throw new Error('User has no organization');
      const org = await ctx.db.get(user.organizationId);
      if (!org || !org.isActive) {
        throw new Error('Your organization account is inactive. Contact support.');
      }
      if (org.frozenAt) {
        throw new Error(`ORG_FROZEN|${org.frozenReason ?? ''}`);
      }

      // Temporary superadmin access check — reject if expired/revoked
      const tempCheck = await checkTempAccessStillValid(ctx, user._id);
      if (!tempCheck.valid) {
        throw new Error(tempCheck.reason ?? 'Temporary access is no longer valid.');
      }

      await ctx.db.patch(user._id, {
        sessionToken,
        sessionExpiry,
        lastLoginAt: Date.now(),
        loginFailedAttempts: 0,
        loginLockedUntil: undefined,
      });

      return {
        ...safeUser(user as Parameters<typeof safeUser>[0]),
        organizationName: org.name,
        organizationSlug: org.slug,
        organizationPlan: org.plan,
        totpEnabled: !!user.totpSecret,
      };
    }, 'login');
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────────────────────────────────────
export const logout = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    await ctx.db.patch(userId, {
      sessionToken: undefined,
      sessionExpiry: undefined,
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY SESSION — returns user + org info
// ─────────────────────────────────────────────────────────────────────────────
export const verifySession = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_session_token', (q) => q.eq('sessionToken', sessionToken))
      .unique();
    if (!user) return null;
    if (user.sessionExpiry && user.sessionExpiry < Date.now()) return null;
    if (!user.organizationId) return null;

    const org = await ctx.db.get(user.organizationId);

    return {
      ...safeUser(user as Parameters<typeof safeUser>[0]),
      organizationName: org?.name,
      organizationSlug: org?.slug,
      organizationPlan: org?.plan,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET SESSION (alias)
// ─────────────────────────────────────────────────────────────────────────────
export const getSession = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_session_token', (q) => q.eq('sessionToken', sessionToken))
      .unique();
    if (!user) return null;
    if (user.sessionExpiry && user.sessionExpiry < Date.now()) return null;
    if (!user.organizationId) return null;

    const org = await ctx.db.get(user.organizationId);

    return {
      userId: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      organizationName: org?.name,
      organizationSlug: org?.slug,
      organizationPlan: org?.plan,
      department: user.department,
      position: user.position,
      employeeType: user.employeeType,
      avatar: user.avatarUrl,
      travelAllowance: user.travelAllowance,
      isApproved: user.isApproved,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST PASSWORD RESET
// ─────────────────────────────────────────────────────────────────────────────
export const requestPasswordReset = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email.toLowerCase().trim()))
      .unique();

    if (!user) return { success: true }; // prevent email enumeration

    const token = `${Date.now()}-${crypto.randomUUID()}`;
    const expiry = Date.now() + 60 * 60 * 1000; // 1 hour

    await ctx.db.patch(user._id, {
      resetPasswordToken: token,
      resetPasswordExpiry: expiry,
    });

    return { success: true, token, name: user.name, email: user.email };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// RESET PASSWORD
// ─────────────────────────────────────────────────────────────────────────────
export const resetPassword = mutation({
  args: { token: v.string(), newPassword: v.string() },
  handler: async (ctx, { token, newPassword }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_reset_token', (q) => q.eq('resetPasswordToken', token))
      .unique();

    if (!user) throw new Error('Invalid or expired reset token');
    if (!user.resetPasswordExpiry || user.resetPasswordExpiry < Date.now()) {
      throw new Error('Reset token has expired. Please request a new one.');
    }

    // SECURITY: Hash new password with bcrypt before storing
    const hashedPassword = await hashPassword(newPassword);

    await ctx.db.patch(user._id, {
      passwordHash: hashedPassword,
      resetPasswordToken: undefined,
      resetPasswordExpiry: undefined,
      sessionToken: undefined,
    });

    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY RESET TOKEN
// ─────────────────────────────────────────────────────────────────────────────
export const verifyResetToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_reset_token', (q) => q.eq('resetPasswordToken', token))
      .unique();

    if (!user) return { valid: false };
    if (!user.resetPasswordExpiry || user.resetPasswordExpiry < Date.now()) {
      return { valid: false, expired: true };
    }

    return { valid: true, email: user.email, name: user.name };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE PASSWORD — authenticated user changes their own password
// ─────────────────────────────────────────────────────────────────────────────
export const changePassword = mutation({
  args: {
    userId: v.id('users'),
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, { userId, currentPassword, newPassword }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    // SECURITY: Use bcrypt.compare for current password verification
    const passwordValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!passwordValid) {
      throw new Error('Current password is incorrect');
    }

    if (newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters');
    }

    // SECURITY: Hash new password with bcrypt
    const hashedPassword = await hashPassword(newPassword);
    await ctx.db.patch(userId, {
      passwordHash: hashedPassword,
      sessionToken: undefined, // force re-login on other devices
    });

    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// DISABLE 2FA (TOTP)
// ─────────────────────────────────────────────────────────────────────────────
export const disableTotp = mutation({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    await ctx.db.patch(userId, {
      totpSecret: undefined,
    });

    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER WEBAUTHN CREDENTIAL
// ─────────────────────────────────────────────────────────────────────────────
export const registerWebauthn = mutation({
  args: {
    userId: v.id('users'),
    credentialId: v.string(),
    publicKey: v.string(),
    counter: v.number(),
    deviceName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('webauthnCredentials')
      .withIndex('by_credential_id', (q) => q.eq('credentialId', args.credentialId))
      .unique();
    if (existing) throw new Error('Credential already registered');

    return await ctx.db.insert('webauthnCredentials', {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET WEBAUTHN CREDENTIAL
// ─────────────────────────────────────────────────────────────────────────────
export const getWebauthnCredential = query({
  args: { credentialId: v.string() },
  handler: async (ctx, { credentialId }) => {
    const cred = await ctx.db
      .query('webauthnCredentials')
      .withIndex('by_credential_id', (q) => q.eq('credentialId', credentialId))
      .unique();
    if (!cred) return null;
    const user = await ctx.db.get(cred.userId);
    return { ...cred, user };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN VIA WEBAUTHN
// ─────────────────────────────────────────────────────────────────────────────
export const loginWebauthn = mutation({
  args: {
    credentialId: v.string(),
    counter: v.number(),
    sessionToken: v.string(),
    sessionExpiry: v.number(),
  },
  handler: async (ctx, { credentialId, counter, sessionToken, sessionExpiry }) => {
    const cred = await ctx.db
      .query('webauthnCredentials')
      .withIndex('by_credential_id', (q) => q.eq('credentialId', credentialId))
      .unique();
    if (!cred) throw new Error('Credential not found');

    const user = await ctx.db.get(cred.userId);
    if (!user) throw new Error('User not found');
    if (!user.isActive) throw new Error('Account is deactivated');
    if (!user.isApproved) throw new Error('Account pending approval');
    if (!user.organizationId) throw new Error('User has no organization');

    const org = await ctx.db.get(user.organizationId);
    if (!org || !org.isActive) throw new Error('Organization is inactive');
    if (org.frozenAt) throw new Error(`ORG_FROZEN|${org.frozenReason ?? ''}`);

    // Replay attack prevention
    if (counter <= cred.counter) throw new Error('Invalid authenticator counter');
    await ctx.db.patch(cred._id, { counter, lastUsedAt: Date.now() });

    await ctx.db.patch(user._id, {
      sessionToken,
      sessionExpiry,
      lastLoginAt: Date.now(),
    });

    return {
      ...safeUser(user as Parameters<typeof safeUser>[0]),
      organizationName: org.name,
      organizationSlug: org.slug,
      organizationPlan: org.plan,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE OAUTH LOGIN — for mobile app
// Finds existing user by email, creates session. If user doesn't exist,
// creates a new user (pending approval unless first in org).
// ─────────────────────────────────────────────────────────────────────────────
export const googleOAuthLogin = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    googleId: v.string(),
    sessionToken: v.string(),
    sessionExpiry: v.number(),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();

    // ── 1. Find existing user ──────────────────────────────────────────────
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique();

    if (user) {
      // Existing user — validate
      if (!user.isActive)
        throw new Error('Your account has been deactivated. Contact your administrator.');
      if (!user.isApproved)
        throw new Error('Your account is pending approval from your organization administrator.');
      if (!user.organizationId) throw new Error('User has no organization');

      const org = await ctx.db.get(user.organizationId);
      if (!org || !org.isActive)
        throw new Error('Your organization account is inactive. Contact support.');
      if (org.frozenAt) throw new Error(`ORG_FROZEN|${org.frozenReason ?? ''}`);

      // Update avatar if not set, and update session
      const patch: Record<string, string | number | undefined> = {
        sessionToken: args.sessionToken,
        sessionExpiry: args.sessionExpiry,
        lastLoginAt: Date.now(),
      };
      if (!user.avatarUrl && args.avatarUrl) {
        patch.avatarUrl = args.avatarUrl;
      }
      await ctx.db.patch(user._id, patch);

      return {
        isNewUser: false,
        needsApproval: false,
        userId: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId!,
        organizationName: org!.name,
        organizationSlug: org!.slug,
        organizationPlan: org!.plan,
        department: user.department,
        position: user.position,
        employeeType: user.employeeType,
        avatarUrl: user.avatarUrl ?? args.avatarUrl,
        travelAllowance: user.travelAllowance,
        isApproved: user.isApproved,
        phone: user.phone,
        paidLeaveBalance: user.paidLeaveBalance,
        sickLeaveBalance: user.sickLeaveBalance,
        familyLeaveBalance: user.familyLeaveBalance,
      };
    }

    // ── 2. New user — create account ───────────────────────────────────────
    const allOrgs = await ctx.db
      .query('organizations')
      .filter((q) => q.eq(q.field('isActive'), true))
      .take(DEFAULT_LIST_CAP);
    if (allOrgs.length === 0) {
      throw new Error('No active organizations found. Please contact administrator.');
    }

    const org = allOrgs[0];
    if (!org) {
      throw new Error('Organization not found');
    }
    const organizationId = org._id;

    // Check if first member → admin
    const orgMembers = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    const isFirstMember = orgMembers.length === 0;
    const role = isFirstMember ? 'admin' : 'employee';
    const isApproved = isFirstMember;
    const travelAllowance = await resolveTravelAllowanceForOrg(ctx, organizationId, 'staff');

    const userId = await ctx.db.insert('users', {
      organizationId,
      name: args.name || email.split('@')[0] || 'User',
      email,
      passwordHash: '',
      avatarUrl: args.avatarUrl,
      role,
      employeeType: 'staff',
      isActive: true,
      isApproved,
      approvedAt: isApproved ? Date.now() : undefined,
      travelAllowance,
      ...(await getStartingLeaveBalances(ctx, organizationId)),
      sessionToken: isApproved ? args.sessionToken : undefined,
      sessionExpiry: isApproved ? args.sessionExpiry : undefined,
      lastLoginAt: Date.now(),
      createdAt: Date.now(),
    });

    // Notify admins if needs approval
    if (!isApproved) {
      const admins = await ctx.db
        .query('users')
        .withIndex('by_org_role', (q) => q.eq('organizationId', organizationId).eq('role', 'admin'))
        .take(SMALL_LIST_CAP);

      for (const admin of admins) {
        await notify(ctx, {
          organizationId,
          userId: admin._id,
          type: 'join_request',
          titleKey: 'notifications.titles.googleSignUp',
          messageKey: 'notifications.messages.googleSignUp',
          params: {
            name: args.name,
            email,
            orgName: org.name || 'organization',
          },
          fallbackTitle: '🙋 New Google Sign-Up',
          fallbackMessage: `${args.name} (${email}) signed up with Google and wants to join ${org.name || 'organization'}.`,
          relatedId: userId,
          route: '/join-requests',
        });
      }

      throw new Error(
        'Your account has been created and is pending approval from your organization administrator.',
      );
    }

    return {
      isNewUser: true,
      needsApproval: false,
      userId,
      name: args.name || email.split('@')[0] || 'User',
      email,
      role,
      organizationId,
      organizationName: org.name || 'Organization',
      organizationSlug: org.slug || 'org',
      organizationPlan: org.plan || 'free',
      department: undefined,
      position: undefined,
      employeeType: 'staff',
      avatarUrl: args.avatarUrl,
      travelAllowance,
      isApproved: true,
      phone: undefined,
      paidLeaveBalance: 24,
      sickLeaveBalance: 10,
      familyLeaveBalance: 5,
      dayOffBalance: 6,
      maternityLeaveBalance: 0,
      studyLeaveBalance: 5,
    };
  },
});
