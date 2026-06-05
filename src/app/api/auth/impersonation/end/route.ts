import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT, signJWT } from '@/lib/jwt';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

async function convexMutation(path: string, args: Record<string, unknown>) {
  if (!CONVEX_URL) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL environment variable is not set');
  }

  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
    cache: 'no-store',
  });

  const data = await res.json();
  if (!res.ok || data.status === 'error') {
    throw new Error(data.errorMessage ?? `HTTP ${res.status}`);
  }

  return data.value;
}

export async function POST(req: NextRequest) {
  try {
    const jwt = req.cookies.get('hr-auth-token')?.value;
    if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await verifyJWT(jwt);
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Idempotent exit: if impersonation metadata is already absent,
    // treat this as an already-ended session and return current user session.
    if (!payload.impersonation?.active) {
      return NextResponse.json({
        success: true,
        session: {
          userId: payload.userId,
          name: payload.name,
          email: payload.email,
          role: payload.role,
          organizationId: payload.organizationId,
          organizationSlug: payload.organizationSlug,
          organizationName: payload.organizationName,
          isApproved: payload.isApproved,
          department: payload.department,
          position: payload.position,
          employeeType: payload.employeeType,
          avatar: payload.avatar,
        },
      });
    }

    const restoredSessionToken = crypto.randomUUID();
    const restoredSessionExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;

    const result = await convexMutation('superadmin:endImpersonationWithToken', {
      sessionId: payload.impersonation.sessionId,
      token: payload.impersonation.sessionToken,
      restoredSessionToken,
      restoredSessionExpiry,
    });

    const superadmin = result.superadmin;
    if (!superadmin?.id || !superadmin?.email) {
      return NextResponse.json({ error: 'Invalid superadmin account' }, { status: 500 });
    }

    const restoredJwt = await signJWT({
      userId: String(superadmin.id),
      name: superadmin.name,
      email: superadmin.email,
      role: superadmin.role,
      organizationId: superadmin.organizationId,
      organizationSlug: superadmin.organizationSlug,
      organizationName: superadmin.organizationName,
      isApproved: superadmin.isApproved,
      department: superadmin.department,
      position: superadmin.position,
      employeeType: superadmin.employeeType,
      avatar: superadmin.avatar,
    });

    const response = NextResponse.json({
      success: true,
      session: {
        userId: String(superadmin.id),
        name: superadmin.name,
        email: superadmin.email,
        role: superadmin.role,
        organizationId: superadmin.organizationId,
        organizationSlug: superadmin.organizationSlug,
        organizationName: superadmin.organizationName,
        isApproved: superadmin.isApproved,
        department: superadmin.department,
        position: superadmin.position,
        employeeType: superadmin.employeeType,
        avatar: superadmin.avatar,
      },
    });

    const sevenDays = 7 * 24 * 60 * 60;
    response.cookies.set('hr-auth-token', restoredJwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: sevenDays,
      path: '/',
    });

    response.cookies.set('hr-session-token', restoredSessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: sevenDays,
      path: '/',
    });

    response.cookies.set('session_expiry', String(Date.now() + sevenDays * 1000), {
      maxAge: sevenDays,
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Impersonation end error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to end impersonation' },
      { status: 500 },
    );
  }
}
