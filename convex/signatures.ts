import { v } from 'convex/values';
import { query, mutation, internalMutation } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { personalFileCategory, personalFileCategoryForBlueprint } from './lib/documentTemplateIds';
import { isSuperadmin } from './lib/auth';
import { getAuthCaller, type AuthenticatedCaller } from './lib/getAuthCaller';
import { notify } from './lib/notify';
import { sha256Hex } from './lib/sha256';
import type { Doc, Id } from './_generated/dataModel';
import {
  assertModuleAccess,
  assertQuota,
  currentPeriodKey,
  incrementUsage,
} from './lib/entitlements';

/**
 * Content hash stored alongside the immutable document snapshot and printed in
 * the exported PDF/DOCX footer, so an archived copy can be checked against the
 * record.
 *
 * SHA-256, computed here in the mutation rather than supplied by the client: a
 * hash the server never computed proves nothing about the content it stores.
 * (Previously a 32-bit DJB2 hash — fine for a cache key, meaningless as
 * tamper-evidence for an employment contract.)
 */
function hashContent(content: string): string {
  return sha256Hex(content);
}

// ─────────────────────────────────────────────────────────────────────────────
// Authorization
//
// Signature documents hold frozen employment contracts and the signature images
// of the people who signed them, so every entry point has to establish who is
// asking. The client-supplied `userId` arguments predate this and are kept for
// call-site compatibility, but they are now *bound* to the authenticated caller
// rather than trusted: passing someone else's id is rejected.
// ─────────────────────────────────────────────────────────────────────────────

/** Is the caller an org-level manager of this organization? */
function managesOrg(caller: AuthenticatedCaller, organizationId: Id<'organizations'>): boolean {
  if (isSuperadmin(caller)) return true;
  return (
    (caller.role === 'admin' || caller.role === 'supervisor') &&
    caller.organizationId === organizationId
  );
}

/**
 * Bind a client-supplied `userId` to the authenticated caller.
 *
 * Returns `null` when unauthenticated or when the argument names someone else —
 * queries turn that into empty data, mutations into a throw.
 */
async function callerAs(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<AuthenticatedCaller | null> {
  const caller = await getAuthCaller(ctx);
  if (!caller) return null;
  if (caller._id !== userId) return null;
  return caller;
}

/** Mutation variant of {@link callerAs}. */
async function assertCallerIs(ctx: MutationCtx, userId: Id<'users'>): Promise<AuthenticatedCaller> {
  const caller = await callerAs(ctx, userId);
  if (!caller) throw new Error('Not authorized');
  return caller;
}

/**
 * May this caller see this document? Creator, any of its signers, or a manager
 * of the owning organization.
 */
async function canReadDocument(
  ctx: QueryCtx | MutationCtx,
  caller: AuthenticatedCaller,
  doc: Doc<'signatureDocuments'>,
): Promise<boolean> {
  if (doc.createdBy === caller._id) return true;
  if (managesOrg(caller, doc.organizationId)) return true;

  const requests = await ctx.db
    .query('signatureRequests')
    .withIndex('by_document', (q) => q.eq('documentId', doc._id))
    .take(SMALL_LIST_CAP);
  return requests.some((r) => r.signerId === caller._id);
}

// ============ QUERIES ============

export const listTemplates = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const { organizationId } = args;
    const caller = await getAuthCaller(ctx);
    if (!caller || !managesOrg(caller, organizationId)) return [];
    return await ctx.db
      .query('documentTemplates')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .filter((q) => q.neq(q.field('isArchived'), true))
      .take(DEFAULT_LIST_CAP);
  },
});

