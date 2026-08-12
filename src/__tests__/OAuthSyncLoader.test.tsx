/**
 * Tests for OAuthSyncLoader — fullscreen loader shown while an OAuth session
 * syncs into the auth store on the login page.
 *
 * Mocks: next-auth/react useSession, auth store, next/navigation usePathname,
 * ShieldLoader. Fake timers drive the 8 s auto-hide timer and the 300 ms
 * post-auth grace timer.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, act } from '@testing-library/react';

let mockSessionStatus: string = 'unauthenticated';
jest.mock('next-auth/react', () => ({
  useSession: () => ({ status: mockSessionStatus }),
}));

let mockIsAuthenticated = false;
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ isAuthenticated: mockIsAuthenticated }),
}));

let mockPathname = '/login';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: ({ message }: any) => <span data-testid="loader">{message}</span>,
}));

import { OAuthSyncLoader } from '@/components/auth/OAuthSyncLoader';

describe('OAuthSyncLoader', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockSessionStatus = 'unauthenticated';
    mockIsAuthenticated = false;
    mockPathname = '/login';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing when there is no sync state', () => {
    const { container } = render(<OAuthSyncLoader />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when not on the login page', () => {
    mockSessionStatus = 'authenticated';
    mockPathname = '/dashboard';
    const { container } = render(<OAuthSyncLoader />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the loader while the OAuth session syncs on the login page', () => {
    mockSessionStatus = 'authenticated';
    render(<OAuthSyncLoader />);
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    expect(screen.getByText('auth.signingInWithGoogle')).toBeInTheDocument();
  });

  it('hides the loader after the 8 s sync timeout', () => {
    mockSessionStatus = 'authenticated';
    render(<OAuthSyncLoader />);
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(8000);
    });
    expect(screen.queryByTestId('loader')).toBeNull();
  });

  it('clears the timeout when the effect re-runs on status change', () => {
    mockSessionStatus = 'authenticated';
    const { rerender } = render(<OAuthSyncLoader />);
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    // Session status changes before the 8 s timer fires → effect cleanup runs
    // and the pending setState is dropped (isSyncing stays true).
    mockSessionStatus = 'loading';
    rerender(<OAuthSyncLoader />);
    act(() => {
      jest.advanceTimersByTime(8000);
    });
    // If the timer had NOT been cleared, the loader would have hidden here.
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  it('runs the grace timer when already authenticated on the login page', () => {
    mockIsAuthenticated = true;
    const { container } = render(<OAuthSyncLoader />);
    // Loader is never shown in this branch — the grace timer just runs.
    expect(container).toBeEmptyDOMElement();
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(container).toBeEmptyDOMElement();
  });
});
