/**
 * Tests for chat-context.ts — Chat context-fetching utilities for the AI assistant.
 *
 * Tests the pure functions (parseDateFromMessage, fetchWithTimeout, interfaces)
 * that can be tested without HTTP mocking. The larger `processUserContext`,
 * `processAIInsights`, etc. are integration-level and tested via mocks here.
 */

import { fetchAllContexts, type ContextResult } from '@/lib/chat-context';

// ════════════════════════════════════════════════════════════════════════════
// Type / Interface tests
// ════════════════════════════════════════════════════════════════════════════

describe('ContextResult interface shape', () => {
  it('has all expected string fields', () => {
    const result: ContextResult = {
      userContext: 'user info',
      aiInsights: 'ai insights',
      fullContext: 'full org context',
      conflictCheckData: 'no conflicts',
      availableDriversInfo: 'driver info',
      userRole: 'employee',
      userEmail: 'user@org.com',
      userName: 'John',
      userDepartment: 'Engineering',
      userPosition: 'Dev',
      userOrgId: 'org-123',
    };
    expect(result.userContext).toBe('user info');
    expect(result.userRole).toBe('employee');
    expect(result.userEmail).toBe('user@org.com');
    expect(result.availableDriversInfo).toBe('driver info');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// fetchAllContexts — with mocked fetch
// ════════════════════════════════════════════════════════════════════════════

describe('fetchAllContexts', () => {
  const baseOptions = {
    origin: 'http://localhost:3000',
    cookieHeader: 'hr-auth-token=test-token',
    userId: 'user-1',
    authOrgId: 'org-1',
    lastUserMessage: 'book leave from 15.06',
    needsInsights: false,
    needsFullContext: false,
    needsConflictCheck: false,
  };

  const originalFetch = global.fetch;

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock: all fetch calls resolve but return ok: false
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    });
  });

  it('returns default values when all fetches fail', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    const result = await fetchAllContexts(baseOptions);
    expect(result.userContext).toBe('');
    expect(result.aiInsights).toBe('');
    expect(result.fullContext).toBe('');
    expect(result.conflictCheckData).toBe('');
    expect(result.availableDriversInfo).toBe('');
    expect(result.userRole).toBe('employee');
  });

  it('uses cookie-based auth headers', async () => {
    await fetchAllContexts(baseOptions);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { cookie: 'hr-auth-token=test-token' },
      }),
    );
  });

  it('requests insights when needsInsights is true and userId is provided', async () => {
    // Make the context endpoint succeed so we can see insights is also called
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/chat/context')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              user: {
                name: 'Test',
                role: 'employee',
                department: 'IT',
                position: 'Dev',
                email: 't@org.com',
                organizationId: 'org-1',
              },
              leaveBalances: { paid: 10, sick: 5, family: 3, unpaid: 2 },
              stats: { totalDaysTaken: 0, pendingDays: 0 },
            }),
        });
      }
      if (url.includes('/api/chat/insights')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ patterns: ['pattern1'] }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    await fetchAllContexts({ ...baseOptions, needsInsights: true });

    const calls = (global.fetch as jest.Mock).mock.calls;
    const insightsCall = calls.find((call: any) => String(call[0]).includes('/api/chat/insights'));
    expect(insightsCall).toBeDefined();
  });

  it('returns empty insights when needsInsights is false', async () => {
    const result = await fetchAllContexts(baseOptions);
    expect(result.aiInsights).toBe('');
  });

  it('returns empty insights when userId is empty', async () => {
    const result = await fetchAllContexts({
      ...baseOptions,
      userId: '',
      needsInsights: true,
    });
    expect(result.aiInsights).toBe('');
  });

  it('returns empty conflictCheckData when needsConflictCheck is false', async () => {
    const result = await fetchAllContexts(baseOptions);
    expect(result.conflictCheckData).toBe('');
  });

  it('returns empty conflictCheckData when userId is empty even with needsConflictCheck', async () => {
    const result = await fetchAllContexts({
      ...baseOptions,
      userId: '',
      needsConflictCheck: true,
      lastUserMessage: 'leave from 15.06',
    });
    expect(result.conflictCheckData).toBe('');
  });

  it('requests full context when needsFullContext is true', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/chat/context')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              user: {
                name: 'Test',
                role: 'employee',
                department: 'IT',
                position: 'Dev',
                email: 't@org.com',
                organizationId: 'org-1',
              },
              leaveBalances: { paid: 10, sick: 5, family: 3, unpaid: 2 },
              stats: { totalDaysTaken: 0, pendingDays: 0 },
            }),
        });
      }
      if (url.includes('/api/chat/full-context')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: false });
    });

    await fetchAllContexts({ ...baseOptions, needsFullContext: true });

    const calls = (global.fetch as jest.Mock).mock.calls;
    const fullContextCall = calls.find((call: any) =>
      String(call[0]).includes('/api/chat/full-context'),
    );
    expect(fullContextCall).toBeDefined();
  });

  it('returns empty fullContext when needsFullContext is false', async () => {
    const result = await fetchAllContexts(baseOptions);
    expect(result.fullContext).toBe('');
    expect(result.availableDriversInfo).toBe('');
  });

  it('populates user context from API response', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/chat/context')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              user: {
                name: 'Bob',
                role: 'manager',
                department: 'Sales',
                position: 'Manager',
                email: 'bob@org.com',
                organizationId: 'org-2',
              },
              leaveBalances: { paid: 15, sick: 10, family: 5, unpaid: 0 },
              stats: { totalDaysTaken: 3, pendingDays: 0 },
              recentLeaves: [
                {
                  type: 'paid',
                  startDate: '2024-01-01',
                  endDate: '2024-01-05',
                  status: 'approved',
                },
              ],
              teamAvailability: [
                { userName: 'Charlie', startDate: '2024-01-10', endDate: '2024-01-12' },
              ],
            }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const result = await fetchAllContexts(baseOptions);
    expect(result.userContext).toContain('Bob');
    expect(result.userContext).toContain('manager');
    expect(result.userContext).toContain('Paid=15');
    expect(result.userEmail).toBe('bob@org.com');
    expect(result.userDepartment).toBe('Sales');
    expect(result.userPosition).toBe('Manager');
    expect(result.userOrgId).toBe('org-2');
  });

  it('handles partial fetch failures gracefully', async () => {
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              user: {
                name: 'Alice',
                role: 'admin',
                department: 'Engineering',
                position: 'Lead',
                email: 'alice@org.com',
                organizationId: 'org-1',
              },
              leaveBalances: { paid: 10, sick: 5, family: 3, unpaid: 2 },
              stats: { totalDaysTaken: 5, pendingDays: 1 },
            }),
        });
      }
      return Promise.reject(new Error('fail'));
    });

    const result = await fetchAllContexts({
      ...baseOptions,
      needsInsights: true,
      needsFullContext: true,
      needsConflictCheck: true,
    });

    expect(result.userContext).toContain('Alice');
    expect(result.userRole).toBe('admin');
    expect(result.userName).toBe('Alice');
    // Other fields should have fallback values
    expect(result.aiInsights).toBe('');
    expect(result.fullContext).toBe('');
  });
});
