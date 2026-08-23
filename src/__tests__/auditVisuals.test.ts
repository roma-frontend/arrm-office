/**
 * Tests for `@/components/audit/auditVisuals` — audit visual constants.
 */
import { describe, it, expect } from '@jest/globals';
import {
  SEVERITY_TONES,
  SEVERITY_ICONS,
  CATEGORY_ICONS,
  CATEGORY_LABEL_KEYS,
  CATEGORY_LABEL_FALLBACKS,
  SEVERITY_LABEL_FALLBACKS,
} from '@/components/audit/auditVisuals';
import { AUDIT_CATEGORIES, AUDIT_SEVERITIES } from '@/lib/audit/actionMeta';

describe('SEVERITY_TONES', () => {
  it('has entries for all 3 severities', () => {
    expect(Object.keys(SEVERITY_TONES)).toHaveLength(3);
  });

  it.each(AUDIT_SEVERITIES)('has badge, tile, accent, dot for %s', (severity) => {
    const tone = SEVERITY_TONES[severity];
    expect(tone.badge).toBeTruthy();
    expect(tone.tile).toBeTruthy();
    expect(tone.accent).toBeTruthy();
    expect(tone.dot).toBeTruthy();
  });
});

describe('SEVERITY_ICONS', () => {
  it.each(AUDIT_SEVERITIES)('has an icon for %s', (severity) => {
    expect(SEVERITY_ICONS[severity]).toBeDefined();
  });
});

describe('CATEGORY_ICONS', () => {
  it.each(AUDIT_CATEGORIES)('has an icon for %s', (category) => {
    expect(CATEGORY_ICONS[category]).toBeDefined();
  });
});

describe('CATEGORY_LABEL_KEYS', () => {
  it.each(AUDIT_CATEGORIES)('has a translation key for %s', (category) => {
    expect(CATEGORY_LABEL_KEYS[category]).toContain('audit.categories.');
  });
});

describe('CATEGORY_LABEL_FALLBACKS', () => {
  it.each(AUDIT_CATEGORIES)('has an English fallback for %s', (category) => {
    expect(typeof CATEGORY_LABEL_FALLBACKS[category]).toBe('string');
    expect(CATEGORY_LABEL_FALLBACKS[category].length).toBeGreaterThan(0);
  });
});

describe('SEVERITY_LABEL_FALLBACKS', () => {
  it('has all 3 severities', () => {
    expect(Object.keys(SEVERITY_LABEL_FALLBACKS)).toHaveLength(3);
  });

  it('critical maps to Critical', () => {
    expect(SEVERITY_LABEL_FALLBACKS.critical).toBe('Critical');
  });
});
