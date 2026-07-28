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

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF (pdfmake)
// ─────────────────────────────────────────────────────────────────────────────

// The built-in Roboto font (from vfs_fonts) covers Latin + Cyrillic but has NO
// Armenian glyphs, so `hy` documents render as tofu (□□□). DejaVu Sans covers
// Latin + Cyrillic + Armenian in a single face — required because our forms mix
// scripts within one text run (e.g. "Հանձնված է՝ Cane Corso") and pdfmake has no
// per-glyph font fallback. Loaded from /public/fonts at runtime (PDF rendering
// is client-only) so the ~2.8 MB of TTFs never enter the JS bundle.
const DEJAVU_FILES = {
  normal: 'DejaVuSans.ttf',
  bold: 'DejaVuSans-Bold.ttf',
  italics: 'DejaVuSans-Oblique.ttf',
  bolditalics: 'DejaVuSans-BoldOblique.ttf',
} as const;

/** Fetch a font file and base64-encode it for pdfmake's virtual file system. */
async function fetchFontBase64(file: string): Promise<string> {
  const res = await fetch(`/fonts/${file}`);
  if (!res.ok) throw new Error(`font ${file}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000; // avoid arg-count limits on String.fromCharCode
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Registration is attempted once and cached; a failure falls back to Roboto so
// exports never break (e.g. in tests/jsdom where fetch of /fonts is unavailable).
let dejaVuReady: Promise<boolean> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfmake has no TypeScript types
async function ensureDejaVu(pdfMake: any): Promise<boolean> {
  if (!dejaVuReady) {
    dejaVuReady = (async () => {
      try {
        const entries = await Promise.all(
          Object.values(DEJAVU_FILES).map(async (f) => [f, await fetchFontBase64(f)] as const),
        );
        for (const [file, b64] of entries) pdfMake.vfs[file] = b64;
        pdfMake.fonts = { ...(pdfMake.fonts || {}), DejaVuSans: { ...DEJAVU_FILES } };
        return true;
      } catch {
        return false;
      }
    })();
  }
  return dejaVuReady;
}

/** Load pdfmake with a Unicode-capable font; returns the font family to use. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfmake has no TypeScript types
async function loadPdfMakeWithFonts(): Promise<{ pdfMake: any; font: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfmake has no types
  const pdfMake: any = await loadPdfMake();
  // vfs_fonts registers the default Roboto font family used by pdfmake. In
  // pdfmake 0.3.x the module *is* the vfs map (top-level *.ttf keys); older
  // builds nested it under `.pdfMake.vfs` or `.vfs`. Cover every shape —
  // otherwise createPdf()/getBase64() never invokes its callback and hangs.
  if (!pdfMake.vfs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfmake vfs_fonts has no types
    const pdfFonts: any = await import('pdfmake/build/vfs_fonts');
    pdfMake.vfs = pdfFonts.pdfMake?.vfs || pdfFonts.vfs || pdfFonts.default || pdfFonts;
  }
  const hasDejaVu = await ensureDejaVu(pdfMake);
  return { pdfMake, font: hasDejaVu ? 'DejaVuSans' : 'Roboto' };
}

/**
 * Parse body paragraphs into typed content blocks for intelligent PDF rendering.
 * Detects section headers (short single lines), bullet lists, and regular text.
 */
const SECTION_MAX_LENGTH = 55;

function isSectionHeader(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > SECTION_MAX_LENGTH) return false;
  // Skip lines that are clearly bullet items or short words in context
  if (trimmed.startsWith('•') || trimmed.startsWith('-')) return false;
  if (/^\d+[\.\)]\s/.test(trimmed)) return false; // numbered items
  if (/^[a-z]/.test(trimmed) && trimmed.length < 10) return false; // single lowercase word
  return true;
}

/** Build styled pdfmake content array from the body text. */
function buildBodyContent(body: string) {
  const rawLines = paragraphs(body);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfmake content is untyped
  const content: any[] = [];
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i]!;
    const trimmed = line.trim();

    // Blank line → small spacer
    if (!trimmed) {
      i++;
      continue;
    }

    // Look ahead to detect context
    const prevEmpty = i === 0 || rawLines[i - 1]?.trim() === '';
    const nextEmpty = i === rawLines.length - 1 || rawLines[i + 1]?.trim() === '';

    // Section header: short line, surrounded by blank lines (or at start/end)
    if (prevEmpty && isSectionHeader(trimmed) && trimmed.length < 45) {
      content.push({ text: trimmed, style: 'sectionHeader' });
      content.push({ text: '', margin: [0, 2, 0, 0] }); // tiny spacer after header
      i++;
      continue;
    }

    // Bullet item
    if (trimmed.startsWith('•') || trimmed.startsWith('- ')) {
      const bulletGroup: string[] = [];
      while (i < rawLines.length) {
        const l = rawLines[i]!.trim();
        if (!l) break;
        if (l.startsWith('•') || l.startsWith('- ')) {
          bulletGroup.push(l.replace(/^[•\-]\s*/, ''));
        } else {
          // Non-bullet line inside bullet group → treat as continuation or separate
          // If it's short and prevEmpty, it's likely a section header, break
          if (isSectionHeader(l) && (i === 0 || rawLines[i - 1]?.trim() === '')) break;
          bulletGroup.push(l);
        }
        i++;
      }
      for (const b of bulletGroup) {
        content.push({
          text: `•  ${b}`,
          style: 'bulletItem',
        });
      }
      content.push({ text: '', margin: [0, 4, 0, 0] }); // spacer after list
      continue;
    }

    // Regular paragraph – collect consecutive non-empty lines
    const paragraphLines: string[] = [];
    let consecutiveEmpty = 0;
    while (i < rawLines.length) {
      const l = rawLines[i]!.trim();
      if (!l) {
        consecutiveEmpty++;
        // Two consecutive blanks → section break, stop collecting
        if (consecutiveEmpty >= 2) break;
        i++;
        continue;
      }
      consecutiveEmpty = 0;

      // If next line is blank AND this line looks like a section header → stop
      const nextLine = rawLines[i + 1]?.trim();
      if (nextLine === '' && isSectionHeader(l) && paragraphLines.length === 0) break;

      paragraphLines.push(l);
      i++;
    }

    if (paragraphLines.length > 0) {
      const paragraphText = paragraphLines.join(' ');
      content.push({ text: paragraphText, style: 'body' });
      content.push({ text: '', margin: [0, 4, 0, 0] });
    }
  }

  return content;
}

/** Build the pdfmake document definition shared by the download and render paths. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfmake doc definition has no types
function buildDocDefinition(doc: RenderableDocument, font = 'Roboto'): any {
  const accent = ACCENT_HEX[doc.accent];
  const PAGE_WIDTH = 495; // A4 at default margins

  // ── Header Section ────────────────────────────────────────────────────────
  const content: any[] = [
    // Bold accent top bar
    {
      canvas: [
        { type: 'line', x1: 0, y1: 0, x2: PAGE_WIDTH, y2: 0, lineWidth: 3, lineColor: accent },
        {
          type: 'line',
          x1: 0,
          y1: 4,
          x2: PAGE_WIDTH,
          y2: 4,
          lineWidth: 0.5,
          lineColor: accent,
          opacity: 0.3,
        },
      ],
      margin: [0, 0, 0, 18],
    },
    // Org name
    { text: doc.orgName.toUpperCase(), style: 'orgName', color: accent },
    // Title
    { text: doc.title, style: 'title' },
    // Meta: generated date
    {
      text: `${doc.labels.generatedOn} ${formatDate(doc.now)}`,
      style: 'meta',
      margin: [0, 4, 0, 0],
    },
    // Decorative accent divider (short)
    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 70, y2: 0, lineWidth: 2, lineColor: accent }],
      margin: [0, 22, 0, 28],
    },
  ];

  // ── Body Content ──────────────────────────────────────────────────────────
  const bodyBlocks = buildBodyContent(doc.body);
  content.push(...bodyBlocks);

  // ── Signature Block ───────────────────────────────────────────────────────
  if (doc.signature) {
    // Accent divider before signature
    content.push({
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 0,
          x2: PAGE_WIDTH,
          y2: 0,
          lineWidth: 0.5,
          lineColor: accent,
          opacity: 0.3,
        },
      ],
      margin: [0, 28, 0, 20],
    });

    content.push({
      text: doc.labels.signature,
      style: 'signatureTitle',
      color: accent,
    });

    const signed = doc.signed;

    // Name / Position column
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfmake column content
    const nameCol: any[] = [
      signed?.signatureData
        ? { image: signed.signatureData, fit: [180, 44], margin: [0, 0, 0, 4] }
        : { text: ' ', margin: [0, 10, 0, 0] },
      {
        canvas: [
          { type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.7, lineColor: '#94a3b8' },
        ],
      },
      { text: doc.labels.name, style: 'sigLabel' },
    ];
    if (signed?.signerName) {
      nameCol.push({ text: signed.signerName, style: 'sigValue' });
    } else {
      nameCol.push({ text: '_________________________', style: 'sigPlaceholder' });
    }

    // Position column
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfmake column content
    const posCol: any[] = [
      { text: ' ', margin: [0, 10, 0, 0] },
      {
        canvas: [
          { type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.7, lineColor: '#94a3b8' },
        ],
      },
      { text: doc.labels.position, style: 'sigLabel' },
      { text: '_________________________', style: 'sigPlaceholder' },
    ];

    // Date column
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfmake column content
    const dateCol: any[] = [
      { text: ' ', margin: [0, 10, 0, 0] },
      {
        canvas: [
          { type: 'line', x1: 0, y1: 0, x2: 140, y2: 0, lineWidth: 0.7, lineColor: '#94a3b8' },
        ],
      },
      { text: doc.labels.date, style: 'sigLabel' },
    ];
    if (signed?.signedAt) {
      dateCol.push({ text: new Date(signed.signedAt).toLocaleDateString(), style: 'sigValue' });
    } else {
      dateCol.push({ text: '_________________', style: 'sigPlaceholder' });
    }

    content.push({
      columns: [
        { width: 220, stack: nameCol },
        { width: '*', stack: posCol },
        { width: 160, stack: dateCol },
      ],
      columnGap: 16,
      margin: [0, 12, 0, 0],
    });
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerParts = [`${doc.labels.generatedOn} ${formatDate(doc.now)}`];
  if (doc.contentHash)
    footerParts.push(`${doc.labels.integrity}: ${doc.contentHash?.slice(0, 16)}…`);

  return {
    content,
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        {
          text: footerParts.join('   ·   '),
          style: 'footer',
          alignment: 'left',
        },
        {
          text: `${currentPage} / ${pageCount}`,
          style: 'footer',
          alignment: 'right',
        },
      ],
      margin: [60, 0, 60, 24],
    }),
    styles: {
      orgName: { fontSize: 9, bold: true, letterSpacing: 1.5, margin: [0, 0, 0, 2] },
      title: { fontSize: 22, bold: true, color: '#1e293b', margin: [0, 0, 0, 2] },
      meta: { fontSize: 8, color: '#94a3b8', italics: true },
      sectionHeader: { fontSize: 12, bold: true, color: '#1e293b', margin: [0, 20, 0, 6] },
      body: { fontSize: 10, lineHeight: 1.65, color: '#334155', alignment: 'justify' },
      bulletItem: { fontSize: 10, lineHeight: 1.55, color: '#334155', margin: [0, 0, 0, 3] },
      signatureTitle: { fontSize: 11, bold: true, margin: [0, 0, 0, 12] },
      sigLabel: { fontSize: 8, color: '#94a3b8', italics: true, margin: [0, 4, 0, 0] },
      sigValue: { fontSize: 10, color: '#1e293b', bold: true, margin: [0, 2, 0, 0] },
      sigPlaceholder: { fontSize: 10, color: '#64748b', margin: [0, 2, 0, 0] },
      footer: { fontSize: 7, color: '#94a3b8' },
    },
    defaultStyle: { font, fontSize: 10, color: '#334155' },
    pageMargins: [60, 48, 60, 64],
    pageSize: 'A4',
  };
}

export async function exportDocumentToPDF(
  doc: RenderableDocument,
  filename = 'document.pdf',
): Promise<{ success: boolean }> {
  const { pdfMake, font } = await loadPdfMakeWithFonts();
  pdfMake.createPdf(buildDocDefinition(doc, font)).download(filename);
  return { success: true };
}

/**
 * Render the themed document and return it as a base64 PDF data URL. Used to
 * upload a permanent signed copy to storage. Rejects (rather than hanging) if
 * pdfmake never invokes its callback — e.g. if fonts fail to load.
 */
export async function renderDocumentPdfBase64(doc: RenderableDocument): Promise<string> {
  const { pdfMake, font } = await loadPdfMakeWithFonts();
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('PDF rendering timed out'));
    }, 30000);

    try {
      pdfMake.createPdf(buildDocDefinition(doc, font)).getBase64((data: string) => {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- docx types conflict with dynamic import
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle }: any =
    await loadDocx();

  const accentHex = ACCENT_HEX[doc.accent].replace('#', '');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- docx Paragraph children
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
