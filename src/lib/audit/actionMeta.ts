/**
 * What an audit action *means* — category, severity, readable label.
 *
 * Audit rows are written by ~40 different Convex modules and the action string
 * is the only thing they all agree on. Two naming families are in the table:
 * dotted (`user.login`, `superadmin.session.revoke`) and snake
 * (`task_created`, `generate_superadmin_token`), so every rule here works on a
 * normalized form rather than on the raw string.
 *
 * This module is deliberately pure TypeScript with no React, no i18next and no
 * DOM: `convex/security.ts` imports it so the server filters by exactly the
 * category and severity the client displays. Deriving them twice is how the
 * compliance widget and the dashboard feed drifted apart in the first place.
 */

export const AUDIT_CATEGORIES = [
  'auth',
  'people',
  'work',
  'finance',
  'admin',
  'compliance',
  'ai',
  'system',
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

/** Ordered worst-first: the UI uses this for sorting and for legend order. */
export const AUDIT_SEVERITIES = ['critical', 'warning', 'info'] as const;

export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

/** `Superadmin.Session.Revoke` and `superadmin_session_revoke` are one action. */
export function normalizeAction(action: string): string {
  return action.toLowerCase().replace(/[.\s-]+/g, '_');
}

/**
 * `GENERATE_SUPERADMIN_TOKEN` → "Generate superadmin token".
 * Used as the label of last resort when an action has no translation yet —
 * a humanized string beats showing the raw key on screen.
 */
export function humanizeAction(action: string): string {
  return action
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * First match wins, so the order encodes the exceptions:
 *   • `user_login` is authentication, not a people change,
 *   • `leave_type_config_updated` is a settings change, not a leave request,
 *   • `policy_*` / `consent_*` are compliance even though an admin performs them.
 */
const CATEGORY_RULES: readonly (readonly [AuditCategory, RegExp])[] = [
  [
    'compliance',
    /^(gdpr|consent|policy|policies|retention|dsr|dpa|data_access|data_export|sign_|signature|signed_)/,
  ],
  [
    'auth',
    /^(auth|login|logout|signin|signout|sign_in|sign_out|session|password|totp|mfa|two_factor|otp|magic|webauthn|passkey|face|account_unlocked|impersonate|end_impersonation|verification|verify)/,
  ],
  ['auth', /(_login|_logout|webauthn|face_id)/],
  ['ai', /^(ai|llm|kpi|assistant|agent|copilot|prompt|embedding|site_editor)/],
  [
    'finance',
    /^(payroll|expense|compensation|salary|bonus|billing|subscription|invoice|payment|stripe|asset|reward|settlement|budget|plan_|price)/,
  ],
  ['admin', /^(leave_type|leave_balance|leave_settings|overtime_settings|holiday|shift_template)/],
  [
    'people',
    /^(employee|user|profile|avatar|presence|status_set|department|position|onboarding|offboarding|probation|join_request|org_request|recruitment|candidate|applicant|interview|vacancy|team|orgchart|org_unit|supervisor|note)/,
  ],
  [
    'work',
    /^(task|project|leave|attendance|check_in|check_out|overtime|goal|objective|okr|driver|event|chat|messenger|message|meeting|room|document|doc_|issued|news|announcement|survey|ticket|recognition|badge|learning|course|calendar|timesheet|time_tracking|recurring|strategy|review|performance|conflict)/,
  ],
  [
    'admin',
    /^(admin|org|organization|settings|setting|security_setting|integration|branding|feature_toggle|feature|role|permission|access|token|superadmin|generate_superadmin|revoke_superadmin|invite|bulk|import|migration_run|seat|module)/,
  ],
];

/** Everything unmatched is `system` — crons, backups, automation, migrations. */
export function deriveAuditCategory(action: string): AuditCategory {
  const normalized = normalizeAction(action);
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(normalized)) return category;
  }
  return 'system';
}

/**
 * Severity is matched on whole tokens, not substrings: `account_unlocked`
 * contains "locked" and `face_id_unblocked` contains "blocked", and both are
 * good news. Splitting on `_` first keeps those out of the critical bucket.
 */
const CRITICAL_TOKENS = new Set([
  'failed',
  'failure',
  'fail',
  'blocked',
  'suspicious',
  'exceeded',
  'breach',
  'attack',
  'error',
  'compromised',
  'locked',
  'suspended',
  'frozen',
]);

const WARNING_TOKENS = new Set([
  'warn',
  'warning',
  'deleted',
  'removed',
  'rejected',
  'denied',
  'declined',
  'expired',
  'limited',
  'cancelled',
  'canceled',
  'revoked',
  'downgraded',
  'unapproved',
  'overridden',
  'reset',
]);

/** Irreversible variants outrank the plain form (`deleted` is only a warning). */
const CRITICAL_PHRASES = ['hard_deleted', 'force_deleted', 'purged', 'wiped'];

export function deriveAuditSeverity(action: string, details?: string): AuditSeverity {
  const normalized = normalizeAction(action);
  if (CRITICAL_PHRASES.some((phrase) => normalized.includes(phrase))) return 'critical';

  // Details are scanned too: `logLoginAttempt` writes the outcome into the text
  // rather than into the action name.
  const tokens = normalizeAction(`${action} ${details ?? ''}`).split(/[^a-z0-9]+/);
  if (tokens.some((token) => CRITICAL_TOKENS.has(token))) return 'critical';
  if (tokens.some((token) => WARNING_TOKENS.has(token))) return 'warning';
  return 'info';
}

export interface ParsedAuditDetails {
  /** Object payloads, e.g. `{"updatedFields":["status"]}`. Empty for text. */
  record: Record<string, unknown>;
  /** Plain-text payloads, e.g. `Account of Ann unlocked by Bob`. */
  text: string;
}

/**
 * `details` is a free-form string column: most writers put JSON in it, a few
 * put a sentence, and a couple put invalid JSON. All three have to render, so
 * parsing never throws — it just tells the caller which of the two it got.
 */
export function parseAuditDetails(details?: string | null): ParsedAuditDetails {
  const raw = details?.trim();
  if (!raw) return { record: {}, text: '' };
  if (!raw.startsWith('{') && !raw.startsWith('[')) return { record: {}, text: raw };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { record: parsed as Record<string, unknown>, text: '' };
    }
    if (typeof parsed === 'string') return { record: {}, text: parsed };
    return { record: {}, text: raw };
  } catch {
    return { record: {}, text: raw };
  }
}

/**
 * Lower-cased blob a free-text search runs against. Built on the server so the
 * search narrows the whole log rather than only the page already loaded.
 */
export function buildAuditHaystack(parts: readonly (string | undefined | null)[]): string {
  return parts
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('  ')
    .toLowerCase();
}
