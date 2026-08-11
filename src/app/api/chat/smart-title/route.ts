import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { verifyChatAuth } from '@/lib/chat-auth';
import { generateWithFallback } from '@/lib/ai/gemini';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
  lang: z.enum(['en', 'ru', 'hy']).optional(),
});

/** Deterministic fallback title: first 50 chars of the message. */
function fallbackTitle(message: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 50);
}

/**
 * Generate a short, smart conversation title from the first user message
 * (like modern AI assistants). Falls back to simple truncation when no AI
 * provider is available.
 */
export const POST = withCsrfProtection(async (req: NextRequest) => {
  const auth = await verifyChatAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const validation = bodySchema.safeParse(await req.json());
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { message, lang } = validation.data;

    const langLine =
      lang === 'ru'
        ? 'Title MUST be in Russian.'
        : lang === 'hy'
          ? 'Title MUST be in Armenian.'
          : 'Title MUST be in English.';

    try {
      const text = await generateWithFallback({
        system: `You generate very short chat conversation titles (2-5 words, no quotes, no trailing punctuation, no emojis). ${langLine}`,
        prompt: message,
        temperature: 0.5,
        maxTokens: 500,
      });
      const title = text.replace(/["'.]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
      return NextResponse.json({ title: title || fallbackTitle(message) });
    } catch (llmError) {
      logger.log('Smart title LLM failed, using fallback:', String(llmError));
      return NextResponse.json({ title: fallbackTitle(message) });
    }
  } catch (error) {
    logger.error('Smart title error:', error);
    return NextResponse.json({ error: 'Failed to generate title' }, { status: 500 });
  }
});
