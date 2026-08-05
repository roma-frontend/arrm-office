/**
 * Bilingual hiring-packet documents: build them, and freeze them into the
 * immutable string that `signatureDocuments.content` stores.
 *
 * Layout rule: Armenian is always the left column and is the legally binding
 * text; the employee's chosen language is the right column. Corresponding
 * paragraphs share a row, so the two versions stay readable side by side on one
 * A4 page (see `DocumentBilingualBlock` in `exportDocument.ts`).
 *
 * Storage rule: `signatureDocuments.content` is a plain string, so a structured
 * body is stored as `__HP__` + JSON — the same sentinel trick the asset movement
 * forms use (`__MF__` / `__RF__`). Nothing outside this module should read or
 * write that prefix directly.
 */

import {
  getCatalogTemplate,
  localizedContent,
  type AccentColor,
  type CatalogTemplate,
} from './documentCatalog';
import { resolveTokens, type MergeSourceData } from './documentTokens';
import type { SupportedLocale } from './date-format';
import type {
  DocumentBlock,
  DocumentFieldRow,
  DocumentLabels,
  DocumentLeafBlock,
} from './exportDocument';

/** Armenian is mandatory and always occupies the primary column. */
export const PRIMARY_LOCALE: SupportedLocale = 'hy';

/** Sentinel marking a hiring-packet body inside `signatureDocuments.content`. */
const HP_PREFIX = '__HP__';

/** Native language names used as column captions. */
export const LOCALE_CAPTIONS: Record<SupportedLocale, string> = {
  hy: 'ՀԱՅԵՐԵՆ',
  ru: 'РУССКИЙ',
  en: 'ENGLISH',
  de: 'DEUTSCH',
};

/**
 * Label separators. Armenian uses the "but" mark `՝` (U+055D) where Latin and
 * Cyrillic text use a colon, so a label/value line has to be recognised by
 * either — otherwise the same template would parse into a different block
 * structure per language and the two columns would fall out of alignment.
 */
const LABEL_SEPARATORS = [':', '\u055D'];

const MAX_LABEL_LENGTH = 34;
const MAX_SECTION_LENGTH = 70;

/** Split a label/value line, honouring both separator conventions. */
function splitLabelValue(line: string): DocumentFieldRow | null {
  let best: { index: number; separator: string } | null = null;
  for (const separator of LABEL_SEPARATORS) {
    const index = line.indexOf(separator);
    if (index <= 0) continue;
    if (!best || index < best.index) best = { index, separator };
  }
  if (!best) return null;

  const label = line.slice(0, best.index).trim();
  const value = line.slice(best.index + best.separator.length).trim();
  if (!label || label.length > MAX_LABEL_LENGTH) return null;
  return { label, value };
}

/**
 * A standalone all-caps line is a section heading ("ORDER", "2. DUTIES",
 * "ՊԱՐՏԱԿԱՆՈՒԹՅՈՒՆՆԵՐԸ"). Case comparison works identically for Latin, Cyrillic
 * and Armenian, so both languages of a template classify the same way.
 */
function asSectionBlock(line: string): DocumentLeafBlock | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > MAX_SECTION_LENGTH) return null;
  if (trimmed !== trimmed.toUpperCase()) return null;
  // A line of only digits/punctuation is not a heading.
  if (!/\p{L}/u.test(trimmed)) return null;

  const ordinal = /^(\d+)\s*[.)]\s*(.+)$/.exec(trimmed);
  if (ordinal?.[1] && ordinal[2]) {
    return { type: 'section', title: ordinal[2].trim(), index: Number(ordinal[1]) };
  }
  return { type: 'section', title: trimmed };
}

/**
 * Turn a template body into leaf blocks.
 *
 * The rules key off structure the templates control (blank lines, `- ` bullets,
 * `N.` ordinals, all-caps headings, label separators) rather than on language, so
 * the Armenian and the translated body always yield the same number of blocks in
 * the same order. That is what makes row-by-row pairing meaningful.
 */
