/**
 * Tests for the multi-locale document engine.
 *
 * The properties worth pinning down are the ones the hiring packet got wrong and
 * this module exists to fix: that two columns cannot drift apart, that a missing
 * translation stays visible instead of shifting the rows below it, that a
 * full-width segment interrupts the split rather than breaking it, and that a
 * document frozen by the old packet code still parses.
 */
import { describe, it, expect } from '@jest/globals';

import {
  applySignaturesToBlocks,
  auditSegments,
  blockToText,
  collectSignaturesInOrder,
  buildDocumentBlocks,
  createSegment,
  documentFileName,
  documentTitle,
  encodeDocumentContent,
  isBilingualPair,
  LOCALE_CAPTIONS,
  MISSING_TRANSLATION,
  parseDocumentContent,
  parseTemplateBodyToBlocks,
  segmentsFromBodies,
  segmentToBlock,
  splitLabelValue,
  type DocumentSegment,
  type FrozenDocument,
} from '../lib/bilingualDocument';
import type { DocumentBilingualBlock, DocumentBlock, DocumentLabels } from '../lib/exportDocument';
import type { MergeSourceData } from '../lib/documentTokens';

const labels: DocumentLabels = {
  signature: 'Signature',
  name: 'Name',
  position: 'Position',
  date: 'Date',
  generatedOn: 'Generated on',
  integrity: 'Integrity',
};

const mergeData: MergeSourceData = {
  employee: { name: 'Anna Petrosyan', position: 'Developer' },
  organization: { name: 'Strata LLC' },
  signatory: { name: 'Boss', position: 'CEO' },
  now: Date.UTC(2026, 0, 15),
};

function segment(
  id: string,
  kind: DocumentSegment['kind'],
  hy: string,
  ru?: string,
  extra: Partial<DocumentSegment> = {},
): DocumentSegment {
  return { id, kind, text: { hy, ...(ru === undefined ? {} : { ru }) }, ...extra };
}

/** First bilingual block of a body, for column assertions. */
function bilingualOf(blocks: DocumentBlock[]): DocumentBilingualBlock {
  const found = blocks.find((b): b is DocumentBilingualBlock => b.type === 'bilingual');
  if (!found) throw new Error('no bilingual block in body');
  return found;
}

describe('locale pair', () => {
  it('treats a missing or identical secondary language as monolingual', () => {
    expect(isBilingualPair({ primary: 'hy' })).toBe(false);
    expect(isBilingualPair({ primary: 'hy', secondary: null })).toBe(false);
    expect(isBilingualPair({ primary: 'hy', secondary: 'hy' })).toBe(false);
    expect(isBilingualPair({ primary: 'hy', secondary: 'ru' })).toBe(true);
  });

  it('accepts any language as the mandatory column', () => {
    const segments = [segment('a', 'paragraph', 'Հայերեն', 'Русский')];

    const armenianFirst = bilingualOf(
      buildDocumentBlocks({ segments, locales: { primary: 'hy', secondary: 'ru' }, labels }),
    );
    expect(armenianFirst.leftLabel).toBe(LOCALE_CAPTIONS.hy);
    expect(armenianFirst.rightLabel).toBe(LOCALE_CAPTIONS.ru);

    // The point of the extraction: Russian can be the binding column instead.
    const russianFirst = bilingualOf(
      buildDocumentBlocks({ segments, locales: { primary: 'ru', secondary: 'hy' }, labels }),
    );
    expect(russianFirst.leftLabel).toBe(LOCALE_CAPTIONS.ru);
    expect(russianFirst.left[0]).toEqual({ type: 'paragraph', text: 'Русский' });
  });
});

