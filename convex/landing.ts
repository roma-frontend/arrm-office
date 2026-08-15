import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { getAuthCaller } from './lib/getAuthCaller';

/**
 * Landing showcase — the public face of the testimonials and logo cloud.
 *
 * `getShowcase` is deliberately public (the landing is a marketing page): it
 * returns only rows that are `isVisible` AND whose organization is active, so
 * no internal org ever leaks through a stray row. Quotes are resolved by the
 * visitor's language with an English fallback.
 *
 * The mutations are superadmin-only curation tools — flip a row visible, edit a
 * quote, reorder — so the marketing team drives the landing without touching
 * code or i18n files.
 */

const LANGS = ['en', 'ru', 'de', 'hy'] as const;
type Lang = (typeof LANGS)[number];

function isLang(value: string | undefined): value is Lang {
  return LANGS.includes(value as Lang);
}

/** Public: visible testimonials + client logos for the landing. */
export const getShowcase = query({
  args: { lang: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const lang: Lang = isLang(args.lang) ? args.lang : 'en';
    const rows = await ctx.db
      .query('landingShowcase')
      .withIndex('by_visible_kind', (q) => q.eq('isVisible', true))
      .take(200);

    // Batch-load orgs once instead of N+1.
    const orgIds = [...new Set(rows.map((r) => r.organizationId))];
    const orgs = new Map(
      (await Promise.all(orgIds.map((id) => ctx.db.get(id)))).map((o) => [o?._id, o] as const),
    );

    const logos: Array<{ name: string; logoUrl?: string; order: number }> = [];
    const testimonials: Array<{
      id: string;
      company: string;
      quote: string;
      authorName?: string;
      authorRole?: string;
      metric?: string;
      metricLabel?: string;
      order: number;
    }> = [];

    for (const row of rows) {
      const org = orgs.get(row.organizationId);
      // Only active orgs may appear; the org can be deleted after curation.
      if (!org || !org.isActive) continue;

      if (row.kind === 'logo') {
        logos.push({ name: org.name, logoUrl: org.logoUrl, order: row.sortOrder ?? 0 });
        continue;
      }

      const quote =
        (lang === 'ru'
          ? row.quoteRu
          : lang === 'de'
            ? row.quoteDe
            : lang === 'hy'
              ? row.quoteHy
              : row.quoteEn) ?? row.quoteEn;
      if (!quote) continue;
      testimonials.push({
        id: row._id,
        company: org.name,
        quote,
        authorName: row.authorName,
        authorRole: row.authorRole,
        metric: row.metric,
        metricLabel: row.metricLabel,
        order: row.sortOrder ?? 0,
      });
    }

    // Stable ordering: sortOrder asc, then _creationTime.
    testimonials.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    logos.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

    return { logos, testimonials };
  },
});

// ── Superadmin curation ──────────────────────────────────────────────────────

async function requireSuperadmin(ctx: Parameters<typeof getAuthCaller>[0]) {
  const caller = await getAuthCaller(ctx);
  if (!caller || caller.role !== 'superadmin') {
    throw new Error('Only superadmins can curate the landing');
  }
  return caller;
}

/** List every showcase row (visible or not) for the curation console. */
export const listShowcase = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);
    const rows = await ctx.db.query('landingShowcase').order('desc').take(500);
    return Promise.all(
      rows.map(async (row) => {
        const org = await ctx.db.get(row.organizationId);
        return { ...row, organizationName: org?.name ?? 'Unknown' };
      }),
    );
  },
});

/** Create a showcase row. */
export const createShowcase = mutation({
  args: {
    kind: v.union(v.literal('logo'), v.literal('testimonial')),
    organizationId: v.id('organizations'),
    isVisible: v.boolean(),
    quoteEn: v.optional(v.string()),
    quoteRu: v.optional(v.string()),
    quoteDe: v.optional(v.string()),
    quoteHy: v.optional(v.string()),
    authorName: v.optional(v.string()),
    authorRole: v.optional(v.string()),
    metric: v.optional(v.string()),
    metricLabel: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error('Organization not found');
    const id = await ctx.db.insert('landingShowcase', {
      ...args,
      createdBy: caller._id,
    });
    return { success: true, id };
  },
});

/** Update a showcase row (superadmin only). */
export const updateShowcase = mutation({
  args: {
    id: v.id('landingShowcase'),
    isVisible: v.optional(v.boolean()),
    quoteEn: v.optional(v.string()),
    quoteRu: v.optional(v.string()),
    quoteDe: v.optional(v.string()),
    quoteHy: v.optional(v.string()),
    authorName: v.optional(v.string()),
    authorRole: v.optional(v.string()),
    metric: v.optional(v.string()),
    metricLabel: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    const { id, ...patch } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error('Row not found');
    await ctx.db.patch(id, patch);
    return { success: true };
  },
});

/** Delete a showcase row (superadmin only). */
export const deleteShowcase = mutation({
  args: { id: v.id('landingShowcase') },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error('Row not found');
    await ctx.db.delete(args.id);
    return { success: true };
  },
});
