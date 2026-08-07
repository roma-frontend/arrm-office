/**
 * Tests for src/app/(auth)/login/page.tsx — the login page.
 *
 * Mocks: next/dynamic (FaceLogin), i18n, cssMotion, lucide, next-auth,
 * auth store, keystroke dynamics, device fingerprint, auth UI components.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOpts?: string | Record<string, unknown>) =>
      typeof fallbackOrOpts === 'string' ? fallbackOrOpts : key,
    ready: true,
    i18n: { language: 'en' },
  }),
}));

// ── next/dynamic → FaceLogin becomes inert ───────────────────────────────────
jest.mock('next/dynamic', () => {
  const MockDynamic = () => null;
  MockDynamic.displayName = 'DynamicMock';
  return jest.fn(() => MockDynamic);
});

jest.mock('next/link', () => {
  return ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
});

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    Mail: Icon,
    Fingerprint: Icon,
    AlertCircle: Icon,
    Building2: Icon,
    ScanFace: Icon,
    ShieldCheck: Icon,
  };
});

// ── next-auth session ────────────────────────────────────────────────────────
let mockSessionStatus = 'unauthenticated';
jest.mock('next-auth/react', () => ({
  useSession: () => ({ status: mockSessionStatus }),
}));

// ── auth store ───────────────────────────────────────────────────────────────
const mockLogin = jest.fn();
let mockIsAuthenticated = false;
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ login: mockLogin, isAuthenticated: mockIsAuthenticated }),
}));

// ── navigation ───────────────────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ── keystroke + fingerprint + logger ─────────────────────────────────────────
jest.mock('@/hooks/useKeystrokeDynamics', () => ({
  useKeystrokeDynamics: () => ({ getSample: jest.fn(), reset: jest.fn() }),
}));

jest.mock('@/lib/deviceFingerprint', () => ({
  getDeviceFingerprint: jest.fn().mockResolvedValue({ fingerprint: 'fp-test' }),
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), log: jest.fn() },
}));

// ── auth UI components ───────────────────────────────────────────────────────
jest.mock('@/components/auth/WebAuthnButton', () => ({
  WebAuthnButton: ({ mode, onSuccess }: any) => (
    <button type="button" data-testid="webauthn" onClick={() => onSuccess('cred-1')}>
      webauthn-{mode}
    </button>
  ),
}));

jest.mock('@/components/auth/GoogleSignInButton', () => ({
  GoogleSignInButton: () => <div data-testid="google-signin" />,
}));

jest.mock('@/components/auth/ImidSignInButton', () => ({
  ImidSignInButton: () => <div data-testid="imid-signin" />,
}));

jest.mock('@/components/auth/OAuthSyncLoader', () => ({
  OAuthSyncLoader: () => null,
}));

jest.mock('@/components/onboarding/OnboardingTour', () => ({
  OnboardingTour: () => null,
}));

jest.mock('@/components/onboarding/loginTourSteps', () => ({
  getLoginTourSteps: jest.fn(() => []),
}));

jest.mock('@/components/auth/SmartEmailInput', () => ({
  SmartEmailInput: ({ value, onChange, placeholder }: any) => (
    <input
      type="email"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      data-testid="email-input"
    />
  ),
}));

jest.mock('@/components/auth/SmartPasswordInput', () => ({
  SmartPasswordInput: ({ value, onChange, placeholder, forgotPasswordLink }: any) => (
    <div>
      <input
        type="password"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        data-testid="password-input"
      />
      {forgotPasswordLink}
    </div>
  ),
}));

jest.mock('@/components/auth/SmartErrorMessage', () => ({
  SmartErrorMessage: ({ error }: any) => <div data-testid="error-msg">{error.message}</div>,
  parseAuthError: (e: string) => ({ message: e }),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <span data-testid="shield-loader" />,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, type, ...props }: any) => (
    <button type={type ?? 'button'} onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

import LoginPage from '@/app/(auth)/login/page';

describe('login page', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn();
    (globalThis as any).fetch = fetchMock;
    mockSessionStatus = 'unauthenticated';
    mockIsAuthenticated = false;
    // clean URL search params
    window.history.pushState({}, '', '/login');
  });

  afterEach(() => {
    delete (globalThis as any).fetch;
  });

  it('renders the email login form by default', async () => {
    render(<LoginPage />);
    expect(await screen.findByTestId('email-input')).toBeInTheDocument();
    expect(screen.getByTestId('password-input')).toBeInTheDocument();
    // after hydration the labels switch from the English fallback to keys
    expect(await screen.findByText('auth.signIn')).toBeInTheDocument();
  });

  it('switches to Face ID mode', async () => {
    render(<LoginPage />);
    fireEvent.click(await screen.findByText('auth.faceId'));
    // FaceLogin is a next/dynamic mock (null), so just verify the tab works
    // by checking the other modes are hidden
    expect(screen.queryByTestId('email-input')).not.toBeInTheDocument();
  });

  it('switches to Touch ID mode and renders WebAuthn', async () => {
    render(<LoginPage />);
    fireEvent.click(await screen.findByText('auth.touchId'));
    expect(await screen.findByTestId('webauthn')).toBeInTheDocument();
  });

  it('submits credentials and logs the user in', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        session: {
          userId: 'u1',
          name: 'Anna',
          email: 'anna@x.com',
          role: 'employee',
          organizationId: 'org-1',
        },
      }),
    });
    render(<LoginPage />);
    await screen.findByTestId('email-input');

    fireEvent.change(screen.getByTestId('email-input'), {
      target: { value: 'anna@x.com' },
    });
    fireEvent.change(screen.getByTestId('password-input'), {
      target: { value: 'secret123' },
    });
    fireEvent.submit(document.querySelector('form#email-login-form')!);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.any(Object)),
    );
    await waitFor(() => expect(mockLogin).toHaveBeenCalled());
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
  });

  it('shows an error message on failed login', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Invalid credentials' }),
    });
    render(<LoginPage />);
    await screen.findByTestId('email-input');

    fireEvent.change(screen.getByTestId('email-input'), {
      target: { value: 'bad@x.com' },
    });
    fireEvent.change(screen.getByTestId('password-input'), {
      target: { value: 'wrong' },
    });
    fireEvent.submit(document.querySelector('form#email-login-form')!);

    expect(await screen.findByTestId('error-msg')).toHaveTextContent('Invalid credentials');
  });

  it('redirects to the next URL after login', async () => {
    window.history.pushState({}, '', '/login?next=/goals');
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        session: {
          userId: 'u1',
          name: 'Anna',
          email: 'anna@x.com',
          role: 'employee',
          organizationId: 'org-1',
        },
      }),
    });
    render(<LoginPage />);
    await screen.findByTestId('email-input');

    fireEvent.change(screen.getByTestId('email-input'), {
      target: { value: 'anna@x.com' },
    });
    fireEvent.change(screen.getByTestId('password-input'), {
      target: { value: 'secret123' },
    });
    fireEvent.submit(document.querySelector('form#email-login-form')!);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/goals'));
  });

  it('enters the 2FA step when the server requires it', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ requiresTwoFactor: true, tempToken: 'tok-1' }),
    });
    render(<LoginPage />);
    await screen.findByTestId('email-input');

    fireEvent.change(screen.getByTestId('email-input'), {
      target: { value: 'anna@x.com' },
    });
    fireEvent.change(screen.getByTestId('password-input'), {
      target: { value: 'secret123' },
    });
    fireEvent.submit(document.querySelector('form#email-login-form')!);

    expect(await screen.findByText('Two-Factor Authentication')).toBeInTheDocument();
  });

  it('renders the maintenance screen when ?maintenance=true', async () => {
    window.history.pushState({}, '', '/login?maintenance=true');
    render(<LoginPage />);
    expect(await screen.findByText('maintenance.title')).toBeInTheDocument();
    // The paragraph combines two translation keys with a <br/>, so match a fragment
    expect(screen.getByText(/maintenance\.systemUnavailable/)).toBeInTheDocument();
  });
});
