/**
 * Word round trip: read an edited `.docx` back into our document block model.
 *
 * Why this exists: HR sometimes needs a clause that no template covers. Instead
 * of forcing them to request a new template, they download the generated
 * document, edit it in Word, and upload it back — and the platform keeps
 * treating it as a first-class document (bilingual layout, PDF/DOCX export,
 * e-signature, integrity hash) rather than an opaque attachment.
 *
 * The importer is the exact inverse of `renderEditableDocxBlob`
 * (`exportDocument.ts`), which writes a deliberately simple structure:
 *
 *   | Word structure                     | Block                        |
 *   | ---------------------------------- | ---------------------------- |
 *   | first `Heading 1`                  | document title (not a block) |
 *   | `Heading 2`…`Heading 6`            | `section`                    |
 *   | top-level 2-column table           | `bilingual` (one row = pair) |
 *   | table inside a cell                | `fields`                     |
 *   | `ul` / `ol`                        | `bullets`                    |
 *   | any other paragraph                | `paragraph`                  |
 *
 * Formatting Word offers but our model has no place for (fonts, colours, images,
 * nested numbering) is intentionally dropped: the model is what drives the PDF,
 * the signature block and the integrity hash, so anything we cannot represent
 * must not silently survive into a legally binding document.
 */

import { loadMammoth } from './dynamic-imports';
import type { DocumentBlock, DocumentLeafBlock, DocumentFieldRow } from './exportDocument';

export interface ParseEditableDocxOptions {
  /**
   * Whether the document being re-imported is bilingual. Required because a
   * top-level 2-column table is ambiguous on its own: in a bilingual document it
   * is a language pair, in a single-language document it is a definition table.
   * The caller always knows which kind it exported.
   */
  bilingual: boolean;
  /** Column captions to re-attach (they are omitted from the editable file). */
  leftLabel?: string;
  rightLabel?: string;
}

export interface ParsedEditableDocx {
  /** Text of the leading `Heading 1`, if the editor kept it. */
  title?: string;
  blocks: DocumentBlock[];
  /** Non-fatal notes surfaced to the user (dropped images, empty document…). */
  warnings: string[];
}

/** Thrown when the upload is not a readable .docx at all. */
export class DocxImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocxImportError';
  }
}

/** Collapse Word's whitespace (incl. non-breaking spaces) into single spaces. */
function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Section headings are written upper-cased with an optional `N.` ordinal. */
function parseSectionTitle(raw: string): { title: string; index?: number } {
  const match = /^(\d+)\s*[.)]\s*(.+)$/.exec(raw);
  if (match?.[1] && match[2]) {
    return { title: match[2].trim(), index: Number(match[1]) };
  }
  return { title: raw };
}

function rowsOf(table: Element): Element[] {
  // A <tbody> may or may not be present depending on the HTML parser.
  return Array.from(table.querySelectorAll(':scope > tr, :scope > tbody > tr'));
}

function cellsOf(row: Element): Element[] {
  return Array.from(row.querySelectorAll(':scope > td, :scope > th'));
}

/** Does this element subtree contain any text at all? */
function hasText(el: Element): boolean {
  return normalizeText(el.textContent).length > 0;
}

/**
 * Convert a nested table into definition rows. Cells beyond the second are
 * appended to the value so no edited text is lost.
 */
function tableToFieldRows(table: Element): DocumentFieldRow[] {
  const out: DocumentFieldRow[] = [];
  for (const row of rowsOf(table)) {
    const cells = cellsOf(row);
    if (!cells.length) continue;
    const label = normalizeText(cells[0]?.textContent);
    const value = cells
      .slice(1)
      .map((c) => normalizeText(c.textContent))
      .filter(Boolean)
      .join(' · ');
    if (!label && !value) continue;
    out.push({ label, value });
  }
  return out;
}

