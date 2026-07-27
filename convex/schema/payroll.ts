import { defineTable } from 'convex/server';
import { v } from 'convex/values';

// Supported tax jurisdictions. Widening this union is a safe, backward-compatible
// schema change (existing 'armenia'/'russia' rows keep validating). Keep in sync
// with CountryCode in convex/lib/taxRules.ts.
const TAX_COUNTRY = v.union(
  v.literal('armenia'),
  v.literal('russia'),
  v.literal('germany'),
  v.literal('uk'),
  v.literal('poland'),
  v.literal('usa'),
);

// One progressive income-tax bracket. `max` absent = open-ended top bracket.
const TAX_BRACKET = v.object({
  min: v.number(),
  max: v.optional(v.number()),
  rate: v.number(),
});

// One employee/employer contribution line. Mirrors Contribution in convex/lib/taxRules.ts.
const CONTRIBUTION = v.object({
  name: v.string(),
  rate: v.number(),
  cap: v.optional(v.number()),
  field: v.optional(
    v.union(
      v.literal('socialSecurity'),
      v.literal('healthInsurance'),
      v.literal('pension'),
      v.literal('other'),
    ),
  ),
});

// Org-editable override of a country rule. Every field optional; mirrors
// TaxRuleOverride in convex/lib/taxRules.ts. Exported for reuse in mutation args.
export const TAX_RULE_OVERRIDE = v.object({
  taxFreeAllowance: v.optional(v.number()),
  incomeTaxBrackets: v.optional(v.array(TAX_BRACKET)),
  employeeContributions: v.optional(v.array(CONTRIBUTION)),
  employerContributions: v.optional(v.array(CONTRIBUTION)),
});

export const payroll = {
  payrollRecords: defineTable({
    organizationId: v.optional(v.id('organizations')),
    userId: v.id('users'),
    payrollRunId: v.optional(v.id('payrollRuns')),
    period: v.string(),
    baseSalary: v.number(),
    grossSalary: v.number(),
    netSalary: v.number(),
    bonuses: v.optional(v.number()),
    overtimeHours: v.optional(v.number()),
    overtimePay: v.optional(v.number()),
    deductions: v.optional(
      v.object({
        incomeTax: v.number(),
        socialSecurity: v.number(),
        healthInsurance: v.optional(v.number()),
        pension: v.optional(v.number()),
        other: v.optional(v.number()),
        total: v.number(),
      }),
    ),
    employerContributions: v.optional(v.number()),
    totalCost: v.optional(v.number()),
    taxCountry: TAX_COUNTRY,
    currency: v.optional(v.string()),
    status: v.union(
      v.literal('draft'),
      v.literal('calculated'),
      v.literal('approved'),
      v.literal('paid'),
      v.literal('cancelled'),
    ),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_user', ['userId'])
    .index('by_org_period', ['organizationId', 'period'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_payroll_run', ['payrollRunId'])
    .index('by_user_period', ['userId', 'period']),

  payrollRuns: defineTable({
    organizationId: v.optional(v.id('organizations')),
    period: v.string(),
    status: v.union(
      v.literal('draft'),
      v.literal('calculated'),
      v.literal('approved'),
      v.literal('paid'),
      v.literal('cancelled'),
    ),
    totalGross: v.optional(v.number()),
    totalNet: v.optional(v.number()),
    totalDeductions: v.optional(v.number()),
    totalEmployerCost: v.optional(v.number()),
    employeeCount: v.optional(v.number()),
    skippedCount: v.optional(v.number()),
    approvedBy: v.optional(v.id('users')),
    approvedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_period', ['organizationId', 'period'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_period', ['period']),

  payslips: defineTable({
    organizationId: v.optional(v.id('organizations')),
    userId: v.id('users'),
    payrollRecordId: v.id('payrollRecords'),
    payrollRunId: v.id('payrollRuns'),
    period: v.string(),
    generatedAt: v.number(),
    sentAt: v.optional(v.number()),
    email: v.optional(v.string()),
    fileUrl: v.optional(v.string()),
    status: v.union(v.literal('generated'), v.literal('sent'), v.literal('viewed')),
  })
    .index('by_org', ['organizationId'])
    .index('by_user', ['userId'])
    .index('by_payroll_record', ['payrollRecordId'])
    .index('by_payroll_run', ['payrollRunId'])
    .index('by_user_period', ['userId', 'period']),

  salarySettings: defineTable({
    organizationId: v.id('organizations'),
    taxCountry: TAX_COUNTRY,
    taxRegion: v.optional(v.string()),
    payFrequency: v.union(v.literal('monthly'), v.literal('biweekly'), v.literal('weekly')),
    currency: v.optional(v.string()),
    minimumWage: v.optional(v.number()),
    maximumOvertime: v.optional(v.number()),
    // Org-editable override of the country's tax rates/brackets. Absent → country
    // defaults apply. Merged onto the base rule by applyTaxRuleOverride (taxRules.ts).
    taxRuleOverride: v.optional(TAX_RULE_OVERRIDE),
    emailNotifications: v.optional(v.boolean()),
    notifyOnCreate: v.optional(v.boolean()),
    notifyOnApprove: v.optional(v.boolean()),
    notifyOnPay: v.optional(v.boolean()),
    notifyEmployee: v.optional(v.boolean()),
    accountingSystem: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),
    bankName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_org', ['organizationId']),

  payrollAuditLog: defineTable({
    organizationId: v.optional(v.id('organizations')),
    userId: v.id('users'),
    action: v.union(
      v.literal('create_run'),
      v.literal('calculate'),
      v.literal('approve'),
      v.literal('pay'),
      v.literal('cancel'),
      v.literal('generate_payslip'),
      v.literal('send_payslip'),
      v.literal('update_record'),
      v.literal('delete_record'),
      v.literal('export'),
    ),
    payrollRunId: v.optional(v.id('payrollRuns')),
    payrollRecordId: v.optional(v.id('payrollRecords')),
    details: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_user', ['userId'])
    .index('by_payroll_run', ['payrollRunId'])
    .index('by_org_created', ['organizationId', 'createdAt']),
};
