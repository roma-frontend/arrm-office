import { NextRequest, NextResponse } from 'next/server';
import { signJWT } from '@/lib/jwt';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

/**
 * imID OAuth callback — Convex HTTP action redirects here after a successful
 * authentication. This route:
 *   1. Verifies the session token via Convex `auth:verifySession`
 *   2. Signs a proper JWT with user info
 *   3. Sets hr-auth-token (JWT) + hr-session-token (UUID) cookies
 *   4. Redirects to /dashboard
 *
 * We need this bridge because the Convex HTTP runtime has no access to
 * JWT_SECRET (it's a Next.js env var) and cannot sign a JWT directly.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const sessionToken = searchParams.get('sessionToken');
    const isNewUser = searchParams.get('welcome') === 'true';
    const needsApproval = searchParams.get('pending_approval') === 'true';

    if (!sessionToken) {
      const loc = new URL('/login?error=imid_missing_token', request.url);
      return NextResponse.redirect(loc);
    }

    // ── Handle needsApproval before calling Convex ──────────────────────────
    // When imidUpsertUser creates a user that is not the first org member, it
    // does NOT save the sessionToken on the user record (because the account
    // is pending admin approval). The verifySession call would fail, so skip
    // it and redirect to login with the pending_approval hint instead.
    if (needsApproval) {
      const loc = new URL('/login?pending_approval=true', request.url);
      return NextResponse.redirect(loc);
    }

    if (!CONVEX_URL) {
      console.error('[imid-callback] CONVEX_URL is not set');
      const loc = new URL('/login?error=imid_config_error', request.url);
      return NextResponse.redirect(loc);
    }

    // ── 1. Verify the session token via Convex ─────────────────────────────
    const res = await fetch(`${CONVEX_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'auth:verifySession',
        args: { sessionToken },
        format: 'json',
      }),
      cache: 'no-store',
    });

    if (!res.ok) {
      console.error('[imid-callback] Convex query failed:', res.status);
      const loc = new URL('/login?error=imid_verify_failed', request.url);
      return NextResponse.redirect(loc);
    }

    const data = (await res.json()) as {
      status?: string;
      value?: unknown;
      errorMessage?: string;
    };
    if (data.status === 'error' || !data.value) {
      console.error('[imid-callback] Session verification failed:', data.errorMessage);
      const loc = new URL('/login?error=imid_session_expired', request.url);
      return NextResponse.redirect(loc);
    }

    const user = data.value as {
      userId: string;
      name: string;
      email: string;
      role: string;
      organizationId: string;
      organizationName?: string;
      organizationSlug?: string;
      department?: string;
      position?: string;
      employeeType?: string;
      avatarUrl?: string;
      isApproved?: boolean;
    };

    // ── 2. Sign a proper JWT ──────────────────────────────────────────────
    const jwt = await signJWT({
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role as 'admin' | 'supervisor' | 'employee' | 'superadmin' | 'driver',
      organizationId: user.organizationId,
      organizationSlug: user.organizationSlug,
      organizationName: user.organizationName,
      department: user.department,
      position: user.position,
      employeeType: (user.employeeType as 'staff' | 'contractor') ?? 'staff',
      avatar: user.avatarUrl,
      isApproved: user.isApproved,
    });

    // ── 3. Build redirect target ──────────────────────────────────────────
    // Note: needsApproval is handled by the early return above (line ~35),
    // because unapproved users have no sessionToken stored on their record
    // and cannot be verified. So at this point we always redirect to dashboard.
    const params = new URLSearchParams();
    if (isNewUser) params.set('welcome', 'true');
    const qs = params.toString();
    const redirectTarget = qs ? `/dashboard?${qs}` : '/dashboard';

    const response = NextResponse.redirect(new URL(redirectTarget, request.url));

    // ── 4. Set cookies ────────────────────────────────────────────────────
    response.cookies.set('hr-auth-token', jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    // Also set the hr-session-token (UUID) matching the pattern used by
    // loginAction — some backend code references it by this cookie name.
    response.cookies.set('hr-session-token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[imid-callback] Unexpected error:', error);
    const loc = new URL('/login?error=imid_unexpected', request.url);
    return NextResponse.redirect(loc);
  }
}
