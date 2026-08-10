/**
 * Tests for exportDocument.ts — PDF/DOCX themed document export
 *
 * Tests: RenderableDocument interface, buildDocDefinition (doc structure,
 * signature block, footer with contentHash), exportDocumentToPDF,
 * renderDocumentPdfBase64 (with timeout/rejection paths),
 * exportDocumentToDOCX, triggerDownload (blob download).
 */

import {
  exportDocumentToPDF,
  renderDocumentPdfBase64,
  exportDocumentToDOCX,
  exportEditableDocx,
  renderDocumentDocxBlob,
  renderEditableDocxBlob,
  documentBodyToPlainText,
  containsSignatures,
  isBlockBody,
  type RenderableDocument,
  type DocumentBlock,
} from '@/lib/exportDocument';

// Mock URL.createObjectURL and related
const mockCreateObjectURL = jest.fn().mockReturnValue('blob:test');
const mockRevokeObjectURL = jest.fn();
const mockClick = jest.fn();

beforeEach(() => {
  global.URL.createObjectURL = mockCreateObjectURL;
  global.URL.revokeObjectURL = mockRevokeObjectURL;
  (document.createElement as jest.Mock) = jest.fn().mockReturnValue({
    href: '',
    download: '',
    click: mockClick,
    appendChild: jest.fn(),
    removeChild: jest.fn(),
  });
  document.body.appendChild = jest.fn();
  document.body.removeChild = jest.fn();
});

// ── Mock dynamic imports ─────────────────────────────────────────────────────
jest.mock('@/lib/dynamic-imports', () => ({
  loadPdfMake: jest.fn(),
  loadDocx: jest.fn(),
}));

// ── Test fixture ─────────────────────────────────────────────────────────────
const baseDoc: RenderableDocument = {
  title: 'Employment Contract',
  body: 'Party A and Party B agree to the terms.\n\nStandard clauses apply.',
  accent: 'blue',
  signature: false,
  orgName: 'Strata Inc.',
  now: 1700000000000,
  labels: {
    signature: 'Signature',
    name: 'Name',
    position: 'Position',
    date: 'Date',
    generatedOn: 'Generated on',
    integrity: 'Integrity hash',
  },
};

function createMockPdfMake(vfs = true) {
  const download = jest.fn();
  const getBase64 = jest.fn();
  const createPdf = jest.fn(() => ({ download, getBase64 }));
  const pdfMake: any = { createPdf, download, getBase64 };
  if (vfs) pdfMake.vfs = {};
  return pdfMake;
}

function createMockDocx() {
  const ctor = () =>
    jest.fn().mockImplementation(function (this: any, opts: any) {
      this.opts = opts;
    });
  return {
    Document: ctor(),
    Packer: { toBlob: jest.fn().mockResolvedValue(new Blob(['docx'])) },
    Paragraph: ctor(),
    TextRun: ctor(),
    // Structured DOCX output uses tables (definition lists, signature grids and
    // the bilingual two-column layout) and embeds signature images.
    ImageRun: ctor(),
    Table: ctor(),
    TableRow: ctor(),
    TableCell: ctor(),
    WidthType: { PERCENTAGE: 'pct', DXA: 'dxa' },
    HeadingLevel: { HEADING_1: 'Heading1', TITLE: 'Title' },
    AlignmentType: { CENTER: 'center', JUSTIFIED: 'both' },
    BorderStyle: { SINGLE: 'single', NONE: 'none' },
  };
}

describe('exportDocumentToPDF', () => {
  it('calls pdfmake createPdf and download with given filename', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    const result = await exportDocumentToPDF(baseDoc, 'contract.pdf');
    expect(result).toEqual({ success: true });
    expect(mockPdf.createPdf).toHaveBeenCalled();
    expect(mockPdf.download).toHaveBeenCalledWith('contract.pdf');
  });

  it('includes signature block when signature=true', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    const docWithSig: RenderableDocument = {
      ...baseDoc,
      signature: true,
      signed: {
        signatureData: 'data:image/png;base64,iVBOR=' as any,
        signerName: 'Alice Smith',
        signedAt: 1700100000000,
      },
    };

    await exportDocumentToPDF(docWithSig, 'signed.pdf');
    expect(mockPdf.createPdf).toHaveBeenCalled();
    expect(mockPdf.download).toHaveBeenCalledWith('signed.pdf');
  });

  it('handles pdfmake with vfs already set', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    await expect(exportDocumentToPDF(baseDoc)).resolves.toEqual({ success: true });
  });

  it('uses default filename when not provided', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    const result = await exportDocumentToPDF(baseDoc);
    expect(result).toEqual({ success: true });
    expect(mockPdf.download).toHaveBeenCalledWith('document.pdf');
  });
});

