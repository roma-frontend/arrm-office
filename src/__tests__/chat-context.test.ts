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

  it('returns empty insights when the insights endpoint fails', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/chat/context')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { name: 'T', role: 'employee', email: 't@o.com', organizationId: 'o' },
              leaveBalances: { paid: 1, sick: 1, family: 1, unpaid: 0 },
              stats: { totalDaysTaken: 0, pendingDays: 0 },
            }),
        });
      }
      if (url.includes('/api/chat/insights')) {
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve({ ok: false });
    });

    const result = await fetchAllContexts({ ...baseOptions, needsInsights: true });
    expect(result.aiInsights).toBe('');
  });

  it('assembles all insight sections when present', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/chat/context')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { name: 'T', role: 'employee', email: 't@o.com', organizationId: 'o' },
              leaveBalances: { paid: 1, sick: 1, family: 1, unpaid: 0 },
              stats: { totalDaysTaken: 0, pendingDays: 0 },
            }),
        });
      }
      if (url.includes('/api/chat/insights')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              balanceWarning: 'Low balance',
              patterns: ['pattern-a', 'pattern-b', 'pattern-c', 'pattern-d'],
              bestDates: ['15.06', '20.06', '25.06', '30.06'],
              teamConflicts: ['conflict-1', 'conflict-2'],
            }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const result = await fetchAllContexts({ ...baseOptions, needsInsights: true });
    expect(result.aiInsights).toContain('⚠️ Low balance');
    expect(result.aiInsights).toContain('Patterns: pattern-a, pattern-b, pattern-c');
    expect(result.aiInsights).toContain('Best dates: 15.06, 20.06, 25.06');
    expect(result.aiInsights).toContain('Conflicts: conflict-1, conflict-2');
  });

  it('skips empty insight sections', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/chat/context')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { name: 'T', role: 'employee', email: 't@o.com', organizationId: 'o' },
              leaveBalances: { paid: 1, sick: 1, family: 1, unpaid: 0 },
              stats: { totalDaysTaken: 0, pendingDays: 0 },
            }),
        });
      }
      if (url.includes('/api/chat/insights')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: false });
    });

    const result = await fetchAllContexts({ ...baseOptions, needsInsights: true });
    expect(result.aiInsights).toBe('');
  });

  it('reports conflicts when the conflict-check finds them', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/chat/context')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { name: 'T', role: 'employee', email: 't@o.com', organizationId: 'o' },
              leaveBalances: { paid: 1, sick: 1, family: 1, unpaid: 0 },
              stats: { totalDaysTaken: 0, pendingDays: 0 },
            }),
        });
      }
      if (url.includes('/api/chat/conflict-check')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ hasConflicts: true, conflictCount: 3, aiMessage: 'Team overlap' }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const result = await fetchAllContexts({
      ...baseOptions,
      needsConflictCheck: true,
      lastUserMessage: 'book leave from 15.06',
    });
    expect(result.conflictCheckData).toContain('CONFLICTS: 3 found');
    expect(result.conflictCheckData).toContain('Team overlap');
  });

  it('reports no conflicts when the conflict-check finds none', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/chat/context')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { name: 'T', role: 'employee', email: 't@o.com', organizationId: 'o' },
              leaveBalances: { paid: 1, sick: 1, family: 1, unpaid: 0 },
              stats: { totalDaysTaken: 0, pendingDays: 0 },
            }),
        });
      }
      if (url.includes('/api/chat/conflict-check')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ hasConflicts: false, conflictCount: 0, aiMessage: '' }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const result = await fetchAllContexts({
      ...baseOptions,
      needsConflictCheck: true,
      lastUserMessage: 'book leave from 15.06',
    });
    expect(result.conflictCheckData).toContain('No conflicts detected');
  });

  it('sends the driver request type when the message mentions a driver', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/chat/context')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { name: 'T', role: 'employee', email: 't@o.com', organizationId: 'o' },
              leaveBalances: { paid: 1, sick: 1, family: 1, unpaid: 0 },
              stats: { totalDaysTaken: 0, pendingDays: 0 },
            }),
        });
      }
      if (url.includes('/api/chat/conflict-check')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ hasConflicts: false }) });
      }
      return Promise.resolve({ ok: false });
    });

    await fetchAllContexts({
      ...baseOptions,
      needsConflictCheck: true,
      lastUserMessage: 'нужен водитель с 20/07',
    });
    const calls = (global.fetch as jest.Mock).mock.calls;
    const conflictCall = calls.find((call: any) =>
      String(call[0]).includes('/api/chat/conflict-check'),
    );
    expect(conflictCall).toBeDefined();
    expect(String(conflictCall[0])).toContain('requestType=driver');
  });

  it('skips the conflict check when the message has no date', async () => {
    const result = await fetchAllContexts({
      ...baseOptions,
      needsConflictCheck: true,
      lastUserMessage: 'hello there',
    });
    expect(result.conflictCheckData).toBe('');
    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls.some((call: any) => String(call[0]).includes('/api/chat/conflict-check'))).toBe(
      false,
    );
  });

  it('builds a full-context summary from employees, calendar, attendance, tickets and drivers', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/chat/context')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { name: 'T', role: 'employee', email: 't@o.com', organizationId: 'o' },
              leaveBalances: { paid: 1, sick: 1, family: 1, unpaid: 0 },
              stats: { totalDaysTaken: 0, pendingDays: 0 },
            }),
        });
      }
      if (url.includes('/api/chat/full-context')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              totalEmployees: 10,
              currentlyAtWork: 7,
              onLeaveToday: 1,
              employees: [
                { name: 'Ann', department: 'Sales', presenceStatus: 'available' },
                { name: 'Bob', department: 'Eng', presenceStatus: 'in_meeting' },
                {
                  name: 'Cid',
                  department: 'HR',
                  presenceStatus: 'out_of_office',
                  currentLeave: { type: 'paid', startDate: '01.06', endDate: '05.06' },
                  pendingLeaves: [{ type: 'sick', startDate: '10.06', endDate: '11.06' }],
                },
              ],
              calendarEvents: [
                { employee: 'Ann', type: 'paid', startDate: '01.06', endDate: '05.06' },
              ],
              todayAttendance: [
                { name: 'Ann', status: 'checked_in', checkIn: '09:00', isLate: false },
                { name: 'Bob', status: 'absent', isLate: true, lateMinutes: 15 },
              ],
              tickets: [
                { ticketNumber: 'SUP-1', title: 'Printer', status: 'open', isOverdue: true },
              ],
              ticketStats: { total: 12 },
              availableDrivers: [{ userName: 'Dan', vehicleInfo: { model: 'Toyota' } }],
            }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const result = await fetchAllContexts({ ...baseOptions, needsFullContext: true });
    expect(result.fullContext).toContain('10 employees, 7 at work, 1 on leave');
    expect(result.fullContext).toContain('🟢 Ann (Sales)');
    expect(result.fullContext).toContain('📅 Bob (Eng)');
    expect(result.fullContext).toContain('ON LEAVE: paid (01.06-05.06)');
    expect(result.fullContext).toContain('Pending: 1');
    expect(result.fullContext).toContain('📅 Ann: paid 01.06-05.06');
    expect(result.fullContext).toContain('SUP-1: Printer [open] ⚠️');
    expect(result.fullContext).toContain('Tickets (12 total)');
    expect(result.fullContext).toContain('🚘 Dan: Toyota [Available]');
  });

  it('shows placeholders when full-context data is empty', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/chat/context')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { name: 'T', role: 'employee', email: 't@o.com', organizationId: 'o' },
              leaveBalances: { paid: 1, sick: 1, family: 1, unpaid: 0 },
              stats: { totalDaysTaken: 0, pendingDays: 0 },
            }),
        });
      }
      if (url.includes('/api/chat/full-context')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: false });
    });

    const result = await fetchAllContexts({ ...baseOptions, needsFullContext: true });
    expect(result.fullContext).toContain('0 employees, 0 at work, 0 on leave');
    expect(result.fullContext).toContain('Employees:\nNo data');
    expect(result.fullContext).toContain('No upcoming leaves');
    expect(result.fullContext).toContain('No tickets');
    expect(result.fullContext).toContain('No drivers');
  });

  it('renders the in-call presence status', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/chat/context')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { name: 'T', role: 'employee', email: 't@o.com', organizationId: 'o' },
              leaveBalances: { paid: 1, sick: 1, family: 1, unpaid: 0 },
              stats: { totalDaysTaken: 0, pendingDays: 0 },
            }),
        });
      }
      if (url.includes('/api/chat/full-context')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              employees: [{ name: 'Zoe', department: 'Ops', presenceStatus: 'in_call' }],
            }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const result = await fetchAllContexts({ ...baseOptions, needsFullContext: true });
    expect(result.fullContext).toContain('📞 Zoe (Ops)');
  });

  it('renders the default presence status for unknown values', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/chat/context')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { name: 'T', role: 'employee', email: 't@o.com', organizationId: 'o' },
              leaveBalances: { paid: 1, sick: 1, family: 1, unpaid: 0 },
              stats: { totalDaysTaken: 0, pendingDays: 0 },
            }),
        });
      }
      if (url.includes('/api/chat/full-context')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              employees: [{ name: 'Sam', department: 'Ops', presenceStatus: 'busy' }],
            }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const result = await fetchAllContexts({ ...baseOptions, needsFullContext: true });
    expect(result.fullContext).toContain('⛔ Sam (Ops)');
  });

  it('falls back to an empty full-context when the endpoint is unavailable', async () => {
    const result = await fetchAllContexts({ ...baseOptions, needsFullContext: true });
    expect(result.fullContext).toBe('');
  });
});
