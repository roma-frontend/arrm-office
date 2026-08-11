import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchMutation, fetchQuery } from 'convex/nextjs';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { verifyChatAuth } from '@/lib/chat-auth';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** List the caller's long-term AI memories. */
export async function GET() {
  const auth = await verifyChatAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const memories = await fetchQuery(api.aiMemory.listMemories, {
      userId: auth.userId as Id<'users'>,
    });
    return NextResponse.json({ memories });
  } catch (error) {
    logger.error('AI memory list error:', error);
    return NextResponse.json({ error: 'Failed to list memories' }, { status: 500 });
  }
}

const deleteSchema = z.object({
  /** Omit to clear ALL memories. */
  memoryId: z.string().optional(),
});

/** Delete one memory (by id) or clear all of them. */
export const DELETE = withCsrfProtection(async (req: NextRequest) => {
  const auth = await verifyChatAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const validation = deleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { memoryId } = validation.data;

    if (memoryId) {
      await fetchMutation(api.aiMemory.deleteMemory, {
        memoryId: memoryId as Id<'aiMemories'>,
      });
      return NextResponse.json({ success: true });
    }
    const result = await fetchMutation(api.aiMemory.clearMemories, {
      userId: auth.userId as Id<'users'>,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    logger.error('AI memory delete error:', error);
    return NextResponse.json({ error: 'Failed to delete memory' }, { status: 500 });
  }
});
