import { defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * Rewards — the redemption half of recognition.
 *
 * Recognition already had points, but they could only be spent on *sending*
 * praise, so a collected balance had no exit. These tables give it one without
 * depending on any external partner: the organization decides what is on the
 * shelf, and fulfilment is either a code it already owns or a human handing
 * something over.
 *
 * Two fulfilment modes cover the realistic cases:
 *
 *   - `code_pool` — the organization bought vouchers (a coffee chain's promo
 *     codes, mall gift cards) and uploaded the codes. Redeeming assigns one,
 *     exclusively, and the employee sees it immediately.
 *
 *   - `manual` — nothing to hand out digitally: a coffee at the office café, an
 *     early Friday, a team lunch. The employee gets a voucher with a code and a
 *     QR to show, and whoever fulfils it marks it redeemed.
 *
 * The catalog stores prices in points; `faceValue` is what the organization
 * actually pays in its currency and is the only number the budget ceiling
 * looks at. Points are an internal unit — mixing the two in one field is how
 * reward systems end up unable to answer "what did this cost us in August".
 */

const REWARD_CATEGORY = v.union(
  v.literal('coffee'),
  v.literal('meal'),
  v.literal('experience'),
  v.literal('time_off'),
  v.literal('merch'),
  v.literal('charity'),
  v.literal('other'),
);

export const rewards = {
  /**
   * Per-organization economy configuration. One row per org, absent until an
   * admin saves it — resolution against defaults lives in `lib/points.ts`, so
   * the module works out of the box on a fresh tenant.
   */
  recognitionSettings: defineTable({
    organizationId: v.id('organizations'),
    currency: v.optional(v.string()),
    /** Worth of one point in `currency`. Drives price hints and budget maths. */
    pointValue: v.optional(v.number()),
    monthlyAllowance: v.optional(v.number()),
    kudosCost: v.optional(v.number()),
    receiverReward: v.optional(v.number()),
    attendanceReward: v.optional(v.number()),
    reviewReward: v.optional(v.number()),
    maxKudosPerColleaguePerMonth: v.optional(v.number()),
    voucherValidDays: v.optional(v.number()),
    /** Ceiling on face value issued per month. Absent → uncapped. */
    monthlyBudgetCap: v.optional(v.number()),
    updatedBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_org', ['organizationId']),

  /** A shelf item. Text is authored by the organization in its own language, matching `kudosBadges`. */
  rewardItems: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    description: v.optional(v.string()),
    category: REWARD_CATEGORY,
    /** Emoji shown on the card. Kept as text so an org is not limited to our icon set. */
    emoji: v.optional(v.string()),
    costPoints: v.number(),
    /** Cost to the organization, in the settings currency. Feeds the budget ceiling. */
    faceValue: v.optional(v.number()),
    fulfillment: v.union(v.literal('manual'), v.literal('code_pool')),
    /** Shown on the voucher: where to go, what to say. */
    instructions: v.optional(v.string()),
    /** Total vouchers ever issuable. Absent → unlimited. */
    stockLimit: v.optional(v.number()),
    issuedCount: v.number(),
    /** Per-person ceiling inside one calendar month. Absent → unlimited. */
    perUserLimitPerMonth: v.optional(v.number()),
    /** Hold the voucher until staff approve — for expensive or scheduled rewards. */
    requiresApproval: v.boolean(),
    /** Overrides the organization-wide voucher lifetime. */
    validDays: v.optional(v.number()),
    /** Ask the employee to name a colleague — the "coffee for two" mechanic. */
    requiresCompanion: v.optional(v.boolean()),
    status: v.union(v.literal('active'), v.literal('archived')),
    sortOrder: v.optional(v.number()),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_org_category', ['organizationId', 'category']),

  /**
   * Pre-bought codes waiting to be handed out.
   *
   * A code is claimed by patching it to `assigned` inside the same mutation that
   * issues the voucher, so two employees redeeming at once cannot receive the
   * same one — Convex serializes conflicting writes.
   */
  rewardCodes: defineTable({
    organizationId: v.id('organizations'),
    rewardItemId: v.id('rewardItems'),
    code: v.string(),
    /** Free-form: which batch, which partner, what it is worth. */
    note: v.optional(v.string()),
    status: v.union(v.literal('available'), v.literal('assigned'), v.literal('void')),
    voucherId: v.optional(v.id('rewardVouchers')),
    /** The partner's own expiry, independent of our voucher lifetime. */
    expiresAt: v.optional(v.number()),
    uploadedBy: v.id('users'),
    createdAt: v.number(),
    assignedAt: v.optional(v.number()),
  })
    .index('by_org', ['organizationId'])
    .index('by_item', ['rewardItemId'])
    .index('by_item_status', ['rewardItemId', 'status'])
    .index('by_item_code', ['rewardItemId', 'code']),

  /**
   * One reward handed to one person.
   *
   * Item name, point price and face value are snapshotted at issue time: the
   * catalog is expected to change, and a voucher has to stay a faithful record
   * of what was promised and what it cost.
   */
  rewardVouchers: defineTable({
    organizationId: v.id('organizations'),
    rewardItemId: v.id('rewardItems'),
    userId: v.id('users'),
    /** Our own short code, printed and encoded as a QR. Unique per organization. */
    code: v.string(),
    title: v.string(),
    costPoints: v.number(),
    faceValue: v.optional(v.number()),
    /** Code taken from the pool, if the item is fulfilled that way. */
    partnerCode: v.optional(v.string()),
    rewardCodeId: v.optional(v.id('rewardCodes')),
    status: v.union(
      /** Waiting for staff approval; points are already held. */
      v.literal('pending'),
      v.literal('issued'),
      v.literal('redeemed'),
      v.literal('expired'),
      v.literal('cancelled'),
    ),
    /** Colleague to share it with, for items that ask for one. */
    companionId: v.optional(v.id('users')),
    /** Employee's note — a preferred date for time off, a size, a flavour. */
    note: v.optional(v.string()),
    issuedAt: v.number(),
    expiresAt: v.number(),
    approvedBy: v.optional(v.id('users')),
    approvedAt: v.optional(v.number()),
    redeemedBy: v.optional(v.id('users')),
    redeemedAt: v.optional(v.number()),
    cancelledBy: v.optional(v.id('users')),
    cancelledAt: v.optional(v.number()),
    cancelReason: v.optional(v.string()),
    /** True once the points were given back, so a refund cannot run twice. */
    refunded: v.optional(v.boolean()),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_org_issued', ['organizationId', 'issuedAt'])
    .index('by_user', ['userId'])
    .index('by_org_user', ['organizationId', 'userId'])
    .index('by_code', ['organizationId', 'code'])
    .index('by_item', ['rewardItemId']),
};
