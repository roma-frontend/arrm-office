import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { withCsrfProtection } from '@/lib/csrf-middleware';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;

async function convexMutation(path: string, args: Record<string, unknown>) {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  });
  const data = (await res.json()) as { status: string; errorMessage?: string; value?: unknown };
  if (data.status === 'error') throw new Error(data.errorMessage ?? 'Convex error');
  return data.value;
}

/**
 * Verify JWT auth token.
 */
async function verifyAuth(): Promise<{ userId: string; role: string } | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('hr-auth-token') || cookieStore.get('oauth-session');
    if (!token) return null;

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return null;

    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token.value, secret);
    return { userId: payload.sub as string, role: (payload.role as string) || 'employee' };
  } catch {
    return null;
  }
}

export const POST = withCsrfProtection(async (req: NextRequest) => {
  // SECURITY: Require authentication
  const auth = await verifyAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { userId, event, details } = (await req.json()) as {
      userId?: string;
      event?: string;
      details?: Record<string, unknown>;
    };
    if (!userId || !event) {
      return NextResponse.json({ error: 'Missing userId or event' }, { status: 400 });
    }

    await convexMutation('security:logLoginAttempt', {
      email: '',
      userId,
      success: false,
      method: 'password',
      blockedReason: `${event}: ${details ?? ''}`,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
      userAgent: req.headers.get('user-agent') ?? undefined,
      riskScore: 90,
      riskFactors: [event],
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
});
