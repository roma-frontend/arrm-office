import { action } from './_generated/server';
import { v } from 'convex/values';

/** Minimal shape of an OpenRouter chat-completion response. */
interface AiChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/** Minimal shape of a Gemini generateContent response. */
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

// ── Provider plumbing: Gemini primary, OpenRouter fallback ──────────────────

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

/**
 * Call Gemini's generateContent REST endpoint and return the raw text.
 * `responseMimeType: application/json` asks Gemini for strict JSON output.
 */
async function callGemini(args: {
  system: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
}): Promise<string> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not configured');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: args.system }] },
        contents: [{ role: 'user', parts: [{ text: args.prompt }] }],
        generationConfig: {
          temperature: args.temperature,
          maxOutputTokens: args.maxTokens,
          responseMimeType: 'application/json',
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Gemini returned an empty completion');
  return text;
}

/** OpenRouter (llama-3.3-70b) — the legacy provider, kept as a fallback. */
async function callOpenRouter(args: {
  system: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured');

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
        { role: 'system', content: args.system },
        { role: 'user', content: args.prompt },
      ],
      temperature: args.temperature,
      max_tokens: args.maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as AiChatResponse;
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('OpenRouter returned an empty completion');
  return text;
}

/**
 * Cut the top-level JSON object out of raw model output by walking braces
 * outside of string literals. If the completion was truncated by the token
 * limit the braces never balance — return the remainder anyway so repairJson
 * can close the open structures.
 */
function extractJsonObject(content: string): string | null {
  const start = content.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return content.slice(start, i + 1);
    }
  }
  return content.slice(start);
}

/** Escape raw control characters inside string literals (newlines, tabs…). */
function escapeControlChars(s: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        out += ch;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }
      if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '\\r';
      else if (ch === '\t') out += '\\t';
      else out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

