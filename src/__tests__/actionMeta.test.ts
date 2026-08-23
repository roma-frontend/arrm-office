/**
 * Tests for `@/lib/audit/actionMeta` — audit action classification.
 */
import { describe, it, expect } from '@jest/globals';
import {
  AUDIT_CATEGORIES,
  AUDIT_SEVERITIES,
  normalizeAction,
  humanizeAction,
  deriveAuditCategory,
  deriveAuditSeverity,
  parseAuditDetails,
  buildAuditHaystack,
} from '@/lib/audit/actionMeta';

describe('AUDIT_CATEGORIES', () => {
  it('has 8 categories', () => {
    expect(AUDIT_CATEGORIES).toHaveLength(8);
  });
});

describe('AUDIT_SEVERITIES', () => {
  it('is ordered worst-first', () => {
    expect(AUDIT_SEVERITIES).toEqual(['critical', 'warning', 'info']);
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
    expect(normalizeAction('leave approved')).toBe('leave_approved');
  });

  it('replaces hyphens with underscores', () => {
    expect(normalizeAction('user-login')).toBe('user_login');
  });
});

describe('humanizeAction', () => {
  it('converts snake_case to Title Case', () => {
    expect(humanizeAction('task_created')).toBe('Task Created');
  });

  it('converts dotted notation', () => {
    expect(humanizeAction('user.login')).toBe('User Login');
  });

  it('handles camelCase', () => {
    expect(humanizeAction('generateSuperadminToken')).toBe('Generate Superadmin Token');
  });

  it('trims whitespace', () => {
    expect(humanizeAction('  some_action  ')).toBe('Some Action');
  });
});

describe('deriveAuditCategory', () => {
  it('classifies login as auth', () => {
    expect(deriveAuditCategory('user_login')).toBe('auth');
  });

  it('classifies leave as work', () => {
    expect(deriveAuditCategory('leave_approved')).toBe('work');
  });

  it('classifies payroll as finance', () => {
    expect(deriveAuditCategory('payroll_processed')).toBe('finance');
  });

  it('classifies employee as people', () => {
    expect(deriveAuditCategory('employee_created')).toBe('people');
  });

  it('classifies gdpr as compliance', () => {
    expect(deriveAuditCategory('gdpr_data_export')).toBe('compliance');
  });

  it('classifies ai_ prefixed as ai', () => {
    expect(deriveAuditCategory('ai_prompt_sent')).toBe('ai');
  });

  it('classifies settings as admin', () => {
    expect(deriveAuditCategory('settings_updated')).toBe('admin');
  });

  it('falls back to system for unrecognized', () => {
    expect(deriveAuditCategory('some_unknown_action')).toBe('system');
  });

  it('classifies superadmin as admin', () => {
    expect(deriveAuditCategory('superadmin_session_revoke')).toBe('admin');
  });
});

describe('deriveAuditSeverity', () => {
  it('returns critical for failed actions', () => {
    expect(deriveAuditSeverity('login_failed')).toBe('critical');
  });

  it('returns critical for hardcoded critical phrases', () => {
    expect(deriveAuditSeverity('user_hard_deleted')).toBe('critical');
  });

  it('returns critical from details containing blocked', () => {
    expect(deriveAuditSeverity('access_check', 'account blocked')).toBe('critical');
  });

  it('returns warning for deleted', () => {
    expect(deriveAuditSeverity('task_deleted')).toBe('warning');
  });

  it('returns warning for revoked', () => {
    expect(deriveAuditSeverity('session_revoked')).toBe('warning');
  });

  it('returns info for normal actions', () => {
    expect(deriveAuditSeverity('task_created')).toBe('info');
  });

  it('returns info for leave_approved', () => {
    expect(deriveAuditSeverity('leave_approved')).toBe('info');
  });
});

describe('parseAuditDetails', () => {
  it('parses valid JSON object', () => {
    const result = parseAuditDetails('{"status":"active"}');
    expect(result.record).toEqual({ status: 'active' });
    expect(result.text).toBe('');
  });

  it('returns text for plain string', () => {
    const result = parseAuditDetails('Account unlocked by Bob');
    expect(result.record).toEqual({});
    expect(result.text).toBe('Account unlocked by Bob');
  });

  it('returns empty for undefined', () => {
    expect(parseAuditDetails(undefined)).toEqual({ record: {}, text: '' });
  });

  it('returns empty for null', () => {
    expect(parseAuditDetails(null)).toEqual({ record: {}, text: '' });
  });

  it('returns empty for empty string', () => {
    expect(parseAuditDetails('')).toEqual({ record: {}, text: '' });
  });

  it('handles invalid JSON gracefully', () => {
    const result = parseAuditDetails('{broken json');
    expect(result.record).toEqual({});
    expect(result.text).toBe('{broken json');
  });

  it('returns text for JSON array (not object)', () => {
    const result = parseAuditDetails('[1,2,3]');
    expect(result.record).toEqual({});
    expect(result.text).toBe('[1,2,3]');
  });

  it('returns text for JSON string', () => {
    const result = parseAuditDetails('"just a string"');
    expect(result.record).toEqual({});
    expect(result.text).toBe('"just a string"');
  });
});

describe('buildAuditHaystack', () => {
  it('joins parts with null separator', () => {
    const result = buildAuditHaystack(['alice', 'bob']);
    expect(result).toContain('alice');
    expect(result).toContain('bob');
    expect(result).toContain('\x01');
  });

  it('filters out undefined/null', () => {
    const result = buildAuditHaystack(['alice', undefined, null, 'bob']);
    expect(result).toContain('alice');
    expect(result).toContain('bob');
  });

  it('filters out empty strings', () => {
    const result = buildAuditHaystack(['', 'alice', '']);
    expect(result).toBe('alice');
  });

  it('lowercases', () => {
    const result = buildAuditHaystack(['ALICE']);
    expect(result).toBe('alice');
  });

  it('returns empty for empty input', () => {
    expect(buildAuditHaystack([])).toBe('');
  });
});
