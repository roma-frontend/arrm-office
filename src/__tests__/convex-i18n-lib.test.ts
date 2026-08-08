/**
 * Tests for convex/lib/i18n.ts — server-side translation lookup with
 * {{param}} interpolation and $t(other.key) nesting.
 */

import { describe, it, expect } from '@jest/globals';

import {
  toCatalogLocale,
  translateOrNull,
  translate,
  type CatalogLocale,
} from '../../convex/lib/i18n';

describe('toCatalogLocale', () => {
  it('falls back to en for null/undefined', () => {
    expect(toCatalogLocale(undefined)).toBe('en');
    expect(toCatalogLocale(null)).toBe('en');
  });

  it('maps exact locales', () => {
    expect(toCatalogLocale('en')).toBe('en');
    expect(toCatalogLocale('ru')).toBe('ru');
    expect(toCatalogLocale('hy')).toBe('hy');
  });

  it('maps regional tags to their base locale', () => {
    expect(toCatalogLocale('en-US')).toBe('en');
    expect(toCatalogLocale('ru-RU')).toBe('ru');
    expect(toCatalogLocale('hy-AM')).toBe('hy');
    expect(toCatalogLocale('de-DE')).toBe('de');
  });

  it('is case-insensitive', () => {
    expect(toCatalogLocale('RU')).toBe('ru');
    expect(toCatalogLocale('En')).toBe('en');
  });

  it('falls back to en for unsupported languages', () => {
    expect(toCatalogLocale('fr-FR')).toBe('en');
    expect(toCatalogLocale('zzz')).toBe('en');
  });
});

describe('translateOrNull', () => {
  it('returns null for an unknown key', () => {
    expect(translateOrNull('en', 'no.such.key')).toBeNull();
  });

  it('returns the raw string for a known key', () => {
    expect(translateOrNull('en', 'ticket.chatCreatedShort')).toBe(
      'Support chat opened for ticket {{ticketNumber}}',
    );
  });

  it('interpolates params', () => {
    const result = translateOrNull('en', 'notifications.titles.ticketNew', {
      ticketNumber: 'T-1',
    });
    expect(result).toBe('🎫 New ticket: T-1');
  });

  it('leaves missing placeholders untouched', () => {
    expect(translateOrNull('en', 'ticket.chatCreatedShort')).toContain('{{ticketNumber}}');
  });

  it('resolves $t() nesting with interpolated inner keys', () => {
    const result = translateOrNull('en', 'notifications.messages.leaveApprovedBy', {
      type: 'sick',
      start: '2026-01-01',
      end: '2026-01-02',
      reviewerName: 'Ann',
    });
    expect(result).toBe('Your Sick Leave (2026-01-01 → 2026-01-02) has been approved by Ann.');
  });

  it('resolves $t() nesting in Russian', () => {
    const result = translateOrNull('ru', 'notifications.messages.leaveApprovedBy', {
      type: 'paid',
      start: '2026-01-01',
      end: '2026-01-02',
      reviewerName: 'Иван',
    });
    expect(result).toContain('Оплачиваемый отпуск');
    expect(result).toContain('Иван');
  });

  it('leaves unresolvable $t() references intact', () => {
    const result = translateOrNull('en', 'notifications.messages.attendeeResponded', {
      name: 'Bob',
      response: 'some_unknown_response',
    });
    expect(result).toContain('$t(attendeeResponses.some_unknown_response)');
  });

  it('interpolates before resolving the nested key', () => {
    const result = translateOrNull('en', 'notifications.messages.kudosReceived', {
      senderName: 'Ann',
      category: 'teamwork',
    });
    expect(result).toBe('Ann sent you kudos for teamwork!');
  });
});

describe('translate', () => {
  it('falls back to the provided fallback for unknown keys', () => {
    expect(translate('en', 'no.such.key', {}, 'Fallback text')).toBe('Fallback text');
  });

  it('falls back to the key itself by default', () => {
    expect(translate('en', 'no.such.key')).toBe('no.such.key');
  });

  it('translates known keys with params', () => {
    expect(translate('en', 'notifications.messages.birthdayToday', { name: 'Bob' })).toBe(
      "Today is Bob's birthday! 🎁 Send your congratulations and brighten their day!",
    );
  });

  it('returns the en string for unknown locales', () => {
    const result = translate('fr' as CatalogLocale, 'ticket.chatCreated', { ticketNumber: 'T-9' });
    expect(result).toBe(
      'A support chat has been opened for ticket T-9. It becomes visible to you as soon as the support assistant writes the first message.',
    );
  });

  it('handles numeric params', () => {
    const result = translate('en', 'notifications.messages.birthdaySoon', {
      name: 'Bob',
      count: 3,
    });
    expect(result).toBe("Bob's birthday is in 3 days! Start thinking about your greeting. 🎂");
  });
});
