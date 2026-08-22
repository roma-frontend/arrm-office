/**
 * Tests for `@/lib/audit/auditExport` and `@/lib/audit/actionMeta`.
 *
 * An audit export is evidence, so the tests here are about the properties an
 * auditor relies on: the filters that produced the file are written into it, a
 * hostile task title cannot become an Excel formula, non-Latin names survive the
 * round trip, and the raw action key stays next to its translated label.
 *
 * `actionMeta` is covered in the same file because the export carries the
 * category and severity it derives — the server filters on exactly these
 * functions, so a change in their rules changes what a filtered export contains.
 */

import { describe, it, expect } from '@jest/globals';
import {
  auditExportFilename,
  auditRowsToCsv,
  auditRowsToJson,
  type AuditCsvLabels,
  type AuditExportRow,
} from '@/lib/audit/auditExport';
import {
  buildAuditHaystack,
  deriveAuditCategory,
  deriveAuditSeverity,
  humanizeAction,
  normalizeAction,
  parseAuditDetails,
} from '@/lib/audit/actionMeta';

const LABELS: AuditCsvLabels = {
  timestampIso: 'Timestamp (UTC)',
  timestampLocal: 'Time',
  actor: 'User',
  actorEmail: 'Email',
  actorRole: 'Role',
  action: 'Action',
  actionKey: 'Action key',
  category: 'Category',
  severity: 'Severity',
  target: 'Target',
  details: 'Details',
  ip: 'IP address',
};

const row = (patch: Partial<AuditExportRow> = {}): AuditExportRow => ({
  timestampIso: '2026-08-22T09:15:00.000Z',
  timestampLocal: '22.08.2026, 13:15',
  actor: 'Ann Petrosyan',
  actorEmail: 'ann@example.com',
  actorRole: 'admin',
  action: 'Leave approved',
  actionKey: 'leave_approved',
  category: 'Work',
  severity: 'Info',
  target: 'Leave request',
  details: 'days: 3',
  ip: '10.0.0.4',
  ...patch,
});

/** CSV without the BOM and trailing CRLF, split into lines. */
function lines(csv: string): string[] {
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  return csv.slice(1).replace(/\r\n$/, '').split('\r\n');
}

describe('auditRowsToCsv', () => {
  it('starts with a UTF-8 BOM so Excel reads Cyrillic and Armenian names', () => {
    const csv = auditRowsToCsv([row({ actor: 'Աննա Պետրոսյան' })], LABELS);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Աննա Պետրոսյան');
  });

  it('uses CRLF line endings and ends the file with one', () => {
    const csv = auditRowsToCsv([row(), row()], LABELS);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv).not.toMatch(/[^\r]\n/);
    expect(lines(csv)).toHaveLength(3); // header + two rows
  });

  it('writes the header in the caller-supplied language, in column order', () => {
    const [header] = lines(auditRowsToCsv([], LABELS));
    expect(header).toBe(
      '"Timestamp (UTC)","Time","User","Email","Role","Action","Action key",' +
        '"Category","Severity","Target","Details","IP address"',
    );
  });

  it('keeps the ISO timestamp and the raw action key beside the readable ones', () => {
    const [, first] = lines(auditRowsToCsv([row()], LABELS));
    expect(first).toContain('"2026-08-22T09:15:00.000Z"');
    expect(first).toContain('"leave_approved"');
    expect(first).toContain('"Leave approved"');
  });

  it('neutralizes cells Excel would evaluate as a formula', () => {
    const [, first] = lines(
      auditRowsToCsv([row({ target: '=HYPERLINK("http://evil.test","Payslip")' })], LABELS),
    );
    // Prefixed with an apostrophe, and the inner quotes doubled per RFC 4180.
    expect(first).toContain('"\'=HYPERLINK(""http://evil.test"",""Payslip"")"');
  });

  it('neutralizes every formula lead character, not just the equals sign', () => {
    for (const value of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx']) {
      const [, only] = lines(auditRowsToCsv([row({ details: value })], LABELS));
      // `\t`/`\r` reach the cell trimmed, so only the printable ones keep a quote.
      expect(only).toMatch(/"'[=+\-@]|"x"/);
    }
  });

  it('flattens embedded newlines so a multi-line detail cannot shift columns', () => {
    const csv = auditRowsToCsv([row({ details: 'first\r\nsecond\nthird' })], LABELS);
    expect(lines(csv)).toHaveLength(2);
    expect(csv).toContain('"first second third"');
  });

  it('renders a row with empty optional fields as empty cells, not as "undefined"', () => {
    const [, only] = lines(auditRowsToCsv([row({ actorEmail: '', ip: '', target: '' })], LABELS));
    expect(only).toContain('""');
    expect(only).not.toContain('undefined');
  });

  it('puts the applied filters above the header as # comment lines', () => {
    const csv = auditRowsToCsv([row()], LABELS, ['Range: Last 30 days', 'Severity: Critical']);
    const [firstNote, secondNote, header] = lines(csv);
    expect(firstNote).toBe('"# Range: Last 30 days"');
    expect(secondNote).toBe('"# Severity: Critical"');
    expect(header).toContain('"Timestamp (UTC)"');
  });

  it('emits only a header when nothing matched the filters', () => {
    expect(lines(auditRowsToCsv([], LABELS))).toHaveLength(1);
  });
});

