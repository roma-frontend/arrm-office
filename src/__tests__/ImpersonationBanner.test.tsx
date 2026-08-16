/**
 * Tests for ImpersonationBanner — the always-visible strip while a superadmin
 * acts as another user. Verifies it hides without an active impersonation,
 * renders the acting-as copy with a countdown, and ends the session via the
 * API when the button is clicked.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, act } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

let storeUser: any = null;
let loginMock: jest.Mock = jest.fn();

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector: (s: any) => unknown) => selector({ user: storeUser, login: loginMock }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, size, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn() } }));

import { ImpersonationBanner } from '@/components/auth/ImpersonationBanner';

const impersonatingUser = {
  id: 'user-2',
  name: 'Bob',
  email: 'bob@x.com',
  role: 'employee',
  impersonation: {
    active: true,
    sessionId: 'imp-1',
    expiresAt: Date.now() + 10 * 60 * 1000,
    superadminName: 'Root',
    superadminEmail: 'root@x.com',
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  storeUser = null;
  loginMock = jest.fn();
});

describe('ImpersonationBanner', () => {
  it('renders nothing when not impersonating', () => {
    storeUser = { id: 'u1', name: 'Root', role: 'superadmin' };
    const { container } = render(<ImpersonationBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the acting-as strip with expiry countdown', () => {
    storeUser = impersonatingUser;
    render(<ImpersonationBanner />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText(/bob@x\.com/)).toBeTruthy();
    expect(screen.getByText('Root')).toBeTruthy();
    expect(screen.getByText(/Expires in/)).toBeTruthy();
    expect(screen.getByText('Exit impersonation')).toBeTruthy();
  });

  it('ends impersonation through the API on button click', async () => {
    storeUser = impersonatingUser;
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        session: {
          id: 'user-super',
          name: 'Root',
          email: 'root@x.com',
          role: 'superadmin',
        },
      }),
    }));
    (global as any).fetch = fetchMock;

    render(<ImpersonationBanner />);
    await act(async () => {
      fireEvent.click(screen.getByText('Exit impersonation'));
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/impersonation/end', { method: 'POST' });
    expect(loginMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-super', role: 'superadmin' }),
    );
  });
});
