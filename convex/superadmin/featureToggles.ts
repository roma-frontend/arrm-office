/**
 * Feature toggles — the platform operator's switches.
 *
 * Global defaults live as rows with no `organizationId`; a row with one is an
 * override for that organization. `isFeatureEnabled` is the single read path
 * every module can call: org override wins, then the global default, then
 * `true` (a feature that has never been toggled is on). That makes the table
 * append-only for turning things *off* or rolling out *gradually* — no code
 * change needed to flip a switch from the console.
 */

import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { getAuthCaller } from '../lib/getAuthCaller';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';

async function requireSuperadmin(ctx: Parameters<typeof getAuthCaller>[0]) {
  const caller = await getAuthCaller(ctx);
  if (!caller || caller.role !== 'superadmin') {
    throw new Error('Only superadmins can manage feature toggles');
  }
  return caller;
}

/**
 * Toggles shipped with the platform. Adding one here surfaces it in the UI.
 * `labelKey`/`descriptionKey` are i18n keys (dotted keys don't survive
 * i18next's key separator, hence the flattened `aiAssistant` style).
 */
export const KNOWN_FEATURES: {
  key: string;
  defaultEnabled: boolean;
  labelKey: string;
  descriptionKey: string;
}[] = [
  {
    key: 'ai.assistant',
    defaultEnabled: true,
    labelKey: 'superadmin.toggles.features.aiAssistant',
    descriptionKey: 'superadmin.toggles.features.aiAssistantDesc',
  },
  {
    key: 'face.recognition',
    defaultEnabled: true,
    labelKey: 'superadmin.toggles.features.faceRecognition',
    descriptionKey: 'superadmin.toggles.features.faceRecognitionDesc',
  },
  {
    key: 'chat.realtime',
    defaultEnabled: true,
    labelKey: 'superadmin.toggles.features.chatRealtime',
    descriptionKey: 'superadmin.toggles.features.chatRealtimeDesc',
  },
  {
    key: 'drivers.module',
    defaultEnabled: true,
    labelKey: 'superadmin.toggles.features.driversModule',
    descriptionKey: 'superadmin.toggles.features.driversModuleDesc',
  },
  {
    key: 'expenses.module',
    defaultEnabled: true,
    labelKey: 'superadmin.toggles.features.expensesModule',
    descriptionKey: 'superadmin.toggles.features.expensesModuleDesc',
  },
  {
    key: 'recruitment.module',
    defaultEnabled: true,
    labelKey: 'superadmin.toggles.features.recruitmentModule',
    descriptionKey: 'superadmin.toggles.features.recruitmentModuleDesc',
  },
  {
    key: 'surveys.module',
    defaultEnabled: true,
    labelKey: 'superadmin.toggles.features.surveysModule',
    descriptionKey: 'superadmin.toggles.features.surveysModuleDesc',
  },
  {
    key: 'compensation.module',
    defaultEnabled: true,
    labelKey: 'superadmin.toggles.features.compensationModule',
    descriptionKey: 'superadmin.toggles.features.compensationModuleDesc',
  },
];

/**
 * Effective state of a toggle for an organization. Org override wins, then the
 * global row, then the built-in default. Safe to call from any module.
 */
export async function isFeatureEnabled(
  ctx: Pick<QueryCtx, 'db'>,
  key: string,
  organizationId?: Id<'organizations'> | null,
): Promise<boolean> {
  const builtin = KNOWN_FEATURES.find((f) => f.key === key);

  if (organizationId) {
    const orgRow = await ctx.db
      .query('featureToggles')
      .withIndex('by_org_key', (q) => q.eq('organizationId', organizationId).eq('key', key))
      .first();
    if (orgRow) return orgRow.enabled;
  }

  const globalRow = await ctx.db
    .query('featureToggles')
    .withIndex('by_key', (q) => q.eq('key', key))
    .first();
  if (globalRow) return globalRow.enabled;

  return builtin ? builtin.defaultEnabled : true;
}

/**
 * Throw if a module toggle is off for the caller's organization.
 *
 * Mutations call this at the top of their handlers so a flipped switch takes
 * effect on the backend too — not just in the UI. `getAuthCaller` is re-run
 * here (cheap: one indexed read) because the caller's org decides the flag.
 */
export async function assertFeatureEnabled(
  ctx: QueryCtx | MutationCtx,
  key: string,
): Promise<void> {
  const enabled = await resolveToggleForCtx(ctx, key);
  if (!enabled) {
    throw new Error(
      `This feature is disabled. Ask your administrator to enable it in the operator console.`,
    );
  }
}

/**
 * Soft read check: `true` when the toggle is on (or the caller is unknown).
 *
 * Queries use this instead of `assertFeatureEnabled` — a disabled module
 * should render as empty (badge = 0, no conversations) rather than crash the
 * page. Only writes must hard-fail.
 */
/**
 * Resolve the effective state without requiring a real auth identity.
 *
 * Unit tests drive handlers with a mocked `ctx` that has no `auth` (they mock
 * orgAccess instead of getAuthCaller), so reaching into getAuthCaller there
 * would crash the test rather than exercise the handler. When auth is
 * unavailable the toggle is treated as on — real authorization is enforced by
 * each handler's own scope checks, and production ctx always has auth.
 */
