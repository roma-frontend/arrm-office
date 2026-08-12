/**
 * Tests for GoogleSignInButton — Google OAuth sign-in button.
 *
 * Mocks: next-auth/react signIn (controllable), ShieldLoader, i18n, logger.
 * Covers the loading state, the OAuth start callback, success and failure
 * paths of signIn, and the disabled state while loading.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const signInMock = jest.fn().mockResolvedValue(undefined);
jest.mock('next-auth/react', () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <span data-testid="loader" />,
}));

const loggerError = jest.fn();
jest.mock('@/lib/logger', () => ({
  logger: { error: (...args: unknown[]) => loggerError(...args) },
}));

import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';

describe('GoogleSignInButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signInMock.mockReset().mockResolvedValue(undefined);
  });

  it('renders the Google label and icon', () => {
    render(<GoogleSignInButton />);
    expect(screen.getByText('auth.continueWithGoogle')).toBeInTheDocument();
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('signs in with Google and calls onOAuthStart', async () => {
    const onOAuthStart = jest.fn();
    render(<GoogleSignInButton onOAuthStart={onOAuthStart} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onOAuthStart).toHaveBeenCalled();
    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith('google', {
        callbackUrl: '/dashboard',
        redirect: true,
      });
    });
  });

  it('works without an onOAuthStart callback', async () => {
    render(<GoogleSignInButton />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledTimes(1);
    });
  });

  it('shows the loading state while signing in and disables the button', async () => {
    let resolveSignIn: (value: unknown) => void = () => {};
    signInMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve;
        }),
    );
    render(<GoogleSignInButton />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    expect(screen.getByText('auth.signingIn')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
    await act(async () => {
      resolveSignIn(undefined);
    });
  });

  it('logs and re-enables the button when sign-in fails', async () => {
    signInMock.mockRejectedValue(new Error('oauth failed'));
    render(<GoogleSignInButton />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(loggerError).toHaveBeenCalled();
    });
    expect(screen.getByText('auth.continueWithGoogle')).toBeInTheDocument();
    expect(screen.getByRole('button')).not.toBeDisabled();
  });
});
