/**
 * Subsequence fuzzy matching for the command palette.
 *
 * Chosen over `includes()` because a palette is judged on how few keystrokes it
 * takes: "lvs" should reach "Leave Requests" and "adhol" should reach
 * "Admin › Holidays". Chosen over a full Levenshtein/Smith-Waterman scorer
 * because this runs on every keystroke over a few hundred candidates, and the
 * ranking signals that actually matter are cheap:
 *
 *   - a prefix match beats a match in the middle;
 *   - a match at a word boundary beats one inside a word;
 *   - consecutive matched characters beat scattered ones;
 *   - shorter candidates win ties, so "Tasks" outranks "Recurring Tasks".
 *
 * Returns `null` when the query is not a subsequence of the target at all, so
 * callers can filter and sort in one pass.
 */
export interface FuzzyMatch {
  score: number;
  /** Indices in the target that matched, for highlighting. */
  indices: number[];
}

const SCORE_PREFIX = 24;
const SCORE_WORD_BOUNDARY = 12;
const SCORE_CONSECUTIVE = 8;
const PENALTY_GAP = 1;

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (!query) return { score: 0, indices: [] };

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact substring is always the strongest signal — short-circuit it so common
  // cases don't pay for the scan below.
  const direct = t.indexOf(q);
  if (direct !== -1) {
    const indices = Array.from({ length: q.length }, (_, i) => direct + i);
    let score = 100 + SCORE_CONSECUTIVE * q.length - direct;
    if (direct === 0) score += SCORE_PREFIX;
    else if (isBoundary(t, direct)) score += SCORE_WORD_BOUNDARY;
    return { score: score - target.length * 0.1, indices };
  }

  const indices: number[] = [];
  let score = 0;
  let ti = 0;
  let lastMatch = -2;

  for (const char of q) {
    const found = t.indexOf(char, ti);
    if (found === -1) return null;

    if (found === 0) score += SCORE_PREFIX;
    else if (isBoundary(t, found)) score += SCORE_WORD_BOUNDARY;
    if (found === lastMatch + 1) score += SCORE_CONSECUTIVE;
    else score -= Math.min(found - lastMatch - 1, 8) * PENALTY_GAP;

    indices.push(found);
    lastMatch = found;
    ti = found + 1;
  }

  // Shorter targets win ties: matching "Tasks" is more likely what was meant
  // than matching "Recurring Tasks".
  return { score: score - target.length * 0.1, indices };
}

function isBoundary(text: string, index: number): boolean {
  const prev = text[index - 1];
  return prev === ' ' || prev === '-' || prev === '_' || prev === '/' || prev === '.';
}

/**
 * Best score across several haystacks (label, group, href, keywords), so a
 * destination is reachable by its own name *or* by its section.
 */
export function fuzzyMatchAny(query: string, targets: (string | undefined)[]): FuzzyMatch | null {
  let best: FuzzyMatch | null = null;
  for (const target of targets) {
    if (!target) continue;
    const match = fuzzyMatch(query, target);
    if (match && (!best || match.score > best.score)) best = match;
  }
  return best;
}
