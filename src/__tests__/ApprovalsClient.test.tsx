/**
 * Tests for ApprovalsClient — the admin approvals list for pending users.
 *
 * Covers: the access-denied state for non-admin roles, the loading skeleton,
 * the all-caught-up empty state, the user cards (avatar initials/avatarUrl,
 * name, email, pending badge, role/type/registered date with locale/phone),
 * navigation to the approval detail page on card click, the approve flow
 * (success, no-user guard, mutation error, non-Error error) and the reject
 * flow (confirm decline, confirm accept, success, mutation error), including
 * the stopPropagation on both action buttons.
 *
 * Mocks: react-i18next, next/navigation, @/lib/cssMotion, lucide, convex/react
 * (keyed by _name), generated api, auth store (mutable user), selected org,
 * sonner toast, i18next (language), UI primitives (card/button/badge/
 * ShieldLoader) and date-fns is real.
 */

import React from 'react';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';

// ── i18n ─────────────────────────────────────────────────────────────────────
let mockLanguage = 'en';
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => (typeof opts === 'object' ? key : (opts ?? key)),
    i18n: { language: mockLanguage },
  }),
}));

let mockI18nLang = 'en';
jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    get language() {
      return mockI18nLang;
    },
  },
}));

// ── next/navigation ──────────────────────────────────────────────────────────
const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

// ── cssMotion ────────────────────────────────────────────────────────────────
jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

// ── lucide ───────────────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const names = ['UserCheck', 'UserX', 'Clock', 'Mail', 'Calendar', 'CheckCircle'];
  const mocks: Record<string, any> = {};
  for (const name of names) {
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  }
  return mocks;
});

// ── Convex ───────────────────────────────────────────────────────────────────
const mockMutations: Record<string, jest.Mock> = {};
const mockQueries: Record<string, any> = {};
// When true, the query returns data even for the 'skip' arg so the defensive
// no-user-id branches inside the handlers can be exercised through the UI.
let mockForceQuery = false;
jest.mock('convex/react', () => ({
  useQuery: (q: any, args: any) =>
    q?._name === 'getPendingApprovalUsers'
      ? args === 'skip' && !mockForceQuery
        ? undefined
        : mockQueries.pendingUsers
      : undefined,
  useMutation: (m: any) => {
    if (m?._name && !mockMutations[m._name]) mockMutations[m._name] = jest.fn();
    return mockMutations[m?._name] ?? jest.fn();
  },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    users: {
      queries: { getPendingApprovalUsers: { _name: 'getPendingApprovalUsers' } },
      mutations: {
        approveUser: { _name: 'approveUser' },
        rejectUser: { _name: 'rejectUser' },
      },
    },
  },
}));

// ── Auth / org ───────────────────────────────────────────────────────────────
let mockUser: Record<string, unknown> | null = {
  id: 'u1',
  role: 'admin',
  organizationId: 'org1',
};
// ApprovalsClient calls useAuthStore() without a selector.
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => 'org1',
}));

// ── Toast / i18n ─────────────────────────────────────────────────────────────
const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('sonner', () => ({
  toast: mockToast,
}));

