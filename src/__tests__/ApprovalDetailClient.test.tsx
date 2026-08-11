/**
 * Tests for ApprovalDetailClient — the single pending-user approval detail
 * page.
 *
 * Covers: the access-denied state, the loading skeleton, the user details
 * (avatar fallback, name/email, role/type badges with fallback labels, phone,
 * localized registered date, status badge, contact + employment sections),
 * the back button, and the approve/reject flows in both the header and the
 * actions card (success with redirect, mutation error, disabled while
 * pending, no-current-user guard).
 *
 * Mocks: react-i18next (mutable language), next/navigation (useParams +
 * useRouter), convex/react keyed by _name, generated api, auth store
 * (mutable user), sonner toast, UI primitives (card/badge/button/skeleton/
 * avatar) and lucide icons. date-fns is real.
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
    t: (key: string, fallback?: any) =>
      typeof fallback === 'string' ? fallback : (fallback ?? key),
    i18n: { language: mockLanguage },
  }),
}));

// ── next/navigation ──────────────────────────────────────────────────────────
let mockParams = { id: 'pending-1' };
const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({
  useParams: () => mockParams,
  useRouter: () => mockRouter,
}));

// ── Convex ───────────────────────────────────────────────────────────────────
const mockMutations: Record<string, jest.Mock> = {};
const mockQueries: Record<string, any> = {};
jest.mock('convex/react', () => ({
  useQuery: (q: any, args: any) => {
    if (q?._name === 'getPendingUserById') return mockQueries.pendingUser;
    if (q?._name === 'getUserById') {
      return args === 'skip' ? undefined : mockQueries.currentUser;
    }
    return undefined;
  },
  useMutation: (m: any) => {
    if (m?._name && !mockMutations[m._name]) mockMutations[m._name] = jest.fn();
    return mockMutations[m?._name] ?? jest.fn();
  },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    users: {
      queries: {
        getPendingUserById: { _name: 'getPendingUserById' },
        getUserById: { _name: 'getUserById' },
      },
      mutations: {
        approveUser: { _name: 'approveUser' },
        rejectUser: { _name: 'rejectUser' },
      },
    },
  },
}));

// ── Auth ─────────────────────────────────────────────────────────────────────
let mockUser: Record<string, unknown> | null = {
  id: 'admin-1',
  role: 'admin',
  organizationId: 'org1',
};
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

// ── Toast ────────────────────────────────────────────────────────────────────
const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('sonner', () => ({
  toast: mockToast,
}));

// ── UI primitives ────────────────────────────────────────────────────────────
jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span data-testid="badge" data-variant={variant} data-class={className}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, size, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} className={className} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: any) => <div data-testid="avatar">{children}</div>,
  AvatarImage: (props: any) => <img data-testid="avatar-image" {...props} alt="" />,
  AvatarFallback: ({ children }: any) => <span data-testid="avatar-fallback">{children}</span>,
}));

jest.mock('lucide-react', () => {
  const names = [
    'ArrowLeft',
    'Clock',
    'CheckCircle',
    'XCircle',
    'AlertCircle',
    'Mail',
    'Phone',
    'Building2',
    'Briefcase',
  ];
  const mocks: Record<string, any> = {};
  for (const name of names) {
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  }
  return mocks;
});

import ApprovalDetailClient from '@/components/approvals/ApprovalDetailClient';

const PENDING_USER: any = {
  _id: 'pending-1',
  name: 'New Employee',
  email: 'new@test.com',
  role: 'employee',
  employeeType: 'full_time',
  createdAt: Date.parse('2024-03-10T12:00:00Z'),
  phone: '+374-55-777',
};

describe('ApprovalDetailClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLanguage = 'en';
    mockParams = { id: 'pending-1' };
    mockUser = { id: 'admin-1', role: 'admin', organizationId: 'org1' };
    mockQueries.pendingUser = PENDING_USER;
    mockQueries.currentUser = { _id: 'admin-1', role: 'admin' };
    for (const key of Object.keys(mockMutations)) {
      mockMutations[key].mockReset().mockResolvedValue(undefined);
    }
    mockRouter.push.mockReset();
  });

  it('shows the access-denied state for non-admin roles', () => {
    mockUser = { id: 'u1', role: 'employee', organizationId: 'org1' };
    render(<ApprovalDetailClient />);
    expect(screen.getByText('ui.accessDenied')).toBeInTheDocument();
    expect(screen.getByText('ui.onlyAdminsCanAccess')).toBeInTheDocument();
  });

  it('shows the access-denied state when there is no user', () => {
    mockUser = null;
    render(<ApprovalDetailClient />);
    expect(screen.getByText('ui.accessDenied')).toBeInTheDocument();
  });

  it('allows superadmins through to the details', () => {
    mockUser = { id: 'u1', role: 'superadmin', organizationId: 'org1' };
    render(<ApprovalDetailClient />);
    expect(screen.queryByText('ui.accessDenied')).toBeNull();
    expect(screen.getByText('ui.userApprovalDetails')).toBeInTheDocument();
  });

  it('shows skeletons while the pending user is loading', () => {
    mockQueries.pendingUser = undefined;
    render(<ApprovalDetailClient />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('renders the user details with a fallback avatar initial', () => {
    render(<ApprovalDetailClient />);
    expect(screen.getByText('ui.userApprovalDetails')).toBeInTheDocument();
    expect(screen.getAllByText(/New Employee/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('new@test.com').length).toBeGreaterThan(0);
    // Avatar fallback uses the first character of the name.
    expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('N');
    // Role badge with the capitalized fallback label.
    expect(screen.getByText('Employee')).toBeInTheDocument();
    // Employee type badge: full_time → Full Time.
    expect(screen.getByText('Full Time')).toBeInTheDocument();
    expect(screen.getAllByText('+374-55-777').length).toBeGreaterThan(0);
    expect(screen.getByText('ui.pending')).toBeInTheDocument();
    expect(screen.getByText('full_time')).toBeInTheDocument();
    expect(screen.getByText('employee')).toBeInTheDocument();
  });

  it('renders the registered date with the English locale', () => {
    render(<ApprovalDetailClient />);
    const expected = format(new Date(PENDING_USER.createdAt), 'dd MMM yyyy HH:mm', {
      locale: enUS,
    });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('renders the registered date with the Russian locale', () => {
    mockLanguage = 'ru';
    render(<ApprovalDetailClient />);
    const expected = format(new Date(PENDING_USER.createdAt), 'dd MMM yyyy HH:mm', {
      locale: ru,
    });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('renders the registered date with the Armenian locale', () => {
    mockLanguage = 'hy';
    render(<ApprovalDetailClient />);
    const expected = format(new Date(PENDING_USER.createdAt), 'dd MMM yyyy HH:mm', {
      locale: hy,
    });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('omits phone rows when the phone is missing', () => {
    mockQueries.pendingUser = { ...PENDING_USER, phone: null };
    render(<ApprovalDetailClient />);
    expect(screen.queryByText('employeeInfo.phone')).toBeNull();
    expect(screen.queryByText(/\+374/)).toBeNull();
  });

  it('uses the employee color for an unknown role badge', () => {
    mockQueries.pendingUser = { ...PENDING_USER, role: 'weird_role' };
    render(<ApprovalDetailClient />);
    const badge = screen.getAllByTestId('badge').find((b) => b.textContent?.includes('Weird_role'));
    expect(badge).toBeDefined();
    expect(badge?.getAttribute('data-class')).toContain('bg-green-100');
  });

  it('renders the avatar image when an avatarUrl is present', () => {
    mockQueries.pendingUser = { ...PENDING_USER, avatarUrl: 'https://example.com/a.png' };
    render(<ApprovalDetailClient />);
    const img = screen.getByTestId('avatar-image');
    expect(img.getAttribute('src')).toBe('https://example.com/a.png');
  });

  it('navigates back to the approvals list via the back button', () => {
    render(<ApprovalDetailClient />);
    fireEvent.click(screen.getByTestId('icon-ArrowLeft').closest('button') as HTMLElement);
    expect(mockRouter.push).toHaveBeenCalledWith('/approvals');
  });

  it('approves from the header and redirects to the list', async () => {
    render(<ApprovalDetailClient />);
    const approveButtons = screen.getAllByText('ui.approve');
    fireEvent.click(approveButtons[0]);
    await waitFor(() =>
      expect(mockMutations.approveUser).toHaveBeenCalledWith({
        userId: 'pending-1',
        adminId: 'admin-1',
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('ui.userApproved');
    expect(mockRouter.push).toHaveBeenCalledWith('/approvals');
  });

  it('approves from the actions card and redirects', async () => {
    render(<ApprovalDetailClient />);
    const approveButtons = screen.getAllByText('ui.approve');
    fireEvent.click(approveButtons[1]);
    await waitFor(() => expect(mockMutations.approveUser).toHaveBeenCalled());
    expect(mockToast.success).toHaveBeenCalledWith('ui.userApproved');
  });

  it('shows the saving label while approving', async () => {
    let resolveApprove!: (v: unknown) => void;
    mockMutations.approveUser.mockImplementation(
      () => new Promise((resolve) => (resolveApprove = resolve)),
    );
    render(<ApprovalDetailClient />);
    fireEvent.click(screen.getAllByText('ui.approve')[0]);
    await waitFor(() => expect(screen.getAllByText('common.saving').length).toBeGreaterThan(0));
    expect(
      (screen.getAllByText('common.saving')[0].closest('button') as HTMLButtonElement).disabled,
    ).toBe(true);
    resolveApprove(undefined);
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/approvals'));
  });

  it('toasts an error when approval fails', async () => {
    mockMutations.approveUser.mockRejectedValue(new Error('boom'));
    render(<ApprovalDetailClient />);
    fireEvent.click(screen.getAllByText('ui.approve')[0]);
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('ui.failedToApproveUser'));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('rejects from the header and redirects', async () => {
    render(<ApprovalDetailClient />);
    fireEvent.click(screen.getAllByText('ui.reject')[0]);
    await waitFor(() =>
      expect(mockMutations.rejectUser).toHaveBeenCalledWith({
        userId: 'pending-1',
        adminId: 'admin-1',
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('ui.userRejected');
    expect(mockRouter.push).toHaveBeenCalledWith('/approvals');
  });

  it('toasts an error when rejection fails', async () => {
    mockMutations.rejectUser.mockRejectedValue(new Error('boom'));
    render(<ApprovalDetailClient />);
    fireEvent.click(screen.getAllByText('ui.reject')[1]);
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('ui.failedToRejectUser'));
  });

  it('does nothing when the current user is missing', async () => {
    mockQueries.currentUser = undefined;
    render(<ApprovalDetailClient />);
    fireEvent.click(screen.getAllByText('ui.approve')[0]);
    expect(mockMutations.approveUser).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByText('ui.reject')[0]);
    expect(mockMutations.rejectUser).not.toHaveBeenCalled();
  });
});
