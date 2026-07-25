/**
 * Tests for documentCatalog.ts — template data + query functions.
 */
import {
  CATALOG,
  getCatalogTemplate,
  localizedContent,
  CATEGORY_LABELS,
  ACCENT_HEX,
} from '@/lib/documentCatalog';

describe('CATALOG data', () => {
  it('has all 8 templates', () => {
    expect(CATALOG.length).toBe(8);
  });

  it('all templates have required fields', () => {
    for (const tpl of CATALOG) {
      expect(tpl.id).toBeDefined();
      expect(tpl.category).toMatch(/^(certificate|hiring|consent|order)$/);
      expect(tpl.accent).toMatch(/^(blue|slate|emerald|burgundy)$/);
      expect(typeof tpl.signature).toBe('boolean');
      expect(tpl.locales.en).toBeDefined();
      expect(tpl.locales.ru).toBeDefined();
      expect(tpl.locales.de).toBeDefined();
      expect(tpl.locales.hy).toBeDefined();
    }
  });

  it('each locale has title and body', () => {
    for (const tpl of CATALOG) {
      const locales = ['en', 'ru', 'de', 'hy'] as const;
      for (const locale of locales) {
        expect(tpl.locales[locale].title).toBeDefined();
        expect(tpl.locales[locale].body).toBeDefined();
      }
    }
  });

  it('has unique ids', () => {
    const ids = CATALOG.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has at least one template per category', () => {
    const categories = CATALOG.map((t) => t.category);
    expect(categories.filter((c) => c === 'certificate').length).toBeGreaterThan(0);
    expect(categories.filter((c) => c === 'hiring').length).toBeGreaterThan(0);
    expect(categories.filter((c) => c === 'consent').length).toBeGreaterThan(0);
    expect(categories.filter((c) => c === 'order').length).toBeGreaterThan(0);
  });
});

describe('getCatalogTemplate', () => {
  it('returns template for valid id', () => {
    const tpl = getCatalogTemplate('employment-verification');
    expect(tpl).toBeDefined();
    expect(tpl!.id).toBe('employment-verification');
  });

  it('returns undefined for unknown id', () => {
    expect(getCatalogTemplate('nonexistent')).toBeUndefined();
  });

  it('finds all templates by id', () => {
    for (const tpl of CATALOG) {
      expect(getCatalogTemplate(tpl.id)).toBeDefined();
    }
  });
});

describe('localizedContent', () => {
  it('returns English content for en', () => {
    const tpl = CATALOG[0];
    const content = localizedContent(tpl, 'en');
    expect(content.title).toBe(tpl.locales.en.title);
  });

  it('returns Russian content for ru', () => {
    const tpl = CATALOG[0];
    const content = localizedContent(tpl, 'ru');
    expect(content.title).toBe(tpl.locales.ru.title);
  });

  it('returns German content for de', () => {
    const tpl = CATALOG[0];
    const content = localizedContent(tpl, 'de');
    expect(content.title).toBe(tpl.locales.de.title);
  });

  it('returns Armenian content for hy', () => {
    const tpl = CATALOG[0];
    const content = localizedContent(tpl, 'hy');
    expect(content.title).toBe(tpl.locales.hy.title);
  });

  it('falls back to English for unknown locale', () => {
    const tpl = CATALOG[0];
    const content = localizedContent(tpl, 'fr' as any);
    expect(content.title).toBe(tpl.locales.en.title);
  });
});

describe('CATEGORY_LABELS', () => {
  it('has labels for all categories in all locales', () => {
    const categories = ['certificate', 'hiring', 'consent', 'order'] as const;
    const locales = ['en', 'ru', 'de', 'hy'] as const;
    for (const cat of categories) {
      for (const loc of locales) {
        expect(CATEGORY_LABELS[cat][loc]).toBeDefined();
      }
    }
  });
});

describe('ACCENT_HEX', () => {
  it('returns hex colors for all accents', () => {
    expect(ACCENT_HEX.blue).toMatch(/^#[0-9a-f]{6}$/);
    expect(ACCENT_HEX.slate).toMatch(/^#[0-9a-f]{6}$/);
    expect(ACCENT_HEX.emerald).toMatch(/^#[0-9a-f]{6}$/);
    expect(ACCENT_HEX.burgundy).toMatch(/^#[0-9a-f]{6}$/);
  });
});