export function parseTemplateBodyToBlocks(body: string): DocumentLeafBlock[] {
  const blocks: DocumentLeafBlock[] = [];
  const groups: string[][] = [];
  let current: string[] = [];

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      if (current.length) groups.push(current);
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length) groups.push(current);

  for (const group of groups) {
    // Bullet list.
    if (group.every((line) => /^[-•]\s+/.test(line))) {
      blocks.push({
        type: 'bullets',
        items: group.map((line) => line.replace(/^[-•]\s+/, '')),
      });
      continue;
    }

    // Numbered clauses: one paragraph each, so the numbering survives.
    if (group.length > 1 && group.every((line) => /^\d+[.)]\s/.test(line))) {
      for (const line of group) blocks.push({ type: 'paragraph', text: line });
      continue;
    }

    // Standalone heading.
    if (group.length === 1) {
      const section = asSectionBlock(group[0]!);
      if (section) {
        blocks.push(section);
        continue;
      }
    }

    // Definition list: every line is `Label: value`.
    const rows = group.map(splitLabelValue);
    if (rows.length > 1 && rows.every((row): row is DocumentFieldRow => row !== null)) {
      blocks.push({ type: 'fields', rows });
      continue;
    }

    // Prose. Multi-line groups are joined: the line breaks inside a template
    // paragraph are source formatting, not content.
    blocks.push({ type: 'paragraph', text: group.join(' ') });
  }

  return blocks;
}

/** Pad the shorter column so pair `i` lines up with pair `i` on both sides. */
function alignColumns(
  left: DocumentLeafBlock[],
  right: DocumentLeafBlock[],
): { left: DocumentLeafBlock[]; right: DocumentLeafBlock[] } {
  const length = Math.max(left.length, right.length);
  const pad = (blocks: DocumentLeafBlock[]): DocumentLeafBlock[] => {
    const out = blocks.slice();
    while (out.length < length) out.push({ type: 'spacer', size: 2 });
    return out;
  };
  return { left: pad(left), right: pad(right) };
}

export interface BuildBilingualOptions {
  template: CatalogTemplate;
  data: MergeSourceData;
  secondaryLocale: SupportedLocale;
  labels: DocumentLabels;
  /** Employee name printed under the employee's signature line. */
  employeeName: string;
  signatoryName?: string;
  signatoryPosition?: string;
  /** Omit the signature grid (used for the editable Word export). */
  omitSignatures?: boolean;
}

/**
 * Build the body of a bilingual packet document: one two-column block holding
 * the whole text, followed by a signature grid for the two parties.
 */
export function buildBilingualBlocks(options: BuildBilingualOptions): DocumentBlock[] {
  const { template, data, secondaryLocale, labels } = options;

  const primary = localizedContent(template, PRIMARY_LOCALE);
  const secondary = localizedContent(template, secondaryLocale);

  const primaryBlocks = parseTemplateBodyToBlocks(
    resolveTokens(primary.body, data, PRIMARY_LOCALE),
  );
  const secondaryBlocks = parseTemplateBodyToBlocks(
    resolveTokens(secondary.body, data, secondaryLocale),
  );

  const aligned = alignColumns(primaryBlocks, secondaryBlocks);

  const blocks: DocumentBlock[] = [
    {
      type: 'bilingual',
      left: aligned.left,
      right: aligned.right,
      leftLabel: LOCALE_CAPTIONS[PRIMARY_LOCALE],
      rightLabel: LOCALE_CAPTIONS[secondaryLocale],
    },
  ];

  if (!options.omitSignatures && template.signature) {
    blocks.push({
      type: 'signatures',
      parties: [
        {
          role: labels.signature,
          nameLabel: labels.name,
          name: options.employeeName,
          dateLabel: labels.date,
        },
        {
          role: options.signatoryPosition || labels.position,
          nameLabel: labels.name,
          name: options.signatoryName ?? '',
          positionLabel: labels.position,
          position: options.signatoryPosition,
          dateLabel: labels.date,
        },
      ],
    });
  }

  return blocks;
}

