/**
 * Tests for GlobalChatNotifier — the global unread-message listener.
 *
 * The component only has side effects (sound + toast) and renders null, so the
 * assertions target the effect behavior via mocks.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render } from '@testing-library/react';

let mockUser: { id?: string; organizationId?: string } | null = { id: 'u1', organizationId: 'o1' };
let mockPathname = '/dashboard';
let mockTotalUnread: number | undefined = 0;
let mockQueryArgs: unknown;

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

jest.mock('convex/react', () => ({
  useQuery: (_ref: unknown, args: unknown) => {
    mockQueryArgs = args;
    return mockTotalUnread;
  },
}));

const mockPlaySound = jest.fn();
jest.mock('@/lib/notificationSound', () => ({
  playChatMessageSound: () => mockPlaySound(),
}));

const mockToast = jest.fn();
jest.mock('sonner', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

jest.mock('lucide-react', () => ({
  MessageCircle: (props: any) => <span data-testid="icon-message" {...props} />,
}));

import { GlobalChatNotifier } from '@/components/chat/GlobalChatNotifier';

describe('GlobalChatNotifier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', organizationId: 'o1' };
    mockPathname = '/dashboard';
    mockTotalUnread = 0;
  });

  it('renders nothing', () => {
    const { container } = render(<GlobalChatNotifier />);
    expect(container).toBeEmptyDOMElement();
  });

  it('passes skip args without a user', () => {
    mockUser = null;
    render(<GlobalChatNotifier />);
    expect(mockQueryArgs).toBe('skip');
  });

  it('passes user id and org as query args', () => {
    render(<GlobalChatNotifier />);
    expect(mockQueryArgs).toEqual({ userId: 'u1', organizationId: 'o1' });
  });

  it('does nothing on the first unread value (baseline)', () => {
    mockTotalUnread = 3;
    render(<GlobalChatNotifier />);
    expect(mockPlaySound).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('does nothing when the count is undefined', () => {
    mockTotalUnread = undefined;
    render(<GlobalChatNotifier />);
    expect(mockPlaySound).not.toHaveBeenCalled();
  });

  it('plays sound and toasts when unread increases off the chat page', () => {
    // First render establishes the baseline.
    const { rerender } = render(<GlobalChatNotifier />);
    mockTotalUnread = 2;
    rerender(<GlobalChatNotifier />);
    expect(mockPlaySound).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      'New message',
      expect.objectContaining({ duration: 4000, icon: expect.anything() }),
    );
  });

  it('does not notify on the chat page even when unread increases', () => {
    const { rerender } = render(<GlobalChatNotifier />);
    mockPathname = '/chat/conv1';
    mockTotalUnread = 4;
    rerender(<GlobalChatNotifier />);
    expect(mockPlaySound).not.toHaveBeenCalled();
  });

  it('does not notify when unread decreases', () => {
    // Baseline of 5 first, then drop to 3 — a decrease must stay silent.
    mockTotalUnread = 5;
    const { rerender } = render(<GlobalChatNotifier />);
    mockTotalUnread = 3;
    rerender(<GlobalChatNotifier />);
    expect(mockPlaySound).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('remembers the baseline after the first render', () => {
    const { rerender } = render(<GlobalChatNotifier />);
    mockTotalUnread = 5;
    rerender(<GlobalChatNotifier />);
    // First increase notifies.
    expect(mockPlaySound).toHaveBeenCalledTimes(1);
    // Second increase on a different page also notifies.
    mockTotalUnread = 6;
    rerender(<GlobalChatNotifier />);
    expect(mockPlaySound).toHaveBeenCalledTimes(2);
  });
});
