import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '@/lib/jwt';

// Opt out of static generation — uses cookies
export const revalidate = 0;

async function getUserIdFromCookie(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get('hr-auth-token')?.value;
  if (token) {
    const payload = await verifyJWT(token);
    if (payload) return payload.userId;
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    let userId = await getUserIdFromCookie(req);
    if (!userId) {
      userId = req.nextUrl.searchParams.get('userId');
    }
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // TOTP is not implemented in this project, return disabled by default
    return NextResponse.json({
      totpEnabled: false,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error('TOTP status error:', error);
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
  }
}
