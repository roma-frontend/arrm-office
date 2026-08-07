/**
 * Tests for convex/notifications.ts — paginated list, unread counts, and
 * read/delete mutations. Uses mocked _generated/server + convex/server
 * (pagination validator) so no real Convex runtime is needed.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('convex/server', () => ({
  paginationOptsValidator: {},
}));

let listPaginatedHandler: (ctx: any, args: any) => Promise<unknown>;
let getUserNotificationsHandler: (ctx: any, args: any) => Promise<unknown>;
let getUnreadCountHandler: (ctx: any, args: any) => Promise<unknown>;
let markAsReadHandler: (ctx: any, args: any) => Promise<unknown>;
let markAllAsReadHandler: (ctx: any, args: any) => Promise<unknown>;
let deleteNotificationHandler: (ctx: any, args: any) => Promise<unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/notifications');
    listPaginatedHandler = mod.listPaginated.handler;
    getUserNotificationsHandler = mod.getUserNotifications.handler;
    getUnreadCountHandler = mod.getUnreadCount.handler;
    markAsReadHandler = mod.markAsRead.handler;
    markAllAsReadHandler = mod.markAllAsRead.handler;
    deleteNotificationHandler = mod.deleteNotification.handler;
  });
});

function makeCtx() {
  const paginate = jest.fn().mockResolvedValue({ page: [], isDone: true, continueCursor: '' });
  const take = jest.fn().mockResolvedValue([]);
  const order = jest.fn().mockReturnValue({ paginate, take });
  // Chainable `q.eq(...).eq(...)`: the returned value must expose .eq again.
  const eq = jest.fn().mockImplementation((..._args: unknown[]) => eq);
  (eq as any).eq = eq;
  // .withIndex() may be followed by .order() (listPaginated) or .take()
  // (getUnreadCount/markAllAsRead) depending on the handler. Invoke the
  // passed callback so the `q.eq(...)` bodies execute.
  const withIndex = jest.fn().mockImplementation((_name: string, cb?: (q: any) => unknown) => {
    cb?.({ eq });
    return { order, take };
  });
  const patch = jest.fn();
  const del = jest.fn();
  const ctx = {
    db: {
      query: jest.fn().mockReturnValue({ withIndex, order }),
      patch,
      delete: del,
    },
  };
  return { ctx, withIndex, order, take, paginate, patch, del, eq };
}

describe('listPaginated', () => {
  it('queries by_user with pagination', async () => {
    const { ctx, withIndex, paginate, eq } = makeCtx();
    const opts = { numItems: 30, cursor: null };
    const result = await listPaginatedHandler(ctx, { userId: 'user_1', paginationOpts: opts });

    expect(withIndex).toHaveBeenCalledWith('by_user', expect.any(Function));
    expect(eq).toHaveBeenCalledWith('userId', 'user_1');
    expect(paginate).toHaveBeenCalledWith(opts);
    expect(result).toEqual({ page: [], isDone: true, continueCursor: '' });
  });
});

describe('getUserNotifications', () => {
  it('returns up to 50 notifications ordered desc', async () => {
    const { ctx, withIndex, order, take } = makeCtx();
    take.mockResolvedValueOnce([{ _id: 'n1' }]);
    const result = await getUserNotificationsHandler(ctx, { userId: 'user_1' });

    expect(withIndex).toHaveBeenCalledWith('by_user', expect.any(Function));
    expect(order).toHaveBeenCalledWith('desc');
    expect(result).toEqual([{ _id: 'n1' }]);
  });
});

describe('getUnreadCount', () => {
  it('counts unread notifications capped at MAX_PAGE_SIZE', async () => {
    const { ctx, withIndex, take, eq } = makeCtx();
    take.mockResolvedValueOnce([{ _id: 'n1' }, { _id: 'n2' }]);
    const result = await getUnreadCountHandler(ctx, { userId: 'user_1' });

    expect(withIndex).toHaveBeenCalledWith('by_user_unread', expect.any(Function));
    // Chainable q.eq(...).eq(...): the returned value must itself expose .eq.
    expect(eq).toHaveBeenCalledWith('userId', 'user_1');
    expect(eq).toHaveBeenCalledWith('isRead', false);
    expect(result).toBe(2);
  });

  it('returns 0 when there are no unread notifications', async () => {
    const { ctx, take } = makeCtx();
    take.mockResolvedValueOnce([]);
    const result = await getUnreadCountHandler(ctx, { userId: 'user_1' });
    expect(result).toBe(0);
  });

  it('caps the unread count at MAX_PAGE_SIZE', async () => {
    const { ctx, take } = makeCtx();
    take.mockResolvedValueOnce(Array.from({ length: 150 }, (_v, i) => ({ _id: `n${i}` })));
    const result = await getUnreadCountHandler(ctx, { userId: 'user_1' });
    expect(result).toBe(100); // Math.min(unread.length, MAX_PAGE_SIZE)
  });
});

describe('markAsRead', () => {
  it('patches the notification to isRead: true', async () => {
    const { ctx, patch } = makeCtx();
    await markAsReadHandler(ctx, { notificationId: 'n1' });
    expect(patch).toHaveBeenCalledWith('n1', { isRead: true });
  });
});

describe('markAllAsRead', () => {
  it('patches every unread notification and returns the count', async () => {
    const { ctx, withIndex, take, patch } = makeCtx();
    take.mockResolvedValueOnce([{ _id: 'n1' }, { _id: 'n2' }, { _id: 'n3' }]);
    const result = await markAllAsReadHandler(ctx, { userId: 'user_1' });

    expect(withIndex).toHaveBeenCalledWith('by_user_unread', expect.any(Function));
    expect(patch).toHaveBeenCalledTimes(3);
    expect(patch).toHaveBeenCalledWith('n1', { isRead: true });
    expect(patch).toHaveBeenCalledWith('n2', { isRead: true });
    expect(patch).toHaveBeenCalledWith('n3', { isRead: true });
    expect(result).toBe(3);
  });

  it('returns 0 when nothing is unread', async () => {
    const { ctx, take, patch } = makeCtx();
    take.mockResolvedValueOnce([]);
    const result = await markAllAsReadHandler(ctx, { userId: 'user_1' });
    expect(result).toBe(0);
    expect(patch).not.toHaveBeenCalled();
  });
});

describe('deleteNotification', () => {
  it('deletes the notification', async () => {
    const { ctx, del } = makeCtx();
    await deleteNotificationHandler(ctx, { notificationId: 'n1' });
    expect(del).toHaveBeenCalledWith('n1');
  });
});
