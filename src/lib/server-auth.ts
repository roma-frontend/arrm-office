import { cookies } from 'next/headers';
import { verifyJWT, type JWTPayload } from '@/lib/jwt';
import { auth } from '@/auth';
import { resolveConvexUserIdByEmail } from '@/lib/convex-server-query';

/**
 * Unified server-side auth helper for React Server Components.
 * Checks both auth systems in order:
 * 1. Custom JWT cookie (hr-auth-token) — primary for credential/face login
 * 2. NextAuth session (OAuth + credentials provider) — fallback
 * Returns null if not authenticated.
 */
export async function getServerUser(): Promise<JWTPayload | null> {
  // 1. Try custom JWT first (faster, no DB call)
  const cookieStore = await cookies();
  const token = cookieStore.get('hr-auth-token')?.value;
  if (token) {
    const payload = await verifyJWT(token);
    if (payload) return payload;
  }

  // 2. Fallback to NextAuth session (OAuth users)
  try {
    const session = await auth();
    if (session?.user?.email) {
      // SECURITY/CORRECTNESS: `session.user.id` is the provider subject (a
      // UUID / Google sub), NOT a Convex document id. Every consumer treats
      // `JWTPayload.userId` as `Id<'users'>`, so resolve the Convex `_id` from
      // the verified email before returning. Without this, Convex queries
      // reject the value with ArgumentValidationError (see tasks page crash).
      const convexUserId = await resolveConvexUserIdByEmail(session.user.email);
      return {
        userId: convexUserId ?? '',
        name: session.user.name ?? 'User',
        email: session.user.email,
        role: (session.user.role as JWTPayload['role']) ?? 'employee',
        organizationId: session.user.organizationId,
        isApproved: session.user.isApproved,
      };
    }
  } catch {
    // NextAuth not available or session expired
  }

  return null;
}
