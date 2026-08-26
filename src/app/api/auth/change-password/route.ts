import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/rate-limit';
import type { RateLimitConfig } from '@/lib/rate-limit';
import { verifyJWT } from '@/lib/jwt';
import { cookies } from 'next/headers';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;

/** Authenticated rotation cap — see POST below for why this is looser than reset. */
const PASSWORD_CHANGE_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 10,
  windowMs: 60 * 60 * 1000,
  blockDurationMs: 15 * 60 * 1000,
};

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
 * Authenticated password change for the logged-in user. This is where a
 * superadmin-issued temporary password gets rotated into the user's own
 * credential — the Convex mutation also lifts the `mustChangePassword` flag.
 *
 * On success every session is invalidated server-side, so we clear the local
 * cookies too and send the user back through /login.
 */
export async function POST(req: NextRequest) {
  // Unlike the anonymous email reset (3/hour), this endpoint already requires
  // a valid authenticated session AND a correct current password verified in
  // Convex — so it is far less abuse-worthy. A generous cap still stops
  // credential-stuffing bursts without locking out a user who mistypes their
  // current password twice.
  const rateLimitResponse = await applyRateLimit(
    req,
    PASSWORD_CHANGE_RATE_LIMIT,
    'change-password',
  );
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('hr-auth-token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const payload = await verifyJWT(token);
    if (!payload?.userId) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { currentPassword, newPassword } = (await req.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current and new password are required' }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 },
      );
    }

    // Convex verifies the current password and re-hashes the new one internally
    // (same as login/register). Also clears mustChangePassword + temp window.
    await convexMutation('auth:changePassword', {
      userId: payload.userId,
      currentPassword,
      newPassword,
    });

    const response = NextResponse.json({ success: true });
    response.cookies.set('hr-auth-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });
    response.cookies.set('hr-session-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Something went wrong';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
