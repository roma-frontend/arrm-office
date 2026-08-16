/**
 * Superadmin landing text editor.
 *
 * Lets a superadmin edit every text on the public landing per language — the
 * same idea as Builder Studio's landing editor, adapted to this project's i18n
 * bundles (the `landing` namespace in each locale's JSON).
 *
 * THE PUBLISH CONTRACT (mirrors Builder Studio's draft/published split):
 *   - `saveDraft` writes the editor's working copy. It is NEVER served.
 *   - Only `publish` copies drafts → published. Autosaves/edits never touch the
 *     live site, so a half-finished sentence can't leak to production.
 *   - `unpublish` clears a published value → the key falls back to the bundled
 *     JSON (the default copy), exactly as if it had never been overridden.
 *
 * The public read path (`getPublishedLandingTexts`) is deliberately public —
 * the landing is a marketing page and SSR needs the overrides before auth is
 * even possible. It returns only `publishedValue`, never drafts.
 */

import { v } from 'convex/values';
import { query, mutation } from '../_generated/server';
import type { QueryCtx, MutationCtx } from '../_generated/server';
import { getAuthCaller } from '../lib/getAuthCaller';
import type { Id } from '../_generated/dataModel';

const LANGS = ['en', 'ru', 'de', 'hy'] as const;
type Lang = (typeof LANGS)[number];

function isLang(value: string | undefined): value is Lang {
  return LANGS.includes(value as Lang);
}

async function requireSuperadmin(ctx: QueryCtx | MutationCtx) {
  const caller = await getAuthCaller(ctx);
  if (!caller) throw new Error('Not authenticated');
  if (caller.role !== 'superadmin') throw new Error('Superadmin only');
  return caller;
}

/** All keys that currently carry a draft or a published value. */
async function loadRows(ctx: QueryCtx | MutationCtx) {
  return ctx.db.query('landingTexts').order('asc').take(10000);
}

/** Find the row for (key, locale), creating it if missing. */
async function getOrCreateRow(ctx: MutationCtx, key: string, locale: Lang, createdBy: Id<'users'>) {
  const existing = await ctx.db
    .query('landingTexts')
    .withIndex('by_locale_key', (q) => q.eq('locale', locale).eq('key', key))
    .first();
  if (existing) return existing;
  const id = await ctx.db.insert('landingTexts', {
    key,
    locale,
    createdBy,
    updatedBy: createdBy,
    updatedAt: Date.now(),
  });
  const row = await ctx.db.get(id);
  if (!row) throw new Error('Failed to create override row');
  return row;
}

// ── Public read (SSR + client live hook) ────────────────────────────────────

/**
 * Published landing overrides for one language, as a flat `{ key: value }`
 * map. Only published values — drafts never leave the editor.
 */
export const getPublishedLandingTexts = query({
  args: { lang: v.optional(v.string()) },
  handler: async (ctx, { lang }) => {
    const locale: Lang = isLang(lang) ? lang : 'en';
    const rows = await ctx.db
      .query('landingTexts')
      .withIndex('by_locale_key', (q) => q.eq('locale', locale))
      .take(10000);
    const map: Record<string, string> = {};
    for (const row of rows) {
      if (row.publishedValue) map[row.key] = row.publishedValue;
    }
    return map;
  },
});

// ── Editor queries (superadmin only) ────────────────────────────────────────

/** Every row (draft + published) for the editor UI. */
export const listLandingTexts = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);
    const rows = await loadRows(ctx);
    return rows.map((r) => ({
      key: r.key,
      locale: r.locale,
      draftValue: r.draftValue ?? null,
      publishedValue: r.publishedValue ?? null,
      updatedAt: r.updatedAt ?? null,
      publishedAt: r.publishedAt ?? null,
    }));
  },
});

// ── Editor mutations (superadmin only) ──────────────────────────────────────

/** Save (or clear) a draft for one key+locale. Never goes live. */
export const saveLandingDraft = mutation({
  args: {
    key: v.string(),
    locale: v.union(v.literal('en'), v.literal('ru'), v.literal('de'), v.literal('hy')),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const row = await getOrCreateRow(ctx, args.key, args.locale, caller._id);
    const trimmed = args.value.trim();
    await ctx.db.patch(row._id, {
      draftValue: trimmed || undefined,
      updatedBy: caller._id,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

/**
 * Publish drafts → live. The ONLY way an edit reaches the public landing.
 * `keys` optional: publish everything, or a scoped list. Values are copied
 * from drafts; keys without a draft are left untouched (nothing to publish).
 */
export const publishLandingTexts = mutation({
  args: {
    locale: v.optional(v.union(v.literal('en'), v.literal('ru'), v.literal('de'), v.literal('hy'))),
    keys: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const now = Date.now();
    let rows = await loadRows(ctx);
    if (args.locale) rows = rows.filter((r) => r.locale === args.locale);
    if (args.keys?.length) {
      const wanted = new Set(args.keys);
      rows = rows.filter((r) => wanted.has(r.key));
    }

    let published = 0;
    for (const row of rows) {
      if (!row.draftValue) continue; // nothing to publish for this row
      await ctx.db.patch(row._id, {
        publishedValue: row.draftValue,
        draftValue: undefined, // publish consumes the draft
        publishedBy: caller._id,
        publishedAt: now,
        updatedBy: caller._id,
        updatedAt: now,
      });
      published++;
    }
    return { success: true, published };
  },
});

/**
 * Restore the whole page: drop every draft and published override for one
 * locale (or every locale when omitted) so the landing renders the bundled
 * JSON copy. Mirrors Builder Studio's "restore page" action.
 */
export const resetLandingTexts = mutation({
  args: {
    locale: v.optional(v.union(v.literal('en'), v.literal('ru'), v.literal('de'), v.literal('hy'))),
  },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    let rows = await loadRows(ctx);
    if (args.locale) rows = rows.filter((r) => r.locale === args.locale);

    for (const row of rows) {
      await ctx.db.patch(row._id, {
        draftValue: undefined,
        publishedValue: undefined,
        publishedBy: undefined,
        publishedAt: undefined,
        updatedAt: Date.now(),
      });
    }
    return { success: true, reset: rows.length };
  },
});

/** Clear a published override → the bundled JSON default returns. */
export const unpublishLandingText = mutation({
  args: {
    key: v.string(),
    locale: v.union(v.literal('en'), v.literal('ru'), v.literal('de'), v.literal('hy')),
  },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    const row = await ctx.db
      .query('landingTexts')
      .withIndex('by_locale_key', (q) => q.eq('locale', args.locale).eq('key', args.key))
      .first();
    if (!row) return { success: true };
    await ctx.db.patch(row._id, {
      publishedValue: undefined,
      publishedBy: undefined,
      publishedAt: undefined,
    });
    return { success: true };
  },
});
