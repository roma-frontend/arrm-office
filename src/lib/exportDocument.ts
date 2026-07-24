/**
 * Themed exporters for resolved HR documents — PDF (pdfmake) and DOCX (docx).
 *
 * Both consume the SAME `RenderableDocument` (title + already-token-resolved
 * body + theme), so the two output formats stay visually consistent. Merge
 * tokens must be resolved by the caller (see `documentTokens.ts`) before export.
 *
 * Heavy libs (pdfmake, docx) are loaded on demand via `dynamic-imports`.
 */

import { loadPdfMake, loadDocx } from './dynamic-imports';
import { ACCENT_HEX, type AccentColor } from './documentCatalog';

export interface RenderableDocument {
  title: string;
  /** Body text with all {{tokens}} already resolved. Paragraphs split on \n. */
  body: string;
  accent: AccentColor;
  /** Append a signature block (name / position / date placeholders). */
  signature: boolean;
  /** Organization name shown in the header. */
  orgName: string;
  /** Integrity hash shown in the footer (optional). */
  contentHash?: string;
  /** Absolute timestamp used for the "generated on" footer. */
  now: number;
  /** Localized static labels so exports match the UI language. */
  labels: DocumentLabels;
  /**
   * When present, the signature block is rendered as *signed*: the drawn
   * signature image is placed above the name line and the signer's name/date
   * are filled in. Used for the archived / exported copy of a completed
   * e-signature document so HR keeps the original themed document with the
   * signature baked in.
   */
  signed?: SignedSignature;
}

export interface SignedSignature {
  /** Base64 PNG data URL of the drawn signature. */
  signatureData?: string;
  signerName?: string;
  /** Absolute timestamp the document was signed. */
  signedAt?: number;
}

export interface DocumentLabels {
  signature: string;
  name: string;
  position: string;
  date: string;
  generatedOn: string;
  integrity: string;
}

function paragraphs(body: string): string[] {
  return body.split(/\n/).map((line) => line.replace(/\s+$/, ''));
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF (pdfmake)
// ─────────────────────────────────────────────────────────────────────────────

async function loadPdfMakeWithFonts(): Promise<any> {
  const pdfMake: any = await loadPdfMake();
  // vfs_fonts registers the default Roboto font family used by pdfmake. In
  // pdfmake 0.3.x the module *is* the vfs map (top-level *.ttf keys); older
  // builds nested it under `.pdfMake.vfs` or `.vfs`. Cover every shape —
  // otherwise createPdf()/getBase64() never invokes its callback and hangs.
  if (!pdfMake.vfs) {
    const pdfFonts: any = await import('pdfmake/build/vfs_fonts');
    pdfMake.vfs = pdfFonts.pdfMake?.vfs || pdfFonts.vfs || pdfFonts.default || pdfFonts;
  }
  return pdfMake;
}

/** Build the pdfmake document definition shared by the download and render paths. */
function buildDocDefinition(doc: RenderableDocument): any {
  const accent = ACCENT_HEX[doc.accent];

  const content: any[] = [
    { text: doc.orgName, style: 'orgName', color: accent },
    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: accent }],
      margin: [0, 4, 0, 16],
    },
    { text: doc.title, style: 'title', color: accent },
    ...paragraphs(doc.body).map((line) =>
      line.length === 0 ? { text: ' ', margin: [0, 4, 0, 0] } : { text: line, style: 'body' },
    ),
  ];

  if (doc.signature) {
    const signed = doc.signed;
    // When signed, drop the drawn signature image just above the name line and
    // fill the name/date placeholders — otherwise leave blank ruled lines.
    const nameStack: any[] = [
      signed?.signatureData
        ? { image: signed.signatureData, fit: [200, 48], margin: [0, 8, 0, 0] }
        : { text: ' ', margin: [0, 24, 0, 0] },
      {
        canvas: [
          { type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.8, lineColor: '#94a3b8' },
        ],
      },
      { text: `${doc.labels.name} / ${doc.labels.position}`, style: 'sigLabel' },
    ];
    if (signed?.signerName) {
      nameStack.push({ text: signed.signerName, style: 'sigValue' });
    }

    const dateStack: any[] = [
      { text: ' ', margin: [0, 24, 0, 0] },
      {
        canvas: [
          { type: 'line', x1: 0, y1: 0, x2: 160, y2: 0, lineWidth: 0.8, lineColor: '#94a3b8' },
        ],
      },
      { text: doc.labels.date, style: 'sigLabel' },
    ];
    if (signed?.signedAt) {
      dateStack.push({ text: new Date(signed.signedAt).toLocaleDateString(), style: 'sigValue' });
    }

    content.push({
      columns: [
        { width: '*', stack: nameStack },
        { width: '*', stack: dateStack },
      ],
      columnGap: 32,
      margin: [0, 32, 0, 0],
    });
  }

  const footerParts = [`${doc.labels.generatedOn} ${new Date(doc.now).toLocaleString()}`];
  if (doc.contentHash) footerParts.push(`${doc.labels.integrity}: ${doc.contentHash}`);

  return {
    content,
    footer: () => ({
      text: footerParts.join('   ·   '),
      style: 'footer',
      alignment: 'center',
      margin: [40, 0, 40, 0],
    }),
    styles: {
      orgName: { fontSize: 16, bold: true },
      title: { fontSize: 20, bold: true, margin: [0, 0, 0, 16] },
      body: { fontSize: 11, lineHeight: 1.5, margin: [0, 0, 0, 6] },
      sigLabel: { fontSize: 9, color: '#64748b', margin: [0, 4, 0, 0] },
      sigValue: { fontSize: 10, color: '#334155', margin: [0, 2, 0, 0] },
      footer: { fontSize: 7, color: '#94a3b8' },
    },
    defaultStyle: { fontSize: 11 },
    pageMargins: [48, 48, 48, 56],
  };
}

