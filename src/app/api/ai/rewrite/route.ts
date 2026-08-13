/**
 * Contextual text actions — the model applied to the field you are already in.
 *
 * The alternative this replaces is the assistant page: copy your draft out, paste
 * it into a chat, describe what you want, copy the answer back. Most of that is
 * transport, not thought, and it is why in-context editing is the one AI feature
 * people actually keep using.
 *
 * Deliberately narrow: a fixed set of transformations, one field of text, no
 * conversation and no memory. A general "ask the model about this text" belongs
 * in the assistant; this endpoint exists so a task description can be shortened
 * without leaving the task.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { verifyChatAuth } from '@/lib/chat-auth';
import { generateWithFallback } from '@/lib/ai/gemini';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIONS = [
  'shorten',
  'expand',
  'improve',
  'professional',
  'friendly',
  'proofread',
  'translate',
] as const;
type Action = (typeof ACTIONS)[number];

const bodySchema = z.object({
  text: z.string().min(1).max(6000),
  action: z.enum(ACTIONS),
  /** Output language. Required for `translate`, otherwise the reply keeps the input language. */
  targetLang: z.enum(['en', 'ru', 'hy', 'de']).optional(),
  /** What the field is, e.g. "task description" — steers register and length. */
  context: z.string().max(120).optional(),
});

const LANG_NAMES: Record<string, string> = {
  en: 'English',
  ru: 'Russian',
  hy: 'Armenian',
  de: 'German',
};

/**
 * One instruction per action. Written as constraints rather than requests: the
 * failure mode of a loose prompt here is the model answering *about* the text
 * ("Sure! Here is a shorter version:") instead of returning the text, which is
 * unusable when the result is written straight back into an input.
 */
function instructionFor(action: Action, targetLang: string | undefined): string {
  switch (action) {
    case 'shorten':
      return 'Rewrite the text to be significantly shorter while keeping every fact and requirement. Remove filler, not information.';
    case 'expand':
      return 'Expand the text with the detail a reader would need to act on it. Do not invent facts, dates, names or numbers that are not present — if something is missing, leave it out rather than guessing.';
    case 'improve':
      return 'Improve clarity, flow and structure. Keep the original meaning, level of formality and language.';
    case 'professional':
      return 'Rewrite in a neutral, professional workplace register. Keep it warm rather than stiff, and keep the original meaning.';
    case 'friendly':
      return 'Rewrite in a warmer, more approachable tone without becoming casual or using slang. Keep the original meaning.';
    case 'proofread':
      return 'Fix spelling, grammar and punctuation only. Do not rephrase, reorder or change the tone.';
    case 'translate':
      return `Translate the text into ${LANG_NAMES[targetLang ?? 'en'] ?? 'English'}. Translate only — do not summarise, expand or comment.`;
  }
}

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
    const { text, action, targetLang, context } = validation.data;

    if (action === 'translate' && !targetLang) {
      return NextResponse.json({ error: 'targetLang is required for translate' }, { status: 400 });
    }

    const system = [
      'You rewrite text that will be written directly back into a form field in an HR application.',
      'Return ONLY the resulting text. No preamble, no explanation, no quotation marks around it, no markdown fences, no trailing commentary.',
      action === 'translate'
        ? ''
        : 'Reply in the same language as the input, whatever that language is.',
      context ? `The text is a ${context}.` : '',
      instructionFor(action, targetLang),
    ]
      .filter(Boolean)
      .join(' ');

    const result = await generateWithFallback({
      system,
      prompt: text,
      // Low but not zero: proofreading wants determinism, tone changes need a
      // little room to find a different phrasing.
      temperature: action === 'proofread' ? 0.1 : 0.4,
      // Expansion is the only action that legitimately grows the text; the rest
      // are bounded by roughly the input length.
      maxTokens: action === 'expand' ? 1200 : 900,
    });

    const cleaned = stripWrapper(result);
    if (!cleaned) {
      return NextResponse.json({ error: 'Empty result' }, { status: 502 });
    }

    return NextResponse.json({ text: cleaned });
  } catch (error) {
    logger.error('AI rewrite failed:', error);
    return NextResponse.json({ error: 'Failed to rewrite text' }, { status: 502 });
  }
});

/**
 * Strip the wrapping models add despite being told not to: a fenced block, or
 * quotes around the whole answer. Quotes are only removed when they enclose the
 * entire string, so a legitimately quoted sentence inside the text survives.
 */
function stripWrapper(raw: string): string {
  let text = raw.trim();

  const fence = /^```[a-z]*\n([\s\S]*?)\n?```$/i.exec(text);
  if (fence?.[1]) text = fence[1].trim();

  if (text.length > 1) {
    const first = text[0];
    const last = text[text.length - 1];
    const pairs: Record<string, string> = { '"': '"', "'": "'", '«': '»', '“': '”' };
    if (first && last && pairs[first] === last && !text.slice(1, -1).includes(last)) {
      text = text.slice(1, -1).trim();
    }
  }

  return text;
}
