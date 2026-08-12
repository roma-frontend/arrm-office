/**
 * Hiring packet — the documents an employee has to sign when they are hired.
 *
 * Division of labour between client and server:
 *
 * - The server owns the packet's *state*: which templates it contains, their
 *   order, whether each one is a draft / hand-edited / sent / signed, the
 *   registration numbers, and the link to the signature document.
 *
 * - The client owns *rendering*: it resolves the catalog template against the
 *   employee's data, lays it out bilingually, and produces the final text. The
 *   template bodies (14 templates × 4 locales) live in `src/lib/documentCatalog.ts`
 *   and are deliberately NOT duplicated into Convex.
 *
 * The two meet in `sendForSignature`, which takes the fully resolved text and
 * freezes it: from that point the content lives immutably in
 * `signatureDocuments.content` with a server-computed SHA-256.
 */
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { isSuperadmin } from './lib/auth';
import { getAuthCaller } from './lib/getAuthCaller';
import { isCatalogTemplateId } from './lib/documentTemplateIds';
import { allocateDocumentNumber } from './lib/documentNumbers';
import { DEFAULT_LIST_CAP } from './lib/limits';
import { notify } from './lib/notify';
import { insertSignatureDocument } from './signatures';

/** Locale codes a document can be issued in. */
const localeValidator = v.union(v.literal('en'), v.literal('ru'), v.literal('de'), v.literal('hy'));

/** Upper bound on packet size — guards against a client sending a huge list. */
const MAX_PACKET_SIZE = 30;

/**
 * Who may see / manage an employee's hiring packet.
 *
 * Same rule as `employeeProfiles`: same-org admins and supervisors, superadmins,
 * and the employee themself. `manageOnly` excludes the employee, because they
 * must not be able to rewrite the documents they are being asked to sign.
 */
async function resolvePacketAccess(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  opts: { manageOnly?: boolean } = {},
) {
  const caller = await getAuthCaller(ctx);
  if (!caller) return null;

  const target = await ctx.db.get(userId);
  if (!target) return null;

  if (isSuperadmin(caller)) return { caller, target };

  const isOrgStaff =
    (caller.role === 'admin' || caller.role === 'supervisor') &&
    !!caller.organizationId &&
    caller.organizationId === target.organizationId;
  if (isOrgStaff) return { caller, target };

  if (!opts.manageOnly && caller._id === userId) return { caller, target };

  return null;
}

/** Mutation variant: throws instead of returning null. */
async function assertCanManagePacket(
  ctx: MutationCtx,
  userId: Id<'users'>,
  opts: { manageOnly?: boolean } = {},
) {
  const access = await resolvePacketAccess(ctx, userId, opts);
  if (!access) throw new Error('Not authorized to manage this hiring packet');
  return access;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The employee's packet, ordered, with each row's signature state resolved.
 *
 * Returns `[]` rather than throwing when access is denied so the profile page
 * degrades to an empty section instead of an error boundary.
 */
export const listForEmployee = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    if (!(await resolvePacketAccess(ctx, args.userId))) return [];

    const rows = await ctx.db
      .query('hiringPacketDocuments')
      .withIndex('by_user_order', (q) => q.eq('userId', args.userId))
      .take(MAX_PACKET_SIZE);

    return await Promise.all(
      rows
        .slice()
        .sort((a, b) => a.order - b.order)
        .map(async (row) => {
          const signatureDoc = row.signatureDocumentId
            ? await ctx.db.get(row.signatureDocumentId)
            : null;
          const requests = row.signatureDocumentId
            ? await ctx.db
                .query('signatureRequests')
                .withIndex('by_document_order', (q) =>
                  q.eq('documentId', row.signatureDocumentId as Id<'signatureDocuments'>),
                )
                .take(DEFAULT_LIST_CAP)
            : [];

          return {
            ...row,
            signatureStatus: signatureDoc?.status ?? null,
            signedPdfUrl: signatureDoc?.signedPdfUrl ?? null,
            contentHash: signatureDoc?.contentHash ?? null,
            /**
             * The immutable snapshot taken at send time. Returned so the client
             * renders a sent/signed document from what was actually signed rather
             * than re-resolving the template against current employee data.
             */
            frozenContent: signatureDoc?.content ?? null,
            signers: requests.map((r) => ({
              requestId: r._id,
              signerId: r.signerId,
              signerName: r.signerName,
              status: r.status,
              signedAt: r.signedAt ?? null,
              order: r.order,
            })),
          };
        }),
    );
  },
});

