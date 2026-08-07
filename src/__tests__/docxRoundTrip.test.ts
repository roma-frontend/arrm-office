/**
 * Word round-trip tests.
 *
 * These deliberately use the REAL `docx` and `mammoth` libraries (no mocks):
 * the whole point is to prove that a document written by
 * `renderEditableDocxBlob` is recovered by `parseEditableDocx`. A mocked docx
 * would only test our own assumptions about the file format.
 */
import { renderEditableDocxBlob, type DocumentBlock } from '@/lib/exportDocument';
import { parseEditableDocx, DocxImportError } from '@/lib/docxRoundTrip';
import type { RenderableDocument } from '@/lib/exportDocument';

// Real docx rendering + mammoth parsing is CPU-heavy; the default 5s test
// timeout is too tight for a full round trip on a busy machine.
jest.setTimeout(60_000);

const labels = {
  signature: 'Signature',
  name: 'Name',
  position: 'Position',
  date: 'Date',
  generatedOn: 'Generated on',
  integrity: 'Integrity',
};

function docWith(body: DocumentBlock[]): RenderableDocument {
  return {
    title: 'Employment Contract',
    body,
    accent: 'slate',
    signature: true,
    orgName: 'Caron LLC',
    now: Date.UTC(2026, 7, 5),
    lang: 'hy',
    labels,
  };
}

/** docx → bytes, tolerating jsdom Blob implementations without arrayBuffer(). */
async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsArrayBuffer(blob);
  });
}

async function roundTrip(body: DocumentBlock[], bilingual: boolean) {
  const blob = await renderEditableDocxBlob(docWith(body));
  const buffer = await blobToArrayBuffer(blob);
  return parseEditableDocx(buffer, { bilingual });
}

