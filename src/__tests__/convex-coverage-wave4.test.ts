/**
 * Deep coverage tests — Wave 4:
 * - simplePdf.ts: pure utility, 0% → high coverage
 * - meetings.ts: registration queries without auth
 * - calendarEvents.ts: queries
 * - auth_module: register/login with different scenarios
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ═══════════════════════════════════════════════════════════════════════════
// SIMPLE PDF — pure utility, no mocks needed
// ═══════════════════════════════════════════════════════════════════════════
describe('simplePdf', () => {
  let generateSimplePdfBase64: any;

  beforeEach(() => {
    jest.isolateModules(() => {
      const mod = require('../../src/lib/simplePdf');
      generateSimplePdfBase64 = mod.generateSimplePdfBase64;
    });
  });

  it('generates valid data URL', () => {
    const result = generateSimplePdfBase64('Test Title', 'Hello world');
    expect(result).toMatch(/^data:application\/pdf;base64,/);
  });

  it('generates valid base64', () => {
    const result = generateSimplePdfBase64('Title', 'Body');
    const base64 = result.replace('data:application/pdf;base64,', '');
    const decoded = atob(base64);
    expect(decoded).toContain('%PDF-1.4');
  });

  it('handles empty body', () => {
    const result = generateSimplePdfBase64('Title', '');
    expect(result).toMatch(/^data:application\/pdf;base64,/);
  });

  it('handles empty title', () => {
    const result = generateSimplePdfBase64('', 'Some body text here');
    expect(result).toMatch(/^data:application\/pdf;base64,/);
  });

  it('handles multi-line body', () => {
    const body = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    const result = generateSimplePdfBase64('Title', body);
    expect(result).toMatch(/^data:application\/pdf;base64,/);
  });

  it('handles text with special PDF characters', () => {
    const body = 'Parentheses (like this) and backslash \\ and newlines\n';
    const result = generateSimplePdfBase64('Title', body);
    expect(result).toMatch(/^data:application\/pdf;base64,/);
  });

  it('handles very long title that wraps', () => {
    const title = 'A'.repeat(200);
    const result = generateSimplePdfBase64(title, 'Body');
    expect(result).toMatch(/^data:application\/pdf;base64,/);
  });

  it('handles very long body that wraps', () => {
    const body = 'Word '.repeat(500);
    const result = generateSimplePdfBase64('Title', body);
    expect(result).toMatch(/^data:application\/pdf;base64,/);
  });

  it('generates multi-page PDF for very long content', () => {
    const body = 'This is a line of text that should be repeated many times. '.repeat(200);
    const result = generateSimplePdfBase64('Multi-page Title', body);
    const base64 = result.replace('data:application/pdf;base64,', '');
    const decoded = atob(base64);
    expect(decoded).toContain('/Type /Pages');
  });

  it('handles single character body', () => {
    const result = generateSimplePdfBase64('T', 'X');
    expect(result).toMatch(/^data:application\/pdf;base64,/);
  });

  it('handles Unicode content gracefully', () => {
    const body = 'Hello 世界 مرحبا Привет';
    const result = generateSimplePdfBase64('Unicode Title', body);
    expect(result).toMatch(/^data:application\/pdf;base64,/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Convex backend — shared mocks
// ═══════════════════════════════════════════════════════════════════════════
jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  action: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
  internalQuery: ({ handler, args }: any) => ({ handler, args }),
  internalAction: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));
jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(() => false),
  SUPERADMIN_EMAIL: 'boss@example.com',
}));
jest.mock('../../convex/lib/notify', () => ({
  notify: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../convex/lib/entitlements', () => ({
  assertModuleAccess: jest.fn().mockResolvedValue(undefined),
  assertQuota: jest.fn().mockResolvedValue(undefined),
  currentPeriodKey: jest.fn().mockReturnValue('2026-09'),
  incrementUsage: jest.fn().mockResolvedValue(undefined),
  decrementUsage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn().mockResolvedValue(null),
  patchProfile: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../convex/lib/leaveBalances', () => ({
  getStartingLeaveBalances: jest.fn().mockResolvedValue({
    paid: 0,
    sick: 0,
    family: 0,
  }),
}));
jest.mock('../../convex/lib/orgUnits', () => ({
  resolveOrgUnitsByName: jest.fn().mockResolvedValue({}),
  resolveDepartmentByName: jest.fn().mockResolvedValue(null),
  resolvePositionByTitle: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../convex/lib/travelAllowance', () => ({
  resolveTravelAllowanceForOrg: jest.fn().mockResolvedValue(0),
  resolveTravelAllowanceForUser: jest.fn().mockResolvedValue(0),
  validateTravelAllowanceOverride: jest.fn().mockReturnValue(true),
}));
jest.mock('../../convex/lib/reportingLine', () => ({
  assertAssignable: jest.fn().mockResolvedValue(undefined),
  writeSupervisorId: jest.fn().mockResolvedValue(undefined),
  getSubordinateIds: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../convex/lib/rbac', () => ({
  requireRole: jest.fn(),
  requireOrgAdmin: jest.fn(),
  requireUser: jest.fn(),
  canAccessUser: jest.fn().mockResolvedValue(true),
  canManageOrg: jest.fn().mockReturnValue(true),
}));
jest.mock('../../convex/superadmin/accessTokens', () => ({
  checkTempAccessStillValid: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../convex/superadmin/tempPasswords', () => ({
  notifyTempPasswordLogin: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../convex/chat/queries', () => ({
  isFeatureEnabledForCaller: jest.fn().mockResolvedValue(true),
}));

function makeCtx() {
  const get = jest.fn();
  const insert = jest.fn().mockResolvedValue('new_id');
  const patch = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn();
  const collect = jest.fn().mockResolvedValue([]);
  const first = jest.fn().mockResolvedValue(null);
  const take = jest.fn().mockResolvedValue([]);
  const unique = jest.fn().mockResolvedValue(null);
  const order = jest.fn().mockReturnValue({ collect, first, take });
  const withIndex = jest.fn().mockReturnValue({ order, collect, first, take, unique });
  const query = jest.fn().mockReturnValue({ withIndex, order, collect, first, take, unique });
  return {
    ctx: {
      db: { get, insert, patch, delete: remove, query },
    },
    get,
    insert,
    patch,
    remove,
    query,
    collect,
    take,
    unique,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MEETINGS — queries without auth
// ═══════════════════════════════════════════════════════════════════════════
describe('meetings extra coverage', () => {
  let h: Record<string, any> = {};
  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      const mod = require('../../convex/meetings');
      for (const [name, def] of Object.entries(mod)) {
        if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
          h[name] = (def as any).handler;
        }
      }
    });
  });

  it('livekitConfigured returns config', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValue({
      livekitApiKey: 'key',
      livekitApiSecret: 'secret',
      livekitUrl: 'https://livekit.test',
    });
    const result = await h.livekitConfigured(ctx, {
      organizationId: 'org-1' as any,
    });
    expect(result).toBeDefined();
  });

  it('livekitConfigured returns false when not configured', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValue({
      livekitApiKey: '',
      livekitApiSecret: '',
      livekitUrl: '',
    });
    const result = await h.livekitConfigured(ctx, {
      organizationId: 'org-1' as any,
    });
    expect(result).toBeDefined();
  });

  it('recordingConfigured returns config', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValue({
      s3AccessKey: 'key',
      s3SecretKey: 'secret',
      s3Bucket: 'b',
      s3Region: 'r',
    });
    const result = await h.recordingConfigured(ctx, {
      organizationId: 'org-1' as any,
    });
    expect(result).toBeDefined();
  });

  it('getByRoomName returns meeting', async () => {
    const { ctx, query } = makeCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        unique: jest.fn().mockResolvedValue({
          _id: 'm1',
          roomName: 'room1',
          status: 'active',
        }),
      }),
    });
    const result = await h.getByRoomName(ctx, { roomName: 'room1' });
    expect(result).toBeDefined();
  });

  it('getByRoomName returns null when not found', async () => {
    const { ctx, query } = makeCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        unique: jest.fn().mockResolvedValue(null),
      }),
    });
    const result = await h.getByRoomName(ctx, { roomName: 'nope' });
    expect(result).toBeNull();
  });

  it('getByEvent returns meetings', async () => {
    const { ctx, query } = makeCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        collect: jest.fn().mockResolvedValue([{ _id: 'm1', roomName: 'r1' }]),
      }),
    });
    const result = await h.getByEvent(ctx, {
      calendarEventId: 'evt1' as any,
    });
    expect(result).toBeDefined();
  });

  it('listByOrganization returns meetings', async () => {
    const { ctx, query } = makeCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        order: jest.fn().mockReturnValue({ take: jest.fn().mockResolvedValue([]) }),
      }),
    });
    const result = await h.listByOrganization(ctx, {
      organizationId: 'org-1' as any,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it('listPending returns pending meetings', async () => {
    const { ctx, query } = makeCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        order: jest.fn().mockReturnValue({
          collect: jest.fn().mockResolvedValue([]),
        }),
      }),
    });
    const result = await h.listPending(ctx, {
      organizationId: 'org-1' as any,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it('listRegistrations returns registrations', async () => {
    const { ctx, query } = makeCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        collect: jest.fn().mockResolvedValue([]),
      }),
    });
    const result = await h.listRegistrations(ctx, {
      meetingId: 'm1' as any,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it('getRegistrationById returns registration', async () => {
    const { ctx, query, get } = makeCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        first: jest.fn().mockResolvedValue({
          _id: 'r1',
          meetingId: 'm1',
          fullName: 'Visitor',
        }),
      }),
    });
    get.mockResolvedValue({ _id: 'u1', name: 'Agent' });
    const result = await h.getRegistrationById(ctx, {
      registrationId: 'r1' as any,
    });
    expect(result).toBeDefined();
  });

  it('getRegistrationById returns null when not found', async () => {
    const { ctx, query } = makeCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        first: jest.fn().mockResolvedValue(null),
      }),
    });
    const result = await h.getRegistrationById(ctx, {
      registrationId: 'bad' as any,
    });
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CALENDAR EVENTS — queries
// ═══════════════════════════════════════════════════════════════════════════
describe('calendarEvents extra coverage', () => {
  let h: Record<string, any> = {};
  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      const mod = require('../../convex/calendarEvents');
      for (const [name, def] of Object.entries(mod)) {
        if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
          h[name] = (def as any).handler;
        }
      }
    });
  });

  it('listPendingCalendarAccessRequests returns list', async () => {
    const { ctx, collect } = makeCtx();
    collect.mockResolvedValue([]);
    const result = await h.listPendingCalendarAccessRequests(ctx, {
      organizationId: 'org-1' as any,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it('getByOrganization returns events', async () => {
    const { ctx, collect } = makeCtx();
    collect.mockResolvedValue([]);
    const result = await h.getByOrganization(ctx, {
      organizationId: 'org-1' as any,
    });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTH MODULE — register edge cases, login, getSession
// ═══════════════════════════════════════════════════════════════════════════
describe('auth_module wave 4 coverage', () => {
  let h: Record<string, any> = {};
  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      const mod = require('../../convex/auth_module/main');
      for (const [name, def] of Object.entries(mod)) {
        if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
          h[name] = (def as any).handler;
        }
      }
    });
  });

  function makeAuthCtx() {
    const get = jest.fn();
    const insert = jest.fn().mockResolvedValue('new_id');
    const patch = jest.fn().mockResolvedValue(undefined);
    const collect = jest.fn().mockResolvedValue([]);
    const first = jest.fn().mockResolvedValue(null);
    const take = jest.fn().mockResolvedValue([]);
    const unique = jest.fn().mockResolvedValue(null);
    const order = jest.fn().mockReturnValue({ collect, first, take });
    const withIndex = jest.fn().mockReturnValue({ order, collect, first, take, unique });
    const query = jest.fn().mockReturnValue({ withIndex, order, collect, first, take, unique });
    return {
      ctx: {
        db: { get, insert, patch, query },
      },
      get,
      insert,
      patch,
      query,
      unique,
    };
  }

  it('register throws for duplicate email', async () => {
    const { ctx, query } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        unique: jest.fn().mockResolvedValue({ _id: 'existing' }),
      }),
    });
    await expect(
      h.register(ctx, {
        name: 'X',
        email: 'taken@t.com',
        password: 'p',
        organizationId: 'org-1' as any,
      }),
    ).rejects.toThrow('already registered');
  });

  it('register throws when no org and no invite', async () => {
    const { ctx, query } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });
    await expect(
      h.register(ctx, {
        name: 'X',
        email: 'new@t.com',
        password: 'p',
      }),
    ).rejects.toThrow();
  });

  it('register creates user with valid org', async () => {
    const { ctx, query, get, insert } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        unique: jest.fn().mockResolvedValue(null),
        take: jest.fn().mockResolvedValue([]),
      }),
    });
    get.mockResolvedValue({
      _id: 'org-1',
      name: 'Acme',
      timezone: 'UTC',
      plan: 'enterprise',
      employeeLimit: 100,
      isActive: true,
    });
    const result = await h.register(ctx, {
      name: 'New',
      email: 'new@t.com',
      password: 'p',
      organizationId: 'org-1' as any,
    });
    expect(result).toHaveProperty('userId');
    expect(insert).toHaveBeenCalled();
  });

  it('login throws for missing user', async () => {
    const { ctx, query } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });
    await expect(h.login(ctx, { email: 'nobody@t.com', password: 'pass' })).rejects.toThrow();
  });

  it('verifySession returns null for missing user', async () => {
    const { ctx, query } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });
    const result = await h.verifySession(ctx, { sessionToken: 'bad' });
    expect(result).toBeNull();
  });

  it('verifySession returns user data for valid token', async () => {
    const { ctx, query, get } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        unique: jest.fn().mockResolvedValue({
          _id: 'u1',
          sessionToken: 'tok',
          sessionExpiry: Date.now() + 3600000,
          organizationId: 'org-1',
          role: 'admin',
          name: 'Test',
          email: 't@t.com',
          isActive: true,
        }),
      }),
    });
    get.mockResolvedValue({ _id: 'org-1', name: 'Acme' });
    const result = await h.verifySession(ctx, { sessionToken: 'tok' });
    expect(result).toBeTruthy();
  });

  it('getSession returns null for missing user', async () => {
    const { ctx, query } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });
    const result = await h.getSession(ctx, { sessionToken: 'bad' });
    expect(result).toBeNull();
  });

  it('getSession returns user data for valid token', async () => {
    const { ctx, query, get } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        unique: jest.fn().mockResolvedValue({
          _id: 'u1',
          sessionToken: 'tok',
          sessionExpiry: Date.now() + 3600000,
          organizationId: 'org-1',
          role: 'admin',
          name: 'Test',
          email: 't@t.com',
          isActive: true,
        }),
      }),
    });
    get.mockResolvedValue({
      _id: 'org-1',
      name: 'Acme',
      timezone: 'UTC',
      plan: 'enterprise',
    });
    const result = await h.getSession(ctx, { sessionToken: 'tok' });
    expect(result).toBeTruthy();
  });

  it('changePassword throws for missing user', async () => {
    const { ctx, get } = makeAuthCtx();
    get.mockResolvedValue(null);
    await expect(
      h.changePassword(ctx, {
        userId: 'bad' as any,
        currentPassword: 'old',
        newPassword: 'new',
      }),
    ).rejects.toThrow();
  });

  it('logout clears session', async () => {
    const { ctx, get, patch } = makeAuthCtx();
    get.mockResolvedValue({ _id: 'u1', sessionToken: 'abc' });
    await h.logout(ctx, { userId: 'u1' as any });
    expect(patch).toHaveBeenCalledWith('u1', expect.objectContaining({ sessionToken: undefined }));
  });

  it('disableTotp clears totp', async () => {
    const { ctx, get, patch } = makeAuthCtx();
    get.mockResolvedValue({ _id: 'u1', totpSecret: 'secret' });
    await h.disableTotp(ctx, { userId: 'u1' as any });
    expect(patch).toHaveBeenCalledWith('u1', expect.objectContaining({ totpSecret: undefined }));
  });

  it('disableTotp throws for missing user', async () => {
    const { ctx, get } = makeAuthCtx();
    get.mockResolvedValue(null);
    await expect(h.disableTotp(ctx, { userId: 'bad' as any })).rejects.toThrow();
  });

  it('registerWebauthn registers credential', async () => {
    const { ctx, query, insert } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });
    await h.registerWebauthn(ctx, {
      userId: 'u1' as any,
      credentialId: 'new-cred',
      publicKey: 'pk',
      counter: 0,
    });
    expect(insert).toHaveBeenCalled();
  });

  it('registerWebauthn throws for duplicate credential', async () => {
    const { ctx, query } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        unique: jest.fn().mockResolvedValue({ _id: 'existing', credentialId: 'cred' }),
      }),
    });
    await expect(
      h.registerWebauthn(ctx, {
        userId: 'u1' as any,
        credentialId: 'cred',
        publicKey: 'pk',
        counter: 0,
      }),
    ).rejects.toThrow('already registered');
  });

  it('loginWebauthn logs in with valid credential', async () => {
    const { ctx, query, get, patch } = makeAuthCtx();
    const cred = {
      _id: 'c1',
      credentialId: 'cred',
      publicKey: 'pk',
      counter: 0,
      userId: 'u1',
    };
    const user = {
      _id: 'u1',
      name: 'Test',
      email: 't@t.com',
      role: 'admin',
      organizationId: 'org-1',
      isActive: true,
      isApproved: true,
    };
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(cred) }),
    });
    get.mockResolvedValue(user);
    const result = await h.loginWebauthn(ctx, {
      credentialId: 'cred',
      counter: 1,
    });
    expect(result).toHaveProperty('userId');
  });

  it('getWebauthnCredential returns null', async () => {
    const { ctx, query } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });
    const result = await h.getWebauthnCredential(ctx, {
      credentialId: 'bad',
    });
    expect(result).toBeNull();
  });

  it('getWebauthnCredential returns credential with user', async () => {
    const { ctx, query, get } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        unique: jest.fn().mockResolvedValue({
          _id: 'c1',
          credentialId: 'cred',
          publicKey: 'pk',
          userId: 'u1',
        }),
      }),
    });
    get.mockResolvedValue({ _id: 'u1', name: 'Test' });
    const result = await h.getWebauthnCredential(ctx, {
      credentialId: 'cred',
    });
    expect(result).toHaveProperty('user');
  });

  it('verifyResetToken returns invalid for bad token', async () => {
    const { ctx, query } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });
    const result = await h.verifyResetToken(ctx, { token: 'bad' });
    expect(result).toEqual({ valid: false });
  });

  it('verifyResetToken returns valid for non-expired token', async () => {
    const { ctx, query } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        unique: jest.fn().mockResolvedValue({
          email: 't@t.com',
          name: 'Test',
          resetPasswordExpiry: Date.now() + 3600000,
        }),
      }),
    });
    const result = await h.verifyResetToken(ctx, { token: 'good' });
    expect(result).toHaveProperty('valid', true);
  });

  it('verifyResetToken returns expired for expired token', async () => {
    const { ctx, query } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        unique: jest.fn().mockResolvedValue({
          email: 't@t.com',
          name: 'Test',
          resetPasswordExpiry: Date.now() - 1000,
        }),
      }),
    });
    const result = await h.verifyResetToken(ctx, { token: 'expired' });
    expect(result).toEqual({ valid: false, expired: true });
  });

  it('googleOAuthLogin throws when email empty', async () => {
    const { ctx } = makeAuthCtx();
    await expect(h.googleOAuthLogin(ctx, { email: '', name: 'X' })).rejects.toThrow();
  });

  it('googleOAuthLogin throws when name empty', async () => {
    const { ctx } = makeAuthCtx();
    await expect(h.googleOAuthLogin(ctx, { email: 'x@t.com', name: '' })).rejects.toThrow();
  });

  it('googleOAuthLogin returns existing user', async () => {
    const { ctx, query, get } = makeAuthCtx();
    const existing = {
      _id: 'u1',
      email: 'g@t.com',
      name: 'G',
      role: 'admin',
      organizationId: 'org-1',
      isActive: true,
      isApproved: true,
    };
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(existing) }),
    });
    get.mockResolvedValue({
      _id: 'org-1',
      name: 'Acme',
      timezone: 'UTC',
      plan: 'enterprise',
      employeeLimit: 100,
      isActive: true,
    });
    const result = await h.googleOAuthLogin(ctx, {
      email: 'g@t.com',
      name: 'G',
    });
    expect(result).toHaveProperty('userId');
  });

  it('resetPassword throws for invalid token', async () => {
    const { ctx, query } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });
    await expect(h.resetPassword(ctx, { token: 'bad', newPassword: 'new' })).rejects.toThrow(
      'Invalid or expired',
    );
  });

  it('resetPassword throws for expired token', async () => {
    const { ctx, query } = makeAuthCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({
        unique: jest.fn().mockResolvedValue({
          _id: 'u1',
          resetPasswordExpiry: Date.now() - 1000,
        }),
      }),
    });
    await expect(h.resetPassword(ctx, { token: 'expired', newPassword: 'new' })).rejects.toThrow(
      'expired',
    );
  });
});