/** Compact progress summary for badges: "6 of 9 signed". */
export const getPacketSummary = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    if (!(await resolvePacketAccess(ctx, args.userId))) return null;

    const rows = await ctx.db
      .query('hiringPacketDocuments')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .take(MAX_PACKET_SIZE);

    const active = rows.filter((r) => r.status !== 'skipped');
    const signed = active.filter((r) => r.status === 'signed');
    const mandatoryOutstanding = active.filter((r) => r.mandatory && r.status !== 'signed');

    return {
      total: active.length,
      signed: signed.length,
      sent: active.filter((r) => r.status === 'sent').length,
      draft: active.filter((r) => r.status === 'draft' || r.status === 'edited').length,
      mandatoryOutstanding: mandatoryOutstanding.length,
      /** True once every mandatory document carries a completed signature. */
      complete: active.length > 0 && mandatoryOutstanding.length === 0,
      secondaryLocale: rows[0]?.secondaryLocale ?? null,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create the packet rows for a freshly hired employee.
 *
 * Idempotent: templates already present are left untouched, so calling it again
 * after adding a template to the default packet tops the packet up instead of
 * duplicating documents. Deliberately does NOT resolve or store any text — see
 * the module comment.
 */
export const generate = mutation({
  args: {
    userId: v.id('users'),
    secondaryLocale: localeValidator,
    /** Catalog template ids, in presentation order. */
    templateIds: v.array(v.string()),
    /** Subset of `templateIds` that must be signed. */
    mandatoryTemplateIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { caller, target } = await assertCanManagePacket(ctx, args.userId, {
      manageOnly: true,
    });

    if (!target.organizationId) {
      throw new Error('Employee has no organization — cannot generate a hiring packet');
    }
    if (args.templateIds.length === 0) {
      throw new Error('A hiring packet needs at least one document');
    }
    if (args.templateIds.length > MAX_PACKET_SIZE) {
      throw new Error(`A hiring packet cannot exceed ${MAX_PACKET_SIZE} documents`);
    }

    // Never store an id the catalog cannot render: such a row shows up as
    // "Could not build this document", blocks `getPacketSummary.complete`
    // forever if marked mandatory, and cannot be removed.
    const unknown = args.templateIds.filter((id) => !isCatalogTemplateId(id));
    if (unknown.length > 0) {
      throw new Error(`Unknown document template(s): ${unknown.join(', ')}`);
    }
    if (new Set(args.templateIds).size !== args.templateIds.length) {
      throw new Error('The packet contains duplicate documents');
    }
    const orphanMandatory = args.mandatoryTemplateIds.filter(
      (id) => !args.templateIds.includes(id),
    );
    if (orphanMandatory.length > 0) {
      throw new Error(
        `Mandatory document(s) not part of the packet: ${orphanMandatory.join(', ')}`,
      );
    }

    const existing = await ctx.db
      .query('hiringPacketDocuments')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .take(MAX_PACKET_SIZE);
    const existingIds = new Set(existing.map((row) => row.templateId));

    const now = Date.now();
    const mandatory = new Set(args.mandatoryTemplateIds);
    const created: Id<'hiringPacketDocuments'>[] = [];
    // Continue after the highest existing order rather than reusing the index in
    // `templateIds`: topping an existing packet up would otherwise produce two
    // rows with the same order.
    let nextOrder = existing.reduce((max, row) => Math.max(max, row.order), -1) + 1;

    for (const templateId of args.templateIds) {
      if (existingIds.has(templateId)) continue;
      const id = await ctx.db.insert('hiringPacketDocuments', {
        organizationId: target.organizationId,
        userId: args.userId,
        templateId,
        order: nextOrder++,
        secondaryLocale: args.secondaryLocale,
        mandatory: mandatory.has(templateId),
        status: 'draft',
        createdBy: caller._id,
        createdAt: now,
        updatedAt: now,
      });
      created.push(id);
    }

    return { created: created.length, skipped: args.templateIds.length - created.length };
  },
});

/** Change the second language of every not-yet-sent document in the packet. */
export const setSecondaryLocale = mutation({
  args: { userId: v.id('users'), secondaryLocale: localeValidator },
  handler: async (ctx, args) => {
    await assertCanManagePacket(ctx, args.userId, { manageOnly: true });

    const rows = await ctx.db
      .query('hiringPacketDocuments')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .take(MAX_PACKET_SIZE);

    let updated = 0;
    for (const row of rows) {
      // A sent document is frozen: its text is already snapshotted and possibly
      // signed, so switching languages retroactively would be a forgery.
      if (row.status === 'sent' || row.status === 'signed') continue;
      if (row.secondaryLocale === args.secondaryLocale) continue;
      await ctx.db.patch(row._id, {
        secondaryLocale: args.secondaryLocale,
        updatedAt: Date.now(),
      });
      updated++;
    }
    return { updated };
  },
});

/**
 * Store the block model recovered from a hand-edited Word file.
 *
 * `blocksJson` is produced by `parseEditableDocx` (`src/lib/docxRoundTrip.ts`).
 * The original file is kept in `sourceDocxUrl` for audit even though the body
 * that gets rendered and signed is the parsed one.
 */
export const applyDocxOverride = mutation({
  args: {
    packetDocumentId: v.id('hiringPacketDocuments'),
    /** JSON-encoded `DocumentBlock[]`. */
    blocksJson: v.string(),
    sourceDocxUrl: v.optional(v.string()),
    sourceDocxName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.packetDocumentId);
    if (!row) throw new Error('Packet document not found');
    await assertCanManagePacket(ctx, row.userId, { manageOnly: true });

    if (row.status === 'sent' || row.status === 'signed') {
      throw new Error('This document has already been sent for signature and cannot be edited');
    }

    // Validate the payload here rather than discovering it is broken at render
    // time, when the employee is already waiting to sign.
    let parsed: unknown;
    try {
      parsed = JSON.parse(args.blocksJson);
    } catch {
      throw new Error('The edited document could not be stored (invalid content)');
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('The edited document contains no content');
    }

    await ctx.db.patch(args.packetDocumentId, {
      bodyOverride: args.blocksJson,
      sourceDocxUrl: args.sourceDocxUrl,
      sourceDocxName: args.sourceDocxName,
      status: 'edited',
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

/** Drop a hand-edited body and go back to the catalog template. */
export const revertToTemplate = mutation({
  args: { packetDocumentId: v.id('hiringPacketDocuments') },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.packetDocumentId);
    if (!row) throw new Error('Packet document not found');
    await assertCanManagePacket(ctx, row.userId, { manageOnly: true });

    if (row.status === 'sent' || row.status === 'signed') {
      throw new Error('This document has already been sent for signature');
    }

    await ctx.db.patch(args.packetDocumentId, {
      bodyOverride: undefined,
      sourceDocxUrl: undefined,
      sourceDocxName: undefined,
      status: 'draft',
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Exclude a situational document from this employee's packet (or bring it back). */
export const setSkipped = mutation({
  args: { packetDocumentId: v.id('hiringPacketDocuments'), skipped: v.boolean() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.packetDocumentId);
    if (!row) throw new Error('Packet document not found');
    await assertCanManagePacket(ctx, row.userId, { manageOnly: true });

    if (row.status === 'sent' || row.status === 'signed') {
      throw new Error('This document has already been sent for signature');
    }
    if (args.skipped && row.mandatory) {
      throw new Error('This document is mandatory and cannot be skipped');
    }

    await ctx.db.patch(args.packetDocumentId, {
      status: args.skipped ? 'skipped' : row.bodyOverride ? 'edited' : 'draft',
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Freeze one packet document and send it for signature.
 *
 * The caller passes the fully resolved bilingual text (rendered client-side from
 * the catalog + the employee's data, or from a hand-edited body). Creating the
 * signature document and linking it happen in this one transaction, so a failure
 * can never leave a signature request the packet does not know about.
 */
export const sendForSignature = mutation({
  args: {
    packetDocumentId: v.id('hiringPacketDocuments'),
    title: v.string(),
    /** Resolved content, `__HP__`-prefixed JSON (see `hiringPacketDocument.ts`). */
    content: v.string(),
    accent: v.union(
      v.literal('blue'),
      v.literal('slate'),
      v.literal('emerald'),
      v.literal('burgundy'),
    ),
    orgName: v.string(),
    /** Additional signer on the employer's side (order 2), usually the admin. */
    countersignerId: v.optional(v.id('users')),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.packetDocumentId);
    if (!row) throw new Error('Packet document not found');
    const { caller, target } = await assertCanManagePacket(ctx, row.userId, {
      manageOnly: true,
    });

    if (row.status === 'sent' || row.status === 'signed') {
      throw new Error('This document has already been sent for signature');
    }
    if (row.status === 'skipped') {
      throw new Error('This document was excluded from the packet');
    }
    if (!args.content.trim()) {
      throw new Error('Cannot send an empty document for signature');
    }

    // The employee always signs first; the employer countersigns afterwards, so
    // the countersignature is never applied to something the employee refused.
    //
    // The countersigner gets their own request even when they are the same person
    // as the employee: the packet prints two signature boxes, and skipping the
    // second request left the employer's box with a blank signature line that
    // nothing could fill.
    const signers: Array<{
      userId: Id<'users'>;
      name: string;
      email: string;
      order: number;
    }> = [
      {
        userId: row.userId,
        name: target.name ?? '',
        email: target.email ?? '',
        order: 1,
      },
    ];

    if (args.countersignerId) {
      const countersigner = await ctx.db.get(args.countersignerId);
      if (!countersigner) throw new Error('Countersigner not found');
      if (countersigner.organizationId !== target.organizationId) {
        throw new Error('Countersigner belongs to a different organization');
      }
      signers.push({
        userId: countersigner._id,
        name: countersigner.name ?? '',
        email: countersigner.email ?? '',
        order: 2,
      });
    }

    const documentNumber =
      row.documentNumber ?? (await allocateDocumentNumber(ctx, row.organizationId));

    const signatureDocumentId = await insertSignatureDocument(ctx, {
      organizationId: row.organizationId,
      title: args.title,
      content: args.content,
      accent: args.accent,
      orgName: args.orgName,
      signatureBlock: true,
      fieldDefinitions: [
        { id: 'signature', label: 'Signature', type: 'signature', required: true },
      ],
      signers,
      expiresAt: args.expiresAt,
      createdBy: caller._id,
    });

    const now = Date.now();
    await ctx.db.patch(args.packetDocumentId, {
      signatureDocumentId,
      documentNumber,
      status: 'sent',
      sentAt: now,
      updatedAt: now,
    });

    // Tell the employee there is something to sign. Without this the document
    // sits in the signatures list until someone happens to look.
    await notify(ctx, {
      organizationId: row.organizationId,
      userId: row.userId,
      type: 'system',
      titleKey: 'notifications.titles.documentAwaitingSignature',
      messageKey: 'notifications.messages.documentAwaitingSignature',
      params: { title: args.title },
      fallbackTitle: '✍️ Document awaiting your signature',
      fallbackMessage: `"${args.title}" is waiting for your signature in the E-Signatures section.`,
      relatedId: signatureDocumentId,
      route: '/signatures',
      createdAt: now,
    });

    return { signatureDocumentId, documentNumber };
  },
});

/**
 * Reserve the registration number before the document is sent, so the number
 * printed on the previewed/downloaded copy matches the one that ends up on the
 * signed original.
 */
export const ensureDocumentNumber = mutation({
  args: { packetDocumentId: v.id('hiringPacketDocuments') },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.packetDocumentId);
    if (!row) throw new Error('Packet document not found');
    await assertCanManagePacket(ctx, row.userId, { manageOnly: true });

    if (row.documentNumber) return { documentNumber: row.documentNumber };

    const documentNumber = await allocateDocumentNumber(ctx, row.organizationId);
    await ctx.db.patch(args.packetDocumentId, { documentNumber, updatedAt: Date.now() });
    return { documentNumber };
  },
});

/**
 * Packets whose mandatory documents are still unsigned — powers the HR overview
 * and the reminder cron.
 */
export const listIncompleteForOrg = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    const allowed =
      isSuperadmin(caller) ||
      ((caller.role === 'admin' || caller.role === 'supervisor') &&
        caller.organizationId === args.organizationId);
    if (!allowed) return [];

    const rows = await ctx.db
      .query('hiringPacketDocuments')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    const byUser = new Map<string, { userId: Id<'users'>; outstanding: number; total: number }>();
    for (const row of rows) {
      if (row.status === 'skipped') continue;
      const key = row.userId as unknown as string;
      const entry = byUser.get(key) ?? { userId: row.userId, outstanding: 0, total: 0 };
      entry.total++;
      if (row.mandatory && row.status !== 'signed') entry.outstanding++;
      byUser.set(key, entry);
    }

    const incomplete = [...byUser.values()].filter((e) => e.outstanding > 0);

    return await Promise.all(
      incomplete.map(async (entry) => {
        const user: Doc<'users'> | null = await ctx.db.get(entry.userId);
        return {
          userId: entry.userId,
          name: user?.name ?? '',
          email: user?.email ?? '',
          outstanding: entry.outstanding,
          total: entry.total,
        };
      }),
    );
  },
});
