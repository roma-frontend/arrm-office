import { cookies } from 'next/headers';
import { verifyJWT, type JWTPayload } from '@/lib/jwt';
import { auth } from '@/app/api/auth/[...nextauth]/route';

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
      return {
        userId: session.user.id ?? '',
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
