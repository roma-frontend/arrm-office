import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const assets = {
  // ── Asset Catalog ──────────────────────────────────────────
  assetCatalog: defineTable({
    organizationId: v.id('organizations'),

    // Identity
    name: v.string(),
    category: v.union(
      v.literal('laptop'),
      v.literal('monitor'),
      v.literal('phone'),
      v.literal('tablet'),
      v.literal('peripheral'),
      v.literal('furniture'),
      v.literal('software_license'),
      v.literal('vehicle'),
      v.literal('other'),
    ),
    serialNumber: v.optional(v.string()),
    assetTag: v.optional(v.string()),
    brand: v.optional(v.string()),
    model: v.optional(v.string()),

    // Purchase details
    purchaseDate: v.optional(v.number()),
    purchasePrice: v.optional(v.number()),
    currency: v.optional(v.string()),
    warrantyExpiry: v.optional(v.number()),
    vendor: v.optional(v.string()),
    invoiceNumber: v.optional(v.string()),

    // Link to expense
    expenseId: v.optional(v.id('expenses')),

    // Status
    status: v.union(
      v.literal('available'),
      v.literal('assigned'),
      v.literal('maintenance'),
      v.literal('retired'),
      v.literal('lost'),
    ),
    condition: v.union(
      v.literal('new'),
      v.literal('good'),
      v.literal('fair'),
      v.literal('poor'),
      v.literal('damaged'),
    ),
    location: v.optional(v.string()),

    // Image
    imageStorageId: v.optional(v.id('_storage')),
    imageUrl: v.optional(v.string()),

    // Metadata
    notes: v.optional(v.string()),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_category', ['organizationId', 'category'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_serial', ['organizationId', 'serialNumber'])
    .index('by_org_created', ['organizationId', 'createdAt']),

  // ── Asset Assignments (history of who has what) ────────────
  assetAssignments: defineTable({
    organizationId: v.id('organizations'),
    assetId: v.id('assetCatalog'),
    assignedTo: v.id('users'),
    assignedBy: v.id('users'),
    assignedAt: v.number(),
    expectedReturnAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
    returnedBy: v.optional(v.id('users')),
    conditionOnReturn: v.optional(
      v.union(v.literal('good'), v.literal('fair'), v.literal('poor'), v.literal('damaged')),
    ),
    notes: v.optional(v.string()),
    status: v.union(v.literal('active'), v.literal('returned'), v.literal('lost')),
    // Movement form e-signature (assign)
    movementFormDocId: v.optional(v.id('signatureDocuments')),
    movementFormStatus: v.optional(
      v.union(v.literal('not_sent'), v.literal('pending'), v.literal('signed')),
    ),
    // Return form e-signature (return)
    returnFormDocId: v.optional(v.id('signatureDocuments')),
    returnFormStatus: v.optional(
      v.union(v.literal('not_sent'), v.literal('pending'), v.literal('signed')),
    ),
  })
    .index('by_org', ['organizationId'])
    .index('by_asset', ['assetId'])
    .index('by_assignee', ['assignedTo'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_asset_active', ['assetId', 'status'])
    .index('by_assignee_active', ['assignedTo', 'status'])
    .index('by_assignee_org', ['organizationId', 'assignedTo']),

  // ── Maintenance & Repairs ──────────────────────────────────
  assetMaintenance: defineTable({
    organizationId: v.id('organizations'),
    assetId: v.id('assetCatalog'),
    type: v.union(
      v.literal('scheduled'),
      v.literal('repair'),
      v.literal('upgrade'),
      v.literal('inspection'),
    ),
    description: v.string(),
    scheduledDate: v.optional(v.number()),
    completedDate: v.optional(v.number()),
    cost: v.optional(v.number()),
    performedBy: v.optional(v.string()),
    status: v.union(
      v.literal('scheduled'),
      v.literal('in_progress'),
      v.literal('completed'),
      v.literal('cancelled'),
    ),
    notes: v.optional(v.string()),
    createdBy: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_asset', ['assetId'])
    .index('by_asset_date', ['assetId', 'scheduledDate'])
    .index('by_org_status', ['organizationId', 'status']),

  // ── Asset Requests from employees ──────────────────────────
  assetRequests: defineTable({
    organizationId: v.id('organizations'),
    requestedBy: v.id('users'),
    category: v.union(
      v.literal('laptop'),
      v.literal('monitor'),
      v.literal('phone'),
      v.literal('peripheral'),
      v.literal('software'),
      v.literal('other'),
    ),
    reason: v.string(),
    urgency: v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
    status: v.union(
      v.literal('pending'),
      v.literal('approved'),
      v.literal('fulfilled'),
      v.literal('rejected'),
    ),
    approvedBy: v.optional(v.id('users')),
    approvedAt: v.optional(v.number()),
    fulfilledBy: v.optional(v.id('assetCatalog')),
    rejectionReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_requestor', ['requestedBy'])
    .index('by_org_status', ['organizationId', 'status']),
};
