/**
 * Tests for convex/translations.ts — server-side translation helpers.
 *
 * Pure functions, no Convex context needed.
 */

import { getTranslation, getUserLocale } from '../../convex/translations';

describe('getTranslation', () => {
  it('returns the key itself for unknown keys', () => {
    expect(getTranslation('en', 'some.unknown.key')).toBe('some.unknown.key');
  });

  it('returns the English text for the en locale', () => {
    const text = getTranslation('en', 'ticket.chatCreated');
    expect(text).toContain('Chat created for ticket');
  });

  it('returns the Russian text for the ru locale', () => {
    const text = getTranslation('ru', 'ticket.chatCreated');
    expect(text).toContain('Чат создан для тикета');
  });

  it('returns the Armenian text for the hy locale', () => {
    const text = getTranslation('hy', 'ticket.chatCreatedShort');
    expect(text).toContain('Չաթը ստեղծվել է տոմսի համար');
  });

  it('substitutes {ticketNumber} placeholders', () => {
    const text = getTranslation('en', 'ticket.chatCreated', { ticketNumber: 'T-123' });
    expect(text).toContain('T-123');
    expect(text).not.toContain('{ticketNumber}');
  });

  it('substitutes multiple placeholders', () => {
    const text = getTranslation('en', 'ticket.chatCreated', {
      ticketNumber: 'A',
      extra: 'B',
    });
    expect(text).toContain('A');
  });

  it('falls back to English for unknown locales', () => {
    const text = getTranslation('fr' as any, 'ticket.chatCreatedShort');
    expect(text).toContain('Chat created for ticket');
  });

  it('falls back to the key itself when no locale has a translation', () => {
    expect(getTranslation('en', 'no.such.key.anywhere')).toBe('no.such.key.anywhere');
  });
});

describe('getUserLocale', () => {
  it('returns hy for Armenian', () => {
    expect(getUserLocale('hy')).toBe('hy');
  });

  it('returns ru for Russian', () => {
    expect(getUserLocale('ru')).toBe('ru');
  });

  it('returns en for English', () => {
    expect(getUserLocale('en')).toBe('en');
  });

  it('returns en for unknown languages', () => {
    expect(getUserLocale('de')).toBe('en');
    expect(getUserLocale('fr')).toBe('en');
  });

  it('returns en for undefined', () => {
    expect(getUserLocale(undefined)).toBe('en');
  });
});
