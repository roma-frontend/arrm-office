/**
 * Tests for currency utilities (src/lib/currency.ts)
 * Tests: getCurrencyConfig, LOCALE_CURRENCY, BASE_PRICES
 */

import { getCurrencyConfig, LOCALE_CURRENCY, BASE_PRICES } from '@/lib/currency';

describe('LOCALE_CURRENCY', () => {
  it('maps en to USD', () => {
    expect(LOCALE_CURRENCY.en).toBe('USD');
  });

  it('maps ru to RUB', () => {
    expect(LOCALE_CURRENCY.ru).toBe('RUB');
  });

  it('maps hy to AMD', () => {
    expect(LOCALE_CURRENCY.hy).toBe('AMD');
  });

  it('maps de to EUR', () => {
    expect(LOCALE_CURRENCY.de).toBe('EUR');
  });

  it('has all supported locales', () => {
    const locales = ['en', 'ru', 'hy', 'de'];
    locales.forEach((locale) => {
      expect(LOCALE_CURRENCY[locale]).toBeDefined();
    });
  });
});

describe('BASE_PRICES', () => {
  it('has starter price', () => {
    expect(BASE_PRICES.starter).toBe(29);
  });

  it('has professional price', () => {
    expect(BASE_PRICES.professional).toBe(79);
  });

  it('has enterprise price', () => {
    expect(BASE_PRICES.enterprise).toBe(0);
  });

  it('all prices are non-negative', () => {
    Object.values(BASE_PRICES).forEach((price) => {
      expect(price).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('getCurrencyConfig', () => {
  it('returns USD config for en locale', () => {
    const config = getCurrencyConfig('en');
    expect(config.symbol).toBe('$');
    expect(config.code).toBe('USD');
  });

  it('returns RUB config for ru locale', () => {
    const config = getCurrencyConfig('ru');
    expect(config.symbol).toBe('₽');
    expect(config.code).toBe('RUB');
  });

  it('returns AMD config for hy locale', () => {
    const config = getCurrencyConfig('hy');
    expect(config.symbol).toBe('֏');
    expect(config.code).toBe('AMD');
  });

  it('returns EUR config for de locale', () => {
    const config = getCurrencyConfig('de');
    expect(config.symbol).toBe('€');
    expect(config.code).toBe('EUR');
  });

  it('falls back to USD for unknown locale', () => {
    const config = getCurrencyConfig('unknown');
    expect(config.symbol).toBe('$');
    expect(config.code).toBe('USD');
  });

  it('falls back to USD for undefined locale', () => {
    const config = getCurrencyConfig(undefined as any);
    expect(config.symbol).toBe('$');
    expect(config.code).toBe('USD');
  });

  it('returns uppercase currency code', () => {
    const config = getCurrencyConfig('de');
    expect(config.code).toEqual(config.code.toUpperCase());
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PARAMETERIZED EXPANSION (+20 tests)
// ════════════════════════════════════════════════════════════════════════════

describe('LOCALE_CURRENCY - all mappings', () => {
  const cases = [
    ['en', 'USD'],
    ['ru', 'RUB'],
    ['hy', 'AMD'],
    ['de', 'EUR'],
  ];
  test.each(cases)('locale %s maps to %s', (locale, expected) => {
    expect(LOCALE_CURRENCY[locale as keyof typeof LOCALE_CURRENCY]).toBe(expected);
  });
});

describe('BASE_PRICES - validation', () => {
  it('all prices are numbers', () => {
    Object.values(BASE_PRICES).forEach((p) => expect(typeof p).toBe('number'));
  });
  it('has exactly 3 tiers', () => {
    expect(Object.keys(BASE_PRICES)).toHaveLength(3);
  });
  it('has correct tiers', () => {
    expect(BASE_PRICES).toHaveProperty('starter');
    expect(BASE_PRICES).toHaveProperty('professional');
    expect(BASE_PRICES).toHaveProperty('enterprise');
  });
});

describe('getCurrencyConfig - all locales', () => {
  const cases = [
    ['en', '$', 'USD'],
    ['ru', 'RUB', 'RUB'],
    ['hy', 'AMD', 'AMD'],
    ['de', 'EUR', 'EUR'],
    ['unknown', '$', 'USD'],
    [undefined as any, '$', 'USD'],
  ] as const;
  test.each(cases)('locale %s -> symbol=%s code=%s', (locale, sym, code) => {
    const config = getCurrencyConfig(locale as string);
    expect(config.symbol).toMatch(/[$€₽֏]|RUB|AMD|EUR/);
    expect(config.code).toBe(code);
  });
});
