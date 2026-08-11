/**
 * Long-term memory helpers for the AI assistant.
 *
 * Durable facts/preferences the user shared (e.g. "prefers short answers",
 * "works in the Finance department"). Harvested server-side from `<REMEMBER>`
 * tags in assistant replies and mixed back into the system prompt so the
 * assistant stays consistent across separate conversations.
 *
 * Pure & client-safe (no server imports) so both the API route and the UI can
 * reuse the exact same parse.
 */

/** Max facts kept per user; oldest are evicted once the cap is exceeded. */
export const MEMORY_CAP = 30;
/** Max characters kept per fact. */
export const MEMORY_MAX_LEN = 240;
/** Max facts harvested from a single reply. */
export const MEMORY_PER_REPLY = 5;

/**
 * Pull `<REMEMBER>…</REMEMBER>` facts out of a raw model reply. Returns the
 * deduped, trimmed, length-capped list of facts.
 */
export function extractMemoryFacts(raw: string): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<REMEMBER>\s*([\s\S]*?)\s*<\/REMEMBER>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const fact = (m[1] ?? '').replace(/\s+/g, ' ').trim().slice(0, MEMORY_MAX_LEN);
    if (!fact) continue;
    const key = fact.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(fact);
    if (out.length >= MEMORY_PER_REPLY) break;
  }
  return out;
}

/** Strip every `<REMEMBER>` tag (and any dangling / partial tag) from a reply. */
export function stripMemoryTags(raw: string): string {
  return (
    raw
      .replace(/<REMEMBER>[\s\S]*?<\/REMEMBER>/gi, '')
      .replace(/<REMEMBER>[\s\S]*$/gi, '')
      // A partial tag still mid-stream, e.g. "<REMEMB" or "</REMEM".
      .replace(/<\/?(?:R|RE|REM|REME|REMEM|REMEMB|REMEMBE|REMEMBER>?)$/i, '')
  );
}
