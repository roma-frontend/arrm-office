/**
 * Tests for `@/lib/audit/auditExport` — CSV and JSON audit trail export.
 */
import { describe, it, expect } from '@jest/globals';
import { auditRowsToCsv, auditRowsToJson, auditExportFilename, type AuditExportRow, type AuditCsvLabels } from '@/lib/audit/auditExport';

const LABELS: AuditCsvLabels = {
  timestampIso: 'Timestamp (UTC)',
  timestampLocal: 'Time',
  actor: 'Actor',
  actorEmail: 'Email',
  actorRole: 'Role',
  action: 'Action',
  actionKey: 'Action Key',
  category: 'Category',
  severity: 'Severity',
  target: 'Target',
  details: 'Details',
  ip: 'IP',
};

function makeRow(overrides: Partial<AuditExportRow> = {}): AuditExportRow {
  return {
    timestampIso: '2025-08-22T10:00:00.000Z',
    timestampLocal: '22.08.2025, 14:00',
    actor: 'Alice',
    actorEmail: 'alice@example.com',
    actorRole: 'admin',
    action: 'Leave approved',
    actionKey: 'leave_approved',
    category: 'Work',
    severity: 'Info',
    target: 'Bob',
    details: 'Approved 5 days',
    ip: '192.168.1.1',
    ...overrides,
  };
}

describe('auditRowsToCsv', () => {
  it('starts with BOM', () => {
    const csv = auditRowsToCsv([], LABELS);
    expect(csv.startsWith('\uFEFF')).toBe(true);
  });

  it('contains header row', () => {
    const csv = auditRowsToCsv([], LABELS);
    expect(csv).toContain('Timestamp (UTC)');
    expect(csv).toContain('Actor');
    expect(csv).toContain('Action');
  });

  it('contains data row', () => {
    const csv = auditRowsToCsv([makeRow()], LABELS);
    expect(csv).toContain('Alice');
    expect(csv).toContain('Leave approved');
  });

  it('neutralizes formula-injected values', () => {
    const row = makeRow({ details: '=HYPERLINK("http://evil.com")' });
    const csv = auditRowsToCsv([row], LABELS);
    expect(csv).toContain("'=");
    expect(csv).not.toContain('"=HYPERLINK');
  });

  it('neutralizes + prefix', () => {
    const row = makeRow({ details: '+CMD' });
    const csv = auditRowsToCsv([row], LABELS);
    expect(csv).toContain("'+CMD");
  });

  it('adds notes as # prefixed lines', () => {
    const csv = auditRowsToCsv([], LABELS, ['Filter: date > 2025-01-01', 'Exported by Alice']);
    expect(csv).toContain('# Filter:');
    expect(csv).toContain('# Exported by Alice');
  });

  it('handles empty notes array', () => {
    const csv = auditRowsToCsv([], LABELS, []);
    expect(csv).toContain('Timestamp');
  });

  it('escapes double quotes in values', () => {
    const row = makeRow({ details: 'He said "hello"' });
    const csv = auditRowsToCsv([row], LABELS);
    expect(csv).toContain('He said ""hello""');
  });

  it('strips newlines from cell values', () => {
    const row = makeRow({ details: 'Line 1\nLine 2' });
    const csv = auditRowsToCsv([row], LABELS);
    expect(csv).not.toContain('\nLine 2');
  });

  it('handles undefined optional fields', () => {
    const row = makeRow({ ip: undefined });
    const csv = auditRowsToCsv([row], LABELS);
    expect(csv).toContain('Alice');
  });

  it('ends with CRLF', () => {
    const csv = auditRowsToCsv([], LABELS);
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});

describe('auditRowsToJson', () => {
  it('returns valid JSON', () => {
    const json = auditRowsToJson([], {
      exportedAt: '2025-08-22T10:00:00.000Z',
      filters: {},
      count: 0,
      truncated: false,
    });
    const parsed = JSON.parse(json);
    expect(parsed.meta).toBeDefined();
    expect(parsed.entries).toEqual([]);
  });

  it('includes entries', () => {
    const json = auditRowsToJson([makeRow()], {
      exportedAt: '2025-08-22T10:00:00.000Z',
      filters: { date: '2025-08-01' },
      count: 1,
      truncated: false,
    });
    const parsed = JSON.parse(json);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.meta.filters.date).toBe('2025-08-01');
  });

  it('includes truncated flag', () => {
    const json = auditRowsToJson([], {
      exportedAt: '2025-08-22T10:00:00.000Z',
      filters: {},
      count: 0,
      truncated: true,
    });
    const parsed = JSON.parse(json);
    expect(parsed.meta.truncated).toBe(true);
  });
});

describe('auditExportFilename', () => {
  it('returns csv filename with date', () => {
    const name = auditExportFilename('audit-log', 'csv', new Date(2025, 7, 22));
    expect(name).toContain('.csv');
    expect(name).toContain('2025');
  });

  it('returns json filename with date', () => {
    const name = auditExportFilename('audit-log', 'json', new Date(2025, 7, 22));
    expect(name).toContain('.json');
  });
});
