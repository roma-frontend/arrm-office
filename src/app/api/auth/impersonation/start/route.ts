import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT, signJWT, type JWTPayload } from '@/lib/jwt';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

interface ConvexResponse {
  status: string;
  value?: unknown;
  errorMessage?: string;
}

/** Shape of the target user doc returned by `superadmin:activateImpersonationSession`. */
interface ImpersonationTargetUser {
  id?: string;
  email?: string;
  name: string;
  role: string;
  organizationId?: string;
  organizationSlug?: string;
  organizationName?: string;
  isApproved?: boolean;
  department?: string;
  position?: string;
  employeeType?: string;
  avatar?: string;
}

interface ActivateImpersonationResult {
  targetUser?: ImpersonationTargetUser | null;
  sessionId?: string;
  token?: string;
  expiresAt?: number;
}

async function convexMutation<T>(path: string, args: Record<string, unknown>): Promise<T> {
  if (!CONVEX_URL) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL environment variable is not set');
  }

  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
    cache: 'no-store',
  });

  const data = (await res.json()) as ConvexResponse;
  if (!res.ok || data.status === 'error') {
    throw new Error(data.errorMessage ?? `HTTP ${res.status}`);
  }

  return data.value as T;
}

export async function POST(req: NextRequest) {
  try {
    const jwt = req.cookies.get('hr-auth-token')?.value;
    if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await verifyJWT(jwt);
    if (!payload || payload.role !== 'superadmin' || payload.impersonation?.active) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { sessionId, token } = (await req.json()) as {
      sessionId?: string;
      token?: string;
    };

    if (!sessionId || !token) {
      return NextResponse.json({ error: 'sessionId and token are required' }, { status: 400 });
    }

    const targetSessionToken = crypto.randomUUID();
    const targetSessionExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;

    const activation = await convexMutation<ActivateImpersonationResult>(
      'superadmin:activateImpersonationSession',
      {
        sessionId,
        token,
        superadminId: payload.userId,
        targetSessionToken,
        targetSessionExpiry,
      },
    );

    const target = activation.targetUser;
    if (!target?.id || !target?.email) {
      return NextResponse.json({ error: 'Invalid target user' }, { status: 500 });
    }

    const impersonationPayload = {
      active: true as const,
      sessionId: String(activation.sessionId),
      sessionToken: String(activation.token),
      expiresAt: Number(activation.expiresAt),
      superadmin: {
        userId: payload.userId,
        name: payload.name,
        email: payload.email,
        role: 'superadmin' as const,
        organizationId: payload.organizationId,
        organizationSlug: payload.organizationSlug,
        organizationName: payload.organizationName,
        department: payload.department,
        position: payload.position,
        employeeType: payload.employeeType,
        avatar: payload.avatar,
        isApproved: payload.isApproved,
      },
    };

    const impersonationJwt = await signJWT({
      userId: String(target.id),
      name: target.name,
      email: target.email,
      role: target.role as JWTPayload['role'],
      organizationId: target.organizationId,
      organizationSlug: target.organizationSlug,
      organizationName: target.organizationName,
      isApproved: target.isApproved,
      department: target.department,
      position: target.position,
      employeeType: target.employeeType as JWTPayload['employeeType'] | undefined,
      avatar: target.avatar,
      impersonation: impersonationPayload,
    });

    const response = NextResponse.json({
      success: true,
      session: {
        userId: String(target.id),
        name: target.name,
        email: target.email,
        role: target.role,
        organizationId: target.organizationId,
        organizationSlug: target.organizationSlug,
        organizationName: target.organizationName,
        isApproved: target.isApproved,
        department: target.department,
        position: target.position,
        employeeType: target.employeeType,
        avatar: target.avatar,
        impersonation: {
          active: true,
          sessionId: String(activation.sessionId),
          expiresAt: Number(activation.expiresAt),
          superadminName: payload.name,
          superadminEmail: payload.email,
        },
      },
    });

    const sevenDays = 7 * 24 * 60 * 60;
    response.cookies.set('hr-auth-token', impersonationJwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: sevenDays,
      path: '/',
    });

    response.cookies.set('hr-session-token', targetSessionToken, {
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to start impersonation';
    console.error('Impersonation start error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
