import { NextRequest, NextResponse } from 'next/server';
import { validateRestrictedOrgFromRequest } from '@/lib/restricted-org';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const validation = await validateRestrictedOrgFromRequest(request);

  if (!validation.allowed) {
    return NextResponse.json(validation.body, { status: validation.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'No authorization code' }, { status: 400 });
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/outlook/auth`;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Microsoft OAuth not configured' }, { status: 500 });
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      },
    );

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      logger.error('Token exchange failed:', error);
      throw new Error('Failed to exchange code for token');
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
    };

    // Redirect back with success
    const response = NextResponse.redirect(
      new URL('/dashboard?outlook_calendar=connected', request.url),
    );

    // Set HTTP-only cookie with access token
    response.cookies.set('outlook_access_token', tokenData.access_token ?? '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600, // 1 hour
    });

    // Set HTTP-only cookie with refresh token
    if (tokenData.refresh_token) {
      response.cookies.set('outlook_refresh_token', tokenData.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });
    }

    return response;
  } catch (error) {
    logger.error('Microsoft OAuth error:', error);
    return NextResponse.redirect(new URL('/dashboard?error=outlook_auth_failed', request.url));
  }
}
