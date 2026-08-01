import { action } from './_generated/server';
import { v } from 'convex/values';

/** Minimal shape of an OpenRouter chat-completion response. */
interface AiChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

// ── AI-Powered Vacancy Description Generator ───────────────────────────────

export const generateVacancyDescription = action({
  args: {
    title: v.string(),
    department: v.optional(v.string()),
    location: v.optional(v.string()),
    employmentType: v.optional(
      v.union(
        v.literal('full_time'),
        v.literal('part_time'),
        v.literal('contract'),
        v.literal('internship'),
      ),
    ),
    language: v.optional(
      v.union(v.literal('en'), v.literal('ru'), v.literal('hy'), v.literal('de')),
    ),
  },
  handler: async (_, args) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured');

    const lang = args.language || 'en';
    const langInstruction =
      lang === 'en'
        ? ''
        : ` Write ALL content in ${
            lang === 'ru' ? 'Russian' : lang === 'hy' ? 'Armenian' : 'German'
          } language.`;

    const typeLabel =
      {
        full_time: 'Full-time',
        part_time: 'Part-time',
        contract: 'Contract',
        internship: 'Internship',
      }[args.employmentType || 'full_time'] || 'Full-time';

    const prompt = `Generate a professional job posting in JSON format.${langInstruction}

Job Details:
- Title: ${args.title}
${args.department ? `- Department: ${args.department}` : ''}
${args.location ? `- Location: ${args.location}` : ''}
- Type: ${typeLabel}

Return ONLY valid JSON with this exact structure:
{
  "description": "A comprehensive job description (3-5 paragraphs) covering: company overview, role summary, key responsibilities, what we offer. Professional tone, 200-400 words.",
  "requirements": "Bulleted list of requirements and qualifications. Include: required experience, skills, education, and nice-to-haves. 5-10 bullet points."
}

Keep content professional, specific, and actionable. Do NOT use placeholder text. Make it sound like a real job posting at a modern company.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'Strata HR',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.3-70b-instruct',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert HR professional and job posting writer. Return only valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as AiChatResponse;
    const content = data.choices?.[0]?.message?.content || '';

    // Extract JSON from response (handles cases where LLM wraps in markdown)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Failed to parse AI response as JSON');

    const parsed = JSON.parse(jsonMatch[0]) as { description?: string; requirements?: string };

    return {
      description: parsed.description || '',
      requirements: parsed.requirements || '',
    };
  },
});
