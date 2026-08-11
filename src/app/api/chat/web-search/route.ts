import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { verifyChatAuth } from '@/lib/chat-auth';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  query: z.string().min(1).max(200),
});

/**
 * Web search for the AI assistant (<WEB_SEARCH> tag). Uses the DuckDuckGo
 * Instant Answer API — free, no key needed.
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
        { error: 'Query must be a string between 1 and 200 characters' },
        { status: 400 },
      );
    }
    const { query } = validation.data;

    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
    );

    if (!response.ok) {
      throw new Error(`DuckDuckGo API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      Abstract?: string;
      AbstractURL?: string;
      AbstractSource?: string;
      Heading?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
    };

    const results: Array<{ title: string; snippet: string; url: string; source: string }> = [];

    if (data.Abstract) {
      results.push({
        title: data.Heading || query,
        snippet: data.Abstract,
        url: data.AbstractURL || '',
        source: data.AbstractSource || 'DuckDuckGo',
      });
    }

    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics.slice(0, 5)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 60),
            snippet: topic.Text,
            url: topic.FirstURL,
            source: 'DuckDuckGo',
          });
        }
      }
    }

    return NextResponse.json({ results, query });
  } catch (error) {
    logger.error('Web search error:', error);
    return NextResponse.json(
      { error: 'Failed to perform web search', results: [] },
      { status: 500 },
    );
  }
});
