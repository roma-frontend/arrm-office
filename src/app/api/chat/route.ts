import { groq } from '@ai-sdk/groq';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import OpenAI from 'openai';
import { streamText } from 'ai';
import { buildRoleBasedPrompt, detectIntent } from '@/lib/aiAssistant';
import { buildAgentPrompt, routeToAgent, getAgentSystemInstruction } from '@/lib/ai/agents';
import type { UserRole } from '@/lib/aiAssistant';
import type { AgentType } from '@/lib/ai/agents';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchAllContexts } from '@/lib/chat-context';
import { logger } from '@/lib/logger';
import { verifyChatAuth } from '@/lib/chat-auth';
import { retrieveDocs, formatKnowledgeSection, sourceLabels } from '@/lib/ai/rag';
import { buildPromptExtensions } from '@/lib/ai/promptExtensions';
import {
  ANSWER_DEPTH_RULES,
  ANSWER_INTEGRITY_RULES,
  streamFailureNotice,
} from '@/lib/ai/answerFormat';
import { extractMemoryFacts } from '@/lib/ai/memory';
import { fetchQuery, fetchMutation } from 'convex/nextjs';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

// ═══════════════════════════════════════════════════════════════
// PROVIDERS
//
// Gemini is primary. The assistant's system prompt is inherently large — role
// block, platform knowledge, live HR data, retrieved docs — and Groq's
// on-demand tier caps `llama-3.1-8b-instant` at 6000 tokens per minute, which a
// normal request exceeded outright ("Request too large … Requested 8697").
// Gemini's flash models take a far larger request, so the prompt no longer has
// to be shrunk to fit the transport. Groq stays as a fast fallback for when
// Gemini is unavailable, and OpenRouter behind it.
// ═══════════════════════════════════════════════════════════════

/** Lazily built so a missing key never breaks the production build. */
let geminiProvider: ReturnType<typeof createGoogleGenerativeAI> | null = null;
function getGemini(): ReturnType<typeof createGoogleGenerativeAI> {
  if (!geminiProvider) {
    geminiProvider = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
  }
  return geminiProvider;
}

/** Same env override the AI Site Editor uses, so both stay on one model. */
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const HAS_GEMINI = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

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

/**
 * Fire-and-forget: persist `<REMEMBER>` facts harvested from the completed
 * reply into the user's long-term memory. Never breaks the stream.
 */
function harvestMemories(userId: string, fullText: string): void {
  const facts = extractMemoryFacts(fullText);
  if (!facts.length) return;
  fetchMutation(api.aiMemory.addMemories, {
    userId: userId as Id<'users'>,
    facts,
  }).catch((err) => logger.log('AI memory harvest failed (non-fatal):', String(err)));
}

/**
 * Pull the first non-empty chunk out of a provider stream.
 *
 * `streamText()` in ai v6 resolves before the provider is actually called, so a
 * rate limit, an oversized context or a rejected message only throws once the
 * stream is consumed — which used to happen *after* the Response was returned.
 * That made the OpenRouter fallback unreachable and turned every provider
 * failure into a silent, empty 200. Draining the first token here moves those
 * failures back inside the try/catch, at the cost of waiting for time-to-first
 * -token, which the client waits for anyway.
 *
 * Returns null when the provider completed without emitting anything.
 */
async function openStream(source: AsyncIterable<string>): Promise<AsyncIterable<string> | null> {
  const iterator = source[Symbol.asyncIterator]();
  let first = '';
  for (;;) {
    const step = await iterator.next();
    if (step.done) return null;
    if (step.value) {
      first = step.value;
      break;
    }
  }
  return {
    async *[Symbol.asyncIterator]() {
      yield first;
      for (;;) {
        const step = await iterator.next();
        if (step.done) return;
        if (step.value) yield step.value;
      }
    },
  };
}

/**
 * Wrap a token stream: prepend the RAG `<SOURCES>` tag (if any), pass every
 * chunk through, and harvest long-term-memory facts once the stream ends.
 *
 * A mid-flight provider failure cannot be reported as an HTTP error — the status
 * and headers are long gone — so it is written into the stream as a visible
 * notice. Previously the `finally { controller.close() }` closed the stream
 * *successfully* on error, so the client saw a well-formed empty response and
 * rendered a blank bubble with no way to tell that anything had failed.
 */