describe('column alignment', () => {
  it('keeps one row per segment on both sides', () => {
    const segments = [
      segment('1', 'section', 'ՊԱՅՄԱՆԱԳԻՐ', 'ДОГОВОР'),
      segment('2', 'paragraph', 'Առաջին', 'Первый'),
      segment('3', 'bullets', '- Ա\n- Բ', '- А\n- Б'),
    ];
    const block = bilingualOf(
      buildDocumentBlocks({ segments, locales: { primary: 'hy', secondary: 'ru' }, labels }),
    );

    expect(block.left).toHaveLength(3);
    expect(block.right).toHaveLength(3);
    expect(block.left.map((b) => b.type)).toEqual(block.right.map((b) => b.type));
  });

  it('marks a missing translation instead of shifting the rows below it', () => {
    const segments = [
      segment('1', 'paragraph', 'Առաջին', 'Первый'),
      segment('2', 'paragraph', 'Երկրորդ'), // no Russian
      segment('3', 'paragraph', 'Երրորդ', 'Третий'),
    ];
    const block = bilingualOf(
      buildDocumentBlocks({ segments, locales: { primary: 'hy', secondary: 'ru' }, labels }),
    );

    expect(block.right[1]).toEqual({ type: 'paragraph', text: MISSING_TRANSLATION, muted: true });
    // Row 3 still pairs with row 3 — the drift this module was written to prevent.
    expect(block.right[2]).toEqual({ type: 'paragraph', text: 'Третий' });
    expect(block.left).toHaveLength(block.right.length);
  });
});

describe('full-width segments', () => {
  it('interrupts the two-column run and resumes it afterwards', () => {
    const segments = [
      segment('1', 'paragraph', 'Առաջին', 'Первый'),
      segment('2', 'fields', 'Գումար: 1000', 'Сумма: 1000', { fullWidth: true }),
      segment('3', 'paragraph', 'Երրորդ', 'Третий'),
    ];
    const blocks = buildDocumentBlocks({
      segments,
      locales: { primary: 'hy', secondary: 'ru' },
      labels,
    });

    expect(blocks.map((b) => b.type)).toEqual(['bilingual', 'fields', 'fields', 'bilingual']);
    const [first, , , last] = blocks;
    expect((first as DocumentBilingualBlock).left).toHaveLength(1);
    expect((last as DocumentBilingualBlock).left).toHaveLength(1);
  });

  it('prints only the primary language when there is no translation', () => {
    const segments = [segment('1', 'callout', 'Ծանոթություն', undefined, { fullWidth: true })];
    const blocks = buildDocumentBlocks({
      segments,
      locales: { primary: 'hy', secondary: 'ru' },
      labels,
    });
    expect(blocks).toEqual([{ type: 'callout', text: 'Ծանոթություն' }]);
  });
});

describe('monolingual output', () => {
  it('emits plain blocks with no bilingual wrapper', () => {
    const segments: DocumentSegment[] = [
      { id: '1', kind: 'section', text: { en: 'ORDER' } },
      { id: '2', kind: 'paragraph', text: { en: 'Body text' } },
    ];
    const blocks = buildDocumentBlocks({ segments, locales: { primary: 'en' }, labels });
    expect(blocks.map((b) => b.type)).toEqual(['section', 'paragraph']);
    expect(blocks[1]).toEqual({ type: 'paragraph', text: 'Body text' });
  });

  it('marks the primary language as missing when only another one is authored', () => {
    const segments = [segment('1', 'paragraph', 'Միայն հայերեն')];
    const blocks = buildDocumentBlocks({ segments, locales: { primary: 'en' }, labels });
    expect(blocks[0]).toEqual({ type: 'paragraph', text: MISSING_TRANSLATION, muted: true });
  });
});

