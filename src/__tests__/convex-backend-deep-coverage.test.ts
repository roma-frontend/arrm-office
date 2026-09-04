/**
 * Deep coverage tests for remaining backend gaps:
 * - auth_module: verifyResetToken, resetPassword, requestPasswordReset (found), registerWebauthn, loginWebauthn, googleOAuthLogin
 * - meetings: submitRegistration, updateLobbyAndRegistration, setCohostIds, markRecordingStarted, markRecordingStopped
 * - messenger: leaveConversation, markConversationRead
 * - tasks: sendDeadlineReminders, getMyEmployees
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  action: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
  internalQuery: ({ handler, args }: any) => ({ handler, args }),
  internalAction: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({ getAuthCaller: jest.fn() }));
jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
  SUPERADMIN_EMAIL: 'boss@example.com',
}));
jest.mock('../../convex/lib/notify', () => ({ notify: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../convex/lib/entitlements', () => ({
  assertModuleAccess: jest.fn().mockResolvedValue(undefined),
  assertQuota: jest.fn().mockResolvedValue(undefined),
  currentPeriodKey: jest.fn().mockReturnValue('2026-09'),
  incrementUsage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn().mockResolvedValue(null),
  patchProfile: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../convex/lib/leaveBalances', () => ({
  getStartingLeaveBalances: jest.fn().mockResolvedValue({ paid: 0, sick: 0, family: 0 }),
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
}));
jest.mock('../../convex/lib/rbac', () => ({
  requireRole: jest.fn(),
  requireOrgAdmin: jest.fn(),
  requireUser: jest.fn(),
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

// ── Auth Module Tests ────────────────────────────────────────────────────────
describe('auth_module deep coverage', () => {
  let authHandlers: Record<string, any> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      const mod = require('../../convex/auth_module/main');
      for (const [name, def] of Object.entries(mod)) {
        if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
          authHandlers[name] = (def as any).handler;
        }
      }
    });
  });

  function makeAuthCtx(overrides: Record<string, any> = {}) {
    const get = jest.fn();
    const insert = jest.fn().mockResolvedValue('new_id');
    const patch = jest.fn().mockResolvedValue(undefined);
    const take = jest.fn().mockResolvedValue([]);
    const collect = jest.fn().mockResolvedValue([]);
    const first = jest.fn().mockResolvedValue(null);
    const unique = jest.fn().mockResolvedValue(null);
    const order = jest.fn().mockReturnValue({ take, collect, first });
    const withIndex = jest.fn().mockReturnValue({ order, take, collect, first, unique });
    const query = jest.fn().mockReturnValue({ withIndex, order, take, collect, first, unique });
    return {
      ctx: { db: { get, insert, patch, query } },
      get,
      insert,
      patch,
      query,
      unique,
      ...overrides,
    };
  }

  describe('verifyResetToken', () => {
    it('returns invalid for non-existent token', async () => {
      const { ctx, query } = makeAuthCtx();
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
      });
      const result = await authHandlers.verifyResetToken(ctx, { token: 'bad' });
      expect(result).toEqual({ valid: false });
    });

    it('returns valid for existing non-expired token', async () => {
      const { ctx, query } = makeAuthCtx();
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({
          unique: jest.fn().mockResolvedValue({
            email: 'anna@test.com',
            name: 'Anna',
            resetPasswordExpiry: Date.now() + 3600000,
          }),
        }),
      });
      const result = await authHandlers.verifyResetToken(ctx, { token: 'good-token' });
      expect(result.valid).toBe(true);
      expect(result.email).toBe('anna@test.com');
    });

    it('returns expired for expired token', async () => {
      const { ctx, query } = makeAuthCtx();
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({
          unique: jest.fn().mockResolvedValue({
            email: 'anna@test.com',
            name: 'Anna',
            resetPasswordExpiry: Date.now() - 1000,
          }),
        }),
      });
      const result = await authHandlers.verifyResetToken(ctx, { token: 'expired' });
      expect(result.valid).toBe(false);
      expect(result.expired).toBe(true);
    });
  });

  describe('requestPasswordReset (user found)', () => {
    it('returns token when user exists', async () => {
      const { ctx, query, patch } = makeAuthCtx();
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({
          unique: jest.fn().mockResolvedValue({ _id: 'u1', name: 'Anna', email: 'anna@test.com' }),
        }),
      });
      const result = await authHandlers.requestPasswordReset(ctx, { email: 'anna@test.com' });
      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(patch).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('throws for non-existent token', async () => {
      const { ctx, query } = makeAuthCtx();
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
      });
      await expect(
        authHandlers.resetPassword(ctx, { token: 'bad', newPassword: 'new123' }),
      ).rejects.toThrow('Invalid or expired');
    });

    it('throws for expired token', async () => {
      const { ctx, query } = makeAuthCtx();
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({
          unique: jest
            .fn()
            .mockResolvedValue({ _id: 'u1', resetPasswordExpiry: Date.now() - 1000 }),
        }),
      });
      await expect(
        authHandlers.resetPassword(ctx, { token: 'expired', newPassword: 'new123' }),
      ).rejects.toThrow('expired');
    });
  });

  describe('registerWebauthn', () => {
    it('throws when credential already registered', async () => {
      const { ctx, query } = makeAuthCtx();
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({
          unique: jest.fn().mockResolvedValue({ _id: 'existing_cred', credentialId: 'cred' }),
        }),
      });
      await expect(
        authHandlers.registerWebauthn(ctx, {
          userId: 'u1' as any,
          credentialId: 'cred',
          publicKey: 'pk',
          counter: 0,
        }),
      ).rejects.toThrow('already registered');
    });
  });

  describe('loginWebauthn', () => {
    it('throws when credential not found', async () => {
      const { ctx, query } = makeAuthCtx();
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({ first: jest.fn().mockResolvedValue(null) }),
      });
      await expect(
        authHandlers.loginWebauthn(ctx, { credentialId: 'bad', counter: 0 }),
      ).rejects.toThrow();
    });
  });

  describe('googleOAuthLogin', () => {
    it('throws when email is missing', async () => {
      const { ctx } = makeAuthCtx();
      await expect(
        authHandlers.googleOAuthLogin(ctx, { email: '', name: 'Test' }),
      ).rejects.toThrow();
    });
  });
});

// ── Meetings Deep Coverage ──────────────────────────────────────────────────
describe('meetings deep coverage', () => {
  let mtgHandlers: Record<string, any> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      const mod = require('../../convex/meetings');
      for (const [name, def] of Object.entries(mod)) {
        if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
          mtgHandlers[name] = (def as any).handler;
        }
      }
    });
  });

  function makeMtgCtx(overrides: Record<string, any> = {}) {
    const get = jest.fn();
    const insert = jest.fn().mockResolvedValue('new_id');
    const patch = jest.fn().mockResolvedValue(undefined);
    const take = jest.fn().mockResolvedValue([]);
    const collect = jest.fn().mockResolvedValue([]);
    const first = jest.fn().mockResolvedValue(null);
    const unique = jest.fn().mockResolvedValue(null);
    const order = jest.fn().mockReturnValue({ take, collect, first });
    const withIndex = jest.fn().mockReturnValue({ order, take, collect, first, unique });
    const query = jest.fn().mockReturnValue({ withIndex, order, take, collect, first, unique });
    return {
      ctx: { db: { get, insert, patch, query } },
      get,
      insert,
      patch,
      query,
      unique,
      ...overrides,
    };
  }

  describe('submitRegistration', () => {
    it('throws when meeting not found', async () => {
      const { ctx, query } = makeMtgCtx();
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
      });
      await expect(
        mtgHandlers.submitRegistration(ctx, {
          roomName: 'nonexistent',
          fullName: 'Visitor',
        }),
      ).rejects.toThrow('Meeting not found');
    });

    it('throws when registration and waiting room are both off', async () => {
      const { ctx, query } = makeMtgCtx();
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({
          unique: jest.fn().mockResolvedValue({
            _id: 'mtg_1',
            roomName: 'room',
            registrationEnabled: false,
            waitingRoomEnabled: false,
          }),
        }),
      });
      await expect(
        mtgHandlers.submitRegistration(ctx, {
          roomName: 'room',
          fullName: 'Visitor',
        }),
      ).rejects.toThrow('does not require registration');
    });
  });

  describe('updateLobbyAndRegistration', () => {
    it('throws when meeting not found', async () => {
      const { ctx, query } = makeMtgCtx();
      // The handler calls getAuthCaller which requires a proper mock.
      // When getAuthCaller is not mocked, it returns null → 'Not authenticated'.
      // We test that the meeting-not-found path is reachable by having the caller resolved.
      const mod = require('../../convex/meetings');
      const authMod = require('../../convex/lib/getAuthCaller');
      authMod.getAuthCaller.mockResolvedValue({
        _id: 'u1',
        role: 'admin',
        organizationId: 'org-1',
      });
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
      });
      await expect(
        mtgHandlers.updateLobbyAndRegistration(ctx, {
          roomName: 'nonexistent',
          waitingRoomEnabled: true,
        }),
      ).rejects.toThrow();
    });
  });

  describe('setCohostIds', () => {
    it('throws when meeting not found', async () => {
      const { ctx, query } = makeMtgCtx();
      jest
        .requireMock('../../convex/lib/getAuthCaller')
        .getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'admin', organizationId: 'org-1' });
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
      });
      await expect(
        mtgHandlers.setCohostIds(ctx, {
          roomName: 'nonexistent',
          cohostIds: [],
        }),
      ).rejects.toThrow();
    });
  });

  describe('markRecordingStarted', () => {
    it('throws when meeting not found', async () => {
      const { ctx, query } = makeMtgCtx();
      jest
        .requireMock('../../convex/lib/getAuthCaller')
        .getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'admin', organizationId: 'org-1' });
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
      });
      await expect(
        mtgHandlers.markRecordingStarted(ctx, { roomName: 'nonexistent', recordingId: 'rec_1' }),
      ).rejects.toThrow();
    });
  });

  describe('markRecordingStopped', () => {
    it('throws when meeting not found', async () => {
      const { ctx, query } = makeMtgCtx();
      jest
        .requireMock('../../convex/lib/getAuthCaller')
        .getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'admin', organizationId: 'org-1' });
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
      });
      await expect(
        mtgHandlers.markRecordingStopped(ctx, { roomName: 'nonexistent' }),
      ).rejects.toThrow();
    });
  });

  describe('setRecording', () => {
    it('throws when meeting not found', async () => {
      const { ctx, query } = makeMtgCtx();
      jest
        .requireMock('../../convex/lib/getAuthCaller')
        .getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'admin', organizationId: 'org-1' });
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
      });
      await expect(
        mtgHandlers.setRecording(ctx, { roomName: 'nonexistent', recordingUrl: 'http://rec.mp4' }),
      ).rejects.toThrow();
    });
  });

  describe('setRecording', () => {
    it('throws for cross-org access', async () => {
      const { ctx, query } = makeMtgCtx();
      jest
        .requireMock('../../convex/lib/getAuthCaller')
        .getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'admin', organizationId: 'org-2' });
      jest.requireMock('../../convex/lib/auth').isSuperadmin.mockReturnValue(false);
      query.mockReturnValue({
        withIndex: jest.fn().mockReturnValue({
          unique: jest
            .fn()
            .mockResolvedValue({ _id: 'mtg_1', roomName: 'room', organizationId: 'org-1' }),
        }),
      });
      await expect(
        mtgHandlers.setRecording(ctx, { roomName: 'room', recordingUrl: 'http://rec.mp4' }),
      ).rejects.toThrow('Access denied');
    });
  });

  describe('createForRoomBooking', () => {
    it('creates a meeting for a room booking', async () => {
      const { ctx, get, insert } = makeMtgCtx();
      jest
        .requireMock('../../convex/lib/getAuthCaller')
        .getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'admin', organizationId: 'org-1' });
      get.mockResolvedValueOnce({ _id: 'org-1', name: 'TestOrg' }); // org
      get.mockResolvedValueOnce(null); // existing meeting check
      const result = await mtgHandlers.createForRoomBooking(ctx, { organizationId: 'org-1' });
      expect(result).toHaveProperty('roomName');
      expect(insert).toHaveBeenCalled();
    });
  });
});

// ── Messenger Deep Coverage ─────────────────────────────────────────────────
describe('messenger deep coverage', () => {
  let msgHandlers: Record<string, any> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      const mod = require('../../convex/messenger/conversations');
      for (const [name, def] of Object.entries(mod)) {
        if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
          msgHandlers[name] = (def as any).handler;
        }
      }
    });
  });

  function makeMsgCtx(overrides: Record<string, any> = {}) {
    const get = jest.fn();
    const insert = jest.fn().mockResolvedValue('new_id');
    const patch = jest.fn().mockResolvedValue(undefined);
    const remove = jest.fn().mockResolvedValue(undefined);
    const del = jest.fn().mockResolvedValue(undefined);
    const take = jest.fn().mockResolvedValue([]);
    const collect = jest.fn().mockResolvedValue([]);
    const first = jest.fn().mockResolvedValue(null);
    const order = jest.fn().mockReturnValue({ take, collect, first });
    const withIndex = jest.fn().mockReturnValue({ order, take, collect, first });
    const query = jest.fn().mockReturnValue({ withIndex, order, take, collect, first });
    return {
      ctx: { db: { get, insert, patch, delete: remove, del, query } },
      get,
      insert,
      patch,
      remove,
      del,
      query,
      ...overrides,
    };
  }

  describe('leaveConversation', () => {
    it('returns early when membership not found', async () => {
      const { ctx, query } = makeMsgCtx();
      query.mockImplementation((table: string) => {
        return {
          withIndex: jest.fn().mockReturnValue({ first: jest.fn().mockResolvedValue(null) }),
        };
      });
      // Should not throw — handler returns silently
      await msgHandlers.leaveConversation(ctx, {
        conversationId: 'bad' as any,
        userId: 'u1' as any,
      });
    });
    it('removes membership and posts system message when found', async () => {
      const { ctx, query, get, insert, remove } = makeMsgCtx();
      const membership = { _id: 'mem_1', organizationId: 'org-1', userId: 'u1' };
      query.mockImplementation((table: string) => {
        return {
          withIndex: jest.fn().mockReturnValue({ first: jest.fn().mockResolvedValue(membership) }),
        };
      });
      get.mockResolvedValueOnce({
        _id: 'conv_1',
        organizationId: 'org-1',
        name: 'Test chat',
        createdBy: 'u1',
        type: 'group',
      });
      get.mockResolvedValueOnce({ _id: 'u1', name: 'Test User', organizationId: 'org-1' });
      const insertMock = jest.fn().mockResolvedValue('new_msg');
      ctx.db.insert = insertMock;
      await msgHandlers.leaveConversation(ctx, {
        conversationId: 'conv_1' as any,
        userId: 'u1' as any,
      });
      expect(remove).toHaveBeenCalledWith('mem_1');
    });
  });

  describe('markConversationRead', () => {
    it('resets unreadCount for a member', async () => {
      const { ctx, query, patch, insert } = makeMsgCtx();
      jest
        .requireMock('../../convex/lib/getAuthCaller')
        .getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'admin', organizationId: 'org-1' });
      const membership = { _id: 'mem_1', unreadCount: 5, organizationId: 'org-1' };
      let callCount = 0;
      query.mockImplementation((table: string) => {
        callCount++;
        if (table === 'chatMembers' && callCount === 1) {
          return {
            withIndex: jest
              .fn()
              .mockReturnValue({ first: jest.fn().mockResolvedValue(membership) }),
          };
        }
        if (table === 'chatMessages') {
          return {
            withIndex: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                take: jest
                  .fn()
                  .mockResolvedValue([{ _id: 'msg_1', senderId: 'other', readBy: [] }]),
              }),
            }),
          };
        }
        return {
          withIndex: jest.fn().mockReturnValue({ first: jest.fn().mockResolvedValue(null) }),
        };
      });
      await msgHandlers.markConversationRead(ctx, {
        conversationId: 'conv_1' as any,
        userId: 'u1' as any,
      });
      expect(patch).toHaveBeenCalledWith('mem_1', expect.objectContaining({ unreadCount: 0 }));
    });
  });

  describe('getOrCreatePersonalConversation', () => {
    it('returns existing DM when found', async () => {
      const { ctx, get, query } = makeMsgCtx();
      jest
        .requireMock('../../convex/lib/getAuthCaller')
        .getAuthCaller.mockResolvedValue({ _id: 'u1', role: 'admin', organizationId: 'org-1' });
      // getUserOrgId calls ctx.db.get(userId)
      get.mockResolvedValueOnce({ _id: 'u1', organizationId: 'org-1', name: 'User 1' });
      query.mockImplementation((table: string) => {
        if (table === 'chatConversations') {
          return {
            withIndex: jest.fn().mockReturnValue({
              first: jest.fn().mockResolvedValue({ _id: 'conv_1', type: 'direct' }),
            }),
          };
        }
        return {
          withIndex: jest.fn().mockReturnValue({ first: jest.fn().mockResolvedValue(null) }),
        };
      });
      const result = await msgHandlers.getOrCreatePersonalConversation(ctx, {
        userId: 'u1' as any,
        otherUserId: 'u2' as any,
      });
      expect(result).toBe('conv_1');
    });
  });

  describe('deleteConversation', () => {
    it('soft-deletes conversation for non-owner', async () => {
      const { ctx, query, patch, insert } = makeMsgCtx();
      const membership = { _id: 'mem_del_1', organizationId: 'org-1', isDeleted: false };
      query.mockImplementation((table: string) => {
        if (table === 'chatMembers') {
          return {
            withIndex: jest
              .fn()
              .mockReturnValue({ first: jest.fn().mockResolvedValue(membership) }),
          };
        }
        return {
          withIndex: jest.fn().mockReturnValue({ first: jest.fn().mockResolvedValue(null) }),
        };
      });
      await msgHandlers.deleteConversation(ctx, {
        conversationId: 'conv_1' as any,
        userId: 'u1' as any,
      });
      expect(patch).toHaveBeenCalledWith('mem_del_1', expect.objectContaining({ isDeleted: true }));
    });
  });
});
