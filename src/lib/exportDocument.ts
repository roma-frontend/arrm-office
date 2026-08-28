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
  /**
   * Stable party id (`recipient`, `issuer`, …). Optional because documents
   * frozen before it existed match their signatures by signing order instead.
   */
  id?: string;
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
 * Blocks that can appear inside a bilingual column. Excludes `bilingual` itself
 * so a column can never nest another two-column split.
 */
export type DocumentLeafBlock =
  | DocumentSectionBlock
  | DocumentParagraphBlock
  | DocumentFieldsBlock
  | DocumentBulletsBlock
  | DocumentCalloutBlock
  | DocumentSignaturesBlock
  | DocumentSpacerBlock;

/**
 * Two parallel language columns on one A4 page — the layout Armenian labour law
 * expects for contracts issued to a non-Armenian speaker: the mandatory
 * Armenian text on the left, its translation on the right.
 *
 * Rendered as a borderless 2-column table (NOT pdfmake `columns`) so the two
 * languages stay aligned paragraph-by-paragraph: each pair of corresponding
 * blocks shares a table row, and a longer Armenian paragraph pushes its
 * translation down with it. `columns` would let the two sides drift apart after
 * the first length mismatch.
 */
export interface DocumentBilingualBlock {
  type: 'bilingual';
  /** Left column — the legally binding Armenian text. */
  left: DocumentLeafBlock[];
  /** Right column — the translation in the employee's language. */
  right: DocumentLeafBlock[];
  /** Optional column captions, e.g. "ՀԱՅԵՐԵՆ" / "РУССКИЙ". */
  leftLabel?: string;
  rightLabel?: string;
}

/**
 * Typed content block. Structured bodies replace the old "one big string that
 * the renderer tries to reverse-engineer" approach, which collapsed formal
 * acts into a single justified paragraph.
 */
export type DocumentBlock = DocumentLeafBlock | DocumentBilingualBlock;

/** Either legacy plain text (heuristically laid out) or typed blocks. */
export type DocumentBody = string | DocumentBlock[];

export function isBlockBody(body: DocumentBody): body is DocumentBlock[] {
  return Array.isArray(body);
}

/**
 * Does this body already render its own signature grid (at top level or inside
 * a bilingual column)? If so, the generic signature block must not be appended.
 */
