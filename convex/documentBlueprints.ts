/**
 * Document blueprints — the templates an organization writes itself.
 *
 * What a blueprint is, and what it deliberately is not:
 *
 * - It holds *segments*, one logical block with its text in every language, so a
 *   document can be printed with any language as the binding column and its
 *   translation beside it. `documentTemplates` (the e-signature builder's flat
 *   single-language snippets) stays untouched; the two serve different features.
 *
 * - It holds no rendered output. PDF and DOCX are produced on the client from
 *   these segments plus the recipient's data, exactly as the hiring packet does,
 *   so fixing a typo here fixes every unsent document at once.
 *
 * Editing rules:
 *
 * - A draft is invisible to issuers. Publishing bumps `version` and snapshots the
 *   content into `documentBlueprintVersions`; documents already issued keep
 *   pointing at the version they were issued from, so a contract signed last year
 *   still re-renders as it was signed.
 *
 * - `requiredLocale` pins the language a document is legally invalid without.
 *   Issuing checks it (see `issuedDocuments.issue`) instead of trusting the UI.
 */
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { assertOrgStaff, resolveOrgStaff, scopeOwnsRecord } from './lib/orgAccess';
import { SMALL_LIST_CAP } from './lib/limits';
import { normalizeSeries } from './lib/documentNumbers';

/** Locales a blueprint can be authored in. */
const localeValidator = v.union(v.literal('en'), v.literal('ru'), v.literal('hy'), v.literal('de'));

const localizedText = v.object({
  en: v.optional(v.string()),
  ru: v.optional(v.string()),
  hy: v.optional(v.string()),
  de: v.optional(v.string()),
});

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

/** A document nobody can read is not worth issuing; keep the editor honest. */
const MAX_SEGMENTS = 120;
const MAX_SEGMENT_CHARS = 4000;
const MAX_NAME_LENGTH = 120;

type Segment = Doc<'documentBlueprints'>['segments'][number];

/**
 * Reject payloads the editor should never send.
 *
 * Convex validates the shape; these are the invariants it cannot express —
 * duplicate ids (which would break matching a re-imported Word file back to its
 * segment) and a blueprint with no text at all.
 */
function validateSegments(segments: Segment[]): void {
  if (segments.length === 0) throw new Error('A document needs at least one segment');
  if (segments.length > MAX_SEGMENTS) {
    throw new Error(`A document cannot exceed ${MAX_SEGMENTS} segments`);
  }

  const ids = new Set<string>();
  let hasText = false;

  for (const segment of segments) {
    if (!segment.id.trim()) throw new Error('Every segment needs an id');
    if (ids.has(segment.id)) throw new Error(`Duplicate segment id: ${segment.id}`);
    ids.add(segment.id);

    for (const value of Object.values(segment.text)) {
      if (typeof value !== 'string') continue;
      if (value.length > MAX_SEGMENT_CHARS) {
        throw new Error(`A segment cannot exceed ${MAX_SEGMENT_CHARS} characters`);
      }
      if (value.trim()) hasText = true;
    }
  }

  if (!hasText) throw new Error('A document needs text in at least one language');
}

