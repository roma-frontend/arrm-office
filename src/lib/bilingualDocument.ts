/**
 * Multi-locale document engine: segments in, printable blocks out.
 *
 * This is the general form of the hiring-packet builder (`hiringPacketDocument.ts`),
 * with the two things that made it hiring-only turned into parameters:
 *
 *   1. The mandatory language. The packet hard-codes Armenian as the left
 *      column; here the pair `{ primary, secondary }` is supplied by the caller,
 *      so an Armenian company issues `hy + ru` and a Russian one `ru + en`.
 *      A pair without a secondary renders one full-width column.
 *
 *   2. How the two columns are paired. The packet parses each language's body
 *      independently and zips the resulting block lists by position, which drifts
 *      silently when a translation has one paragraph more or fewer. Here a
 *      *segment* is the unit of authoring: one logical block holding its text in
 *      every language. Rows line up by construction, a missing translation is
 *      visible instead of shifting everything below it, and a segment can opt out
 *      of the split entirely (`fullWidth`) so single- and two-column sections can
 *      alternate in one document.
 *
 * Rendering (PDF/DOCX) stays in `exportDocument.ts` — this module only produces
 * the `DocumentBlock[]` both exporters consume.
 */

import type { SupportedLocale } from './date-format';
import { resolveTokens, extractTokens, type MergeSourceData } from './documentTokens';
import type { AccentColor } from './documentCatalog';
import type {
  DocumentBlock,
  DocumentFieldRow,
  DocumentLabels,
  DocumentLeafBlock,
  DocumentSignatureParty,
} from './exportDocument';

/** Every locale the app can author a document in. */
export const DOCUMENT_LOCALES: readonly SupportedLocale[] = ['hy', 'ru', 'en', 'de'];

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
 * either — otherwise the same segment would yield a different block structure
 * per language.
 */
export const LABEL_SEPARATORS = [':', '\u055D'];

/** Printed where a segment has no text in one of the two chosen languages. */
export const MISSING_TRANSLATION = '[…]';

const MAX_LABEL_LENGTH = 34;
const MAX_SECTION_LENGTH = 70;

// ─────────────────────────────────────────────────────────────────────────────
// Segment model
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a segment turns into on the page. Explicit rather than inferred from the
 * text: the author picks it once, and both languages then render identically no
 * matter how each translation happens to be punctuated.
 */
export type DocumentSegmentKind = 'section' | 'paragraph' | 'bullets' | 'fields' | 'callout';

export type LocalizedText = Partial<Record<SupportedLocale, string>>;

export interface DocumentSegment {
  /** Stable across edits — what a re-imported Word file is matched back to. */
  id: string;
  kind: DocumentSegmentKind;
  /** Authored text per locale, still carrying `{{tokens}}`. */
  text: LocalizedText;
  /** Span both columns instead of splitting (number tables, shared notes). */
  fullWidth?: boolean;
}

export interface LocalePair {
  /** Legally binding language, always the left column. */
  primary: SupportedLocale;
  /** Translation column; omit for a single-language document. */
  secondary?: SupportedLocale | null;
}

/** True when the pair asks for two distinct columns. */
export function isBilingualPair(locales: LocalePair): boolean {
  return !!locales.secondary && locales.secondary !== locales.primary;
}

let segmentCounter = 0;

/** Collision-resistant enough for ids that only need to be unique in one document. */
export function newSegmentId(): string {
  segmentCounter += 1;
  return `s${Date.now().toString(36)}${segmentCounter.toString(36)}`;
}

