/**
 * Rewards — spending recognition points on something real.
 *
 * The organization owns the shelf: no partner integration, no external
 * marketplace, no gift-card API. That is deliberate for the first iteration,
 * because every partner arrangement is a negotiation, while the mechanics below
 * work on the day they ship:
 *
 *   - `manual` items are fulfilled by a person. The employee gets a voucher with
 *     a code (rendered as a QR by the client) and whoever hands the reward over
 *     marks it redeemed.
 *   - `code_pool` items hand out codes the organization already bought. Codes
 *     are claimed inside the redeeming mutation, so the same code cannot go to
 *     two people.
 *
 * Money-adjacent rules that are enforced here rather than in the UI, because the
 * UI is not a security boundary:
 *
 *   - points are debited before the voucher exists, so a shortfall aborts the
 *     whole transaction;
 *   - stock, per-person monthly limits and the organization's monthly budget
 *     ceiling are all checked server-side;
 *   - a cancelled or rejected voucher refunds exactly once (`refunded`) and
 *     releases its pool code back to `available`;
 *   - only staff may redeem *someone else's* voucher, and an expired one cannot
 *     be redeemed at all.
 */
import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { assertOrgScope, assertOrgStaff, resolveOrgScope, scopeOwnsRecord } from './lib/orgAccess';
import { notify } from './lib/notify';
import {
  clampSetting,
  creditBalance,
  debitBalance,
  getWalletView,
  periodStart,
  resolveRecognitionSettings,
  SETTINGS_BOUNDS,
  type RecognitionSettings,
} from './lib/points';
import { assertModuleAccess } from './lib/entitlements';

const MAX_CATALOG_ITEMS = 200;
const MAX_CODES_PER_UPLOAD = 500;
const MAX_NAME = 120;
const MAX_TEXT = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Voucher code alphabet: no 0/O/1/I, so a code read aloud survives the trip. */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const REWARD_CATEGORY = v.union(
  v.literal('coffee'),
  v.literal('meal'),
  v.literal('experience'),
  v.literal('time_off'),
  v.literal('merch'),
  v.literal('charity'),
  v.literal('other'),
);

const FULFILLMENT = v.union(v.literal('manual'), v.literal('code_pool'));

function randomCode(): string {
  const pick = () => {
    let out = '';
    for (let i = 0; i < 4; i += 1) {
      out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)] ?? 'X';
    }
    return out;
  };
  return `RW-${pick()}-${pick()}`;
}

/** Allocate a voucher code that is unused in this organization. */
async function allocateVoucherCode(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = randomCode();
    const clash = await ctx.db
      .query('rewardVouchers')
      .withIndex('by_code', (q) => q.eq('organizationId', organizationId).eq('code', code))
      .first();
    if (!clash) return code;
  }
  throw new Error('Could not allocate a voucher code, please retry');
}

/** Vouchers issued in the current organization-time month, cancellations aside. */
async function vouchersThisMonth(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
): Promise<Doc<'rewardVouchers'>[]> {
  const rows = await ctx.db
    .query('rewardVouchers')
    .withIndex('by_org_issued', (q) =>
      q.eq('organizationId', organizationId).gte('issuedAt', periodStart()),
    )
    .take(DEFAULT_LIST_CAP);
  return rows.filter((row) => row.status !== 'cancelled');
}

/** Face value already committed this month — what the budget ceiling compares against. */
function committedFaceValue(rows: Doc<'rewardVouchers'>[]): number {
  return rows.reduce((sum, row) => sum + (row.faceValue ?? 0), 0);
}

function voucherIsExpired(voucher: Doc<'rewardVouchers'>, at: number = Date.now()): boolean {
  return voucher.status === 'expired' || (voucher.status !== 'redeemed' && voucher.expiresAt < at);
}

// ─────────────────────────────────────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────────────────────────────────────

/** Effective economy settings. Readable by any member: prices are public. */
export const getSettings = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope) return null;
    return resolveRecognitionSettings(ctx, args.organizationId);
  },
});

/**
 * The shelf. Employees see active items with live availability; staff also see
 * archived ones and the size of each code pool.
 */
