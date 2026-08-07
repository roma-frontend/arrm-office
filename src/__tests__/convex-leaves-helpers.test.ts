/**
 * Tests for convex/leaves/helpers.ts — batch user enrichment of leave data.
 *
 * `getProfile` from ../lib/userProfile is mocked; `_generated/*` are types
 * only, so ctx.db.get is mocked directly.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getProfile } = jest.requireMock('../../convex/lib/userProfile');

import { enrichLeavesWithUserData } from '../../convex/leaves/helpers';

let mockGetProfile: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetProfile = getProfile;
});

function makeLeave(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'leave_1',
    organizationId: 'org-1',
    userId: 'user_1',
    type: 'sick',
    status: 'pending',
    startDate: '2026-01-01',
    endDate: '2026-01-02',
    reviewedBy: 'reviewer_1',
    ...overrides,
  };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'user_1',
    name: 'Alice',
    email: 'alice@example.com',
    department: 'Eng',
    employeeType: 'full-time',
    avatarUrl: 'https://avatar/alice.png',
    ...overrides,
  };
}

function makeCtx(users: Record<string, unknown> = {}) {
  const get = jest.fn((id: string) => Promise.resolve(users[id] ?? null));
  return { ctx: { db: { get } }, get };
}

describe('enrichLeavesWithUserData', () => {
  it('returns an empty array for no leaves', async () => {
    const { ctx } = makeCtx();
    const result = await enrichLeavesWithUserData(ctx as any, []);
    expect(result).toEqual([]);
    expect(ctx.db.get).not.toHaveBeenCalled();
  });

  it('enriches leaves with user and reviewer data', async () => {
    const { ctx, get } = makeCtx({
      user_1: makeUser(),
      reviewer_1: { _id: 'reviewer_1', name: 'Boss' },
    });
    mockGetProfile.mockResolvedValue({ department: 'ProfileDept', employeeType: 'contractor' });

    const result = await enrichLeavesWithUserData(ctx as any, [makeLeave()]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      ...makeLeave(),
      userName: 'Alice',
      userEmail: 'alice@example.com',
      userDepartment: 'ProfileDept',
      userEmployeeType: 'contractor',
      userAvatarUrl: 'https://avatar/alice.png',
      reviewerName: 'Boss',
    });
    // user + reviewer loaded once
    expect(get).toHaveBeenCalledWith('user_1');
    expect(get).toHaveBeenCalledWith('reviewer_1');
  });

  it('deduplicates shared user IDs', async () => {
    const { ctx, get } = makeCtx({ user_1: makeUser(), reviewer_1: { _id: 'reviewer_1' } });
    mockGetProfile.mockResolvedValue({});
    const leaves = [makeLeave({ _id: 'l1' }), makeLeave({ _id: 'l2' })];

    await enrichLeavesWithUserData(ctx as any, leaves);

    // Two leaves share the same userId and the same reviewer: each fetched once.
    const userCalls = get.mock.calls.filter(([id]) => id === 'user_1');
    const reviewerCalls = get.mock.calls.filter(([id]) => id === 'reviewer_1');
    expect(userCalls).toHaveLength(1);
    expect(reviewerCalls).toHaveLength(1);
  });

  it('falls back to user fields when the profile has none', async () => {
    const { ctx } = makeCtx({ user_1: makeUser() });
    mockGetProfile.mockResolvedValue({});

    const result = await enrichLeavesWithUserData(ctx as any, [makeLeave()]);

    expect(result[0].userDepartment).toBe('Eng');
    expect(result[0].userEmployeeType).toBe('full-time');
    expect(result[0].userAvatarUrl).toBe('https://avatar/alice.png');
  });

  it('skips reviewer loading when includeReviewer is false', async () => {
    const { ctx, get } = makeCtx({ user_1: makeUser() });
    mockGetProfile.mockResolvedValue({});

    await enrichLeavesWithUserData(ctx as any, [makeLeave()], false);

    expect(get).toHaveBeenCalledTimes(1); // users only
    expect(get).not.toHaveBeenCalledWith('reviewer_1');
  });

  it('handles missing users and reviewers', async () => {
    const { ctx } = makeCtx({});
    mockGetProfile.mockResolvedValue(null);

    const result = await enrichLeavesWithUserData(ctx as any, [makeLeave()]);

    expect(result[0].userName).toBe('Unknown');
    expect(result[0].userEmail).toBe('');
    expect(result[0].reviewerName).toBeUndefined();
  });

  it('handles leaves without a reviewer', async () => {
    const { ctx } = makeCtx({ user_1: makeUser() });
    mockGetProfile.mockResolvedValue({});

    const result = await enrichLeavesWithUserData(ctx as any, [
      makeLeave({ reviewedBy: undefined }),
    ]);

    expect(result[0].reviewerName).toBeUndefined();
  });
});
