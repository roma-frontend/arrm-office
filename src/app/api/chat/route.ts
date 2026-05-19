import { groq } from '@ai-sdk/groq';
import OpenAI from 'openai';
import { streamText } from 'ai';
import { buildRoleBasedPrompt, detectIntent } from '@/lib/aiAssistant';
import type { UserRole } from '@/lib/aiAssistant';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchAllContexts } from '@/lib/chat-context';
import { logger } from '@/lib/logger';

const openrouter = new OpenAI({
  baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    'X-Title': 'HR Project',
  },
});

// SECURITY: Input validation schema for chat requests
const chatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
    }),
  ),
  userId: z.string().optional(),
  lang: z.enum(['en', 'ru', 'hy']).optional(),
});

export const POST = withCsrfProtection(async (req: NextRequest) => {
  const startTime = Date.now();

  // SECURITY: Require authentication for AI chat (costly API)
  const auth = await verifyChatAuth();
  if (!auth) {
    return NextResponse.json(
      { error: 'Unauthorized. Please log in to use AI chat.' },
      { status: 401 },
    );
  }
  const authOrgId = auth.organizationId || '';

  try {
    const body = await req.json();

    // SECURITY: Validate input
    const validation = chatRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validation.error.issues },
        { status: 400 },
      );
    }

    const { messages, userId, lang } = validation.data;

    const langInstruction =
      lang === 'ru'
        ? 'ЯЗЫК: Пользователь пишет на русском. Отвечай ТОЛЬКО на русском языке.'
        : lang === 'hy'
          ? 'ԼԵԶՈՒ: Օգտացախան գրում է հայերենով.'
          : 'LANGUAGE: The user is writing in English. Reply ONLY in English.';

    const now = new Date();
    const dateContext = `CURRENT DATE & TIME: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;

    const lastUserMessage = messages.filter((m) => m.role === 'user').pop()?.content || '';

    // Detect intent EARLY to fetch only relevant context
    const userRoleFromAuth = (auth.role as UserRole) || 'employee';
    const detectedIntent = detectIntent(lastUserMessage, userRoleFromAuth);

    // Determine what data we need based on intent
    const needsFullContext = !detectedIntent || !!detectedIntent.action;
    const needsConflictCheck =
      /хочу отпуск|book leave|request vacation|отпуск с \d|sick leave|больничный|заказать водителя|book driver|водитель/i.test(
        lastUserMessage,
      );
    const needsInsights = /отпуск|leave|vacation|баланс|balance|посещаемость|attendance/i.test(
      lastUserMessage,
    );

    // ═══════════════════════════════════════════════════════════════
    // PARALLEL FETCH — All context data fetched simultaneously
    // ═══════════════════════════════════════════════════════════════
    const origin = req.headers.get('origin') || '';
    const cookieHeader = req.headers.get('cookie') || '';

    const contexts = await fetchAllContexts({
      origin,
      cookieHeader,
      userId,
      authOrgId,
      lastUserMessage,
      needsInsights,
      needsFullContext,
      needsConflictCheck,
    });

    const fetchTime = Date.now() - startTime;
    logger.log(`⚡ Context fetch completed in ${fetchTime}ms`);

    // ═══════════════════════════════════════════════════════════════
    // BUILD PROMPT — Compact and focused
    // ═══════════════════════════════════════════════════════════════
    const roleBasedSystemPrompt = buildRoleBasedPrompt(
      {
        userId: userId || '',
        name: contexts.userName,
        email: contexts.userEmail,
        role: contexts.userRole as UserRole,
        organizationId: contexts.userOrgId,
        department: contexts.userDepartment,
        position: contexts.userPosition,
      },
      {
        userContext: contexts.userContext,
        fullContext: contexts.fullContext,
        aiInsights: contexts.aiInsights,
        conflictCheckData: contexts.conflictCheckData,
        availableDriversInfo: contexts.availableDriversInfo,
        dateContext,
      },
    );

    // Navigation hint
    let navigationHint = '';
    const explicitNavigationKeywords = [
      'открой',
      'откройте',
      'покажи страницу',
      'покажи мне страницу',
      'перейди',
      'перейдите',
      'go to',
      'open',
      'show page',
      'navigate to',
    ];
    const hasExplicitNavigation = explicitNavigationKeywords.some((keyword) =>
      lastUserMessage.toLowerCase().includes(keyword),
    );

    if (detectedIntent?.action && hasExplicitNavigation) {
      navigationHint = `\n\nNAVIGATION: <NAVIGATE>${detectedIntent.action}</NAVIGATE>`;
    } else if (detectedIntent?.action && !hasExplicitNavigation) {
      navigationHint = `\n\nACTION REQUEST (do NOT navigate): Help with "${detectedIntent.name}" using <ACTION> tags if needed.`;
    }

    // ═══════════════════════════════════════════════════════════════
    // GROQ PRIMARY — Fast inference
    // ═══════════════════════════════════════════════════════════════
    const corePrompt = `${roleBasedSystemPrompt}

