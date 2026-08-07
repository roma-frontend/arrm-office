/**
 * Tests for auth helper pages in src/app/(auth):
 *   - forgot-password: form → fetch → sent state / error
 *   - reset-password: token verification → form → success / errors
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === 'string' ? fallback : key,
    ready: true,
    i18n: { language: 'en' },
  }),
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    Mail: Icon,
    AlertCircle: Icon,
    Building2: Icon,
    CheckCircle2: Icon,
    ArrowLeft: Icon,
    Eye: Icon,
    EyeOff: Icon,
    Lock: Icon,
  };
});

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: (props: any) => <div data-testid="shield-loader" {...props} />,
}));

jest.mock('next/link', () => {
  return ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
});

// ── next/navigation: configurable search params per test ─────────────────────
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: (k: string) => mockParams[k] ?? null }),
}));

import ForgotPasswordPage from '@/app/(auth)/forgot-password/page';
import ResetPasswordPage from '@/app/(auth)/reset-password/page';

describe('forgot-password page', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (globalThis as any).fetch = fetchMock;
  });

  afterEach(() => {
    delete (globalThis as any).fetch;
  });

  it('renders the email form', () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByText('auth.forgotPassword')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@company.com')).toBeInTheDocument();
  });

  it('submits the email and shows the sent state', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText('you@company.com'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/forgot-password', expect.any(Object));
    });
    expect(await screen.findByText('auth.checkYourEmail')).toBeInTheDocument();
  });

  it('shows an error when the request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'No such user' }) });
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText('you@company.com'), {
      target: { value: 'missing@example.com' },
    });
    fireEvent.submit(document.querySelector('form')!);
    expect(await screen.findByText('No such user')).toBeInTheDocument();
  });
});

describe('reset-password page', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (globalThis as any).fetch = fetchMock;
    mockPush.mockClear();
    mockParams = {};
  });

  afterEach(() => {
    delete (globalThis as any).fetch;
    jest.useRealTimers();
  });

  it('shows the invalid-token state when no token is present', async () => {
    mockParams = {};
    render(<ResetPasswordPage />);
    expect(await screen.findByText('resetPassword.invalidOrExpiredLink')).toBeInTheDocument();
  });

  it('shows the invalid-token state when verification fails', async () => {
    mockParams = { token: 'expired' };
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ value: { valid: false } }) });
    render(<ResetPasswordPage />);
    expect(await screen.findByText('resetPassword.invalidOrExpiredLink')).toBeInTheDocument();
  });

  it('shows the form for a valid token and resets the password', async () => {
    mockParams = { token: 'valid-token' };
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ value: { valid: true } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    render(<ResetPasswordPage />);
    expect(await screen.findByText('resetPassword.setNewPassword')).toBeInTheDocument();

    // Two password inputs
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(passwordInputs[0]!, { target: { value: 'NewPass123!' } });
    fireEvent.change(passwordInputs[1]!, { target: { value: 'NewPass123!' } });
    fireEvent.submit(document.querySelector('form')!);

    expect(await screen.findByText('resetPassword.passwordUpdated')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/auth/reset-password',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects mismatched passwords', async () => {
    mockParams = { token: 'valid-token' };
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ value: { valid: true } }) });

    render(<ResetPasswordPage />);
    await screen.findByText('resetPassword.setNewPassword');

    const passwordInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(passwordInputs[0]!, { target: { value: 'Pass1234!' } });
    fireEvent.change(passwordInputs[1]!, { target: { value: 'Different!' } });
    fireEvent.submit(document.querySelector('form')!);

    expect(await screen.findByText('resetPassword.passwordsDoNotMatch')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/reset-password', expect.anything());
  });

  it('rejects passwords shorter than 8 characters', async () => {
    mockParams = { token: 'valid-token' };
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ value: { valid: true } }) });

    render(<ResetPasswordPage />);
    await screen.findByText('resetPassword.setNewPassword');

    const passwordInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(passwordInputs[0]!, { target: { value: 'short' } });
    fireEvent.change(passwordInputs[1]!, { target: { value: 'short' } });
    fireEvent.submit(document.querySelector('form')!);

    expect(await screen.findByText('resetPassword.passwordMinLength')).toBeInTheDocument();
  });

  it('redirects to login after a successful reset', async () => {
    jest.useFakeTimers();
    mockParams = { token: 'valid-token' };
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ value: { valid: true } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    render(<ResetPasswordPage />);
    await waitFor(() => {
      expect(screen.getByText('resetPassword.setNewPassword')).toBeInTheDocument();
    });

    const passwordInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(passwordInputs[0]!, { target: { value: 'NewPass123!' } });
    fireEvent.change(passwordInputs[1]!, { target: { value: 'NewPass123!' } });
    fireEvent.submit(document.querySelector('form')!);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(3100);
    });
    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
