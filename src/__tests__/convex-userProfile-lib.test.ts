/**
 * Tests for convex/lib/userProfile.ts — lazy-migration profile helpers.
 *
 * `_generated/server` is imported only as types, so no module mocking is
 * needed; we mock the db query/patch chains directly.
 */

import { jest, describe, it, expect } from '@jest/globals';

import { getProfile, patchProfile } from '../../convex/lib/userProfile';

const PROFILE = {
  _id: 'profile_1',
  userId: 'user_1',
  department: 'Engineering',
  position: 'Engineer',
};

function makeProfileCtx(profile: unknown = PROFILE) {
  const first = jest.fn().mockResolvedValue(profile);
  const eq = jest.fn();
  // withIndex('by_user', cb) returns the chain on which `.first()` is called;
  // the callback receives a fake `q` whose `.eq()` must exist.
  const withIndex = jest.fn().mockImplementation((_name: string, cb?: (q: any) => unknown) => {
    cb?.({ eq });
    return { first };
  });
  const query = jest.fn().mockReturnValue({ withIndex });
  const patch = jest.fn();
  return { ctx: { db: { query, patch } }, query, withIndex, eq, first, patch };
}

describe('getProfile', () => {
  it('queries userProfiles by_user and returns the profile', async () => {
    const { ctx, withIndex } = makeProfileCtx(PROFILE);
    const result = await getProfile(ctx as any, 'user_1' as any);
    expect(result).toEqual(PROFILE);
    expect(withIndex).toHaveBeenCalledWith('by_user', expect.any(Function));
  });

  it('returns null when no profile exists', async () => {
    const { ctx } = makeProfileCtx(null);
    const result = await getProfile(ctx as any, 'user_1' as any);
    expect(result).toBeNull();
  });
});

describe('patchProfile', () => {
  it('writes to users and patches the existing profile', async () => {
    const { ctx, patch } = makeProfileCtx(PROFILE);
    await patchProfile(ctx as any, 'user_1' as any, { department: 'Sales' });

    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch).toHaveBeenCalledWith('user_1', { department: 'Sales' });
    expect(patch).toHaveBeenCalledWith('profile_1', { department: 'Sales' });
  });

  it('only patches the users table when no profile exists', async () => {
    const { ctx, patch } = makeProfileCtx(null);
    await patchProfile(ctx as any, 'user_1' as any, { position: 'Lead' });

    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith('user_1', { position: 'Lead' });
  });

  it('passes empty patches through', async () => {
    const { ctx, patch } = makeProfileCtx(PROFILE);
    await patchProfile(ctx as any, 'user_1' as any, {});

    expect(patch).toHaveBeenCalledWith('user_1', {});
    expect(patch).toHaveBeenCalledWith('profile_1', {});
  });
});