export function containsSignatures(blocks: DocumentBlock[]): boolean {
  return blocks.some((block) => {
    if (block.type === 'signatures') return true;
    if (block.type === 'bilingual') {
      return (
        block.left.some((b) => b.type === 'signatures') ||
        block.right.some((b) => b.type === 'signatures')
      );
    }
    return false;
  });
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
      case 'bilingual': {
        // Plain text cannot hold two columns; emit the two languages
        // sequentially with their captions so the preview stays readable.
        if (block.leftLabel) out.push(`[${block.leftLabel}]`);
        out.push(documentBodyToPlainText(block.left));
        out.push('');
        if (block.rightLabel) out.push(`[${block.rightLabel}]`);
        out.push(documentBodyToPlainText(block.right));
        out.push('');
        break;
      }
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
export async function loadPdfMakeWithFonts(): Promise<{ pdfMake: any; font: string }> {
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

/** Horizontal gutter between the two language columns of a bilingual block. */
const BILINGUAL_GUTTER = 18;

/** Stack for a single signing party inside a `signatures` block. */
function signaturePartyStack(
  party: DocumentSignatureParty,
  accent: string,
  lineWidth = 190,
): any[] {
  const stack: any[] = [{ text: party.role, style: 'sigRole', color: accent }];
  stack.push(
    party.signatureImage
      ? { image: party.signatureImage, fit: [Math.min(150, lineWidth), 38], margin: [0, 2, 0, 2] }
      : { text: ' ', margin: [0, 16, 0, 0] },
  );
  stack.push({
    canvas: [
      { type: 'line', x1: 0, y1: 0, x2: lineWidth, y2: 0, lineWidth: 0.7, lineColor: '#94a3b8' },
    ],
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
 *
 * `width` is the available content width in pt. It shrinks when rendering inside
 * a bilingual column so section rules and signature lines don't overflow.
 */
function buildStructuredContent(
  blocks: DocumentBlock[],
  accent: string,
  width = PAGE_WIDTH,
): any[] {
  const content: any[] = [];
  const narrow = width < PAGE_WIDTH * 0.75;

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
              x2: width,
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
            widths: [narrow ? Math.round(width * 0.44) : 155, '*'],
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
        const lineWidth = Math.max(90, Math.floor((width - 28) / parties.length) - 10);
        content.push({
          columns: parties.map((party) => ({
            width: '*',
            stack: signaturePartyStack(party, accent, lineWidth),
          })),
          columnGap: narrow ? 14 : 28,
          margin: [0, 4, 0, 0],
        });
        break;
      }

      case 'bilingual': {
        const colWidth = Math.floor((width - BILINGUAL_GUTTER) / 2);
        const rowCount = Math.max(block.left.length, block.right.length);
        if (!rowCount) break;

        const body: any[][] = [];

        if (block.leftLabel || block.rightLabel) {
          body.push([
            { text: block.leftLabel ?? '', style: 'langCaption', color: accent },
            { text: block.rightLabel ?? '', style: 'langCaption', color: accent },
          ]);
        }

        // One table row per block pair keeps the two languages aligned: a longer
        // Armenian paragraph grows its row and pushes the translation down with
        // it, instead of the columns drifting out of sync.
        for (let i = 0; i < rowCount; i++) {
          const leftBlock = block.left[i];
          const rightBlock = block.right[i];
          body.push([
            {
              stack: leftBlock
                ? buildStructuredContent([leftBlock], accent, colWidth)
                : [{ text: '' }],
            },
            {
              stack: rightBlock
                ? buildStructuredContent([rightBlock], accent, colWidth)
                : [{ text: '' }],
            },
          ]);
        }

        content.push({
          table: { widths: [colWidth, '*'], body, dontBreakRows: true },
          layout: {
            hLineWidth: () => 0,
            // Hairline gutter rule between the two languages.
            vLineWidth: (i: number) => (i === 1 ? 0.5 : 0),
            vLineColor: () => '#e2e8f0',
            paddingLeft: (i: number) => (i === 0 ? 0 : BILINGUAL_GUTTER / 2),
            paddingRight: (i: number) => (i === 0 ? BILINGUAL_GUTTER / 2 : 0),
            paddingTop: () => 0,
            paddingBottom: () => 0,
          },
          margin: [0, 0, 0, 10],
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
  // one on top of it. Bilingual columns count too: a two-language contract puts
  // the signature grid inside its columns.
  const hasOwnSignatures = structured && containsSignatures(doc.body as DocumentBlock[]);

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
      langCaption: {
        fontSize: 7.5,
        bold: true,
        letterSpacing: 1.2,
        margin: [0, 0, 0, 8],
      },
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

/**
 * Font used for every run in the DOCX output.
 *
 * Word's default (Calibri/Aptos) has no Armenian glyphs, so an `hy` document
 * silently rendered as boxes. Sylfaen ships with Windows and Office and covers
 * Latin + Cyrillic + Armenian in one face — the same requirement that forces
 * DejaVu Sans on the PDF side. Unlike the PDF path we cannot embed the font, so
 * this relies on the reader having Sylfaen installed; Word substitutes a
 * Unicode-capable face if not.
 */
const DOCX_FONT = 'Sylfaen';

/** Half-point sizes used by the `docx` library (22 = 11pt). */
const DOCX_SIZE = {
  orgName: 22,
  title: 36,
  subtitle: 24,
  meta: 16,
  section: 22,
  body: 22,
  fieldLabel: 18,
  fieldValue: 20,
  sigLabel: 16,
  sigValue: 20,
  footer: 14,
} as const;

/** Decode a base64 (optionally `data:`-prefixed) payload into bytes. */
function dataUrlToUint8Array(dataUrl: string): Uint8Array | null {
  try {
    const commaIndex = dataUrl.indexOf(',');
    const payload =
      dataUrl.startsWith('data:') && commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

interface DocxKit {
  Paragraph: any;
  TextRun: any;
  ImageRun: any;
  Table: any;
  TableRow: any;
  TableCell: any;
  WidthType: any;
  BorderStyle: any;
  AlignmentType: any;
  HeadingLevel: any;
  accentHex: string;
}

/**
 * Options controlling how much chrome the DOCX carries.
 *
 * `editable: true` produces the round-trip file handed to HR: only the title
 * (as a single `Heading 1`) and the body, with sections as real Word headings.
 * The letterhead, meta line, signature grid and integrity footer are omitted on
 * purpose — they are always re-rendered by the platform, so an edited file can
 * never carry a forged signature block or a stale hash, and the importer can
 * treat every element it sees as body content.
 */
interface DocxRenderOptions {
  editable?: boolean;
}

/** A run with the document font applied — every run must go through this. */
function run(kit: DocxKit, text: string, opts: Record<string, unknown> = {}): any {
  return new kit.TextRun({ text, font: DOCX_FONT, size: DOCX_SIZE.body, ...opts });
}

function noBorders(kit: DocxKit) {
  const none = { style: kit.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return { top: none, bottom: none, left: none, right: none };
}

/** Signature lines (and the drawn signature image, when signed) for one party. */
function docxSignatureParty(kit: DocxKit, party: DocumentSignatureParty): any[] {
  const out: any[] = [
    new kit.Paragraph({
      children: [
        run(kit, party.role, { bold: true, size: DOCX_SIZE.sigLabel, color: kit.accentHex }),
      ],
      spacing: { before: 160, after: 40 },
    }),
  ];

  const imageBytes = party.signatureImage ? dataUrlToUint8Array(party.signatureImage) : null;
  if (imageBytes) {
    out.push(
      new kit.Paragraph({
        children: [
          new kit.ImageRun({
            data: imageBytes,
            transformation: { width: 150, height: 50 },
            type: 'png',
          }),
        ],
        spacing: { after: 40 },
      }),
    );
  }

  out.push(
    new kit.Paragraph({
      children: [run(kit, '__________________________________', { color: '94A3B8' })],
      spacing: { after: 40 },
    }),
    new kit.Paragraph({
      children: [
        run(kit, `${party.nameLabel}: `, { size: DOCX_SIZE.sigLabel, color: '94A3B8' }),
        run(kit, party.name || '—', { size: DOCX_SIZE.sigValue, bold: true }),
      ],
      spacing: { after: 20 },
    }),
  );

  if (party.positionLabel) {
    out.push(
      new kit.Paragraph({
        children: [
          run(kit, `${party.positionLabel}: `, { size: DOCX_SIZE.sigLabel, color: '94A3B8' }),
          run(kit, party.position || '—', { size: DOCX_SIZE.sigValue }),
        ],
        spacing: { after: 20 },
      }),
    );
  }

  out.push(
    new kit.Paragraph({
      children: [
        run(kit, `${party.dateLabel}: `, { size: DOCX_SIZE.sigLabel, color: '94A3B8' }),
        run(kit, party.date || '____________', { size: DOCX_SIZE.sigValue }),
      ],
      spacing: { after: 120 },
    }),
  );

  return out;
}

/**
 * Render typed blocks into `docx` elements, mirroring the PDF layout: ruled
 * section headings, borderless definition tables, and a two-column table for
 * bilingual content. Replaces the previous approach of flattening everything to
 * plain text, which lost tables, columns and signature images.
 */
function buildDocxBlocks(
  kit: DocxKit,
  blocks: DocumentBlock[],
  opts: DocxRenderOptions = {},
): any[] {
  const out: any[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'section': {
        const title = ((block.index != null ? `${block.index}. ` : '') + block.title).toUpperCase();
        out.push(
          new kit.Paragraph({
            // A real Word heading (not just bold text) so Word's navigation pane
            // works AND so `mammoth` emits <h2> on re-import, letting the
            // round-trip importer recover this block as a section.
            heading: kit.HeadingLevel.HEADING_2,
            children: [
              run(kit, title, { bold: true, size: DOCX_SIZE.section, color: kit.accentHex }),
            ],
            border: {
              bottom: { style: kit.BorderStyle.SINGLE, size: 6, color: kit.accentHex, space: 2 },
            },
            spacing: { before: 280, after: 160 },
          }),
        );
        break;
      }

      case 'fields': {
        const rows = block.rows.filter((row) => row.label);
        if (!rows.length) break;
        out.push(
          new kit.Table({
            width: { size: 100, type: kit.WidthType.PERCENTAGE },
            borders: noBorders(kit),
            rows: rows.map(
              (row) =>
                new kit.TableRow({
                  children: [
                    new kit.TableCell({
                      width: { size: 40, type: kit.WidthType.PERCENTAGE },
                      borders: noBorders(kit),
                      children: [
                        new kit.Paragraph({
                          children: [
                            run(kit, row.label, { size: DOCX_SIZE.fieldLabel, color: '64748B' }),
                          ],
                        }),
                      ],
                    }),
                    new kit.TableCell({
                      width: { size: 60, type: kit.WidthType.PERCENTAGE },
                      borders: noBorders(kit),
                      children: [
                        new kit.Paragraph({
                          children: [
                            run(kit, row.value || '—', { size: DOCX_SIZE.fieldValue, bold: true }),
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
            ),
          }),
          new kit.Paragraph({ children: [run(kit, '')], spacing: { after: 120 } }),
        );
        break;
      }

      case 'bullets': {
        const items = block.items.filter(Boolean);
        if (!items.length) break;
        for (const item of items) {
          out.push(
            new kit.Paragraph({
              children: [run(kit, item)],
              bullet: { level: 0 },
              spacing: { after: 60 },
            }),
          );
        }
        break;
      }

      case 'paragraph':
        out.push(
          new kit.Paragraph({
            children: [
              run(kit, block.text, block.muted ? { size: 18, italics: true, color: '64748B' } : {}),
            ],
            alignment: block.muted ? undefined : kit.AlignmentType.JUSTIFIED,
            spacing: { after: 140 },
          }),
        );
        break;

      case 'callout':
        out.push(
          new kit.Paragraph({
            children: [run(kit, block.text, { size: 19 })],
            shading: { fill: 'F8FAFC' },
            border: {
              left: { style: kit.BorderStyle.SINGLE, size: 18, color: kit.accentHex, space: 8 },
            },
            spacing: { before: 120, after: 160 },
          }),
        );
        break;

      case 'signatures': {
        // The editable round-trip file never carries signature lines: they are
        // re-rendered from the actual signing record, so an edited document
        // cannot smuggle in a pre-filled or forged signature block.
        if (opts.editable) break;
        const parties = block.parties.slice(0, 2);
        if (!parties.length) break;
        if (parties.length === 1) {
          out.push(...docxSignatureParty(kit, parties[0]!));
          break;
        }
        out.push(
          new kit.Table({
            width: { size: 100, type: kit.WidthType.PERCENTAGE },
            borders: noBorders(kit),
            rows: [
              new kit.TableRow({
                children: parties.map(
                  (party) =>
                    new kit.TableCell({
                      width: { size: 50, type: kit.WidthType.PERCENTAGE },
                      borders: noBorders(kit),
                      children: docxSignatureParty(kit, party),
                    }),
                ),
              }),
            ],
          }),
        );
        break;
      }

      case 'bilingual': {
        const rowCount = Math.max(block.left.length, block.right.length);
        if (!rowCount) break;

        const rows: any[] = [];

        // Captions are chrome, not content: emitting them in the editable file
        // would make the importer read them back as a content pair.
        if (!opts.editable && (block.leftLabel || block.rightLabel)) {
          rows.push(
            new kit.TableRow({
              children: [block.leftLabel ?? '', block.rightLabel ?? ''].map(
                (caption) =>
                  new kit.TableCell({
                    width: { size: 50, type: kit.WidthType.PERCENTAGE },
                    borders: noBorders(kit),
                    children: [
                      new kit.Paragraph({
                        children: [
                          run(kit, caption, { bold: true, size: 15, color: kit.accentHex }),
                        ],
                        spacing: { after: 120 },
                      }),
                    ],
                  }),
              ),
            }),
          );
        }

        // One row per block pair — the same alignment guarantee as the PDF, and
        // it survives a round trip through Word because the table structure is
        // what the importer looks for.
        for (let i = 0; i < rowCount; i++) {
          const leftBlock = block.left[i];
          const rightBlock = block.right[i];
          rows.push(
            new kit.TableRow({
              children: [leftBlock, rightBlock].map(
                (sub) =>
                  new kit.TableCell({
                    width: { size: 50, type: kit.WidthType.PERCENTAGE },
                    borders: noBorders(kit),
                    children: sub
                      ? buildDocxBlocks(kit, [sub], opts)
                      : [new kit.Paragraph({ children: [run(kit, '')] })],
                  }),
              ),
            }),
          );
        }

        out.push(
          new kit.Table({
            width: { size: 100, type: kit.WidthType.PERCENTAGE },
            borders: noBorders(kit),
            rows,
          }),
        );
        break;
      }

      case 'spacer':
        out.push(
          new kit.Paragraph({
            children: [run(kit, '')],
            spacing: { after: (block.size ?? 8) * 20 },
          }),
        );
        break;
    }
  }

  return out;
}

/** Assemble the full `docx` child list for a renderable document. */
async function buildDocxChildren(
  doc: RenderableDocument,
  opts: DocxRenderOptions = {},
): Promise<{ children: any[]; Document: any; Packer: any }> {
  const mod: any = await loadDocx();
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    ImageRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    HeadingLevel,
    AlignmentType,
    BorderStyle,
  } = mod;

  const accentHex = ACCENT_HEX[doc.accent].replace('#', '').toUpperCase();
  const kit: DocxKit = {
    Paragraph,
    TextRun,
    ImageRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    AlignmentType,
    HeadingLevel,
    accentHex,
  };

  // ── Editable round-trip file: exactly one H1 (the title) + the body ───────
  if (opts.editable) {
    const children: any[] = [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [run(kit, doc.title, { bold: true, size: DOCX_SIZE.title, color: accentHex })],
        spacing: { after: 240 },
      }),
      ...(isBlockBody(doc.body)
        ? buildDocxBlocks(kit, doc.body, opts)
        : paragraphs(documentBodyToPlainText(doc.body)).map(
            (line) => new Paragraph({ children: [run(kit, line)], spacing: { after: 120 } }),
          )),
    ];
    return { children, Document, Packer };
  }

  const children: any[] = [
    new Paragraph({
      children: [
        run(kit, doc.orgName.toUpperCase(), {
          bold: true,
          size: DOCX_SIZE.orgName,
          color: accentHex,
        }),
      ],
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: accentHex, space: 4 } },
      spacing: { after: 240 },
    }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [run(kit, doc.title, { bold: true, size: DOCX_SIZE.title, color: accentHex })],
      spacing: { after: doc.subtitle ? 80 : 200 },
    }),
  ];

  if (doc.subtitle) {
    children.push(
      new Paragraph({
        children: [run(kit, doc.subtitle, { size: DOCX_SIZE.subtitle, color: '475569' })],
        spacing: { after: 160 },
      }),
    );
  }

  const metaParts = [`${doc.labels.generatedOn} ${formatDate(doc.now, doc.lang)}`];
  if (doc.documentNumber) metaParts.unshift(doc.documentNumber);
  children.push(
    new Paragraph({
      children: [
        run(kit, metaParts.join('   ·   '), {
          size: DOCX_SIZE.meta,
          color: '94A3B8',
          italics: true,
        }),
      ],
      spacing: { after: 280 },
    }),
  );

  // Body: structured blocks render richly; a legacy string body keeps the old
  // line-by-line behaviour.
  if (isBlockBody(doc.body)) {
    children.push(...buildDocxBlocks(kit, doc.body, opts));
  } else {
    children.push(
      ...paragraphs(documentBodyToPlainText(doc.body)).map(
        (line) =>
          new Paragraph({
            children: [run(kit, line)],
            spacing: { after: 120 },
          }),
      ),
    );
  }

  const hasOwnSignatures = isBlockBody(doc.body) && containsSignatures(doc.body);
  if (doc.signature && !hasOwnSignatures) {
    const signed = doc.signed;
    children.push(
      ...docxSignatureParty(kit, {
        role: doc.labels.signature,
        nameLabel: doc.labels.name,
        name: signed?.signerName ?? '',
        dateLabel: doc.labels.date,
        date: signed?.signedAt ? formatDate(signed.signedAt, doc.lang) : undefined,
        positionLabel: doc.labels.position,
        signatureImage: signed?.signatureData,
      }),
    );
  }

  const footerParts = [`${doc.labels.generatedOn} ${formatDate(doc.now, doc.lang)}`];
  if (doc.documentNumber) footerParts.unshift(doc.documentNumber);
  if (doc.contentHash) footerParts.push(`${doc.labels.integrity}: ${doc.contentHash}`);
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        run(kit, footerParts.join('   ·   '), { size: DOCX_SIZE.footer, color: '94A3B8' }),
      ],
      spacing: { before: 480 },
    }),
  );

  return { children, Document, Packer };
}

/** Render a renderable document to a DOCX Blob (no download). */
export async function renderDocumentDocxBlob(doc: RenderableDocument): Promise<Blob> {
  const { children, Document, Packer } = await buildDocxChildren(doc);
  const document = new Document({
    sections: [{ children }],
    styles: { default: { document: { run: { font: DOCX_FONT } } } },
  });
  return (await Packer.toBlob(document)) as Blob;
}

/**
 * Render the round-trip ("edit in Word") copy: title + body only.
 *
 * Pair with `parseEditableDocx` in `docxRoundTrip.ts` — the two must stay in
 * sync, since the importer recovers block types from the structure this writes
 * (single H1 = title, H2 = section, top-level 2-column table = bilingual pair,
 * nested table = definition fields, list = bullets).
 */
export async function renderEditableDocxBlob(doc: RenderableDocument): Promise<Blob> {
  const { children, Document, Packer } = await buildDocxChildren(doc, { editable: true });
  const document = new Document({
    sections: [{ children }],
    styles: { default: { document: { run: { font: DOCX_FONT } } } },
  });
  return (await Packer.toBlob(document)) as Blob;
}

export async function exportDocumentToDOCX(
  doc: RenderableDocument,
  filename = 'document.docx',
): Promise<{ success: boolean }> {
  const blob = await renderDocumentDocxBlob(doc);
  triggerDownload(blob, filename);
  return { success: true };
}

/** Download the editable round-trip DOCX. */
export async function exportEditableDocx(
  doc: RenderableDocument,
  filename = 'document.docx',
): Promise<{ success: boolean }> {
  const blob = await renderEditableDocxBlob(doc);
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
