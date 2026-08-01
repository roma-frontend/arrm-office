import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, PASSWORD_RESET_RATE_LIMIT } from '@/lib/rate-limit';

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

export async function POST(req: NextRequest) {
  // Rate limiting: 3 requests per hour
  const rateLimitResponse = await applyRateLimit(req, PASSWORD_RESET_RATE_LIMIT, 'reset-password');
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { token, newPassword } = (await req.json()) as { token?: string; newPassword?: string };
    if (!token || !newPassword) {
      return NextResponse.json({ error: 'Token and new password are required' }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 },
      );
    }

    // Convex handles hashing internally (same as login/register)
    await convexMutation('auth:resetPassword', {
      token,
      newPassword,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Something went wrong';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