export const listDocuments = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
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
    const { organizationId, userId, status } = args;
    // The list is "documents I created or must sign", so the id must be mine.
    if (!(await callerAs(ctx, userId))) return [];
    // Documents where user is the creator
    const createdDocs = await ctx.db
      .query('signatureDocuments')
      .withIndex('by_creator', (q) => q.eq('createdBy', userId))
      .filter((q) => q.eq(q.field('organizationId'), organizationId))
      .order('desc')
      .take(DEFAULT_LIST_CAP);

    // Documents where user is a signer
    const myRequests = await ctx.db
      .query('signatureRequests')
      .withIndex('by_signer', (q) => q.eq('signerId', userId))
      .take(DEFAULT_LIST_CAP);

    const signerDocIds = [...new Set(myRequests.map((r) => r.documentId))];

    const signerDocs = await Promise.all(signerDocIds.map((docId) => ctx.db.get(docId)));

    // Merge and deduplicate by _id
    const allDocs: Array<Doc<'signatureDocuments'> | null> = [
      ...createdDocs,
      ...signerDocs.filter((d): d is NonNullable<typeof d> => d != null),
    ];
    const seen = new Set<string>();
    const merged = allDocs.filter((doc): doc is NonNullable<typeof doc> => {
      if (!doc) return false;
      const key = doc._id.toString();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by createdAt desc
    merged.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    // Apply optional status filter
    if (status) {
      return merged.filter((doc) => doc.status === status);
    }

    return merged;
  },
});

export const getDocument = query({
  args: { documentId: v.id('signatureDocuments') },
  handler: async (ctx, args) => {
    const { documentId } = args;
    const doc = await ctx.db.get(documentId);
    if (!doc) return null;

    // The frozen content is an employment contract and the requests carry the
    // signers' signature images — restrict to the parties and org managers.
    const caller = await getAuthCaller(ctx);
    if (!caller || !(await canReadDocument(ctx, caller, doc))) return null;

    const requests = await ctx.db
      .query('signatureRequests')
      .withIndex('by_document_order', (q) => q.eq('documentId', documentId))
      .take(DEFAULT_LIST_CAP);

    return { ...doc, requests };
  },
});

export const getTemplate = query({
  args: { templateId: v.id('documentTemplates') },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) return null;
    const caller = await getAuthCaller(ctx);
    if (!caller || !managesOrg(caller, template.organizationId)) return null;
    return template;
  },
});

export const getMyPendingSignatures = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { userId } = args;
    // "My" pending signatures — only the owner may read them.
    if (!(await callerAs(ctx, userId))) return [];
    const requests = await ctx.db
      .query('signatureRequests')
      .withIndex('by_signer_status', (q) => q.eq('signerId', userId).eq('status', 'pending'))
      .take(DEFAULT_LIST_CAP);

    // Enrich with document info
    const enriched = await Promise.all(
      requests.map(async (req) => {
        const doc = await ctx.db.get(req.documentId);

        // Signing is sequential, and the interface used to offer the pen to
        // everyone at once — so people further down the order hit a raw
        // "Previous signers have not yet signed" from the mutation. Whose turn it
        // is, and who is being waited on, is knowable here.
        const siblings = await ctx.db
          .query('signatureRequests')
          .withIndex('by_document', (q) => q.eq('documentId', req.documentId))
          .take(DEFAULT_LIST_CAP);

        const waitingFor = siblings
          .filter((r) => r.order < req.order && r.status === 'pending')
          .sort((a, b) => a.order - b.order)
          .map((r) => r.signerName);

        return { ...req, document: doc, waitingFor, isMyTurn: waitingFor.length === 0 };
      }),
    );

    return enriched.filter((r) => r.document && r.document.status !== 'cancelled');
  },
});