export const listCatalog = query({
  args: {
    organizationId: v.id('organizations'),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope) return [];

    const showArchived = args.includeArchived === true && scope.isStaff;
    const items = showArchived
      ? await ctx.db
          .query('rewardItems')
          .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
          .take(MAX_CATALOG_ITEMS)
      : await ctx.db
          .query('rewardItems')
          .withIndex('by_org_status', (q) =>
            q.eq('organizationId', args.organizationId).eq('status', 'active'),
          )
          .take(MAX_CATALOG_ITEMS);

    const monthStart = periodStart();

    return Promise.all(
      items
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.createdAt - b.createdAt)
        .map(async (item) => {
          let codesAvailable: number | null = null;
          if (item.fulfillment === 'code_pool') {
            const available = await ctx.db
              .query('rewardCodes')
              .withIndex('by_item_status', (q) =>
                q.eq('rewardItemId', item._id).eq('status', 'available'),
              )
              .take(SMALL_LIST_CAP);
            codesAvailable = available.length;
          }

          // How many the caller already took this month, so the card can say
          // "limit reached" instead of failing on click.
          let myThisMonth = 0;
          if (item.perUserLimitPerMonth) {
            const mine = await ctx.db
              .query('rewardVouchers')
              .withIndex('by_org_user', (q) =>
                q.eq('organizationId', args.organizationId).eq('userId', scope.caller._id),
              )
              .take(DEFAULT_LIST_CAP);
            myThisMonth = mine.filter(
              (row) =>
                row.rewardItemId === item._id &&
                row.issuedAt >= monthStart &&
                row.status !== 'cancelled',
            ).length;
          }

          const stockLeft =
            item.stockLimit === undefined ? null : Math.max(0, item.stockLimit - item.issuedCount);

          return {
            ...item,
            codesAvailable,
            stockLeft,
            myThisMonth,
            soldOut:
              (stockLeft !== null && stockLeft === 0) ||
              (codesAvailable !== null && codesAvailable === 0),
            limitReached:
              item.perUserLimitPerMonth !== undefined && myThisMonth >= item.perUserLimitPerMonth,
          };
        }),
    );
  },
});

/** My vouchers, newest first. */
export const listMyVouchers = query({
  args: {
    organizationId: v.id('organizations'),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope) return [];

    const rows = await ctx.db
      .query('rewardVouchers')
      .withIndex('by_org_user', (q) =>
        q.eq('organizationId', args.organizationId).eq('userId', scope.caller._id),
      )
      .take(DEFAULT_LIST_CAP);

    const now = Date.now();
    const decorated = rows
      .map((row) => ({ ...row, isExpired: voucherIsExpired(row, now) }))
      .sort((a, b) => b.issuedAt - a.issuedAt);

    return args.activeOnly
      ? decorated.filter(
          (row) => (row.status === 'issued' || row.status === 'pending') && !row.isExpired,
        )
      : decorated;
  },
});

/** Registry for staff: every voucher, with recipient names. */
export const listVouchers = query({
  args: {
    organizationId: v.id('organizations'),
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('issued'),
        v.literal('redeemed'),
        v.literal('expired'),
        v.literal('cancelled'),
      ),
    ),
    userId: v.optional(v.id('users')),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope?.isStaff) return [];

    const rows = args.status
      ? await ctx.db
          .query('rewardVouchers')
          .withIndex('by_org_status', (q) =>
            q.eq('organizationId', args.organizationId).eq('status', args.status!),
          )
          .take(DEFAULT_LIST_CAP)
      : await ctx.db
          .query('rewardVouchers')
          .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
          .take(DEFAULT_LIST_CAP);

    const filteredByUser = args.userId ? rows.filter((r) => r.userId === args.userId) : rows;

    const userIds = [...new Set(filteredByUser.map((r) => r.userId))];
    const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    const userMap = new Map(users.filter(Boolean).map((u) => [u!._id, u!]));

    const needle = args.search?.trim().toLowerCase();
    const now = Date.now();

    return filteredByUser
      .map((row) => {
        const user = userMap.get(row.userId);
        return {
          ...row,
          isExpired: voucherIsExpired(row, now),
          recipient: user ? { _id: user._id, name: user.name, email: user.email } : null,
        };
      })
      .filter((row) => {
        if (!needle) return true;
        return (
          row.code.toLowerCase().includes(needle) ||
          row.title.toLowerCase().includes(needle) ||
          (row.recipient?.name ?? '').toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => b.issuedAt - a.issuedAt);
  },
});

/**
 * Look a voucher up by the code an employee shows. Staff only — this is the
 * redemption desk.
 */
