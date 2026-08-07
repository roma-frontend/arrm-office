/**
 * Canonical template ids — the single source of truth shared by the client
 * catalog and the Convex backend.
 *
 * The template *content* (titles and bodies in four locales) lives in
 * `src/lib/documentCatalog.ts`, which Convex functions cannot import. Without a
 * shared id list `hiringPackets.generate` would have to trust whatever strings
 * the client sent, and a typo or a malicious call would create packet rows that
 * no template can render — visible in the UI only as "Could not build this
 * document", and impossible to delete.
 *
 * This file lives under `convex/lib` because that direction of import works:
 * `src/**` may import from `convex/**` (see `convex/lib/taxRules.ts`), not the
 * other way round.
 */

/** Every template id the document catalog defines. */
export const CATALOG_TEMPLATE_IDS = [
  // Certificates
  'employment-verification',
  'salary-certificate',
  // Hiring
  'offer-letter',
  'employment-contract',
  'nda',
  'job-description',
  'material-responsibility',
  'salary-payment-form',
  // Consent
  'pdpa-consent',
  'biometric-consent',
  'policies-acknowledgement',
  // Orders
  'employment-order',
  'leave-order',
  'termination-order',
] as const;

export type CatalogTemplateId = (typeof CATALOG_TEMPLATE_IDS)[number];

/**
 * Documents generated automatically when an employee is hired, in signing order.
 * Every entry is issued bilingually (Armenian + the employee's language).
 */
export const HIRING_PACKET_TEMPLATE_IDS = [
  'employment-contract',
  'employment-order',
  'job-description',
  'nda',
  'material-responsibility',
  'pdpa-consent',
  'biometric-consent',
  'policies-acknowledgement',
  'salary-payment-form',
] as const satisfies readonly CatalogTemplateId[];

/** Packet entries that cannot be skipped — onboarding is incomplete without them. */
export const HIRING_PACKET_MANDATORY_IDS = [
  'employment-contract',
  'employment-order',
  'pdpa-consent',
] as const satisfies readonly CatalogTemplateId[];

const CATALOG_ID_SET: ReadonlySet<string> = new Set(CATALOG_TEMPLATE_IDS);

/** Is this a template id the catalog can actually render? */
export function isCatalogTemplateId(id: string): id is CatalogTemplateId {
  return CATALOG_ID_SET.has(id);
}

/**
 * Where a signed template belongs in the employee's personal file.
 *
 * `employeeDocuments.category` is a small closed set, so anything that is not a
 * contract, a certificate or an identity paper lands in `other` — the point is
 * that the signed PDF is filed at all, which it previously never was.
 */
export function personalFileCategory(
  templateId: string,
): 'resume' | 'contract' | 'certificate' | 'performance_review' | 'id_document' | 'other' {
  switch (templateId) {
    case 'employment-contract':
    case 'nda':
    case 'material-responsibility':
    case 'offer-letter':
      return 'contract';
    case 'employment-verification':
    case 'salary-certificate':
      return 'certificate';
    default:
      return 'other';
  }
}

/**
 * Same mapping for a blueprint, which has no catalog id — only the category its
 * author picked. Keeps signed blueprint documents from all landing under
 * "other" in the personal file.
 */
export function personalFileCategoryForBlueprint(
  category: 'certificate' | 'hiring' | 'consent' | 'order' | 'other',
): 'resume' | 'contract' | 'certificate' | 'performance_review' | 'id_document' | 'other' {
  switch (category) {
    case 'hiring':
      return 'contract';
    case 'certificate':
      return 'certificate';
    default:
      return 'other';
  }
}
