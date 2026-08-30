import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, signConvexJWT, type JWTPayload } from '@/lib/jwt';
import { auth } from '@/auth';
import { resolveConvexUserIdByEmail } from '@/lib/convex-server-query';
import { logger } from '@/lib/logger';

/**
 * Mint a fresh Convex auth token for the browser auth bridge.
 *
 * IMPORTANT: We always re-derive identity from the trusted session and re-sign
 * a fresh Convex JWT. We deliberately do NOT return a cached `convex-auth-token`
 * cookie: a stale/expired token (or one signed before a key/issuer change) would
 * be rejected by Convex, leaving `getUserIdentity()` null and every auth-gated
 * function failing until the cookie is manually cleared.
 *
 * Identity sources, in order:
 *   1. `hr-auth-token` cookie  — credential / face login
 *   2. `oauth-session` cookie  — OAuth bridge session
 *   3. NextAuth session        — OAuth users before the cookie sync completes
 */
export async function GET() {
  const jar = await cookies();

  // 1 + 2: custom JWT cookies (credential login or OAuth bridge session)
  const sessionToken = jar.get('hr-auth-token')?.value ?? jar.get('oauth-session')?.value;
  let payload: JWTPayload | null = sessionToken ? await verifyJWT(sessionToken) : null;

  // 3: fall back to NextAuth session (OAuth users)
  if (!payload) {
    try {
      const session = await auth();
      if (session?.user?.email) {
        // `session.user.id` is the provider subject (UUID / Google sub), NOT a
        // Convex id. The minted Convex JWT's subject must reference the Convex
        // user, so resolve `_id` from the verified email.
        const convexUserId = await resolveConvexUserIdByEmail(session.user.email);
        payload = {
          userId: convexUserId ?? '',
          name: session.user.name ?? 'User',
          email: session.user.email,
          role: (session.user.role as JWTPayload['role']) ?? 'employee',
          organizationId: session.user.organizationId,
          isApproved: session.user.isApproved,
          department: session.user.department,
          position: session.user.position,
          employeeType: session.user.employeeType as JWTPayload['employeeType'],
          avatar: session.user.avatar,
        };
      }
    } catch {
      // NextAuth unavailable — fall through to 401
    }
  }

  if (!payload) {
    // Anonymous visitor — not an error, just no token to mint. Returning 200 with
    // a null token (instead of 401) avoids a noisy console error on public pages
    // while the client treats `token: null` exactly like an unauthenticated state.
    return NextResponse.json({ token: null });
  }

  try {
    const convexToken = await signConvexJWT(payload, '7d', jar);
    return NextResponse.json({ token: convexToken });
  } catch (err) {
    logger.error('[convex-token] failed to sign Convex JWT:', err);
    return NextResponse.json({ error: 'Convex auth not configured' }, { status: 503 });
  }
}
