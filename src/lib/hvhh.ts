/**
 * Armenian tax identification number (ՀՎՀՀ / TIN / social card number) — local validation.
 *
 * The number is 8 digits. The 8th digit is a check digit computed from the first
 * seven. This module provides a *local, best-effort* validation that always works
 * offline. It is deliberately NON-blocking: an authoritative taxpayer-status check
 * requires the SRC (ԿԳԴ) e-services API, which needs credentials issued on request.
 * See src/app/api/taxid/verify/route.ts for the server-side SRC call.
 *
 * ⚠️ Checksum heuristic: the check digit is commonly computed with weights
 * 2, 4, 8, 16, 32, 64, 128 (powers of two) over the first seven digits, mod 11.
 * The official SRC algorithm may differ in edge cases (remainder 10) — treat the
 * checksum as a first-pass signal, never as the final word on validity.
 */

export interface TaxIdValidation {
  /** Normalized number (digits only). */
  tin: string;
  /** Exactly 8 digits. */
  formatValid: boolean;
  /** Passed the documented checksum heuristic (only meaningful when formatValid). */
  checksumValid: boolean;
  /** Overall local verdict — false when either check fails. */
  valid: boolean;
  errors: string[];
}

/** Strip spaces, dashes and other separators; keep digits only. */
export function normalizeTaxId(input: string): string {
  return (input ?? '').replace(/\D/g, '');
}

/** Armenian TIN is exactly 8 digits. */
export function isValidTaxIdFormat(tin: string): boolean {
  return /^\d{8}$/.test(tin);
}

/**
 * Check-digit heuristic: first seven digits × weights [2,4,8,16,32,64,128],
 * sum mod 11 must equal the 8th digit. A remainder of 10 cannot match a digit
 * and is therefore treated as invalid by this heuristic.
 */
export function isValidTaxIdChecksum(tin: string): boolean {
  if (!isValidTaxIdFormat(tin)) return false;
  const weights = [2, 4, 8, 16, 32, 64, 128];
  let sum = 0;
  for (let i = 0; i < 7; i += 1) {
    sum += Number(tin[i] ?? '') * (weights[i] ?? 0);
  }
  const remainder = sum % 11;
  if (remainder === 10) return false;
  return remainder === Number(tin[7]);
}

/** Full local validation of a raw input. */
export function validateTaxId(input: string): TaxIdValidation {
  const tin = normalizeTaxId(input);
  if (!tin) {
    return { tin, formatValid: false, checksumValid: false, valid: false, errors: ['empty'] };
  }
  if (!isValidTaxIdFormat(tin)) {
    return {
      tin,
      formatValid: false,
      checksumValid: false,
      valid: false,
      errors: ['format'],
    };
  }
  const checksumValid = isValidTaxIdChecksum(tin);
  return {
    tin,
    formatValid: true,
    checksumValid,
    valid: checksumValid,
    errors: checksumValid ? [] : ['checksum'],
  };
}

/** Mask a TIN for logs/UI: show first 2 and last 2 digits only. */
export function maskTaxId(tin: string): string {
  const n = normalizeTaxId(tin);
  if (n.length <= 4) return '••••';
  return `${n.slice(0, 2)}••••${n.slice(-2)}`;
}
