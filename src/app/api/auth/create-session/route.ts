import { NextRequest, NextResponse } from 'next/server';
import { signJWT } from '@/lib/jwt';
import { jwtVerify } from 'jose';

/**
 * SECURITY: Verify that the requester is already authenticated before
 * creating a new session. This prevents unauthorized session creation.
 */
async function verifyExistingAuth(req: NextRequest): Promise<boolean> {
  try {
    const token = req.cookies.get('hr-auth-token') || req.cookies.get('oauth-session');
    if (!token) return false;

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return false;

    const secret = new TextEncoder().encode(jwtSecret);
    await jwtVerify(token.value, secret);
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Require existing authentication before creating a new session
    if (!(await verifyExistingAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    const sessionToken = crypto.randomUUID();

    // Set cookies with secure settings
    const response = NextResponse.json({ success: true });
    response.cookies.set('hr-auth-token', jwt, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });
    response.cookies.set('hr-session-token', sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Error creating session:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}
