/**
 * Shared Gemini access for Next.js API routes.
 *
 * Gemini is the primary provider everywhere (annual subscription); Groq and
 * OpenRouter stay as fallbacks so features keep working when the Gemini key
 * is missing or the API errors out. The model follows the same GEMINI_MODEL
 * env override as the main chat and the AI Site Editor.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import { logger } from '@/lib/logger';

export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

export function hasGemini(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

let geminiProvider: ReturnType<typeof createGoogleGenerativeAI> | null = null;
function getGemini(): ReturnType<typeof createGoogleGenerativeAI> {
  if (!geminiProvider) {
    geminiProvider = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
  }
  return geminiProvider;
}

export interface GenerateArgs {
  /** Optional system instruction. */
  system?: string;
  /** User prompt. */
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Non-streaming completion: Gemini first, Groq fallback. Throws when neither
 * provider is configured or both fail.
 */
export async function generateWithFallback(args: GenerateArgs): Promise<string> {
  const failures: string[] = [];

  if (hasGemini()) {
    try {
      const { text } = await generateText({
        model: getGemini()(GEMINI_MODEL),
        system: args.system,
        prompt: args.prompt,
        temperature: args.temperature ?? 0.7,
        maxOutputTokens: args.maxTokens ?? 3000,
      });
      return text;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`Gemini → ${message}`);
      logger.log(`⚠️ Gemini failed, trying Groq… (${message})`);
    }
  } else {
    failures.push('Gemini → no GOOGLE_GENERATIVE_AI_API_KEY');
  }

  if (process.env.GROQ_API_KEY) {
    try {
      const { text } = await generateText({
        model: groq('llama-3.3-70b-versatile'),
        system: args.system,
        prompt: args.prompt,
        temperature: args.temperature ?? 0.7,
        maxOutputTokens: args.maxTokens ?? 3000,
      });
      return text;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`Groq → ${message}`);
    }
  } else {
    failures.push('Groq → no GROQ_API_KEY');
  }

  throw new Error(`All AI providers failed. ${failures.join(' | ')}`);
}