export const findVoucherByCode = query({
  args: {
    organizationId: v.id('organizations'),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope?.isStaff) return null;

    const code = args.code.trim().toUpperCase();
    if (!code) return null;

    const voucher = await ctx.db
      .query('rewardVouchers')
      .withIndex('by_code', (q) => q.eq('organizationId', args.organizationId).eq('code', code))
      .first();
    if (!voucher) return null;

    const [user, item] = await Promise.all([
      ctx.db.get(voucher.userId),
      ctx.db.get(voucher.rewardItemId),
    ]);

    return {
      ...voucher,
      isExpired: voucherIsExpired(voucher),
      recipient: user ? { _id: user._id, name: user.name, email: user.email } : null,
      instructions: item?.instructions,
    };
  },
});

/** Counters and budget position for the admin panel. */
export const getSummary = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope?.isStaff) return null;

    const settings = await resolveRecognitionSettings(ctx, args.organizationId);
    const all = await ctx.db
      .query('rewardVouchers')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    const now = Date.now();
    const monthStart = periodStart(now);
    const monthRows = all.filter((r) => r.issuedAt >= monthStart && r.status !== 'cancelled');

    const counts = { pending: 0, issued: 0, redeemed: 0, expired: 0, cancelled: 0 };
    for (const row of all) {
      if (row.status === 'issued' && voucherIsExpired(row, now)) counts.expired += 1;
      else counts[row.status] += 1;
    }

    // Points sitting in wallets: the liability the catalog has to be able to absorb.
    const wallets = await ctx.db
      .query('userPoints')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);
    const outstandingPoints = wallets.reduce((sum, w) => sum + w.balance, 0);

    return {
      counts,
      settings,
      monthSpend: committedFaceValue(monthRows),
      monthCount: monthRows.length,
      monthlyBudgetCap: settings.monthlyBudgetCap,
      outstandingPoints,
      outstandingValue: outstandingPoints * settings.pointValue,
    };
  },
});

/** Wallet of the caller, for the storefront header. */
export const getMyWallet = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope) return null;
    const settings = await resolveRecognitionSettings(ctx, args.organizationId);
    const wallet = await getWalletView(ctx, args.organizationId, scope.caller._id, settings);
    return { ...wallet, pointValue: settings.pointValue, currency: settings.currency };
  },
});

