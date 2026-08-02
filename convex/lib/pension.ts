/**
 * Armenia funded-pension exemption.
 *
 * The mandatory funded pension (կուտակային կենսաթոշակ) applies to employees born
 * on/after 1 Jan 1974. Those born before 1974 are exempt. This module resolves the
 * exemption from the fields available on an employee's profile, with an explicit
 * manual override taking precedence.
 */

export interface PensionExemptionSource {
  /** Explicit manual override (highest priority). true = exempt. */
  pensionExempt?: boolean;
  /** Birth year (e.g. 1970). Lower priority than the explicit flag. */
  birthYear?: number;
  /** ISO date string yyyy-mm-dd (e.g. '1970-05-15'). Lowest priority. */
  dateOfBirth?: string;
}

/**
 * Resolve whether an employee is exempt from the funded pension.
 *
 * Priority: explicit `pensionExempt` flag > `birthYear` > `dateOfBirth`.
 * When nothing is known the employee is NOT exempt (conservative — pension keeps
 * being withheld, matching the pre-exemption behaviour).
 */
export function resolvePensionExemption(src: PensionExemptionSource): boolean {
  if (src.pensionExempt !== undefined) return src.pensionExempt;
  if (src.birthYear !== undefined && Number.isFinite(src.birthYear)) {
    return src.birthYear < 1974;
  }
  if (src.dateOfBirth) {
    const year = Number(src.dateOfBirth.slice(0, 4));
    if (Number.isFinite(year)) return year < 1974;
  }
  return false;
}
