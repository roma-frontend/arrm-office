import { defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * Hiring packet — the set of documents generated automatically when an employee
 * is created.
 *
 * Design notes:
 *
 * - The template TEXT is not stored here. Each row references a catalog template
 *   id (`src/lib/documentCatalog.ts`) and the body is resolved live from the
 *   catalog plus the employee's current data, so fixing a typo in a template or
 *   filling in a missing passport number updates every unsent document instead
 *   of leaving stale copies behind.
 *
 * - Immutability kicks in at send time: `signatures.createDocument` snapshots the
 *   fully resolved bilingual content, and `signatureDocumentId` links to it.
 *   After that this row is only a pointer plus status.
 *
 * - `bodyOverride` holds the block model recovered from an edited Word file
 *   (see `src/lib/docxRoundTrip.ts`). Its presence is what makes a document
 *   "edited": the catalog text is no longer used for it.
 */
export const hiringPackets = {
  hiringPacketDocuments: defineTable({
    organizationId: v.id('organizations'),
    /** The employee the packet belongs to (`users._id`). */
    userId: v.id('users'),
    /** Catalog template id, e.g. `employment-contract`. */
    templateId: v.string(),
    /** Presentation order within the packet. */
    order: v.number(),
    /**
     * Second language of the bilingual document. Armenian (`hy`) is always the
     * first column and is not configurable — it is the legally binding text.
     */
    secondaryLocale: v.union(v.literal('en'), v.literal('ru'), v.literal('de'), v.literal('hy')),
    /** Whether the employee must sign this one before onboarding completes. */
    mandatory: v.boolean(),
    status: v.union(
      // Generated from the catalog, not yet touched.
      v.literal('draft'),
      // Body replaced by an uploaded, hand-edited Word file.
      v.literal('edited'),
      // Frozen and sent for signature.
      v.literal('sent'),
      // All signatures collected.
      v.literal('signed'),
      // Removed from the packet by HR (kept for audit).
      v.literal('skipped'),
    ),
    /**
     * `DocumentBlock[]` from a re-imported Word file, JSON-encoded. Stored as a
     * string because the block model is a recursive union that Convex validators
     * cannot express, and it is only ever read back by the same TypeScript code
     * that wrote it.
     */
    bodyOverride: v.optional(v.string()),
    /** The original uploaded .docx, kept verbatim for audit. */
    sourceDocxUrl: v.optional(v.string()),
    sourceDocxName: v.optional(v.string()),
    /** Registration number printed on the document, e.g. `HR-2026-014`. */
    documentNumber: v.optional(v.string()),
    /** Set once the document has been sent for signature. */
    signatureDocumentId: v.optional(v.id('signatureDocuments')),
    sentAt: v.optional(v.number()),
    signedAt: v.optional(v.number()),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_user_order', ['userId', 'order'])
    .index('by_org', ['organizationId'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_signature_document', ['signatureDocumentId']),

  /**
   * Per-organization, per-year counter backing `documentNumber`. A dedicated
   * table (rather than counting existing rows) keeps numbering gap-free and
   * race-free: the counter is patched inside the same mutation that assigns it.
   */
  documentNumberCounters: defineTable({
    organizationId: v.id('organizations'),
    /** Calendar year the sequence belongs to. */
    year: v.number(),
    /** Short series code, e.g. `HR`. */
    series: v.string(),
    lastNumber: v.number(),
    updatedAt: v.number(),
  }).index('by_org_year_series', ['organizationId', 'year', 'series']),
};
