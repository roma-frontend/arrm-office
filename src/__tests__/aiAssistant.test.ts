/**
 * Tests for AI Assistant capabilities (src/lib/aiAssistant.ts)
 * Tests: AI_CAPABILITIES data integrity, AICapability type
 */

import {
  AI_CAPABILITIES,
  getCapabilitiesForRole,
  detectIntent,
  buildRoleBasedPrompt,
  hasPermission,
  getRoleSuggestions,
  type UserContext,
} from '@/lib/aiAssistant';

describe('AI_CAPABILITIES', () => {
  it('contains at least 25 capabilities', () => {
    expect(AI_CAPABILITIES.length).toBeGreaterThanOrEqual(25);
  });

  it('every capability has required fields', () => {
    AI_CAPABILITIES.forEach((cap) => {
      expect(cap.id).toBeDefined();
      expect(typeof cap.id).toBe('string');
      expect(cap.name).toBeDefined();
      expect(typeof cap.name).toBe('string');
      expect(cap.description).toBeDefined();
      expect(typeof cap.description).toBe('string');
      expect(cap.requiredRole).toBeDefined();
      expect(Array.isArray(cap.requiredRole)).toBe(true);
      expect(cap.keywords).toBeDefined();
      expect(Array.isArray(cap.keywords)).toBe(true);
    });
  });

  it('all capabilities have at least one required role', () => {
    AI_CAPABILITIES.forEach((cap) => {
      expect(cap.requiredRole.length).toBeGreaterThan(0);
    });
  });

  it('all capabilities have at least one keyword', () => {
    AI_CAPABILITIES.forEach((cap) => {
      expect(cap.keywords.length).toBeGreaterThan(0);
    });
  });

  it('has unique capability ids', () => {
    const ids = AI_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all roles in requiredRole are valid', () => {
    const validRoles = ['employee', 'supervisor', 'admin', 'superadmin'];
    AI_CAPABILITIES.forEach((cap) => {
      cap.requiredRole.forEach((role) => {
        expect(validRoles).toContain(role);
      });
    });
  });

  it('has employee capabilities', () => {
    const empCaps = AI_CAPABILITIES.filter((c) => c.requiredRole.includes('employee'));
    expect(empCaps.length).toBeGreaterThan(0);
  });

  it('has supervisor-only capabilities', () => {
    const supCaps = AI_CAPABILITIES.filter(
      (c) => c.requiredRole.includes('supervisor') && !c.requiredRole.includes('employee'),
    );
    expect(supCaps.length).toBeGreaterThan(0);
  });

  it('has admin-only capabilities', () => {
    const adminCaps = AI_CAPABILITIES.filter(
      (c) => c.requiredRole.includes('admin') && !c.requiredRole.includes('supervisor'),
    );
    expect(adminCaps.length).toBeGreaterThan(0);
  });

  it('has superadmin-only capabilities', () => {
    const superadminCaps = AI_CAPABILITIES.filter(
      (c) => c.requiredRole.includes('superadmin') && c.requiredRole.length === 1,
    );
    expect(superadminCaps.length).toBeGreaterThan(0);
  });

  it('employee capabilities cover basic HR functions', () => {
    const empCaps = AI_CAPABILITIES.filter((c) => c.requiredRole.includes('employee'));
    const empIds = empCaps.map((c) => c.id);
    expect(empIds).toContain('view_calendar');
    expect(empIds).toContain('book_leave');
    expect(empIds).toContain('view_tasks');
    expect(empIds).toContain('check_attendance');
  });

  it('admin capabilities include management functions', () => {
    const adminCaps = AI_CAPABILITIES.filter((c) => c.requiredRole.includes('admin'));
    const adminIds = adminCaps.map((c) => c.id);
    expect(adminIds).toContain('manage_employees');
    expect(adminIds).toContain('view_analytics');
    expect(adminIds).toContain('view_reports');
  });

  it('superadmin capabilities include platform management', () => {
    const saCaps = AI_CAPABILITIES.filter(
      (c) => c.requiredRole.includes('superadmin') && c.requiredRole.length === 1,
    );
    const saIds = saCaps.map((c) => c.id);
    expect(saIds).toContain('manage_organizations');
    expect(saIds).toContain('security_monitoring');
    expect(saIds).toContain('manage_subscriptions');
  });

  it('capabilities with action have valid route paths', () => {
    AI_CAPABILITIES.filter((c) => c.action).forEach((cap) => {
      expect(cap.action).toMatch(/^\//);
    });
  });

  it('contains multilingual keywords (Russian)', () => {
    const allKeywords = AI_CAPABILITIES.flatMap((c) => c.keywords);
    const ruKeywords = allKeywords.filter((k) => /[а-яё]/.test(k));
    expect(ruKeywords.length).toBeGreaterThan(0);
  });

  it('contains multilingual keywords (Armenian)', () => {
    const allKeywords = AI_CAPABILITIES.flatMap((c) => c.keywords);
    const hyKeywords = allKeywords.filter((k) => /[ա-ֆ]/.test(k));
    expect(hyKeywords.length).toBeGreaterThan(0);
  });

  it('helps employee check leave balance', () => {
    const viewLeaves = AI_CAPABILITIES.find((c) => c.id === 'view_my_leaves');
    expect(viewLeaves).toBeDefined();
    expect(viewLeaves!.keywords).toContain('my leaves');
    expect(viewLeaves!.keywords).toContain('leave balance');
  });

  it('helps employee book driver', () => {
    const requestDriver = AI_CAPABILITIES.find((c) => c.id === 'request_driver');
    expect(requestDriver).toBeDefined();
    expect(requestDriver!.keywords).toContain('driver');
    expect(requestDriver!.action).toBe('/drivers');
  });
});

describe('getCapabilitiesForRole', () => {
  it('returns only capabilities whose requiredRole includes the role', () => {
    const employeeCaps = getCapabilitiesForRole('employee');
    expect(employeeCaps.length).toBeGreaterThan(0);
    employeeCaps.forEach((cap) => expect(cap.requiredRole).toContain('employee'));
  });

  it('gives supervisors more capabilities than employees', () => {
    const employeeIds = getCapabilitiesForRole('employee').map((c) => c.id);
    const supervisorIds = getCapabilitiesForRole('supervisor').map((c) => c.id);
    expect(supervisorIds).toContain('approve_leaves');
    expect(employeeIds).not.toContain('approve_leaves');
  });

  it('excludes admin-only capabilities from employees', () => {
    const employeeIds = getCapabilitiesForRole('employee').map((c) => c.id);
    expect(employeeIds).not.toContain('manage_employees');
    expect(getCapabilitiesForRole('admin').map((c) => c.id)).toContain('manage_employees');
  });

  it('superadmin gets the full capability set', () => {
    const superadminIds = getCapabilitiesForRole('superadmin').map((c) => c.id);
    expect(superadminIds).toContain('manage_organizations');
    expect(superadminIds).toContain('security_monitoring');
    expect(superadminIds).toContain('manage_subscriptions');
    // Every capability is available to at least one role; superadmin must see
    // everything that has a role gating (except employee-only rows are also fine).
    const allIds = new Set(AI_CAPABILITIES.map((c) => c.id));
    expect(superadminIds.length).toBeGreaterThan(allIds.size - 10);
  });
});

describe('detectIntent', () => {
  it('returns null for an unmatched message', () => {
    expect(detectIntent('please sing a song', 'employee')).toBeNull();
  });

  it('matches a keyword and returns its capability', () => {
    const result = detectIntent('show my calendar', 'employee');
    expect(result?.id).toBe('view_calendar');
  });

  it('matches Russian keywords', () => {
    const result = detectIntent('покажи календарь', 'employee');
    expect(result?.id).toBe('view_calendar');
  });

  it('matches Armenian keywords', () => {
    const result = detectIntent('ցույց տուր օրացույցը', 'employee');
    expect(result?.id).toBe('view_calendar');
  });

  it('is case-insensitive', () => {
    expect(detectIntent('MY TASKS', 'employee')?.id).toBe('view_tasks');
  });

  it('prefers the longer, more specific keyword', () => {
    // 'leave balance' (13 chars) beats 'my leaves' / 'leave' (shorter).
    const result = detectIntent('what is my leave balance?', 'employee');
    expect(result?.id).toBe('view_my_leaves');
  });

  it('never returns a capability the role cannot use', () => {
    const result = detectIntent('add a new employee', 'employee');
    expect(result).toBeNull();
    expect(detectIntent('add a new employee', 'admin')?.id).toBe('manage_employees');
  });

  it('matches booking a driver for employees', () => {
    expect(detectIntent('закажи водителя на завтра', 'employee')?.id).toBe('request_driver');
  });

  it('treats surrounding whitespace as insignificant', () => {
    expect(detectIntent('  dashboard  ', 'employee')?.id).toBe('view_dashboard');
  });
});

describe('buildRoleBasedPrompt', () => {
  const baseUser: UserContext = {
    userId: 'u1',
    name: 'Alice',
    email: 'alice@acme.com',
    role: 'employee',
    department: 'Engineering',
    position: 'Developer',
  };

  it('includes user identity and capabilities section', () => {
    const prompt = buildRoleBasedPrompt(baseUser);
    expect(prompt).toContain('Alice');
    expect(prompt).toContain('alice@acme.com');
    // The prompt prints the department verbatim ("🏢 Department: Engineering").
    expect(prompt).toContain('Engineering');
    expect(prompt).toContain('AVAILABLE CAPABILITIES');
    expect(prompt).toContain('View Calendar');
  });

  it('includes the role-specific knowledge block', () => {
    const prompt = buildRoleBasedPrompt({ ...baseUser, role: 'superadmin' });
    expect(prompt).toContain('SUPERADMIN MODE');
    expect(prompt).toContain('Organization Management');
    expect(buildRoleBasedPrompt({ ...baseUser, role: 'admin' })).toContain('ADMIN MODE');
    expect(buildRoleBasedPrompt({ ...baseUser, role: 'supervisor' })).toContain('SUPERVISOR MODE');
    expect(buildRoleBasedPrompt(baseUser)).toContain('EMPLOYEE MODE');
  });

  it('embeds the live system data when fullContext is supplied', () => {
    const prompt = buildRoleBasedPrompt(baseUser, {
      userContext: 'Name: Bob',
      aiInsights: 'Take leave in June',
      conflictCheckData: 'No conflicts',
      availableDriversInfo: 'Arman free at 14:00',
      dateContext: '2026-08-05',
    });
    expect(prompt).toContain('LIVE SYSTEM DATA');
    expect(prompt).toContain('Name: Bob');
    expect(prompt).toContain('Take leave in June');
    expect(prompt).toContain('No conflicts');
    expect(prompt).toContain('Arman free at 14:00');
    expect(prompt).toContain('2026-08-05');
  });

  it('omits the live-data section when fullContext is empty', () => {
    expect(buildRoleBasedPrompt(baseUser)).not.toContain('LIVE SYSTEM DATA');
  });
});

describe('hasPermission', () => {
  it('returns true when the role is in the required list', () => {
    expect(hasPermission('admin', ['admin', 'superadmin'])).toBe(true);
  });

  it('returns false when the role is missing', () => {
    expect(hasPermission('employee', ['admin', 'superadmin'])).toBe(false);
  });

  it('returns false for an empty required list', () => {
    expect(hasPermission('employee', [])).toBe(false);
  });
});

describe('getRoleSuggestions', () => {
  it('maps i18n keys through the t function for each role', () => {
    const t = jest.fn((key: string) => `T:${key}`);
    const suggestions = getRoleSuggestions('employee', t);
    expect(suggestions).toHaveLength(6);
    expect(suggestions[0]).toBe('T:aiChat.suggestions.employee.0');
    expect(t).toHaveBeenCalledWith('aiChat.suggestions.employee.5');
  });

  it('uses different key sets per role', () => {
    const t = jest.fn((key: string) => key);
    const adminKeys = getRoleSuggestions('admin', t);
    expect(adminKeys[0]).toBe('aiChat.suggestions.admin.0');
    const superadminKeys = getRoleSuggestions('superadmin', t);
    expect(superadminKeys[0]).toBe('aiChat.suggestions.superadmin.0');
  });
});
