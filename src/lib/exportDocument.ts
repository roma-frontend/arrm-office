/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- pdfmake/docx have no TS types */
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
import { formatDate as formatLocalizedDate } from './date-format';

/** A numbered/plain section heading with an accent rule underneath. */
export interface DocumentSectionBlock {
  type: 'section';
  title: string;
  /** Optional ordinal rendered as `1.` before the title. */
  index?: number;
}

/** Free-form justified prose (legal terms, acknowledgements…). */
export interface DocumentParagraphBlock {
  type: 'paragraph';
  text: string;
  /** Render smaller/greyed — for hints and legal fine print. */
  muted?: boolean;
}

/** Label → value row of a definition table. */
export interface DocumentFieldRow {
  label: string;
  value: string;
}

/** A definition table: the backbone of a formal act (label left, value right). */
export interface DocumentFieldsBlock {
  type: 'fields';
  rows: DocumentFieldRow[];
}

export interface DocumentBulletsBlock {
  type: 'bullets';
  items: string[];
}

/** Highlighted note with an accent bar on the left. */
export interface DocumentCalloutBlock {
  type: 'callout';
  text: string;
}

/** One signing party of a signature grid. */
export interface DocumentSignatureParty {
  /** Role caption above the line, e.g. "Employee" / "Admin / HR". */
  role: string;
  nameLabel: string;
  name: string;
  dateLabel: string;
  date?: string;
  positionLabel?: string;
  position?: string;
  /** Base64 PNG data URL placed on the signature line when already signed. */
  signatureImage?: string;
}

/** Side-by-side signature lines for every party of the document. */
export interface DocumentSignaturesBlock {
  type: 'signatures';
  parties: DocumentSignatureParty[];
}

export interface DocumentSpacerBlock {
  type: 'spacer';
  /** Vertical gap in pt (default 8). */
  size?: number;
}

/**
 * Typed content block. Structured bodies replace the old "one big string that
 * the renderer tries to reverse-engineer" approach, which collapsed formal
 * acts into a single justified paragraph.
 */
export type DocumentBlock =
  | DocumentSectionBlock
  | DocumentParagraphBlock
  | DocumentFieldsBlock
  | DocumentBulletsBlock
  | DocumentCalloutBlock
  | DocumentSignaturesBlock
  | DocumentSpacerBlock;

/** Either legacy plain text (heuristically laid out) or typed blocks. */
export type DocumentBody = string | DocumentBlock[];

export function isBlockBody(body: DocumentBody): body is DocumentBlock[] {
  return Array.isArray(body);
}

