import { NextRequest, NextResponse } from 'next/server';

export async function POST(_req: NextRequest) {
  return NextResponse.json({ error: 'TOTP is not implemented in this project' }, { status: 501 });
}
