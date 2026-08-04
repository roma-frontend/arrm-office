import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/calendar-sync';
import { validateRestrictedOrgFromRequest } from '@/lib/restricted-org';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const validation = await validateRestrictedOrgFromRequest(request);

  if (!validation.allowed) {
    return NextResponse.json(validation.body, { status: validation.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL(`/dashboard?error=outlook_auth_failed`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL(`/dashboard?error=missing_code`, request.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code, 'outlook');

    const response = NextResponse.redirect(
      new URL('/dashboard?success=outlook_connected', request.url),
    );

    // Set HTTP-only cookies
    response.cookies.set('outlook_access_token', tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokens.expires_in || 3600,
    });

    if (tokens.refresh_token) {
      response.cookies.set('outlook_refresh_token', tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return response;
  } catch (error) {
    logger.error('Outlook OAuth callback error:', error);
    return NextResponse.redirect(new URL(`/dashboard?error=token_exchange_failed`, request.url));
  }
}
