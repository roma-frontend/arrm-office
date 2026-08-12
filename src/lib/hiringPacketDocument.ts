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
import {
  LOCALE_CAPTIONS,
  applySignaturesToBlocks as applySignatures,
  collectSignaturesInOrder as collectSignatures,
  parseTemplateBodyToBlocks as parseBody,
  type CollectedSignature as EngineSignature,
} from './bilingualDocument';
import type { DocumentBlock, DocumentLabels, DocumentLeafBlock } from './exportDocument';

/** Armenian is mandatory and always occupies the primary column. */
export const PRIMARY_LOCALE: SupportedLocale = 'hy';

/** Sentinel marking a hiring-packet body inside `signatureDocuments.content`. */
const HP_PREFIX = '__HP__';

export { LOCALE_CAPTIONS };

/**
 * Turn a template body into leaf blocks.
 *
 * Re-exported from the shared engine, which owns the parsing rules now that
 * organization blueprints use them too.
 */
export const parseTemplateBodyToBlocks: (body: string) => DocumentLeafBlock[] = parseBody;

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
export type CollectedSignature = EngineSignature;

/**
 * Fill the frozen signature grid with the signatures that were actually
 * collected.
 *
 * Re-exported from the shared engine: packet documents carry no party ids, so it
 * falls back to matching by signing order (employee first, employer second) —
 * exactly what this module did on its own before.
 */
export const applySignaturesToBlocks: (
  blocks: DocumentBlock[],
  signatures: CollectedSignature[],
  formatSignedDate: (timestamp: number) => string,
) => DocumentBlock[] = applySignatures;

/**
 * Collect a signature document's signatures in signing order, one slot per
 * request. Re-exported from the shared engine so a packet download and an act
 * download build the same list; matching is positional here, so the empty slots
 * it keeps for unsigned requests are what stops a countersignature from landing
 * in the employee's box.
 */
export const collectSignaturesInOrder: (
  requests:
    | ReadonlyArray<{
        status: string;
        order: number;
        signerName?: string;
        signatureData?: string;
        signedAt?: number;
      }>
    | undefined,
) => CollectedSignature[] = collectSignatures;

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