describe('segment rendering', () => {
  it('maps each kind onto its block type', () => {
    expect(segmentToBlock(segment('a', 'section', '3. DUTIES'), 'hy')).toEqual({
      type: 'section',
      title: 'DUTIES',
      index: 3,
    });
    expect(segmentToBlock(segment('a', 'bullets', '- one\n* two\n• three'), 'hy')).toEqual({
      type: 'bullets',
      items: ['one', 'two', 'three'],
    });
    expect(segmentToBlock(segment('a', 'callout', 'Note'), 'hy')).toEqual({
      type: 'callout',
      text: 'Note',
    });
  });

  it('reads Armenian label separators in a fields segment', () => {
    // U+055D is Armenian's colon equivalent; without it the row would not split.
    expect(segmentToBlock(segment('a', 'fields', 'Անուն\u055D Աննա'), 'hy')).toEqual({
      type: 'fields',
      rows: [{ label: 'Անուն', value: 'Աննա' }],
    });
    expect(splitLabelValue('Name: Anna')).toEqual({ label: 'Name', value: 'Anna' });
    expect(splitLabelValue('no separator here')).toBeNull();
  });

  it('falls back to prose when a fields segment has no separators', () => {
    expect(segmentToBlock(segment('a', 'fields', 'just text'), 'hy')).toEqual({
      type: 'paragraph',
      text: 'just text',
    });
  });

  it('resolves merge tokens per language when data is supplied', () => {
    const segments = [segment('1', 'paragraph', '{{employee.fullName}}', '{{employee.fullName}}')];
    const withData = bilingualOf(
      buildDocumentBlocks({
        segments,
        locales: { primary: 'hy', secondary: 'ru' },
        labels,
        data: mergeData,
      }),
    );
    expect(withData.left[0]).toEqual({ type: 'paragraph', text: 'Anna Petrosyan' });

    // Without data the editor must show the token itself, not a blank.
    const withoutData = bilingualOf(
      buildDocumentBlocks({ segments, locales: { primary: 'hy', secondary: 'ru' }, labels }),
    );
    expect(withoutData.left[0]).toEqual({ type: 'paragraph', text: '{{employee.fullName}}' });
  });
});

describe('signature grid', () => {
  const segments = [segment('1', 'paragraph', 'Text', 'Текст')];
  const parties = [
    { id: 'recipient', name: 'Anna Petrosyan' },
    { id: 'issuer', name: 'Boss', position: 'CEO', role: 'Employer' },
  ];

  it('is appended at top level with stable party ids', () => {
    const blocks = buildDocumentBlocks({
      segments,
      locales: { primary: 'hy', secondary: 'ru' },
      labels,
      parties,
    });
    const grid = blocks.at(-1);
    expect(grid?.type).toBe('signatures');
    if (grid?.type !== 'signatures') throw new Error('unreachable');
    expect(grid.parties.map((p) => p.id)).toEqual(['recipient', 'issuer']);
    expect(grid.parties[0]?.role).toBe(labels.signature);
    expect(grid.parties[1]?.position).toBe('CEO');
  });

  it('is omitted for the editable Word export', () => {
    const blocks = buildDocumentBlocks({
      segments,
      locales: { primary: 'hy', secondary: 'ru' },
      labels,
      parties,
      omitSignatures: true,
    });
    expect(blocks.some((b) => b.type === 'signatures')).toBe(false);
  });

  it('matches collected signatures by party id, not position', () => {
    const blocks = buildDocumentBlocks({
      segments,
      locales: { primary: 'hy', secondary: 'ru' },
      labels,
      parties,
    });
    // Deliberately out of order: the employer signed first.
    const signed = applySignaturesToBlocks(
      blocks,
      [
        { partyId: 'issuer', signatureData: 'data:image/png;base64,BOSS', signedAt: 1 },
        { partyId: 'recipient', signatureData: 'data:image/png;base64,ANNA', signedAt: 2 },
      ],
      () => '15.01.2026',
    );
    const grid = signed.at(-1);
    if (grid?.type !== 'signatures') throw new Error('unreachable');
    expect(grid.parties[0]?.signatureImage).toContain('ANNA');
    expect(grid.parties[1]?.signatureImage).toContain('BOSS');
    expect(grid.parties[0]?.date).toBe('15.01.2026');
  });

  it('falls back to signing order for documents frozen without party ids', () => {
    const legacy: DocumentBlock[] = [
      {
        type: 'signatures',
        parties: [
          { role: 'Employee', nameLabel: 'Name', name: 'Anna', dateLabel: 'Date' },
          { role: 'Employer', nameLabel: 'Name', name: 'Boss', dateLabel: 'Date' },
        ],
      },
    ];
    const signed = applySignaturesToBlocks(
      legacy,
      [{ signatureData: 'first' }, { signatureData: 'second' }],
      () => 'x',
    );
    const grid = signed[0];
    if (grid?.type !== 'signatures') throw new Error('unreachable');
    expect(grid.parties[0]?.signatureImage).toBe('first');
    expect(grid.parties[1]?.signatureImage).toBe('second');
  });
});

