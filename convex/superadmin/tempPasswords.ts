import { v } from 'convex/values';
import { mutation, query, type MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import bcrypt from 'bcryptjs';
import { requireAuthUserOrThrow } from '../lib/auth';
import { notify } from '../lib/notify';

const BCRYPT_ROUNDS = 12;

/**
 * Default validity window for a superadmin-issued temporary password.
 * Short on purpose: the whole point is to push the user to set their own
 * password quickly while email-based reset is unavailable.
 */
export const DEFAULT_TEMP_PASSWORD_TTL_HOURS = 24;

/** Hard clamp so a typo can't hand out a month-long "temporary" credential. */
const MIN_TTL_HOURS = 1;
const MAX_TTL_HOURS = 72;

// Ambiguous glyphs (0/O, 1/l/I) are excluded so a temporary password can be
// safely read aloud over the phone or typed from a sticky note.
const PW_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/**
 * Cryptographically-random, human-friendly temporary password, grouped as
 * XXXX-XXXX-XXXX for readability. Exported for tests.
 */
export function generateTempPassword(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => PW_ALPHABET[b % PW_ALPHABET.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

/**
 * Issue a one-time temporary password for a user who forgot theirs (email
 * reset unavailable). Mirrors the hardened flow:
 *
 *  - only a superadmin may call it; never on themselves or another superadmin;
 *  - the old password is REPLACED — its hash is overwritten;
 *  - only the bcrypt hash of the temp password is stored; the plaintext is
 *    returned exactly once in this response and never persisted or logged;
 *  - every live session is killed so the next login must use the temp
 *    credential;
 *  - `mustChangePassword` + expiry force the user to rotate immediately after
 *    logging in, and make the temp credential useless once the window passes;
 *  - the action is audited WITHOUT the plaintext.
 */
export const issueTempPassword = mutation({
  args: {
    userId: v.id('users'),
    /** Validity window in hours. Clamped to [1, 72]; defaults to 24. */
    ttlHours: v.optional(v.number()),
  },
  handler: async (ctx, { userId, ttlHours }) => {
    const caller = await requireAuthUserOrThrow(ctx);
    if (caller.role !== 'superadmin') {
      throw new Error('Only superadmins can issue temporary passwords');
    }
    if (caller._id === userId) {
      throw new Error('You cannot issue a temporary password to yourself');
    }

    const target = await ctx.db.get(userId);
    if (!target) throw new Error('User not found');
    if (target.role === 'superadmin') {
      throw new Error('Cannot issue a temporary password to a superadmin account');
    }

    const requestedTtl = ttlHours ?? DEFAULT_TEMP_PASSWORD_TTL_HOURS;
    const ttlClamped = Math.min(MAX_TTL_HOURS, Math.max(MIN_TTL_HOURS, requestedTtl));
    const now = Date.now();
    const expiresAt = now + ttlClamped * 60 * 60 * 1000;

    const tempPassword = generateTempPassword();
    const passwordHash = bcrypt.hashSync(tempPassword, BCRYPT_ROUNDS);

    await ctx.db.patch(userId, {
      passwordHash,
      mustChangePassword: true,
      tempPasswordIssuedAt: now,
      tempPasswordExpiresAt: expiresAt,
      // Kill any live session — the next login must present the temp password.
      sessionToken: undefined,
      sessionExpiry: undefined,
      // A fresh credential also clears any stale lockout from failed attempts.
      loginFailedAttempts: 0,
      loginLockedUntil: undefined,
      // Any pending email-reset token is superseded by this issuance.
      resetPasswordToken: undefined,
      resetPasswordExpiry: undefined,
      // A fresh issuance re-arms the one-time admin login notice.
      tempPasswordLoginNotifiedAt: undefined,
      updatedAt: now,
    });

    // Audit trail: who issued what to whom and until when — never the plaintext.
    await ctx.db.insert('auditLogs', {
      organizationId: target.organizationId,
      userId: caller._id,
      action: 'TEMP_PASSWORD_ISSUED',
      target: target.email,
      details: JSON.stringify({
        targetUserId: userId,
        ttlHours: ttlClamped,
        expiresAt,
        issuedAt: now,
      }),
      createdAt: now,
    });

    return { password: tempPassword, expiresAt, ttlHours: ttlClamped };
  },
});

// Cap the overview list — this is an ops dashboard, not an export.
const PENDING_TEMP_PASSWORD_CAP = 100;

/**
 * Overview of accounts holding a superadmin-issued temporary password that is
 * still forcing a change (including already-expired ones awaiting reissue).
 * Superadmin-only; soft-deleted accounts are skipped. Backs the "pending
 * temporary passwords" panel on the Users 360 index page.
 */
export const listPendingTempPasswords = query({
  args: {},
  returns: v.array(
    v.object({
      userId: v.id('users'),
      name: v.string(),
      email: v.string(),
      organizationId: v.optional(v.id('organizations')),
      issuedAt: v.number(),
      expiresAt: v.number(),
      isExpired: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const caller = await requireAuthUserOrThrow(ctx);
    if (caller.role !== 'superadmin') return [];

    const now = Date.now();
    const rows = await ctx.db
      .query('users')
      .withIndex('by_must_change_password', (q) => q.eq('mustChangePassword', true))
      .take(PENDING_TEMP_PASSWORD_CAP);

    return (
      rows
        .filter((u) => !u.deletedAt)
        .map((u) => ({
          userId: u._id,
          name: u.name,
          email: u.email,
          organizationId: u.organizationId,
          issuedAt: u.tempPasswordIssuedAt ?? 0,
          expiresAt: u.tempPasswordExpiresAt ?? 0,
          isExpired: (u.tempPasswordExpiresAt ?? 0) < now,
        }))
        // Expired first — those users are locked out and need a reissue most.
        .sort((a, b) => Number(b.isExpired) - Number(a.isExpired) || a.expiresAt - b.expiresAt)
    );
  },
});

/**
 * Cancel a pending forced password change without touching the current
 * credential. Use when an admin decides the user may keep the temporary
 * password after all (e.g. they already logged in and changed it elsewhere).
 */
export const clearMustChangePassword = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const caller = await requireAuthUserOrThrow(ctx);
    if (caller.role !== 'superadmin') {
      throw new Error('Only superadmins can clear the forced password change');
    }
    if (caller._id === userId) {
      throw new Error('You cannot clear your own forced password change here');
    }

    const target = await ctx.db.get(userId);
    if (!target) throw new Error('User not found');

    await ctx.db.patch(userId, {
      mustChangePassword: false,
      tempPasswordIssuedAt: undefined,
      tempPasswordExpiresAt: undefined,
      updatedAt: Date.now(),
    });

    await ctx.db.insert('auditLogs', {
      organizationId: target.organizationId,
      userId: caller._id,
      action: 'TEMP_PASSWORD_CANCELLED',
      target: target.email,
      details: JSON.stringify({ targetUserId: userId }),
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Fan out an in-app "temporary password was used to sign in" notice to the
 * people who should know: platform superadmins and the admins of the user's
 * organization. Called from the login mutation the FIRST time a temporary
 * password is used (the caller checks `tempPasswordLoginNotifiedAt`), so one
 * issuance produces at most one round of notifications no matter how often
 * the user logs in before rotating.
 *
 * The caller is responsible for setting `tempPasswordLoginNotifiedAt`.
 */
export async function notifyTempPasswordLogin(
  ctx: MutationCtx,
  user: {
    _id: Id<'users'>;
    name: string;
    email: string;
    organizationId?: Id<'organizations'>;
  },
): Promise<void> {
  const params = { name: user.name, email: user.email };
  const base = {
    type: 'security_alert' as const,
    titleKey: 'notifications.titles.tempPasswordLogin',
    messageKey: 'notifications.messages.tempPasswordLogin',
    params,
    fallbackTitle: `${user.name} signed in with a temporary password`,
    fallbackMessage:
      'A superadmin-issued temporary password was used to sign in. The user has been prompted to set their own password.',
    relatedId: user._id,
    extra: { targetUserId: user._id, targetEmail: user.email },
  };

  // Platform superadmins — deep-link straight to the user's profile.
  const supers = await ctx.db
    .query('users')
    .withIndex('by_role', (q) => q.eq('role', 'superadmin'))
    .collect();
  for (const admin of supers) {
    if (!admin.isActive || admin._id === user._id) continue;
    await notify(ctx, {
      ...base,
      userId: admin._id,
      route: `/superadmin/users/${user._id}`,
    });
  }

  // Organization admins — no User 360 access, so no deep link.
  if (user.organizationId) {
    const orgAdmins = await ctx.db
      .query('users')
      .withIndex('by_org_role', (q) =>
        q.eq('organizationId', user.organizationId!).eq('role', 'admin'),
      )
      .collect();
    for (const admin of orgAdmins) {
      if (!admin.isActive || admin._id === user._id) continue;
      await notify(ctx, { ...base, userId: admin._id });
    }
  }
}
