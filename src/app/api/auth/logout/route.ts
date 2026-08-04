import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * Logout API Route - Complete session termination
 * Accepts both POST and GET. GET redirects to the specified URL or /.
 */
export async function POST(req: NextRequest) {
  return handleLogout(req);
}

export async function GET(req: NextRequest) {
  return handleLogout(req);
}

async function handleLogout(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const redirectTo = searchParams.get('redirect') || '/';

    const response = NextResponse.redirect(new URL(redirectTo, req.url));

    response.cookies.delete('hr-auth-token');
    response.cookies.delete('oauth-session');
    response.cookies.delete('hr-session-token');

    return response;
  } catch (error) {
    logger.error('Logout error:', error);
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
}
