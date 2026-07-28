import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const leaveSettings = {
  // ── Leave Type Configurations per Organization ────────────────────────────
  // Each org can configure which leave types are active, default days per year,
  // and the approval workflow (which roles must approve in order).
  leaveTypeConfigs: defineTable({
    organizationId: v.optional(v.id('organizations')),
    type: v.union(
      v.literal('paid'),
      v.literal('unpaid'),
      v.literal('sick'),
      v.literal('family'),
      v.literal('doctor'),
      v.literal('day_off'),
      v.literal('maternity'),
      v.literal('paternity'),
      v.literal('study'),
    ),
    isActive: v.boolean(),
    defaultDaysPerYear: v.number(),
    requiresDocumentation: v.boolean(),
    // Approval workflow: ordered list of roles that must approve
    // e.g. ["supervisor", "hr", "ceo"]
    approvalChain: v.array(v.string()),
    // Whether individual employee balances can be edited
    balanceEditable: v.boolean(),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_type', ['organizationId', 'type']),

  // ── Holidays (Public + Internal) per Organization ─────────────────────────
  holidays: defineTable({
    organizationId: v.optional(v.id('organizations')),
    name: v.string(),
    date: v.string(), // ISO date string (YYYY-MM-DD)
    type: v.union(
      v.literal('public'), // Government/public holiday
      v.literal('internal'), // Company-specific non-working day
    ),
    isRecurring: v.boolean(), // Whether it repeats yearly
    description: v.optional(v.string()),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_date', ['organizationId', 'date'])
    .index('by_date', ['date']),
};
