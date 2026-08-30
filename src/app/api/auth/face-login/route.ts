import { NextRequest, NextResponse } from 'next/server';
import { signJWT, type JWTPayload } from '@/lib/jwt';
import { log } from '@/lib/logger';
import { applyRateLimit, FACE_LOGIN_RATE_LIMIT } from '@/lib/rate-limit';

// SECURITY: Face descriptor matching is CPU-bound and uses bcrypt-adjacent
// primitives; keep on Node runtime, not Edge.
export const runtime = 'nodejs';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!CONVEX_URL) {
  throw new Error('NEXT_PUBLIC_CONVEX_URL environment variable is not set');
}

interface ConvexResponse {
  status: string;
  value?: unknown;
  errorMessage?: string;
}

/** Shape of the result returned by `faceRecognition:loginWithFace`. */
interface FaceVerificationResult {
  faceVerificationToken: string;
}

/** Fields consumed from the `auth:login` mutation result. */
interface LoginResult {
  userId: string;
  name: string;
  email: string;
  role: string;
  organizationId?: string;
  organizationSlug?: string;
  organizationName?: string;
  isApproved?: boolean;
  department?: string;
  position?: string;
  employeeType?: string;
  avatarUrl?: string;
}

interface MaintenanceMode {
  isActive: boolean;
  startTime: number;
}

async function convexMutation<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: name, args }),
    cache: 'no-store',
  });
  const data = (await res.json()) as ConvexResponse;
  if (data.status === 'error') throw new Error(data.errorMessage ?? 'Convex error');
  return data.value as T;
}

async function convexQuery<T>(name: string, args: Record<string, unknown>): Promise<T | null> {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: name, args }),
    cache: 'no-store',
  });
  const data = (await res.json()) as ConvexResponse;
  if (data.status === 'error') return null;
  return data.value as T;
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  // Rate limit: 10 attempts per 15 min per IP
  const rateLimitResponse = await applyRateLimit(request, FACE_LOGIN_RATE_LIMIT, 'face-login');
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = (await request.json()) as {
      email?: string;
      faceDescriptor?: number[];
    };
    const { email, faceDescriptor } = body;
    const ip = getClientIp(request);
    const userAgent = request.headers.get('user-agent') ?? undefined;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    if (!Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) {
      return NextResponse.json(
        { error: 'Valid face descriptor (128 floats) is required' },
        { status: 400 },
      );
    }

    // Reject obviously malformed descriptors (all zeros, non-finite, etc)
    if (
      !faceDescriptor.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10)
    ) {
      return NextResponse.json({ error: 'Malformed face descriptor' }, { status: 400 });
    }

    // Step 1 — server-side face matching → issues short-lived verification token
    let verification: FaceVerificationResult;
    try {
      verification = await convexMutation<FaceVerificationResult>('faceRecognition:loginWithFace', {
        email,
        faceDescriptor,
        ip,
        userAgent,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Face verification failed';
      log.warn('Face verification failed', { email, ip });
      return NextResponse.json({ error: msg }, { status: 401 });
    }

    const faceVerificationToken: string = verification.faceVerificationToken;

    // Step 2 — exchange token for session
    const sessionToken = crypto.randomUUID();
    const sessionExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;

    const result = await convexMutation<LoginResult>('auth:login', {
      email,
      password: '', // Not used when faceVerificationToken is valid
      sessionToken,
      sessionExpiry,
      isFaceLogin: true,
      faceVerificationToken,
    });

    // Maintenance mode check — block non-superadmin login
    if (result.role !== 'superadmin' && result.organizationId) {
      const maintenanceData = await convexQuery<MaintenanceMode>('admin:getMaintenanceMode', {
        organizationId: result.organizationId,
      });
      if (maintenanceData?.isActive && maintenanceData.startTime <= Date.now()) {
        return NextResponse.json(
          { error: 'maintenance', organizationId: result.organizationId },
          { status: 503 },
        );
      }
    }

    // Issue app JWT
    const jwt = await signJWT(
      {
        userId: result.userId,
        name: result.name,
        email: result.email,
        role: result.role as JWTPayload['role'],
        organizationId: result.organizationId,
        organizationSlug: result.organizationSlug,
        organizationName: result.organizationName,
        isApproved: result.isApproved,
        department: result.department,
        position: result.position,
        employeeType: result.employeeType as JWTPayload['employeeType'] | undefined,
        avatar: result.avatarUrl,
      },
      '7d',
      request,
    );

    const secure = process.env.NODE_ENV === 'production';

    log.info('Face Login successful', { userId: result.userId, email });

    const response = NextResponse.json({
      success: true,
      session: {
        userId: result.userId,
        name: result.name,
        email: result.email,
        role: result.role,
        organizationId: result.organizationId,
        department: result.department,
        position: result.position,
        employeeType: result.employeeType,
        avatar: result.avatarUrl,
      },
    });

    response.cookies.set('hr-auth-token', jwt, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });
    response.cookies.set('hr-session-token', sessionToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Login failed';
    log.error('Face Login API error', error as Error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
