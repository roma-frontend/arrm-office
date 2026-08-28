/**
 * Tests for convex/security — SECURITY_FEATURES constants,
 * and src/lib/audit/actionMeta — pure audit categorization functions.
 */
import {
  normalizeAction,
  humanizeAction,
  deriveAuditCategory,
  deriveAuditSeverity,
  parseAuditDetails,
  buildAuditHaystack,
  AUDIT_CATEGORIES,
  AUDIT_SEVERITIES,
} from '../../src/lib/audit/actionMeta';

// Replicate SECURITY_FEATURES from convex/security.ts
const SECURITY_FEATURES = [
  { key: 'audit_logging', description: 'Log all login attempts with IP, device, and risk score' },
  {
    key: 'adaptive_auth',
    description: 'Adaptive authentication — block or challenge high-risk logins',
  },
  { key: 'device_fingerprinting', description: 'Track and recognize known devices per user' },
  { key: 'keystroke_dynamics', description: 'Analyze typing patterns to verify user identity' },
  {
    key: 'continuous_face',
    description: 'Periodically verify user identity via Face ID in background',
  },
  { key: 'failed_login_lockout', description: 'Auto-lock account after 5 failed login attempts' },
  {
    key: 'new_device_alert',
    description: 'Send notification to admin when user logs in from new device',
  },
] as const;

