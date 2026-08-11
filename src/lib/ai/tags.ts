/**
 * Control-tag protocol shared by the chat API and every chat UI.
 *
 * The model emits lightweight XML tags instead of native function calling:
 *   <NAVIGATE>/path</NAVIGATE>          — client-side router navigation
 *   <ACTION>{json}</ACTION>             — mutation proposal (confirm card)
 *   <SUGGEST>chip 1|chip 2|chip 3</SUGGEST> — follow-up suggestion chips
 *   <SOURCES>label 1|label 2</SOURCES>  — RAG citations (server-emitted)
 *   <REMEMBER>fact</REMEMBER>           — silent long-term memory write
 *   <IMAGE>prompt</IMAGE>               — image generation request
 *   <WEB_SEARCH>query</WEB_SEARCH>      — web search request
 *   <ARTIFACT type="html|react|code|markdown">…</ARTIFACT> — renderable output
 *
 * Pure & client-safe so the full-page chat and the floating widget share one
 * implementation.
 */

export interface ParsedTags {
  /** Content with ALL control tags removed (safe to render as markdown). */
  cleanContent: string;
  navigateTo: string | null;
  suggestions: string[];
  sources: string[];
  imagePrompt: string | null;
  webSearchQuery: string | null;
  artifacts: ArtifactBlock[];
}

export interface ArtifactBlock {
  type: 'html' | 'react' | 'code' | 'markdown';
  content: string;
}

const TAG_PATTERNS = {
  navigate: /<NAVIGATE>\s*([\s\S]*?)\s*<\/NAVIGATE>/i,
  suggest: /<SUGGEST>\s*([\s\S]*?)\s*<\/SUGGEST>/i,
  sources: /<SOURCES>\s*([\s\S]*?)\s*<\/SOURCES>/i,
  image: /<IMAGE>\s*([\s\S]*?)\s*<\/IMAGE>/i,
  webSearch: /<WEB_SEARCH>\s*([\s\S]*?)\s*<\/WEB_SEARCH>/i,
  artifact: /<ARTIFACT(?:\s+type="(\w+)")?\s*>([\s\S]*?)<\/ARTIFACT>/gi,
} as const;

/** Every tag name the model may emit. Order does not matter. */
const CONTROL_TAG_NAMES = [
  'NAVIGATE',
  'SUGGEST',
  'SOURCES',
  'REMEMBER',
  'IMAGE',
  'WEB_SEARCH',
  'ARTIFACT',
] as const;

/** A control tag that was opened but never closed — drop it and everything after. */
const UNCLOSED_TAG = new RegExp(`<\\/?(?:${CONTROL_TAG_NAMES.join('|')})\\b[\\s\\S]*$`, 'i');

/**
 * A tag name cut off mid-word at the very end of the text, e.g. `<SUGG`, `</NAVIG`.
 *
 * This deliberately only matches at the end of the string and only when the
 * captured letters are a genuine prefix of a known tag name. The previous
 * version matched `<` followed by any single letter from N/S/R/I/W/A and then
 * deleted everything to the end of the reply — so a stray `<Address>`, `<input>`
 * or `<name>` anywhere in an answer silently truncated it, and truncated the
 * whole answer away when it appeared near the start.
 */
const PARTIAL_TAG_TAIL = /<\/?([A-Z_]+)$/i;

/** Strip every control tag (complete or dangling) from reply text. */
export function stripControlTags(raw: string): string {
  let out = raw;
  out = out.replace(/<NAVIGATE>[\s\S]*?<\/NAVIGATE>/gi, '');
  out = out.replace(/<SUGGEST>[\s\S]*?<\/SUGGEST>/gi, '');
  out = out.replace(/<SOURCES>[\s\S]*?<\/SOURCES>/gi, '');
  out = out.replace(/<REMEMBER>[\s\S]*?<\/REMEMBER>/gi, '');
  out = out.replace(/<IMAGE>[\s\S]*?<\/IMAGE>/gi, '');
  out = out.replace(/<WEB_SEARCH>[\s\S]*?<\/WEB_SEARCH>/gi, '');
  out = out.replace(/<ARTIFACT(?:\s+type="\w+")?\s*>[\s\S]*?<\/ARTIFACT>/gi, '');
  // Tags still mid-stream.
  out = out.replace(UNCLOSED_TAG, '');
  out = out.replace(PARTIAL_TAG_TAIL, (match, partial: string) => {
    const prefix = partial.toUpperCase();
    return CONTROL_TAG_NAMES.some((name) => name.startsWith(prefix)) ? '' : match;
  });
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/** Parse all control tags from a (possibly still streaming) reply. */
export function parseAssistantTags(raw: string): ParsedTags {
  const navigateTo = TAG_PATTERNS.navigate.exec(raw)?.[1]?.trim() || null;
  const suggestRaw = TAG_PATTERNS.suggest.exec(raw)?.[1] || '';
  const sourcesRaw = TAG_PATTERNS.sources.exec(raw)?.[1] || '';
  const imagePrompt = TAG_PATTERNS.image.exec(raw)?.[1]?.trim() || null;
  const webSearchQuery = TAG_PATTERNS.webSearch.exec(raw)?.[1]?.trim() || null;

  const suggestions = suggestRaw
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);

  const sources = sourcesRaw
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

  const artifacts: ArtifactBlock[] = [];
  const artifactRe = new RegExp(TAG_PATTERNS.artifact.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = artifactRe.exec(raw)) !== null) {
    const type = (m[1] || 'markdown').toLowerCase() as ArtifactBlock['type'];
    artifacts.push({
      type: ['html', 'react', 'code', 'markdown'].includes(type) ? type : 'code',
      content: (m[2] || '').trim(),
    });
  }

  return {
    cleanContent: stripControlTags(raw),
    navigateTo,
    suggestions,
    sources,
    imagePrompt,
    webSearchQuery,
    artifacts,
  };
}

/**
 * Incremental render helper: strips complete control tags AND any partial tag
 * at the very end of a mid-stream chunk so users never see "<SUGGE…".
 */
export function stripPartialTail(raw: string): string {
  const lt = raw.lastIndexOf('<');
  if (lt === -1) return raw;
  const tail = raw.slice(lt);
  // A dangling "<" with no closing ">" could be a tag starting mid-stream.
  if (!tail.includes('>')) return raw.slice(0, lt);
  return raw;
}
