/**
 * Single source of truth for asset handover / return acts ("Акт приёма-передачи").
 *
 * The database stores these forms **locale-agnostically** (`__MF__`/`__RF__` +
 * JSON), so every surface — the e-signature preview, the PDF download from the
 * asset card and the archived signed copy — renders the SAME structured act in
 * the language the user has selected.
 *
 * Layout is expressed as {@link DocumentBlock}s (ruled section headings +
 * definition tables + a signature grid) instead of one flat string, which is
 * what previously collapsed the act into a single unreadable paragraph.
 */

import type { TFunction } from 'i18next';
import type { DocumentBlock, DocumentSignatureParty } from './exportDocument';
import { formatDate } from './date-format';
import { parseAssetFormContent, type ParsedAssetForm } from './assetActContent';

// Storage-format parsing lives in `assetActContent.ts` (dependency-free so the
// Convex migration can share it); re-exported here as the renderer's entry point.
export { parseAssetFormContent };
export type { ParsedAssetForm };

/** Everything the act can print about one handover / return. */
export interface AssetFormInput {
  /** `true` → return act, `false` → handover act. */
  isReturn: boolean;
  assetName: string;
  assetSerial?: string;
  assetTag?: string;
  /** Already-translated category name (e.g. "Ноутбук"). */
  categoryLabel?: string;
  brand?: string;
  model?: string;
  location?: string;
  employeeName: string;
  employeeEmail?: string;
  employeePosition?: string;
  /** Person handing over (handover) or receiving back (return) the asset. */
  adminName: string;
  adminPosition?: string;
  /** Transfer/return timestamp — preferred, formatted in the active language. */
  dateTs?: number;
  /** Pre-formatted date kept only for legacy documents without a timestamp. */
  dateText?: string;
  /** Raw condition key (`good`, `damaged`, …) or free text. */
  condition?: string;
  /** Baked-in signature for the archived/signed copy. */
  signature?: { image?: string; signerName?: string; signedAt?: number };
}

/** Map stored form JSON onto the renderer input, localizing what needs it. */
export function assetFormInputFromParsed(
  parsed: ParsedAssetForm,
  options: {
    t: TFunction;
    signature?: AssetFormInput['signature'];
  },
): AssetFormInput {
  const { data } = parsed;
  const isReturn = parsed.type === 'return';
  const dateTs = data.dateTs ? Number(data.dateTs) : undefined;
  const categoryKey = data.category || '';

  return {
    isReturn,
    assetName: data.assetName || '',
    assetSerial: data.assetSerial || undefined,
    assetTag: data.assetTag || undefined,
    categoryLabel: categoryKey
      ? options.t(`assets.category.${categoryKey}`, categoryKey)
      : undefined,
    brand: data.brand || undefined,
    model: data.model || undefined,
    location: data.location || undefined,
    employeeName: data.assigneeName || data.returnerName || '',
    employeeEmail: data.assigneeEmail || undefined,
    employeePosition: data.assigneePosition || undefined,
    // New return JSON carries `returnerName` (the admin taking the asset back);
    // legacy return markdown stores that person as `assignerName` ("Received By").
    adminName: data.assignerName || (isReturn ? data.returnerName || '' : ''),
    adminPosition: data.assignerPosition || undefined,
    dateTs: Number.isFinite(dateTs) ? dateTs : undefined,
    dateText: data.date || undefined,
    condition: data.condition || undefined,
    signature: options.signature,
  };
}

/** Localized act title, e.g. "Акт приёма-передачи". */
export function assetFormTitle(isReturn: boolean, t: TFunction): string {
  return isReturn
    ? t('assets.pdf.returnForm', 'Asset Return Act')
    : t('assets.pdf.movementForm', 'Asset Handover Act');
}

/** Stable 4-char suffix so the same act always carries the same reference. */
function shortRef(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash.toString(36).toUpperCase().padStart(4, '0').slice(-4);
}

/**
 * Formal document reference, e.g. `Doc. No. HO-20260801-7F3K`. Language-neutral
 * by design (only the label is translated) so the same act can be cited across
 * languages.
 */