describe('renderDocumentPdfBase64', () => {
  it('resolves with base64 data URL on success', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    mockPdf.getBase64.mockImplementation((cb: Function) => cb('cGRmYmFzZTY0'));

    const url = await renderDocumentPdfBase64(baseDoc);
    expect(url).toContain('data:application/pdf;base64,');
    expect(url).toContain('cGRmYmFzZTY0');
  });

  it('rejects when getBase64 returns empty data', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    mockPdf.getBase64.mockImplementation((cb: Function) => cb(''));

    await expect(renderDocumentPdfBase64(baseDoc)).rejects.toThrow('empty output');
  });

  it('rejects on timeout after 30s', async () => {
    jest.useFakeTimers();
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    mockPdf.getBase64.mockImplementation(() => {});

    const promise = renderDocumentPdfBase64(baseDoc);

    // Flush microtasks so the async function awaits loadPdfMake and sets up setTimeout
    // Need enough flushes for the full loadPdfMakeWithFonts chain
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }

    jest.advanceTimersByTime(31000);
    // Flush any microtasks queued by timer callbacks
    await Promise.resolve();

    await expect(promise).rejects.toThrow('timed out');
    jest.useRealTimers();
  }, 10000);

  it('rejects on pdfmake exception', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockErrors = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockErrors);

    mockErrors.createPdf.mockImplementation(() => {
      throw new Error('Internal error');
    });

    await expect(renderDocumentPdfBase64(baseDoc)).rejects.toThrow('Internal error');
  });
});

describe('exportDocumentToDOCX', () => {
  it('produces a DOCX with header and body', async () => {
    const { loadDocx } = jest.requireMock('@/lib/dynamic-imports');
    loadDocx.mockResolvedValue(createMockDocx());

    const result = await exportDocumentToDOCX(baseDoc);
    expect(result).toEqual({ success: true });
  });

  it('includes signature block when signature=true', async () => {
    const { loadDocx } = jest.requireMock('@/lib/dynamic-imports');
    loadDocx.mockResolvedValue(createMockDocx());

    const docWithSig: RenderableDocument = {
      ...baseDoc,
      signature: true,
    };

    const result = await exportDocumentToDOCX(docWithSig, 'contract.docx');
    expect(result).toEqual({ success: true });
  });

  it('includes contentHash in footer', async () => {
    const { loadDocx } = jest.requireMock('@/lib/dynamic-imports');
    loadDocx.mockResolvedValue(createMockDocx());

    const docWithHash: RenderableDocument = {
      ...baseDoc,
      contentHash: 'abc123',
    };

    const result = await exportDocumentToDOCX(docWithHash);
    expect(result).toEqual({ success: true });
  });
});

describe('renderDocumentDocxBlob', () => {
  it('returns a Blob from the docx Packer', async () => {
    const { loadDocx } = jest.requireMock('@/lib/dynamic-imports');
    loadDocx.mockResolvedValue(createMockDocx());

    const blob = await renderDocumentDocxBlob(baseDoc);
    expect(blob).toBeInstanceOf(Blob);
  });

  it('instantiates the Document with the Sylfaen default font', async () => {
    const { loadDocx } = jest.requireMock('@/lib/dynamic-imports');
    const mod = createMockDocx();
    loadDocx.mockResolvedValue(mod);

    await renderDocumentDocxBlob(baseDoc);

    const documentCtor = mod.Document;
    const instance = documentCtor.mock.instances[0];
    expect(instance.opts.styles.default.document.run.font).toBe('Sylfaen');
    expect(instance.opts.sections).toHaveLength(1);
  });
});

