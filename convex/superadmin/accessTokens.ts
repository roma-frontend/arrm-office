import { v } from 'convex/values';
import { query, mutation } from '../_generated/server';
import bcrypt from 'bcryptjs';
import { requireAuthUserOrThrow } from '../lib/auth';

const BCRYPT_ROUNDS = 12;

/**
 * Generate a temporary superadmin account for external specialists.
 * Creates a real user that passes through all security layers.
 */
export const generateAccessToken = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    reason: v.string(),
    durationMs: v.number(),
  },
  handler: async (ctx, args) => {
    const caller = await requireAuthUserOrThrow(ctx);
    if (caller.role !== 'superadmin')
      throw new Error('Only superadmins can generate access tokens');

    if (!caller.organizationId) throw new Error('You must belong to an organization');

    const email = args.email.toLowerCase().trim();
    const now = Date.now();
    const expiresAt = now + args.durationMs;

    const staleUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q: any) => q.eq('email', email))
      .unique();

    if (staleUser) {
      const staleToken = await ctx.db
        .query('superadminAccessTokens')
        .withIndex('by_temp_user', (q: any) => q.eq('tempUserId', staleUser._id))
        .unique();
      if (staleToken) await ctx.db.delete(staleToken._id);
      await ctx.db.delete(staleUser._id);
    }

    const rawPassword = crypto.randomUUID().replace(/-/g, '').slice(0, 24) + 'Aa1!';
    const passwordHash = bcrypt.hashSync(rawPassword, BCRYPT_ROUNDS);

    const tempUserId = await ctx.db.insert('users', {
      organizationId: caller.organizationId,
      name: args.name,
      email,
      passwordHash,
      role: 'superadmin',
      employeeType: 'staff',
      department: 'Security Audit',
      position: 'External Auditor',
      isActive: true,
      isApproved: true,
      approvedAt: now,
      travelAllowance: 0,
      paidLeaveBalance: 0,
      sickLeaveBalance: 0,
      familyLeaveBalance: 0,
      dayOffBalance: 0,
      maternityLeaveBalance: 0,
      studyLeaveBalance: 0,
      createdAt: now,
    });

    const accessTokenId = await ctx.db.insert('superadminAccessTokens', {
      createdBy: caller._id,
      name: args.name,
      email,
      tempUserId,
      passwordHash,
      expiresAt,
      createdAt: now,
      isRevoked: false,
      revokedAt: undefined,
      lastUsedAt: undefined,
      reason: args.reason,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: caller.organizationId,
      userId: caller._id,
      action: 'GENERATE_SUPERADMIN_TOKEN',
      target: tempUserId,
      details: JSON.stringify({
        tokenId: accessTokenId,
        tempName: args.name,
        tempEmail: email,
        durationMs: args.durationMs,
        expiresAt,
        reason: args.reason,
      }),
      createdAt: now,
    });

    return {
      accessTokenId,
      tempUserId,
      email,
      password: rawPassword,
      expiresAt,
      expiresIn: args.durationMs,
      name: args.name,
    };
  },
});

/**
 * Revoke a temp superadmin access token and remove the user entirely.
 */
export const revokeAccessToken = mutation({
  args: {
    tokenId: v.id('superadminAccessTokens'),
  },
  handler: async (ctx, args) => {
    const caller = await requireAuthUserOrThrow(ctx);
    if (caller.role !== 'superadmin') throw new Error('Unauthorized');

    const token = await ctx.db.get(args.tokenId);
    if (!token) throw new Error('Token not found');
    if (token.isRevoked) throw new Error('Token already revoked');

    const now = Date.now();

    await ctx.db.delete(token.tempUserId);
    await ctx.db.delete(args.tokenId);

    await ctx.db.insert('auditLogs', {
      organizationId: caller.organizationId,
      userId: caller._id,
      action: 'REVOKE_SUPERADMIN_TOKEN',
      target: token.tempUserId,
      details: JSON.stringify({
        tokenId: args.tokenId,
        tempEmail: token.email,
        tempName: token.name,
      }),
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * List all superadmin access tokens created by the caller.
 */
export const listAccessTokens = query({
  args: {},
  handler: async (ctx) => {
    const caller = await requireAuthUserOrThrow(ctx);
    if (caller.role !== 'superadmin') throw new Error('Unauthorized');

    const tokens = await ctx.db
      .query('superadminAccessTokens')
      .withIndex('by_creator', (q: any) => q.eq('createdBy', caller._id))
      .order('desc')
      .take(100);

    const enriched = await Promise.all(
      tokens.map(async (t) => {
        const tempUser = await ctx.db.get(t.tempUserId);
        const now = Date.now();
        const isExpired = now > t.expiresAt;
        const userExists = tempUser !== null;

        return {
          ...t,
          tempUserIsActive: tempUser?.isActive ?? false,
          isExpired,
          userExists,
          status: t.isRevoked ? 'revoked' : isExpired ? 'expired' : 'active',
        };
      }),
    );

    return enriched;
  },
});

/**
 * Check if a user is a temp superadmin whose access has expired/revoked.
 * Used by the login mutation to block expired tokens.
 */
export async function checkTempAccessStillValid(
  ctx: any,
  userId: string,
): Promise<{ valid: boolean; reason?: string }> {
  const token = await ctx.db
    .query('superadminAccessTokens')
    .withIndex('by_temp_user', (q: any) => q.eq('tempUserId', userId))
    .unique();

  if (!token) return { valid: true };

  const now = Date.now();

  if (token.isRevoked || now > token.expiresAt) {
    await ctx.db.delete(token.tempUserId);
    await ctx.db.delete(token._id);
    return {
      valid: false,
      reason: token.isRevoked
        ? 'Your temporary access has been revoked by the superadmin.'
        : 'Your temporary access has expired. Contact the superadmin for renewal.',
    };
  }

  await ctx.db.patch(token._id, { lastUsedAt: now });
  return { valid: true };
}
