/**
 * Tests for AI Assistant capabilities (src/lib/aiAssistant.ts)
 * Tests: AI_CAPABILITIES data integrity, AICapability type
 */

import { AI_CAPABILITIES } from '@/lib/aiAssistant';

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
