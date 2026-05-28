import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';

// ============ QUERIES ============

export const listTemplates = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const { organizationId } = args;
    return await ctx.db
      .query('documentTemplates')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .filter((q: any) => q.neq(q.field('isArchived'), true))
      .take(DEFAULT_LIST_CAP);
  },
});

export const listDocuments = query({
  args: {
    organizationId: v.id('organizations'),
    status: v.optional(
      v.union(
        v.literal('draft'),
        v.literal('pending'),
        v.literal('partially_signed'),
        v.literal('completed'),
        v.literal('cancelled'),
        v.literal('expired'),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const { organizationId, status } = args;
    if (status) {
      return await ctx.db
        .query('signatureDocuments')
        .withIndex('by_org_status', (q) =>
          q.eq('organizationId', organizationId).eq('status', status),
        )
        .order('desc')
        .take(DEFAULT_LIST_CAP);
    }
    return await ctx.db
      .query('signatureDocuments')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .order('desc')
      .take(DEFAULT_LIST_CAP);
  },
});

export const getDocument = query({
  args: { documentId: v.id('signatureDocuments') },
  handler: async (ctx, args) => {
    const { documentId } = args;
    const doc = await ctx.db.get(documentId);
    if (!doc) return null;

    const requests = await ctx.db
      .query('signatureRequests')
      .withIndex('by_document_order', (q) => q.eq('documentId', documentId))
      .take(DEFAULT_LIST_CAP);

    return { ...doc, requests };
  },
});

export const getMyPendingSignatures = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { userId } = args;
    const requests = await ctx.db
      .query('signatureRequests')
      .withIndex('by_signer_status', (q) => q.eq('signerId', userId).eq('status', 'pending'))
      .take(DEFAULT_LIST_CAP);

    // Enrich with document info
    const enriched = await Promise.all(
      requests.map(async (req) => {
        const doc = await ctx.db.get(req.documentId);
        return { ...req, document: doc };
      }),
    );

    return enriched.filter((r: any) => r.document && r.document.status !== 'cancelled');
  },
});

export const getAuditLog = query({
  args: { documentId: v.id('signatureDocuments') },
  handler: async (ctx, args) => {
    const { documentId } = args;
    return await ctx.db
      .query('signatureAuditLog')
      .withIndex('by_document_time', (q) => q.eq('documentId', documentId))
      .order('desc')
      .take(DEFAULT_LIST_CAP);
  },
});

export const getStats = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { organizationId, userId } = args;
    const pending = await ctx.db
      .query('signatureRequests')
      .withIndex('by_signer_status', (q) => q.eq('signerId', userId).eq('status', 'pending'))
      .take(DEFAULT_LIST_CAP);

    const allDocs = await ctx.db
      .query('signatureDocuments')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    const completed = allDocs.filter((d: any) => d.status === 'completed').length;
    const awaitingOthers = allDocs.filter(
      (d) => d.status === 'pending' || d.status === 'partially_signed',
    ).length;

    return {
      pendingMySignature: pending.length,
      completed,
      awaitingOthers,
    };
  },
});

// ============ MUTATIONS ============

