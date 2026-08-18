/**
 * Issued documents — one document handed to one recipient.
 *
 * This is the general form of `hiringPackets.ts`: same lifecycle (draft →
 * hand-edited in Word → sent → signed), same registration numbers, same
 * freeze-on-send, but for any template (an organization blueprint or a built-in
 * catalog id), any language pair, and any employee — not only a new hire.
 *
 * Division of labour, unchanged from the packet:
 *
 * - The server owns *state*: which template and version, the language pair, the
 *   status, the number, the link to the signature document.
 *
 * - The client owns *rendering*: it resolves the text against the recipient's
 *   data, lays out the columns and produces the PDF/DOCX. Template text is never
 *   duplicated into an issued row, so a correction reaches every unsent document.
 *
 * The two meet in `sendForSignature`, which freezes the resolved text into
 * `signatureDocuments.content` with a server-computed SHA-256.
 */
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import {
  assertOrgStaff,
  canAccessOwnedRecord,
  resolveOrgScope,
  resolveOrgStaff,
  scopeOwnsRecord,
  type OrgScope,
} from './lib/orgAccess';
import { isCatalogTemplateId } from './lib/documentTemplateIds';
import { allocateDocumentNumber, DEFAULT_DOCUMENT_SERIES } from './lib/documentNumbers';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { notify } from './lib/notify';
import { insertSignatureDocument } from './signatures';
import { assertModuleAccess } from './lib/entitlements';

const localeValidator = v.union(v.literal('en'), v.literal('ru'), v.literal('hy'), v.literal('de'));

const accentValidator = v.union(
  v.literal('blue'),
  v.literal('slate'),
  v.literal('emerald'),
  v.literal('burgundy'),
);

/** Upper bound for one bulk issue call — guards against a runaway client. */
const MAX_BULK_RECIPIENTS = 200;

/** A frozen document must not be edited or re-sent. */
function assertEditable(row: Doc<'issuedDocuments'>): void {
  if (row.status === 'sent') {
    throw new Error('This document has already been sent for signature');
  }
  if (row.status === 'signed') {
    throw new Error('This document has been signed and can no longer be changed');
  }
  if (row.status === 'cancelled') {
    throw new Error('This document was cancelled');
  }
}

/** Staff access to an issued row, resolved from the row's own organization. */
async function staffScopeFor(ctx: MutationCtx, row: Doc<'issuedDocuments'>): Promise<OrgScope> {
  const scope = await assertOrgStaff(ctx, row.organizationId);
  if (!scopeOwnsRecord(scope, row)) throw new Error('Document not found');
  return scope;
}

/** Enrich a row with the names the list UI needs. */
async function withPeople(ctx: QueryCtx, row: Doc<'issuedDocuments'>) {
  const [recipient, issuer] = await Promise.all([
    ctx.db.get(row.recipientId),
    ctx.db.get(row.issuedBy),
  ]);
  return {
    ...row,
    recipientName: recipient?.name ?? 'Unknown',
    recipientEmail: recipient?.email,
    recipientPosition: recipient?.position,
    issuerName: issuer?.name ?? 'Unknown',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The organization's issued documents, newest first.
 *
 * Staff-only, because it exposes every employee's documents. Employees read
 * their own through {@link listMine}.
 */
export const list = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
    status: v.optional(
      v.union(
        v.literal('draft'),
        v.literal('edited'),
        v.literal('sent'),
        v.literal('signed'),
        v.literal('cancelled'),
      ),
    ),
    recipientId: v.optional(v.id('users')),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await resolveOrgStaff(ctx, args.organizationId);
    if (!scope?.organizationId) return [];

    const rows = await ctx.db
      .query('issuedDocuments')
      .withIndex('by_org', (q) => q.eq('organizationId', scope.organizationId!))
      .order('desc')
      .take(DEFAULT_LIST_CAP);

    let filtered = rows;
    if (args.status) filtered = filtered.filter((row) => row.status === args.status);
    if (args.recipientId) filtered = filtered.filter((row) => row.recipientId === args.recipientId);

    const enriched = await Promise.all(filtered.map((row) => withPeople(ctx, row)));

    if (args.search?.trim()) {
      const needle = args.search.trim().toLowerCase();
      return enriched.filter(
        (row) =>
          row.title.toLowerCase().includes(needle) ||
          row.recipientName.toLowerCase().includes(needle) ||
          (row.documentNumber ?? '').toLowerCase().includes(needle),
      );
    }

    return enriched;
  },
});