function wrapAssistantStream(
  chunks: AsyncIterable<string>,
  opts: { userId: string; sources: string[]; lang?: string },
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let fullText = '';
  return new ReadableStream({
    async start(controller) {
      if (opts.sources.length) {
        controller.enqueue(encoder.encode(`<SOURCES>${opts.sources.join('|')}</SOURCES>\n`));
      }
      try {
        for await (const chunk of chunks) {
          fullText += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        logger.error('❌ Assistant stream failed mid-flight:', err);
        controller.enqueue(
          encoder.encode(streamFailureNotice(opts.lang, fullText.trim().length > 0)),
        );
      } finally {
        controller.close();
        harvestMemories(opts.userId, fullText);
      }
    },
  });
}

/** Turns to keep, newest-first, before the char budget is applied. */
const MAX_HISTORY_TURNS = 16;
/** Character budget for the conversation history sent to the model. */
const MAX_HISTORY_CHARS = 24_000;

/** Low but non-zero: long structured answers without repetitive boilerplate. */
const ANSWER_TEMPERATURE = 0.4;
/** Room for a detailed answer with tables (~1000+ words). */
const ANSWER_MAX_TOKENS = 2000;

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

/**
 * Start an AI-SDK provider and return a stream that has already produced its
 * first token, or throw with the real reason.
 *
 * `streamText` reports provider failures through `onError` and then simply ends
 * the text stream. Without capturing that, an over-limit request is
 * indistinguishable from a model that chose to say nothing — which is exactly
 * how a hard "Request too large … Limit 6000, Requested 8697" arrived at the UI
 * as an empty bubble.
 */
async function streamFromAiSdk(opts: {
  label: string;
  model: Parameters<typeof streamText>[0]['model'];
  system: string;
  messages: ChatMessage[];
  tokenEstimate: number;
}): Promise<AsyncIterable<string>> {
  let providerError: unknown = null;
  const result = streamText({
    model: opts.model,
    maxRetries: 1,
    temperature: ANSWER_TEMPERATURE,
    maxOutputTokens: ANSWER_MAX_TOKENS,
    system: opts.system,
    messages: opts.messages,
    onError: ({ error }) => {
      providerError = error;
      logger.error(`❌ ${opts.label} stream error:`, error);
    },
  });

  const primed = await openStream(result.textStream);
  if (primed) return primed;

  const reason =
    providerError instanceof Error
      ? providerError.message
      : providerError
        ? String(providerError)
        : `no tokens returned (request ≈ ${opts.tokenEstimate} tokens — likely over the provider's per-request or per-minute limit)`;
  throw new Error(`empty completion: ${reason}`);
}

/**
 * Trim the conversation before it reaches the model.
 *
 * Two separate failures made this necessary:
 *  - Empty assistant turns (the blank bubbles this endpoint used to produce)
 *    were sent straight back in the history, and OpenAI-compatible providers
 *    reject `assistant` messages with empty content — so one blank answer made
 *    every following turn blank too.
 *  - Nothing capped the history, while the system prompt alone is thousands of
 *    tokens, so long threads eventually exceeded the context/TPM limit. The
 *    "elaborate"/"continue" quick actions are pressed late in long threads,
 *    which is exactly when that happened.
 *
 * The newest turns are kept, and the final user message is never dropped.
 */
function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  const nonEmpty = messages.filter((m) => m.content.trim().length > 0);
  const windowed = nonEmpty.slice(-MAX_HISTORY_TURNS);

  let budget = MAX_HISTORY_CHARS;
  const kept: ChatMessage[] = [];
  for (let i = windowed.length - 1; i >= 0; i--) {
    const message = windowed[i];
    if (!message) continue;
    // Always keep the newest turn even if it alone blows the budget.
    if (kept.length > 0 && message.content.length > budget) break;
    budget -= message.content.length;
    kept.unshift(message);
  }
  return kept;
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
          ? 'ԼԵԶՈՒ: Օգտատերը գրում է հայերենով.'
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
    // MEMORY + RAG — long-term memory & role-scoped knowledge base
    // ═══════════════════════════════════════════════════════════════
    const chatUserId = userId || auth.userId;
    let memories: string[] = [];
    try {
      const rows = await fetchQuery(api.aiMemory.listMemories, {
        userId: chatUserId as Id<'users'>,
      });
      memories = rows.map((m) => m.content);
    } catch (err) {
      logger.log('AI memory fetch failed (non-fatal):', String(err));
    }

    const ragHits = retrieveDocs(lastUserMessage, userRoleFromAuth);
    const knowledgeSection = formatKnowledgeSection(ragHits);
    const sources = sourceLabels(ragHits);

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

    // Shared extensions: memory, knowledge base, NAVIGATE allow-list, SUGGEST,
    // REMEMBER, IMAGE, WEB_SEARCH, ARTIFACT instructions.
    const extensions = buildPromptExtensions({
      role: userContext.role,
      memories,
      knowledge: knowledgeSection,
    });

    // ═══════════════════════════════════════════════════════════════
    // SYSTEM PROMPT
    // ═══════════════════════════════════════════════════════════════
    // Use agent-specific prompt for specialized agents, full prompt for general
    // buildRoleBasedPrompt is ONLY called inside the else branch (lazy).
    //
    // The general branch deliberately does NOT re-append the live data: it is
    // already inside buildRoleBasedPrompt (as "LIVE SYSTEM DATA"), and emitting
    // it twice doubled the largest, most variable part of the prompt for no
    // benefit — which is what pushed requests over the provider's token limit.
    const systemPrompt =
      selectedAgent !== 'general'
        ? `${agentPrompt}${agentInstruction}

LIVE DATA:
${liveDataString}
${navigationHint}

${langInstruction}
${ANSWER_DEPTH_RULES}
${ANSWER_INTEGRITY_RULES}
${extensions}
`
        : `${buildRoleBasedPrompt(userContext, {
            userContext: contexts.userContext,
            fullContext: contexts.fullContext,
            aiInsights: contexts.aiInsights,
            conflictCheckData: contexts.conflictCheckData,
            availableDriversInfo: contexts.availableDriversInfo,
            dateContext,
          })}
${navigationHint}

${langInstruction}
${ANSWER_DEPTH_RULES}
${ANSWER_INTEGRITY_RULES}
${extensions}
`;

    const modelMessages = trimHistory(messages);
    if (modelMessages.length !== messages.length) {
      logger.log(`✂️ History trimmed: ${messages.length} → ${modelMessages.length} turns`);
    }
    if (modelMessages.length === 0) {
      return NextResponse.json({ error: 'No message content to answer.' }, { status: 400 });
    }

    const tokenEstimate = Math.round(
      (systemPrompt.length + JSON.stringify(modelMessages).length) / 4,
    );
    logger.log(
      `📐 Prompt ${systemPrompt.length} chars + history → ≈${tokenEstimate} tokens (agent: ${selectedAgent})`,
    );

    // ═══════════════════════════════════════════════════════════════
    // PROVIDER CHAIN — first one that actually produces a token wins
    // ═══════════════════════════════════════════════════════════════
    const attempts: { label: string; open: () => Promise<AsyncIterable<string>> }[] = [];

    if (HAS_GEMINI) {
      attempts.push({
        label: `Gemini (${GEMINI_MODEL})`,
        open: () =>
          streamFromAiSdk({
            label: `Gemini (${GEMINI_MODEL})`,
            model: getGemini()(GEMINI_MODEL),
            system: systemPrompt,
            messages: modelMessages,
            tokenEstimate,
          }),
      });
    }

    attempts.push({
      label: 'Groq (llama-3.1-8b-instant)',
      open: () =>
        streamFromAiSdk({
          label: 'Groq (llama-3.1-8b-instant)',
          model: groq('llama-3.1-8b-instant'),
          system: systemPrompt,
          messages: modelMessages,
          tokenEstimate,
        }),
    });

    if (process.env.OPENROUTER_API_KEY) {
      attempts.push({
        label: 'OpenRouter (llama-3.3-70b:free)',
        open: async () => {
          const stream = await getOpenRouter().chat.completions.create({
            model: 'meta-llama/llama-3.3-70b-instruct:free',
            messages: [{ role: 'system', content: systemPrompt }, ...modelMessages],
            stream: true,
            temperature: ANSWER_TEMPERATURE,
            max_tokens: ANSWER_MAX_TOKENS,
          });
          async function* chunks(): AsyncIterable<string> {
            for await (const chunk of stream) {
              const content = chunk.choices[0]?.delta?.content;
              if (content) yield content;
            }
          }
          const primed = await openStream(chunks());
          if (!primed) throw new Error('empty completion (no tokens returned)');
          return primed;
        },
      });
    }

    const failures: string[] = [];
    for (const attempt of attempts) {
      try {
        logger.log(`🚀 Trying ${attempt.label}…`);
        const primed = await attempt.open();
        logger.log(`✅ ${attempt.label} streamed in ${Date.now() - startTime}ms`);
        logAiRequest({
          organizationId: authOrgId,
          userId: userId || auth.userId,
          userName: contexts.userName,
          agent: selectedAgent,
          // Rough token estimate (~4 chars/token) until provider usage is wired.
          tokens: tokenEstimate,
          latencyMs: Date.now() - startTime,
        });
        return new Response(wrapAssistantStream(primed, { userId: chatUserId, sources, lang }), {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push(`${attempt.label} → ${message}`);
        logger.log(`⚠️ ${attempt.label} failed: ${message}`);
      }
    }

    // Every reason, not just the first: a missing OPENROUTER_API_KEY or an
    // unconfigured Gemini key used to be invisible behind the primary error.
    logger.error('❌ All providers failed:', failures.join(' | '));
    throw new Error(`All AI providers failed. ${failures.join(' | ')}`);
  } catch (error) {
    logger.error('❌ Chat API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
});
