import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { signJWT } from '@/lib/jwt';
import { log } from '@/lib/logger';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!CONVEX_URL) {
  throw new Error('NEXT_PUBLIC_CONVEX_URL environment variable is not set');
}

async function convexMutation(name: string, args: Record<string, unknown>) {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: name, args }),
  });
  const data = await res.json();
  if (data.status === "error") throw new Error(data.errorMessage ?? "Convex error");
  return data.value;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, isFaceLogin } = body;

    log.info('Face Login API called', { email, isFaceLogin });

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const sessionToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sessionExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;

    // Call Convex login mutation
    const result = await convexMutation("auth:login", {
      email,
      password: "", // Empty password for Face ID login
      sessionToken,
      sessionExpiry,
      isFaceLogin: true,
    });

    log.debug('Convex login successful', { userId: result.userId });

    // Create JWT
    const jwt = await signJWT({
      userId: result.userId,
      name: result.name,
      email: result.email,
      role: result.role,
      organizationId: result.organizationId,
      department: result.department,
      position: result.position,
      employeeType: result.employeeType,
      avatar: result.avatarUrl,
    });

    // Set cookies
    const cookieStore = await cookies();
    cookieStore.set("hr-auth-token", jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });
    cookieStore.set("hr-session-token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    log.user('Face Login successful', { userId: result.userId, email });

    // Return simple success response
    return NextResponse.json({ success: true });
  } catch (error: any) {
    log.error('Face Login API error', error);
    return NextResponse.json(
      { error: error.message || 'Login failed' },
      { status: 500 }
    );
  }
}