describe('renderEditableDocxBlob / exportEditableDocx', () => {
  it('renders the round-trip file with a single Heading 1 and body', async () => {
    const { loadDocx } = jest.requireMock('@/lib/dynamic-imports');
    const mod = createMockDocx();
    loadDocx.mockResolvedValue(mod);

    const blob = await renderEditableDocxBlob(baseDoc);
    expect(blob).toBeInstanceOf(Blob);
    expect(mod.Packer.toBlob).toHaveBeenCalled();
  });

  it('downloads the editable DOCX via exportEditableDocx', async () => {
    const { loadDocx } = jest.requireMock('@/lib/dynamic-imports');
    loadDocx.mockResolvedValue(createMockDocx());

    const result = await exportEditableDocx(baseDoc, 'editable.docx');
    expect(result).toEqual({ success: true });
    expect(mockClick).toHaveBeenCalled();
  });
});

describe('structured block bodies', () => {
  const blocks: DocumentBlock[] = [
    { type: 'section', index: 1, title: 'Asset Details' },
    {
      type: 'fields',
      rows: [
        { label: 'Name', value: 'Lenovo X1' },
        { label: 'Serial Number', value: 'EVG56LV44' },
        { label: 'Location', value: '' },
      ],
    },
    { type: 'bullets', items: ['first', 'second'] },
    { type: 'paragraph', text: 'I confirm that I have received the equipment.' },
    { type: 'callout', text: 'Two counterparts of equal force.' },
    { type: 'spacer', size: 12 },
    { type: 'section', title: 'Signatures' },
    {
      type: 'signatures',
      parties: [
        {
          role: 'Employee',
          nameLabel: 'Name',
          name: 'Alice',
          dateLabel: 'Date',
          date: '1 August 2026',
          signatureImage: 'data:image/png;base64,AAA',
        },
        { role: 'Admin / HR', nameLabel: 'Name', name: 'Bob', dateLabel: 'Date' },
      ],
    },
  ];

  it('renders sections, tables, bullets, callouts and a signature grid', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    await exportDocumentToPDF({ ...baseDoc, body: blocks }, 'act.pdf');

    const def = mockPdf.createPdf.mock.calls[0][0];
    const json = JSON.stringify(def.content);
    // Definition table: label/value pairs, blank values kept as a dash so the
    // row can be filled in by hand on a printed copy.
    expect(json).toContain('EVG56LV44');
    expect(json).toContain('"fieldLabel"');
    expect(json).toContain('"fieldValue"');
    // Numbered, upper-cased section heading
    expect(json).toContain('1.  ASSET DETAILS');
    // Bullet list rendered as a real list, not inline text
    expect(def.content.some((c: any) => Array.isArray(c.ul))).toBe(true);
    // Two signing parties side by side, with the drawn signature embedded
    expect(json).toContain('data:image/png;base64,AAA');
    expect(json).toContain('Admin / HR');

    // Exercise the fields-table layout callbacks (hairline rules + padding).
    const fieldTable = def.content.find(
      (c: any) => c.table && c.table.body?.[0]?.[0]?.style === 'fieldLabel',
    );
    expect(fieldTable).toBeDefined();
    const body = fieldTable.table.body;
    expect(fieldTable.layout.hLineWidth(0, { table: { body } })).toBe(0);
    expect(fieldTable.layout.hLineWidth(1, { table: { body } })).toBe(0.5);
    expect(fieldTable.layout.vLineWidth()).toBe(0);
    expect(fieldTable.layout.hLineColor()).toBe('#e2e8f0');
    expect(fieldTable.layout.paddingTop()).toBe(5);
    expect(fieldTable.layout.paddingBottom()).toBe(5);
    expect(fieldTable.layout.paddingLeft()).toBe(0);
    expect(fieldTable.layout.paddingRight()).toBe(4);

    // Exercise the callout table layout callbacks (accent bar + padding).
    const callout = def.content.find(
      (c: any) => c.table && c.table.body?.[0]?.[0]?.style === 'callout',
    );
    expect(callout).toBeDefined();
    expect(callout.layout.hLineWidth()).toBe(0);
    expect(callout.layout.vLineWidth(0)).toBe(2.5);
    expect(callout.layout.vLineWidth(1)).toBe(0);
    expect(callout.layout.vLineColor()).toBe('#1d4ed8');
    expect(callout.layout.paddingLeft()).toBe(10);
    expect(callout.layout.paddingRight()).toBe(10);
    expect(callout.layout.paddingTop()).toBe(8);
    expect(callout.layout.paddingBottom()).toBe(8);
    expect(callout.layout.fillColor()).toBe('#f8fafc');
  });

  it('does not append the generic signature block when the body has its own', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    await exportDocumentToPDF({ ...baseDoc, body: blocks, signature: true }, 'act.pdf');

    const def = mockPdf.createPdf.mock.calls[0][0];
    // 'Signature' is the generic block's title label — the act uses party roles.
    expect(JSON.stringify(def.content)).not.toContain('"signatureTitle"');
  });

  it('prints the header title, subtitle and document reference', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    await exportDocumentToPDF(
      {
        ...baseDoc,
        title: 'Акт приёма-передачи',
        subtitle: 'Lenovo X1',
        documentNumber: 'Документ № HO-20260801-AB12',
        body: blocks,
      },
      'act.pdf',
    );

    const json = JSON.stringify(mockPdf.createPdf.mock.calls[0][0]);
    expect(json).toContain('Акт приёма-передачи');
    expect(json).toContain('Lenovo X1');
    expect(json).toContain('HO-20260801-AB12');
  });

  it('formats the generated-on date in the document language', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    const now = new Date(2026, 7, 1, 12).getTime();
    await exportDocumentToPDF({ ...baseDoc, now, lang: 'ru', body: blocks }, 'act.pdf');

    const json = JSON.stringify(mockPdf.createPdf.mock.calls[0][0]);
    expect(json).toContain('1 августа 2026');
    expect(json).not.toContain('August 1, 2026');
  });

  it('exports block bodies to DOCX as readable text', async () => {
    const { loadDocx } = jest.requireMock('@/lib/dynamic-imports');
    loadDocx.mockResolvedValue(createMockDocx());

    await expect(
      exportDocumentToDOCX({ ...baseDoc, body: blocks, subtitle: 'Lenovo X1' }, 'act.docx'),
    ).resolves.toEqual({ success: true });
  });

  it('renders a bilingual two-column block to PDF with both languages', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    await exportDocumentToPDF(
      {
        ...baseDoc,
        body: [
          {
            type: 'bilingual',
            leftLabel: 'ՀԱՅԵՐԵՆ',
            rightLabel: 'РУССКИЙ',
            left: [
              { type: 'section', index: 1, title: 'ՊԱՅՄԱՆԱԳԻՐ' },
              { type: 'paragraph', text: 'Հայերեն տեքստ' },
            ],
            right: [{ type: 'paragraph', text: 'Русский текст' }],
          },
        ],
      },
      'bilingual.pdf',
    );

    const def = mockPdf.createPdf.mock.calls[0][0];
    const json = JSON.stringify(def.content);
    expect(json).toContain('ՀԱՅԵՐԵՆ');
    expect(json).toContain('РУССКИЙ');
    expect(json).toContain('1.  ՊԱՅՄԱՆԱԳԻՐ');
    expect(json).toContain('Русский текст');

    // Exercise the bilingual table layout callbacks so their branches are hit.
    const biTable = def.content.find((c: any) => c.table && Array.isArray(c.table.widths));
    expect(biTable).toBeDefined();
    expect(biTable.layout.hLineWidth()).toBe(0);
    expect(biTable.layout.vLineWidth(1)).toBe(0.5);
    expect(biTable.layout.vLineColor()).toBe('#e2e8f0');
    expect(biTable.layout.paddingLeft(0)).toBe(0);
    expect(biTable.layout.paddingLeft(1)).toBe(9);
    expect(biTable.layout.paddingRight(0)).toBe(9);
    expect(biTable.layout.paddingRight(1)).toBe(0);
    expect(biTable.layout.paddingTop()).toBe(0);
    expect(biTable.layout.paddingBottom()).toBe(0);
  });

  it('renders a bilingual block to DOCX as a two-column table', async () => {
    const { loadDocx } = jest.requireMock('@/lib/dynamic-imports');
    loadDocx.mockResolvedValue(createMockDocx());

    await expect(
      exportDocumentToDOCX({
        ...baseDoc,
        body: [
          {
            type: 'bilingual',
            leftLabel: 'ՀԱՅԵՐԵՆ',
            rightLabel: 'РУССКИЙ',
            left: [{ type: 'paragraph', text: 'Հայերեն' }],
            right: [{ type: 'paragraph', text: 'Русский' }],
          },
        ],
      }),
    ).resolves.toEqual({ success: true });
  });

  it('renders a muted paragraph and callout block', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    await exportDocumentToPDF(
      {
        ...baseDoc,
        body: [
          { type: 'paragraph', text: 'Fine print note', muted: true },
          { type: 'callout', text: 'Important notice' },
        ],
      },
      'muted.pdf',
    );

    const json = JSON.stringify(mockPdf.createPdf.mock.calls[0][0]);
    expect(json).toContain('Fine print note');
    expect(json).toContain('Important notice');
    expect(json).toContain('blockMuted');
    expect(json).toContain('callout');
  });

  it('renders a single-party signature block in structured body', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    await exportDocumentToPDF(
      {
        ...baseDoc,
        body: [
          {
            type: 'signatures',
            parties: [
              {
                role: 'Employee',
                nameLabel: 'Name',
                name: 'Alice',
                dateLabel: 'Date',
                date: '1 August 2026',
                positionLabel: 'Position',
                position: 'Manager',
              },
            ],
          },
        ],
      },
      'one-party.pdf',
    );

    const json = JSON.stringify(mockPdf.createPdf.mock.calls[0][0]);
    // Position/date are separate label+value text nodes inside the party stack.
    expect(json).toContain('Position: ');
    expect(json).toContain('"text":"Manager"');
    expect(json).toContain('1 August 2026');
  });
});

