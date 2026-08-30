import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { signJWT, verifyJWT, type JWTPayload } from '@/lib/jwt';
import { cookies } from 'next/headers';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { resolveConvexUserIdByEmail } from '@/lib/convex-server-query';
import { logger } from '@/lib/logger';

export const POST = withCsrfProtection(async (request: NextRequest) => {
  try {
    const { userId, name, email } = (await request.json()) as {
      userId?: string;
      name?: string;
      email?: string;
    };

    if (!userId || !name || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const cookieStore = await cookies();
    let jwt = cookieStore.get('hr-auth-token')?.value;

    if (!jwt) {
      const session = await auth();

      if (!session?.user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }

      // SECURITY/CORRECTNESS: `session.user.id` is the provider subject (a
      // UUID / Google sub), NOT a Convex user id. Minting a JWT with it would
      // poison the `hr-auth-token` cookie and break every Convex call that
      // takes `Id<'users'>`. Resolve the Convex `_id` from the verified email.
      const sessionEmail = session.user.email || email;
      const convexUserId = await resolveConvexUserIdByEmail(sessionEmail);
      if (!convexUserId) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }

      jwt = await signJWT(
        {
          userId: convexUserId,
          name: session.user.name || name,
          email: sessionEmail,
          role: (session.user.role as JWTPayload['role']) || 'employee',
          department: session.user.department,
          position: session.user.position,
          employeeType: session.user.employeeType as JWTPayload['employeeType'],
          avatar: session.user.avatar,
        },
        '7d',
        request,
      );
    }

    if (!jwt) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const payload = await verifyJWT(jwt);

    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const newJwt = await signJWT(
      {
        userId: payload.userId,
        name,
        email,
        role: payload.role,
        department: payload.department,
        position: payload.position,
        employeeType: payload.employeeType,
        avatar: payload.avatar,
      },
      '7d',
      request,
    );

    const response = NextResponse.json({ success: true });

    response.cookies.set('hr-auth-token', newJwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    logger.error('[/api/profile/update] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
