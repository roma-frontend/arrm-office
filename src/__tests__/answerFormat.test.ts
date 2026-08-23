/**
 * Tests for `@/lib/ai/answerFormat` — AI answer structure rules and stream failure.
 */
import { describe, it, expect } from '@jest/globals';
import {
  ANSWER_DEPTH_RULES,
  ANSWER_INTEGRITY_RULES,
  streamFailureNotice,
} from '@/lib/ai/answerFormat';

describe('ANSWER_DEPTH_RULES', () => {
  it('is a non-empty string', () => {
    expect(typeof ANSWER_DEPTH_RULES).toBe('string');
    expect(ANSWER_DEPTH_RULES.length).toBeGreaterThan(0);
  });

  it('mentions key structural sections', () => {
    expect(ANSWER_DEPTH_RULES).toContain('Direct answer');
    expect(ANSWER_DEPTH_RULES).toContain('Numbers');
    expect(ANSWER_DEPTH_RULES).toContain('Edge cases');
    expect(ANSWER_DEPTH_RULES).toContain('Next step');
  });

  it('mentions formatting rules', () => {
    expect(ANSWER_DEPTH_RULES).toContain('Markdown');
    expect(ANSWER_DEPTH_RULES).toContain('table');
  });

  it('contains anti-padding rules', () => {
    expect(ANSWER_DEPTH_RULES).toContain('DEPTH WITHOUT PADDING');
    expect(ANSWER_DEPTH_RULES).toContain('restating the question');
  });
});

describe('ANSWER_INTEGRITY_RULES', () => {
  it('is a non-empty string', () => {
    expect(typeof ANSWER_INTEGRITY_RULES).toBe('string');
    expect(ANSWER_INTEGRITY_RULES.length).toBeGreaterThan(0);
  });

  it('mentions data honesty', () => {
    expect(ANSWER_INTEGRITY_RULES).toContain('DATA HONESTY');
    expect(ANSWER_INTEGRITY_RULES).toContain('NEVER invent');
  });

  it('mentions control tags', () => {
    expect(ANSWER_INTEGRITY_RULES).toContain('CONTROL TAGS');
    expect(ANSWER_INTEGRITY_RULES).toContain('NAVIGATE');
  });

  it('mentions language', () => {
    expect(ANSWER_INTEGRITY_RULES).toContain('LANGUAGE');
    expect(ANSWER_INTEGRITY_RULES).toContain("user's language");
  });
});

describe('streamFailureNotice', () => {
  it('returns English notice for partial failure', () => {
    const notice = streamFailureNotice('en', true);
    expect(notice).toContain('cut off');
    expect(notice).toContain('Retry');
  });

  it('returns English notice for complete failure', () => {
    const notice = streamFailureNotice('en', false);
    expect(notice).toContain('Could not get a reply');
  });

  it('returns Russian notice for partial failure', () => {
    const notice = streamFailureNotice('ru', true);
    expect(notice).toContain('прервался');
  });

  it('returns Russian notice for complete failure', () => {
    const notice = streamFailureNotice('ru', false);
    expect(notice).toContain('Не удалось');
  });

  it('returns Armenian notice for partial failure', () => {
    const notice = streamFailureNotice('hy', true);
    expect(notice).toContain('կիսատ');
  });

  it('returns Armenian notice for complete failure', () => {
    const notice = streamFailureNotice('hy', false);
    expect(notice).toContain('Չհաջողվեց');
  });

  it('defaults to English for unknown language', () => {
    const notice = streamFailureNotice('de', true);
    expect(notice).toContain('cut off');
  });

  it('defaults to English for undefined language', () => {
    const notice = streamFailureNotice(undefined, false);
    expect(notice).toContain('Could not get a reply');
  });
});