/** Codes of one item, for the admin pool view. Values are shown to staff only. */
export const listCodes = query({
  args: { rewardItemId: v.id('rewardItems') },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.rewardItemId);
    if (!item) return [];
    const scope = await resolveOrgScope(ctx, item.organizationId);
    if (!scope?.isStaff || !scopeOwnsRecord(scope, item)) return [];

    return ctx.db
      .query('rewardCodes')
      .withIndex('by_item', (q) => q.eq('rewardItemId', args.rewardItemId))
      .take(SMALL_LIST_CAP);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

export const updateSettings = mutation({
  args: {
    organizationId: v.optional(v.id('organizations')),
    currency: v.optional(v.string()),
    pointValue: v.optional(v.number()),
    monthlyAllowance: v.optional(v.number()),
    kudosCost: v.optional(v.number()),
    receiverReward: v.optional(v.number()),
    attendanceReward: v.optional(v.number()),
    reviewReward: v.optional(v.number()),
    maxKudosPerColleaguePerMonth: v.optional(v.number()),
    voucherValidDays: v.optional(v.number()),
    /** Pass null to lift the ceiling. */
    monthlyBudgetCap: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const scope = await assertOrgStaff(ctx, args.organizationId, { adminOnly: true });
    const organizationId = scope.organizationId;
    if (!organizationId) throw new Error('Organization is required');

    const current = await resolveRecognitionSettings(ctx, organizationId);
    const next: RecognitionSettings = {
      currency: (args.currency ?? current.currency).slice(0, 8).toUpperCase(),
      pointValue: clampSetting(args.pointValue ?? current.pointValue, SETTINGS_BOUNDS.pointValue),
      monthlyAllowance: clampSetting(
        args.monthlyAllowance ?? current.monthlyAllowance,
        SETTINGS_BOUNDS.monthlyAllowance,
      ),
      kudosCost: clampSetting(args.kudosCost ?? current.kudosCost, SETTINGS_BOUNDS.kudosCost),
      receiverReward: clampSetting(
        args.receiverReward ?? current.receiverReward,
        SETTINGS_BOUNDS.receiverReward,
      ),
      attendanceReward: clampSetting(
        args.attendanceReward ?? current.attendanceReward,
        SETTINGS_BOUNDS.attendanceReward,
      ),
      reviewReward: clampSetting(
        args.reviewReward ?? current.reviewReward,
        SETTINGS_BOUNDS.reviewReward,
      ),
      maxKudosPerColleaguePerMonth: clampSetting(
        args.maxKudosPerColleaguePerMonth ?? current.maxKudosPerColleaguePerMonth,
        SETTINGS_BOUNDS.maxKudosPerColleaguePerMonth,
      ),
      voucherValidDays: clampSetting(
        args.voucherValidDays ?? current.voucherValidDays,
        SETTINGS_BOUNDS.voucherValidDays,
      ),
      monthlyBudgetCap:
        args.monthlyBudgetCap === null
          ? undefined
          : args.monthlyBudgetCap === undefined
            ? current.monthlyBudgetCap
            : clampSetting(args.monthlyBudgetCap, SETTINGS_BOUNDS.monthlyBudgetCap),
    };

    const now = Date.now();
    const existing = await ctx.db
      .query('recognitionSettings')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { ...next, updatedBy: scope.caller._id, updatedAt: now });
      return existing._id;
    }

    return ctx.db.insert('recognitionSettings', {
      organizationId,
      ...next,
      updatedBy: scope.caller._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// CATALOG
// ─────────────────────────────────────────────────────────────────────────────

function assertItemInput(args: {
  name: string;
  costPoints: number;
  faceValue?: number;
  description?: string;
  instructions?: string;
}): void {
  const name = args.name.trim();
  if (!name) throw new Error('Name is required');
  if (name.length > MAX_NAME) throw new Error(`Name must be at most ${MAX_NAME} characters`);
  if (!Number.isFinite(args.costPoints) || args.costPoints < 1) {
    throw new Error('Price in points must be at least 1');
  }
  if (args.faceValue !== undefined && (!Number.isFinite(args.faceValue) || args.faceValue < 0)) {
    throw new Error('Face value cannot be negative');
  }
  if ((args.description?.length ?? 0) > MAX_TEXT || (args.instructions?.length ?? 0) > MAX_TEXT) {
    throw new Error(`Text must be at most ${MAX_TEXT} characters`);
  }
}

export const createItem = mutation({
  args: {
    organizationId: v.optional(v.id('organizations')),
    name: v.string(),
    description: v.optional(v.string()),
    category: REWARD_CATEGORY,
    emoji: v.optional(v.string()),
    costPoints: v.number(),
    faceValue: v.optional(v.number()),
    fulfillment: FULFILLMENT,
    instructions: v.optional(v.string()),
    stockLimit: v.optional(v.number()),
    perUserLimitPerMonth: v.optional(v.number()),
    requiresApproval: v.optional(v.boolean()),
    requiresCompanion: v.optional(v.boolean()),
    validDays: v.optional(v.number()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'rewards');
    const scope = await assertOrgStaff(ctx, args.organizationId);
    const organizationId = scope.organizationId;
    if (!organizationId) throw new Error('Organization is required');
    assertItemInput(args);

    const existing = await ctx.db
      .query('rewardItems')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(MAX_CATALOG_ITEMS + 1);
    if (existing.length > MAX_CATALOG_ITEMS) {
      throw new Error(`A catalog holds at most ${MAX_CATALOG_ITEMS} items`);
    }

    const now = Date.now();
    return ctx.db.insert('rewardItems', {
      organizationId,
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
      category: args.category,
      emoji: args.emoji?.slice(0, 8) || undefined,
      costPoints: Math.round(args.costPoints),
      faceValue: args.faceValue === undefined ? undefined : Math.round(args.faceValue),
      fulfillment: args.fulfillment,
      instructions: args.instructions?.trim() || undefined,
      stockLimit:
        args.stockLimit === undefined ? undefined : Math.max(0, Math.round(args.stockLimit)),
      issuedCount: 0,
      perUserLimitPerMonth:
        args.perUserLimitPerMonth === undefined
          ? undefined
          : Math.max(1, Math.round(args.perUserLimitPerMonth)),
      requiresApproval: args.requiresApproval ?? false,
      requiresCompanion: args.requiresCompanion ?? undefined,
      validDays: args.validDays === undefined ? undefined : Math.max(1, Math.round(args.validDays)),
      status: 'active',
      sortOrder: args.sortOrder,
      createdBy: scope.caller._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateItem = mutation({
  args: {
    itemId: v.id('rewardItems'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(REWARD_CATEGORY),
    emoji: v.optional(v.string()),
    costPoints: v.optional(v.number()),
    faceValue: v.optional(v.number()),
    instructions: v.optional(v.string()),
    stockLimit: v.optional(v.union(v.number(), v.null())),
    perUserLimitPerMonth: v.optional(v.union(v.number(), v.null())),
    requiresApproval: v.optional(v.boolean()),
    requiresCompanion: v.optional(v.boolean()),
    validDays: v.optional(v.union(v.number(), v.null())),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'rewards');
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error('Reward not found');
    const scope = await assertOrgStaff(ctx, item.organizationId);
    if (!scopeOwnsRecord(scope, item)) throw new Error('Reward not found');

    assertItemInput({
      name: args.name ?? item.name,
      costPoints: args.costPoints ?? item.costPoints,
      faceValue: args.faceValue ?? item.faceValue,
      description: args.description,
      instructions: args.instructions,
    });

    // Fulfilment mode is not editable: switching a pool item to manual would
    // orphan uploaded codes, and the reverse would issue vouchers with no code.
    await ctx.db.patch(args.itemId, {
      name: args.name?.trim() ?? item.name,
      description:
        args.description === undefined ? item.description : args.description.trim() || undefined,
      category: args.category ?? item.category,
      emoji: args.emoji === undefined ? item.emoji : args.emoji.slice(0, 8) || undefined,
      costPoints: args.costPoints === undefined ? item.costPoints : Math.round(args.costPoints),
      faceValue: args.faceValue === undefined ? item.faceValue : Math.round(args.faceValue),
      instructions:
        args.instructions === undefined ? item.instructions : args.instructions.trim() || undefined,
      stockLimit:
        args.stockLimit === undefined
          ? item.stockLimit
          : args.stockLimit === null
            ? undefined
            : Math.max(0, Math.round(args.stockLimit)),
      perUserLimitPerMonth:
        args.perUserLimitPerMonth === undefined
          ? item.perUserLimitPerMonth
          : args.perUserLimitPerMonth === null
            ? undefined
            : Math.max(1, Math.round(args.perUserLimitPerMonth)),
      requiresApproval: args.requiresApproval ?? item.requiresApproval,
      requiresCompanion: args.requiresCompanion ?? item.requiresCompanion,
      validDays:
        args.validDays === undefined
          ? item.validDays
          : args.validDays === null
            ? undefined
            : Math.max(1, Math.round(args.validDays)),
      sortOrder: args.sortOrder ?? item.sortOrder,
      updatedAt: Date.now(),
    });
  },
});

/** Archive keeps history intact; the shelf just stops showing the item. */
export const setItemStatus = mutation({
  args: {
    itemId: v.id('rewardItems'),
    status: v.union(v.literal('active'), v.literal('archived')),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error('Reward not found');
    const scope = await assertOrgStaff(ctx, item.organizationId);
    if (!scopeOwnsRecord(scope, item)) throw new Error('Reward not found');

    await ctx.db.patch(args.itemId, { status: args.status, updatedAt: Date.now() });
  },
});

/** Hard delete, allowed only while nothing was ever handed out from the item. */
export const removeItem = mutation({
  args: { itemId: v.id('rewardItems') },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'rewards');
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error('Reward not found');
    const scope = await assertOrgStaff(ctx, item.organizationId, { adminOnly: true });
    if (!scopeOwnsRecord(scope, item)) throw new Error('Reward not found');

    const issued = await ctx.db
      .query('rewardVouchers')
      .withIndex('by_item', (q) => q.eq('rewardItemId', args.itemId))
      .first();
    if (issued) {
      throw new Error('Reward has vouchers — archive it instead of deleting');
    }

    const codes = await ctx.db
      .query('rewardCodes')
      .withIndex('by_item', (q) => q.eq('rewardItemId', args.itemId))
      .take(MAX_CODES_PER_UPLOAD);
    for (const code of codes) await ctx.db.delete(code._id);

    await ctx.db.delete(args.itemId);
  },
});

/**
 * Load pre-bought codes into an item's pool.
 *
 * Duplicates inside the same item are skipped rather than rejected, so an admin
 * can re-paste a batch after a partial upload without hunting for the overlap.
 */
export const uploadCodes = mutation({
  args: {
    itemId: v.id('rewardItems'),
    codes: v.array(v.string()),
    note: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error('Reward not found');
    const scope = await assertOrgStaff(ctx, item.organizationId, { adminOnly: true });
    if (!scopeOwnsRecord(scope, item)) throw new Error('Reward not found');
    if (item.fulfillment !== 'code_pool') {
      throw new Error('This reward is fulfilled by hand and has no code pool');
    }
    if (args.codes.length > MAX_CODES_PER_UPLOAD) {
      throw new Error(`At most ${MAX_CODES_PER_UPLOAD} codes per upload`);
    }

    const cleaned = [...new Set(args.codes.map((c) => c.trim()).filter(Boolean))];
    const now = Date.now();
    let added = 0;
    let skipped = 0;

    for (const code of cleaned) {
      const clash = await ctx.db
        .query('rewardCodes')
        .withIndex('by_item_code', (q) => q.eq('rewardItemId', args.itemId).eq('code', code))
        .first();
      if (clash) {
        skipped += 1;
        continue;
      }
      await ctx.db.insert('rewardCodes', {
        organizationId: item.organizationId,
        rewardItemId: args.itemId,
        code,
        note: args.note?.trim() || undefined,
        status: 'available',
        expiresAt: args.expiresAt,
        uploadedBy: scope.caller._id,
        createdAt: now,
      });
      added += 1;
    }

    return { added, skipped };
  },
});

/** Void an unassigned code (wrong batch, partner cancelled it). */
export const voidCode = mutation({
  args: { codeId: v.id('rewardCodes') },
  handler: async (ctx, args) => {
    const code = await ctx.db.get(args.codeId);
    if (!code) throw new Error('Code not found');
    const scope = await assertOrgStaff(ctx, code.organizationId, { adminOnly: true });
    if (!scopeOwnsRecord(scope, code)) throw new Error('Code not found');
    if (code.status === 'assigned') throw new Error('Code is already handed out');

    await ctx.db.patch(args.codeId, { status: 'void' });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// REDEMPTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Spend points on a catalog item.
 *
 * Every guard runs before the voucher is written, and the points leave the
 * wallet first: if anything below throws, Convex rolls the whole mutation back,
 * so there is no state where the balance moved without a voucher or a code was
 * consumed without a recipient.
 */
export const redeem = mutation({
  args: {
    itemId: v.id('rewardItems'),
    note: v.optional(v.string()),
    companionId: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'rewards');
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error('Reward not found');

    const scope = await assertOrgScope(ctx, item.organizationId);
    const organizationId = scope.organizationId;
    if (!organizationId || !scopeOwnsRecord(scope, item)) throw new Error('Reward not found');
    if (item.status !== 'active') throw new Error('Reward is not available');

    const settings = await resolveRecognitionSettings(ctx, organizationId);
    const me = scope.caller._id;
    const now = Date.now();
    const monthStart = periodStart(now);

    if (item.stockLimit !== undefined && item.issuedCount >= item.stockLimit) {
      throw new Error('Reward is out of stock');
    }

    if (item.perUserLimitPerMonth !== undefined) {
      const mine = await ctx.db
        .query('rewardVouchers')
        .withIndex('by_org_user', (q) => q.eq('organizationId', organizationId).eq('userId', me))
        .take(DEFAULT_LIST_CAP);
      const usedThisMonth = mine.filter(
        (row) =>
          row.rewardItemId === args.itemId &&
          row.issuedAt >= monthStart &&
          row.status !== 'cancelled',
      ).length;
      if (usedThisMonth >= item.perUserLimitPerMonth) {
        throw new Error(
          `Monthly limit reached: ${item.perUserLimitPerMonth} per person for this reward`,
        );
      }
    }

    if (settings.monthlyBudgetCap !== undefined && (item.faceValue ?? 0) > 0) {
      const monthRows = await vouchersThisMonth(ctx, organizationId);
      const spent = committedFaceValue(monthRows);
      if (spent + (item.faceValue ?? 0) > settings.monthlyBudgetCap) {
        throw new Error("This month's reward budget is exhausted");
      }
    }

    let companionId: Id<'users'> | undefined;
    if (item.requiresCompanion) {
      if (!args.companionId) throw new Error('Pick a colleague to share this with');
      if (args.companionId === me) throw new Error('Pick someone other than yourself');
      const companion = await ctx.db.get(args.companionId);
      if (!companion || companion.organizationId !== organizationId) {
        throw new Error('Colleague not found in this organization');
      }
      companionId = args.companionId;
    }

    let poolCode: Doc<'rewardCodes'> | null = null;
    if (item.fulfillment === 'code_pool') {
      poolCode =
        (await ctx.db
          .query('rewardCodes')
          .withIndex('by_item_status', (q) =>
            q.eq('rewardItemId', args.itemId).eq('status', 'available'),
          )
          .first()) ?? null;
      if (!poolCode) throw new Error('No codes left for this reward');
    }

    // Throws when short — nothing has been written up to here.
    await debitBalance(ctx, {
      organizationId,
      userId: me,
      amount: item.costPoints,
      type: 'spent_reward',
      description: `Reward: ${item.name}`,
      referenceId: args.itemId,
    });

    const code = await allocateVoucherCode(ctx, organizationId);
    const validDays = item.validDays ?? settings.voucherValidDays;
    const pending = item.requiresApproval;

    const voucherId = await ctx.db.insert('rewardVouchers', {
      organizationId,
      rewardItemId: args.itemId,
      userId: me,
      code,
      title: item.name,
      costPoints: item.costPoints,
      faceValue: item.faceValue,
      // A pending voucher must not leak the code before approval.
      partnerCode: pending ? undefined : poolCode?.code,
      rewardCodeId: poolCode?._id,
      status: pending ? 'pending' : 'issued',
      companionId,
      note: args.note?.trim().slice(0, MAX_TEXT) || undefined,
      issuedAt: now,
      expiresAt: now + validDays * DAY_MS,
      updatedAt: now,
    });

    if (poolCode) {
      await ctx.db.patch(poolCode._id, {
        status: 'assigned',
        voucherId,
        assignedAt: now,
      });
    }

    await ctx.db.patch(args.itemId, {
      issuedCount: item.issuedCount + 1,
      updatedAt: now,
    });

    if (pending) {
      // Nobody would know a request is waiting otherwise.
      const admins = await ctx.db
        .query('users')
        .withIndex('by_org_role', (q) => q.eq('organizationId', organizationId).eq('role', 'admin'))
        .take(SMALL_LIST_CAP);
      for (const admin of admins) {
        await notify(ctx, {
          organizationId,
          userId: admin._id,
          type: 'system',
          titleKey: 'notifications.titles.rewardApprovalNeeded',
          messageKey: 'notifications.messages.rewardApprovalNeeded',
          params: { name: scope.caller.name, reward: item.name },
          fallbackTitle: 'Reward needs approval',
          fallbackMessage: `${scope.caller.name} requested "${item.name}"`,
          relatedId: voucherId,
          route: '/recognition',
        });
      }
    }

    return { voucherId, code, status: pending ? 'pending' : 'issued' };
  },
});

/** Approve a held voucher: the code (if any) becomes visible to the employee. */
export const approveVoucher = mutation({
  args: { voucherId: v.id('rewardVouchers') },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'rewards');
    const voucher = await ctx.db.get(args.voucherId);
    if (!voucher) throw new Error('Voucher not found');
    const scope = await assertOrgStaff(ctx, voucher.organizationId);
    if (!scopeOwnsRecord(scope, voucher)) throw new Error('Voucher not found');
    if (voucher.status !== 'pending') throw new Error('Voucher is not awaiting approval');

    const now = Date.now();
    const poolCode = voucher.rewardCodeId ? await ctx.db.get(voucher.rewardCodeId) : null;

    await ctx.db.patch(args.voucherId, {
      status: 'issued',
      partnerCode: poolCode?.code,
      approvedBy: scope.caller._id,
      approvedAt: now,
      updatedAt: now,
    });

    await notify(ctx, {
      organizationId: voucher.organizationId,
      userId: voucher.userId,
      type: 'system',
      titleKey: 'notifications.titles.rewardApproved',
      messageKey: 'notifications.messages.rewardApproved',
      params: { reward: voucher.title, code: voucher.code },
      fallbackTitle: 'Reward approved',
      fallbackMessage: `"${voucher.title}" is ready — code ${voucher.code}`,
      relatedId: args.voucherId,
      route: '/recognition',
    });
  },
});

/** Mark a voucher as fulfilled. Staff only: this is the counter-side action. */
export const markRedeemed = mutation({
  args: { voucherId: v.id('rewardVouchers') },
  handler: async (ctx, args) => {
    const voucher = await ctx.db.get(args.voucherId);
    if (!voucher) throw new Error('Voucher not found');
    const scope = await assertOrgStaff(ctx, voucher.organizationId);
    if (!scopeOwnsRecord(scope, voucher)) throw new Error('Voucher not found');

    if (voucher.status === 'redeemed') throw new Error('Voucher was already redeemed');
    if (voucher.status !== 'issued') throw new Error('Voucher is not active');
    if (voucherIsExpired(voucher)) throw new Error('Voucher has expired');

    const now = Date.now();
    await ctx.db.patch(args.voucherId, {
      status: 'redeemed',
      redeemedBy: scope.caller._id,
      redeemedAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Cancel a voucher and give the points back.
 *
 * The owner may cancel their own while it is untouched; staff may cancel anyone's
 * (a rejected request, a reward that cannot be honoured). The refund is guarded
 * by `refunded` so a double cancel cannot mint points.
 */
export const cancelVoucher = mutation({
  args: {
    voucherId: v.id('rewardVouchers'),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const voucher = await ctx.db.get(args.voucherId);
    if (!voucher) throw new Error('Voucher not found');
    const scope = await assertOrgScope(ctx, voucher.organizationId);
    if (!scopeOwnsRecord(scope, voucher)) throw new Error('Voucher not found');

    const isOwner = voucher.userId === scope.caller._id;
    if (!isOwner && !scope.isStaff) throw new Error('Not authorized to cancel this voucher');
    if (voucher.status === 'redeemed') throw new Error('A redeemed voucher cannot be cancelled');
    if (voucher.status === 'cancelled') return;

    const now = Date.now();
    await ctx.db.patch(args.voucherId, {
      status: 'cancelled',
      cancelledBy: scope.caller._id,
      cancelledAt: now,
      cancelReason: args.reason?.trim().slice(0, MAX_TEXT) || undefined,
      refunded: true,
      updatedAt: now,
    });

    if (!voucher.refunded) {
      await creditBalance(ctx, {
        organizationId: voucher.organizationId,
        userId: voucher.userId,
        amount: voucher.costPoints,
        type: 'refund_reward',
        description: `Refund: ${voucher.title}`,
        referenceId: args.voucherId,
      });
    }

    // Give the pool code back so it can be handed to someone else.
    if (voucher.rewardCodeId) {
      const poolCode = await ctx.db.get(voucher.rewardCodeId);
      if (poolCode && poolCode.status === 'assigned') {
        await ctx.db.patch(poolCode._id, {
          status: 'available',
          voucherId: undefined,
          assignedAt: undefined,
        });
      }
    }

    const item = await ctx.db.get(voucher.rewardItemId);
    if (item && item.issuedCount > 0) {
      await ctx.db.patch(item._id, { issuedCount: item.issuedCount - 1, updatedAt: now });
    }

    if (!isOwner) {
      await notify(ctx, {
        organizationId: voucher.organizationId,
        userId: voucher.userId,
        type: 'system',
        titleKey: 'notifications.titles.rewardCancelled',
        messageKey: 'notifications.messages.rewardCancelled',
        params: { reward: voucher.title, points: String(voucher.costPoints) },
        fallbackTitle: 'Reward cancelled',
        fallbackMessage: `"${voucher.title}" was cancelled and ${voucher.costPoints} points returned`,
        relatedId: args.voucherId,
        route: '/recognition',
      });
    }
  },
});

/**
 * Nightly sweep marking lapsed vouchers expired.
 *
 * Points are *not* refunded: the reward was available and went unused, and an
 * automatic refund would make expiry meaningless. Queries already treat a lapsed
 * voucher as expired, so this only settles the stored status and frees the pool
 * code for reuse.
 */
export const expireVouchers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // Cross-tenant sweep, so no org-scoped index applies; the status filter keeps
    // the scan to vouchers that could still lapse.
    const stale = await ctx.db
      .query('rewardVouchers')
      .filter((q) => q.or(q.eq(q.field('status'), 'issued'), q.eq(q.field('status'), 'pending')))
      .take(DEFAULT_LIST_CAP);

    let expired = 0;
    for (const voucher of stale) {
      if (voucher.status !== 'issued' && voucher.status !== 'pending') continue;
      if (voucher.expiresAt >= now) continue;

      await ctx.db.patch(voucher._id, { status: 'expired', updatedAt: now });
      expired += 1;

      if (voucher.rewardCodeId) {
        const poolCode = await ctx.db.get(voucher.rewardCodeId);
        if (poolCode && poolCode.status === 'assigned') {
          await ctx.db.patch(poolCode._id, {
            status: 'available',
            voucherId: undefined,
            assignedAt: undefined,
          });
        }
      }
    }

    return { expired };
  },
});