export interface RenderableDocument {
  title: string;
  /** Optional second line under the title (e.g. the asset a form is about). */
  subtitle?: string;
  /** Formal document reference printed in the header meta line. */
  documentNumber?: string;
  /**
   * Body with all {{tokens}} already resolved. A string is split on \n and laid
   * out heuristically; a {@link DocumentBlock} array is rendered structurally.
   */
  body: DocumentBody;
  accent: AccentColor;
  /** Append a signature block (name / position / date placeholders). */
  signature: boolean;
  /** Organization name shown in the header. */
  orgName: string;
  /** Integrity hash shown in the footer (optional). */
  contentHash?: string;
  /** Absolute timestamp used for the "generated on" footer. */
  now: number;
  /**
   * Active i18n language code (`en` | `ru` | `hy` | `de`). Drives date
   * formatting so a Russian document never prints "August 1, 2026".
   */
  lang?: string;
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

/** Long date in the document's language (falls back to English). */
function formatDate(ts: number, lang?: string): string {
  return formatLocalizedDate(ts, lang || 'en', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Flatten a document body to readable plain text. Used for the in-app preview
 * (`whitespace-pre-wrap`) and the DOCX exporter, so every surface shows the same
 * localized content as the PDF.
 */
export function documentBodyToPlainText(body: DocumentBody): string {
  if (!isBlockBody(body)) return body;
  const out: string[] = [];
  for (const block of body) {
    switch (block.type) {
      case 'section':
        if (out.length) out.push('');
        out.push((block.index != null ? `${block.index}. ` : '') + block.title.toUpperCase());
        break;
      case 'fields':
        for (const row of block.rows) out.push(`${row.label}: ${row.value || '—'}`);
        break;
      case 'bullets':
        for (const item of block.items) out.push(`•  ${item}`);
        break;
      case 'paragraph':
      case 'callout':
        out.push(block.text);
        break;
      case 'signatures':
        for (const party of block.parties) {
          out.push(party.role);
          out.push(`${party.nameLabel}: ${party.name || '—'}`);
          if (party.positionLabel) out.push(`${party.positionLabel}: ${party.position || '—'}`);
          out.push(`${party.dateLabel}: ${party.date || '____________'}`);
          out.push('');
        }
        break;
      case 'spacer':
        out.push('');
        break;
    }
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
async function loadPdfMakeWithFonts(): Promise<{ pdfMake: any; font: string }> {
  const pdfMake: any = await loadPdfMake();
  // vfs_fonts registers the default Roboto font family used by pdfmake. In
  // pdfmake 0.3.x the module *is* the vfs map (top-level *.ttf keys); older
  // builds nested it under `.pdfMake.vfs` or `.vfs`. Cover every shape —
  // otherwise createPdf()/getBase64() never invokes its callback and hangs.
  if (!pdfMake.vfs) {
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
    const _nextEmpty = i === rawLines.length - 1 || rawLines[i + 1]?.trim() === '';

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

/** A4 content width at our page margins (60pt each side). */
const PAGE_WIDTH = 495;

/** Stack for a single signing party inside a `signatures` block. */
function signaturePartyStack(party: DocumentSignatureParty, accent: string): any[] {
  const stack: any[] = [{ text: party.role, style: 'sigRole', color: accent }];
  stack.push(
    party.signatureImage
      ? { image: party.signatureImage, fit: [150, 38], margin: [0, 2, 0, 2] }
      : { text: ' ', margin: [0, 16, 0, 0] },
  );
  stack.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 190, y2: 0, lineWidth: 0.7, lineColor: '#94a3b8' }],
    margin: [0, 0, 0, 5],
  });
  stack.push({
    text: [
      { text: `${party.nameLabel}: `, style: 'sigMetaLabel' },
      { text: party.name || '—', style: 'sigMetaValue' },
    ],
    margin: [0, 0, 0, 2],
  });
  if (party.positionLabel) {
    stack.push({
      text: [
        { text: `${party.positionLabel}: `, style: 'sigMetaLabel' },
        { text: party.position || '—', style: 'sigMetaValue' },
      ],
      margin: [0, 0, 0, 2],
    });
  }
  stack.push({
    text: [
      { text: `${party.dateLabel}: `, style: 'sigMetaLabel' },
      { text: party.date || '____________', style: 'sigMetaValue' },
    ],
  });
  return stack;
}

/**
 * Render typed blocks into pdfmake content. Definition tables, ruled section
 * headings and a signature grid give the output the look of a formal act
 * instead of one long justified paragraph.
 */
function buildStructuredContent(blocks: DocumentBlock[], accent: string): any[] {
  const content: any[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'section': {
        const title = (block.index != null ? `${block.index}.  ` : '') + block.title;
        content.push({ text: title.toUpperCase(), style: 'blockSection', color: accent });
        content.push({
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 0,
              x2: PAGE_WIDTH,
              y2: 0,
              lineWidth: 0.75,
              lineColor: accent,
              opacity: 0.4,
            },
          ],
          margin: [0, 3, 0, 11],
        });
        break;
      }

      case 'fields': {
        const rows = block.rows.filter((row) => row.label);
        if (!rows.length) break;
        content.push({
          table: {
            widths: [155, '*'],
            body: rows.map((row) => [
              { text: row.label, style: 'fieldLabel' },
              { text: row.value || '—', style: 'fieldValue' },
            ]),
          },
          layout: {
            hLineWidth: (i: number, node: any) =>
              i === 0 || i === node.table.body.length ? 0 : 0.5,
            vLineWidth: () => 0,
            hLineColor: () => '#e2e8f0',
            paddingTop: () => 5,
            paddingBottom: () => 5,
            paddingLeft: () => 0,
            paddingRight: () => 4,
          },
          margin: [0, 0, 0, 16],
        });
        break;
      }

      case 'bullets': {
        const items = block.items.filter(Boolean);
        if (!items.length) break;
        content.push({ ul: items, style: 'bulletItem', margin: [0, 0, 0, 14] });
        break;
      }

      case 'paragraph':
        content.push({
          text: block.text,
          style: block.muted ? 'blockMuted' : 'body',
          margin: [0, 0, 0, 12],
        });
        break;

      case 'callout':
        content.push({
          table: { widths: ['*'], body: [[{ text: block.text, style: 'callout' }]] },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: (i: number) => (i === 0 ? 2.5 : 0),
            vLineColor: () => accent,
            paddingLeft: () => 10,
            paddingRight: () => 10,
            paddingTop: () => 8,
            paddingBottom: () => 8,
            fillColor: () => '#f8fafc',
          },
          margin: [0, 0, 0, 14],
        });
        break;

      case 'signatures': {
        const parties = block.parties.slice(0, 2);
        if (!parties.length) break;
        content.push({
          columns: parties.map((party) => ({
            width: '*',
            stack: signaturePartyStack(party, accent),
          })),
          columnGap: 28,
          margin: [0, 4, 0, 0],
        });
        break;
      }

      case 'spacer':
        content.push({ text: '', margin: [0, block.size ?? 8, 0, 0] });
        break;
    }
  }

  return content;
}