/** Repair the usual LLM JSON damage: trailing commas, dangling keys, truncation. */
function repairJson(raw: string): string {
  let s = raw.replace(/```(?:json)?/gi, '');
  s = s.replace(/,(\s*[}\]])/g, '$1');

  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  for (const ch of s) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  if (inString) s += '"';
  // Drop a dangling tail: trailing comma, or a key left without a value.
  s = s.replace(/,\s*$/, '');
  s = s.replace(/,?\s*"[^"]*"?\s*:\s*$/, '');
  s = escapeControlChars(s);
  for (let i = stack.length - 1; i >= 0; i--) {
    s += stack[i] === '{' ? '}' : ']';
  }
  return s;
}

/**
 * Generate a JSON completion: Gemini first (annual subscription), OpenRouter
 * when Gemini is unconfigured or fails. Returns the parsed object.
 */
async function generateJson<T>(args: {
  system: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<T> {
  const call = {
    system: args.system,
    prompt: args.prompt,
    temperature: args.temperature ?? 0.7,
    maxTokens: args.maxTokens ?? 1500,
  };

  let content = '';
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    try {
      content = await callGemini(call);
    } catch (geminiError) {
      if (!process.env.OPENROUTER_API_KEY) throw geminiError;
      content = await callOpenRouter(call);
    }
  } else {
    content = await callOpenRouter(call);
  }

  // Extract the balanced top-level object (handles markdown fences), then
  // repair typical model damage: trailing commas, dangling keys, truncation.
  const attemptParse = (raw: string): T | null => {
    const candidate = extractJsonObject(raw);
    if (!candidate) return null;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      try {
        return JSON.parse(repairJson(candidate)) as T;
      } catch {
        return null;
      }
    }
  };

  let result = attemptParse(content);
  if (!result) {
    // Last resort: ask the model to repair its own output (deterministic).
    try {
      const repairCall = {
        system: 'You repair malformed JSON. Return only the corrected valid JSON, no prose.',
        prompt: `Fix this JSON:\n${content.slice(0, 8000)}`,
        temperature: 0,
        maxTokens: args.maxTokens ?? 1500,
      };
      const fixed = process.env.GOOGLE_GENERATIVE_AI_API_KEY
        ? await callGemini(repairCall)
        : await callOpenRouter(repairCall);
      result = attemptParse(fixed);
    } catch {
      /* provider unavailable — keep the failure */
    }
  }
  if (!result) throw new Error('Failed to parse AI response as JSON');
  return result;
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

    const parsed = await generateJson<{ description?: string; requirements?: string }>({
      system: 'You are an expert HR professional and job posting writer. Return only valid JSON.',
      prompt,
      temperature: 0.7,
      maxTokens: 3000,
    });

    return {
      description: parsed.description || '',
      requirements: parsed.requirements || '',
    };
  },
});

// ── AI Interview Prep Generator ──────────────────────────────────────────────

export interface InterviewPrepQuestion {
  category: 'general' | 'technical' | 'behavioral' | 'culture';
  question: string;
  whatToLookFor: string;
}

export interface InterviewPrepCriterion {
  criterion: string;
  description: string;
}

export interface InterviewPrep {
  questions: InterviewPrepQuestion[];
  criteria: InterviewPrepCriterion[];
  redFlags: string[];
  openingTips: string;
}

/**
 * Generate a structured interview preparation pack for a vacancy/candidate:
 * categorized questions with "what to look for" hints, scorecard criteria,
 * red flags to watch for, and opening tips. Pure LLM JSON — no persistence.
 */
export const generateInterviewPrep = action({
  args: {
    vacancyTitle: v.string(),
    department: v.optional(v.string()),
    vacancyDescription: v.optional(v.string()),
    requirements: v.optional(v.string()),
    candidateName: v.optional(v.string()),
    resumeText: v.optional(v.string()),
    interviewType: v.optional(
      v.union(
        v.literal('phone'),
        v.literal('video'),
        v.literal('onsite'),
        v.literal('technical'),
        v.literal('hr'),
      ),
    ),
    language: v.optional(
      v.union(v.literal('en'), v.literal('ru'), v.literal('hy'), v.literal('de')),
    ),
  },
  handler: async (_, args) => {
    const lang = args.language || 'en';
    const langInstruction =
      lang === 'en'
        ? ''
        : ` Write ALL content in ${
            lang === 'ru' ? 'Russian' : lang === 'hy' ? 'Armenian' : 'German'
          } language.`;

    const typeLabel =
      {
        phone: 'phone screening',
        video: 'video interview',
        onsite: 'on-site interview',
        technical: 'technical interview',
        hr: 'HR interview',
      }[args.interviewType || 'onsite'] || 'interview';

    // Keep the resume excerpt bounded so the prompt stays small.
    const resumeExcerpt = args.resumeText ? args.resumeText.slice(0, 3000) : '';

    const prompt = `Prepare an interview pack for a ${typeLabel}.${langInstruction}

Vacancy:
- Title: ${args.vacancyTitle}
${args.department ? `- Department: ${args.department}` : ''}
${args.vacancyDescription ? `- Description: ${args.vacancyDescription.slice(0, 1500)}` : ''}
${args.requirements ? `- Requirements: ${args.requirements.slice(0, 1000)}` : ''}
${args.candidateName ? `\nCandidate: ${args.candidateName}` : ''}
${resumeExcerpt ? `\nCandidate resume (excerpt):\n${resumeExcerpt}` : ''}

Return ONLY valid JSON with this exact structure:
{
  "questions": [
    { "category": "general", "question": "...", "whatToLookFor": "..." },
    { "category": "technical", "question": "...", "whatToLookFor": "..." },
    { "category": "behavioral", "question": "...", "whatToLookFor": "..." },
    { "category": "culture", "question": "...", "whatToLookFor": "..." }
  ],
  "criteria": [
    { "criterion": "short skill/quality name", "description": "what good looks like (1 sentence)" }
  ],
  "redFlags": ["..."],
  "openingTips": "2-3 sentences on how to open and structure this interview"
}

Rules:
- 8-10 questions total: at least 2 general, 2-3 technical (specific to the role), 2-3 behavioral (situational, past experience), 1-2 culture/values.
- If a candidate resume is provided, include 1-2 personalized questions about their specific experience.
- 4-6 criteria suitable for a 1-5 scorecard.
- 3-5 concrete red flags specific to this role.
- Keep every "whatToLookFor" under 25 words.`;

    const parsed = await generateJson<Partial<InterviewPrep>>({
      system: 'You are an expert technical recruiter and interview coach. Return only valid JSON.',
      prompt,
      temperature: 0.7,
      maxTokens: 5000,
    });

    const allowedCategories = ['general', 'technical', 'behavioral', 'culture'];
    const questions: InterviewPrepQuestion[] = (parsed.questions || [])
      .filter((q) => q && q.question)
      .map((q) => ({
        category: allowedCategories.includes(q.category) ? q.category : 'general',
        question: String(q.question),
        whatToLookFor: String(q.whatToLookFor || ''),
      }))
      .slice(0, 12);

    const criteria: InterviewPrepCriterion[] = (parsed.criteria || [])
      .filter((c) => c && c.criterion)
      .map((c) => ({
        criterion: String(c.criterion),
        description: String(c.description || ''),
      }))
      .slice(0, 8);

    const redFlags = (parsed.redFlags || []).map((r) => String(r)).slice(0, 6);

    return {
      questions,
      criteria,
      redFlags,
      openingTips: String(parsed.openingTips || ''),
    };
  },
});

// ── AI Screening Response Scorer ───────────────────────────────────────────

export interface ScreeningScore {
  score: number; // 1-10
  verdict: 'pass' | 'conditional' | 'fail';
  reasoning: string;
  strengths: string[];
  concerns: string[];
}

/**
 * Score a candidate's screening responses against the job requirements.
 * Called after the candidate completes screening via Telegram.
 */
export const scoreScreeningResponses = action({
  args: {
    applicationId: v.id('applications'),
    vacancyTitle: v.string(),
    vacancyDescription: v.optional(v.string()),
    requirements: v.optional(v.string()),
    screeningInstructions: v.optional(v.string()),
    responses: v.array(v.object({ message: v.string(), createdAt: v.number() })),
    language: v.optional(
      v.union(v.literal('en'), v.literal('ru'), v.literal('hy'), v.literal('de')),
    ),
  },
  handler: async (_, args): Promise<ScreeningScore> => {
    const lang = args.language || 'en';
    const langInstruction =
      lang === 'en'
        ? ''
        : ` Respond in ${lang === 'ru' ? 'Russian' : lang === 'hy' ? 'Armenian' : 'German'}.`;

    const responseText = args.responses
      .map((r, i) => `[Response ${i + 1}]: ${r.message}`)
      .join('\n\n');

    const prompt = `Score this candidate's screening responses for a ${args.vacancyTitle} position.${langInstruction}

Job: ${args.vacancyTitle}
${args.vacancyDescription ? `Description: ${args.vacancyDescription.slice(0, 1000)}` : ''}
${args.requirements ? `Requirements: ${args.requirements.slice(0, 800)}` : ''}
${args.screeningInstructions ? `\nScreening instructions given to candidate:\n${args.screeningInstructions.slice(0, 800)}` : ''}

Candidate responses:\n${responseText}

Return ONLY valid JSON:
{
  "score": <number 1-10>,
  "verdict": "pass" | "conditional" | "fail",
  "reasoning": "2-3 sentence explanation of the verdict",
  "strengths": ["strength 1", "strength 2"],
  "concerns": ["concern 1", "concern 2"]
}

Scoring guidelines:
- 8-10: Strong match — clearly relevant experience, specific answers, good communication
- 5-7: Conditional — some relevant experience but gaps or vague answers
- 1-4: Weak match — little relevant experience, poor communication, or red flags
- "pass" = score >= 7, "conditional" = 5-6, "fail" = <= 4
- Be objective and specific in reasoning
- List 2-3 strengths and 2-3 concerns, even for strong candidates`;

    const parsed = await generateJson<Partial<ScreeningScore>>({
      system: 'You are an expert recruiter evaluating screening responses. Return only valid JSON.',
      prompt,
      temperature: 0.3,
      maxTokens: 1500,
    });

    const score = Math.max(1, Math.min(10, Math.round(parsed.score ?? 5)));
    const verdict = score >= 7 ? 'pass' : score >= 5 ? 'conditional' : 'fail';

    return {
      score,
      verdict: parsed.verdict || verdict,
      reasoning: String(parsed.reasoning || 'No reasoning provided'),
      strengths: (parsed.strengths || []).map(String).slice(0, 5),
      concerns: (parsed.concerns || []).map(String).slice(0, 5),
    };
  },
});
