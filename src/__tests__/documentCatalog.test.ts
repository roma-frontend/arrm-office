/**
 * Tests for documentCatalog.ts — template data + query functions.
 */
import {
  CATALOG,
  getCatalogTemplate,
  localizedContent,
  CATEGORY_LABELS,
  ACCENT_HEX,
  DEFAULT_HIRING_PACKET,
  HIRING_PACKET_MANDATORY,
  isHiringPacketTemplate,
} from '@/lib/documentCatalog';
import { extractTokens } from '@/lib/documentTokens';
import {
  CATALOG_TEMPLATE_IDS,
  HIRING_PACKET_MANDATORY_IDS,
  HIRING_PACKET_TEMPLATE_IDS,
  isCatalogTemplateId,
} from '../../convex/lib/documentTemplateIds';

describe('CATALOG data', () => {
  it('has all 14 templates', () => {
    expect(CATALOG.length).toBe(14);
  });

  it('has unique template ids', () => {
    const ids = CATALOG.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
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

describe('hiring packet', () => {
  it('every packet id exists in the catalog', () => {
    for (const id of DEFAULT_HIRING_PACKET) {
      expect(getCatalogTemplate(id)).toBeDefined();
    }
  });

  it('every mandatory id is part of the default packet', () => {
    for (const id of HIRING_PACKET_MANDATORY) {
      expect(DEFAULT_HIRING_PACKET).toContain(id);
    }
  });

  it('has no duplicate entries', () => {
    expect(new Set(DEFAULT_HIRING_PACKET).size).toBe(DEFAULT_HIRING_PACKET.length);
  });

  it('isHiringPacketTemplate agrees with the list', () => {
    expect(isHiringPacketTemplate('employment-contract')).toBe(true);
    expect(isHiringPacketTemplate('termination-order')).toBe(false);
  });

  it('includes the documents needed to actually hire someone', () => {
    // Regression guard: the packet exists to replace the manual paperwork of
    // onboarding, so the contract, the hiring order and the data consent must
    // never silently drop out of it.
    expect(DEFAULT_HIRING_PACKET).toContain('employment-contract');
    expect(DEFAULT_HIRING_PACKET).toContain('employment-order');
    expect(DEFAULT_HIRING_PACKET).toContain('pdpa-consent');
  });

  it('packet templates all request a signature block', () => {
    for (const id of DEFAULT_HIRING_PACKET) {
      expect(getCatalogTemplate(id)?.signature).toBe(true);
    }
  });

  it('packet templates reference only known merge tokens in every locale', () => {
    for (const id of DEFAULT_HIRING_PACKET) {
      const tpl = getCatalogTemplate(id);
      expect(tpl).toBeDefined();
      for (const locale of ['en', 'ru', 'de', 'hy'] as const) {
        const { unknown } = extractTokens(tpl!.locales[locale].body);
        expect(unknown).toEqual([]);
      }
    }
  });

  it('every locale of a packet template is non-trivial and distinct', () => {
    for (const id of DEFAULT_HIRING_PACKET) {
      const tpl = getCatalogTemplate(id)!;
      const bodies = new Set<string>();
      for (const locale of ['en', 'ru', 'de', 'hy'] as const) {
        const { title, body } = tpl.locales[locale];
        expect(title.trim().length).toBeGreaterThan(3);
        expect(body.trim().length).toBeGreaterThan(80);
        bodies.add(body);
      }
      // A copy-pasted body across locales means a missing translation.
      expect(bodies.size).toBe(4);
    }
  });

  it('Armenian bodies of packet templates use Armenian script', () => {
    for (const id of DEFAULT_HIRING_PACKET) {
      const hy = getCatalogTemplate(id)!.locales.hy.body;
      expect(hy).toMatch(/[\u0530-\u058F]/);
    }
  });
});

describe('template id allowlist shared with the backend', () => {
  // `hiringPackets.generate` validates against `convex/lib/documentTemplateIds`,
  // which the Convex runtime can import while `documentCatalog` (with the actual
  // text) it cannot. If the two drift, the backend either rejects a legitimate
  // template or accepts one that cannot be rendered.
  it('lists exactly the ids the catalog defines', () => {
    expect([...CATALOG_TEMPLATE_IDS].sort()).toEqual(CATALOG.map((t) => t.id).sort());
  });

  it('accepts every catalog id and rejects anything else', () => {
    for (const template of CATALOG) {
      expect(isCatalogTemplateId(template.id)).toBe(true);
    }
    expect(isCatalogTemplateId('not-a-template')).toBe(false);
    expect(isCatalogTemplateId('')).toBe(false);
  });

  it('derives the packet from the shared list', () => {
    expect([...DEFAULT_HIRING_PACKET]).toEqual([...HIRING_PACKET_TEMPLATE_IDS]);
    expect([...HIRING_PACKET_MANDATORY]).toEqual([...HIRING_PACKET_MANDATORY_IDS]);
  });
});
