import { defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * Superadmin landing text overrides, one row per (key, locale).
 *
 * Model borrowed from Builder Studio's landing editor: edits never go live on
 * save. The editor writes `draftValue`; only an explicit publish copies it to
 * `publishedValue`. The public landing reads published values only, so a
 * half-finished edit can never leak to production.
 *
 * `key` is the full dotted i18n key inside the `landing` namespace — e.g.
 * `landing.heroTitle`, `pricing.title`, `faq.items.0.q`. Keys may point into
 * nested objects and arrays (the index segments stay numeric).
 */
export const landingTexts = {
  landingTexts: defineTable({
    key: v.string(),
    locale: v.union(v.literal('en'), v.literal('ru'), v.literal('de'), v.literal('hy')),
    /** Editor working copy — never served to the public. */
    draftValue: v.optional(v.string()),
    /** Live value — what the landing actually renders. */
    publishedValue: v.optional(v.string()),
    createdBy: v.optional(v.id('users')),
    updatedBy: v.optional(v.id('users')),
    updatedAt: v.optional(v.number()),
    publishedBy: v.optional(v.id('users')),
    publishedAt: v.optional(v.number()),
  })
    .index('by_locale_key', ['locale', 'key'])
    .index('by_key', ['key']),
};