describe('collectSignaturesInOrder', () => {
  it('returns the signatures in signing order regardless of row order', () => {
    expect(
      collectSignaturesInOrder([
        { status: 'signed', order: 2, signerName: 'Boss', signatureData: 'b', signedAt: 20 },
        { status: 'signed', order: 1, signerName: 'Anna', signatureData: 'a', signedAt: 10 },
      ]),
    ).toEqual([
      { signerName: 'Anna', signatureData: 'a', signedAt: 10 },
      { signerName: 'Boss', signatureData: 'b', signedAt: 20 },
    ]);
  });

  it('keeps an empty slot for a request nobody has signed yet', () => {
    // Compacting this away would hand the employer's signature to the employee's
    // box, because the grid pairs signatures with parties by index.
    const collected = collectSignaturesInOrder([
      { status: 'pending', order: 1, signerName: 'Anna' },
      { status: 'signed', order: 2, signerName: 'Boss', signatureData: 'b', signedAt: 20 },
    ]);

    expect(collected).toEqual([{}, { signerName: 'Boss', signatureData: 'b', signedAt: 20 }]);

    const grid = applySignaturesToBlocks(
      [
        {
          type: 'signatures',
          parties: [
            { role: 'Employee', nameLabel: 'Name', name: 'Anna', dateLabel: 'Date' },
            { role: 'Employer', nameLabel: 'Name', name: 'Boss', dateLabel: 'Date' },
          ],
        },
      ],
      collected,
      () => 'x',
    )[0];
    if (grid?.type !== 'signatures') throw new Error('unreachable');
    expect(grid.parties[0]?.signatureImage).toBeUndefined();
    expect(grid.parties[1]?.signatureImage).toBe('b');
  });

  it('returns nothing for a document with no requests', () => {
    expect(collectSignaturesInOrder(undefined)).toEqual([]);
    expect(collectSignaturesInOrder([])).toEqual([]);
  });
});

describe('frozen content', () => {
  const payload: FrozenDocument = {
    version: 2,
    source: 'blueprint',
    blueprintId: 'bp1',
    blueprintVersion: 3,
    title: 'Contract',
    blocks: [{ type: 'paragraph', text: 'Text' }],
    accent: 'blue',
    orgName: 'Strata LLC',
    primaryLocale: 'hy',
    secondaryLocale: 'ru',
    labels,
  };

  it('survives a round trip', () => {
    const parsed = parseDocumentContent(encodeDocumentContent(payload));
    expect(parsed).toEqual(payload);
  });

  it('still reads a body frozen by the hiring packet', () => {
    // Version 1 payloads carry the same shape behind the old `__HP__` sentinel;
    // already-signed documents must keep rendering without a migration.
    const legacy =
      '__HP__' +
      JSON.stringify({
        version: 1,
        templateId: 'employment-contract',
        title: 'Contract',
        blocks: [{ type: 'paragraph', text: 'Old' }],
        accent: 'slate',
        orgName: 'Strata LLC',
        primaryLocale: 'hy',
        secondaryLocale: 'ru',
        labels,
      });
    const parsed = parseDocumentContent(legacy);
    expect(parsed?.source).toBe('catalog');
    expect(parsed?.templateId).toBe('employment-contract');
    expect(parsed?.blocks).toHaveLength(1);
  });

  it('returns null for plain text and malformed payloads', () => {
    expect(parseDocumentContent('Dear employee, ...')).toBeNull();
    expect(parseDocumentContent('__DOC__{not json')).toBeNull();
    expect(parseDocumentContent('__DOC__{"title":"x"}')).toBeNull();
  });
});