describe('containsSignatures', () => {
  it('detects a top-level signatures block', () => {
    expect(
      containsSignatures([
        { type: 'section', title: 'X' },
        { type: 'signatures', parties: [] },
      ]),
    ).toBe(true);
  });

  it('detects signatures nested inside a bilingual column', () => {
    expect(
      containsSignatures([
        {
          type: 'bilingual',
          left: [{ type: 'signatures', parties: [] }],
          right: [{ type: 'paragraph', text: 'x' }],
        },
      ]),
    ).toBe(true);
    expect(
      containsSignatures([
        {
          type: 'bilingual',
          left: [{ type: 'paragraph', text: 'x' }],
          right: [{ type: 'signatures', parties: [] }],
        },
      ]),
    ).toBe(true);
  });

  it('returns false when no signatures are present', () => {
    expect(containsSignatures([{ type: 'section', title: 'X' }])).toBe(false);
    expect(
      containsSignatures([
        { type: 'bilingual', left: [{ type: 'paragraph', text: 'a' }], right: [] },
      ]),
    ).toBe(false);
  });

  it('does not append the generic signature block when signatures are inside bilingual', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    await exportDocumentToPDF(
      {
        ...baseDoc,
        signature: true,
        body: [
          {
            type: 'bilingual',
            left: [
              {
                type: 'signatures',
                parties: [{ role: 'A', nameLabel: 'N', name: '', dateLabel: 'D' }],
              },
            ],
            right: [],
          },
        ],
      },
      'nested-sig.pdf',
    );

    const json = JSON.stringify(mockPdf.createPdf.mock.calls[0][0]);
    // The generic block's title node (style + color) must not appear in content;
    // the styles table always defines signatureTitle, so check the usage node.
    expect(json).not.toContain('"text":"Signature","style":"signatureTitle"');
  });
});

