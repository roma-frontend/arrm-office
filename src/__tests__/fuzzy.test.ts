/**
 * Tests for `@/lib/fuzzy` — subsequence fuzzy matching for the command palette.
 */
import { describe, it, expect } from '@jest/globals';
import { fuzzyMatch, fuzzyMatchAny } from '@/lib/fuzzy';

describe('fuzzyMatch', () => {
  it('returns { score: 0, indices: [] } for empty query', () => {
    const result = fuzzyMatch('', 'anything');
    expect(result).toEqual({ score: 0, indices: [] });
  });

  it('returns null for non-matching query', () => {
    expect(fuzzyMatch('xyz', 'hello')).toBeNull();
  });

  it('matches exact substring', () => {
    const result = fuzzyMatch('task', 'Tasks');
    expect(result).not.toBeNull();
    expect(result!.indices.length).toBe(4);
  });

  it('matches prefix (highest score)', () => {
    const prefix = fuzzyMatch('lea', 'Leave Requests');
    const mid = fuzzyMatch('lea', 'My Leave Requests');
    expect(prefix).not.toBeNull();
    expect(mid).not.toBeNull();
    expect(prefix!.score).toBeGreaterThan(mid!.score);
  });

  it('matches at word boundary', () => {
    const boundary = fuzzyMatch('r', 'Admin > Reports');
    const inside = fuzzyMatch('r', 'Admin > Reports');
    expect(boundary).not.toBeNull();
    expect(inside).not.toBeNull();
  });

  it('matches subsequence', () => {
    const result = fuzzyMatch('lvs', 'Leave Requests');
    expect(result).not.toBeNull();
    expect(result!.indices.length).toBe(3);
  });

  it('returns null for impossible subsequence', () => {
    expect(fuzzyMatch('zzz', 'hello')).toBeNull();
  });

  it('shorter target wins tie (higher score)', () => {
    const short = fuzzyMatch('ts', 'Tasks');
    const long = fuzzyMatch('ts', 'Recurring Tasks');
    expect(short).not.toBeNull();
    expect(long).not.toBeNull();
    expect(short!.score).toBeGreaterThan(long!.score);
  });

  it('consecutive characters score higher', () => {
    // 'ta' matches T(0) and a(1) — consecutive positions
    // 'ts' matches T(0) and s(2) — not consecutive
    const consecutive = fuzzyMatch('ta', 'Tasks');
    const scattered = fuzzyMatch('ts', 'Tasks');
    expect(consecutive).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(consecutive!.score).toBeGreaterThan(scattered!.score);
  });

  it('matches case-insensitively', () => {
    expect(fuzzyMatch('TASK', 'tasks')).not.toBeNull();
    expect(fuzzyMatch('task', 'TASKS')).not.toBeNull();
  });

  it('matches with hyphens and slashes as boundaries', () => {
    expect(fuzzyMatch('hr', 'HR-Policies')).not.toBeNull();
    expect(fuzzyMatch('p', 'Settings/Profile')).not.toBeNull();
  });
});

describe('fuzzyMatchAny', () => {
  it('returns null when all targets are undefined/empty', () => {
    expect(fuzzyMatchAny('test', [undefined, undefined])).toBeNull();
  });

  it('returns best match across targets', () => {
    const result = fuzzyMatchAny('ts', ['Something', 'Tasks', 'Notes']);
    expect(result).not.toBeNull();
  });

  it('skips undefined targets', () => {
    const result = fuzzyMatchAny('task', [undefined, 'Tasks', undefined]);
    expect(result).not.toBeNull();
    expect(result!.indices.length).toBe(4);
  });

  it('returns null when no target matches', () => {
    expect(fuzzyMatchAny('xyz', ['hello', 'world'])).toBeNull();
  });
});
