import { NOTIFICATION_TYPES } from '../../convex/lib/notify';

describe('NOTIFICATION_TYPES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(NOTIFICATION_TYPES)).toBe(true);
    expect(NOTIFICATION_TYPES.length).toBeGreaterThan(0);
  });

  it('all entries are strings', () => {
    NOTIFICATION_TYPES.forEach((type) => {
      expect(typeof type).toBe('string');
    });
  });

  it('all entries are snake_case', () => {
    NOTIFICATION_TYPES.forEach((type) => {
      expect(type).toMatch(/^[a-z][a-z0-9_]*$/);
    });
  });

  it('contains essential leave types', () => {
    expect(NOTIFICATION_TYPES).toContain('leave_request');
    expect(NOTIFICATION_TYPES).toContain('leave_approved');
    expect(NOTIFICATION_TYPES).toContain('leave_rejected');
  });

  it('contains driver types', () => {
    expect(NOTIFICATION_TYPES).toContain('driver_request');
    expect(NOTIFICATION_TYPES).toContain('driver_request_approved');
  });

  it('contains onboarding types', () => {
    expect(NOTIFICATION_TYPES).toContain('onboarding_started');
    expect(NOTIFICATION_TYPES).toContain('onboarding_task_due');
    expect(NOTIFICATION_TYPES).toContain('onboarding_task_overdue');
  });

  it('contains offboarding types', () => {
    expect(NOTIFICATION_TYPES).toContain('offboarding_started');
    expect(NOTIFICATION_TYPES).toContain('offboarding_completed');
  });

  it('contains security types', () => {
    expect(NOTIFICATION_TYPES).toContain('security_alert');
  });

  it('contains probation types', () => {
    expect(NOTIFICATION_TYPES).toContain('probation_started');
    expect(NOTIFICATION_TYPES).toContain('probation_ending_soon');
    expect(NOTIFICATION_TYPES).toContain('probation_passed');
    expect(NOTIFICATION_TYPES).toContain('probation_failed');
  });

  it('contains no duplicates', () => {
    expect(new Set(NOTIFICATION_TYPES).size).toBe(NOTIFICATION_TYPES.length);
  });

  it('has reasonable count (at least 30)', () => {
    expect(NOTIFICATION_TYPES.length).toBeGreaterThanOrEqual(30);
  });
});
