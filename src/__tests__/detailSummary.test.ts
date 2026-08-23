/**
 * Tests for `@/lib/audit/detailSummary` — one-line audit detail summaries.
 */
import { describe, it, expect } from '@jest/globals';
import { summarizeAuditDetails, NOISY_DETAIL_KEYS } from '@/lib/audit/detailSummary';

const t = (key: string, opts?: Record<string, unknown>) => {
  const fallback = opts?.defaultValue ?? key;
  if (typeof fallback === 'string') {
    // Simple interpolation: replace {{name}} with value
    return fallback.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts?.[k] ?? k));
  }
  return key;
};

describe('NOISY_DETAIL_KEYS', () => {
  it('contains common noise keys', () => {
    expect(NOISY_DETAIL_KEYS.has('_id')).toBe(true);
    expect(NOISY_DETAIL_KEYS.has('tokenId')).toBe(true);
    expect(NOISY_DETAIL_KEYS.has('passwordHash')).toBe(true);
  });
});

describe('summarizeAuditDetails', () => {
  it('returns empty string for empty details', () => {
    expect(summarizeAuditDetails({}, 'updated', t)).toBe('');
  });

  // ── tempAccess ──────────────────────────────────────────────────────────

  it('surfaces tempAccess with name and email', () => {
    const result = summarizeAuditDetails(
      { tempName: 'Alice', tempEmail: 'alice@example.com' },
      'temp_access_granted',
      t,
    );
    expect(result).toContain('Alice');
    expect(result).toContain('alice@example.com');
  });

  it('surfaces tempAccess with name only', () => {
    const result = summarizeAuditDetails({ tempName: 'Bob' }, 'temp_access_granted', t);
    expect(result).toContain('Bob');
    expect(result).not.toContain('undefined');
  });

  // ── durationDays ────────────────────────────────────────────────────────

  it('summarizes probation period', () => {
    const result = summarizeAuditDetails({ durationDays: 90 }, 'probation_started', t);
    expect(result).toContain('90');
    expect(result).toContain('days');
  });

  it('summarizes review cycle with periodName', () => {
    const result = summarizeAuditDetails(
      { durationDays: 30, periodName: 'Q3 Review' },
      'review_created',
      t,
    );
    expect(result).toContain('Q3 Review');
    expect(result).toContain('30');
  });

  it('summarizes review cycle without periodName', () => {
    const result = summarizeAuditDetails({ durationDays: 60 }, 'review_cycle_created', t);
    expect(result).toContain('60');
    expect(result).toContain('days');
  });

  // ── messagesRead ────────────────────────────────────────────────────────

  it('summarizes messagesRead', () => {
    const result = summarizeAuditDetails({ messagesRead: 15 }, 'messages_read', t);
    expect(result).toContain('15');
  });

  // ── updatedFields ───────────────────────────────────────────────────────

  it('summarizes updatedFields (<= 3)', () => {
    const result = summarizeAuditDetails({ updatedFields: ['name', 'email'] }, 'updated', t);
    expect(result).toContain('name');
    expect(result).toContain('email');
  });

  it('truncates updatedFields to 3 and shows +more', () => {
    const result = summarizeAuditDetails(
      { updatedFields: ['name', 'email', 'phone', 'dept', 'role'] },
      'updated',
      t,
    );
    expect(result).toContain('name');
    expect(result).toContain('+2 more');
  });

  it('handles single updatedField', () => {
    const result = summarizeAuditDetails({ updatedFields: ['salary'] }, 'updated', t);
    expect(result).toContain('salary');
  });

  // ── fallback scalar dump ────────────────────────────────────────────────

  it('falls back to scalar string values', () => {
    const result = summarizeAuditDetails({ status: 'active', region: 'EMEA' }, 'updated', t);
    expect(result).toContain('active');
    expect(result).toContain('EMEA');
  });

  it('skips noisy keys in fallback', () => {
    const result = summarizeAuditDetails(
      { _id: 'abc123', name: 'Test', tokenId: 'tok' },
      'updated',
      t,
    );
    expect(result).not.toContain('abc123');
    expect(result).toContain('Test');
  });

  it('includes numeric values in fallback', () => {
    const result = summarizeAuditDetails({ count: 42 }, 'updated', t);
    expect(result).toContain('42');
  });

  it('limits fallback to 3 parts', () => {
    const result = summarizeAuditDetails({ a: '1', b: '2', c: '3', d: '4' }, 'updated', t);
    const parts = result.split(' · ');
    expect(parts.length).toBeLessThanOrEqual(3);
  });

  it('skips long strings in fallback', () => {
    const result = summarizeAuditDetails({ longText: 'a'.repeat(50), short: 'hi' }, 'updated', t);
    expect(result).not.toContain('a'.repeat(50));
    expect(result).toContain('hi');
  });
});
