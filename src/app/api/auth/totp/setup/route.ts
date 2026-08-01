import { NextRequest, NextResponse } from 'next/server';
import { generateSecret, generateURI } from 'otplib';
import QRCode from 'qrcode';
import { verifyJWT } from '@/lib/jwt';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

async function convexMutation(path: string, args: Record<string, unknown>) {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  });
  const data = (await res.json()) as { status: string; errorMessage?: string; value?: unknown };
  if (data.status === 'error') throw new Error(data.errorMessage ?? 'Convex error');
  return data.value;
}

async function getAuthPayload(_req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('hr-auth-token')?.value;
  if (token) {
    const payload = await verifyJWT(token);
    if (payload) return payload;
  }
  // Fallback: accept userId + email from request body
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { userId?: string; email?: string };

    let payload = await getAuthPayload(req);

    // If no JWT cookie, try userId from body (for OAuth users who may not have hr-auth-token)
    if (!payload && body.userId && body.email) {
      payload = { userId: body.userId, email: body.email, name: '', role: 'employee' as const };
    }

    if (!payload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Generate TOTP secret
    const secret = generateSecret();

    // Generate QR code
    const issuer = 'Strata';
    const otpAuthUrl = generateURI({
      strategy: 'totp',
      label: payload.email,
      issuer,
      secret,
    });
    const qrCodeUrl = await QRCode.toDataURL(otpAuthUrl);

    // Save secret to DB (not yet enabled)
    await convexMutation('auth:saveTotpSecret', {
      userId: payload.userId,
      secret,
    });

    // Generate 10 backup codes
    const backupCodes: string[] = [];
    const hashedBackupCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = Math.random().toString(36).slice(2, 10).toUpperCase();
      backupCodes.push(code);
      hashedBackupCodes.push(await bcrypt.hash(code, 10));
    }

    // Save hashed backup codes
    await convexMutation('auth:saveBackupCodes', {
      userId: payload.userId,
      codes: hashedBackupCodes,
    });

    return NextResponse.json({
      qrCodeUrl,
      secret,
      backupCodes, // return plaintext codes to show user once
    });
  } catch (error: unknown) {
    console.error('TOTP setup error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Setup failed' },
      { status: 500 },
    );
  }
}