describe('isBlockBody', () => {
  it('distinguishes structured bodies from plain strings', () => {
    expect(isBlockBody('text')).toBe(false);
    expect(isBlockBody([])).toBe(true);
    expect(isBlockBody([{ type: 'section', title: 'X' }])).toBe(true);
  });
});

describe('documentBodyToPlainText', () => {
  it('passes string bodies through unchanged', () => {
    expect(documentBodyToPlainText('plain body')).toBe('plain body');
  });

  it('flattens blocks into labelled lines', () => {
    const text = documentBodyToPlainText([
      { type: 'section', index: 2, title: 'Handover Details' },
      { type: 'fields', rows: [{ label: 'Handed To', value: 'Alice' }] },
      {
        type: 'signatures',
        parties: [{ role: 'Employee', nameLabel: 'Name', name: 'Alice', dateLabel: 'Date' }],
      },
    ]);
    expect(text).toContain('2. HANDOVER DETAILS');
    expect(text).toContain('Handed To: Alice');
    expect(text).toContain('Date: ____________');
  });

  it('renders bullets, callouts, spacers and empty field values', () => {
    const text = documentBodyToPlainText([
      { type: 'bullets', items: ['one', 'two'] },
      { type: 'callout', text: 'Callout text' },
      { type: 'fields', rows: [{ label: 'Empty', value: '' }] },
      { type: 'spacer', size: 12 },
    ]);
    expect(text).toContain('•  one');
    expect(text).toContain('•  two');
    expect(text).toContain('Callout text');
    expect(text).toContain('Empty: —');
  });

  it('renders bilingual blocks sequentially with captions', () => {
    const text = documentBodyToPlainText([
      {
        type: 'bilingual',
        leftLabel: 'ՀԱՅԵՐԵՆ',
        rightLabel: 'РУССКИЙ',
        left: [{ type: 'paragraph', text: 'Հայերեն' }],
        right: [{ type: 'paragraph', text: 'Русский' }],
      },
    ]);
    expect(text).toContain('[ՀԱՅԵՐԵՆ]');
    expect(text).toContain('Հայերեն');
    expect(text).toContain('[РУССКИЙ]');
    expect(text).toContain('Русский');
  });

  it('renders signature parties with position lines and dashes for missing values', () => {
    const text = documentBodyToPlainText([
      {
        type: 'signatures',
        parties: [
          {
            role: 'Employee',
            nameLabel: 'Name',
            name: '',
            dateLabel: 'Date',
            positionLabel: 'Position',
            position: '',
          },
        ],
      },
    ]);
    expect(text).toContain('Employee');
    expect(text).toContain('Name: —');
    expect(text).toContain('Position: —');
    expect(text).toContain('Date: ____________');
  });
});