export const getAuditLog = query({
  args: { documentId: v.id('signatureDocuments') },
  handler: async (ctx, args) => {
    const { documentId } = args;
    const doc = await ctx.db.get(documentId);
    if (!doc) return [];
    const caller = await getAuthCaller(ctx);
    if (!caller || !(await canReadDocument(ctx, caller, doc))) return [];
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
    const caller = await callerAs(ctx, userId);
    if (!caller) return { pendingMySignature: 0, completed: 0, awaitingOthers: 0 };
    // The org-wide counters are management information.
    const orgVisible = managesOrg(caller, organizationId);

    const pending = await ctx.db
      .query('signatureRequests')
      .withIndex('by_signer_status', (q) => q.eq('signerId', userId).eq('status', 'pending'))
      .take(DEFAULT_LIST_CAP);

    const allDocs = orgVisible
      ? await ctx.db
          .query('signatureDocuments')
          .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
          .take(DEFAULT_LIST_CAP)
      : [];

    const completed = allDocs.filter((d) => d.status === 'completed').length;
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
    await assertModuleAccess(ctx, 'signatures');
    const caller = await assertCallerIs(ctx, args.createdBy);
    if (!managesOrg(caller, args.organizationId)) {
      throw new Error('Only organization managers can create document templates');
    }
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
    const template = await ctx.db.get(templateId);
    if (!template) throw new Error('Template not found');
    const caller = await getAuthCaller(ctx);
    if (!caller || !managesOrg(caller, template.organizationId)) {
      throw new Error('Not authorized to delete this template');
    }
    await ctx.db.patch(templateId, { isArchived: true });
  },
});

/**
 * Shared implementation behind `createDocument` and
 * `hiringPackets.sendForSignature`.
 *
 * Extracted as a plain function (not a mutation) so a caller can create the
 * document, its signature requests AND its own bookkeeping inside a single
 * Convex transaction. Doing it as two client calls left orphaned signature
 * documents whenever the second call failed.
 */
export async function insertSignatureDocument(
  ctx: MutationCtx,
  args: {
    organizationId: Id<'organizations'>;
    templateId?: Id<'documentTemplates'>;
    title: string;
    content: string;
    accent?: 'blue' | 'slate' | 'emerald' | 'burgundy';
    orgName?: string;
    signatureBlock?: boolean;
    fieldDefinitions: Array<{
      id: string;
      label: string;
      type: 'text' | 'date' | 'signature';
      required: boolean;
      placeholder?: string;
    }>;
    fieldValues?: Array<{ fieldId: string; value: string }>;
    signers: Array<{ userId: Id<'users'>; name: string; email: string; order: number }>;
    expiresAt?: number;
    createdBy: Id<'users'>;
  },
): Promise<Id<'signatureDocuments'>> {
  const { signers, ...docArgs } = args;
  const now = Date.now();

  const documentId = await ctx.db.insert('signatureDocuments', {
    ...docArgs,
    status: 'pending',
    contentHash: hashContent(args.content),
    createdAt: now,
  });

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
}

