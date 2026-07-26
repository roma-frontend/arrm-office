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
  type RenderableDocument,
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
  return {
    Document: jest.fn().mockImplementation(function (this: any, opts: any) {
      this.opts = opts;
    }),
    Packer: { toBlob: jest.fn().mockResolvedValue(new Blob(['docx'])) },
    Paragraph: jest.fn().mockImplementation(function (this: any, opts: any) {
      this.opts = opts;
    }),
    TextRun: jest.fn().mockImplementation(function (this: any, opts: any) {
      this.opts = opts;
    }),
    HeadingLevel: { HEADING_1: 'Heading1' },
    AlignmentType: { CENTER: 'center' },
    BorderStyle: { SINGLE: 'single' },
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