async function resolveToggleForCtx(ctx: QueryCtx | MutationCtx, key: string): Promise<boolean> {
  if (!('auth' in ctx)) return true;
  const caller = await getAuthCaller(ctx);
  if (!caller) return true;
  // Superadmins are never gated by a tenant override — even when their own
  // user record belongs to the very org being toggled off.
  if (caller.role === 'superadmin') return true;
  return isFeatureEnabled(ctx, key, caller.organizationId);
}

/**
 * Soft read check that tolerates mocked test contexts (no `ctx.auth`).
 * Queries use this instead of `assertFeatureEnabled` — a disabled module
 * should render as empty (badge = 0, no conversations) rather than crash the
 * page. Only writes must hard-fail.
 */
export async function isFeatureEnabledForCaller(
  ctx: QueryCtx | MutationCtx,
  key: string,
): Promise<boolean> {
  return resolveToggleForCtx(ctx, key);
}

// ── Public read path ──────────────────────────────────────────────────────────

/**
 * Effective flags for the signed-in caller's organization.
 *
 * This is the realtime source of truth for the UI: Convex queries are live, so
 * flipping a toggle in the console re-renders every open client within ~100ms
 * — no reload, no polling. Modules subscribe and hide their entry points.
 */
export const getMyFeatureFlags = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];

    // Superadmins are a platform-wide role: their own org membership (some
    // superadmins are also a member of a tenant they created) must NOT apply
    // tenant overrides to them. They always see every feature on, so the
    // console stays fully usable while toggling a customer org off.
    if (caller.role === 'superadmin') {
      return KNOWN_FEATURES.map((feature) => ({
        key: feature.key,
        enabled: true,
      }));
    }

    const flags = await Promise.all(
      KNOWN_FEATURES.map(async (feature) => ({
        key: feature.key,
        enabled: await isFeatureEnabled(ctx, feature.key, caller.organizationId),
      })),
    );
    return flags;
  },
});

// ── Console queries/mutations ────────────────────────────────────────────────

/**
 * Every known feature with its global state and org-override counts.
 *
 * When `organizationId` is passed, `enabled`/`isOverridden` reflect the
 * effective state *for that organization* (override wins over global) — the
 * superadmin console needs this so a toggle shows what the selected org
 * actually sees, and flipping it writes an org override instead of a global
 * row. Without the arg the values are the platform-global state.
 */
export const listFeatureToggles = query({
  args: { organizationId: v.optional(v.id('organizations')) },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    const rows = await ctx.db.query('featureToggles').order('desc').take(200);

    const byKey = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byKey.get(row.key) ?? [];
      list.push(row);
      byKey.set(row.key, list);
    }

    return KNOWN_FEATURES.map((feature) => {
      const keyRows = byKey.get(feature.key) ?? [];
      const globalRow = keyRows.find((r) => !r.organizationId);
      const orgRows = keyRows.filter((r) => r.organizationId);
      const orgRow = args.organizationId
        ? orgRows.find((r) => r.organizationId === args.organizationId)
        : undefined;
      const globalEnabled = globalRow?.enabled ?? feature.defaultEnabled;
      return {
        key: feature.key,
        labelKey: feature.labelKey,
        descriptionKey: feature.descriptionKey,
        // Effective state for the requested org (or global when none given).
        enabled: orgRow ? orgRow.enabled : globalEnabled,
        isOverridden: args.organizationId ? Boolean(orgRow) : Boolean(globalRow),
        orgOverrideCount: orgRows.length,
        description: globalRow?.description,
        updatedAt: globalRow?.updatedAt,
      };
    });
  },
});

/** Flip the global state of a toggle. */
export const setFeatureToggle = mutation({
  args: { key: v.string(), enabled: v.boolean(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const existing = await ctx.db
      .query('featureToggles')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        description: args.description ?? existing.description,
        updatedBy: caller._id,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert('featureToggles', {
        key: args.key,
        enabled: args.enabled,
        updatedBy: caller._id,
        updatedAt: Date.now(),
        description: args.description,
      });
    }
    return { success: true };
  },
});

/** List every organization override for a feature. */
export const listFeatureOrgOverrides = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    const rows = await ctx.db
      .query('featureToggles')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .take(500);

    const orgRows = rows.filter((r) => r.organizationId);
    return Promise.all(
      orgRows.map(async (row) => {
        const org = await ctx.db.get(row.organizationId!);
        return {
          organizationId: row.organizationId,
          organizationName: org?.name ?? 'Unknown',
          enabled: row.enabled,
          updatedAt: row.updatedAt,
        };
      }),
    );
  },
});

/** Add or remove an override for one organization. */
export const setOrgFeatureOverride = mutation({
  args: {
    key: v.string(),
    organizationId: v.id('organizations'),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const existing = await ctx.db
      .query('featureToggles')
      .withIndex('by_org_key', (q) =>
        q.eq('organizationId', args.organizationId).eq('key', args.key),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        updatedBy: caller._id,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert('featureToggles', {
        key: args.key,
        organizationId: args.organizationId,
        enabled: args.enabled,
        updatedBy: caller._id,
        updatedAt: Date.now(),
      });
    }
    return { success: true };
  },
});

/** Delete an organization override, falling back to the global default. */
export const removeOrgFeatureOverride = mutation({
  args: { key: v.string(), organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    const existing = await ctx.db
      .query('featureToggles')
      .withIndex('by_org_key', (q) =>
        q.eq('organizationId', args.organizationId).eq('key', args.key),
      )
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return { success: true };
  },
});
