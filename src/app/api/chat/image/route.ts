import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { verifyChatAuth } from '@/lib/chat-auth';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  prompt: z.string().min(1).max(500),
});

/**
 * Image generation for the AI assistant (<IMAGE> tag). Uses Pollinations.ai —
 * free, no key needed. Returns a URL the client renders inline.
 */
export const POST = withCsrfProtection(async (req: NextRequest) => {
  const auth = await verifyChatAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const validation = bodySchema.safeParse(await req.json());
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Prompt must be a string between 1 and 500 characters' },
        { status: 400 },
      );
    }
    const { prompt } = validation.data;

    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`;

    return NextResponse.json({ imageUrl, prompt });
  } catch (error) {
    logger.error('Image generation error:', error);
    return NextResponse.json({ error: 'Failed to generate image' }, { status: 500 });
  }
});
