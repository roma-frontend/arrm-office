/**
 * Lightweight lexical RAG over the platform knowledge corpus.
 *
 * The corpus is small (~20 docs), so deterministic lexical retrieval
 * (heading-based chunks + multilingual keyword aliases + suffix stemming)
 * is used instead of embeddings/vector stores. Retrieval is filtered by the
 * caller's role so knowledge stays scoped (an employee never retrieves
 * admin-only docs). Ported from the builder-studio assistant RAG.
 */

import type { UserRole } from '@/lib/aiAssistant';
import { KNOWLEDGE_DOCS, type KnowledgeDoc } from './knowledgeDocs';

export interface DocChunk {
  docId: string;
  docTitle: string;
  /** Section heading (or the doc title for the preamble). */
  section: string;
  text: string;
  keywords: string;
  roles: UserRole[];
}

export interface DocHit extends DocChunk {
  score: number;
  /** "Doc title — Section" label used for citations. */
  label: string;
}

/** Max characters kept per chunk body (keeps the injected prompt small). */
const CHUNK_MAX = 1200;

// Common ru/en stopwords stripped from queries so they don't create noise.
const STOP = new Set([
  'как',
  'что',
  'где',
  'для',
  'это',
  'или',
  'the',
  'and',
  'how',
  'can',
  'you',
  'your',
  'with',
  'from',
  'чтобы',
  'нужно',
  'мне',
  'я',
  'a',
  'an',
  'to',
  'of',
  'in',
  'on',
  'is',
  'do',
  'i',
  'ինչ',
  'որ',
  'է',
]);

// Common inflectional endings (ru case/number + en plural/verb forms).
// Stripping them lets "почты" match "почта" and "drivers" match "driver"
// without a full NLP stemmer.
const STEM_ENDINGS = [
  'ing',
  'ings',
  'ies',
  'es',
  's',
  'ed',
  'инг',
  'ингс',
  'ед',
  'ер',
  'ерс',
  'ест',
  'с',
  'ес',
  'иес',
  'ид',
  'ли',
  'ами',
  'ями',
  'ах',
  'ях',
  'ам',
  'ям',
  'ов',
  'ев',
  'ей',
  'ой',
  'ый',
  'ий',
  'ая',
  'яя',
  'ое',
  'ее',
  'ые',
  'ие',
  'ом',
  'ем',
  'ую',
  'юю',
  'его',
  'ого',
  'ему',
  'ому',
  'ет',
  'ут',
  'ют',
  'ит',
  'ат',
  'ят',
  'ыл',
  'ул',
  'ил',
  'ал',
  'ы',
  'и',
  'а',
  'я',
  'о',
  'е',
  'у',
  'ю',
];

/** Remove a common inflectional ending if the remaining stem is still useful. */
export function stemWord(word: string): string {
  for (const end of STEM_ENDINGS) {
    if (word.endsWith(end) && word.length - end.length >= 3) return word.slice(0, -end.length);
  }
  return word;
}

/** Split text into lowercased word tokens (unicode-aware), minus stopwords. */
export function tokenize(input: string): string[] {
  const raw = (input || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return raw.filter((t) => t.length >= 2 && !STOP.has(t));
}

/**
 * Split a markdown doc into chunks by heading. Everything before the first
 * heading becomes a preamble chunk titled with the doc title.
 */
export function chunkMarkdown(doc: KnowledgeDoc): DocChunk[] {
  const lines = doc.body.split(/\r?\n/);
  const chunks: DocChunk[] = [];
  let section = doc.title;
  let bodyLines: string[] = [];
  const flush = () => {
    const text = bodyLines.join('\n').trim().slice(0, CHUNK_MAX);
    if (text) {
      chunks.push({
        docId: doc.id,
        docTitle: doc.title,
        section,
        text,
        keywords: doc.keywords,
        roles: doc.roles,
      });
    }
    bodyLines = [];
  };
  for (const line of lines) {
    const h = /^#{1,6}\s+(.*\S)\s*$/.exec(line);
    if (h) {
      flush();
      section = (h[1] ?? '').replace(/[#*`]/g, '').trim();
    } else {
      bodyLines.push(line);
    }
  }
  flush();
  return chunks;
}

/**
 * Score chunks against a query and return the top-k above a relevance floor.
 * Section-title and keyword-alias hits weigh more than body hits, which lets a
 * Russian query match an English/technical doc via its multilingual keywords.
 */
export function searchChunks(chunks: DocChunk[], query: string, k = 3): DocHit[] {
  const tokens = Array.from(new Set(tokenize(query)));
  if (tokens.length === 0) return [];
  const hits: DocHit[] = [];
  for (const c of chunks) {
    const titleHay = c.section.toLowerCase();
    const keyHay = c.keywords.toLowerCase();
    const bodyHay = c.text.toLowerCase();
    const titleStems = new Set(
      titleHay
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 2)
        .map(stemWord),
    );
    const keyStems = new Set(
      keyHay
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 2)
        .map(stemWord),
    );
    const bodyStems = new Set(
      bodyHay
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 2)
        .map(stemWord),
    );
    let score = 0;
    for (const tk of tokens) {
      if (titleHay.includes(tk)) score += 3;
      else if (titleStems.has(stemWord(tk))) score += 2;
      if (keyHay.includes(tk)) score += 3;
      else if (keyStems.has(stemWord(tk))) score += 2;
      if (bodyHay.includes(tk)) score += 1;
      else if (bodyStems.has(stemWord(tk))) score += 1;
    }
    if (score > 0) hits.push({ ...c, score, label: `${c.docTitle} — ${c.section}` });
  }
  // Require a real signal: one stemmed title/keyword hit (score 2) is enough —
  // keyword aliases are curated, so a stemmed match is a strong indicator.
  return hits
    .filter((h) => h.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// ── Index (lazily built, cached for the process lifetime) ────────────────────

let cachedIndex: DocChunk[] | null = null;

export function getDocIndex(): DocChunk[] {
  if (!cachedIndex) {
    cachedIndex = KNOWLEDGE_DOCS.flatMap((doc) => chunkMarkdown(doc));
  }
  return cachedIndex;
}

/**
 * Retrieve the most relevant doc chunks for a query, restricted to docs the
 * given role may see. Returns [] when nothing passes the relevance floor.
 */
export function retrieveDocs(query: string, role: UserRole, k = 3): DocHit[] {
  const allowed = getDocIndex().filter((c) => c.roles.includes(role));
  return searchChunks(allowed, query, k);
}

/** Build the system-prompt KNOWLEDGE BASE block from retrieved hits. */
export function formatKnowledgeSection(hits: DocHit[]): string {
  if (!hits.length) return '';
  const blocks = hits.map((h, i) => `[${i + 1}] SOURCE: ${h.label}\n${h.text}`).join('\n\n');
  return `
KNOWLEDGE BASE (authoritative platform documentation — the ground truth for
policy/feature questions). Prefer these facts over your own assumptions; if
they don't cover the question, say so instead of inventing steps.
${blocks}`;
}

/** De-duplicated citation labels for the client "Sources" footer. */
export function sourceLabels(hits: DocHit[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of hits) {
    if (seen.has(h.label)) continue;
    seen.add(h.label);
    out.push(h.label);
  }
  return out;
}
