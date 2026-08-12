/**
 * Tests for WebAuthnButton — biometric register/login button using the WebAuthn
 * API (navigator.credentials.create/get).
 *
 * Mocks: window.PublicKeyCredential, navigator.credentials, ShieldLoader,
 * Button, sonner toast, logger, lucide, i18n. localStorage runs real (jsdom).
 * crypto.getRandomValues and TextEncoder are available in the Node/jsdom env.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const toastError = jest.fn();
const toastSuccess = jest.fn();
jest.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const loggerError = jest.fn();
jest.mock('@/lib/logger', () => ({
  logger: { error: (...args: unknown[]) => loggerError(...args) },
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <span data-testid="loader" />,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return { Fingerprint: Icon };
});

import { WebAuthnButton } from '@/components/auth/WebAuthnButton';

const createMock = jest.fn();
const getMock = jest.fn();
const onSuccessMock = jest.fn();

const credentialWithRawId = (rawId: Uint8Array) =>
  ({
    rawId,
    response: { clientDataJSON: new ArrayBuffer(8) },
  }) as unknown as PublicKeyCredential;

const installWebAuthn = (supported = true) => {
  Object.defineProperty(window, 'PublicKeyCredential', {
    configurable: true,
    value: supported ? class PublicKeyCredential {} : undefined,
  });
  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: { create: createMock, get: getMock },
  });
};

describe('WebAuthnButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    createMock.mockReset();
    getMock.mockReset();
    onSuccessMock.mockReset();
    installWebAuthn(true);
  });

  afterEach(() => {
    // Restore so other suites don't see stubbed WebAuthn globals.
    delete (window as Record<string, unknown>).PublicKeyCredential;
    delete (navigator as Record<string, unknown>).credentials;
  });

  it('renders the register button with the touch id label', () => {
    render(<WebAuthnButton mode="register" userId="u1" />);
    expect(screen.getByText('auth.touchId')).toBeInTheDocument();
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('renders the login button for login mode', () => {
    render(<WebAuthnButton mode="login" />);
    expect(screen.getByText('auth.touchId')).toBeInTheDocument();
  });

  it('shows an error when WebAuthn is not supported in login mode', async () => {
    installWebAuthn(false);
    render(<WebAuthnButton mode="login" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('toasts.webAuthnNotSupported');
    });
    expect(getMock).not.toHaveBeenCalled();
  });

  it('is disabled when the disabled prop is set', () => {
    render(<WebAuthnButton mode="register" userId="u1" disabled />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows an error when WebAuthn is not supported', async () => {
    installWebAuthn(false);
    render(<WebAuthnButton mode="register" userId="u1" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('toasts.webAuthnNotSupported');
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('shows an error when registering without a user id', async () => {
    render(<WebAuthnButton mode="register" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('toasts.completeRegistrationFirst');
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('registers a credential, stores it and notifies success', async () => {
    createMock.mockResolvedValue(credentialWithRawId(new Uint8Array([1, 2, 3])));
    render(<WebAuthnButton mode="register" userId="u1" onSuccess={onSuccessMock} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          publicKey: expect.objectContaining({
            rp: { name: 'Strata', id: window.location.hostname },
          }),
        }),
      );
    });
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith('toasts.biometricRegistered');
    });
    expect(onSuccessMock).toHaveBeenCalledWith(expect.stringMatching(/^[A-Za-z0-9+/=]+$/));
    expect(localStorage.getItem('webauthn-credential-id')).toBeTruthy();
    expect(localStorage.getItem('webauthn-user-id')).toBe('u1');
  });

  it('shows auth-cancelled toast when credential creation is cancelled', async () => {
    const err = new Error('cancelled');
    err.name = 'NotAllowedError';
    createMock.mockRejectedValue(err);
    render(<WebAuthnButton mode="register" userId="u1" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('toasts.authCancelled');
    });
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('shows a generic failure toast and logs when creation fails', async () => {
    createMock.mockRejectedValue(new Error('boom'));
    render(<WebAuthnButton mode="register" userId="u1" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('toasts.biometricRegFailed');
    });
    expect(loggerError).toHaveBeenCalled();
  });

  it('shows an error when credential creation returns nothing', async () => {
    createMock.mockResolvedValue(null);
    render(<WebAuthnButton mode="register" userId="u1" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('toasts.biometricRegFailed');
    });
  });

  it('shows the loader while registering and disables the button', async () => {
    let resolveCreate: (v: unknown) => void = () => {};
    createMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    render(<WebAuthnButton mode="register" userId="u1" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
    resolveCreate(credentialWithRawId(new Uint8Array([1])));
    await waitFor(() => {
      expect(screen.queryByTestId('loader')).toBeNull();
    });
  });

  it('logs in with a stored credential id', async () => {
    localStorage.setItem('webauthn-credential-id', btoa('id-bytes'));
    getMock.mockResolvedValue(credentialWithRawId(new Uint8Array([9, 9])));
    render(<WebAuthnButton mode="login" onSuccess={onSuccessMock} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(getMock).toHaveBeenCalled();
    });
    const arg = getMock.mock.calls[0]?.[0] as { publicKey: { allowCredentials: unknown[] } };
    expect(arg.publicKey.allowCredentials.length).toBe(1);
    await waitFor(() => {
      expect(onSuccessMock).toHaveBeenCalled();
    });
  });

  it('logs in without a stored credential id (empty allowCredentials)', async () => {
    getMock.mockResolvedValue(credentialWithRawId(new Uint8Array([7])));
    render(<WebAuthnButton mode="login" onSuccess={onSuccessMock} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(getMock).toHaveBeenCalled();
    });
    const arg = getMock.mock.calls[0]?.[0] as { publicKey: { allowCredentials: unknown[] } };
    expect(arg.publicKey.allowCredentials).toEqual([]);
    expect(onSuccessMock).toHaveBeenCalled();
  });

  it('shows auth-cancelled toast when the assertion is cancelled', async () => {
    const err = new Error('cancelled');
    err.name = 'NotAllowedError';
    getMock.mockRejectedValue(err);
    render(<WebAuthnButton mode="login" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('toasts.authCancelled');
    });
  });

  it('shows a login failure toast and logs when the assertion fails', async () => {
    getMock.mockRejectedValue(new Error('boom'));
    render(<WebAuthnButton mode="login" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('toasts.biometricLoginFailed');
    });
    expect(loggerError).toHaveBeenCalled();
  });

  it('shows an error when the assertion returns nothing', async () => {
    getMock.mockResolvedValue(null);
    render(<WebAuthnButton mode="login" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('toasts.biometricLoginFailed');
    });
  });
});
