import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { signJWT } from '@/lib/jwt';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, name, email, role, department, position, employeeType, avatar } = body;

    if (!userId || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create JWT token
    const jwt = await signJWT({
      userId,
      name,
      email,
      role,
      department,
      position,
      employeeType,
      avatar,
    });

    // Create session token
    const sessionToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error creating session:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}