describe('parseEditableDocx — bilingual round trip', () => {
  const bilingualBody: DocumentBlock[] = [
    {
      type: 'bilingual',
      leftLabel: 'ՀԱՅԵՐԵՆ',
      rightLabel: 'РУССКИЙ',
      left: [
        { type: 'section', title: 'Պայմանագրի առարկան', index: 1 },
        { type: 'paragraph', text: 'Գործատուն ընդունում է Աշխատողին աշխատանքի։' },
      ],
      right: [
        { type: 'section', title: 'Предмет договора', index: 1 },
        { type: 'paragraph', text: 'Работодатель принимает Работника на работу.' },
      ],
    },
  ];

  it('recovers the document title from the leading heading', async () => {
    const result = await roundTrip(bilingualBody, true);
    expect(result.title).toBe('Employment Contract');
  });

  it('recovers the bilingual block with both columns', async () => {
    const result = await roundTrip(bilingualBody, true);
    expect(result.blocks).toHaveLength(1);
    const block = result.blocks[0]!;
    expect(block.type).toBe('bilingual');
    if (block.type !== 'bilingual') throw new Error('expected a bilingual block');
    expect(block.left.length).toBeGreaterThanOrEqual(2);
    expect(block.right.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the Armenian text in the left column and the translation on the right', async () => {
    const result = await roundTrip(bilingualBody, true);
    const block = result.blocks[0]!;
    if (block.type !== 'bilingual') throw new Error('expected a bilingual block');
    const leftText = JSON.stringify(block.left);
    const rightText = JSON.stringify(block.right);
    expect(leftText).toContain('Գործատուն');
    expect(rightText).toContain('Работодатель');
    // The languages must not bleed across columns.
    expect(leftText).not.toContain('Работодатель');
    expect(rightText).not.toContain('Գործատուն');
  });

  it('re-attaches the column captions from the options', async () => {
    const blob = await renderEditableDocxBlob(docWith(bilingualBody));
    const result = await parseEditableDocx(await blobToArrayBuffer(blob), {
      bilingual: true,
      leftLabel: 'ՀԱՅԵՐԵՆ',
      rightLabel: 'РУССКИЙ',
    });
    const block = result.blocks[0]!;
    if (block.type !== 'bilingual') throw new Error('expected a bilingual block');
    expect(block.leftLabel).toBe('ՀԱՅԵՐԵՆ');
    expect(block.rightLabel).toBe('РУССКИЙ');
  });

  it('recovers sections as sections, with their ordinal', async () => {
    const result = await roundTrip(bilingualBody, true);
    const block = result.blocks[0]!;
    if (block.type !== 'bilingual') throw new Error('expected a bilingual block');
    const section = block.left.find((b) => b.type === 'section');
    expect(section).toBeDefined();
    if (section?.type !== 'section') throw new Error('expected a section block');
    expect(section.index).toBe(1);
    expect(section.title.toLowerCase()).toContain('պայմանագրի');
  });

  it('never carries a signature block back from the edited file', async () => {
    // The editable export omits signatures on purpose so an edited document
    // cannot smuggle in a forged signature line.
    const withSignatures: DocumentBlock[] = [
      ...bilingualBody,
      {
        type: 'signatures',
        parties: [
          { role: 'Employee', nameLabel: 'Name', name: 'Anna', dateLabel: 'Date' },
          { role: 'Employer', nameLabel: 'Name', name: 'Caron', dateLabel: 'Date' },
        ],
      },
    ];
    const result = await roundTrip(withSignatures, true);
    expect(JSON.stringify(result.blocks)).not.toContain('signatures');
  });
});

describe('parseEditableDocx — single-language documents', () => {
  it('recovers paragraphs, sections and bullets', async () => {
    const body: DocumentBlock[] = [
      { type: 'section', title: 'Duties', index: 2 },
      { type: 'paragraph', text: 'The Employee performs the duties of the position.' },
      { type: 'bullets', items: ['Follow the internal rules', 'Report to the supervisor'] },
    ];
    const result = await roundTrip(body, false);

    const types = result.blocks.map((b) => b.type);
    expect(types).toContain('section');
    expect(types).toContain('paragraph');
    expect(types).toContain('bullets');

    const bullets = result.blocks.find((b) => b.type === 'bullets');
    if (bullets?.type !== 'bullets') throw new Error('expected bullets');
    expect(bullets.items).toEqual(['Follow the internal rules', 'Report to the supervisor']);
  });

  it('reads a definition table as fields when the document is not bilingual', async () => {
    const body: DocumentBlock[] = [
      {
        type: 'fields',
        rows: [
          { label: 'Position', value: 'Engineer' },
          { label: 'Department', value: 'R&D' },
        ],
      },
    ];
    const result = await roundTrip(body, false);
    const fields = result.blocks.find((b) => b.type === 'fields');
    if (fields?.type !== 'fields') throw new Error('expected fields');
    expect(fields.rows).toEqual([
      { label: 'Position', value: 'Engineer' },
      { label: 'Department', value: 'R&D' },
    ]);
  });

  it('preserves free text the editor added', async () => {
    const body: DocumentBlock[] = [{ type: 'paragraph', text: 'Original clause.' }];
    const result = await roundTrip(body, false);
    expect(JSON.stringify(result.blocks)).toContain('Original clause.');
  });
});

describe('parseEditableDocx — bilingual structure must survive', () => {
  // Regression guard. The Armenian column is the legally binding text; if the
  // editor dissolves the two-column table in Word, silently importing the result
  // would produce a contract with one language missing.
  it('rejects a bilingual document that came back without a two-column table', async () => {
    const singleColumnBody: DocumentBlock[] = [
      { type: 'section', title: 'Պայմանագրի առարկան', index: 1 },
      { type: 'paragraph', text: 'Միայն հայերեն, առանց աղյուսակի։' },
    ];
    await expect(roundTrip(singleColumnBody, true)).rejects.toBeInstanceOf(DocxImportError);
  });

  it('explains what to do in the rejection message', async () => {
    const singleColumnBody: DocumentBlock[] = [{ type: 'paragraph', text: 'no table here' }];
    await expect(roundTrip(singleColumnBody, true)).rejects.toThrow(/two-column/i);
  });

  it('rejects a bilingual document whose column lost all its text', async () => {
    const emptyRight: DocumentBlock[] = [
      {
        type: 'bilingual',
        left: [{ type: 'paragraph', text: 'Հայերեն տեքստ' }],
        // Word would leave the cell present but empty.
        right: [{ type: 'spacer', size: 2 }],
      },
    ];
    await expect(roundTrip(emptyRight, true)).rejects.toBeInstanceOf(DocxImportError);
  });

  it('still accepts a single-language document with no table', async () => {
    const body: DocumentBlock[] = [{ type: 'paragraph', text: 'Plain single-language clause.' }];
    const result = await roundTrip(body, false);
    expect(result.blocks.length).toBeGreaterThan(0);
  });
});

describe('parseEditableDocx — rejections', () => {
  it('rejects a file that is not a .docx', async () => {
    const bytes = new TextEncoder().encode('this is definitely not a word file');
    await expect(
      parseEditableDocx(bytes.buffer as ArrayBuffer, { bilingual: false }),
    ).rejects.toBeInstanceOf(DocxImportError);
  });

  it('rejects an empty buffer', async () => {
    await expect(
      parseEditableDocx(new ArrayBuffer(0), { bilingual: false }),
    ).rejects.toBeInstanceOf(DocxImportError);
  });
});
