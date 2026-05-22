import { NextRequest, NextResponse } from 'next/server';
import { signOut } from '@/app/api/auth/[...nextauth]/route';

/**
 * Refresh Session API Route - Extend session by another 7 days
 * Called when user clicks "Extend Session" in the idle timeout modal
 */
export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('hr-auth-token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'No active session' }, { status: 401 });
    }

    // Set new cookies with 7-day expiry
    const sevenDays = 7 * 24 * 60 * 60;
    const response = NextResponse.json({ success: true });

    response.cookies.set('hr-auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: sevenDays,
      path: '/',
    });

    const sessionToken = req.cookies.get('hr-session-token')?.value;
    if (sessionToken) {
      response.cookies.set('hr-session-token', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: sevenDays,
        path: '/',
      });
    }

    // Set session expiry cookie for DashboardBanners countdown
    const expiryTime = Date.now() + sevenDays * 1000;
    response.cookies.set('session_expiry', expiryTime.toString(), {
      maxAge: sevenDays,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Session refresh error:', error);
    return NextResponse.json({ error: 'Failed to refresh session' }, { status: 500 });
  }
}
