/**
 * Merge-token resolver for HR document templates.
 *
 * Templates contain placeholders like `{{employee.fullName}}` or `{{today}}`.
 * This module resolves them against a normalized data object assembled from a
 * selected employee (user + employeeProfile) and their organization.
 *
 * Pure module — no React / Convex / DOM dependencies — so it can back the live
 * preview, the PDF exporter, and the DOCX exporter alike.
 */

import { formatCurrency } from './payrollUtils';
import { formatDate, type SupportedLocale } from './date-format';

/**
 * Raw inputs the resolver needs. Shapes mirror the Convex documents:
 * `users`, `employeeProfiles`, `organizations`. All employee/profile fields are
 * optional because they are sensitive PII that may not be filled in.
 */
export interface MergeSourceData {
  employee: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    department?: string | null;
    position?: string | null;
    location?: string | null;
    dateOfBirth?: string | null;
    nationality?: string | null;
    passportNumber?: string | null;
    passportIssuedBy?: string | null;
    passportIssueDate?: string | null;
    passportExpiryDate?: string | null;
    socialCardNumber?: string | null;
    baseSalary?: number | null;
    salaryCurrency?: string | null;
    /**
     * Employment start date as an absolute timestamp. Sourced from
     * `users.createdAt` (the wizard writes the chosen registration date there —
     * there is no separate `hireDate` column).
     */
    hireDate?: number | null;
  };
  organization: {
    name?: string | null;
    country?: string | null;
    industry?: string | null;
  };
  /** Person issuing / signing the document (usually the current admin). */
  signatory?: {
    name?: string | null;
    position?: string | null;
  };
  /** Leave request details, populated for leave-related documents. */
  leave?: {
    type?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    days?: number | null;
    reason?: string | null;
  };
  /** Absolute timestamp for `{{today}}` — pass Date.now() from the caller. */
  now: number;
}

/** A single resolvable token: its key and how to derive its display value. */
type TokenResolver = (data: MergeSourceData, lang: SupportedLocale) => string;

/**
 * When a value is missing, render a visible placeholder rather than an empty
 * string, so gaps in the document are obvious to whoever fills it in.
 */
const MISSING = '____________';

function text(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  return v.length > 0 ? v : MISSING;
}

/**
 * A passport/DOB date arrives as a free-form string (e.g. "2019-03-14").
 * Format it if it parses to a real date, otherwise pass it through verbatim.
 */
function dateString(value: string | null | undefined, lang: SupportedLocale): string {
  const raw = (value ?? '').trim();
  if (!raw) return MISSING;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return formatDate(parsed, lang, { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * The complete token dictionary. Adding a token here makes it available in every
 * template and every export path automatically.
 */
export const TOKEN_RESOLVERS: Record<string, TokenResolver> = {
  'employee.fullName': (d) => text(d.employee.name),
  'employee.email': (d) => text(d.employee.email),
  'employee.phone': (d) => text(d.employee.phone),
  'employee.department': (d) => text(d.employee.department),
  'employee.position': (d) => text(d.employee.position),
  'employee.location': (d) => text(d.employee.location),
  'employee.nationality': (d) => text(d.employee.nationality),
  'employee.dateOfBirth': (d, lang) => dateString(d.employee.dateOfBirth, lang),
  'employee.passportNumber': (d) => text(d.employee.passportNumber),
  'employee.passportIssuedBy': (d) => text(d.employee.passportIssuedBy),
  'employee.passportIssueDate': (d, lang) => dateString(d.employee.passportIssueDate, lang),
  'employee.passportExpiryDate': (d, lang) => dateString(d.employee.passportExpiryDate, lang),
  'employee.socialCardNumber': (d) => text(d.employee.socialCardNumber),
  'employee.salary': (d) =>
    typeof d.employee.baseSalary === 'number'
      ? formatCurrency(d.employee.baseSalary, d.employee.salaryCurrency ?? 'AMD')
      : MISSING,
  'employee.salaryCurrency': (d) => text(d.employee.salaryCurrency),
  'employee.hireDate': (d, lang) =>
    typeof d.employee.hireDate === 'number'
      ? formatDate(d.employee.hireDate, lang, { year: 'numeric', month: 'long', day: 'numeric' })
      : MISSING,

  'org.name': (d) => text(d.organization.name),
  'org.country': (d) => text(d.organization.country),
  'org.industry': (d) => text(d.organization.industry),

  'signatory.name': (d) => text(d.signatory?.name),
  'signatory.position': (d) => text(d.signatory?.position),

  'leave.type': (d) => text(d.leave?.type),
  'leave.startDate': (d, lang) => dateString(d.leave?.startDate, lang),
  'leave.endDate': (d, lang) => dateString(d.leave?.endDate, lang),
  'leave.days': (d) => (typeof d.leave?.days === 'number' ? String(d.leave.days) : MISSING),
  'leave.reason': (d) => text(d.leave?.reason),

  today: (d, lang) => formatDate(d.now, lang, { year: 'numeric', month: 'long', day: 'numeric' }),
};

/** Every token key available to template authors. */
export const AVAILABLE_TOKENS = Object.keys(TOKEN_RESOLVERS);

const TOKEN_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Replace every `{{token}}` in `content` with its resolved value for `lang`.
 * Unknown tokens are left untouched (wrapped in their braces) so typos surface
 * in the preview instead of silently vanishing.
 */
export function resolveTokens(
  content: string,
  data: MergeSourceData,
  lang: SupportedLocale = 'en',
): string {
  return content.replace(TOKEN_PATTERN, (match, key: string) => {
    const resolver = TOKEN_RESOLVERS[key];
    if (!resolver) return match;
    return resolver(data, lang);
  });
}

/**
 * List the distinct token keys referenced by a template body — used by the UI
 * to show which employee fields a given document depends on, and to flag
 * unknown tokens.
 */
export function extractTokens(content: string): { known: string[]; unknown: string[] } {
  const known = new Set<string>();
  const unknown = new Set<string>();
  for (const m of content.matchAll(TOKEN_PATTERN)) {
    const key = m[1];
    if (!key) continue;
    if (TOKEN_RESOLVERS[key]) known.add(key);
    else unknown.add(key);
  }
  return { known: [...known], unknown: [...unknown] };
}