export async function exportDocumentToPDF(
  doc: RenderableDocument,
  filename = 'document.pdf',
): Promise<{ success: boolean }> {
  const pdfMake = await loadPdfMakeWithFonts();
  pdfMake.createPdf(buildDocDefinition(doc)).download(filename);
  return { success: true };
}

/**
 * Render the themed document and return it as a base64 PDF data URL. Used to
 * upload a permanent signed copy to storage. Rejects (rather than hanging) if
 * pdfmake never invokes its callback — e.g. if fonts fail to load.
 */
export async function renderDocumentPdfBase64(doc: RenderableDocument): Promise<string> {
  const pdfMake = await loadPdfMakeWithFonts();
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('PDF rendering timed out'));
    }, 30000);

    try {
      pdfMake.createPdf(buildDocDefinition(doc)).getBase64((data: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!data) {
          reject(new Error('Failed to render PDF (empty output)'));
          return;
        }
        resolve(`data:application/pdf;base64,${data}`);
      });
    } catch (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error('Failed to render PDF'));
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCX (docx)
// ─────────────────────────────────────────────────────────────────────────────

export async function exportDocumentToDOCX(
  doc: RenderableDocument,
  filename = 'document.docx',
): Promise<{ success: boolean }> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle }: any =
    await loadDocx();

  const accentHex = ACCENT_HEX[doc.accent].replace('#', '');

  const children: any[] = [
    new Paragraph({
      children: [new TextRun({ text: doc.orgName, bold: true, size: 32, color: accentHex })],
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 12, color: accentHex, space: 4 },
      },
      spacing: { after: 240 },
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: doc.title, bold: true, size: 40, color: accentHex })],
      spacing: { after: 240 },
    }),
    ...paragraphs(doc.body).map(
      (line) =>
        new Paragraph({
          children: [new TextRun({ text: line, size: 22 })],
          spacing: { after: 120 },
        }),
    ),
  ];

  if (doc.signature) {
    children.push(
      new Paragraph({ children: [new TextRun({ text: '', size: 22 })], spacing: { before: 480 } }),
      new Paragraph({
        children: [
          new TextRun({ text: '______________________________     ', size: 22 }),
          new TextRun({ text: '______________________', size: 22 }),
        ],
        spacing: { after: 60 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `${doc.labels.name} / ${doc.labels.position}                    ${doc.labels.date}`,
            size: 18,
            color: '64748b',
          }),
        ],
      }),
    );
  }

  const footerParts = [`${doc.labels.generatedOn} ${new Date(doc.now).toLocaleString()}`];
  if (doc.contentHash) footerParts.push(`${doc.labels.integrity}: ${doc.contentHash}`);
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: footerParts.join('   ·   '), size: 14, color: '94a3b8' })],
      spacing: { before: 480 },
    }),
  );

  const document = new Document({ sections: [{ children }] });
  const blob: Blob = await Packer.toBlob(document);
  triggerDownload(blob, filename);
  return { success: true };
}

/** Download a Blob via a temporary object URL (matches Excel export pattern). */
function triggerDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