/**
 * Parse a flat list of sibling elements into leaf blocks.
 * `depth > 0` means we are inside a bilingual column, where a table is a
 * definition table rather than another language split.
 */
function parseLeafElements(elements: Element[], warnings: string[]): DocumentLeafBlock[] {
  const blocks: DocumentLeafBlock[] = [];

  for (const el of elements) {
    const tag = el.tagName.toLowerCase();

    if (/^h[1-6]$/.test(tag)) {
      const raw = normalizeText(el.textContent);
      if (!raw) continue;
      const { title, index } = parseSectionTitle(raw);
      blocks.push(index != null ? { type: 'section', title, index } : { type: 'section', title });
      continue;
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(el.querySelectorAll(':scope > li'))
        .map((li) => normalizeText(li.textContent))
        .filter(Boolean);
      if (items.length) blocks.push({ type: 'bullets', items });
      continue;
    }

    if (tag === 'table') {
      const rows = tableToFieldRows(el);
      if (rows.length) blocks.push({ type: 'fields', rows });
      continue;
    }

    if (tag === 'p' || tag === 'div') {
      const text = normalizeText(el.textContent);
      // Empty paragraphs are Word's spacing habit, not content.
      if (!text) continue;
      blocks.push({ type: 'paragraph', text });
      continue;
    }

    if (tag === 'img') {
      warnings.push('An embedded image was removed — images are not part of a signed document.');
      continue;
    }

    // Anything unexpected still contributes its text rather than vanishing.
    const fallback = normalizeText(el.textContent);
    if (fallback) blocks.push({ type: 'paragraph', text: fallback });
  }

  return blocks;
}

/** Cell content → leaf blocks (a cell may hold several paragraphs / a table). */
function parseCell(cell: Element | undefined, warnings: string[]): DocumentLeafBlock[] {
  if (!cell) return [];
  const children = Array.from(cell.children);
  if (children.length === 0) {
    const text = normalizeText(cell.textContent);
    return text ? [{ type: 'paragraph', text }] : [];
  }
  return parseLeafElements(children, warnings);
}

/**
 * Minimal shape of the mammoth entry point we rely on.
 *
 * mammoth's own `Input` type is a union of `{ arrayBuffer }` (browser) and
 * `{ buffer } | { path }` (Node), which makes it impossible to pass both keys at
 * once — see {@link convertToHtml} for why we must.
 */
interface MammothLike {
  convertToHtml: (input: Record<string, unknown>) => Promise<{ value?: string }>;
}

/**
 * Run mammoth against the buffer.
 *
 * mammoth ships two builds that accept disjoint input keys: the browser build
 * only reads `{ arrayBuffer }` (`browser/unzip.js`), the Node build only reads
 * `{ path | buffer | file }` (`lib/unzip.js`). Which one we get depends on how
 * the bundler resolves the package's `browser` field — webpack picks the browser
 * build for the client, Jest picks the Node one. Passing both keys satisfies
 * either build in a single call, so there is no failed first attempt.
 */
async function convertToHtml(mammoth: MammothLike, input: ArrayBuffer): Promise<string> {
  const options: Record<string, unknown> = { arrayBuffer: input };
  if (typeof Buffer !== 'undefined') {
    options.buffer = Buffer.from(input);
  }
  const result = await mammoth.convertToHtml(options);
  return result.value ?? '';
}

/**
 * Parse an edited editable-DOCX buffer back into blocks.
 *
 * Throws {@link DocxImportError} when the file is not a readable .docx or holds
 * no usable content — callers should surface the message and keep the previous
 * version of the document rather than storing an empty body.
 */