export const createDocument = mutation({
  args: {
    organizationId: v.id('organizations'),
    templateId: v.optional(v.id('documentTemplates')),
    title: v.string(),
    content: v.string(),
    // Optional presentation theme so the signed PDF matches the original.
    accent: v.optional(
      v.union(v.literal('blue'), v.literal('slate'), v.literal('emerald'), v.literal('burgundy')),
    ),
    orgName: v.optional(v.string()),
    signatureBlock: v.optional(v.boolean()),
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
    await assertModuleAccess(ctx, 'signatures');
    const caller = await assertCallerIs(ctx, args.createdBy);
    if (!managesOrg(caller, args.organizationId)) {
      throw new Error('Only organization managers can send documents for signature');
    }
    // A new envelope consumes one of the monthly `envelopes` on the plan.
    await assertQuota(ctx, 'signatures', 'envelopes', 1, currentPeriodKey());
    const documentId = await insertSignatureDocument(ctx, args);
    await incrementUsage(
      ctx,
      args.organizationId,
      'signatures',
      'envelopes',
      1,
      currentPeriodKey(),
    );
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
    await assertModuleAccess(ctx, 'signatures');
    const { requestId, signatureData, userId } = args;
    // Without this the client-supplied `userId` was the only thing standing
    // between an attacker and signing an employment contract as someone else.
    await assertCallerIs(ctx, userId);
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

    const completed = remainingPending.length === 0;
    if (completed) {
      // All signed — complete the document
      await ctx.db.patch(request.documentId, {
        status: 'completed',
        completedAt: now,
      });

      // ── Sync asset assignment status ─────────────────────────────
      // When a movement/return form is fully signed, update the linked
      // assetAssignment so the UI shows 'signed' everywhere (not just in
      // getAsset — which had a temporary reconciliation that never
      // persisted to the DB).
      const movementAssignment = await ctx.db
        .query('assetAssignments')
        .withIndex('by_org', (q) => q.eq('organizationId', request.organizationId))
        .filter((q) => q.eq(q.field('movementFormDocId'), request.documentId))
        .first();
      if (movementAssignment) {
        await ctx.db.patch(movementAssignment._id, { movementFormStatus: 'signed' });
      }

      const returnAssignment = await ctx.db
        .query('assetAssignments')
        .withIndex('by_org', (q) => q.eq('organizationId', request.organizationId))
        .filter((q) => q.eq(q.field('returnFormDocId'), request.documentId))
        .first();
      if (returnAssignment) {
        await ctx.db.patch(returnAssignment._id, { returnFormStatus: 'signed' });
      }

      // ── Sync hiring packet status ────────────────────────────────
      // Keeps the "6 of 9 signed" progress in the employee profile truthful
      // without the client having to report back after signing.
      const packetDoc = await ctx.db
        .query('hiringPacketDocuments')
        .withIndex('by_signature_document', (q) => q.eq('signatureDocumentId', request.documentId))
        .first();
      if (packetDoc && packetDoc.status !== 'signed') {
        await ctx.db.patch(packetDoc._id, {
          status: 'signed',
          signedAt: now,
          updatedAt: now,
        });
      }

      // Same for a document issued from the document builder.
      const issuedDoc = await ctx.db
        .query('issuedDocuments')
        .withIndex('by_signature_document', (q) => q.eq('signatureDocumentId', request.documentId))
        .first();
      if (issuedDoc && issuedDoc.status !== 'signed') {
        await ctx.db.patch(issuedDoc._id, { status: 'signed', signedAt: now, updatedAt: now });
      }
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

    // Signal the client so it can render + archive the final signed PDF.
    return { completed, documentId: request.documentId };
  },
});

/**
 * Archive the final signed PDF for a completed document.
 *
 * The PDF (with signature images, integrity hash and audit trail baked in) is
 * rendered and uploaded to Cloudinary on the client; this mutation just records
 * the resulting URL/metadata on the document. Idempotent — refuses to overwrite
 * an existing archive and only accepts completed documents.
 */
export const attachSignedPdf = mutation({
  args: {
    documentId: v.id('signatureDocuments'),
    url: v.string(),
    name: v.string(),
    size: v.number(),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { documentId, url, name, size, userId } = args;
    const caller = await assertCallerIs(ctx, userId);
    const doc = await ctx.db.get(documentId);
    if (!doc) throw new Error('Document not found');
    // The URL becomes the permanent archived original, so only a party to the
    // document may supply it.
    if (!(await canReadDocument(ctx, caller, doc))) {
      throw new Error('Not authorized to archive this document');
    }
    if (doc.status !== 'completed') {
      throw new Error('Only completed documents can be archived');
    }
    // Idempotent: keep the first archived copy.
    if (doc.signedPdfUrl) return { alreadyArchived: true, url: doc.signedPdfUrl };

    const now = Date.now();
    await ctx.db.patch(documentId, {
      signedPdfUrl: url,
      signedPdfName: name,
      signedPdfSize: size,
      archivedAt: now,
    });

    await ctx.db.insert('signatureAuditLog', {
      documentId,
      organizationId: doc.organizationId,
      userId,
      action: 'signed',
      metadata: JSON.stringify({ archivedPdf: name }),
      timestamp: now,
    });

    // ── File the signed copy in the employee's personal file ─────
    // A signed contract used to exist only inside the signatures module: the
    // employee profile showed "signed" but held no document. The archived PDF is
    // the definitive copy, so this is the moment to file it.
    const packetRow = await ctx.db
      .query('hiringPacketDocuments')
      .withIndex('by_signature_document', (q) => q.eq('signatureDocumentId', documentId))
      .first();

    const issuedRow = packetRow
      ? null
      : await ctx.db
          .query('issuedDocuments')
          .withIndex('by_signature_document', (q) => q.eq('signatureDocumentId', documentId))
          .first();

    let filing: {
      organizationId: Id<'organizations'>;
      userId: Id<'users'>;
      category: ReturnType<typeof personalFileCategory>;
    } | null = null;

    if (packetRow) {
      filing = {
        organizationId: packetRow.organizationId,
        userId: packetRow.userId,
        category: personalFileCategory(packetRow.templateId),
      };
    } else if (issuedRow) {
      // A blueprint has no catalog id, so the category comes from what its
      // author picked; a catalog-sourced issue reuses the id mapping.
      const blueprint = issuedRow.blueprintId ? await ctx.db.get(issuedRow.blueprintId) : null;
      filing = {
        organizationId: issuedRow.organizationId,
        userId: issuedRow.recipientId,
        category: blueprint
          ? personalFileCategoryForBlueprint(blueprint.category)
          : personalFileCategory(issuedRow.templateId ?? ''),
      };
    }

    if (filing) {
      const alreadyFiled = await ctx.db
        .query('employeeDocuments')
        .withIndex('by_user', (q) => q.eq('userId', filing.userId))
        .filter((q) => q.eq(q.field('fileUrl'), url))
        .first();
      if (!alreadyFiled) {
        await ctx.db.insert('employeeDocuments', {
          organizationId: filing.organizationId,
          userId: filing.userId,
          uploaderId: caller._id,
          category: filing.category,
          fileName: name,
          fileUrl: url,
          fileSize: size,
          description: `Signed ${doc.title}`,
          uploadedAt: now,
        });
      }
    }

    return { alreadyArchived: false, url };
  },
});

/**
 * Nightly sweep for completed documents that never got an archived PDF.
 *
 * Archiving runs on the client (pdfmake is browser-only), so a signer who closes
 * the tab right after signing leaves a legally complete document with no
 * permanent copy. Nothing on the server can render the PDF, so this surfaces the
 * gap instead of hiding it: the creator gets a notification with a link to the
 * signatures page, where "Archive PDF" finishes the job.
 *
 * Idempotent per document: an `archive_reminder` marker in the audit log stops it
 * from notifying about the same document twice.
 */
export const sweepUnarchivedDocuments = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Give the client a generous window to do its own archiving first.
    const cutoff = Date.now() - 6 * 60 * 60 * 1000;

    // Newest first: a document that just failed to archive is the interesting
    // case, and it keeps already-notified old rows from crowding out the cap.
    const completed = await ctx.db
      .query('signatureDocuments')
      .order('desc')
      .filter((q) => q.eq(q.field('status'), 'completed'))
      .take(DEFAULT_LIST_CAP);

    let notified = 0;
    for (const doc of completed) {
      if (doc.signedPdfUrl) continue;
      if ((doc.completedAt ?? doc.createdAt) > cutoff) continue;

      const existingReminder = await ctx.db
        .query('signatureAuditLog')
        .withIndex('by_document', (q) => q.eq('documentId', doc._id))
        .filter((q) => q.eq(q.field('action'), 'reminder_sent'))
        .filter((q) => q.eq(q.field('userId'), doc.createdBy))
        .first();
      if (existingReminder) continue;

      const now = Date.now();
      await notify(ctx, {
        organizationId: doc.organizationId,
        userId: doc.createdBy,
        type: 'system',
        titleKey: 'notifications.titles.signedDocumentNotArchived',
        messageKey: 'notifications.messages.signedDocumentNotArchived',
        params: { title: doc.title },
        fallbackTitle: '📄 Signed document not archived',
        fallbackMessage: `"${doc.title}" is fully signed but has no archived PDF. Open it in E-Signatures and press "Archive PDF".`,
        relatedId: doc._id,
        route: '/signatures',
        createdAt: now,
      });

      await ctx.db.insert('signatureAuditLog', {
        documentId: doc._id,
        organizationId: doc.organizationId,
        userId: doc.createdBy,
        action: 'reminder_sent',
        metadata: JSON.stringify({ reason: 'missing_archived_pdf' }),
        timestamp: now,
      });

      notified++;
    }

    return { scanned: completed.length, notified };
  },
});