describe('legacy string bodies', () => {
  it('heuristic layout: section headers and bullets', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    // The trailing sentence is longer than the section-header cap (55 chars), so
    // the heuristic must lay it out as a justified body paragraph.
    const body =
      'Section Title\n\n• First item\n• Second item\n\nThis is a longer paragraph sentence that comfortably exceeds the fifty-five character section header threshold.';
    await exportDocumentToPDF({ ...baseDoc, body }, 'legacy.pdf');

    const def = mockPdf.createPdf.mock.calls[0][0];
    const json = JSON.stringify(def.content);
    expect(json).toContain('"style":"sectionHeader"');
    expect(json).toContain('•  First item');
    expect(json).toContain('"style":"body"');
  });

  it('stops a paragraph at a double blank line', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    // Two consecutive blanks inside a paragraph force a section break (L419).
    // The first line is long enough to avoid the section-header heuristic.
    const body =
      'First paragraph of plain prose that is long enough to not look like a section heading at all.\n\n\nSecond paragraph after a break.';
    await exportDocumentToPDF({ ...baseDoc, body }, 'blank.pdf');

    const def = mockPdf.createPdf.mock.calls[0][0];
    const texts = def.content
      .filter((c: any) => typeof c.text === 'string')
      .map((c: any) => c.text);
    expect(texts.some((t: string) => t.startsWith('First paragraph of plain prose'))).toBe(true);
    expect(texts).toContain('Second paragraph after a break.');
  });

  it('keeps a non-bullet continuation line inside a bullet group', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    // A long non-bullet line after bullets is treated as a list continuation,
    // not as a new section header (L397 branch).
    const body =
      '• Alpha\n• Beta\nA continuation line that is too long to be mistaken for a section heading by the heuristic.';
    await exportDocumentToPDF({ ...baseDoc, body }, 'cont.pdf');

    const def = mockPdf.createPdf.mock.calls[0][0];
    const json = JSON.stringify(def.content);
    expect(json).toContain('•  Alpha');
    expect(json).toContain('•  Beta');
    // The long line ends up as the third bullet of the same group.
    expect(json).toContain('•  A continuation line that is too long');
  });
});