export async function parseEditableDocx(
  input: ArrayBuffer,
  options: ParseEditableDocxOptions,
): Promise<ParsedEditableDocx> {
  const warnings: string[] = [];

  const mammoth = (await loadMammoth()) as unknown as MammothLike;
  let html: string;
  try {
    // HTML (not `extractRawText`) because only the HTML output keeps the
    // headings, lists and tables the block types are recovered from.
    html = await convertToHtml(mammoth, input);
  } catch (error) {
    throw new DocxImportError(
      error instanceof Error
        ? `The file could not be read as a Word document: ${error.message}`
        : 'The file could not be read as a Word document.',
    );
  }

  if (!html.trim()) {
    throw new DocxImportError('The uploaded document appears to be empty.');
  }

  const parsed = new DOMParser().parseFromString(
    `<!doctype html><body>${html}</body>`,
    'text/html',
  );
  const topLevel = Array.from(parsed.body.children);

  let title: string | undefined;
  const blocks: DocumentBlock[] = [];
  // Buffers consecutive non-table elements so a document that was edited into a
  // single language still produces sensible blocks.
  let pending: Element[] = [];

  const flushPending = () => {
    if (!pending.length) return;
    blocks.push(...parseLeafElements(pending, warnings));
    pending = [];
  };

  for (const el of topLevel) {
    const tag = el.tagName.toLowerCase();

    // The first H1 is the document title written by the exporter, not content.
    if (tag === 'h1' && title === undefined) {
      title = normalizeText(el.textContent) || undefined;
      continue;
    }

    if (tag === 'table' && options.bilingual) {
      const rows = rowsOf(el).filter(hasText);
      const isTwoColumn = rows.length > 0 && rows.every((row) => cellsOf(row).length === 2);

      if (isTwoColumn) {
        flushPending();
        const left: DocumentLeafBlock[] = [];
        const right: DocumentLeafBlock[] = [];
        for (const row of rows) {
          const cells = cellsOf(row);
          const leftBlocks = parseCell(cells[0], warnings);
          const rightBlocks = parseCell(cells[1], warnings);
          // Keep the two columns index-aligned: a row that produced a different
          // number of blocks per side is padded so pair i stays pair i.
          const pairs = Math.max(leftBlocks.length, rightBlocks.length);
          for (let i = 0; i < pairs; i++) {
            left.push(leftBlocks[i] ?? { type: 'spacer', size: 2 });
            right.push(rightBlocks[i] ?? { type: 'spacer', size: 2 });
          }
        }
        if (left.length || right.length) {
          blocks.push({
            type: 'bilingual',
            left,
            right,
            ...(options.leftLabel ? { leftLabel: options.leftLabel } : {}),
            ...(options.rightLabel ? { rightLabel: options.rightLabel } : {}),
          });
        }
        continue;
      }
      warnings.push('A table without exactly two columns was imported as a plain list of fields.');
    }

    pending.push(el);
  }

  flushPending();

  if (!blocks.length) {
    throw new DocxImportError(
      'No document content was found. Keep the text in the body of the file and try again.',
    );
  }

  // A bilingual document MUST come back bilingual. If the two-column table was
  // dissolved in Word (rows deleted, table converted to text, columns merged),
  // the Armenian column — the legally binding text — would silently vanish into
  // a run of paragraphs. Refuse rather than store a half-language contract.
  if (options.bilingual && !blocks.some((block) => block.type === 'bilingual')) {
    throw new DocxImportError(
      'The two-column layout was lost. Keep the table with the two language columns intact — ' +
        'edit the text inside the cells without deleting or merging them.',
    );
  }

  // Both columns must still carry text: an emptied Armenian column is the same
  // failure as a lost table, just harder to spot.
  if (options.bilingual) {
    const hasContent = (column: DocumentLeafBlock[]): boolean =>
      column.some((block) => block.type !== 'spacer');
    for (const block of blocks) {
      if (block.type !== 'bilingual') continue;
      if (!hasContent(block.left) || !hasContent(block.right)) {
        throw new DocxImportError(
          'One of the language columns came back empty. Both the Armenian column and the ' +
            'translation must contain text.',
        );
      }
    }
  }

  return { title, blocks, warnings };
}
