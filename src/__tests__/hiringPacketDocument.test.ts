/**
 * Hiring packet document assembly.
 *
 * The critical invariant is column alignment: the Armenian body and its
 * translation must parse into the SAME number of blocks in the SAME order, or
 * the two columns of the printed A4 page drift apart and clause 3 in Armenian
 * ends up next to clause 5 in Russian.
 */
import { DEFAULT_HIRING_PACKET, getCatalogTemplate, localizedContent } from '@/lib/documentCatalog';
import {
  LOCALE_CAPTIONS,
  PRIMARY_LOCALE,
  applySignaturesToBlocks,
  buildBilingualBlocks,
  encodeHiringPacketContent,
  hiringPacketFileName,
  hiringPacketTitle,
  isHiringPacketContent,
  parseHiringPacketContent,
  parseTemplateBodyToBlocks,
} from '@/lib/hiringPacketDocument';
import type { MergeSourceData } from '@/lib/documentTokens';
import type { DocumentBlock, DocumentLabels } from '@/lib/exportDocument';

const labels: DocumentLabels = {
  signature: 'Ստորագրություն',
  name: 'Անուն',
  position: 'Պաշտոն',
  date: 'Ամսաթիվ',
  generatedOn: 'Ստեղծված',
  integrity: 'Ամբողջականություն',
};

const data: MergeSourceData = {
  employee: {
    name: 'Աննա Պետրոսյան',
    email: 'anna@example.com',
    phone: '+374 10 000000',
    department: 'Engineering',
    position: 'Engineer',
    dateOfBirth: '1994-05-12',
    nationality: 'Armenian',
    passportNumber: 'AN1234567',
    passportIssuedBy: 'Police of RA',
    passportIssueDate: '2019-03-14',
    socialCardNumber: '1234567890',
    baseSalary: 500000,
    salaryCurrency: 'AMD',
    hireDate: Date.UTC(2026, 7, 1),
  },
  organization: { name: 'Caron LLC', country: 'Armenia', industry: 'Software' },
  signatory: { name: 'Roman G', position: 'HR Director' },
  now: Date.UTC(2026, 7, 5),
};

function bilingualOf(blocks: DocumentBlock[]) {
  const block = blocks.find((b) => b.type === 'bilingual');
  if (block?.type !== 'bilingual') throw new Error('expected a bilingual block');
  return block;
}

describe('parseTemplateBodyToBlocks', () => {
  it('reads an all-caps standalone line as a section', () => {
    const blocks = parseTemplateBodyToBlocks('ORDER\n\nSome prose follows.');
    expect(blocks[0]).toEqual({ type: 'section', title: 'ORDER' });
    expect(blocks[1]).toEqual({ type: 'paragraph', text: 'Some prose follows.' });
  });

  it('extracts the ordinal from a numbered heading', () => {
    const blocks = parseTemplateBodyToBlocks('2. DUTIES');
    expect(blocks[0]).toEqual({ type: 'section', title: 'DUTIES', index: 2 });
  });

  it('groups dash-prefixed lines into a bullet list', () => {
    const blocks = parseTemplateBodyToBlocks('- first\n- second\n- third');
    expect(blocks).toEqual([{ type: 'bullets', items: ['first', 'second', 'third'] }]);
  });

  it('keeps numbered clauses as separate paragraphs', () => {
    const blocks = parseTemplateBodyToBlocks('1. Hire the employee.\n2. Set the salary.');
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.type === 'paragraph')).toBe(true);
  });

  it('reads a label/value group as a definition table', () => {
    const blocks = parseTemplateBodyToBlocks('Position: Engineer\nDepartment: R&D');
    expect(blocks[0]).toEqual({
      type: 'fields',
      rows: [
        { label: 'Position', value: 'Engineer' },
        { label: 'Department', value: 'R&D' },
      ],
    });
  });

  it('recognises the Armenian "but" mark as a label separator', () => {
    // U+055D is what Armenian text uses where Latin text uses a colon. Without
    // this the Armenian column would parse as prose while the translation parsed
    // as a table, and the columns would fall out of alignment.
    const blocks = parseTemplateBodyToBlocks('Պաշտոն՝ Ինժեներ\nԲաժին՝ R&D');
    expect(blocks[0]).toEqual({
      type: 'fields',
      rows: [
        { label: 'Պաշտոն', value: 'Ինժեներ' },
        { label: 'Բաժին', value: 'R&D' },
      ],
    });
  });

  it('joins a multi-line prose group into one paragraph', () => {
    const blocks = parseTemplateBodyToBlocks('This clause spans\ntwo source lines.');
    expect(blocks).toEqual([{ type: 'paragraph', text: 'This clause spans two source lines.' }]);
  });

  it('ignores blank lines', () => {
    expect(parseTemplateBodyToBlocks('\n\n\n')).toEqual([]);
  });
});