/** The caller's own documents — what an employee sees of this module. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const scope = await resolveOrgScope(ctx);
    if (!scope) return [];

    const rows = await ctx.db
      .query('issuedDocuments')
      .withIndex('by_recipient', (q) => q.eq('recipientId', scope.caller._id))
      .order('desc')
      .take(SMALL_LIST_CAP);

    // Drafts are internal: an employee should not see a document being prepared
    // for them until it is actually sent.
    return rows.filter((row) => row.status === 'sent' || row.status === 'signed');
  },
});

/** One issued document. Staff of the org, or the recipient themself. */
export const get = query({
  args: { issuedDocumentId: v.id('issuedDocuments') },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx);
    if (!scope) return null;

    const row = await ctx.db.get(args.issuedDocumentId);
    if (!row) return null;
    // `userId` is what canAccessOwnedRecord checks for ownership.
    if (!canAccessOwnedRecord(scope, { ...row, userId: row.recipientId })) return null;
    if (!scope.isStaff && row.status !== 'sent' && row.status !== 'signed') return null;

    const enriched = await withPeople(ctx, row);
    const blueprint = row.blueprintId ? await ctx.db.get(row.blueprintId) : null;

    return {
      ...enriched,
      blueprint:
        blueprint && scopeOwnsRecord(scope, blueprint)
          ? {
              _id: blueprint._id,
              name: blueprint.name,
              category: blueprint.category,
              accent: blueprint.accent,
              signature: blueprint.signature,
              requiredLocale: blueprint.requiredLocale,
            }
          : null,
    };
  },
});

/**
 * Content needed to render a document: the pinned blueprint version, or the
 * catalog id for a built-in template.
 *
 * Returns the *snapshot* rather than the blueprint's current content — the whole
 * point of pinning a version.
 */
export const getRenderSource = query({
  args: { issuedDocumentId: v.id('issuedDocuments') },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx);
    if (!scope) return null;

    const row = await ctx.db.get(args.issuedDocumentId);
    if (!row) return null;
    if (!canAccessOwnedRecord(scope, { ...row, userId: row.recipientId })) return null;

    if (row.source === 'catalog') {
      return { source: 'catalog' as const, templateId: row.templateId ?? null, snapshot: null };
    }

    if (!row.blueprintId || row.blueprintVersion === undefined) {
      return { source: 'blueprint' as const, templateId: null, snapshot: null };
    }

    const snapshot = await ctx.db
      .query('documentBlueprintVersions')
      .withIndex('by_blueprint_version', (q) =>
        q.eq('blueprintId', row.blueprintId!).eq('version', row.blueprintVersion!),
      )
      .first();

    return {
      source: 'blueprint' as const,
      templateId: null,
      snapshot:
        snapshot && scopeOwnsRecord(scope, snapshot)
          ? {
              name: snapshot.name,
              titles: snapshot.titles,
              segments: snapshot.segments,
              accent: snapshot.accent,
              signature: snapshot.signature,
              version: snapshot.version,
            }
          : null,
    };
  },
});

