import { groq } from '@ai-sdk/groq';
import OpenAI from 'openai';
import { streamText } from 'ai';
import { buildRoleBasedPrompt, detectIntent } from '@/lib/aiAssistant';
import { buildAgentPrompt, routeToAgent, getAgentSystemInstruction } from '@/lib/ai/agents';
import type { UserRole } from '@/lib/aiAssistant';
import type { AgentType } from '@/lib/ai/agents';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchAllContexts } from '@/lib/chat-context';
import { logger } from '@/lib/logger';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

/** Human-readable action label per agent for the AI Governance audit log. */
const AGENT_ACTION_LABEL: Record<AgentType, string> = {
  recruitment: 'Candidate query',
  policy: 'Policy lookup',
  analytics: 'Analytics query',
  kpi: 'KPI query',
  general: 'General Q&A',
};

/**
 * Fire-and-forget: record an AI request for the AI Governance panel. Never
 * awaited by the request path and never throws outward — telemetry must not
 * break or slow down chat. Skips silently if the org is unknown.
 */
function logAiRequest(args: {
  organizationId: string;
  userId?: string;
  userName: string;
  agent: AgentType;
  tokens: number;
  latencyMs: number;
}): void {
  if (!CONVEX_URL || !args.organizationId) return;
  void fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: 'aiGovernance:logRequest',
      args: {
        organizationId: args.organizationId,
        userId: args.userId || undefined,
        userName: args.userName || 'Unknown',
        agent: args.agent,
        action: AGENT_ACTION_LABEL[args.agent],
        status: 'allowed',
        tokens: args.tokens,
        latencyMs: args.latencyMs,
      },
    }),
  }).catch((err) => logger.log('AI governance log failed (non-fatal):', String(err)));
}

// Lazily construct the OpenRouter client. The OpenAI SDK constructor throws when
// no API key is present, so instantiating at module scope would break the
// production build's page-data collection (where the key is absent). Create it
// on first use inside the handler instead.
let openrouterClient: OpenAI | null = null;
function getOpenRouter(): OpenAI {
  if (!openrouterClient) {
    openrouterClient = new OpenAI({
      baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'HR Project',
      },
    });
  }
  return openrouterClient;
}

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
  agent: z.enum(['recruitment', 'policy', 'analytics', 'kpi', 'general']).optional(),
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
    const body: unknown = await req.json();

    // SECURITY: Validate input
    const validation = chatRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validation.error.issues },
        { status: 400 },
      );
    }

    const { messages, userId, lang, agent: manualAgent } = validation.data;

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
    // Always fetch full context so AI has real data and never hallucinates
    const needsFullContext = true;
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
    // AGENT ROUTING — Route to specialized domain agent
    // ═══════════════════════════════════════════════════════════════
    const userContext = {
      userId: userId || '',
      name: contexts.userName,
      email: contexts.userEmail,
      role: contexts.userRole as UserRole,
      organizationId: contexts.userOrgId,
      department: contexts.userDepartment,
      position: contexts.userPosition,
    };

    // Route to the best agent for this message (respect manual override, but validate against role restrictions)
    const autoAgent = routeToAgent(lastUserMessage, userContext.role);
    const selectedAgent: AgentType = manualAgent
      ? routeToAgent(manualAgent, userContext.role) === manualAgent
        ? manualAgent
        : autoAgent
      : autoAgent;
    const liveDataString = [
      contexts.userContext,
      contexts.fullContext ? `\n${contexts.fullContext}` : '',
      contexts.aiInsights ? `\n${contexts.aiInsights}` : '',
      contexts.conflictCheckData ? `\n${contexts.conflictCheckData}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // Build agent-specific prompt (focused, smaller)
    const agentPrompt = buildAgentPrompt(selectedAgent, userContext, liveDataString);
    const agentInstruction = getAgentSystemInstruction(selectedAgent);

    logger.log('Routed to agent: ' + selectedAgent);

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
    // Use agent-specific prompt for specialized agents, full prompt for general
    // buildRoleBasedPrompt is ONLY called inside the else branch (lazy)
    const systemPrompt =
      selectedAgent !== 'general'
        ? `${agentPrompt}${agentInstruction}

LIVE DATA:
${liveDataString}
${navigationHint}

${langInstruction}

FORMAT RULES:
- Use markdown tables for lists
- Use emojis for readability
- Be concise but complete
- Answer in user's language
- CRITICAL: NEVER invent, fabricate, or hallucinate data. ONLY use information from LIVE DATA section above.
- <NAVIGATE>/path only for explicit page requests
- <ACTION>{"type":"BOOK_LEAVE",...} for leave booking (ask dates first if missing)
`
        : `${buildRoleBasedPrompt(userContext, {
            userContext: contexts.userContext,
            fullContext: contexts.fullContext,
            aiInsights: contexts.aiInsights,
            conflictCheckData: contexts.conflictCheckData,
            availableDriversInfo: contexts.availableDriversInfo,
            dateContext,
          })}

LIVE DATA:
${contexts.userContext}
${contexts.fullContext ? '\n' + contexts.fullContext : ''}
${contexts.aiInsights ? '\n' + contexts.aiInsights : ''}
${contexts.conflictCheckData ? '\n' + contexts.conflictCheckData : ''}
${navigationHint}

${langInstruction}

FORMAT RULES:
- Use markdown tables for lists
- Use emojis for readability
- Be concise but complete
- Answer in user's language
- CRITICAL: NEVER invent, fabricate, or hallucinate data. ONLY use information from LIVE DATA section above. If the LIVE DATA does not contain the answer, respond: "I don't have this data right now. Please check [relevant page]." Do NOT generate fake names, numbers, dates, or statistics.
- If LIVE DATA shows "No data" or is empty for a section, tell the user that information is not available.
- <NAVIGATE>/path only for explicit page requests
- <ACTION>{"type":"BOOK_LEAVE",...} for leave booking (ask dates first if missing)
`;

    logger.log(`📐 Prompt size: ${systemPrompt.length} chars (agent: ${selectedAgent})`);

    try {
      logger.log('🚀 Using Groq (primary)...');
      const result = await streamText({
        model: groq('llama-3.1-8b-instant'),
        maxRetries: 0,
        system: systemPrompt,
        messages,
      });

      logger.log(`✅ Groq response streamed in ${Date.now() - startTime}ms`);
      logAiRequest({
        organizationId: authOrgId,
        userId: userId || auth.userId,
        userName: contexts.userName,
        agent: selectedAgent,
        // Rough token estimate (~4 chars/token) until provider usage is wired.
        tokens: Math.round((systemPrompt.length + JSON.stringify(messages).length) / 4),
        latencyMs: Date.now() - startTime,
      });
      return result.toTextStreamResponse();
    } catch (groqError) {
      const groqErrorMessage = groqError instanceof Error ? groqError.message : 'Groq failed';
      logger.log('⚠️ Groq failed, trying OpenRouter...', groqErrorMessage);

      try {
        const stream = await getOpenRouter().chat.completions.create({
          model: 'meta-llama/llama-3.3-70b-instruct:free',
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
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
        logAiRequest({
          organizationId: authOrgId,
          userId: userId || auth.userId,
          userName: contexts.userName,
          agent: selectedAgent,
          tokens: Math.round((systemPrompt.length + JSON.stringify(messages).length) / 4),
          latencyMs: Date.now() - startTime,
        });
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
