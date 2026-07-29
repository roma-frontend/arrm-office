import { NextRequest, NextResponse } from 'next/server';
import { signJWT } from '@/lib/jwt';
import { logger } from '@/lib/logger';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;

async function convexMutation(path: string, args: Record<string, unknown>) {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  });
  const data = await res.json();
  if (data.status === 'error') throw new Error(data.errorMessage ?? 'Convex error');
  return data.value;
}

async function convexQuery(path: string, args: Record<string, unknown>) {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  });
  const data = await res.json();
  if (data.status === 'error') return null;
  return data.value;
}

/**
 * POST /api/auth/oauth-session
 * Called after Google OAuth sync to create a JWT session for the user.
 * This replaces window.location.reload() — no page reload needed.
 */
export async function POST(req: NextRequest) {
  try {
    const { email, name, avatarUrl } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();
    logger.log('[oauth-session] Starting OAuth session creation for:', emailLower);

    // 1. Find user by email directly via query
    logger.log('[oauth-session] Querying Convex for user...');
    const userResult = await convexQuery('users:getUserByEmail', { email: emailLower });

    logger.log(
      '[oauth-session] Convex query result:',
      userResult
        ? {
            id: userResult._id,
            name: userResult.name,
            email: userResult.email,
            role: userResult.role,
            department: userResult.department,
            position: userResult.position,
          }
        : 'NOT_FOUND',
    );

    if (!userResult) {
      console.error('[oauth-session] ❌ User not found in database:', emailLower);
      return NextResponse.json({ error: 'User not found in database' }, { status: 404 });
    }

    // Check maintenance mode — block non-superadmin login
    if (userResult.role !== 'superadmin' && userResult.organizationId) {
      const maintenanceData = await convexQuery('admin:getMaintenanceMode', {
        organizationId: userResult.organizationId,
      });
      if (maintenanceData?.isActive && maintenanceData.startTime <= Date.now()) {
        return NextResponse.json(
          { error: 'maintenance', organizationId: userResult.organizationId },
          { status: 503 },
        );
      }
    }

    // 2. Create session via mutation (bypasses password — OAuth is trusted)
    const sessionToken = crypto.randomUUID();
    const sessionExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    logger.log('[oauth-session] Creating login session...');
    const loginResult = await convexMutation('auth:login', {
      email: emailLower,
      password: '',
      sessionToken,
      sessionExpiry,
      isOAuthLogin: true, // Google already verified identity
    });

    const result = userResult;

    // Create JWT — getUserByEmail returns Convex doc with _id field
    const jwt = await signJWT({
      userId: result._id,
      name: result.name,
      email: result.email,
      role: result.role,
      organizationId: result.organizationId,
      organizationSlug: loginResult.organizationSlug,
      organizationName: loginResult.organizationName,
      department: result.department,
      position: result.position,
      employeeType: result.employeeType,
      avatar: result.avatarUrl ?? avatarUrl,
    });

    logger.log('[oauth-session] ✅ JWT created for user:', {
      userId: result._id,
      name: result.name,
      role: result.role,
    });

    // Log the OAuth login
    try {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
      const auditEnabled = await convexQuery('security:getSetting', { key: 'audit_logging' });
      if (auditEnabled) {
        await convexMutation('security:logLoginAttempt', {
          email: emailLower,
          userId: result._id,
          organizationId: result.organizationId,
          success: true,
          method: 'google',
          ip,
          userAgent: req.headers.get('user-agent') ?? undefined,
          riskScore: 5, // Google OAuth is trusted
          riskFactors: [],
        });
      }
    } catch {}

    const responseData = {
      success: true,
      session: {
        userId: result._id,
        name: result.name,
        email: result.email,
        role: result.role,
        organizationId: result.organizationId,
        organizationSlug: loginResult.organizationSlug,
        organizationName: loginResult.organizationName,
        department: result.department,
        position: result.position,
        employeeType: result.employeeType,
        avatar: result.avatarUrl ?? avatarUrl,
      },
    };

    logger.log('[oauth-session] ✅ Returning success response:', {
      userId: responseData.session.userId,
      name: responseData.session.name,
      email: responseData.session.email,
      role: responseData.session.role,
    });

    const response = NextResponse.json(responseData);
    response.cookies.set('hr-auth-token', jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });
    response.cookies.set('hr-session-token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error('[oauth-session] ❌ OAuth session error:', error.message || error);
    return NextResponse.json(
      { error: error.message || 'Failed to create OAuth session' },
      { status: 500 },
    );
  }
}
