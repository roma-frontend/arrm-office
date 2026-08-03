/**
 * Tests for convex/settings.ts — auth checks and update behavior.
 *
 * Uses jest.isolateModules to avoid module caching conflicts.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

// ═════════════════════════════════════════════════════════════════════════════
// MOCKS
// ═════════════════════════════════════════════════════════════════════════════

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
}));

// ═════════════════════════════════════════════════════════════════════════════
// MODULE LOADING
// ═════════════════════════════════════════════════════════════════════════════

let settings: any;
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockGet: jest.Mock;
let mockPatch: jest.Mock;
let mockInsert: jest.Mock;

const ORG_A = 'org-aaa';
const ORG_B = 'org-bbb';

const callerA = {
  _id: 'user-1',
  name: 'User A',
  email: 'a@a.com',
  role: 'employee' as const,
  organizationId: ORG_A,
};
const callerB = {
  _id: 'user-2',
  name: 'User B',
  email: 'b@b.com',
  role: 'employee' as const,
  organizationId: ORG_B,
};
const adminA = {
  _id: 'user-admin-a',
  name: 'Admin A',
  email: 'aa@a.com',
  role: 'admin' as const,
  organizationId: ORG_A,
};
const superadmin = {
  _id: 'user-super',
  name: 'Super',
  email: 's@s.com',
  role: 'superadmin' as const,
  organizationId: ORG_A,
};

const sampleSettings = {
  _id: 'settings-1',
  userId: 'user-1',
  language: 'en',
  timezone: 'UTC',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24h',
  firstDayOfWeek: 'monday',
  theme: 'system',
  compactMode: false,
  defaultView: 'grid',
  dataRefreshRate: 30000,
  dashboardWidgets: {},
  notificationsEnabled: true,
  emailNotifications: true,
  pushNotifications: false,
  focusModeEnabled: false,
  workHoursStart: '09:00',
  workHoursEnd: '18:00',
  breakRemindersEnabled: true,
  breakInterval: 60,
  dailyTaskGoal: 5,
};

const sampleUser = {
  _id: 'user-1',
  name: 'User A',
  email: 'a@a.com',
  role: 'employee',
  organizationId: ORG_A,
  language: 'en',
  timezone: 'UTC',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24h',
  firstDayOfWeek: 'monday',
  theme: 'system',
  compactMode: false,
  defaultView: 'grid',
  dataRefreshRate: 30000,
  dashboardWidgets: {},
  notificationsEnabled: true,
  emailNotifications: true,
  pushNotifications: false,
  focusModeEnabled: false,
  workHoursStart: '09:00',
  workHoursEnd: '18:00',
  breakRemindersEnabled: true,
  breakInterval: 60,
  dailyTaskGoal: 5,
};

function makeQueryChain(fakeResult: any) {
  let chain: any = {
    withIndex: () => chain,
    filter: () => chain,
    order: () => chain,
    take: async () => (typeof fakeResult === 'function' ? fakeResult() : fakeResult),
    first: async () => (typeof fakeResult === 'function' ? fakeResult() : fakeResult),
  };
  return chain;
}

function makeCtx(queryResult?: any) {
  return {
    db: {
      get: mockGet,
      patch: mockPatch,
      insert: mockInsert,
      query: () => makeQueryChain(queryResult),
    },
  };
}

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;

    mockGet = jest.fn();
    mockPatch = jest.fn();
    mockInsert = jest.fn();

    settings = require('../../convex/settings');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: getUserSettings
// ═════════════════════════════════════════════════════════════════════════════

describe('settings.getUserSettings', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns null when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const result = await settings.getUserSettings.handler(makeCtx(null), {});
    expect(result).toBeNull();
  });

  it('returns defaults from existing settings doc', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValue(sampleSettings);

    const ctx = makeCtx(sampleSettings);
    const result = await settings.getUserSettings.handler(ctx, {});

    expect(result).toEqual({
      language: 'en',
      timezone: 'UTC',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      firstDayOfWeek: 'monday',
      theme: 'system',
      notificationsEnabled: true,
      emailNotifications: true,
      pushNotifications: false,
    });
  });

  it('derives defaults from the user doc without creating settings (queries cannot write)', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    // No settings doc (makeCtx(null)) → fall back to the users table, read-only.
    mockGet.mockResolvedValue(sampleUser);

    const ctx = makeCtx(null);
    const result = await settings.getUserSettings.handler(ctx, {});

    expect(mockInsert).not.toHaveBeenCalled();
    expect(result).toEqual({
      language: 'en',
      timezone: 'UTC',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      firstDayOfWeek: 'monday',
      theme: 'system',
      notificationsEnabled: true,
      emailNotifications: true,
      pushNotifications: false,
    });
  });

  it('throws when user not found during fallback creation', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet
      .mockResolvedValueOnce(null) // settings first() = null
      .mockResolvedValueOnce(null); // user not found

    const ctx = makeCtx(null);
    await expect(settings.getUserSettings.handler(ctx, {})).rejects.toThrow('User not found');
  });

  it('applies defaults for missing fields', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValue({ _id: 'settings-1', userId: 'user-1' }); // minimal doc

    const ctx = makeCtx({});
    const result = await settings.getUserSettings.handler(ctx, {});
    expect(result?.language).toBe('en');
    expect(result?.timezone).toBe('UTC');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: updateUserSettings
// ═════════════════════════════════════════════════════════════════════════════

describe('settings.updateUserSettings', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      settings.updateUserSettings.handler(makeCtx(null), {
        language: 'ru',
      }),
    ).rejects.toThrow('Not authenticated');
  });

  it('patches only provided fields', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValue(sampleSettings);

    const ctx = makeCtx(sampleSettings);
    await settings.updateUserSettings.handler(ctx, {
      language: 'ru',
      theme: 'dark',
    });

    expect(mockPatch).toHaveBeenCalledWith('settings-1', {
      language: 'ru',
      theme: 'dark',
    });
  });

  it('skips undefined values', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValue(sampleSettings);

    const ctx = makeCtx(sampleSettings);
    await settings.updateUserSettings.handler(ctx, {
      language: 'hy',
      timezone: undefined as any,
    });

    expect(mockPatch).toHaveBeenCalledWith('settings-1', { language: 'hy' });
  });

  it('returns success', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValue(sampleSettings);

    const ctx = makeCtx(sampleSettings);
    const result = await settings.updateUserSettings.handler(ctx, {
      timezone: 'Asia/Yerevan',
    });
    expect(result).toEqual({ success: true });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: updateLocalizationSettings
// ═════════════════════════════════════════════════════════════════════════════

describe('settings.updateLocalizationSettings', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      settings.updateLocalizationSettings.handler(makeCtx(null), {
        language: 'ru',
        timezone: 'Europe/Moscow',
        dateFormat: 'DD.MM.YYYY',
        timeFormat: '24h',
        firstDayOfWeek: 'monday',
      }),
    ).rejects.toThrow('Not authenticated');
  });

  it('updates settings and patches user record language', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValue(sampleSettings);

    const ctx = makeCtx(sampleSettings);
    await settings.updateLocalizationSettings.handler(ctx, {
      language: 'ru',
      timezone: 'Europe/Moscow',
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      firstDayOfWeek: 'monday',
    });

    expect(mockPatch).toHaveBeenCalledTimes(2);
    // First call: settings patch
    expect(mockPatch).toHaveBeenCalledWith('settings-1', {
      language: 'ru',
      timezone: 'Europe/Moscow',
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      firstDayOfWeek: 'monday',
    });
    // Second call: user record language
    expect(mockPatch).toHaveBeenCalledWith('user-1', { language: 'ru' });
  });

  it('returns success', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValue(sampleSettings);

    const ctx = makeCtx(sampleSettings);
    const result = await settings.updateLocalizationSettings.handler(ctx, {
      language: 'ru',
      timezone: 'Europe/Moscow',
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      firstDayOfWeek: 'monday',
    });
    expect(result).toEqual({ success: true });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: updateNotificationSettings
// ═════════════════════════════════════════════════════════════════════════════

describe('settings.updateNotificationSettings', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      settings.updateNotificationSettings.handler(makeCtx(null), {
        notificationsEnabled: true,
        emailNotifications: false,
        pushNotifications: true,
      }),
    ).rejects.toThrow('Not authenticated');
  });

  it('patches notification fields', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValue(sampleSettings);

    const ctx = makeCtx(sampleSettings);
    await settings.updateNotificationSettings.handler(ctx, {
      notificationsEnabled: false,
      emailNotifications: false,
      pushNotifications: true,
    });

    expect(mockPatch).toHaveBeenCalledWith('settings-1', {
      notificationsEnabled: false,
      emailNotifications: false,
      pushNotifications: true,
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: updateThemeSettings
// ═════════════════════════════════════════════════════════════════════════════

describe('settings.updateThemeSettings', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      settings.updateThemeSettings.handler(makeCtx(null), {
        theme: 'dark',
      }),
    ).rejects.toThrow('Not authenticated');
  });

  it('updates theme only', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValue(sampleSettings);

    const ctx = makeCtx(sampleSettings);
    await settings.updateThemeSettings.handler(ctx, { theme: 'dark' });

    expect(mockPatch).toHaveBeenCalledWith('settings-1', { theme: 'dark' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: updateSessionProfile
// ═════════════════════════════════════════════════════════════════════════════

describe('settings.updateSessionProfile', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      settings.updateSessionProfile.handler(makeCtx(null), {
        profile: { language: 'de' },
      }),
    ).rejects.toThrow('Not authenticated');
  });

  it('patches only defined profile fields', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValue(sampleSettings);

    const ctx = makeCtx(sampleSettings);
    await settings.updateSessionProfile.handler(ctx, {
      profile: { language: 'de', timezone: 'Europe/Berlin', randomField: 'ignored' },
    });

    expect(mockPatch).toHaveBeenCalledWith('settings-1', {
      language: 'de',
      timezone: 'Europe/Berlin',
    });
  });

  it('skips patch when no recognized fields change', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValue(sampleSettings);

    const ctx = makeCtx(sampleSettings);
    await settings.updateSessionProfile.handler(ctx, {
      profile: { randomField: 'foo' },
    });

    expect(mockPatch).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: getOrganizationSettings
// ═════════════════════════════════════════════════════════════════════════════

describe('settings.getOrganizationSettings', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
  });

  it('throws when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      settings.getOrganizationSettings.handler(makeCtx(null), {
        organizationId: ORG_A as any,
      }),
    ).rejects.toThrow('Not authenticated');
  });

  it('allows same-org caller to read org settings', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValue({
      _id: ORG_A,
      taxCountry: 'armenia',
      currency: 'AMD',
      payrollCycle: 'monthly',
      overtimeMultiplier: 1.5,
    });

    const ctx = makeCtx(null);
    const result = await settings.getOrganizationSettings.handler(ctx, {
      organizationId: ORG_A as any,
    });
    expect(result.currency).toBe('AMD');
    expect(result.taxCountry).toBe('armenia');
  });

  it('throws for cross-org caller (non-superadmin)', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValue({ _id: ORG_B, taxCountry: 'usa', currency: 'USD' });

    const ctx = makeCtx(null);
    await expect(
      settings.getOrganizationSettings.handler(ctx, {
        organizationId: ORG_B as any,
      }),
    ).rejects.toThrow('Access denied');
  });

  it('allows superadmin to read any org', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    mockIsSuperadmin.mockReturnValue(true);
    mockGet.mockResolvedValue({ _id: ORG_B, taxCountry: 'usa', currency: 'USD' });

    const ctx = makeCtx(null);
    const result = await settings.getOrganizationSettings.handler(ctx, {
      organizationId: ORG_B as any,
    });
    expect(result.currency).toBe('USD');
  });

  it('throws when organization not found', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValue(null);

    const ctx = makeCtx(null);
    await expect(
      settings.getOrganizationSettings.handler(ctx, {
        organizationId: ORG_A as any, // same org as caller, so org-scope check passes
      }),
    ).rejects.toThrow('Organization not found');
  });

  it('applies defaults for missing org fields', async () => {
    mockGetAuthCaller.mockResolvedValue(callerA);
    mockGet.mockResolvedValue({ _id: ORG_A }); // minimal org

    const ctx = makeCtx(null);
    const result = await settings.getOrganizationSettings.handler(ctx, {
      organizationId: ORG_A as any,
    });
    expect(result.taxCountry).toBe('armenia');
    expect(result.currency).toBe('AMD');
    expect(result.payrollCycle).toBe('monthly');
    expect(result.overtimeMultiplier).toBe(1.5);
  });
});