export function assetFormDocumentNumber(input: AssetFormInput, t: TFunction): string {
  const ts = input.dateTs ?? Date.now();
  const d = new Date(ts);
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate(),
  ).padStart(2, '0')}`;
  const ref = shortRef(`${input.assetName}|${input.assetSerial ?? ''}|${input.employeeName}`);
  const prefix = input.isReturn ? 'RT' : 'HO';
  return `${t('assets.pdf.documentNo', 'Doc. No.')} ${prefix}-${ymd}-${ref}`;
}

/** Resolve the act date in the active language (timestamp wins over legacy text). */
function resolveDate(input: AssetFormInput, lang: string | undefined): string {
  if (input.dateTs) {
    return formatDate(input.dateTs, lang, { year: 'numeric', month: 'long', day: 'numeric' });
  }
  return input.dateText || '';
}

const CONDITION_KEYS = ['new', 'good', 'fair', 'poor', 'damaged'];

function resolveCondition(condition: string | undefined, t: TFunction): string | undefined {
  if (!condition) return undefined;
  const key = condition.trim().toLowerCase();
  return CONDITION_KEYS.includes(key) ? t(`assets.condition.${key}`, condition) : condition;
}

/**
 * Build the structured, fully localized body of a handover/return act.
 *
 * Sections: 1) asset details, 2) parties & operation, 3) terms, 4) signatures.
 */
export function buildAssetFormBlocks(
  input: AssetFormInput,
  t: TFunction,
  lang?: string,
): DocumentBlock[] {
  const { isReturn } = input;
  const date = resolveDate(input, lang);
  const condition = resolveCondition(input.condition, t);
  const brandModel = [input.brand, input.model].filter(Boolean).join(' ');

  // ── 1. Asset ──────────────────────────────────────────────────────────────
  const assetRows = [
    { label: t('assets.name', 'Name'), value: input.assetName },
    { label: t('assets.serialNumber', 'Serial Number'), value: input.assetSerial ?? '' },
    { label: t('assets.pdf.assetTag', 'Asset Tag'), value: input.assetTag ?? '' },
    { label: t('assets.categoryLabel', 'Category'), value: input.categoryLabel ?? '' },
    { label: t('assets.pdf.brandModel', 'Brand / Model'), value: brandModel },
    { label: t('assets.location', 'Location'), value: input.location ?? '' },
    {
      label: t('assets.pdf.type', 'Type'),
      value: isReturn
        ? t('assets.pdf.equipmentReturn', 'Equipment Return')
        : t('assets.pdf.equipmentTransfer', 'Equipment Transfer'),
    },
  ].filter((row) => row.value);

  // ── 2. Parties ────────────────────────────────────────────────────────────
  const partyRows = [
    {
      label: isReturn
        ? t('assets.pdf.returnedBy', 'Returned By')
        : t('assets.pdf.handedTo', 'Handed To'),
      value: input.employeeName,
    },
    {
      label: isReturn
        ? t('assets.pdf.receivedBy', 'Received By')
        : t('assets.pdf.handedBy', 'Handed By'),
      value: input.adminName,
    },
    { label: t('assets.pdf.email', 'Email'), value: input.employeeEmail ?? '' },
    { label: t('assets.pdf.position', 'Position'), value: input.employeePosition ?? '' },
    {
      label: isReturn
        ? t('assets.pdf.dateOfReturn', 'Date of Return')
        : t('assets.pdf.transferDate', 'Transfer Date'),
      value: date,
    },
    {
      label: isReturn
        ? t('assets.pdf.condition', 'Condition on Return')
        : t('assets.conditionLabel', 'Condition'),
      value: condition ?? '',
    },
  ].filter((row) => row.value);

  // ── 3. Terms ──────────────────────────────────────────────────────────────
  const termsTitle = isReturn
    ? t('assets.pdf.acknowledgement', 'Acknowledgement')
    : t('assets.pdf.terms', 'Terms and Conditions');
  const termsText = isReturn
    ? t(
        'assets.pdf.returnTerms',
        'I confirm that I have returned the above equipment. The asset has been received in the noted condition and I am released from further responsibility for this item.',
      )
    : t(
        'assets.pdf.assignTerms',
        'I confirm that I have received the above equipment in good condition. I agree to take full responsibility for the item and will return it upon request or at the end of my employment.',
      );

  // ── 4. Signatures ─────────────────────────────────────────────────────────
  const nameLabel = t('assets.pdf.signerName', 'Name');
  const dateLabel = t('assets.pdf.date', 'Date');
  const signedDate = input.signature?.signedAt
    ? formatDate(input.signature.signedAt, lang, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : date;

  const employeeParty: DocumentSignatureParty = {
    role: t('assets.pdf.employeeParty', 'Employee'),
    nameLabel,
    name: input.signature?.signerName || input.employeeName,
    dateLabel,
    date: input.signature ? signedDate : date,
    signatureImage: input.signature?.image,
  };
  const adminParty: DocumentSignatureParty = {
    role: t('assets.pdf.adminParty', 'Admin / HR'),
    nameLabel,
    name: input.adminName,
    dateLabel,
    date,
  };

  return [
    { type: 'section', index: 1, title: t('assets.pdf.assetDetails', 'Asset Details') },
    { type: 'fields', rows: assetRows },
    {
      type: 'section',
      index: 2,
      title: isReturn
        ? t('assets.pdf.returnDetails', 'Return Details')
        : t('assets.pdf.handoverDetails', 'Handover Details'),
    },
    { type: 'fields', rows: partyRows },
    { type: 'section', index: 3, title: termsTitle },
    { type: 'paragraph', text: termsText },
    {
      type: 'callout',
      text: t(
        'assets.pdf.copiesNote',
        'This act is executed in two counterparts of equal legal force — one for each party.',
      ),
    },
    { type: 'section', index: 4, title: t('assets.pdf.signatures', 'Signatures') },
    { type: 'signatures', parties: [employeeParty, adminParty] },
  ];
}

/** File name for the downloaded act, e.g. `handover_act_lenovo_x1.pdf`. */
export function assetFormFileName(input: AssetFormInput): string {
  const slug = input.assetName.replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'asset';
  return `${input.isReturn ? 'return' : 'handover'}_act_${slug}.pdf`.replace(/_+/g, '_');
}