/**
 * Frozen representation of a packet document.
 *
 * Everything needed to re-render the document identically later is captured
 * here — including the static labels — so an archived PDF regenerated months
 * later in a different UI language still matches the signed original.
 */
export interface HiringPacketPayload {
  version: 1;
  templateId: string;
  title: string;
  blocks: DocumentBlock[];
  accent: AccentColor;
  orgName: string;
  documentNumber?: string;
  primaryLocale: SupportedLocale;
  secondaryLocale: SupportedLocale;
  labels: DocumentLabels;
  /** True when the body came from a hand-edited Word upload. */
  edited?: boolean;
}

/** Serialise a packet document for `signatureDocuments.content`. */
export function encodeHiringPacketContent(payload: HiringPacketPayload): string {
  return HP_PREFIX + JSON.stringify(payload);
}

/** Is this `signatureDocuments.content` a hiring-packet body? */
export function isHiringPacketContent(content: string): boolean {
  return content.startsWith(HP_PREFIX);
}

/**
 * Parse a stored packet body. Returns `null` for anything that is not a valid
 * `__HP__` payload, so callers can fall back to treating the content as plain
 * text instead of throwing on legacy or corrupted rows.
 */
export function parseHiringPacketContent(content: string): HiringPacketPayload | null {
  if (!isHiringPacketContent(content)) return null;
  try {
    const parsed: unknown = JSON.parse(content.slice(HP_PREFIX.length));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as HiringPacketPayload).blocks)
    ) {
      return null;
    }
    return parsed as HiringPacketPayload;
  } catch {
    return null;
  }
}

/** One collected signature, in signing order. */
export interface CollectedSignature {
  signerName?: string;
  /** Base64 PNG data URL of the drawn signature. */
  signatureData?: string;
  signedAt?: number;
}

/**
 * Fill the frozen signature grid with the signatures that were actually
 * collected.
 *
 * The grid is stored empty inside the immutable content: the signature image and
 * date come from the `signatureRequests` rows at render time, so a signature can
 * never be baked into the snapshot before someone really signed. Parties are
 * matched to signatures by signing order (employee first, employer second).
 */
export function applySignaturesToBlocks(
  blocks: DocumentBlock[],
  signatures: CollectedSignature[],
  formatSignedDate: (timestamp: number) => string,
): DocumentBlock[] {
  return blocks.map((block) => {
    if (block.type !== 'signatures') return block;
    return {
      ...block,
      parties: block.parties.map((party, index) => {
        const signature = signatures[index];
        if (!signature) return party;
        return {
          ...party,
          name: party.name || (signature.signerName ?? ''),
          signatureImage: signature.signatureData ?? party.signatureImage,
          date: signature.signedAt ? formatSignedDate(signature.signedAt) : party.date,
        };
      }),
    };
  });
}

/** Filesystem-safe download name, e.g. `employment-contract_Anna_Petrosyan.docx`. */ export function hiringPacketFileName(
  templateId: string,
  employeeName: string,
  extension: 'pdf' | 'docx',
): string {
  const safeName = (employeeName || 'employee')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]/gu, '');
  return `${templateId}_${safeName}.${extension}`;
}

/** Resolve the localized title of a packet document for the primary language. */
export function hiringPacketTitle(
  templateId: string,
  data: MergeSourceData,
  secondaryLocale: SupportedLocale,
): string {
  const template = getCatalogTemplate(templateId);
  if (!template) return templateId;
  const primary = localizedContent(template, PRIMARY_LOCALE).title;
  const secondary = localizedContent(template, secondaryLocale).title;
  // Both languages in the header, mirroring the two body columns.
  return secondaryLocale === PRIMARY_LOCALE ? primary : `${primary} / ${secondary}`;
}
