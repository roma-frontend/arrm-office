import { NextRequest, NextResponse } from 'next/server';
import { signJWT, type JWTPayload } from '@/lib/jwt';
import { logger } from '@/lib/logger';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;

interface ConvexResponse {
  status: string;
  value?: unknown;
  errorMessage?: string;
}

/** Shape of the user doc returned by `users:getPublicUserByEmail`. */
interface OAuthUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  organizationId?: string | null;
  organizationSlug?: string | null;
  organizationName?: string | null;
  department?: string | null;
  position?: string | null;
  employeeType?: string | null;
  avatarUrl?: string | null;
}

/** Fields consumed from the `auth:login` mutation result. */
interface LoginResult {
  organizationSlug?: string;
  organizationName?: string;
}

interface MaintenanceMode {
  isActive: boolean;
  startTime: number;
}

async function convexMutation<T>(path: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  });
  const data = (await res.json()) as ConvexResponse;
  if (data.status === 'error') throw new Error(data.errorMessage ?? 'Convex error');
  return data.value as T;
}

async function convexQuery<T>(path: string, args: Record<string, unknown>): Promise<T | null> {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  });
  const data = (await res.json()) as ConvexResponse;
  if (data.status === 'error') return null;
  return data.value as T;
}

/**
 * POST /api/auth/oauth-session
 * Called after Google OAuth sync to create a JWT session for the user.
 * This replaces window.location.reload() — no page reload needed.
 */
export async function POST(req: NextRequest) {
  try {
    const { email, avatarUrl } = (await req.json()) as {
      email?: string;
      avatarUrl?: string;
    };

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();
    logger.log('[oauth-session] Starting OAuth session creation for:', emailLower);

    // 1. Find user by email via the PUBLIC projection — never credentials
    logger.log('[oauth-session] Querying Convex for user...');
    const userResult = await convexQuery<OAuthUser>('users:getPublicUserByEmail', {
      email: emailLower,
    });

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
      const maintenanceData = await convexQuery<MaintenanceMode>('admin:getMaintenanceMode', {
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
    const loginResult = await convexMutation<LoginResult>('auth:login', {
      email: emailLower,
      password: '',
      sessionToken,
      sessionExpiry,
      isOAuthLogin: true, // Google already verified identity
    });

    // Create JWT — getPublicUserByEmail returns the safe public projection
    const jwt = await signJWT({
      userId: userResult._id,
      name: userResult.name,
      email: userResult.email,
      role: userResult.role as JWTPayload['role'],
      organizationId: userResult.organizationId ?? undefined,
      organizationSlug: loginResult.organizationSlug,
      organizationName: loginResult.organizationName,
      department: userResult.department ?? undefined,
      position: userResult.position ?? undefined,
      employeeType: userResult.employeeType as JWTPayload['employeeType'] | undefined,
      avatar: userResult.avatarUrl ?? avatarUrl,
    });

    logger.log('[oauth-session] ✅ JWT created for user:', {
      userId: userResult._id,
      name: userResult.name,
      role: userResult.role,
    });

    // Log the OAuth login
    try {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
      const auditEnabled = await convexQuery<boolean>('security:getSetting', {
        key: 'audit_logging',
      });
      if (auditEnabled) {
        await convexMutation('security:logLoginAttempt', {
          email: emailLower,
          userId: userResult._id,
          organizationId: userResult.organizationId,
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
        userId: userResult._id,
        name: userResult.name,
        email: userResult.email,
        role: userResult.role,
        organizationId: userResult.organizationId,
        organizationSlug: loginResult.organizationSlug,
        organizationName: loginResult.organizationName,
        department: userResult.department,
        position: userResult.position,
        employeeType: userResult.employeeType,
        avatar: userResult.avatarUrl ?? avatarUrl,
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create OAuth session';
    console.error('[oauth-session] ❌ OAuth session error:', message || error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