/**
 * Release the hiring-packet row behind a cancelled/declined signature document.
 *
 * Without this the row stays `sent` forever: every packet mutation refuses to
 * touch a sent document, so HR could neither fix the text nor re-send it after a
 * refusal. Reverting to `edited`/`draft` reopens exactly those actions while
 * keeping the hand-edited body.
 */
async function releasePacketRow(
  ctx: MutationCtx,
  documentId: Id<'signatureDocuments'>,
): Promise<void> {
  const packetDoc = await ctx.db
    .query('hiringPacketDocuments')
    .withIndex('by_signature_document', (q) => q.eq('signatureDocumentId', documentId))
    .first();
  if (packetDoc && packetDoc.status !== 'signed') {
    await ctx.db.patch(packetDoc._id, {
      status: packetDoc.bodyOverride ? 'edited' : 'draft',
      signatureDocumentId: undefined,
      sentAt: undefined,
      updatedAt: Date.now(),
    });
    return;
  }

  // Same for a document issued from the document builder: a declined or
  // cancelled document goes back to being editable and re-sendable.
  const issuedDoc = await ctx.db
    .query('issuedDocuments')
    .withIndex('by_signature_document', (q) => q.eq('signatureDocumentId', documentId))
    .first();
  if (issuedDoc && issuedDoc.status !== 'signed') {
    await ctx.db.patch(issuedDoc._id, {
      status: issuedDoc.bodyOverride ? 'edited' : 'draft',
      signatureDocumentId: undefined,
      sentAt: undefined,
      updatedAt: Date.now(),
    });
  }
}

