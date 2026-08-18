/**
 * Billing defaults — the out-of-the-box Starter/Pro/Enterprise matrix.
 *
 * Shared by:
 *   - the seed mutation (writes them into Convex),
 *   - the entitlements engine (code-level fallback when no billing tables
 *     exist yet — keeps enforcement working from day one without a seed).
 *
 * IMPORTANT: enforcement uses these defaults ONLY when the billing catalog has
 * never been seeded. Once the superadmin publishes plans, the published
 * snapshots are the single source of truth.
 */

export type PlanKey = 'starter' | 'pro' | 'enterprise';

/** Legacy subscription/organization plan → billing plan key. */
export function mapLegacyPlan(plan: string | null | undefined): PlanKey | undefined {
  switch (plan) {
    case 'starter':
      return 'starter';
    case 'professional':
      return 'pro';
    case 'enterprise':
      return 'enterprise';
    default:
      return undefined;
  }
}

export interface DefaultPlanDef {
  key: PlanKey;
  name: string;
  tagline: string;
  priceMonthly?: number;
  priceYearly?: number;
  currency: string;
  isPopular: boolean;
  isCustom: boolean;
  ctaLabel: string;
  sortOrder: number;
}

export const DEFAULT_PLANS: DefaultPlanDef[] = [
  {
    key: 'starter',
    name: 'Starter',
    tagline: 'For small teams getting organized',
    priceMonthly: 29,
    priceYearly: 23,
    currency: 'USD',
    isPopular: false,
    isCustom: false,
    ctaLabel: 'Start free trial',
    sortOrder: 1,
  },
  {
    key: 'pro',
    name: 'Pro',
    tagline: 'For growing companies that need the full toolkit',
    priceMonthly: 79,
    priceYearly: 63,
    currency: 'USD',
    isPopular: true,
    isCustom: false,
    ctaLabel: 'Start free trial',
    sortOrder: 2,
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    tagline: 'Custom solutions with dedicated support and SLA',
    priceMonthly: undefined,
    priceYearly: undefined,
    currency: 'USD',
    isPopular: false,
    isCustom: true,
    ctaLabel: 'Contact sales',
    sortOrder: 3,
  },
];

export interface DefaultEntitlement {
  included: boolean;
  limits?: Record<string, number | boolean>;
  overLimit?: 'block' | 'warn' | 'allow';
}

type EntitlementMap = Record<string, DefaultEntitlement>;