export const createTemplate = mutation({
  args: {
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
    content: v.string(),
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
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('documentTemplates', {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const deleteTemplate = mutation({
  args: { templateId: v.id('documentTemplates') },
  handler: async (ctx, args) => {
    const { templateId } = args;
    await ctx.db.patch(templateId, { isArchived: true });
  },
});

export const createDocument = mutation({
  args: {
    organizationId: v.id('organizations'),
    templateId: v.optional(v.id('documentTemplates')),
    title: v.string(),
    content: v.string(),
    fieldDefinitions: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        type: v.union(v.literal('text'), v.literal('date'), v.literal('signature')),
        required: v.boolean(),
        placeholder: v.optional(v.string()),
      }),
    ),
    fieldValues: v.optional(
      v.array(
        v.object({
          fieldId: v.string(),
          value: v.string(),
        }),
      ),
    ),
    signers: v.array(
      v.object({
        userId: v.id('users'),
        name: v.string(),
        email: v.string(),
        order: v.number(),
      }),
    ),
    expiresAt: v.optional(v.number()),
    createdBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { signers, ...docArgs } = args;
    const now = Date.now();

    // Simple hash for content integrity
    const contentHash = btoa(args.content.slice(0, 100) + args.content.length);

    // Create the document (immutable snapshot)
    const documentId = await ctx.db.insert('signatureDocuments', {
      ...docArgs,
      status: 'pending',
      contentHash,
      createdAt: now,
    });

    // Create signature requests for each signer
    for (const signer of signers) {
      await ctx.db.insert('signatureRequests', {
        documentId,
        organizationId: args.organizationId,
        signerId: signer.userId,
        signerName: signer.name,
        signerEmail: signer.email,
        order: signer.order,
        status: 'pending',
        createdAt: now,
      });
    }

    // Audit log
    await ctx.db.insert('signatureAuditLog', {
      documentId,
      organizationId: args.organizationId,
      userId: args.createdBy,
      action: 'created',
      timestamp: now,
    });

    await ctx.db.insert('signatureAuditLog', {
      documentId,
      organizationId: args.organizationId,
      userId: args.createdBy,
      action: 'sent',
      metadata: JSON.stringify({ signerCount: signers.length }),
      timestamp: now + 1,
    });

    return documentId;
  },
});

export const signDocument = mutation({
  args: {
    requestId: v.id('signatureRequests'),
    signatureData: v.string(),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { requestId, signatureData, userId } = args;
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('Signature request not found');
    if (request.signerId !== userId) throw new Error('Not authorized to sign');
    if (request.status !== 'pending') throw new Error('Request already processed');

    const doc = await ctx.db.get(request.documentId);
    if (!doc || doc.status === 'cancelled') throw new Error('Document not available');

    // Enforce sequential signing: check that all previous orders are signed
    const allRequests = await ctx.db
      .query('signatureRequests')
      .withIndex('by_document', (q) => q.eq('documentId', request.documentId))
      .take(DEFAULT_LIST_CAP);

    const previousUnsigned = allRequests.filter(
      (r) => r.order < request.order && r.status === 'pending',
    );
    if (previousUnsigned.length > 0) {
      throw new Error('Previous signers have not yet signed');
    }

    const now = Date.now();

    // Apply signature
    await ctx.db.patch(requestId, {
      status: 'signed',
      signedAt: now,
      signatureData,
      consentText: `I, ${request.signerName}, hereby sign this document electronically.`,
    });

    // Check if all requests are now signed
    const remainingPending = allRequests.filter(
      (r) => r._id !== requestId && r.status === 'pending',
    );

    if (remainingPending.length === 0) {
      // All signed — complete the document
      await ctx.db.patch(request.documentId, {
        status: 'completed',
        completedAt: now,
      });
    } else {
      // Partially signed
      await ctx.db.patch(request.documentId, {
        status: 'partially_signed',
      });
    }

    // Audit log
    await ctx.db.insert('signatureAuditLog', {
      documentId: request.documentId,
      organizationId: request.organizationId,
      userId,
      action: 'signed',
      timestamp: now,
    });
  },
});

export const declineDocument = mutation({
  args: {
    requestId: v.id('signatureRequests'),
    reason: v.optional(v.string()),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { requestId, reason, userId } = args;
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('Signature request not found');
    if (request.signerId !== userId) throw new Error('Not authorized');
    if (request.status !== 'pending') throw new Error('Request already processed');

    const now = Date.now();

    await ctx.db.patch(requestId, {
      status: 'declined',
      declinedAt: now,
      declinedReason: reason,
    });

    // Audit log
    await ctx.db.insert('signatureAuditLog', {
      documentId: request.documentId,
      organizationId: request.organizationId,
      userId,
      action: 'declined',
      metadata: reason ? JSON.stringify({ reason }) : undefined,
      timestamp: now,
    });
  },
});

export const cancelDocument = mutation({
  args: {
    documentId: v.id('signatureDocuments'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { documentId, userId } = args;
    const doc = await ctx.db.get(documentId);
    if (!doc) throw new Error('Document not found');
    if (doc.createdBy !== userId) throw new Error('Only creator can cancel');
    if (doc.status === 'completed') throw new Error('Cannot cancel completed document');

    const now = Date.now();

    await ctx.db.patch(documentId, { status: 'cancelled' });

    // Cancel all pending requests
    const requests = await ctx.db
      .query('signatureRequests')
      .withIndex('by_document', (q) => q.eq('documentId', documentId))
      .take(SMALL_LIST_CAP);

    for (const req of requests) {
      if (req.status === 'pending') {
        await ctx.db.patch(req._id, { status: 'expired' });
      }
    }

    // Audit log
    await ctx.db.insert('signatureAuditLog', {
      documentId,
      organizationId: doc.organizationId,
      userId,
      action: 'cancelled',
      timestamp: now,
    });
  },
});

export const sendReminder = mutation({
  args: {
    requestId: v.id('signatureRequests'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { requestId, userId } = args;
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('Request not found');
    if (request.status !== 'pending') throw new Error('Cannot remind non-pending request');

    // Audit log the reminder
    await ctx.db.insert('signatureAuditLog', {
      documentId: request.documentId,
      organizationId: request.organizationId,
      userId,
      action: 'reminder_sent',
      metadata: JSON.stringify({ signerId: request.signerId }),
      timestamp: Date.now(),
    });
  },
});