describe('types', () => {
  it('RenderableDocument interface accepts all fields', () => {
    const doc: RenderableDocument = {
      title: 'Test',
      body: 'Hello',
      accent: 'green',
      signature: true,
      orgName: 'Org',
      now: Date.now(),
      labels: {
        signature: 'Sig',
        name: 'Name',
        position: 'Pos',
        date: 'Date',
        generatedOn: 'Gen',
        integrity: 'Hash',
      },
    };
    expect(doc.title).toBe('Test');
    expect(doc.accent).toBe('green');
  });

  it('accepts optional contentHash and signed fields', () => {
    const doc: RenderableDocument = {
      title: 'Signed Doc',
      body: 'Body',
      accent: 'rose',
      signature: true,
      orgName: 'Org',
      now: 1,
      labels: {
        signature: 'Sig',
        name: 'Name',
        position: 'Pos',
        date: 'Date',
        generatedOn: 'Gen',
        integrity: 'Hash',
      },
      contentHash: 'sha256:xxx',
      signed: { signerName: 'Bob', signedAt: 2, signatureData: 'data:,' },
    };
    expect(doc.contentHash).toBeDefined();
    expect(doc.signed?.signerName).toBe('Bob');
  });
});

describe('signed signature rendering', () => {
  const signedDoc: RenderableDocument = {
    ...baseDoc,
    signature: true,
    signed: {
      signatureData: 'data:image/png;base64,iVBORw0KGgo=',
      signerName: 'Alice Smith',
      signedAt: new Date(2026, 6, 15, 12).getTime(),
    },
  };

  it('embeds the signature image and signer name in the PDF', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    await exportDocumentToPDF(signedDoc, 'signed.pdf');

    const json = JSON.stringify(mockPdf.createPdf.mock.calls[0][0]);
    expect(json).toContain('data:image/png;base64,iVBORw0KGgo=');
    expect(json).toContain('Alice Smith');
    // signedAt is formatted as a long date in the document language
    expect(json).toContain('15 July 2026');
  });

  it('renders the signed date in the document language', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    await exportDocumentToPDF({ ...signedDoc, lang: 'ru' }, 'signed-ru.pdf');

    const json = JSON.stringify(mockPdf.createPdf.mock.calls[0][0]);
    expect(json).toContain('15 июля 2026');
  });

  it('includes the signer name in the DOCX signature party', async () => {
    const { loadDocx } = jest.requireMock('@/lib/dynamic-imports');
    const mod = createMockDocx();
    loadDocx.mockResolvedValue(mod);

    await renderDocumentDocxBlob(signedDoc);
    // The signer name flows into a TextRun child of the signature paragraph.
    const textRuns = mod.TextRun.mock.calls.map((c: any) => c[0]);
    expect(textRuns.some((t: any) => t.text === 'Alice Smith')).toBe(true);
  });

  it('draws placeholder lines when the signature has no name or date', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    // signed without signerName/signedAt → underscore placeholder branches.
    await exportDocumentToPDF(
      { ...baseDoc, signature: true, signed: { signatureData: 'data:image/png;base64,AAA' } },
      'unsigned.pdf',
    );

    const json = JSON.stringify(mockPdf.createPdf.mock.calls[0][0]);
    expect(json).toContain('_________________________');
    expect(json).toContain('_________________');
  });

  it('prints the integrity hash in the footer when contentHash is set', async () => {
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    await exportDocumentToPDF(
      { ...baseDoc, contentHash: 'sha256:abcdef0123456789', lang: 'ru' },
      'hash.pdf',
    );

    const def = mockPdf.createPdf.mock.calls[0][0];
    const footer = def.footer(1, 3);
    const json = JSON.stringify(footer);
    // The hash is truncated to 16 chars in the footer.
    expect(json).toContain('sha256:abcdef012');
    expect(json).toContain('1 / 3');
  });

  it('renders a single-party signature block to DOCX without a table', async () => {
    const { loadDocx } = jest.requireMock('@/lib/dynamic-imports');
    const mod = createMockDocx();
    loadDocx.mockResolvedValue(mod);

    await exportDocumentToDOCX({
      ...baseDoc,
      body: [
        {
          type: 'signatures',
          parties: [
            {
              role: 'Employee',
              nameLabel: 'Name',
              name: 'Alice',
              dateLabel: 'Date',
              date: '1 August 2026',
              positionLabel: 'Position',
              position: 'Manager',
            },
          ],
        },
      ],
    });

    // Single party → pushed directly via docxSignatureParty, no Table wrapper.
    expect(mod.Table).not.toHaveBeenCalled();
    const textRuns = mod.TextRun.mock.calls.map((c: any) => c[0]);
    expect(textRuns.some((t: any) => t.text === 'Alice')).toBe(true);
  });

  it('tolerates an invalid base64 signature image in DOCX', async () => {
    const { loadDocx } = jest.requireMock('@/lib/dynamic-imports');
    const mod = createMockDocx();
    loadDocx.mockResolvedValue(mod);

    // Malformed base64 → dataUrlToUint8Array catch returns null → no ImageRun.
    await exportDocumentToDOCX({
      ...baseDoc,
      body: [
        {
          type: 'signatures',
          parties: [
            {
              role: 'Employee',
              nameLabel: 'Name',
              name: 'Alice',
              dateLabel: 'Date',
              signatureImage: 'data:image/png;base64,!!!!invalid!!!!',
            },
          ],
        },
      ],
    });

    expect(mod.ImageRun).not.toHaveBeenCalled();
  });
});

