/**
 * Tests for convex/userPreferences.ts — session-token based onboarding tour
 * and preference storage.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

let hasSeenTourHandler: (ctx: any, args: any) => Promise<unknown>;
let markTourAsSeenHandler: (ctx: any, args: any) => Promise<unknown>;
let getAllPreferencesHandler: (ctx: any, args: any) => Promise<unknown>;
let setPreferenceHandler: (ctx: any, args: any) => Promise<unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/userPreferences');
    hasSeenTourHandler = mod.hasSeenTour.handler;
    markTourAsSeenHandler = mod.markTourAsSeen.handler;
    getAllPreferencesHandler = mod.getAllPreferences.handler;
    setPreferenceHandler = mod.setPreference.handler;
  });
});

const TOKEN = 'session-abc';
const USER_ID = 'user_1';

function makeCtx({ users = [], prefs = [], prefFirst = undefined }: any = {}) {
  const insert = jest.fn();
  const patch = jest.fn();
  const take = jest.fn().mockResolvedValue(users);
  const first = jest.fn().mockResolvedValue(prefFirst);
  const withIndex = jest.fn().mockReturnValue({ first, take });
  const order = jest.fn().mockReturnValue({ take });
  // getCurrentUserId: query('users').order('desc').take(MAX_PAGE_SIZE)
  const query = jest
    .fn()
    .mockImplementation((table: string) => (table === 'users' ? { order } : { withIndex }));
  return {
    ctx: { db: { insert, patch, query } },
    insert,
    patch,
    take,
    first,
    withIndex,
    query,
  };
}

function userDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: USER_ID,
    sessionToken: TOKEN,
    sessionExpiry: Date.now() + 60_000,
    ...overrides,
  };
}

describe('hasSeenTour', () => {
  it('returns null when there is no session token', async () => {
    const { ctx } = makeCtx();
    const result = await hasSeenTourHandler(ctx, { tourId: 't1' });
    expect(result).toBeNull();
  });

  it('returns null when no user matches the session token', async () => {
    const { ctx } = makeCtx({ users: [userDoc({ sessionToken: 'other' })] });
    const result = await hasSeenTourHandler(ctx, { tourId: 't1', sessionToken: TOKEN });
    expect(result).toBeNull();
  });

  it('returns null when the session has expired', async () => {
    const { ctx } = makeCtx({
      users: [userDoc({ sessionExpiry: Date.now() - 1000 })],
    });
    const result = await hasSeenTourHandler(ctx, { tourId: 't1', sessionToken: TOKEN });
    expect(result).toBeNull();
  });

  it('returns true when the tour preference is stored as true', async () => {
    const { ctx } = makeCtx({
      users: [userDoc()],
      prefFirst: { _id: 'p1', value: true },
    });
    const result = await hasSeenTourHandler(ctx, { tourId: 't1', sessionToken: TOKEN });
    expect(result).toBe(true);
  });

  it('returns false when the preference value is not true', async () => {
    const { ctx } = makeCtx({ users: [userDoc()], prefFirst: { _id: 'p1', value: false } });
    const result = await hasSeenTourHandler(ctx, { tourId: 't1', sessionToken: TOKEN });
    expect(result).toBe(false);
  });

  it('returns false when no preference exists', async () => {
    const { ctx } = makeCtx({ users: [userDoc()], prefFirst: undefined });
    const result = await hasSeenTourHandler(ctx, { tourId: 't1', sessionToken: TOKEN });
    expect(result).toBe(false);
  });
});

describe('markTourAsSeen', () => {
  it('stores in localStorage for unauthenticated users', async () => {
    const { ctx } = makeCtx();
    const result = await markTourAsSeenHandler(ctx, { tourId: 't1' });
    expect(result).toEqual({ success: true, storage: 'localStorage' });
  });

  it('patches the existing preference when present', async () => {
    const { ctx, patch } = makeCtx({
      users: [userDoc()],
      prefFirst: { _id: 'p1', value: false },
    });
    const result = await markTourAsSeenHandler(ctx, { tourId: 't1', sessionToken: TOKEN });

    expect(patch).toHaveBeenCalledWith('p1', { value: true, updatedAt: expect.any(Number) });
    expect(result).toEqual({ success: true, storage: 'database' });
  });

  it('inserts a new preference when none exists', async () => {
    const { ctx, insert } = makeCtx({ users: [userDoc()], prefFirst: undefined });
    const result = await markTourAsSeenHandler(ctx, { tourId: 't1', sessionToken: TOKEN });

    expect(insert).toHaveBeenCalledWith(
      'userPreferences',
      expect.objectContaining({
        userId: USER_ID,
        key: 'tour_seen_t1',
        value: true,
      }),
    );
    expect(result).toEqual({ success: true, storage: 'database' });
  });
});

describe('getAllPreferences', () => {
  it('throws when unauthenticated', async () => {
    const { ctx } = makeCtx();
    await expect(getAllPreferencesHandler(ctx, { sessionToken: 'nope' })).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('returns the user preferences', async () => {
    const prefs = [{ _id: 'p1', key: 'tour_seen_t1' }];
    const { ctx, take } = makeCtx({ users: [userDoc()], prefs });
    // First take() is the users session lookup, second is the prefs query.
    take.mockResolvedValueOnce([userDoc()]).mockResolvedValueOnce(prefs);
    const result = await getAllPreferencesHandler(ctx, { sessionToken: TOKEN });
    expect(result).toEqual(prefs);
  });
});

describe('setPreference', () => {
  it('throws when unauthenticated', async () => {
    const { ctx } = makeCtx();
    await expect(
      setPreferenceHandler(ctx, { key: 'theme', value: 'dark', sessionToken: 'nope' }),
    ).rejects.toThrow('Not authenticated');
  });

  it('patches an existing preference', async () => {
    const { ctx, patch } = makeCtx({
      users: [userDoc()],
      prefFirst: { _id: 'p1', value: 'light' },
    });
    const result = await setPreferenceHandler(ctx, {
      key: 'theme',
      value: 'dark',
      sessionToken: TOKEN,
    });

    expect(patch).toHaveBeenCalledWith('p1', { value: 'dark', updatedAt: expect.any(Number) });
    expect(result).toEqual({ success: true });
  });

  it('inserts a new preference', async () => {
    const { ctx, insert } = makeCtx({ users: [userDoc()], prefFirst: undefined });
    const result = await setPreferenceHandler(ctx, {
      key: 'theme',
      value: { nested: true },
      sessionToken: TOKEN,
    });

    expect(insert).toHaveBeenCalledWith(
      'userPreferences',
      expect.objectContaining({ userId: USER_ID, key: 'theme', value: { nested: true } }),
    );
    expect(result).toEqual({ success: true });
  });
});
