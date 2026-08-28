import {
  capabilitiesForRole,
  hasCapability,
  hasOrgWideReach,
  CAPABILITIES,
} from '../../convex/lib/capabilities';

describe('CAPABILITIES', () => {
  it('is a non-empty array of strings', () => {
    expect(Array.isArray(CAPABILITIES)).toBe(true);
    expect(CAPABILITIES.length).toBeGreaterThan(0);
    CAPABILITIES.forEach((c) => expect(typeof c).toBe('string'));
  });

  it('contains leave.approve', () => {
    expect(CAPABILITIES).toContain('leave.approve');
  });

  it('contains org.manage', () => {
    expect(CAPABILITIES).toContain('org.manage');
  });
});

describe('capabilitiesForRole', () => {
  it('returns all capabilities for superadmin', () => {
    const caps = capabilitiesForRole('superadmin');
    expect(caps).toEqual(CAPABILITIES);
  });

  it('returns full admin capabilities', () => {
    const caps = capabilitiesForRole('admin');
    expect(caps).toContain('leave.approve');
    expect(caps).toContain('leave.approve.org');
    expect(caps).toContain('users.read.org');
    expect(caps).toContain('attendance.manage');
    expect(caps).toContain('ratings.manage');
    expect(caps).toContain('compensation.manage');
    expect(caps).toContain('org.manage');
  });

  it('returns limited supervisor capabilities', () => {
    const caps = capabilitiesForRole('supervisor');
    expect(caps).toContain('leave.approve');
    expect(caps).toContain('attendance.manage');
    expect(caps).toContain('ratings.manage');
    expect(caps).toContain('compensation.manage');
    // Supervisor should NOT have org-wide capabilities
    expect(caps).not.toContain('leave.approve.org');
    expect(caps).not.toContain('users.read.org');
    expect(caps).not.toContain('org.manage');
  });

  it('returns empty array for employee', () => {
    expect(capabilitiesForRole('employee')).toEqual([]);
  });

  it('returns empty array for driver', () => {
    expect(capabilitiesForRole('driver')).toEqual([]);
  });

  it('returns empty array for undefined role', () => {
    expect(capabilitiesForRole(undefined)).toEqual([]);
  });

  it('returns empty array for unknown role', () => {
    expect(capabilitiesForRole('janitor')).toEqual([]);
  });
});

describe('hasCapability', () => {
  it('returns true when user has the capability', () => {
    expect(hasCapability({ role: 'admin' }, 'leave.approve')).toBe(true);
  });

  it('returns false when user lacks the capability', () => {
    expect(hasCapability({ role: 'employee' }, 'leave.approve')).toBe(false);
  });

  it('returns false for null user', () => {
    expect(hasCapability(null, 'leave.approve')).toBe(false);
  });

  it('returns false for undefined user', () => {
    expect(hasCapability(undefined, 'leave.approve')).toBe(false);
  });

  it('returns false for user with no role', () => {
    expect(hasCapability({ role: undefined }, 'leave.approve')).toBe(false);
  });

  it('returns true for superadmin holding any capability', () => {
    CAPABILITIES.forEach((cap) => {
      expect(hasCapability({ role: 'superadmin' }, cap)).toBe(true);
    });
  });
});

describe('hasOrgWideReach', () => {
  it('returns true for admin (has users.read.org)', () => {
    expect(hasOrgWideReach({ role: 'admin' })).toBe(true);
  });

  it('returns true for superadmin', () => {
    expect(hasOrgWideReach({ role: 'superadmin' })).toBe(true);
  });

  it('returns false for supervisor', () => {
    expect(hasOrgWideReach({ role: 'supervisor' })).toBe(false);
  });

  it('returns false for employee', () => {
    expect(hasOrgWideReach({ role: 'employee' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(hasOrgWideReach(null)).toBe(false);
  });
});
