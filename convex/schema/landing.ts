import { defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * Curated landing content.
 *
 * The landing's testimonials and logo cloud are driven from real data instead
 * of placeholder copy: each row references an actual organization (so the logo
 * cloud shows real client names/avatars) and carries translated testimonial
 * text. A superadmin curates rows through the operator console; the public
 * `landing.getShowcase` query only exposes rows whose org is active and that
 * are explicitly marked `isVisible`.
 *
 * `kind` splits the two surfaces:
 *   - 'logo'         → a client logo in the marquee (title comes from the org)
 *   - 'testimonial'  → a quote card (quote/author come from these fields)
 */
export const landing = {
  landingShowcase: defineTable({
    kind: v.union(v.literal('logo'), v.literal('testimonial')),
    /** The real organization this row is about. */
    organizationId: v.id('organizations'),
    /** Only rows with `isVisible: true` are served to the public landing. */
    isVisible: v.boolean(),
    /** Testimonial-only fields (ignored for 'logo' rows). */
    quoteEn: v.optional(v.string()),
    quoteRu: v.optional(v.string()),
    quoteDe: v.optional(v.string()),
    quoteHy: v.optional(v.string()),
    authorName: v.optional(v.string()),
    authorRole: v.optional(v.string()),
    /** Outcome metric chip, e.g. "40%" / "less time on HR admin". */
    metric: v.optional(v.string()),
    metricLabel: v.optional(v.string()),
    /** Display order within the surface. */
    sortOrder: v.optional(v.number()),
    /** Curation audit — who created this row. */
    createdBy: v.optional(v.id('users')),
  })
    .index('by_visible_kind', ['isVisible', 'kind'])
    .index('by_org', ['organizationId']),
};