// ── UI primitives ────────────────────────────────────────────────────────────
jest.mock('@/components/ui/card', () => ({
  Card: ({ children, onClick, className }: any) => (
    <div data-testid="card" onClick={onClick} className={className}>
      {children}
    </div>
  ),
  CardContent: ({ children, className }: any) => (
    <div data-testid="card-content" className={className}>
      {children}
    </div>
  ),
  CardHeader: ({ children, className }: any) => (
    <div data-testid="card-header" className={className}>
      {children}
    </div>
  ),
  CardTitle: ({ children, className }: any) => (
    <h3 data-testid="card-title" className={className}>
      {children}
    </h3>
  ),
  CardDescription: ({ children, className }: any) => (
    <p data-testid="card-description" className={className}>
      {children}
    </p>
  ),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, size, className, ...props }: any) => (
    <button onClick={onClick} className={className} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: any) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

import ApprovalsClient from '@/components/approvals/ApprovalsClient';

const PENDING_USERS: any[] = [
  {
    _id: 'u1',
    name: 'Alice Smith',
    email: 'alice@test.com',
    role: 'employee',
    employeeType: 'full_time',
    createdAt: Date.parse('2024-03-10T12:00:00Z'),
    phone: '+374-55-123',
  },
  {
    _id: 'u2',
    name: 'Bob',
    email: 'bob@test.com',
    role: 'employee',
    employeeType: 'contractor',
    createdAt: Date.parse('2024-04-20T08:30:00Z'),
    phone: null,
    avatarUrl: 'https://example.com/bob.png',
  },
];

describe('ApprovalsClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLanguage = 'en';
    mockI18nLang = 'en';
    mockUser = { id: 'u1', role: 'admin', organizationId: 'org1' };
    mockQueries.pendingUsers = undefined;
    mockForceQuery = false;
    for (const key of Object.keys(mockMutations)) {
      mockMutations[key].mockReset().mockResolvedValue(undefined);
    }
    mockRouter.push.mockReset();
    (globalThis as any).confirm = jest.fn(() => true);
  });

  it('shows the access-denied state for a regular employee', () => {
    mockUser = { id: 'u1', role: 'employee', organizationId: 'org1' };
    render(<ApprovalsClient />);
    expect(screen.getByText('ui.accessDenied')).toBeInTheDocument();
    expect(screen.getByText('ui.onlyAdminsCanAccess')).toBeInTheDocument();
  });

  it('shows the access-denied state when there is no user', () => {
    mockUser = null;
    render(<ApprovalsClient />);
    expect(screen.getByText('ui.accessDenied')).toBeInTheDocument();
  });

  it('allows superadmins through', () => {
    mockUser = { id: 'u1', role: 'superadmin', organizationId: 'org1' };
    render(<ApprovalsClient />);
    expect(screen.queryByText('ui.accessDenied')).toBeNull();
    expect(screen.getByText('ui.userApprovals')).toBeInTheDocument();
  });

  it('shows the loading skeleton while the query is pending', () => {
    mockQueries.pendingUsers = undefined;
    render(<ApprovalsClient />);
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
    expect(screen.getByText('ui.userApprovals')).toBeInTheDocument();
  });

  it('shows the all-caught-up state when there are no pending users', () => {
    mockQueries.pendingUsers = [];
    render(<ApprovalsClient />);
    expect(screen.getByText('ui.allCaughtUp')).toBeInTheDocument();
    expect(screen.getByText('ui.noPendingApprovals')).toBeInTheDocument();
  });

  it('renders user cards with initials when there is no avatar', () => {
    mockQueries.pendingUsers = PENDING_USERS;
    render(<ApprovalsClient />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('alice@test.com')).toBeInTheDocument();
    // Initials for "Alice Smith" → AS.
    expect(screen.getByText('AS')).toBeInTheDocument();
    expect(screen.getAllByTestId('badge')).toHaveLength(2);
    expect(screen.getAllByText('ui.pending')).toHaveLength(2);
  });

  it('renders an avatar image when avatarUrl is present', () => {
    mockQueries.pendingUsers = PENDING_USERS;
    render(<ApprovalsClient />);
    const img = document.querySelector('img[alt="Bob"]') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toContain('example.com/bob.png');
  });

  it('renders role, type, registered date and phone, with a dash for missing phones', () => {
    mockQueries.pendingUsers = PENDING_USERS;
    render(<ApprovalsClient />);
    expect(screen.getAllByText('employee')).toHaveLength(2);
    expect(screen.getAllByText('full_time')).toHaveLength(1);
    expect(screen.getAllByText('contractor')).toHaveLength(1);
    const enDate = format(new Date(PENDING_USERS[0].createdAt), 'MMM d, yyyy', {
      locale: enUS,
    });
    expect(screen.getByText(enDate)).toBeInTheDocument();
    expect(screen.getByText('+374-55-123')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('formats the registered date with the Russian locale', () => {
    mockLanguage = 'ru';
    mockI18nLang = 'ru';
    mockQueries.pendingUsers = PENDING_USERS;
    render(<ApprovalsClient />);
    const ruDate = format(new Date(PENDING_USERS[0].createdAt), 'MMM d, yyyy', {
      locale: ru,
    });
    expect(screen.getByText(ruDate)).toBeInTheDocument();
  });

  it('formats the registered date with the Armenian locale', () => {
    mockLanguage = 'hy';
    mockI18nLang = 'hy';
    mockQueries.pendingUsers = PENDING_USERS;
    render(<ApprovalsClient />);
    const hyDate = format(new Date(PENDING_USERS[0].createdAt), 'MMM d, yyyy', {
      locale: hy,
    });
    expect(screen.getByText(hyDate)).toBeInTheDocument();
  });

  it('navigates to the approval detail page when a card is clicked', () => {
    mockQueries.pendingUsers = PENDING_USERS;
    render(<ApprovalsClient />);
    const cards = screen.getAllByTestId('card');
    fireEvent.click(cards[0]);
    expect(mockRouter.push).toHaveBeenCalledWith('/approvals/u1');
  });

  it('approves a user and toasts success', async () => {
    mockQueries.pendingUsers = PENDING_USERS;
    render(<ApprovalsClient />);
    fireEvent.click(screen.getAllByText('ui.approve')[0]);
    await waitFor(() =>
      expect(mockMutations.approveUser).toHaveBeenCalledWith({
        userId: 'u1',
        adminId: 'u1',
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('ui.userApproved');
  });

  it('approve button stops propagation so the card is not clicked', async () => {
    mockQueries.pendingUsers = PENDING_USERS;
    render(<ApprovalsClient />);
    fireEvent.click(screen.getAllByText('ui.approve')[0]);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('toasts an error when approval fails with an Error', async () => {
    mockMutations.approveUser.mockRejectedValue(new Error('approve boom'));
    mockQueries.pendingUsers = PENDING_USERS;
    render(<ApprovalsClient />);
    fireEvent.click(screen.getAllByText('ui.approve')[0]);
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('approve boom'));
  });

  it('falls back to a generic message when approval fails with a non-Error', async () => {
    mockMutations.approveUser.mockRejectedValue('string failure');
    mockQueries.pendingUsers = PENDING_USERS;
    render(<ApprovalsClient />);
    fireEvent.click(screen.getAllByText('ui.approve')[0]);
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('ui.failedToApproveUser'));
  });

  it('shows a login prompt when the user has no id and approve is clicked', async () => {
    mockUser = { role: 'admin', organizationId: 'org1' };
    mockForceQuery = true;
    mockQueries.pendingUsers = PENDING_USERS;
    render(<ApprovalsClient />);
    fireEvent.click(screen.getAllByText('ui.approve')[0]);
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('ui.pleaseLoginAgain'));
    expect(mockMutations.approveUser).not.toHaveBeenCalled();
  });

  it('rejects a user after confirm and toasts success', async () => {
    mockQueries.pendingUsers = PENDING_USERS;
    render(<ApprovalsClient />);
    fireEvent.click(screen.getAllByText('ui.reject')[0]);
    await waitFor(() =>
      expect(mockMutations.rejectUser).toHaveBeenCalledWith({
        userId: 'u1',
        adminId: 'u1',
      }),
    );
    expect((globalThis as any).confirm).toHaveBeenCalledWith('ui.confirmRejectUser');
    expect(mockToast.success).toHaveBeenCalledWith('ui.userRejected');
  });

  it('does nothing when the confirm dialog is declined', async () => {
    (globalThis as any).confirm = jest.fn(() => false);
    mockQueries.pendingUsers = PENDING_USERS;
    render(<ApprovalsClient />);
    fireEvent.click(screen.getAllByText('ui.reject')[0]);
    await waitFor(() => expect((globalThis as any).confirm).toHaveBeenCalled());
    expect(mockMutations.rejectUser).not.toHaveBeenCalled();
  });

  it('toasts an error when rejection fails', async () => {
    mockMutations.rejectUser.mockRejectedValue(new Error('reject boom'));
    mockQueries.pendingUsers = PENDING_USERS;
    render(<ApprovalsClient />);
    fireEvent.click(screen.getAllByText('ui.reject')[0]);
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('reject boom'));
  });

  it('falls back when rejection fails with a non-Error', async () => {
    mockMutations.rejectUser.mockRejectedValue({ code: 42 });
    mockQueries.pendingUsers = PENDING_USERS;
    render(<ApprovalsClient />);
    fireEvent.click(screen.getAllByText('ui.reject')[0]);
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('ui.failedToRejectUser'));
  });

  it('does nothing on reject when the user has no id', async () => {
    mockUser = { role: 'admin', organizationId: 'org1' };
    mockForceQuery = true;
    mockQueries.pendingUsers = PENDING_USERS;
    render(<ApprovalsClient />);
    fireEvent.click(screen.getAllByText('ui.reject')[0]);
    await waitFor(() => expect((globalThis as any).confirm).not.toHaveBeenCalled());
    expect(mockMutations.rejectUser).not.toHaveBeenCalled();
  });
});
