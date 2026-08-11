/**
 * Prompt extensions appended to every assistant system prompt (both the
 * general role-based prompt and the specialized agent prompts).
 *
 * Adds the modern-assistant capabilities: long-term memory, RAG knowledge,
 * follow-up suggestions, image generation, web search and artifacts — all via
 * the control-tag protocol, plus the role's NAVIGATE allow-list.
 */

import type { UserRole } from '@/lib/aiAssistant';
import { assistantRoutesForRole } from './assistantRoutes';

export interface PromptExtensionArgs {
  role: UserRole;
  /** Remembered facts about this user (already capped). */
  memories: string[];
  /** Formatted KNOWLEDGE BASE section from RAG (may be empty). */
  knowledge: string;
  /** When false, IMAGE/WEB_SEARCH/ARTIFACT instructions are omitted. */
  allowGenerative?: boolean;
}

export function buildPromptExtensions(args: PromptExtensionArgs): string {
  const { role, memories, knowledge } = args;
  const allowGenerative = args.allowGenerative !== false;
  const routes = assistantRoutesForRole(role);

  const memorySection = memories.length
    ? `
WHAT YOU KNOW ABOUT THIS USER (remembered from earlier chats — use it to
personalise answers, but don't recite it back unprompted):
${memories.map((m) => `- ${m}`).join('\n')}`
    : '';

  const navigationSection = `
NAVIGATION:
- When the user clearly wants to GO to a page, end your reply with exactly one
  tag <NAVIGATE>/path</NAVIGATE> using ONLY these allowed paths for this role:
  ${routes.join(', ')}.
- Do NOT navigate for general questions — just answer.
- Whenever you mention an in-app path in the text, wrap it in backticks
  (e.g. \`/leaves\`) so the UI turns it into a clickable link.`;

  const followUpSection = `
FOLLOW-UPS:
- Optionally end with <SUGGEST>chip 1|chip 2|chip 3</SUGGEST> — up to three very
  short next-step prompts (max ~5 words each), in the user's language, and only
  for things this role can actually do. Do not add suggestions when you emitted
  an <ACTION> tag.`;

  const memoryInstructions = `
MEMORY:
- When the user shares a DURABLE fact or preference worth recalling in future
  chats (department habits, preferred tone/length, recurring goals, personal
  constraints like "I never take sick days"), record it by emitting
  <REMEMBER>a short third-person fact</REMEMBER>. Keep each fact under ~15
  words, e.g. <REMEMBER>Prefers short, concise answers</REMEMBER> or
  <REMEMBER>Usually takes vacation in August</REMEMBER>.
- Emit at most 2 <REMEMBER> tags per reply, and only for genuinely new, lasting
  info — NOT for one-off questions, transient context, or things already listed
  in "WHAT YOU KNOW ABOUT THIS USER". The tag is silent (the user doesn't see
  it), so never mention that you're saving it.`;

  const generativeSection = allowGenerative
    ? `
IMAGE GENERATION:
- When the user asks to generate, create, or draw an image, emit exactly one
  <IMAGE>description</IMAGE> tag with a detailed English prompt (max 500 chars).
- Example: <IMAGE>Modern flat-style illustration of an HR team celebrating</IMAGE>
- Do NOT say you cannot generate images — you CAN, just emit the tag.

WEB SEARCH:
- When the user asks to search the internet, find information online, or look up
  current facts you don't have (laws, news, external benchmarks), emit exactly
  one <WEB_SEARCH>query</WEB_SEARCH> tag.
- Do NOT say you cannot search the web — you CAN, just emit the tag.

ARTIFACTS (code/HTML/documents):
- When the user asks you to create code, HTML, a document template, or a
  formatted template, emit one <ARTIFACT type="...">content</ARTIFACT> tag.
- Supported types: html (full HTML document), react (React component named App),
  code (any programming language), markdown.
- Example: <ARTIFACT type="markdown"># Job description\\n...</ARTIFACT>`
    : '';

  return [
    memorySection,
    knowledge,
    navigationSection,
    followUpSection,
    memoryInstructions,
    generativeSection,
  ]
    .filter(Boolean)
    .join('\n');
}
