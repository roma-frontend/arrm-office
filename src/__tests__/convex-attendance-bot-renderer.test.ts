/**
 * Tests for the HR Assistant bot renderer.
 *
 * The renderer is a pure function so it's covered with no Convex runtime —
 * `convex-leaves-rbac.test.ts` does the same thing for the leaves helpers.
 */
import { describe, it, expect } from '@jest/globals';
import { renderDigest, pickLocale } from '../../convex/attendance/bot';

describe('pickLocale', () => {
  it('accepts the four supported locales', () => {
    expect(pickLocale('en')).toBe('en');
    expect(pickLocale('ru')).toBe('ru');
    expect(pickLocale('hy')).toBe('hy');
    expect(pickLocale('de')).toBe('de');
  });

  it('falls back to English for any other value', () => {
    expect(pickLocale(undefined)).toBe('en');
    expect(pickLocale(null)).toBe('en');
    expect(pickLocale('fr')).toBe('en');
    expect(pickLocale('')).toBe('en');
  });
});

describe('renderDigest', () => {
  const everyone = [
    { id: 'u_anna' as never, name: 'Anna' },
    { id: 'u_boris' as never, name: 'Boris' },
    { id: 'u_clara' as never, name: 'Clara' },
  ];

  it('defaults people with no entry to "office"', () => {
    const { body } = renderDigest('2026-08-30', 'en', everyone, [], '09:00');
    expect(body).toContain('🏢 In the office');
    expect(body).toContain('Anna');
    expect(body).toContain('Boris');
    expect(body).toContain('Clara');
    expect(body).toContain('👥 Total: 3');
  });

  it('lets an approved leave override an attendance entry for the same person', () => {
    // buildDigest merges approved leaveRequests AFTER the attendance entries,
    // so the leave must win the by-user map (schema contract: a leave
    // overrides the attendance entry for the same day). Without that ordering
    // a person on approved leave read as "office" in the digest.
    const { body } = renderDigest(
      '2026-08-30',
      'en',
      everyone,
      [
        { userId: 'u_anna' as never, userName: 'Anna', type: 'office' },
        { userId: 'u_anna' as never, userName: 'Anna', type: 'leave', note: 'Family event' },
      ],
      '09:00',
    );
    expect(body).toContain('🌴 On leave');
    expect(body).toContain('Family event');
    // Anna is no longer counted present.
    expect(body).toContain('✅ Present: 2');
  });

  it('routes explicit entries into their buckets', () => {
    const { body } = renderDigest(
      '2026-08-30',
      'en',
      everyone,
      [
        { userId: 'u_anna' as never, userName: 'Anna', type: 'wfh', note: 'Doctor visit' },
        { userId: 'u_clara' as never, userName: 'Clara', type: 'sick' },
      ],
      '09:00',
    );
    expect(body).toContain('🏠 Working from home');
    expect(body).toContain('Anna');
    expect(body).toContain('Doctor visit');
    expect(body).toContain('🤒 Sick day');
    expect(body).toContain('Clara');
    expect(body).toContain('👥 Total: 3');
  });

  it('skips empty sections to keep the digest tight', () => {
    const { body } = renderDigest(
      '2026-08-30',
      'en',
      everyone,
      [{ userId: 'u_anna' as never, userName: 'Anna', type: 'wfh' }],
      '09:00',
    );
    expect(body).not.toContain('🤒 Sick day');
    expect(body).not.toContain('✈️ Business trip');
    expect(body).not.toContain('🌴 On leave');
    expect(body).toContain('👥 Total: 3');
  });

  it('renders the Russian digest in Russian', () => {
    const { body } = renderDigest('2026-08-30', 'ru', everyone, [], '09:00');
    expect(body).toContain('🏢 В офисе');
    expect(body).toContain('👥 Всего: 3');
    expect(body).toContain('🔄 Обновлено в 09:00');
  });

  it('renders the Armenian digest in Armenian', () => {
    const { body } = renderDigest('2026-08-30', 'hy', everyone, [], '09:00');
    expect(body).toContain('🏢 Գրասենյակում');
    expect(body).toContain('🔄 Թարմացվել է՝ 09:00');
  });

  it('includes the title with the date', () => {
    const { title } = renderDigest('2026-08-30', 'en', everyone, [], '09:00');
    expect(title).toContain('2026-08-30');
  });

  it('sorts alphabetically so the layout is stable across renders', () => {
    const { body } = renderDigest(
      '2026-08-30',
      'en',
      [
        { id: 'u_clara' as never, name: 'Clara' },
        { id: 'u_anna' as never, name: 'Anna' },
      ],
      [],
      '09:00',
    );
    expect(body.indexOf('Anna')).toBeLessThan(body.indexOf('Clara'));
  });

  it('shows business-trip times when start/end are set', () => {
    const { body } = renderDigest(
      '2026-08-30',
      'en',
      [{ id: 'u_anna' as never, name: 'Anna' }],
      [
        {
          userId: 'u_anna' as never,
          userName: 'Anna',
          type: 'business_trip',
          startTime: '09:00',
          endTime: '18:00',
        },
      ],
      '09:00',
    );
    expect(body).toContain('✈️ Business trip');
    expect(body).toContain('Anna');
    expect(body).toContain('09:00');
    expect(body).toContain('18:00');
  });
});
