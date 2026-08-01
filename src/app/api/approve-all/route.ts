/**
 * Approve all existing users — SUPERADMIN ONLY
 * Previously had NO authentication check!
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { logger } from '@/lib/logger';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;

async function convexMutation(name: string, args: Record<string, unknown>) {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: name, args }),
  });
  const data = (await res.json()) as { status: string; errorMessage?: string; value?: unknown };
  if (data.status === 'error') throw new Error(data.errorMessage ?? 'Convex error');
  return data.value;
}

/**
 * Verify the user is a superadmin.
 */
async function verifySuperadmin(): Promise<{ userId: string; role: string } | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('oauth-session');
    if (!sessionCookie) return null;

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return null;

    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(sessionCookie.value, secret);

    if (payload.role !== 'superadmin') {
      logger.warn('[Approve-All] Non-superadmin access attempt:', payload.role);
      return null;
    }

    return { userId: payload.sub as string, role: payload.role as string };
  } catch {
    return null;
  }
}

export const POST = withCsrfProtection(async () => {
  // SECURITY: Require superadmin authentication
  const user = await verifySuperadmin();
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized. Superadmin access required.' },
      { status: 401 },
    );
  }

  try {
    const result = await convexMutation('migrations:approveAllExistingUsers', {});
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
});
