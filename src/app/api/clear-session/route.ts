import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const redirectTo = searchParams.get('redirect') || '/';

    const response = NextResponse.redirect(new URL(redirectTo, req.url));

    response.cookies.delete('hr-auth-token');
    response.cookies.delete('oauth-session');
    response.cookies.delete('hr-session-token');
    response.cookies.delete('next-auth.session-token');
    response.cookies.delete('authjs.callback-url');
    response.cookies.delete('authjs.csrf-token');

    return response;
  } catch (error) {
    console.error('Clear session error:', error);
    return NextResponse.json({ error: 'Clear session failed' }, { status: 500 });
  }
}