/** Counts per status for the tab badges. */
export const getSummary = query({
  args: { organizationId: v.optional(v.id('organizations')) },
  handler: async (ctx, args) => {
    const scope = await resolveOrgStaff(ctx, args.organizationId);
    if (!scope?.organizationId) return null;

    const rows = await ctx.db
      .query('issuedDocuments')
      .withIndex('by_org', (q) => q.eq('organizationId', scope.organizationId!))
      .take(DEFAULT_LIST_CAP);

    const counts = { draft: 0, edited: 0, sent: 0, signed: 0, cancelled: 0 };
    for (const row of rows) counts[row.status] += 1;

    return { total: rows.length, ...counts };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve and validate the language pair for a document.
 *
 * A blueprint may pin the language it is legally invalid without; issuing it in
 * a pair that omits that language is refused here rather than being caught by
 * whoever reads the printed page.
 */
function resolveLocalePair(
  requested: { primaryLocale: string; secondaryLocale?: string },
  requiredLocale?: string,
): { primaryLocale: string; secondaryLocale?: string } {
  const primary = requested.primaryLocale;
  const secondary =
    requested.secondaryLocale && requested.secondaryLocale !== primary
      ? requested.secondaryLocale
      : undefined;

  if (requiredLocale && requiredLocale !== primary && requiredLocale !== secondary) {
    throw new Error(
      `This document must include ${requiredLocale.toUpperCase()} — it is the binding language`,
    );
  }

  return { primaryLocale: primary, secondaryLocale: secondary };
}

/**
 * Issue a document to one or more recipients.
 *
 * Every recipient gets their own row: their own number, their own merge data and
 * their own signature. Duplicates are allowed on purpose — the same policy is
 * re-issued when a new version comes out, unlike the hiring packet where a
 * template may appear only once.
 */
export const issue = mutation({
  args: {
    organizationId: v.optional(v.id('organizations')),
    recipientIds: v.array(v.id('users')),
    source: v.union(v.literal('blueprint'), v.literal('catalog')),
    blueprintId: v.optional(v.id('documentBlueprints')),
    templateId: v.optional(v.string()),
    primaryLocale: localeValidator,
    secondaryLocale: v.optional(localeValidator),
    /** Resolved heading, used for lists and search. */
    title: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'signatures');
    const scope = await assertOrgStaff(ctx, args.organizationId);
    if (!scope.organizationId) throw new Error('No organization in scope');

    if (args.recipientIds.length === 0) throw new Error('Pick at least one recipient');
    if (args.recipientIds.length > MAX_BULK_RECIPIENTS) {
      throw new Error(`Cannot issue to more than ${MAX_BULK_RECIPIENTS} people at once`);
    }
    if (!args.title.trim()) throw new Error('A document needs a title');

    let blueprint: Doc<'documentBlueprints'> | null = null;
    if (args.source === 'blueprint') {
      if (!args.blueprintId) throw new Error('No template selected');
      blueprint = await ctx.db.get(args.blueprintId);
      if (!blueprint || !scopeOwnsRecord(scope, blueprint)) throw new Error('Template not found');
      if (blueprint.status !== 'published' || blueprint.version === 0) {
        throw new Error('This template has not been published yet');
      }
    } else {
      if (!args.templateId || !isCatalogTemplateId(args.templateId)) {
        throw new Error('Unknown document template');
      }
    }

    const locales = resolveLocalePair(
      { primaryLocale: args.primaryLocale, secondaryLocale: args.secondaryLocale },
      blueprint?.requiredLocale,
    );

    const now = Date.now();
    const created: Id<'issuedDocuments'>[] = [];
    const skipped: string[] = [];

    for (const recipientId of new Set(args.recipientIds)) {
      const recipient = await ctx.db.get(recipientId);
      // Silently skipping would leave the issuer thinking everyone got it.
      if (!recipient || recipient.organizationId !== scope.organizationId) {
        skipped.push(recipientId);
        continue;
      }

      const id = await ctx.db.insert('issuedDocuments', {
        organizationId: scope.organizationId,
        recipientId,
        source: args.source,
        blueprintId: blueprint?._id,
        blueprintVersion: blueprint?.version,
        templateId: args.source === 'catalog' ? args.templateId : undefined,
        primaryLocale: locales.primaryLocale as Doc<'issuedDocuments'>['primaryLocale'],
        secondaryLocale: locales.secondaryLocale as Doc<'issuedDocuments'>['secondaryLocale'],
        title: args.title.trim(),
        status: 'draft',
        note: args.note?.trim() || undefined,
        issuedBy: scope.caller._id,
        createdAt: now,
        updatedAt: now,
      });
      created.push(id);
    }

    return { created: created.length, ids: created, skipped: skipped.length };
  },
});

/** Change the language pair of a document that has not been sent yet. */
export const setLocalePair = mutation({
  args: {
    issuedDocumentId: v.id('issuedDocuments'),
    primaryLocale: localeValidator,
    secondaryLocale: v.optional(localeValidator),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.issuedDocumentId);
    if (!row) throw new Error('Document not found');
    await staffScopeFor(ctx, row);
    // A sent document is frozen: switching languages afterwards would mean the
    // signed text and the displayed text disagree.
    assertEditable(row);

    const blueprint = row.blueprintId ? await ctx.db.get(row.blueprintId) : null;
    const locales = resolveLocalePair(
      { primaryLocale: args.primaryLocale, secondaryLocale: args.secondaryLocale },
      blueprint?.requiredLocale,
    );

    await ctx.db.patch(args.issuedDocumentId, {
      primaryLocale: locales.primaryLocale as Doc<'issuedDocuments'>['primaryLocale'],
      secondaryLocale: locales.secondaryLocale as Doc<'issuedDocuments'>['secondaryLocale'],
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Store the block model recovered from a hand-edited Word file.
 *
 * `blocksJson` comes from `parseEditableDocx` (`src/lib/docxRoundTrip.ts`). The
 * original upload is kept in `sourceDocxUrl` for audit even though what gets
 * rendered and signed is the parsed body.
 */
export const applyDocxOverride = mutation({
  args: {
    issuedDocumentId: v.id('issuedDocuments'),
    /** JSON-encoded `DocumentBlock[]`. */
    blocksJson: v.string(),
    sourceDocxUrl: v.optional(v.string()),
    sourceDocxName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.issuedDocumentId);
    if (!row) throw new Error('Document not found');
    await staffScopeFor(ctx, row);
    assertEditable(row);

    // Validate here rather than discovering the body is broken at render time,
    // when the recipient is already waiting to sign.
    let parsed: unknown;
    try {
      parsed = JSON.parse(args.blocksJson);
    } catch {
      throw new Error('The edited document could not be stored (invalid content)');
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('The edited document contains no content');
    }

    await ctx.db.patch(args.issuedDocumentId, {
      bodyOverride: args.blocksJson,
      sourceDocxUrl: args.sourceDocxUrl,
      sourceDocxName: args.sourceDocxName,
      status: 'edited',
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

/** Drop a hand-edited body and go back to the template text. */
export const revertToTemplate = mutation({
  args: { issuedDocumentId: v.id('issuedDocuments') },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.issuedDocumentId);
    if (!row) throw new Error('Document not found');
    await staffScopeFor(ctx, row);
    assertEditable(row);

    await ctx.db.patch(args.issuedDocumentId, {
      bodyOverride: undefined,
      sourceDocxUrl: undefined,
      sourceDocxName: undefined,
      status: 'draft',
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Reserve the registration number before the document is sent, so the number on
 * the previewed/downloaded copy matches the one on the signed original.
 */
export const ensureDocumentNumber = mutation({
  args: { issuedDocumentId: v.id('issuedDocuments') },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.issuedDocumentId);
    if (!row) throw new Error('Document not found');
    await staffScopeFor(ctx, row);

    if (row.documentNumber) return { documentNumber: row.documentNumber };

    const blueprint = row.blueprintId ? await ctx.db.get(row.blueprintId) : null;
    const documentNumber = await allocateDocumentNumber(
      ctx,
      row.organizationId,
      blueprint?.series ?? DEFAULT_DOCUMENT_SERIES,
    );
    await ctx.db.patch(args.issuedDocumentId, { documentNumber, updatedAt: Date.now() });
    return { documentNumber };
  },
});

/**
 * Freeze the resolved document and send it to the recipient for signature.
 *
 * The content arrives fully rendered from the client (fonts and layout are
 * browser-only) and is snapshotted by `insertSignatureDocument`, which computes
 * the SHA-256 server-side. From here the issued row is only a pointer plus
 * status.
 */
export const sendForSignature = mutation({
  args: {
    issuedDocumentId: v.id('issuedDocuments'),
    /** Frozen body — `encodeDocumentContent` output. */
    content: v.string(),
    title: v.string(),
    accent: accentValidator,
    orgName: v.string(),
    /** Second signer on the organization's side, usually the issuer. */
    countersignerId: v.optional(v.id('users')),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.issuedDocumentId);
    if (!row) throw new Error('Document not found');
    const scope = await staffScopeFor(ctx, row);
    assertEditable(row);

    if (!args.content.trim()) throw new Error('Cannot send an empty document for signature');

    const recipient = await ctx.db.get(row.recipientId);
    if (!recipient) throw new Error('Recipient no longer exists');

    // The recipient signs first; the organization countersigns afterwards, so a
    // countersignature is never applied to something the recipient refused.
    //
    // The countersigner gets their own request even when they are the same
    // person as the recipient. The document prints two signature boxes, and
    // skipping the second request — as this used to when the ids matched — left
    // the issuer's box with a name, a position and a blank signature line that
    // nothing could ever fill. `convex/assets.ts` files both parties the same
    // way for exactly this reason.
    const signers: Array<{ userId: Id<'users'>; name: string; email: string; order: number }> = [
      {
        userId: row.recipientId,
        name: recipient.name ?? '',
        email: recipient.email ?? '',
        order: 1,
      },
    ];

    if (args.countersignerId) {
      const countersigner = await ctx.db.get(args.countersignerId);
      if (!countersigner) throw new Error('Countersigner not found');
      if (countersigner.organizationId !== row.organizationId) {
        throw new Error('Countersigner belongs to a different organization');
      }
      signers.push({
        userId: countersigner._id,
        name: countersigner.name ?? '',
        email: countersigner.email ?? '',
        order: 2,
      });
    }

    const blueprint = row.blueprintId ? await ctx.db.get(row.blueprintId) : null;
    const documentNumber =
      row.documentNumber ??
      (await allocateDocumentNumber(
        ctx,
        row.organizationId,
        blueprint?.series ?? DEFAULT_DOCUMENT_SERIES,
      ));

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
      createdBy: scope.caller._id,
    });

    const now = Date.now();
    await ctx.db.patch(args.issuedDocumentId, {
      signatureDocumentId,
      documentNumber,
      title: args.title,
      status: 'sent',
      sentAt: now,
      updatedAt: now,
    });

    // Without this the document sits in the signatures list until someone
    // happens to look.
    await notify(ctx, {
      organizationId: row.organizationId,
      userId: row.recipientId,
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
 * Cancel a document.
 *
 * A sent one is cancelled through the signature module first (so the request is
 * withdrawn and audited); this only refuses to touch a signed document, which is
 * a legal record.
 */
export const cancel = mutation({
  args: { issuedDocumentId: v.id('issuedDocuments') },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'signatures');
    const row = await ctx.db.get(args.issuedDocumentId);
    if (!row) throw new Error('Document not found');
    await staffScopeFor(ctx, row);

    if (row.status === 'signed') {
      throw new Error('A signed document cannot be cancelled');
    }
    if (row.status === 'sent') {
      throw new Error('Cancel the signature request first, then this document');
    }

    await ctx.db.patch(args.issuedDocumentId, { status: 'cancelled', updatedAt: Date.now() });
    return { ok: true };
  },
});

/** Delete a document that never left draft. Signed history is never deletable. */
export const remove = mutation({
  args: { issuedDocumentId: v.id('issuedDocuments') },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'signatures');
    const row = await ctx.db.get(args.issuedDocumentId);
    if (!row) throw new Error('Document not found');
    await staffScopeFor(ctx, row);

    if (row.status === 'sent' || row.status === 'signed') {
      throw new Error('A sent or signed document cannot be deleted');
    }

    await ctx.db.delete(args.issuedDocumentId);
    return { ok: true };
  },
});