/** Build the pdfmake document definition shared by the download and render paths. */
function buildDocDefinition(doc: RenderableDocument, font = 'Roboto'): any {
  const accent = ACCENT_HEX[doc.accent];
  const structured = isBlockBody(doc.body);
  // A structured body renders its own signature grid — don't append the generic
  // one on top of it.
  const hasOwnSignatures =
    structured && (doc.body as DocumentBlock[]).some((b) => b.type === 'signatures');

  // ── Header Section ────────────────────────────────────────────────────────
  const metaParts = [`${doc.labels.generatedOn} ${formatDate(doc.now, doc.lang)}`];
  if (doc.documentNumber) metaParts.unshift(doc.documentNumber);

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
  ];

  if (doc.subtitle) {
    content.push({ text: doc.subtitle, style: 'subtitle', margin: [0, 3, 0, 0] });
  }

  content.push(
    // Meta: document reference + generated date
    {
      text: metaParts.join('   ·   '),
      style: 'meta',
      margin: [0, 5, 0, 0],
    },
    // Decorative accent divider (short)
    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 70, y2: 0, lineWidth: 2, lineColor: accent }],
      margin: [0, 20, 0, 26],
    },
  );

  // ── Body Content ──────────────────────────────────────────────────────────
  content.push(
    ...(structured
      ? buildStructuredContent(doc.body as DocumentBlock[], accent)
      : buildBodyContent(doc.body as string)),
  );

  // ── Signature Block ───────────────────────────────────────────────────────
  if (doc.signature && !hasOwnSignatures) {
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
      dateCol.push({ text: formatDate(signed.signedAt, doc.lang), style: 'sigValue' });
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
  const footerParts = [`${doc.labels.generatedOn} ${formatDate(doc.now, doc.lang)}`];
  if (doc.documentNumber) footerParts.unshift(doc.documentNumber);
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
      title: { fontSize: 20, bold: true, color: '#0f172a', margin: [0, 0, 0, 2] },
      subtitle: { fontSize: 12, color: '#475569' },
      meta: { fontSize: 8, color: '#94a3b8', italics: true },
      sectionHeader: { fontSize: 12, bold: true, color: '#1e293b', margin: [0, 20, 0, 6] },
      blockSection: { fontSize: 10, bold: true, letterSpacing: 0.8, margin: [0, 8, 0, 0] },
      blockMuted: { fontSize: 8.5, color: '#64748b', italics: true, lineHeight: 1.5 },
      fieldLabel: { fontSize: 9, color: '#64748b' },
      fieldValue: { fontSize: 10, bold: true, color: '#0f172a' },
      callout: { fontSize: 9.5, color: '#334155', lineHeight: 1.5 },
      body: { fontSize: 10, lineHeight: 1.65, color: '#334155', alignment: 'justify' },
      bulletItem: { fontSize: 10, lineHeight: 1.55, color: '#334155', margin: [0, 0, 0, 3] },
      signatureTitle: { fontSize: 11, bold: true, margin: [0, 0, 0, 12] },
      sigRole: { fontSize: 9, bold: true, letterSpacing: 0.5, margin: [0, 0, 0, 2] },
      sigMetaLabel: { fontSize: 8.5, color: '#94a3b8' },
      sigMetaValue: { fontSize: 9.5, color: '#0f172a', bold: true },
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
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle }: any =
    await loadDocx();

  const accentHex = ACCENT_HEX[doc.accent].replace('#', '');
  const sectionTitles = new Set(
    isBlockBody(doc.body)
      ? doc.body
          .filter((b): b is DocumentSectionBlock => b.type === 'section')
          .map((b) => ((b.index != null ? `${b.index}. ` : '') + b.title).toUpperCase())
      : [],
  );

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
      spacing: { after: doc.subtitle ? 80 : 240 },
    }),
  ];

  if (doc.subtitle) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: doc.subtitle, size: 26, color: '475569' })],
        spacing: { after: 160 },
      }),
    );
  }
  if (doc.documentNumber) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: doc.documentNumber, size: 18, color: '94a3b8' })],
        spacing: { after: 240 },
      }),
    );
  }

  children.push(
    ...paragraphs(documentBodyToPlainText(doc.body)).map((line) => {
      const isSection = sectionTitles.has(line.trim());
      return new Paragraph({
        children: [
          new TextRun({
            text: line,
            size: 22,
            bold: isSection,
            color: isSection ? accentHex : undefined,
          }),
        ],
        spacing: { before: isSection ? 240 : 0, after: 120 },
      });
    }),
  );

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

  const footerParts = [`${doc.labels.generatedOn} ${formatDate(doc.now, doc.lang)}`];
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
