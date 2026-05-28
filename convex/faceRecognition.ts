import { v } from 'convex/values';
import { mutation, query, internalQuery } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireRequester } from './lib/requireRequester';
import { withAuth } from './lib/withAuth';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

/**
 * face-api.js descriptors are 128-dim Float32 vectors. Euclidean distance
 * < 0.5 is a match (per face-api.js docs). 0.6 is a looser threshold.
 * We use 0.55 as a balanced default.
 */
const FACE_MATCH_DISTANCE_THRESHOLD = 0.55;
const FACE_DESCRIPTOR_LENGTH = 128;
const FACE_LOGIN_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FACE_LOGIN_MAX_FAILED_ATTEMPTS = 5;
const FACE_LOGIN_COOLDOWN_MS = 15 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Euclidean distance between two face descriptors.
 * Lower = more similar.
 */
function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    const d = ai - bi;
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function generateToken(): string {
  // 256-bit random token, hex-encoded. crypto.getRandomValues is available in Convex.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ═══════════════════════════════════════════════════════════════
// REGISTER / MANAGE FACE
// ═══════════════════════════════════════════════════════════════

/**
 * Register face descriptor for a user.
 */
export const registerFace = mutation({
  args: {
    userId: v.id('users'),
    faceDescriptor: v.array(v.number()),
    faceImageUrl: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.faceDescriptor.length !== FACE_DESCRIPTOR_LENGTH) {
      throw new Error(`Face descriptor must be ${FACE_DESCRIPTOR_LENGTH}-dim`);
    }

    const user = (await ctx.db.get(args.userId)) as any;
    if (!user) throw new Error('User not found');

    const patch: Record<string, unknown> = {
      faceDescriptor: args.faceDescriptor,
      faceImageUrl: args.faceImageUrl,
      faceRegisteredAt: Date.now(),
    };
    if (!user.avatarUrl) patch.avatarUrl = args.faceImageUrl;

    await ctx.db.patch(args.userId, patch);

    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId: args.userId,
      action: 'face_registered',
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Return ONLY the requesting user's own face descriptor (for re-registration flows).
 * Superadmin gets the target user's descriptor.
 */
export const getFaceDescriptor = query({
  args: {
    userId: v.id('users'),
    requesterId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    const requester =
      caller ?? (args.requesterId ? await requireRequester(ctx, args.requesterId) : null);
    if (!requester) return null;

    // Only self or superadmin can read face data
    const isSelf = requester._id === args.userId;
    const isSuperadmin = requester.role === 'superadmin';
    if (!isSelf && !isSuperadmin) return null;

    const user = (await ctx.db.get(args.userId)) as any;
    if (!user) return null;

    return {
      faceDescriptor: user.faceDescriptor,
      faceImageUrl: user.faceImageUrl,
      faceRegisteredAt: user.faceRegisteredAt,
    };
  }),
});

/**
 * Remove face registration.
 * Self-service or admin-initiated.
 */
export const removeFaceRegistration = mutation({
  args: {
    userId: v.id('users'),
    requesterId: v.id('users'),
  },
  handler: async (ctx, { userId, requesterId }) => {
    const requester = await ctx.db.get(requesterId);
    if (!requester) throw new Error('Requester not found');

    const target = await ctx.db.get(userId);
    if (!target) throw new Error('User not found');

    // Self, same-org admin, or superadmin only
    const isSelf = requesterId === userId;
    const isSuperadmin = requester.role === 'superadmin';
    const isOrgAdmin =
      requester.role === 'admin' && requester.organizationId === target.organizationId;

    if (!isSelf && !isSuperadmin && !isOrgAdmin) {
      throw new Error('Not authorized to remove face registration');
    }

    await ctx.db.patch(userId, {
      faceDescriptor: undefined,
      faceImageUrl: undefined,
      faceRegisteredAt: undefined,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: target.organizationId,
      userId: requesterId,
      action: 'face_removed',
      target: userId,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

// ═══════════════════════════════════════════════════════════════
// SERVER-SIDE FACE LOGIN (secure replacement for client-side matching)
// ═══════════════════════════════════════════════════════════════

/**
 * Server-side face verification.
 *
 * Accepts a candidate face descriptor from the client and matches it against
 * the stored descriptor for the given email. If it matches, issues a one-time
 * `faceVerificationToken` that auth:login accepts.
 *
 * This replaces the insecure client-side matching that previously leaked
 * all users' biometric descriptors to the browser.
 */
export const loginWithFace = mutation({
  args: {
    email: v.string(),
    faceDescriptor: v.array(v.number()),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.faceDescriptor.length !== FACE_DESCRIPTOR_LENGTH) {
      throw new Error('Invalid face descriptor');
    }

    const email = args.email.toLowerCase().trim();
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique();

    // Uniform error to avoid email/face enumeration
    const genericError = 'Face ID verification failed';

    if (!user || !user.isActive || !user.isApproved) throw new Error(genericError);
    if (!user.faceDescriptor || user.faceDescriptor.length !== FACE_DESCRIPTOR_LENGTH) {
      throw new Error(genericError);
    }

    // Rate-limit: check for too many failed face attempts in recent window
    if (user.faceIdBlocked) {
      const blockedAt = user.faceIdBlockedAt ?? 0;
      if (Date.now() - blockedAt < FACE_LOGIN_COOLDOWN_MS) {
        throw new Error(
          'Face ID is temporarily blocked due to failed attempts. Please use password login.',
        );
      }
      // Cooldown passed — unblock
      await ctx.db.patch(user._id, {
        faceIdBlocked: false,
        faceIdFailedAttempts: 0,
      });
    }

    const distance = euclideanDistance(args.faceDescriptor, user.faceDescriptor);
    const isMatch = distance < FACE_MATCH_DISTANCE_THRESHOLD;

    if (!isMatch) {
      const failedAttempts = (user.faceIdFailedAttempts ?? 0) + 1;
      const shouldBlock = failedAttempts >= FACE_LOGIN_MAX_FAILED_ATTEMPTS;

      await ctx.db.patch(user._id, {
        faceIdFailedAttempts: failedAttempts,
        faceIdLastAttempt: Date.now(),
        ...(shouldBlock && {
          faceIdBlocked: true,
          faceIdBlockedAt: Date.now(),
        }),
      });

      await ctx.db.insert('auditLogs', {
        organizationId: user.organizationId,
        userId: user._id,
        action: 'face_login_failed',
        details: `Face distance ${distance.toFixed(3)} above threshold ${FACE_MATCH_DISTANCE_THRESHOLD}. Attempts: ${failedAttempts}`,
        ip: args.ip,
        createdAt: Date.now(),
      });

      await ctx.db.insert('loginAttempts', {
        email,
        userId: user._id,
        organizationId: user.organizationId,
        success: false,
        method: 'face_id',
        ip: args.ip,
        userAgent: args.userAgent,
        blockedReason: shouldBlock ? 'Too many failed Face ID attempts' : undefined,
        createdAt: Date.now(),
      });

      throw new Error(genericError);
    }

    // Match succeeded — reset counters
    if (user.faceIdFailedAttempts && user.faceIdFailedAttempts > 0) {
      await ctx.db.patch(user._id, {
        faceIdFailedAttempts: 0,
        faceIdBlocked: false,
      });
    }

    // Issue one-time verification token
    const token = generateToken();
    const now = Date.now();
    await ctx.db.insert('faceLoginTokens', {
      userId: user._id,
      token,
      issuedAt: now,
      expiresAt: now + FACE_LOGIN_TOKEN_TTL_MS,
      ip: args.ip,
      userAgent: args.userAgent,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId: user._id,
      action: 'face_login_verified',
      details: `Face distance ${distance.toFixed(3)}`,
      ip: args.ip,
      createdAt: now,
    });

    return {
      faceVerificationToken: token,
      expiresAt: now + FACE_LOGIN_TOKEN_TTL_MS,
      email: user.email,
    };
  },
});

/**
 * DEPRECATED — LEGACY CLIENT-SIDE MATCHING ENDPOINT.
 *
 * Previously returned every active user's face descriptor to the browser,
 * enabling an attacker to harvest biometrics and impersonate anyone whose
 * descriptor they steal. The secure replacement is `loginWithFace` above,
 * which keeps descriptors server-side.
 *
 * This function now returns an empty array so existing UI keeps loading,
 * but all real verification must go through `loginWithFace`.
 *
 * TODO: remove after all clients migrate.
 */
export const getAllFaceDescriptors = query({
  args: {},
  handler: async () => {
    return [] as Array<{
      userId: Id<'users'>;
      name: string;
      email: string;
      faceDescriptor: number[];
    }>;
  },
});

/**
 * Internal: cleanup expired face-login tokens (run from cron).
 */
export const pruneExpiredFaceTokens = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query('faceLoginTokens')
      .withIndex('by_expires', (q) => q.lt('expiresAt', now))
      .take(500);
    return expired.map((t) => t._id);
  },
});
