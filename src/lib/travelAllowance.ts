/**
 * Travel (transport) allowance — pure policy logic shared by the client and the
 * Convex backend.
 *
 * Whether a travel allowance is paid, and how much, is a *per-organization*
 * policy stored on `salarySettings.travelAllowance`. It must never be derived
 * from a constant or, worse, from the shape of an email address.
 *
 * The database-aware helpers (`getTravelAllowancePolicy`,
 * `resolveTravelAllowanceForOrg`) live in `convex/lib/travelAllowance.ts`, which
 * re-exports everything here.
 */

export interface TravelAllowancePolicy {
  enabled: boolean;
  staffAmount: number;
  contractorAmount: number;
}

export type TravelAllowanceEmployeeType = 'staff' | 'contractor';

/**
 * Default for organizations that have never configured a policy: no allowance.
 * Opt-in rather than opt-out — a new tenant must not silently inherit another
 * tenant's compensation rules.
 */
export const DEFAULT_TRAVEL_ALLOWANCE_POLICY: TravelAllowancePolicy = {
  enabled: false,
  staffAmount: 0,
  contractorAmount: 0,
};

/**
 * The amounts that were hardcoded before this became configurable. Used only by
 * the backfill migration so existing organizations keep their current behaviour.
 * Do not reference this from runtime write paths.
 */
export const LEGACY_TRAVEL_ALLOWANCE_POLICY: TravelAllowancePolicy = {
  enabled: true,
  staffAmount: 20000,
  contractorAmount: 12000,
};

/** Resolve the monthly allowance for an employee type. Returns 0 when disabled. */
export function resolveTravelAllowance(
  policy: TravelAllowancePolicy | undefined,
  employeeType: TravelAllowanceEmployeeType | undefined,
): number {
  if (!policy?.enabled) return 0;
  return employeeType === 'contractor' ? policy.contractorAmount : policy.staffAmount;
}

/**
 * Effective allowance for one employee.
 *
 * A per-employee `override` set by HR wins over the organization policy — including
 * when the policy is disabled, because an explicit per-person amount is a deliberate
 * decision about that person and not something the org-wide toggle should erase.
 * `undefined` means "follow the policy", which is what every employee does by default.
 */
export function resolveTravelAllowanceWithOverride(
  policy: TravelAllowancePolicy | undefined,
  employeeType: TravelAllowanceEmployeeType | undefined,
  override: number | undefined,
): number {
  if (override !== undefined) return override;
  return resolveTravelAllowance(policy, employeeType);
}

/** Reject a malformed per-employee override before it reaches the database. */
export function validateTravelAllowanceOverride(amount: number): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Travel allowance must be a non-negative number');
  }
}

/** Reject malformed policies before they reach the database. */
export function validateTravelAllowancePolicy(policy: TravelAllowancePolicy): void {
  for (const [label, amount] of [
    ['Staff', policy.staffAmount],
    ['Contractor', policy.contractorAmount],
  ] as const) {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(`${label} travel allowance must be a non-negative number`);
    }
  }
}