describe('auditRowsToJson', () => {
  const meta = {
    exportedAt: '2026-08-22T09:20:00.000Z',
    filters: { Range: 'Last 30 days', Severity: 'Critical' },
    count: 1,
    truncated: true,
  };

  /** Typed so the assertions read as fields rather than as index lookups. */
  const parse = (json: string) =>
    JSON.parse(json) as { meta: typeof meta; entries: AuditExportRow[] };

  it('round-trips through JSON.parse with the metadata block intact', () => {
    const parsed = parse(auditRowsToJson([row()], meta));
    expect(parsed.meta).toEqual(meta);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].actionKey).toBe('leave_approved');
  });

  it('records that the export is a slice when more rows exist server-side', () => {
    const full = parse(auditRowsToJson([], { ...meta, count: 0, truncated: false }));
    expect(full.meta.truncated).toBe(false);
    expect(parse(auditRowsToJson([row()], meta)).meta.truncated).toBe(true);
  });

  it('is pretty-printed and newline-terminated so diffs and git are usable', () => {
    const json = auditRowsToJson([row()], meta);
    expect(json.endsWith('\n')).toBe(true);
    expect(json).toContain('\n  "meta"');
  });
});

describe('auditExportFilename', () => {
  it('dates the file so successive exports do not overwrite each other', () => {
    const date = new Date('2026-08-22T21:30:00.000Z');
    expect(auditExportFilename('audit-log', 'csv', date)).toBe('audit-log-2026-08-22.csv');
    expect(auditExportFilename('audit-log', 'json', date)).toBe('audit-log-2026-08-22.json');
  });

  it('slugifies a prefix that came from a translated string', () => {
    const date = new Date('2026-01-05T00:00:00.000Z');
    expect(auditExportFilename('Журнал аудита', 'csv', date)).toBe('export-2026-01-05.csv');
    expect(auditExportFilename('Audit Log!', 'csv', date)).toBe('audit-log-2026-01-05.csv');
  });
});

describe('normalizeAction / humanizeAction', () => {
  it('treats the dotted and snake naming families as one action', () => {
    expect(normalizeAction('Superadmin.Session.Revoke')).toBe('superadmin_session_revoke');
    expect(normalizeAction('superadmin_session_revoke')).toBe('superadmin_session_revoke');
    expect(normalizeAction('face-id login')).toBe('face_id_login');
  });

  it('humanizes an untranslated key instead of leaving the raw string on screen', () => {
    expect(humanizeAction('GENERATE_SUPERADMIN_TOKEN')).toBe('Generate Superadmin Token');
    expect(humanizeAction('recurring_task_instance_created')).toBe(
      'Recurring Task Instance Created',
    );
    expect(humanizeAction('user.login')).toBe('User Login');
  });
});

describe('deriveAuditCategory', () => {
  it('files an action under the category its prefix implies', () => {
    expect(deriveAuditCategory('task_created')).toBe('work');
    expect(deriveAuditCategory('payroll_run_finalized')).toBe('finance');
    expect(deriveAuditCategory('employee_updated')).toBe('people');
    expect(deriveAuditCategory('ai_kpi_suggested')).toBe('ai');
  });

  it('honours the documented exceptions rather than the obvious prefix', () => {
    // Logging in is authentication, not a change to a person.
    expect(deriveAuditCategory('user.login')).toBe('auth');
    // Configuring leave types is a settings change, not a leave request.
    expect(deriveAuditCategory('leave_type_config_updated')).toBe('admin');
    // Consent belongs to compliance even though an admin performs it.
    expect(deriveAuditCategory('consent_withdrawn')).toBe('compliance');
  });

  it('falls back to system for automation nobody classified', () => {
    expect(deriveAuditCategory('cron_backup_completed')).toBe('system');
  });
});

describe('deriveAuditSeverity', () => {
  it('reads the outcome out of the details when the action name is neutral', () => {
    expect(deriveAuditSeverity('login_attempt', 'Login failed for ann@example.com')).toBe(
      'critical',
    );
    expect(deriveAuditSeverity('login_attempt', 'Login succeeded')).toBe('info');
  });

  it('matches whole tokens, so good news is not filed as critical', () => {
    expect(deriveAuditSeverity('account_unlocked')).toBe('info');
    expect(deriveAuditSeverity('face_id_unblocked')).toBe('info');
    expect(deriveAuditSeverity('account_locked')).toBe('critical');
  });

  it('ranks an irreversible delete above an ordinary one', () => {
    expect(deriveAuditSeverity('employee_deleted')).toBe('warning');
    expect(deriveAuditSeverity('employee_hard_deleted')).toBe('critical');
  });
});

describe('parseAuditDetails', () => {
  it('splits a JSON payload from a plain-text one', () => {
    expect(parseAuditDetails('{"updatedFields":["status"]}')).toEqual({
      record: { updatedFields: ['status'] },
      text: '',
    });
    expect(parseAuditDetails('Account of Ann unlocked by Bob')).toEqual({
      record: {},
      text: 'Account of Ann unlocked by Bob',
    });
  });

  it('never throws on the writers that put invalid JSON in the column', () => {
    expect(parseAuditDetails('{"broken": ')).toEqual({ record: {}, text: '{"broken":' });
    expect(parseAuditDetails('[1,2,3]')).toEqual({ record: {}, text: '[1,2,3]' });
  });

  it('treats a missing, null or blank payload as nothing to render', () => {
    expect(parseAuditDetails()).toEqual({ record: {}, text: '' });
    expect(parseAuditDetails(null)).toEqual({ record: {}, text: '' });
    expect(parseAuditDetails('   ')).toEqual({ record: {}, text: '' });
  });
});

describe('buildAuditHaystack', () => {
  it('lower-cases and joins the searchable parts, skipping the missing ones', () => {
    expect(buildAuditHaystack(['Leave Approved', undefined, 'Ann', null, ''])).toBe(
      'leave approved  ann',
    );
  });
});