export const declineDocument = mutation({
  args: {
    requestId: v.id('signatureRequests'),
    reason: v.optional(v.string()),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { requestId, reason, userId } = args;
    await assertCallerIs(ctx, userId);
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

    // Cancel the document too: a declined signature means this version is dead,
    // and leaving it `pending` would keep the linked hiring packet row frozen.
    const doc = await ctx.db.get(request.documentId);
    if (doc && doc.status !== 'completed' && doc.status !== 'cancelled') {
      await ctx.db.patch(request.documentId, { status: 'cancelled' });
    }
    await releasePacketRow(ctx, request.documentId);

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
    await assertModuleAccess(ctx, 'signatures');
    const { documentId, userId } = args;
    const caller = await assertCallerIs(ctx, userId);
    const doc = await ctx.db.get(documentId);
    if (!doc) throw new Error('Document not found');
    // Creator, or a manager of the owning organization (so a departed creator
    // does not leave documents nobody can cancel).
    if (doc.createdBy !== userId && !managesOrg(caller, doc.organizationId)) {
      throw new Error('Only the creator or an organization manager can cancel');
    }
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

    // Let the hiring packet row become editable / re-sendable again.
    await releasePacketRow(ctx, documentId);

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
    const caller = await assertCallerIs(ctx, userId);
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('Request not found');
    if (request.status !== 'pending') throw new Error('Cannot remind non-pending request');

    const doc = await ctx.db.get(request.documentId);
    if (!doc) throw new Error('Document not found');
    if (doc.createdBy !== userId && !managesOrg(caller, doc.organizationId)) {
      throw new Error('Not authorized to send reminders for this document');
    }

    // Actually remind the signer. Previously this only wrote an audit entry, so
    // the "Reminder sent" toast was the whole feature.
    await notify(ctx, {
      organizationId: request.organizationId,
      userId: request.signerId,
      type: 'system',
      titleKey: 'notifications.titles.documentAwaitingSignature',
      messageKey: 'notifications.messages.documentAwaitingSignature',
      params: { title: doc.title },
      fallbackTitle: '✍️ Document awaiting your signature',
      fallbackMessage: `"${doc.title}" is waiting for your signature in the E-Signatures section.`,
      relatedId: request.documentId,
      route: '/signatures',
    });

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