describe('importing existing bodies', () => {
  it('zips one body per locale into segments', () => {
    const { segments, warnings } = segmentsFromBodies(
      {
        hy: 'ՊԱՅՄԱՆԱԳԻՐ\n\nԱռաջին կարգ։\n\n- Ա\n- Բ',
        ru: 'ДОГОВОР\n\nПервый пункт.\n\n- А\n- Б',
      },
      'hy',
    );

    expect(warnings).toEqual([]);
    expect(segments).toHaveLength(3);
    expect(segments[0]?.kind).toBe('section');
    expect(segments[0]?.text).toEqual({ hy: 'ՊԱՅՄԱՆԱԳԻՐ', ru: 'ДОГОВОР' });
    expect(segments[2]?.kind).toBe('bullets');
    expect(segments[2]?.text.ru).toBe('- А\n- Б');
    expect(new Set(segments.map((s) => s.id)).size).toBe(3);
  });

  it('reports a length mismatch instead of padding it away', () => {
    const { segments, warnings } = segmentsFromBodies({ hy: 'Ա\n\nԲ\n\nԳ', ru: 'А\n\nБ' }, 'hy');
    expect(segments).toHaveLength(3);
    expect(segments[2]?.text.ru).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('2 blocks vs 3');
  });

  it('round-trips a block through text and back', () => {
    const blocks = parseTemplateBodyToBlocks(
      'TITLE\n\nSome prose here.\n\nName: Anna\nCity: Yerevan',
    );
    expect(blocks.map((b) => b.type)).toEqual(['section', 'paragraph', 'fields']);
    const asText = blocks.map(blockToText);
    expect(asText[2]).toEqual({ kind: 'fields', text: 'Name: Anna\nCity: Yerevan' });
    expect(segmentToBlock(createSegmentFrom(asText[2]!), 'en')).toEqual(blocks[2]);
  });
});

function createSegmentFrom({
  kind,
  text,
}: {
  kind: DocumentSegment['kind'];
  text: string;
}): DocumentSegment {
  const created = createSegment(kind, { en: text });
  return created;
}

describe('authoring audit', () => {
  it('lists segments missing a translation and unknown tokens', () => {
    const segments = [
      segment('1', 'paragraph', 'Ա {{employee.fullName}}', 'А {{employee.fullName}}'),
      segment('2', 'paragraph', 'Բ {{employee.nickname}}'),
    ];
    const audit = auditSegments(segments, { primary: 'hy', secondary: 'ru' }, { hy: 'Վերնագիր' });

    expect(audit.missing).toEqual(['2']);
    expect(audit.unknownTokens).toEqual(['employee.nickname']);
    expect(audit.usedTokens).toContain('employee.fullName');
  });

  it('ignores the secondary language when the document is monolingual', () => {
    const segments = [segment('1', 'paragraph', 'Միայն հայերեն')];
    expect(auditSegments(segments, { primary: 'hy' }).missing).toEqual([]);
  });
});

describe('titles and file names', () => {
  it('prints both languages when bilingual', () => {
    const titles = { hy: 'ՊԱՅՄԱՆԱԳԻՐ', ru: 'ДОГОВОР' };
    expect(documentTitle(titles, { primary: 'hy', secondary: 'ru' })).toBe('ՊԱՅՄԱՆԱԳԻՐ / ДОГОВОР');
    expect(documentTitle(titles, { primary: 'hy' })).toBe('ՊԱՅՄԱՆԱԳԻՐ');
    expect(documentTitle({ ru: 'ДОГОВОР' }, { primary: 'hy', secondary: 'ru' })).toBe('ДОГОВОР');
    expect(documentTitle({}, { primary: 'hy' })).toBe('');
  });

  it('resolves tokens in the title', () => {
    expect(
      documentTitle({ en: 'Contract with {{employee.fullName}}' }, { primary: 'en' }, mergeData),
    ).toBe('Contract with Anna Petrosyan');
  });

  it('builds a filesystem-safe download name', () => {
    expect(documentFileName('Employment contract', 'Anna Petrosyan', 'pdf')).toBe(
      'Employment_contract_Anna_Petrosyan.pdf',
    );
    expect(documentFileName('', '', 'docx')).toBe('document_recipient.docx');
    expect(documentFileName('Order #12/б', 'Աննա', 'pdf')).toBe('Order_12б_Աննա.pdf');
  });
});