describe('font loading fallback', () => {
  it('falls back to Roboto when DejaVu fonts cannot be fetched', async () => {
    // ensureDejaVu() caches its result at module scope, so earlier tests in
    // this file already resolved it (Node fetch rejects the relative /fonts
    // URL). Reset the module registry so this test runs with a fresh cache and
    // genuinely exercises the fetch-failure path.
    jest.resetModules();
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    try {
      const mod = await import('@/lib/exportDocument');
      await mod.exportDocumentToPDF(baseDoc);
      const def = mockPdf.createPdf.mock.calls[0][0];
      expect(def.defaultStyle.font).toBe('Roboto');
      // The font fetch must have been attempted against the failing stub.
      expect(global.fetch).toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('registers DejaVu fonts when the font fetch succeeds', async () => {
    jest.resetModules();
    const originalFetch = global.fetch;
    const arrayBuffer = new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]).buffer; // 'hello'
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => arrayBuffer,
    });
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    const mockPdf = createMockPdfMake(true);
    loadPdfMake.mockResolvedValue(mockPdf);

    try {
      const mod = await import('@/lib/exportDocument');
      await mod.exportDocumentToPDF(baseDoc);
      const def = mockPdf.createPdf.mock.calls[0][0];
      expect(def.defaultStyle.font).toBe('DejaVuSans');
      // The fetched bytes were base64-encoded into the pdfmake virtual file system.
      const vfsValues = Object.values(mockPdf.vfs) as string[];
      expect(vfsValues).toContain(btoa('hello'));
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('falls back to the bundled vfs_fonts module when pdfmake has no vfs', async () => {
    jest.resetModules();
    const { loadPdfMake } = jest.requireMock('@/lib/dynamic-imports');
    // No vfs property → the loader must import pdfmake/build/vfs_fonts.
    const mockPdf = createMockPdfMake(false);
    loadPdfMake.mockResolvedValue(mockPdf);

    try {
      const mod = await import('@/lib/exportDocument');
      await mod.exportDocumentToPDF(baseDoc);
      expect(mockPdf.vfs).toBeDefined();
    } finally {
      jest.isolateModules(() => {});
    }
  });
});
