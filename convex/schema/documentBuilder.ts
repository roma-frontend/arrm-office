import { defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * Document builder — organization-authored multi-locale documents.
 *
 * Three tables, one per layer, because the existing modules conflate them:
 *
 *   1. `documentBlueprints` — the definition. Segment-structured text with one
 *      variant per language, owned and edited by the organization. This is what
 *      `documentTemplates` (flat, single-language, no tokens, used by the
 *      e-signature builder) never became.
 *
 *   2. `documentBlueprintVersions` — immutable snapshots. Publishing a change
 *      bumps the blueprint's version and writes the previous content here, so a
 *      document issued last year can still be re-rendered as it was signed.
 *
 *   3. `issuedDocuments` — one document handed to one recipient. The general
 *      form of `hiringPacketDocuments`: any blueprint or catalog template, any
 *      language pair, any recipient, with the same round-trip-through-Word and
 *      send-for-signature lifecycle.
 *
 * Storage notes:
 *
 * - Segments are a *flat* record, so unlike the recursive block model they are
 *   validated by Convex properly instead of being smuggled through as a JSON
 *   string. Only `bodyOverride` (blocks recovered from an edited Word file)
 *   stays JSON-encoded.
 *
 * - Text is stored with `{{tokens}}` unresolved. Merge data is applied at render
 *   time, so correcting an employee's passport number fixes every unsent
 *   document instead of leaving stale copies behind — the same rule the hiring
 *   packet follows.
 */

/** Locales a document can be authored in. */
const localeValidator = v.union(v.literal('en'), v.literal('ru'), v.literal('hy'), v.literal('de'));

/** Text of one segment/title per language; every language is optional. */
const localizedText = v.object({
  en: v.optional(v.string()),
  ru: v.optional(v.string()),
  hy: v.optional(v.string()),
  de: v.optional(v.string()),
});

/**
 * One logical block of a document, holding its text in every language.
 *
 * `kind` is authoritative rather than inferred from punctuation: it is what lets
 * both languages render into the same structure, which is the precondition for
 * the two columns lining up row by row.
 */
const segmentValidator = v.object({
  id: v.string(),
  kind: v.union(
    v.literal('section'),
    v.literal('paragraph'),
    v.literal('bullets'),
    v.literal('fields'),
    v.literal('callout'),
  ),
  text: localizedText,
  /** Render across both columns instead of splitting (number tables, notes). */
  fullWidth: v.optional(v.boolean()),
});

const accentValidator = v.union(
  v.literal('blue'),
  v.literal('slate'),
  v.literal('emerald'),
  v.literal('burgundy'),
);

const categoryValidator = v.union(
  v.literal('certificate'),
  v.literal('hiring'),
  v.literal('consent'),
  v.literal('order'),
  v.literal('other'),
);

export const documentBuilder = {
  documentBlueprints: defineTable({
    organizationId: v.id('organizations'),
    /** Internal name shown in the template list (not printed on the document). */
    name: v.string(),
    description: v.optional(v.string()),
    category: categoryValidator,
    accent: accentValidator,
    /** Printed heading per language. */
    titles: localizedText,
    segments: v.array(segmentValidator),
    /**
     * Language this document is invalid without — an Armenian labour contract
     * pins `hy`. Issuing it in a pair that lacks this locale is refused rather
     * than silently rendered.
     */
    requiredLocale: v.optional(localeValidator),
    /** Pre-selected pair when issuing; the issuer can still change it. */
    defaultPrimaryLocale: v.optional(localeValidator),
    defaultSecondaryLocale: v.optional(localeValidator),
    /** Append a signature grid (a policy handout does not need one). */
    signature: v.boolean(),
    /** Number series for issued copies, e.g. `HR`, `ORD`, `NDA`. */
    series: v.optional(v.string()),
    /**
     * Draft blueprints are invisible to issuers; archived ones stay readable so
     * documents already issued from them can still be traced.
     */
    status: v.union(v.literal('draft'), v.literal('published'), v.literal('archived')),
    /** Incremented on every publish; issued documents pin the value they used. */
    version: v.number(),
    /** Catalog template this was forked from, when it started as a built-in. */
    forkedFromTemplateId: v.optional(v.string()),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
    publishedAt: v.optional(v.number()),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_org_category', ['organizationId', 'category']),

  documentBlueprintVersions: defineTable({
    organizationId: v.id('organizations'),
    blueprintId: v.id('documentBlueprints'),
    version: v.number(),
    /** Snapshot of everything that affects rendering. */
    name: v.string(),
    titles: localizedText,
    segments: v.array(segmentValidator),
    accent: accentValidator,
    signature: v.boolean(),
    publishedBy: v.id('users'),
    publishedAt: v.number(),
  })
    .index('by_blueprint', ['blueprintId'])
    .index('by_blueprint_version', ['blueprintId', 'version'])
    .index('by_org', ['organizationId']),

  issuedDocuments: defineTable({
    organizationId: v.id('organizations'),
    /** Who receives and signs it. */
    recipientId: v.id('users'),
    /** Which library the text comes from. */
    source: v.union(v.literal('blueprint'), v.literal('catalog')),
    blueprintId: v.optional(v.id('documentBlueprints')),
    /** Blueprint version in force at issue time — never re-read from the head. */
    blueprintVersion: v.optional(v.number()),
    /** Catalog template id when `source` is `catalog`. */
    templateId: v.optional(v.string()),
    /** Binding language (left column). */
    primaryLocale: localeValidator,
    /** Translation column; absent for a single-language document. */
    secondaryLocale: v.optional(localeValidator),
    /** Resolved title at issue time, for lists and search. */
    title: v.string(),
    status: v.union(
      v.literal('draft'),
      v.literal('edited'),
      v.literal('sent'),
      v.literal('signed'),
      v.literal('cancelled'),
    ),
    /** `DocumentBlock[]` recovered from a hand-edited Word file, JSON-encoded. */
    bodyOverride: v.optional(v.string()),
    /** The uploaded .docx itself, kept verbatim for audit. */
    sourceDocxUrl: v.optional(v.string()),
    sourceDocxName: v.optional(v.string()),
    /** Registration number printed on the document, e.g. `HR-2026-014`. */
    documentNumber: v.optional(v.string()),
    signatureDocumentId: v.optional(v.id('signatureDocuments')),
    /** Free-form note from the issuer, shown to staff only. */
    note: v.optional(v.string()),
    issuedBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
    sentAt: v.optional(v.number()),
    signedAt: v.optional(v.number()),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_recipient', ['recipientId'])
    .index('by_blueprint', ['blueprintId'])
    .index('by_signature_document', ['signatureDocumentId']),
};
