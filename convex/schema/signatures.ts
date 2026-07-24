import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const signatures = {
  documentTemplates: defineTable({
    organizationId: v.id('organizations'),
    title: v.string(),
    description: v.optional(v.string()),
    category: v.union(
      v.literal('nda'),
      v.literal('offer'),
      v.literal('contract'),
      v.literal('policy'),
      v.literal('custom'),
    ),
    // Structured content (markdown-like sections)
    content: v.string(),
    // Configurable fields that signers/creators fill in
    fields: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        type: v.union(v.literal('text'), v.literal('date'), v.literal('signature')),
        required: v.boolean(),
        placeholder: v.optional(v.string()),
      }),
    ),
    createdBy: v.id('users'),
    createdAt: v.number(),
    isArchived: v.optional(v.boolean()),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_category', ['organizationId', 'category']),

  signatureDocuments: defineTable({
    organizationId: v.id('organizations'),
    templateId: v.optional(v.id('documentTemplates')),
    title: v.string(),
    // Immutable snapshot of document content at send time
    content: v.string(),
    // Snapshot of field definitions at send time
    fieldDefinitions: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        type: v.union(v.literal('text'), v.literal('date'), v.literal('signature')),
        required: v.boolean(),
        placeholder: v.optional(v.string()),
      }),
    ),
    // Filled field values (by creator)
    fieldValues: v.optional(
      v.array(
        v.object({
          fieldId: v.string(),
          value: v.string(),
        }),
      ),
    ),
    status: v.union(
      v.literal('draft'),
      v.literal('pending'),
      v.literal('partially_signed'),
      v.literal('completed'),
      v.literal('cancelled'),
      v.literal('expired'),
    ),
    // Content hash for integrity verification
    contentHash: v.optional(v.string()),
    // Presentation theme captured at send time so the signed/archived PDF is
    // rendered with the SAME look as the original themed document (Document
    // Library), not a generic audit report.
    accent: v.optional(
      v.union(v.literal('blue'), v.literal('slate'), v.literal('emerald'), v.literal('burgundy')),
    ),
    orgName: v.optional(v.string()),
    signatureBlock: v.optional(v.boolean()),
    expiresAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    // Archived final signed PDF (Cloudinary URL) — generated once all signers complete.
    signedPdfUrl: v.optional(v.string()),
    signedPdfName: v.optional(v.string()),
    signedPdfSize: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    createdBy: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_org_created', ['organizationId', 'createdAt'])
    .index('by_creator', ['createdBy']),

  signatureRequests: defineTable({
    documentId: v.id('signatureDocuments'),
    organizationId: v.id('organizations'),
    signerId: v.id('users'),
    signerName: v.string(),
    signerEmail: v.string(),
    // Sequential signing order (1, 2, 3...)
    order: v.number(),
    status: v.union(
      v.literal('pending'),
      v.literal('signed'),
      v.literal('declined'),
      v.literal('expired'),
    ),
    signedAt: v.optional(v.number()),
    declinedAt: v.optional(v.number()),
    declinedReason: v.optional(v.string()),
    // Base64 PNG of drawn signature
    signatureData: v.optional(v.string()),
    // Consent metadata
    consentText: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_document', ['documentId'])
    .index('by_document_order', ['documentId', 'order'])
    .index('by_signer', ['signerId'])
    .index('by_signer_status', ['signerId', 'status'])
    .index('by_org', ['organizationId']),

  signatureAuditLog: defineTable({
    documentId: v.id('signatureDocuments'),
    organizationId: v.id('organizations'),
    userId: v.optional(v.id('users')),
    action: v.union(
      v.literal('created'),
      v.literal('sent'),
      v.literal('viewed'),
      v.literal('signed'),
      v.literal('declined'),
      v.literal('cancelled'),
      v.literal('expired'),
      v.literal('reminder_sent'),
    ),
    metadata: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index('by_document', ['documentId'])
    .index('by_document_time', ['documentId', 'timestamp'])
    .index('by_org', ['organizationId']),
};