export const DEFAULT_ENTITLEMENTS: Record<PlanKey, EntitlementMap> = {
  starter: {
    dashboard: { included: true },
    profile: { included: true },
    employees: { included: true, limits: { seats: 10 }, overLimit: 'block' },
    departments: { included: true },
    positions: { included: true },
    orgchart: { included: true },
    attendance: { included: true, limits: { faceKiosks: 1, biometric: true }, overLimit: 'block' },
    timeTracking: { included: true },
    leaves: { included: true, limits: { leaveTypes: 5 }, overLimit: 'block' },
    calendar: { included: true },
    chat: { included: true, limits: { channels: 10 }, overLimit: 'block' },
    tasks: { included: true, limits: { projects: 5 }, overLimit: 'block' },
    news: { included: true },
    documents: { included: true, limits: { documents: 100, storageGB: 5 }, overLimit: 'block' },
    signatures: { included: true, limits: { envelopes: 10 }, overLimit: 'block' },
  },
  pro: {
    dashboard: { included: true },
    profile: { included: true },
    employees: { included: true, limits: { seats: 50 }, overLimit: 'block' },
    departments: { included: true },
    positions: { included: true },
    orgchart: { included: true },
    drivers: { included: true, limits: { drivers: 10 }, overLimit: 'block' },
    probation: { included: true },
    attendance: { included: true, limits: { faceKiosks: 3, biometric: true }, overLimit: 'block' },
    timeTracking: { included: true },
    leaves: { included: true, limits: { leaveTypes: 10 }, overLimit: 'block' },
    calendar: { included: true },
    meetingRooms: { included: true, limits: { rooms: 10 }, overLimit: 'block' },
    videoConferences: {
      included: true,
      limits: { rooms: 10, recording: true, webinars: false },
      overLimit: 'block',
    },
    productivity: { included: true },
    performance: { included: true },
    reviews: { included: true },
    goals: { included: true },
    recognition: { included: true },
    rewards: { included: true },
    surveys: { included: true },
    recruitment: { included: true, limits: { openRoles: 10 }, overLimit: 'block' },
    onboarding: { included: true },
    offboarding: { included: true },
    learning: { included: true },
    hiringPackets: { included: true },
    payroll: { included: true, limits: { runs: 12 }, overLimit: 'block' },
    compensation: { included: true },
    expenses: { included: true, limits: { reports: 50 }, overLimit: 'block' },
    assets: { included: true },
    reports: { included: true },
    analytics: { included: true },
    chat: { included: true, limits: { channels: 50 }, overLimit: 'block' },
    news: { included: true },
    approvals: { included: true },
    newsletter: { included: true },
    documents: { included: true, limits: { documents: 1000, storageGB: 50 }, overLimit: 'block' },
    signatures: { included: true, limits: { envelopes: 100 }, overLimit: 'block' },
    documentBuilder: { included: true },
    backups: { included: true, limits: { retentionDays: 30 }, overLimit: 'block' },
    integrations: { included: true },
    automation: { included: true },
    tasks: { included: true, limits: { projects: 50 }, overLimit: 'block' },
    aiAssistant: { included: true, limits: { queries: 500 }, overLimit: 'block' },
    aiSiteEditor: { included: true },
    securityCenter: { included: true },
    compliance: { included: true },
  },
  enterprise: {
    dashboard: { included: true },
    profile: { included: true },
    employees: { included: true, limits: { seats: 999999 }, overLimit: 'block' },
    departments: { included: true },
    positions: { included: true },
    orgchart: { included: true },
    drivers: { included: true, limits: { drivers: 999 }, overLimit: 'block' },
    probation: { included: true },
    attendance: { included: true, limits: { faceKiosks: 99, biometric: true }, overLimit: 'block' },
    timeTracking: { included: true },
    leaves: { included: true, limits: { leaveTypes: 50 }, overLimit: 'block' },
    calendar: { included: true },
    meetingRooms: { included: true, limits: { rooms: 999 }, overLimit: 'block' },
    videoConferences: {
      included: true,
      limits: { rooms: 999, recording: true, webinars: true },
      overLimit: 'block',
    },
    productivity: { included: true },
    performance: { included: true },
    reviews: { included: true },
    goals: { included: true },
    recognition: { included: true },
    rewards: { included: true },
    surveys: { included: true },
    recruitment: { included: true, limits: { openRoles: 999 }, overLimit: 'block' },
    onboarding: { included: true },
    offboarding: { included: true },
    learning: { included: true },
    hiringPackets: { included: true },
    payroll: { included: true, limits: { runs: 999 }, overLimit: 'block' },
    compensation: { included: true },
    expenses: { included: true, limits: { reports: 999 }, overLimit: 'block' },
    assets: { included: true },
    reports: { included: true },
    analytics: { included: true },
    chat: { included: true, limits: { channels: 999 }, overLimit: 'block' },
    news: { included: true },
    approvals: { included: true },
    newsletter: { included: true },
    supportTickets: { included: true },
    documents: { included: true, limits: { documents: 99999, storageGB: 999 }, overLimit: 'block' },
    signatures: { included: true, limits: { envelopes: 999 }, overLimit: 'block' },
    documentBuilder: { included: true },
    backups: { included: true, limits: { retentionDays: 365 }, overLimit: 'block' },
    integrations: { included: true },
    automation: { included: true },
    tasks: { included: true, limits: { projects: 999 }, overLimit: 'block' },
    aiAssistant: { included: true, limits: { queries: 99999 }, overLimit: 'block' },
    aiSiteEditor: { included: true },
    securityCenter: { included: true },
    compliance: { included: true },
    // Coming modules are configurable today; enforcement unlocks them on release.
    aiMeetingAgent: { included: true, limits: { hours: 100 }, overLimit: 'block' },
    breakoutRooms: { included: true },
    guestAccess: { included: true, limits: { guests: 50 }, overLimit: 'block' },
    mobileApp: { included: true },
    apiAccess: { included: true, limits: { apiCalls: 100000 }, overLimit: 'block' },
  },
};

/** Build the effective entitlements from the code-level defaults. */
export function buildDefaultEntitlements(planKey: PlanKey): Record<
  string,
  {
    included: boolean;
    limits?: Record<string, number | boolean>;
    overLimit: 'block' | 'warn' | 'allow';
  }
> {
  const matrix = DEFAULT_ENTITLEMENTS[planKey] ?? {};
  const out: Record<
    string,
    {
      included: boolean;
      limits?: Record<string, number | boolean>;
      overLimit: 'block' | 'warn' | 'allow';
    }
  > = {};
  for (const [key, ent] of Object.entries(matrix)) {
    out[key] = {
      included: ent.included,
      limits: ent.limits,
      overLimit: ent.overLimit ?? 'block',
    };
  }
  return out;
}

export function defaultPlanName(planKey: PlanKey): string {
  return DEFAULT_PLANS.find((p) => p.key === planKey)?.name ?? planKey;
}