LIVE DATA:
${contexts.userContext}
${contexts.fullContext ? '\n' + contexts.fullContext : ''}
${contexts.aiInsights ? '\n' + contexts.aiInsights : ''}
${contexts.conflictCheckData ? '\n' + contexts.conflictCheckData : ''}
${navigationHint}

${langInstruction}

FORMAT RULES:
- Use markdown tables for lists
- Use emojis: 👤📅⏰📊🎯🎫📝🚗✅⏳❌
- Be concise but complete
- Answer in user's language
- NEVER invent, fabricate, or hallucinate data. Only use information from LIVE DATA above. If data is not available, say "I don't have this information" and suggest where to find it.
- <NAVIGATE>/path only for explicit page requests
- <ACTION>{"type":"BOOK_LEAVE",...} for leave booking (ask dates first if missing)
`;

    try {
      logger.log('🚀 Using Groq (primary)...');
      const result = await streamText({
        model: groq('llama-3.1-8b-instant'),
        maxRetries: 0,
        system: corePrompt,
        messages,
      });

      logger.log(`✅ Groq response streamed in ${Date.now() - startTime}ms`);
      return result.toTextStreamResponse();
    } catch (groqError) {
      const groqErrorMessage = groqError instanceof Error ? groqError.message : 'Groq failed';
      logger.log('⚠️ Groq failed, trying OpenRouter...', groqErrorMessage);

      try {
        const stream = await openrouter.chat.completions.create({
          model: 'meta-llama/llama-3.3-70b-instruct:free',
          messages: [{ role: 'system', content: corePrompt }, ...messages],
          stream: true,
        });

        const readableStream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            for await (const chunk of stream) {
              const content = chunk.choices[0]?.delta?.content;
              if (content) {
                controller.enqueue(encoder.encode(content));
              }
            }
            controller.close();
          },
        });

        logger.log(`✅ OpenRouter response streamed in ${Date.now() - startTime}ms`);
        return new Response(readableStream, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      } catch (openrouterError) {
        const openrouterErrorMessage =
          openrouterError instanceof Error ? openrouterError.message : 'OpenRouter failed';
        console.error('❌ Both providers failed:', openrouterErrorMessage);
        throw groqError;
      }
    }
  } catch (error) {
    console.error('❌ Chat API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
});

/**
 * Verify JWT auth token for chat API.
 */
async function verifyChatAuth(): Promise<{
  userId: string;
  role: string;
  organizationId?: string;
} | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('hr-auth-token') || cookieStore.get('oauth-session');
    if (!token) return null;

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return null;

    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token.value, secret);
    return {
      userId: payload.sub as string,
      role: (payload.role as string) || 'employee',
      organizationId: payload.organizationId as string | undefined,
    };
  } catch {
    return null;
  }
}