function validateTitles(titles: Record<string, string | undefined>): void {
  const hasTitle = Object.values(titles).some((value) => value?.trim());
  if (!hasTitle) throw new Error('A document needs a heading in at least one language');
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Blueprints of the caller's organization.
 *
 * Staff-only: blueprints carry salary clauses and other terms an employee has no
 * business browsing. Returns `[]` rather than throwing so the tab renders empty
 * for a non-manager instead of tripping an error boundary.
 */
export const list = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
    /** Include drafts and archived blueprints (the editor's own list). */
    includeUnpublished: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const scope = await resolveOrgStaff(ctx, args.organizationId);
    if (!scope?.organizationId) return [];

    const rows = await ctx.db
      .query('documentBlueprints')
      .withIndex('by_org', (q) => q.eq('organizationId', scope.organizationId!))
      .take(SMALL_LIST_CAP);

    const visible = args.includeUnpublished
      ? rows
      : rows.filter((row) => row.status === 'published');

    return visible.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** One blueprint, with its published version history. */
export const get = query({
  args: { blueprintId: v.id('documentBlueprints') },
  handler: async (ctx, args) => {
    const scope = await resolveOrgStaff(ctx);
    if (!scope) return null;

    const blueprint = await ctx.db.get(args.blueprintId);
    if (!blueprint || !scopeOwnsRecord(scope, blueprint)) return null;

    const versions = await ctx.db
      .query('documentBlueprintVersions')
      .withIndex('by_blueprint', (q) => q.eq('blueprintId', args.blueprintId))
      .take(SMALL_LIST_CAP);

    return {
      ...blueprint,
      versions: versions
        .sort((a, b) => b.version - a.version)
        .map(({ version, publishedAt, publishedBy }) => ({ version, publishedAt, publishedBy })),
    };
  },
});

/** A published snapshot, for re-rendering a document issued from an old version. */
export const getVersion = query({
  args: { blueprintId: v.id('documentBlueprints'), version: v.number() },
  handler: async (ctx, args) => {
    const scope = await resolveOrgStaff(ctx);
    if (!scope) return null;

    const snapshot = await ctx.db
      .query('documentBlueprintVersions')
      .withIndex('by_blueprint_version', (q) =>
        q.eq('blueprintId', args.blueprintId).eq('version', args.version),
      )
      .first();

    if (!snapshot || !scopeOwnsRecord(scope, snapshot)) return null;
    return snapshot;
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a blueprint.
 *
 * Always starts as a draft: a half-written contract must not be issuable, and
 * the editor's "publish" step is what makes the first version snapshot.
 */
export const create = mutation({
  args: {
    organizationId: v.optional(v.id('organizations')),
    name: v.string(),
    description: v.optional(v.string()),
    category: categoryValidator,
    accent: accentValidator,
    titles: localizedText,
    segments: v.array(segmentValidator),
    requiredLocale: v.optional(localeValidator),
    defaultPrimaryLocale: v.optional(localeValidator),
    defaultSecondaryLocale: v.optional(localeValidator),
    signature: v.boolean(),
    series: v.optional(v.string()),
    forkedFromTemplateId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await assertOrgStaff(ctx, args.organizationId);
    if (!scope.organizationId) throw new Error('No organization in scope');

    const name = args.name.trim();
    if (!name) throw new Error('A document needs a name');
    if (name.length > MAX_NAME_LENGTH) throw new Error('The name is too long');
    validateTitles(args.titles);
    validateSegments(args.segments);

    const now = Date.now();
    return await ctx.db.insert('documentBlueprints', {
      organizationId: scope.organizationId,
      name,
      description: args.description?.trim() || undefined,
      category: args.category,
      accent: args.accent,
      titles: args.titles,
      segments: args.segments,
      requiredLocale: args.requiredLocale,
      defaultPrimaryLocale: args.defaultPrimaryLocale,
      defaultSecondaryLocale: args.defaultSecondaryLocale,
      signature: args.signature,
      series: args.series ? normalizeSeries(args.series) : undefined,
      status: 'draft',
      version: 0,
      forkedFromTemplateId: args.forkedFromTemplateId,
      createdBy: scope.caller._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Edit a blueprint.
 *
 * Editing a published blueprint is allowed and does *not* change what has
 * already been issued: those documents pin a version. The change only reaches
 * new documents once it is published again.
 */
export const update = mutation({
  args: {
    blueprintId: v.id('documentBlueprints'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(categoryValidator),
    accent: v.optional(accentValidator),
    titles: v.optional(localizedText),
    segments: v.optional(v.array(segmentValidator)),
    requiredLocale: v.optional(localeValidator),
    defaultPrimaryLocale: v.optional(localeValidator),
    defaultSecondaryLocale: v.optional(localeValidator),
    signature: v.optional(v.boolean()),
    series: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const blueprint = await ctx.db.get(args.blueprintId);
    if (!blueprint) throw new Error('Document not found');
    const scope = await assertOrgStaff(ctx, blueprint.organizationId);
    if (!scopeOwnsRecord(scope, blueprint)) throw new Error('Document not found');

    if (blueprint.status === 'archived') {
      throw new Error('An archived document cannot be edited — restore it first');
    }

    const patch: Partial<Doc<'documentBlueprints'>> = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error('A document needs a name');
      if (name.length > MAX_NAME_LENGTH) throw new Error('The name is too long');
      patch.name = name;
    }
    if (args.description !== undefined) patch.description = args.description.trim() || undefined;
    if (args.category !== undefined) patch.category = args.category;
    if (args.accent !== undefined) patch.accent = args.accent;
    if (args.titles !== undefined) {
      validateTitles(args.titles);
      patch.titles = args.titles;
    }
    if (args.segments !== undefined) {
      validateSegments(args.segments);
      patch.segments = args.segments;
    }
    if (args.requiredLocale !== undefined) patch.requiredLocale = args.requiredLocale;
    if (args.defaultPrimaryLocale !== undefined) {
      patch.defaultPrimaryLocale = args.defaultPrimaryLocale;
    }
    if (args.defaultSecondaryLocale !== undefined) {
      patch.defaultSecondaryLocale = args.defaultSecondaryLocale;
    }
    if (args.signature !== undefined) patch.signature = args.signature;
    if (args.series !== undefined)
      patch.series = args.series ? normalizeSeries(args.series) : undefined;

    await ctx.db.patch(args.blueprintId, patch);
    return { ok: true };
  },
});

/**
 * Publish the current content as a new immutable version.
 *
 * The snapshot is what an issued document renders from, so it captures
 * everything that affects the page: titles, segments, accent and whether a
 * signature grid is printed.
 */
export const publish = mutation({
  args: { blueprintId: v.id('documentBlueprints') },
  handler: async (ctx, args) => {
    const blueprint = await ctx.db.get(args.blueprintId);
    if (!blueprint) throw new Error('Document not found');
    const scope = await assertOrgStaff(ctx, blueprint.organizationId);
    if (!scopeOwnsRecord(scope, blueprint)) throw new Error('Document not found');

    validateTitles(blueprint.titles);
    validateSegments(blueprint.segments);

    // A published document must be complete in the language it cannot be issued
    // without — otherwise the required column would print placeholders.
    if (blueprint.requiredLocale) {
      const locale = blueprint.requiredLocale;
      const gaps = blueprint.segments.filter((segment) => !segment.text[locale]?.trim());
      if (gaps.length > 0) {
        throw new Error(
          `${gaps.length} segment(s) have no ${locale.toUpperCase()} text, which this document requires`,
        );
      }
    }

    const version = blueprint.version + 1;
    const now = Date.now();

    await ctx.db.insert('documentBlueprintVersions', {
      organizationId: blueprint.organizationId,
      blueprintId: blueprint._id,
      version,
      name: blueprint.name,
      titles: blueprint.titles,
      segments: blueprint.segments,
      accent: blueprint.accent,
      signature: blueprint.signature,
      publishedBy: scope.caller._id,
      publishedAt: now,
    });

    await ctx.db.patch(blueprint._id, {
      status: 'published',
      version,
      publishedAt: now,
      updatedAt: now,
    });

    return { version };
  },
});

/**
 * Archive or restore a blueprint.
 *
 * Archiving never deletes: documents issued from it must stay traceable, and the
 * version snapshots they render from live in another table anyway.
 */
export const setArchived = mutation({
  args: { blueprintId: v.id('documentBlueprints'), archived: v.boolean() },
  handler: async (ctx, args) => {
    const blueprint = await ctx.db.get(args.blueprintId);
    if (!blueprint) throw new Error('Document not found');
    const scope = await assertOrgStaff(ctx, blueprint.organizationId);
    if (!scopeOwnsRecord(scope, blueprint)) throw new Error('Document not found');

    await ctx.db.patch(args.blueprintId, {
      // A restored blueprint goes back to being published only if it ever was.
      status: args.archived ? 'archived' : blueprint.version > 0 ? 'published' : 'draft',
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Delete a blueprint outright.
 *
 * Only allowed while nothing has been issued from it — otherwise the issued rows
 * would point at a missing definition. Admin-only: archiving is the normal path.
 */
export const remove = mutation({
  args: { blueprintId: v.id('documentBlueprints') },
  handler: async (ctx, args) => {
    const blueprint = await ctx.db.get(args.blueprintId);
    if (!blueprint) throw new Error('Document not found');
    const scope = await assertOrgStaff(ctx, blueprint.organizationId, { adminOnly: true });
    if (!scopeOwnsRecord(scope, blueprint)) throw new Error('Document not found');

    const issued = await ctx.db
      .query('issuedDocuments')
      .withIndex('by_blueprint', (q) => q.eq('blueprintId', args.blueprintId))
      .first();
    if (issued) {
      throw new Error('Documents have already been issued from this template — archive it instead');
    }

    const versions = await ctx.db
      .query('documentBlueprintVersions')
      .withIndex('by_blueprint', (q) => q.eq('blueprintId', args.blueprintId))
      .take(SMALL_LIST_CAP);
    for (const version of versions) await ctx.db.delete(version._id);

    await ctx.db.delete(args.blueprintId);
    return { ok: true };
  },
});

/**
 * Duplicate a blueprint, including its unpublished edits.
 *
 * The copy starts as a draft with no version history: it is a new document, not
 * a new version of the old one.
 */
export const duplicate = mutation({
  args: { blueprintId: v.id('documentBlueprints'), name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.blueprintId);
    if (!source) throw new Error('Document not found');
    const scope = await assertOrgStaff(ctx, source.organizationId);
    if (!scopeOwnsRecord(scope, source)) throw new Error('Document not found');

    const now = Date.now();
    const name = (args.name?.trim() || `${source.name} (copy)`).slice(0, MAX_NAME_LENGTH);

    return await ctx.db.insert('documentBlueprints', {
      organizationId: source.organizationId,
      name,
      description: source.description,
      category: source.category,
      accent: source.accent,
      titles: source.titles,
      // Fresh segment ids: two documents sharing ids would confuse a Word
      // re-import that is matched back by id.
      segments: source.segments.map((segment, index) => ({
        ...segment,
        id: `${segment.id}c${index}`,
      })),
      requiredLocale: source.requiredLocale,
      defaultPrimaryLocale: source.defaultPrimaryLocale,
      defaultSecondaryLocale: source.defaultSecondaryLocale,
      signature: source.signature,
      series: source.series,
      status: 'draft',
      version: 0,
      forkedFromTemplateId: source.forkedFromTemplateId,
      createdBy: scope.caller._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});
