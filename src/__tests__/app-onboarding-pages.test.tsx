/**
 * Tests for onboarding & org-registration pages in src/app/(auth):
 *   - onboarding/pending: pending / rejected / no-request states + auto-redirect
 *   - onboarding/select-organization: org directory, search, join flow
 *   - register-org: plan selection → router.push
 *   - register-org/pending: request submitted screen
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
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
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    Clock: Icon,
    Mail: Icon,
    Building2: Icon,
    XCircle: Icon,
    Search: Icon,
    CheckCircle2: Icon,
    Briefcase: Icon,
    Globe2: Icon,
    Hash: Icon,
    Lightbulb: Icon,
    Inbox: Icon,
    Loader2: Icon,
    X: Icon,
    Check: Icon,
    Zap: Icon,
    Crown: Icon,
    ArrowRight: Icon,
    ArrowLeft: Icon,
  };
});

jest.mock('next/link', () => {
  return ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
});

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, type, ...props }: any) => (
    <button type={type ?? 'button'} onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('next-auth/react', () => ({
  signOut: jest.fn(),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: any) => <img src={src} alt={alt} data-testid="next-image" />,
}));

// ── Convex mocks ─────────────────────────────────────────────────────────────
let queryResults: Record<string, unknown> = {};
const mockMutation = jest.fn().mockResolvedValue({});
jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation: () => mockMutation,
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    users: { queries: { getCurrentUser: { _name: 'getCurrentUser' } } },
    organizationJoinRequests: {
      getMyJoinRequests: { _name: 'getMyJoinRequests' },
      getActiveOrganizations: { _name: 'getActiveOrganizations' },
      requestJoinOrganization: { _name: 'requestJoinOrganization' },
    },
  },
}));

// ── Auth store ───────────────────────────────────────────────────────────────
let mockUser: any = { id: 'user-1', email: 'a@b.com', role: 'employee' };
const mockSetUser = jest.fn();
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser, setUser: mockSetUser }),
}));

// ── next/navigation ──────────────────────────────────────────────────────────
const mockPush = jest.fn();
let mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

// ── useCurrency (register-org) ───────────────────────────────────────────────
jest.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({
    loading: false,
    starter: { formatted: '$29' },
    professional: { formatted: '$79' },
    currency: 'USD',
    symbol: '$',
    locale: 'en',
  }),
}));

import PendingApprovalPage from '@/app/(auth)/onboarding/pending/page';
import SelectOrganizationPage from '@/app/(auth)/onboarding/select-organization/page';
import RegisterOrgPage from '@/app/(auth)/register-org/page';
import PendingOrgPage from '@/app/(auth)/register-org/pending/page';

const USER = { _id: 'u1', name: 'User', email: 'a@b.com', role: 'employee' };

describe('onboarding/pending page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'user-1', email: 'a@b.com', role: 'employee' };
    queryResults = {
      getCurrentUser: { ...USER, organizationId: null, isApproved: false },
    };
  });

  it('shows a spinner while user data is loading', () => {
    queryResults.getCurrentUser = undefined;
    const { container } = render(<PendingApprovalPage />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows the pending request card', () => {
    queryResults.getMyJoinRequests = [{ _id: 'r1', status: 'pending' }];
    render(<PendingApprovalPage />);
    expect(screen.getByText('Pending Approval')).toBeInTheDocument();
    expect(screen.getByText('Request Sent')).toBeInTheDocument();
    expect(screen.getByText('a@b.com')).toBeInTheDocument();
  });

  it('shows the rejected request card with the rejection reason', () => {
    queryResults.getMyJoinRequests = [
      { _id: 'r1', status: 'rejected', rejectionReason: 'Email domain mismatch' },
    ];
    render(<PendingApprovalPage />);
    expect(screen.getByText('Request Rejected')).toBeInTheDocument();
    expect(screen.getByText('Email domain mismatch')).toBeInTheDocument();
  });

  it('shows the no-request fallback', () => {
    queryResults.getMyJoinRequests = [];
    render(<PendingApprovalPage />);
    expect(screen.getByText('No pending requests found')).toBeInTheDocument();
  });

  it('redirects to the dashboard when the user becomes approved', async () => {
    queryResults.getCurrentUser = { ...USER, organizationId: 'org-1', isApproved: true };
    queryResults.getMyJoinRequests = [{ _id: 'r1', status: 'pending' }];
    render(<PendingApprovalPage />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
    expect(mockSetUser).toHaveBeenCalled();
  });
});

describe('onboarding/select-organization page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'user-1', email: 'a@b.com', role: 'employee' };
    mockSearchParams = new URLSearchParams();
    queryResults = {
      getCurrentUser: { ...USER, organizationId: null, isApproved: false },
      getActiveOrganizations: [
        {
          _id: 'o1',
          name: 'Acme Inc',
          slug: 'acme',
          industry: 'Tech',
          country: 'US',
          plan: 'starter',
        },
        { _id: 'o2', name: 'Beta Corp', slug: 'beta', industry: 'Finance', country: 'DE' },
      ],
      getMyJoinRequests: [],
    };
  });

  it('renders the directory of active organizations', async () => {
    render(<SelectOrganizationPage />);
    expect(await screen.findByText('Acme Inc')).toBeInTheDocument();
    expect(screen.getByText('Beta Corp')).toBeInTheDocument();
  });

  it('filters organizations by search query', async () => {
    render(<SelectOrganizationPage />);
    await screen.findByText('Acme Inc');
    const input = screen.getByPlaceholderText('auth.joinOrg.searchPlaceholder');
    fireEvent.change(input, { target: { value: 'beta' } });
    expect(screen.queryByText('Acme Inc')).not.toBeInTheDocument();
    expect(screen.getByText('Beta Corp')).toBeInTheDocument();
  });

  it('shows the empty state when no organizations match', async () => {
    render(<SelectOrganizationPage />);
    await screen.findByText('Acme Inc');
    const input = screen.getByPlaceholderText('auth.joinOrg.searchPlaceholder');
    fireEvent.change(input, { target: { value: 'zzz-no-match' } });
    expect(await screen.findByText('auth.joinOrg.noResults')).toBeInTheDocument();
  });

  it('joins an organization and redirects to pending', async () => {
    mockMutation.mockResolvedValue({});
    render(<SelectOrganizationPage />);
    await screen.findByText('Acme Inc');
    const joinButtons = screen.getAllByText('auth.joinOrg.join');
    fireEvent.click(joinButtons[0]!);
    await waitFor(() => expect(mockMutation).toHaveBeenCalled());
    // router.push fires inside a 600ms setTimeout after the mutation resolves
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/onboarding/pending'), {
      timeout: 3000,
    });
  });

  it('shows the skeleton while organizations load', () => {
    queryResults.getActiveOrganizations = undefined;
    queryResults.getMyJoinRequests = undefined;
    const { container } = render(<SelectOrganizationPage />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('redirects to dashboard when the user is already approved', async () => {
    queryResults.getCurrentUser = { ...USER, organizationId: 'o1', isApproved: true };
    render(<SelectOrganizationPage />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
  });
});

describe('register-org page (plan selection)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all three plans', () => {
    render(<RegisterOrgPage />);
    expect(screen.getByText('Choose Your Plan')).toBeInTheDocument();
    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.getByText('Professional')).toBeInTheDocument();
    expect(screen.getByText('Enterprise')).toBeInTheDocument();
    expect(screen.getByText('Most Popular')).toBeInTheDocument();
  });

  it('navigates to /register-org/create for the starter plan', () => {
    render(<RegisterOrgPage />);
    fireEvent.click(screen.getByText('Starter'));
    expect(mockPush).toHaveBeenCalledWith('/register-org/create?plan=starter');
  });

  it('navigates to /register-org/request for professional and enterprise', () => {
    render(<RegisterOrgPage />);
    fireEvent.click(screen.getByText('Professional'));
    expect(mockPush).toHaveBeenCalledWith('/register-org/request?plan=professional');
  });
});

describe('register-org/pending page', () => {
  it('renders the submitted request screen', () => {
    render(<PendingOrgPage />);
    expect(screen.getByText('Request Submitted!')).toBeInTheDocument();
    expect(screen.getByText('Thank you for your interest in Strata.')).toBeInTheDocument();
    expect(screen.getByText('Request Received')).toBeInTheDocument();
    expect(screen.getByText('Under Review')).toBeInTheDocument();
    expect(screen.getByText('Email Notification')).toBeInTheDocument();
    expect(screen.getByText('Go to Login').closest('a')).toHaveAttribute('href', '/login');
  });
});
