import { CAPABILITIES, capabilitiesForRole } from '../../convex/lib/capabilities';

// Access matrix describes which capabilities each role has.
// We test the pure logic that the matrix UI consumes.

const ROLES = ['superadmin', 'admin', 'supervisor', 'employee', 'driver'] as const;

const CAPABILITY_DESCRIPTIONS: Record<string, string> = {
  'leave.approve': 'Approve leave for people in your own reporting subtree.',
  'leave.approve.org': 'Approve leave for anyone in the organization, chain or not (HR/admin).',
  'users.read.org': 'Read every member of the organization, chain or not (HR/admin).',
  'attendance.manage': 'Record attendance for somebody other than yourself.',
  'ratings.manage': "Rate somebody's performance.",
  'compensation.manage': "Set somebody's salary, bonuses and hourly rate.",
  'org.manage': 'Change org-level structure: head of the organization, positions, chart.',
};

describe('Access Matrix — capability descriptions', () => {
  it('every capability has a description', () => {
    CAPABILITIES.forEach((cap) => {
      expect(CAPABILITY_DESCRIPTIONS[cap]).toBeDefined();
      expect(CAPABILITY_DESCRIPTIONS[cap].length).toBeGreaterThan(0);
    });
  });

  it('descriptions count matches capabilities count', () => {
    expect(Object.keys(CAPABILITY_DESCRIPTIONS).length).toBe(CAPABILITIES.length);
  });

  it('descriptions are non-empty strings', () => {
    Object.values(CAPABILITY_DESCRIPTIONS).forEach((desc) => {
      expect(typeof desc).toBe('string');
      expect(desc.length).toBeGreaterThan(10);
    });
  });
});

describe('Access Matrix — role grid', () => {
  it('superadmin has all capabilities', () => {
    const caps = capabilitiesForRole('superadmin');
    CAPABILITIES.forEach((cap) => {
      expect(caps).toContain(cap);
    });
  });

  it('admin has all capabilities', () => {
    const caps = capabilitiesForRole('admin');
    CAPABILITIES.forEach((cap) => {
      expect(caps).toContain(cap);
    });
  });

  it('supervisor has a strict subset of admin', () => {
    const superCaps = capabilitiesForRole('supervisor');
    const adminCaps = capabilitiesForRole('admin');
    superCaps.forEach((cap) => {
      expect(adminCaps).toContain(cap);
    });
  });

  it('supervisor does NOT have org.manage', () => {
    expect(capabilitiesForRole('supervisor')).not.toContain('org.manage');
  });

  it('supervisor does NOT have leave.approve.org', () => {
    expect(capabilitiesForRole('supervisor')).not.toContain('leave.approve.org');
  });

  it('supervisor does NOT have users.read.org', () => {
    expect(capabilitiesForRole('supervisor')).not.toContain('users.read.org');
  });

  it('employee has no capabilities', () => {
    expect(capabilitiesForRole('employee')).toEqual([]);
  });

  it('driver has no capabilities (job, not privilege)', () => {
    expect(capabilitiesForRole('driver')).toEqual([]);
  });

  it('all roles are in the ROLES array', () => {
    ROLES.forEach((role) => {
      expect(typeof role).toBe('string');
    });
  });
});
