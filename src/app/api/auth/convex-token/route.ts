import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, signConvexJWT } from '@/lib/jwt';

export async function GET() {
  const jar = await cookies();

  const existing = jar.get('convex-auth-token')?.value;
  if (existing) return NextResponse.json({ token: existing });

  const hrToken = jar.get('hr-auth-token')?.value;
  if (!hrToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const payload = await verifyJWT(hrToken);
  if (!payload) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  try {
    const convexToken = await signConvexJWT(payload);
    return NextResponse.json({ token: convexToken });
  } catch {
    return NextResponse.json({ error: 'Convex auth not configured' }, { status: 503 });
  }
}