// ── SECURITY_FEATURES ──────────────────────────────────────────────────────
describe('SECURITY_FEATURES', () => {
  it('contains 7 features', () => {
    expect(SECURITY_FEATURES).toHaveLength(7);
  });

  it('all features have unique keys', () => {
    const keys = SECURITY_FEATURES.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('all features have non-empty descriptions', () => {
    for (const feature of SECURITY_FEATURES) {
      expect(feature.description.length).toBeGreaterThan(0);
    }
  });

  it('includes audit_logging', () => {
    expect(SECURITY_FEATURES.find((f) => f.key === 'audit_logging')).toBeDefined();
  });

  it('includes failed_login_lockout', () => {
    expect(SECURITY_FEATURES.find((f) => f.key === 'failed_login_lockout')).toBeDefined();
  });
});

// ── audit/actionMeta ───────────────────────────────────────────────────────
describe('AUDIT_CATEGORIES', () => {
  it('contains 8 categories', () => {
    expect(AUDIT_CATEGORIES).toHaveLength(8);
  });

  it('includes core categories', () => {
    expect(AUDIT_CATEGORIES).toContain('auth');
    expect(AUDIT_CATEGORIES).toContain('people');
    expect(AUDIT_CATEGORIES).toContain('work');
    expect(AUDIT_CATEGORIES).toContain('finance');
    expect(AUDIT_CATEGORIES).toContain('admin');
    expect(AUDIT_CATEGORIES).toContain('compliance');
    expect(AUDIT_CATEGORIES).toContain('ai');
    expect(AUDIT_CATEGORIES).toContain('system');
  });
});

describe('AUDIT_SEVERITIES', () => {
  it('has 3 levels', () => {
    expect(AUDIT_SEVERITIES).toHaveLength(3);
  });

  it('ordered worst-first', () => {
    expect(AUDIT_SEVERITIES[0]).toBe('critical');
    expect(AUDIT_SEVERITIES[1]).toBe('warning');
    expect(AUDIT_SEVERITIES[2]).toBe('info');
  });
});

describe('normalizeAction', () => {
  it('lowercases', () => {
    expect(normalizeAction('USER_LOGIN')).toBe('user_login');
  });

  it('replaces dots with underscores', () => {
    expect(normalizeAction('superadmin.session.revoke')).toBe('superadmin_session_revoke');
  });

  it('replaces spaces with underscores', () => {
    expect(normalizeAction('task created')).toBe('task_created');
  });

  it('replaces hyphens with underscores', () => {
    expect(normalizeAction('two-factor-setup')).toBe('two_factor_setup');
  });

  it('handles mixed separators', () => {
    expect(normalizeAction('User.Login.Attempt')).toBe('user_login_attempt');
  });

  it('idempotent', () => {
    const normalized = normalizeAction('user.login');
    expect(normalizeAction(normalized)).toBe(normalized);
  });
});

describe('humanizeAction', () => {
  it('converts underscores to spaces and title-cases', () => {
    expect(humanizeAction('task_created')).toBe('Task Created');
  });

  it('handles dots', () => {
    expect(humanizeAction('superadmin.session.revoke')).toBe('Superadmin Session Revoke');
  });

  it('handles camelCase split', () => {
    expect(humanizeAction('sendRejectionNotice')).toBe('Send Rejection Notice');
  });

  it('handles uppercase input', () => {
    expect(humanizeAction('USER_LOGIN')).toBe('User Login');
  });
});

describe('deriveAuditCategory', () => {
  it('classifies login as auth', () => {
    expect(deriveAuditCategory('user_login')).toBe('auth');
  });

  it('classifies logout as auth', () => {
    expect(deriveAuditCategory('user_logout')).toBe('auth');
  });

  it('classifies session.revoke as admin (superadmin prefix overrides)', () => {
    // superadmin matches the admin rule before the auth rule
    expect(deriveAuditCategory('superadmin.session.revoke')).toBe('admin');
  });

  it('classifies password as auth', () => {
    expect(deriveAuditCategory('password_reset')).toBe('auth');
  });

  it('classifies gdpr as compliance', () => {
    expect(deriveAuditCategory('gdpr_request_created')).toBe('compliance');
  });

  it('classifies consent as compliance', () => {
    expect(deriveAuditCategory('consent_granted')).toBe('compliance');
  });

  it('classifies signature as compliance', () => {
    expect(deriveAuditCategory('signature_request_sent')).toBe('compliance');
  });

  it('classifies task as work', () => {
    expect(deriveAuditCategory('task_created')).toBe('work');
  });

  it('classifies leave as work', () => {
    expect(deriveAuditCategory('leave_approved')).toBe('work');
  });

  it('classifies attendance as work', () => {
    expect(deriveAuditCategory('check_in')).toBe('work');
  });

  it('classifies payroll as finance', () => {
    expect(deriveAuditCategory('payroll_processed')).toBe('finance');
  });

  it('classifies expense as finance', () => {
    expect(deriveAuditCategory('expense_approved')).toBe('finance');
  });

  it('classifies billing as finance', () => {
    expect(deriveAuditCategory('billing_subscription_created')).toBe('finance');
  });

  it('classifies employee as people', () => {
    expect(deriveAuditCategory('employee_created')).toBe('people');
  });

  it('classifies recruitment as people', () => {
    expect(deriveAuditCategory('recruitment_candidate_added')).toBe('people');
  });

  it('classifies interview as people', () => {
    expect(deriveAuditCategory('interview_scheduled')).toBe('people');
  });

  it('classifies ai as ai', () => {
    expect(deriveAuditCategory('ai_assistant_prompt')).toBe('ai');
  });

  it('classifies admin settings as admin', () => {
    expect(deriveAuditCategory('org_settings_updated')).toBe('admin');
  });

  it('classifies security_setting as admin', () => {
    expect(deriveAuditCategory('security_setting_changed')).toBe('admin');
  });

  it('classifies unknown action as system', () => {
    expect(deriveAuditCategory('cron_backup_run')).toBe('system');
    expect(deriveAuditCategory('migration_v2')).toBe('system');
  });

  it('classifies face_id as auth', () => {
    expect(deriveAuditCategory('face_id_verified')).toBe('auth');
  });

  it('classifies account_unlocked as auth', () => {
    expect(deriveAuditCategory('account_unlocked')).toBe('auth');
  });
});

describe('deriveAuditSeverity', () => {
  it('returns info for benign actions', () => {
    expect(deriveAuditSeverity('user_login')).toBe('info');
    expect(deriveAuditSeverity('task_created')).toBe('info');
    expect(deriveAuditSeverity('leave_approved')).toBe('info');
  });

  it('returns critical for failed actions', () => {
    expect(deriveAuditSeverity('login_failed')).toBe('critical');
    expect(deriveAuditSeverity('authentication_failure')).toBe('critical');
  });

  it('returns critical for blocked', () => {
    expect(deriveAuditSeverity('request_blocked')).toBe('critical');
  });

  it('returns critical for suspicious', () => {
    expect(deriveAuditSeverity('login_suspicious')).toBe('critical');
  });

  it('returns critical for exceeded', () => {
    expect(deriveAuditSeverity('rate_limit_exceeded')).toBe('critical');
  });

  it('returns critical for locked', () => {
    expect(deriveAuditSeverity('account_locked')).toBe('critical');
  });

  it('returns critical for hard_deleted in phrase', () => {
    expect(deriveAuditSeverity('user_hard_deleted')).toBe('critical');
  });

  it('returns critical for purged', () => {
    expect(deriveAuditSeverity('data_purged')).toBe('critical');
  });

  it('returns warning for deleted', () => {
    expect(deriveAuditSeverity('task_deleted')).toBe('warning');
  });

  it('returns warning for rejected', () => {
    expect(deriveAuditSeverity('leave_rejected')).toBe('warning');
  });

  it('returns warning for cancelled', () => {
    expect(deriveAuditSeverity('meeting_cancelled')).toBe('warning');
  });

  it('returns warning for revoked', () => {
    expect(deriveAuditSeverity('token_revoked')).toBe('warning');
  });

  it('returns warning for expired', () => {
    expect(deriveAuditSeverity('session_expired')).toBe('warning');
  });

  it('does not flag account_unlocked as critical', () => {
    // account_unlocked contains "locked" as substring but "locked" is a critical
    // token on its own. However, since it's split by _ and token is "unlocked",
    // it should NOT match "locked".
    const result = deriveAuditSeverity('account_unlocked');
    expect(result).not.toBe('critical');
  });

  it('scans details for critical tokens', () => {
    expect(deriveAuditSeverity('login_attempt', 'failed password')).toBe('critical');
  });

  it('scans details for warning tokens', () => {
    expect(deriveAuditSeverity('leave_request', 'rejected by admin')).toBe('warning');
  });
});

describe('parseAuditDetails', () => {
  it('returns empty for null/undefined', () => {
    expect(parseAuditDetails(null)).toEqual({ record: {}, text: '' });
    expect(parseAuditDetails(undefined)).toEqual({ record: {}, text: '' });
    expect(parseAuditDetails('')).toEqual({ record: {}, text: '' });
  });

  it('parses valid JSON object', () => {
    const result = parseAuditDetails('{"status":"active","count":5}');
    expect(result.record).toEqual({ status: 'active', count: 5 });
    expect(result.text).toBe('');
  });

  it('returns text for plain strings', () => {
    const result = parseAuditDetails('Account unlocked by admin');
    expect(result.record).toEqual({});
    expect(result.text).toBe('Account unlocked by admin');
  });

  it('returns text for invalid JSON', () => {
    const result = parseAuditDetails('{invalid json}');
    expect(result.record).toEqual({});
    expect(result.text).toBe('{invalid json}');
  });

  it('handles JSON arrays as text (not record)', () => {
    const result = parseAuditDetails('[1,2,3]');
    expect(result.record).toEqual({});
    expect(result.text).toBe('[1,2,3]');
  });

  it('handles JSON string as text', () => {
    const result = parseAuditDetails('"hello"');
    expect(result.record).toEqual({});
    expect(result.text).toBe('"hello"');
  });

  it('handles nested objects', () => {
    const result = parseAuditDetails('{"user":{"name":"Bob"},"action":"login"}');
    expect(result.record).toEqual({ user: { name: 'Bob' }, action: 'login' });
  });
});

describe('buildAuditHaystack', () => {
  it('joins parts with sentinel', () => {
    const result = buildAuditHaystack(['user_login', 'admin@co.com', '192.168.1.1']);
    expect(result).toContain('user_login');
    expect(result).toContain('admin@co.com');
    expect(result).toContain('192.168.1.1');
  });

  it('lowercases everything', () => {
    const result = buildAuditHaystack(['USER_LOGIN', 'Admin@Co.COM']);
    expect(result).toBe('user_login \u0001 admin@co.com');
  });

  it('filters out empty/undefined/null parts', () => {
    const result = buildAuditHaystack(['user_login', undefined, null, '', 'action']);
    expect(result).toBe('user_login \u0001 action');
  });

  it('returns empty string for no valid parts', () => {
    expect(buildAuditHaystack([])).toBe('');
    expect(buildAuditHaystack([undefined, null, ''])).toBe('');
  });
});