describe('buildBilingualBlocks — column alignment', () => {
  it.each(DEFAULT_HIRING_PACKET.map((id) => [id]))(
    'produces equal-length columns for %s in every language pair',
    (templateId) => {
      const template = getCatalogTemplate(templateId as string);
      expect(template).toBeDefined();

      for (const secondaryLocale of ['ru', 'en', 'de'] as const) {
        const blocks = buildBilingualBlocks({
          template: template!,
          data,
          secondaryLocale,
          labels,
          employeeName: 'Աննա Պետրոսյան',
        });
        const bilingual = bilingualOf(blocks);
        expect(bilingual.left.length).toBe(bilingual.right.length);
        expect(bilingual.left.length).toBeGreaterThan(0);
      }
    },
  );

  it.each(DEFAULT_HIRING_PACKET.map((id) => [id]))(
    'pairs blocks of the same type for %s (hy ↔ ru)',
    (templateId) => {
      const template = getCatalogTemplate(templateId as string)!;
      const bilingual = bilingualOf(
        buildBilingualBlocks({
          template,
          data,
          secondaryLocale: 'ru',
          labels,
          employeeName: 'Աննա Պետրոսյան',
        }),
      );
      // A type mismatch means the two bodies were written with different
      // structure, which would misalign the printed columns.
      bilingual.left.forEach((leftBlock, index) => {
        expect(bilingual.right[index]?.type).toBe(leftBlock.type);
      });
    },
  );

  it('puts Armenian on the left and the translation on the right', () => {
    const template = getCatalogTemplate('employment-contract')!;
    const bilingual = bilingualOf(
      buildBilingualBlocks({
        template,
        data,
        secondaryLocale: 'ru',
        labels,
        employeeName: 'Աննա Պետրոսյան',
      }),
    );
    expect(JSON.stringify(bilingual.left)).toMatch(/[\u0530-\u058F]/);
    expect(JSON.stringify(bilingual.right)).toMatch(/[\u0410-\u044F]/);
    expect(bilingual.leftLabel).toBe(LOCALE_CAPTIONS[PRIMARY_LOCALE]);
    expect(bilingual.rightLabel).toBe(LOCALE_CAPTIONS.ru);
  });

  it('resolves merge tokens in both languages', () => {
    const template = getCatalogTemplate('employment-contract')!;
    const bilingual = bilingualOf(
      buildBilingualBlocks({
        template,
        data,
        secondaryLocale: 'ru',
        labels,
        employeeName: 'Աննա Պետրոսյան',
      }),
    );
    const all = JSON.stringify(bilingual);
    expect(all).toContain('Աննա Պետրոսյան');
    expect(all).toContain('Caron LLC');
    // No unresolved placeholders left behind.
    expect(all).not.toMatch(/\{\{/);
  });

  it('appends an empty two-party signature grid', () => {
    const blocks = buildBilingualBlocks({
      template: getCatalogTemplate('employment-contract')!,
      data,
      secondaryLocale: 'ru',
      labels,
      employeeName: 'Աննա Պետրոսյան',
      signatoryName: 'Roman G',
      signatoryPosition: 'HR Director',
    });
    const signatures = blocks.find((b) => b.type === 'signatures');
    if (signatures?.type !== 'signatures') throw new Error('expected signatures');
    expect(signatures.parties).toHaveLength(2);
    expect(signatures.parties[0]?.name).toBe('Աննա Պետրոսյան');
    // The grid is stored empty — signatures are applied at render time.
    expect(signatures.parties[0]?.signatureImage).toBeUndefined();
    expect(signatures.parties[0]?.date).toBeUndefined();
  });

  it('omits the signature grid for the editable Word export', () => {
    const blocks = buildBilingualBlocks({
      template: getCatalogTemplate('employment-contract')!,
      data,
      secondaryLocale: 'ru',
      labels,
      employeeName: 'Աննա Պետրոսյան',
      omitSignatures: true,
    });
    expect(blocks.some((b) => b.type === 'signatures')).toBe(false);
  });
});

describe('applySignaturesToBlocks', () => {
  const blocks: DocumentBlock[] = [
    { type: 'paragraph', text: 'body' },
    {
      type: 'signatures',
      parties: [
        { role: 'Employee', nameLabel: 'Name', name: '', dateLabel: 'Date' },
        { role: 'Employer', nameLabel: 'Name', name: '', dateLabel: 'Date' },
      ],
    },
  ];

  it('fills parties from the collected signatures in signing order', () => {
    const result = applySignaturesToBlocks(
      blocks,
      [
        { signerName: 'Anna', signatureData: 'data:image/png;base64,AAA', signedAt: 1 },
        { signerName: 'Roman', signatureData: 'data:image/png;base64,BBB', signedAt: 2 },
      ],
      (ts) => `formatted-${ts}`,
    );
    const signatures = result.find((b) => b.type === 'signatures');
    if (signatures?.type !== 'signatures') throw new Error('expected signatures');
    expect(signatures.parties[0]?.name).toBe('Anna');
    expect(signatures.parties[0]?.signatureImage).toBe('data:image/png;base64,AAA');
    expect(signatures.parties[0]?.date).toBe('formatted-1');
    expect(signatures.parties[1]?.name).toBe('Roman');
  });

  it('leaves parties untouched when nobody has signed', () => {
    const result = applySignaturesToBlocks(blocks, [], (ts) => String(ts));
    expect(result).toEqual(blocks);
  });

  it('leaves non-signature blocks alone', () => {
    const result = applySignaturesToBlocks(blocks, [{ signerName: 'Anna' }], String);
    expect(result[0]).toEqual({ type: 'paragraph', text: 'body' });
  });
});

describe('content codec', () => {
  const payload = {
    version: 1 as const,
    templateId: 'employment-contract',
    title: 'Աշխատանքային պայմանագիր / Трудовой договор',
    blocks: [{ type: 'paragraph', text: 'Պայմանագիր' }] as DocumentBlock[],
    accent: 'slate' as const,
    orgName: 'Caron LLC',
    documentNumber: 'HR-2026-001',
    primaryLocale: PRIMARY_LOCALE,
    secondaryLocale: 'ru' as const,
    labels,
  };

  it('round-trips a payload through encode/parse', () => {
    const encoded = encodeHiringPacketContent(payload);
    expect(isHiringPacketContent(encoded)).toBe(true);
    expect(parseHiringPacketContent(encoded)).toEqual(payload);
  });

  it('survives Armenian, Cyrillic and quotes in the content', () => {
    const tricky = {
      ...payload,
      title: 'Պայմանագիր «Caron» — Работник: "Анна"',
      blocks: [{ type: 'paragraph', text: 'Տողադարձ\nև «չակերտներ»' }] as DocumentBlock[],
    };
    expect(parseHiringPacketContent(encodeHiringPacketContent(tricky))).toEqual(tricky);
  });

  it('returns null for content that is not a packet', () => {
    expect(parseHiringPacketContent('Plain document text')).toBeNull();
    expect(parseHiringPacketContent('__MF__{"assetName":"Lenovo"}')).toBeNull();
    expect(isHiringPacketContent('Plain document text')).toBe(false);
  });

  it('returns null for a corrupted payload instead of throwing', () => {
    expect(parseHiringPacketContent('__HP__{not json')).toBeNull();
    expect(parseHiringPacketContent('__HP__{"version":1}')).toBeNull();
    expect(parseHiringPacketContent('__HP__null')).toBeNull();
  });
});

describe('titles and file names', () => {
  it('shows both languages in the title', () => {
    const title = hiringPacketTitle('employment-contract', data, 'ru');
    const template = getCatalogTemplate('employment-contract')!;
    expect(title).toContain(localizedContent(template, 'hy').title);
    expect(title).toContain(localizedContent(template, 'ru').title);
  });

  it('does not duplicate the title when the second language is Armenian', () => {
    const title = hiringPacketTitle('employment-contract', data, 'hy');
    expect(title).not.toContain('/');
  });

  it('falls back to the template id for an unknown template', () => {
    expect(hiringPacketTitle('does-not-exist', data, 'ru')).toBe('does-not-exist');
  });

  it('builds a safe file name and keeps non-Latin letters', () => {
    expect(hiringPacketFileName('employment-contract', 'Աննա Պետրոսյան', 'pdf')).toBe(
      'employment-contract_Աննա_Պետրոսյան.pdf',
    );
  });

  it('strips path separators from the file name', () => {
    const name = hiringPacketFileName('nda', '../../etc/passwd', 'docx');
    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
  });

  it('handles a missing employee name', () => {
    expect(hiringPacketFileName('nda', '', 'pdf')).toBe('nda_employee.pdf');
  });
});
