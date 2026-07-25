/**
 * Tests for document catalog (src/lib/documentCatalog.ts)
 * Tests: CATALOG, getCatalogTemplate, localizedContent,
 *        CATEGORY_LABELS, CATEGORY_ORDER, ACCENT_HEX
 */

import {
  CATALOG,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  ACCENT_HEX,
  getCatalogTemplate,
  localizedContent,
} from '@/lib/documentCatalog';

describe('CATALOG', () => {
  it('contains 8 templates (all categories)', () => {
    expect(CATALOG.length).toBe(8);
  });

  it('every template has required fields', () => {
    CATALOG.forEach((template) => {
      expect(template.id).toBeDefined();
      expect(template.category).toBeDefined();
      expect(template.accent).toBeDefined();
      expect(typeof template.signature).toBe('boolean');
      expect(template.locales).toBeDefined();
    });
  });

  it('every template has en locale as fallback', () => {
    CATALOG.forEach((template) => {
      expect(template.locales.en).toBeDefined();
      expect(template.locales.en.title).toBeDefined();
      expect(template.locales.en.body).toBeDefined();
    });
  });

  it('every template has ru, hy, de locales', () => {
    CATALOG.forEach((template) => {
      expect(template.locales.ru).toBeDefined();
      expect(template.locales.hy).toBeDefined();
      expect(template.locales.de).toBeDefined();
    });
  });

  it('all templates have unique ids', () => {
    const ids = CATALOG.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all body contents contain merge tokens', () => {
    CATALOG.forEach((template) => {
      ['en', 'ru', 'hy', 'de'].forEach((lang) => {
        const locale = template.locales[lang as keyof typeof template.locales];
        if (locale) {
          expect(locale.body).toContain('{{');
        }
      });
    });
  });
});

describe('CATEGORY_ORDER', () => {
  it('defines expected categories in order', () => {
    expect(CATEGORY_ORDER).toEqual(['certificate', 'hiring', 'consent', 'order']);
  });

  it('every category has at least one template', () => {
    CATEGORY_ORDER.forEach((category) => {
      const count = CATALOG.filter((t) => t.category === category).length;
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('CATEGORY_LABELS', () => {
  it('has labels for all categories', () => {
    CATEGORY_ORDER.forEach((category) => {
      expect(CATEGORY_LABELS[category]).toBeDefined();
    });
  });

  it('has labels in all 4 languages', () => {
    const langs = ['en', 'ru', 'de', 'hy'];
    CATEGORY_ORDER.forEach((category) => {
      langs.forEach((lang) => {
        expect(
          CATEGORY_LABELS[category][lang as keyof (typeof CATEGORY_LABELS)['certificate']],
        ).toBeDefined();
        expect(
          CATEGORY_LABELS[category][lang as keyof (typeof CATEGORY_LABELS)['certificate']]!.length,
        ).toBeGreaterThan(0);
      });
    });
  });

  it('all certificates are non-empty strings', () => {
    CATEGORY_ORDER.forEach((category) => {
      const labels = CATEGORY_LABELS[category];
      ['en', 'ru', 'de', 'hy'].forEach((lang) => {
        expect(labels[lang as keyof typeof labels]?.length).toBeGreaterThan(0);
      });
    });
  });
});

describe('ACCENT_HEX', () => {
  it('defines all 4 accent colors', () => {
    expect(Object.keys(ACCENT_HEX)).toHaveLength(4);
  });

  it('all colors are valid hex codes', () => {
    Object.values(ACCENT_HEX).forEach((hex) => {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  it('has expected colors', () => {
    expect(ACCENT_HEX.blue).toBe('#1d4ed8');
    expect(ACCENT_HEX.slate).toBe('#334155');
    expect(ACCENT_HEX.emerald).toBe('#047857');
    expect(ACCENT_HEX.burgundy).toBe('#9f1239');
  });
});

describe('getCatalogTemplate', () => {
  it('finds existing template by id', () => {
    CATALOG.forEach((template) => {
      expect(getCatalogTemplate(template.id)).toBeDefined();
      expect(getCatalogTemplate(template.id)!.id).toBe(template.id);
    });
  });

  it('returns undefined for non-existent id', () => {
    expect(getCatalogTemplate('non-existent')).toBeUndefined();
    expect(getCatalogTemplate('')).toBeUndefined();
  });

  it('is case-sensitive', () => {
    if (CATALOG[0]) {
      expect(getCatalogTemplate(CATALOG[0].id.toUpperCase())).toBeUndefined();
    }
  });
});

describe('localizedContent', () => {
  it('returns English content for en locale', () => {
    const template = CATALOG[0]!;
    const content = localizedContent(template, 'en');
    expect(content.title).toBe(template.locales.en.title);
    expect(content.body).toBe(template.locales.en.body);
  });

  it('returns locale-specific content for each locale', () => {
    const template = CATALOG[0]!;
    const langs = ['ru', 'hy', 'de'] as const;
    langs.forEach((lang) => {
      const content = localizedContent(template, lang);
      expect(content.title).toBe(template.locales[lang].title);
    });
  });

  it('falls back to English for unsupported locale', () => {
    const template = CATALOG[0]!;
    const content = localizedContent(template, 'fr' as any);
    expect(content.title).toBe(template.locales.en.title);
  });
});
