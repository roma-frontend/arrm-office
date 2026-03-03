import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { signJWT } from '@/lib/jwt';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (!CONVEX_URL) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Generate session token
    const sessionToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sessionExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    // Call Convex mutation (password is plaintext, as before)
    const res = await fetch(`${CONVEX_URL}/api/mutation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'auth:login',
        args: {
          email,
          password, // Send plaintext password (as it was working before)
          sessionToken,
          sessionExpiry,
          isFaceLogin: false,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();

    if (data.status === 'error') {
      return NextResponse.json(
        { error: data.errorMessage || 'Login failed' },
        { status: 401 }
      );
    }

    const result = data.value;

    // Create JWT
    const jwt = await signJWT({
      userId: result.userId,
      name: result.name,
      email: result.email,
      role: result.role,
      department: result.department,
      position: result.position,
      employeeType: result.employeeType,
      avatar: result.avatarUrl,
    });

    // Set cookies
    const cookieStore = await cookies();
    cookieStore.set('hr-auth-token', jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });
    cookieStore.set('hr-session-token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    // Return session data
    return NextResponse.json({
      success: true,
      session: {
        userId: result.userId,
        name: result.name,
        email: result.email,
        role: result.role,
        department: result.department,
        position: result.position,
        employeeType: result.employeeType,
        avatar: result.avatarUrl,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
