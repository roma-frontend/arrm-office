/**
 * Tests for convex/lib/taxRules.ts — country tax data, country resolution and
 * org-override merging.
 */

import { describe, it, expect } from '@jest/globals';
import {
  COUNTRY_CODES,
  TAX_RULES,
  getTaxRule,
  toCountryCode,
  applyTaxRuleOverride,
} from '../../convex/lib/taxRules';

// ── Data integrity ───────────────────────────────────────────────────────────
describe('tax rules data', () => {
  it('defines every country code with a matching rule', () => {
    expect(COUNTRY_CODES).toEqual(Object.keys(TAX_RULES));
    for (const code of COUNTRY_CODES) {
      expect(TAX_RULES[code].code).toBe(code);
      expect(TAX_RULES[code].currency).toBeTruthy();
      expect(TAX_RULES[code].incomeTaxBrackets.length).toBeGreaterThan(0);
    }
  });

  it('starts the first income-tax bracket at zero', () => {
    for (const rule of Object.values(TAX_RULES)) {
      expect(rule.incomeTaxBrackets[0]!.min).toBe(0);
    }
  });

  it('marks only the approximate reference countries as approximate', () => {
    const approximate = Object.entries(TAX_RULES)
      .filter(([, r]) => r.approximate)
      .map(([code]) => code);
    expect(approximate.sort()).toEqual(['germany', 'poland', 'uk', 'usa']);
  });

  it('has verified Armenia rates (flat 20% income tax)', () => {
    expect(TAX_RULES.armenia.incomeTaxBrackets).toEqual([{ min: 0, rate: 0.2 }]);
  });

  it('has Russia employer contributions mirroring the legacy constants', () => {
    const names = TAX_RULES.russia.employerContributions.map((c) => c.name);
    expect(names).toEqual(['Social Insurance', 'Pension', 'Medical', 'Accident']);
  });

  it('keeps USA brackets within a plausible progressive range', () => {
    const rates = TAX_RULES.usa.incomeTaxBrackets.map((b) => b.rate);
    expect(rates).toEqual([0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37]);
  });
});

// ── getTaxRule ───────────────────────────────────────────────────────────────
describe('getTaxRule', () => {
  it('resolves a known country case-insensitively', () => {
    expect(getTaxRule('Armenia').code).toBe('armenia');
    expect(getTaxRule('USA').code).toBe('usa');
  });

  it('falls back to Armenia for unknown, empty or null countries', () => {
    expect(getTaxRule('atlantis').code).toBe('armenia');
    expect(getTaxRule('').code).toBe('armenia');
    expect(getTaxRule(undefined).code).toBe('armenia');
    expect(getTaxRule(null).code).toBe('armenia');
  });

  it('returns the full rule object for a known country', () => {
    const rule = getTaxRule('germany');
    expect(rule.currency).toBe('EUR');
    expect(rule.taxFreeAllowance).toBe(11604);
  });
});

// ── toCountryCode ────────────────────────────────────────────────────────────
describe('toCountryCode', () => {
  it('normalizes a free-text country to a code', () => {
    expect(toCountryCode('Armenia')).toBe('armenia');
    expect(toCountryCode('POLAND')).toBe('poland');
    expect(toCountryCode('uk')).toBe('uk');
  });

  it('returns undefined for unknown or missing countries', () => {
    expect(toCountryCode('atlantis')).toBeUndefined();
    expect(toCountryCode('')).toBeUndefined();
    expect(toCountryCode(undefined)).toBeUndefined();
    expect(toCountryCode(null)).toBeUndefined();
  });
});

// ── applyTaxRuleOverride ─────────────────────────────────────────────────────
describe('applyTaxRuleOverride', () => {
  const base = TAX_RULES.armenia;

  it('returns the base rule unchanged without an override', () => {
    expect(applyTaxRuleOverride(base, undefined)).toBe(base);
    expect(applyTaxRuleOverride(base, null)).toBe(base);
  });

  it('merges a partial override on top of the base rule', () => {
    const merged = applyTaxRuleOverride(base, { taxFreeAllowance: 100000 });

    expect(merged.currency).toBe('AMD'); // jurisdiction fields are kept
    expect(merged.taxFreeAllowance).toBe(100000);
    expect(merged.incomeTaxBrackets).toEqual(base.incomeTaxBrackets);
    expect(merged.employeeContributions).toEqual(base.employeeContributions);
  });

  it('replaces incomeTaxBrackets when the override provides a non-empty array', () => {
    const brackets = [{ min: 0, rate: 0.25 }];
    const merged = applyTaxRuleOverride(base, { incomeTaxBrackets: brackets });

    expect(merged.incomeTaxBrackets).toBe(brackets);
  });

  it('keeps base brackets when the override array is empty', () => {
    const merged = applyTaxRuleOverride(base, { incomeTaxBrackets: [] });

    expect(merged.incomeTaxBrackets).toEqual(base.incomeTaxBrackets);
  });

  it('clears contributions when the override provides an empty array', () => {
    const merged = applyTaxRuleOverride(base, {
      employeeContributions: [],
      employerContributions: [],
    });

    expect(merged.employeeContributions).toEqual([]);
    expect(merged.employerContributions).toEqual([]);
  });

  it('keeps identity fields (code, label, currency, locale) from the base', () => {
    const merged = applyTaxRuleOverride(base, { taxFreeAllowance: 1 });
    expect(merged.code).toBe('armenia');
    expect(merged.label).toBe('Armenia');
    expect(merged.currency).toBe('AMD');
    expect(merged.locale).toBe('hy-AM');
  });
});
