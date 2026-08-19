/**
 * Tests for src/app/(auth)/register/page.tsx — the join-an-organization page.
 *
 * Mocks: registerAction, convex/react + api, sonner, i18n, cssMotion, lucide,
 * auth store, auth input components, UI primitives, I18nProvider.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOpts?: string | Record<string, unknown>) =>
      typeof fallbackOrOpts === 'string' ? fallbackOrOpts : key,
    ready: true,
    i18n: { language: 'en' },
  }),
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    User: Icon,
    Phone: Icon,
    AlertCircle: Icon,
    Building2: Icon,
    CheckCircle2: Icon,
    Search: Icon,
    ChevronRight: Icon,
    ArrowLeft: Icon,
    X: Icon,
    Sparkles: Icon,
    Users: Icon,
  };
});

jest.mock('next/link', () => {
  return ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
});

// ── registerAction ───────────────────────────────────────────────────────────
const mockRegisterAction = jest.fn();
jest.mock('@/actions/auth', () => ({
  registerAction: (...args: any[]) => mockRegisterAction(...args),
}));

// ── auth store ───────────────────────────────────────────────────────────────
const mockLogin = jest.fn();
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ login: mockLogin }),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

// ── convex ───────────────────────────────────────────────────────────────────
let queryResults: Record<string, unknown> = {};
jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    organizations: {
      searchOrganizations: { _name: 'searchOrganizations' },
      getOrganizationBySlug: { _name: 'getOrganizationBySlug' },
    },
    branding: {
      getBrandingByOrg: { _name: 'getBrandingByOrg' },
    },
  },
}));

// ── navigation ───────────────────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

// ── I18nProvider: passthrough (keeps focus on the page logic) ────────────────
jest.mock('@/components/I18nProvider', () => ({
  __esModule: true,
  default: ({ children }: any) => <>{children}</>,
  I18nProvider: ({ children }: any) => <>{children}</>,
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
  SmartPasswordInput: ({ value, onChange, placeholder }: any) => (
    <input
      type="password"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      data-testid="password-input"
    />
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
  // Note: `disabled` is intentionally dropped so fireEvent can exercise the
  // onClick handler even for disabled-looking buttons (the real component
  // would block the click natively).
  Button: ({ children, onClick, disabled, type, ...props }: any) => (
    <button type={type ?? 'button'} onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

import RegisterPage from '@/app/(auth)/register/page';

describe('register page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryResults = {};
    window.history.pushState({}, '', '/register');
  });

  it('renders the organization search step first', async () => {
    render(<RegisterPage />);
    expect(await screen.findByText('Find your organization')).toBeInTheDocument();
    expect(screen.getByText('Continue')).toBeInTheDocument();
  });

  it('shows an error when continuing without selecting an organization', async () => {
    render(<RegisterPage />);
    await screen.findByText('Continue');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Please select your organization')).toBeInTheDocument();
  });

  it('selecting an organization advances to the details step', async () => {
    window.history.pushState({}, '', '/register?org=acme');
    queryResults.getOrganizationBySlug = { _id: 'o1', name: 'Acme Inc', slug: 'acme' };
    render(<RegisterPage />);
    expect(await screen.findByText('Create account')).toBeInTheDocument();
    expect(await screen.findByTestId('email-input')).toBeInTheDocument();
  });

  it('validates the password length on submit', async () => {
    window.history.pushState({}, '', '/register?org=acme');
    queryResults.getOrganizationBySlug = { _id: 'o1', name: 'Acme Inc', slug: 'acme' };
    render(<RegisterPage />);
    await screen.findByTestId('email-input');

    fireEvent.change(screen.getByTestId('email-input'), {
      target: { value: 'anna@x.com' },
    });
    fireEvent.change(screen.getByTestId('password-input'), {
      target: { value: 'short' },
    });
    fireEvent.submit(document.querySelector('form#personal-details-form')!);

    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(mockRegisterAction).not.toHaveBeenCalled();
  });

  it('calls registerAction and redirects on success', async () => {
    window.history.pushState({}, '', '/register?org=acme');
    queryResults.getOrganizationBySlug = { _id: 'o1', name: 'Acme Inc', slug: 'acme' };
    mockRegisterAction.mockResolvedValue({
      success: true,
      role: 'employee',
      needsApproval: false,
      userId: 'u1',
      name: 'Anna',
      email: 'anna@x.com',
    });
    render(<RegisterPage />);
    await screen.findByTestId('email-input');

    fireEvent.change(screen.getByTestId('email-input'), {
      target: { value: 'anna@x.com' },
    });
    fireEvent.change(screen.getByTestId('password-input'), {
      target: { value: 'StrongPass123' },
    });
    fireEvent.submit(document.querySelector('form#personal-details-form')!);

    await waitFor(() => expect(mockRegisterAction).toHaveBeenCalled());
    await waitFor(() => expect(mockLogin).toHaveBeenCalled());
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
  });

  it('routes to /login after a delayed redirect when approval is needed', async () => {
    window.history.pushState({}, '', '/register?org=acme');
    queryResults.getOrganizationBySlug = { _id: 'o1', name: 'Acme Inc', slug: 'acme' };
    mockRegisterAction.mockResolvedValue({
      success: true,
      role: 'employee',
      needsApproval: true,
    });
    render(<RegisterPage />);
    await screen.findByTestId('email-input');

    fireEvent.change(screen.getByTestId('email-input'), {
      target: { value: 'anna@x.com' },
    });
    fireEvent.change(screen.getByTestId('password-input'), {
      target: { value: 'StrongPass123' },
    });
    fireEvent.submit(document.querySelector('form#personal-details-form')!);

    await waitFor(() => expect(mockRegisterAction).toHaveBeenCalled());
    // The page waits 3s before redirecting to /login when approval is needed
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'), { timeout: 5000 });
  });
});
