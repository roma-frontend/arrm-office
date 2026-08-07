/**
 * Tests for AdminJoinRequestsClient — join request approval/rejection UI.
 *
 * Mocks: convex/react (query results + mutations), auth store, selected org,
 * toast, UI primitives.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

let queryResults: Record<string, unknown> = {};
const mutationCalls: Array<{ name?: string; args: any[] }> = [];
jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation:
    (ref: { _name?: string }) =>
    (...args: any[]) => {
      mutationCalls.push({ name: ref?._name, args });
      return Promise.resolve();
    },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    organizationJoinRequests: {
      getOrgJoinRequests: { _name: 'getOrgJoinRequests' },
      approveJoinRequest: { _name: 'approveJoinRequest' },
      rejectJoinRequest: { _name: 'rejectJoinRequest' },
    },
  },
}));

let mockUser: any = { id: 'user-1', organizationId: 'org-1' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => 'org-1',
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: any) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: any) => <div data-testid="card-title">{children}</div>,
  CardDescription: ({ children }: any) => <div data-testid="card-desc">{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, size, ...props }: any) => (
    <button onClick={onClick} data-variant={variant} {...props}>
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

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: any) => <div data-testid="avatar">{children}</div>,
  AvatarImage: () => <img alt="" />,
  AvatarFallback: ({ children }: any) => <span data-testid="avatar-fallback">{children}</span>,
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return { Clock: Icon, CheckCircle2: Icon, XCircle: Icon, Users: Icon, AlertCircle: Icon };
});

import AdminJoinRequestsClient from '@/components/admin/AdminJoinRequestsClient';
import { toast } from 'sonner';

const REQUESTS = [
  {
    _id: 'r-1',
    requesterName: 'Anna Petrova',
    requesterEmail: 'anna@example.com',
    requesterAvatar: null,
    status: 'pending',
    requestedAt: '2026-01-10T10:00:00Z',
  },
  {
    _id: 'r-2',
    requesterName: 'Bob Smith',
    requesterEmail: 'bob@example.com',
    status: 'approved',
    requestedAt: '2026-01-05T10:00:00Z',
    reviewedAt: '2026-01-06T10:00:00Z',
  },
  {
    _id: 'r-3',
    requesterName: 'Carol',
    requesterEmail: 'carol@example.com',
    status: 'rejected',
    requestedAt: '2026-01-03T10:00:00Z',
    reviewedAt: '2026-01-04T10:00:00Z',
    rejectionReason: 'Duplicate account',
  },
];

describe('AdminJoinRequestsClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mutationCalls.length = 0;
    mockUser = { id: 'user-1', organizationId: 'org-1' };
    queryResults = { getOrgJoinRequests: REQUESTS };
  });

  it('shows a loader while requests are loading', () => {
    queryResults = {};
    const { container } = render(<AdminJoinRequestsClient />);
    expect(container.querySelector('[data-testid="shield-loader"]')).toBeInTheDocument();
  });

  it('renders the page title and description', () => {
    render(<AdminJoinRequestsClient />);
    expect(screen.getByText('Join Requests')).toBeInTheDocument();
    expect(screen.getByText('Review and approve join requests from new users')).toBeInTheDocument();
  });

  it('shows stat counts by status', () => {
    render(<AdminJoinRequestsClient />);
    // One pending, one approved, one rejected → three '1' counters
    expect(screen.getAllByText('1')).toHaveLength(3);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('renders each request with its requester name', () => {
    render(<AdminJoinRequestsClient />);
    expect(screen.getByText('Anna Petrova')).toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
  });

  it('shows an empty state when there are no requests', () => {
    queryResults = { getOrgJoinRequests: [] };
    render(<AdminJoinRequestsClient />);
    expect(screen.getByText('No join requests yet')).toBeInTheDocument();
  });

  it('approves a pending request via the approve button', async () => {
    render(<AdminJoinRequestsClient />);
    fireEvent.click(screen.getByText('Approve'));
    await Promise.resolve();
    expect(mutationCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'approveJoinRequest',
          args: [{ inviteId: 'r-1', reviewerId: 'user-1' }],
        }),
      ]),
    );
    expect(toast.success).toHaveBeenCalledWith('Request approved');
  });

  it('shows rejection reason input after clicking reject', () => {
    render(<AdminJoinRequestsClient />);
    fireEvent.click(screen.getByText('Reject'));
    expect(screen.getByPlaceholderText('Reason for rejection...')).toBeInTheDocument();
  });

  it('rejects without a reason via toast error', async () => {
    render(<AdminJoinRequestsClient />);
    fireEvent.click(screen.getByText('Reject'));
    fireEvent.click(screen.getByText('Confirm Reject'));
    await Promise.resolve();
    expect(toast.error).toHaveBeenCalledWith('Please enter a reason');
    expect(mutationCalls.filter((c) => c.name === 'rejectJoinRequest').length).toBe(0);
  });

  it('rejects with a reason via the mutation', async () => {
    render(<AdminJoinRequestsClient />);
    fireEvent.click(screen.getByText('Reject'));
    fireEvent.change(screen.getByPlaceholderText('Reason for rejection...'), {
      target: { value: 'Not eligible' },
    });
    fireEvent.click(screen.getByText('Confirm Reject'));
    await Promise.resolve();
    expect(mutationCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'rejectJoinRequest',
          args: [{ inviteId: 'r-1', reviewerId: 'user-1', reason: 'Not eligible' }],
        }),
      ]),
    );
  });

  it('shows approved date for approved requests', () => {
    render(<AdminJoinRequestsClient />);
    expect(screen.getByText(/Approved on/)).toBeInTheDocument();
  });

  it('shows the rejection reason for rejected requests', () => {
    render(<AdminJoinRequestsClient />);
    expect(screen.getByText('Duplicate account')).toBeInTheDocument();
  });

  it('does nothing on approve without a user', async () => {
    mockUser = null;
    render(<AdminJoinRequestsClient />);
    fireEvent.click(screen.getByText('Approve'));
    await Promise.resolve();
    expect(mutationCalls.length).toBe(0);
  });
});
