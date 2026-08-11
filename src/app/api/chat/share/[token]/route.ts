import { NextRequest, NextResponse } from 'next/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@/convex/_generated/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public read-only fetch of a shared AI conversation (token = access). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || token.length > 128) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }
  try {
    const shared = await fetchQuery(api.aiChat.getSharedConversation, { token });
    if (!shared) {
      return NextResponse.json({ error: 'Shared conversation not found' }, { status: 404 });
    }
    return NextResponse.json(shared);
  } catch {
    return NextResponse.json({ error: 'Failed to load shared conversation' }, { status: 500 });
  }
}