export function createSegment(
  kind: DocumentSegmentKind = 'paragraph',
  text: LocalizedText = {},
): DocumentSegment {
  return { id: newSegmentId(), kind, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// Segment → block
// ─────────────────────────────────────────────────────────────────────────────

/** Split a label/value line, honouring both separator conventions. */
export function splitLabelValue(line: string): DocumentFieldRow | null {
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

/** `2. DUTIES` → `{ title: 'DUTIES', index: 2 }`. */
function parseHeading(raw: string): { title: string; index?: number } {
  const ordinal = /^(\d+)\s*[.)]\s*(.+)$/.exec(raw.trim());
  if (ordinal?.[1] && ordinal[2]) {
    return { title: ordinal[2].trim(), index: Number(ordinal[1]) };
  }
  return { title: raw.trim() };
}

function nonEmptyLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Render one segment in one language.
 *
 * Returns a muted placeholder rather than `null` when the translation is
 * missing: the row must still exist, or the two columns stop corresponding.
 */
export function segmentToBlock(
  segment: DocumentSegment,
  locale: SupportedLocale,
): DocumentLeafBlock {
  const raw = (segment.text[locale] ?? '').trim();
  if (!raw) return { type: 'paragraph', text: MISSING_TRANSLATION, muted: true };

  switch (segment.kind) {
    case 'section': {
      const { title, index } = parseHeading(raw.slice(0, MAX_SECTION_LENGTH));
      return index === undefined ? { type: 'section', title } : { type: 'section', title, index };
    }
    case 'bullets':
      return {
        type: 'bullets',
        items: nonEmptyLines(raw).map((line) => line.replace(/^[-•*]\s*/, '')),
      };
    case 'fields': {
      const rows = nonEmptyLines(raw)
        .map(splitLabelValue)
        .filter((row): row is DocumentFieldRow => row !== null);
      // A "fields" segment whose lines carry no separator would render as an
      // empty table; fall back to prose instead of printing nothing.
      if (rows.length === 0) return { type: 'paragraph', text: raw.replace(/\s*\n\s*/g, ' ') };
      return { type: 'fields', rows };
    }
    case 'callout':
      return { type: 'callout', text: raw.replace(/\s*\n\s*/g, ' ') };
    case 'paragraph':
    default:
      return { type: 'paragraph', text: raw.replace(/\s*\n\s*/g, ' ') };
  }
}

/** Inverse of {@link segmentToBlock}, used when importing existing bodies. */
export function blockToText(block: DocumentLeafBlock): { kind: DocumentSegmentKind; text: string } {
  switch (block.type) {
    case 'section':
      return {
        kind: 'section',
        text: block.index === undefined ? block.title : `${block.index}. ${block.title}`,
      };
    case 'bullets':
      return { kind: 'bullets', text: block.items.map((item) => `- ${item}`).join('\n') };
    case 'fields':
      return {
        kind: 'fields',
        text: block.rows.map((row) => `${row.label}: ${row.value}`).join('\n'),
      };
    case 'callout':
      return { kind: 'callout', text: block.text };
    case 'paragraph':
      return { kind: 'paragraph', text: block.text };
    default:
      // Spacers and signature grids are layout, not authored content.
      return { kind: 'paragraph', text: '' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy body parsing (flat template strings)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A standalone all-caps line is a section heading ("ORDER", "2. DUTIES",
 * "ՊԱՐՏԱԿԱՆՈՒԹՅՈՒՆՆԵՐԸ"). Case comparison behaves identically for Latin,
 * Cyrillic and Armenian, so every language of a template classifies the same.
 */
function asSectionBlock(line: string): DocumentLeafBlock | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > MAX_SECTION_LENGTH) return null;
  if (trimmed !== trimmed.toUpperCase()) return null;
  if (!/\p{L}/u.test(trimmed)) return null;

  const { title, index } = parseHeading(trimmed);
  return index === undefined ? { type: 'section', title } : { type: 'section', title, index };
}

/**
 * Turn a flat template body into leaf blocks.
 *
 * Kept for the built-in catalog, whose 14 templates store one string per locale.
 * The rules key off structure the templates control (blank lines, `- ` bullets,
 * `N.` ordinals, all-caps headings, label separators) rather than on language.
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
    if (group.every((line) => /^[-•]\s+/.test(line))) {
      blocks.push({ type: 'bullets', items: group.map((line) => line.replace(/^[-•]\s+/, '')) });
      continue;
    }

    if (group.length > 1 && group.every((line) => /^\d+[.)]\s/.test(line))) {
      for (const line of group) blocks.push({ type: 'paragraph', text: line });
      continue;
    }

    if (group.length === 1) {
      const section = asSectionBlock(group[0]!);
      if (section) {
        blocks.push(section);
        continue;
      }
    }

    const rows = group.map(splitLabelValue);
    if (rows.length > 1 && rows.every((row): row is DocumentFieldRow => row !== null)) {
      blocks.push({ type: 'fields', rows });
      continue;
    }

    blocks.push({ type: 'paragraph', text: group.join(' ') });
  }

  return blocks;
}

export interface ImportedSegments {
  segments: DocumentSegment[];
  /** Human-readable notes: which locales came out shorter, and by how much. */
  warnings: string[];
}

/**
 * Build segments from one flat body per locale — the bridge used when an
 * organization forks a built-in template into its own.
 *
 * `spine` decides how many segments there are; other locales fill in by
 * position, which is exactly the assumption the catalog is written to satisfy
 * (all four bodies are translations of the same structure). Any mismatch is
 * reported instead of being padded away silently.
 */
export function segmentsFromBodies(
  bodies: Partial<Record<SupportedLocale, string>>,
  spine: SupportedLocale,
): ImportedSegments {
  const parsed = new Map<SupportedLocale, DocumentLeafBlock[]>();
  for (const locale of DOCUMENT_LOCALES) {
    const body = bodies[locale];
    if (body?.trim()) parsed.set(locale, parseTemplateBodyToBlocks(body));
  }

  const spineBlocks = parsed.get(spine) ?? [];
  const warnings: string[] = [];
  const segments: DocumentSegment[] = [];

  for (const [index, block] of spineBlocks.entries()) {
    const { kind, text } = blockToText(block);
    if (!text) continue;

    const localized: LocalizedText = { [spine]: text };
    for (const [locale, blocks] of parsed) {
      if (locale === spine) continue;
      const counterpart = blocks[index];
      if (counterpart) localized[locale] = blockToText(counterpart).text;
    }
    segments.push({ id: newSegmentId(), kind, text: localized });
  }

  for (const [locale, blocks] of parsed) {
    if (locale === spine) continue;
    if (blocks.length !== spineBlocks.length) {
      warnings.push(
        `${LOCALE_CAPTIONS[locale]}: ${blocks.length} blocks vs ${spineBlocks.length} in ${LOCALE_CAPTIONS[spine]} — check the alignment`,
      );
    }
  }

  return { segments, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Document assembly
// ─────────────────────────────────────────────────────────────────────────────

/** One signing party, before it is turned into a printable signature line. */
export interface DocumentPartyInput {
  /** Stable id (`recipient`, `issuer`, …) used to match collected signatures. */
  id: string;
  /** Caption above the line; falls back to the localized "Signature" label. */
  role?: string;
  name: string;
  position?: string;
}

export interface BuildDocumentOptions {
  segments: DocumentSegment[];
  locales: LocalePair;
  labels: DocumentLabels;
  /** Merge data for `{{tokens}}`. Omit in the editor to show tokens verbatim. */
  data?: MergeSourceData;
  /** Signing parties; omit or pass an empty list for an unsigned document. */
  parties?: DocumentPartyInput[];
  /** Drop the signature grid — the editable Word export must not carry it. */
  omitSignatures?: boolean;
  /** Print the language captions above the columns (default: true). */
  captions?: boolean;
}

/** Resolve one segment's text for a locale, applying merge tokens if provided. */
function localizedSegment(
  segment: DocumentSegment,
  locale: SupportedLocale,
  data?: MergeSourceData,
): DocumentSegment {
  if (!data) return segment;
  const raw = segment.text[locale];
  if (!raw) return segment;
  return { ...segment, text: { ...segment.text, [locale]: resolveTokens(raw, data, locale) } };
}

function signatureBlock(
  parties: DocumentPartyInput[],
  labels: DocumentLabels,
): DocumentBlock | null {
  if (parties.length === 0) return null;
  const printable: DocumentSignatureParty[] = parties.map((party) => ({
    id: party.id,
    role: party.role || labels.signature,
    nameLabel: labels.name,
    name: party.name,
    dateLabel: labels.date,
    ...(party.position ? { positionLabel: labels.position, position: party.position } : {}),
  }));
  return { type: 'signatures', parties: printable };
}

/**
 * Assemble the printable body.
 *
 * Consecutive two-column segments are merged into a single `bilingual` block
 * (one table row per segment, so the languages cannot drift), while `fullWidth`
 * segments interrupt that run and render across the page. The signature grid is
 * always appended at top level: it belongs to the document, not to a language.
 */
export function buildDocumentBlocks(options: BuildDocumentOptions): DocumentBlock[] {
  const { segments, locales, labels, data, captions = true } = options;
  const bilingual = isBilingualPair(locales);
  const secondary = locales.secondary as SupportedLocale | undefined;

  const blocks: DocumentBlock[] = [];
  let run: DocumentSegment[] = [];

  const flushRun = () => {
    if (run.length === 0) return;
    if (!bilingual || !secondary) {
      for (const segment of run) {
        blocks.push(
          segmentToBlock(localizedSegment(segment, locales.primary, data), locales.primary),
        );
      }
    } else {
      blocks.push({
        type: 'bilingual',
        left: run.map((segment) =>
          segmentToBlock(localizedSegment(segment, locales.primary, data), locales.primary),
        ),
        right: run.map((segment) =>
          segmentToBlock(localizedSegment(segment, secondary, data), secondary),
        ),
        ...(captions
          ? { leftLabel: LOCALE_CAPTIONS[locales.primary], rightLabel: LOCALE_CAPTIONS[secondary] }
          : {}),
      });
    }
    run = [];
  };

  for (const segment of segments) {
    if (segment.fullWidth) {
      flushRun();
      blocks.push(
        segmentToBlock(localizedSegment(segment, locales.primary, data), locales.primary),
      );
      // The secondary text of a full-width segment follows as its own block, so
      // nothing is dropped when a shared note exists in both languages.
      if (bilingual && secondary && segment.text[secondary]?.trim()) {
        blocks.push(segmentToBlock(localizedSegment(segment, secondary, data), secondary));
      }
      continue;
    }
    run.push(segment);
  }
  flushRun();

  if (!options.omitSignatures) {
    const grid = signatureBlock(options.parties ?? [], labels);
    if (grid) blocks.push(grid);
  }

  return blocks;
}

/** Localized document title, both languages on one line when bilingual. */
export function documentTitle(
  titles: LocalizedText,
  locales: LocalePair,
  data?: MergeSourceData,
): string {
  const resolve = (locale: SupportedLocale): string => {
    const raw = titles[locale]?.trim();
    if (!raw) return '';
    return data ? resolveTokens(raw, data, locale) : raw;
  };

  const primary = resolve(locales.primary);
  const secondary = isBilingualPair(locales) ? resolve(locales.secondary as SupportedLocale) : '';
  if (primary && secondary) return `${primary} / ${secondary}`;
  return primary || secondary || '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Freezing and signatures
// ─────────────────────────────────────────────────────────────────────────────

/** Sentinel for a structured body inside `signatureDocuments.content`. */
const DOC_PREFIX = '__DOC__';
/** The hiring packet's original sentinel — still read for documents sent before. */
const LEGACY_HP_PREFIX = '__HP__';

/**
 * Everything needed to re-render an issued document byte-identically later,
 * including the static labels: an archived PDF regenerated months afterwards in
 * a different UI language must still match what was signed.
 */
export interface FrozenDocument {
  version: 2;
  /** Where the text came from — a built-in template or an org blueprint. */
  source: 'catalog' | 'blueprint';
  templateId?: string;
  blueprintId?: string;
  blueprintVersion?: number;
  title: string;
  blocks: DocumentBlock[];
  accent: AccentColor;
  orgName: string;
  documentNumber?: string;
  primaryLocale: SupportedLocale;
  secondaryLocale?: SupportedLocale;
  labels: DocumentLabels;
  /** True when the body came from a hand-edited Word upload. */
  edited?: boolean;
}

export function encodeDocumentContent(payload: FrozenDocument): string {
  return DOC_PREFIX + JSON.stringify(payload);
}

export function isStructuredContent(content: string): boolean {
  return content.startsWith(DOC_PREFIX) || content.startsWith(LEGACY_HP_PREFIX);
}

/**
 * Parse a stored body. Returns `null` for anything unreadable so callers fall
 * back to plain text instead of throwing on legacy or corrupted rows.
 *
 * Version 1 payloads (`__HP__`, written by the hiring packet) are upgraded on
 * read: they carry the same fields under a `templateId`, so no migration of
 * already-signed documents is needed.
 */
export function parseDocumentContent(content: string): FrozenDocument | null {
  const prefix = content.startsWith(DOC_PREFIX)
    ? DOC_PREFIX
    : content.startsWith(LEGACY_HP_PREFIX)
      ? LEGACY_HP_PREFIX
      : null;
  if (!prefix) return null;

  try {
    const parsed: unknown = JSON.parse(content.slice(prefix.length));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const payload = parsed as Partial<FrozenDocument>;
    if (!Array.isArray(payload.blocks)) return null;
    return {
      ...(payload as FrozenDocument),
      version: 2,
      source: payload.source ?? 'catalog',
    };
  } catch {
    return null;
  }
}

/** One collected signature. */
export interface CollectedSignature {
  /** Party this signature belongs to, when the document recorded party ids. */
  partyId?: string;
  signerName?: string;
  /** Base64 PNG data URL of the drawn signature. */
  signatureData?: string;
  signedAt?: number;
}

/**
 * Collect a document's signatures in signing order, one slot per request
 * whether it has been signed yet or not.
 *
 * The empty slots matter: {@link applySignaturesToBlocks} pairs signatures with
 * parties by index, so compacting the unsigned requests out would slide a
 * countersignature up into the first party's box. An unsigned slot carries no
 * image, name or date, so it leaves its party exactly as the grid defined it.
 */
export function collectSignaturesInOrder(
  requests:
    | ReadonlyArray<{
        status: string;
        order: number;
        signerName?: string;
        signatureData?: string;
        signedAt?: number;
      }>
    | undefined,
): CollectedSignature[] {
  return (requests ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((request) =>
      request.status === 'signed'
        ? {
            signerName: request.signerName,
            signatureData: request.signatureData,
            signedAt: request.signedAt,
          }
        : {},
    );
}

/**
 * Fill a frozen signature grid with the signatures that were actually collected.
 *
 * The grid is stored empty inside the immutable content — the image and date come
 * from the `signatureRequests` rows at render time, so a signature can never be
 * baked into the snapshot before someone really signed.
 *
 * Parties are matched by `partyId` when both sides carry one, and by signing
 * order otherwise (which is what documents frozen by the hiring packet have).
 */
export function applySignaturesToBlocks(
  blocks: DocumentBlock[],
  signatures: CollectedSignature[],
  formatSignedDate: (timestamp: number) => string,
): DocumentBlock[] {
  const byPartyId = new Map<string, CollectedSignature>();
  for (const signature of signatures) {
    if (signature.partyId) byPartyId.set(signature.partyId, signature);
  }

  return blocks.map((block) => {
    if (block.type !== 'signatures') return block;
    return {
      ...block,
      parties: block.parties.map((party, index) => {
        const signature = (party.id ? byPartyId.get(party.id) : undefined) ?? signatures[index];
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

// ─────────────────────────────────────────────────────────────────────────────
// Authoring helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface SegmentAudit {
  /** Segments with no text in the given locale, by segment id. */
  missing: string[];
  /** Tokens used somewhere in the document that no resolver knows. */
  unknownTokens: string[];
  /** Known tokens the document depends on — used to warn about empty profiles. */
  usedTokens: string[];
}

/**
 * Check a draft before it is issued: which translations are missing and which
 * `{{tokens}}` would not resolve. Cheap enough to run on every keystroke.
 */
export function auditSegments(
  segments: DocumentSegment[],
  locales: LocalePair,
  titles: LocalizedText = {},
): SegmentAudit {
  const wanted: SupportedLocale[] = isBilingualPair(locales)
    ? [locales.primary, locales.secondary as SupportedLocale]
    : [locales.primary];

  const missing: string[] = [];
  const unknown = new Set<string>();
  const used = new Set<string>();

  const scan = (text: string) => {
    const { known, unknown: bad } = extractTokens(text);
    for (const token of known) used.add(token);
    for (const token of bad) unknown.add(token);
  };

  for (const locale of wanted) {
    const title = titles[locale];
    if (title) scan(title);
  }

  for (const segment of segments) {
    const empty = wanted.some((locale) => !segment.text[locale]?.trim());
    if (empty) missing.push(segment.id);
    for (const locale of wanted) {
      const text = segment.text[locale];
      if (text) scan(text);
    }
  }

  return {
    missing,
    unknownTokens: [...unknown].sort(),
    usedTokens: [...used].sort(),
  };
}

/** Filesystem-safe download name, e.g. `employment-contract_Anna_Petrosyan.pdf`. */
export function documentFileName(
  base: string,
  recipientName: string,
  extension: 'pdf' | 'docx',
): string {
  const safe = (value: string) =>
    value
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\p{L}\p{N}_-]/gu, '');
  const name = safe(recipientName) || 'recipient';
  return `${safe(base) || 'document'}_${name}.${extension}`;
}
