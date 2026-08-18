import { describe, it, expect } from '@jest/globals';
import { isPlanGateError, parsePlanGateError } from '@/lib/planGateErrors';

describe('parsePlanGateError', () => {
  it('parses module-access errors into module + plan', () => {
    const info = parsePlanGateError(
      new Error('Module "payroll" is not included in your Pro plan. Upgrade to unlock it.'),
    );
    expect(info).toEqual({ kind: 'module', moduleKey: 'payroll', planName: 'Pro' });
  });

  it('parses quota errors into usage key, limit and plan', () => {
    const info = parsePlanGateError(
      new Error(
        'Quota exceeded: documents limit is 100 on the Starter plan. Upgrade to increase it.',
      ),
    );
    expect(info).toEqual({
      kind: 'quota',
      usageKey: 'documents',
      limit: 100,
      planName: 'Starter',
    });
  });

  it('returns null for unrelated errors', () => {
    expect(parsePlanGateError(new Error('Not authenticated'))).toBeNull();
    expect(parsePlanGateError(new Error('This feature is disabled.'))).toBeNull();
    expect(parsePlanGateError('Plain string error')).toBeNull();
    expect(parsePlanGateError(undefined)).toBeNull();
    expect(parsePlanGateError(null)).toBeNull();
  });

  it('works with string errors and isPlanGateError', () => {
    expect(isPlanGateError('Quota exceeded: rooms limit is 1 on the Pro plan.')).toBe(true);
    expect(isPlanGateError('Module "goals" is not included in your Starter plan.')).toBe(true);
    expect(isPlanGateError('Internal server error')).toBe(false);
  });
});
