/**
 * Superadmin translation — one-click AI translation for the operator console.
 *
 * The Translations tab of Operator Tools lets a superadmin override any i18n
 * key per locale. Writing a translation by hand for ru/de/hy is slow and most
 * keys were only ever authored in English — this endpoint fills the gap: give
 * it the English source text and a target locale, and it returns a ready-made
 * translation through Gemini (Groq fallback, same as everywhere else).
 *
 * Superadmin-only: the caller's role is verified from the session JWT — this
 * endpoint can write arbitrary text into the app.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { z } from 'zod';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { generateWithFallback } from '@/lib/ai/gemini';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCALES = ['en', 'ru', 'de', 'hy'] as const;
type Locale = (typeof LOCALES)[number];

const LANG_NAMES: Record<Locale, string> = {
  en: 'English',
  ru: 'Russian',
  hy: 'Armenian',
  de: 'German',
};

const bodySchema = z.object({
  text: z.string().min(1).max(6000),
  targetLang: z.enum(LOCALES),
});

/** Verify the caller is a superadmin from the session JWT. */
async function verifySuperadmin(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    // Credential/face login writes `hr-auth-token`, the OAuth bridge writes
    // `oauth-session` — both are JWTs signed with the same secret.
    const sessionCookie = cookieStore.get('hr-auth-token') ?? cookieStore.get('oauth-session');
    if (!sessionCookie) return false;

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return false;

    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(sessionCookie.value, secret);
    return payload.role === 'superadmin';
  } catch {
    return false;
  }
}

export const POST = withCsrfProtection(async (req: NextRequest) => {
  if (!(await verifySuperadmin())) {
    return NextResponse.json({ error: 'Superadmin only' }, { status: 403 });
  }

  try {
    const validation = bodySchema.safeParse(await req.json());
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { text, targetLang } = validation.data;

    const system = [
      'You are a professional localizer for an HR software product.',
      `Translate the text into ${LANG_NAMES[targetLang]}.`,
      'The text may contain placeholders like {{name}}, {{count}} or $t(some.key) — keep them EXACTLY as they are, do not translate or reorder them.',
      'Return ONLY the translated text. No preamble, no explanation, no quotation marks around it, no markdown fences, no trailing commentary.',
      'Match the tone of the original: short UI labels stay short and natural, longer sentences stay professional and concise.',
    ].join(' ');

    const result = await generateWithFallback({
      system,
      prompt: text,
      temperature: 0.2,
      maxTokens: 1500,
    });

    const cleaned = stripWrapper(result);
    if (!cleaned) {
      return NextResponse.json({ error: 'Empty result' }, { status: 502 });
    }

    return NextResponse.json({ text: cleaned });
  } catch (error) {
    logger.error('Superadmin translate failed:', error);
    return NextResponse.json({ error: 'Failed to translate' }, { status: 502 });
  }
});

/** Strip wrapping a model adds despite being told not to. */
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
