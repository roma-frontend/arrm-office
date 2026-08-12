/**
 * Tests for LeaveDetailClient — the leave detail page:
 *
 *  - loading skeleton / not-found state
 *  - admin review of a pending request (approve / reject)
 *  - employee cancellation: the owner can only REQUEST cancellation (goes to
 *    the HR queue) — no delete button; non-owners get no action at all
 *  - HR decision on a cancel_requested leave: approve (delete) / reject
 *  - error toasts and the cancel-pending timeline hint
 *
 * Mocks: convex/react (useQuery/useMutation keyed by _name), generated api,
 * next/navigation (useParams/useRouter), @/store/useAuthStore, react-i18next
 * (returns keys), sonner, @/components/leaves/LeaveNotFound, UI primitives
 * (card/badge/button/skeleton), lucide-react.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: any) => (typeof fallback === 'string' ? fallback : key),
    i18n: { language: 'en' },
  }),
}));

// ── Router ───────────────────────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'leave_1' }),
  useRouter: () => ({ push: mockPush }),
}));

// ── Auth ─────────────────────────────────────────────────────────────────────
let mockUser: Record<string, any> | null = null;
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

// ── Convex ───────────────────────────────────────────────────────────────────
let queryResults: Record<string, unknown> = {};
const mutationCalls: Record<string, Array<{ args: any }>> = {};
const mutationImpl: Record<string, (...args: any[]) => Promise<unknown>> = {};

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation: (ref: { _name?: string }) => {
    const name = ref?._name ?? '';
    return async (...args: any[]) => {
      (mutationCalls[name] ??= []).push({ args });
      if (mutationImpl[name]) return mutationImpl[name](...args);
      return Promise.resolve();
    };
  },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    leaves: {
      getLeaveById: { _name: 'getLeaveById' },
      getReviewEligibility: { _name: 'getReviewEligibility' },
      approveLeave: { _name: 'approveLeave' },
      rejectLeave: { _name: 'rejectLeave' },
      deleteLeave: { _name: 'deleteLeave' },
      requestLeaveCancellation: { _name: 'requestLeaveCancellation' },
      rejectLeaveCancellation: { _name: 'rejectLeaveCancellation' },
    },
    users: {
      queries: { getUserById: { _name: 'getUserById' } },
    },
  },
}));

// ── UI primitives / helpers ──────────────────────────────────────────────────
jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: any) => <span data-testid="status-badge">{children}</span>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton">loading</div>,
}));

jest.mock('@/components/leaves/LeaveNotFound', () => () => (
  <div data-testid="leave-not-found">not found</div>
));

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock('lucide-react', () => {
  const names = [
    'ArrowLeft',
    'Calendar',
    'Clock',
    'User',
    'FileText',
    'CheckCircle',
    'XCircle',
    'Trash2',
    'Pencil',
  ];
  const mocks: Record<string, any> = {};
  for (const n of names) mocks[n] = (props: any) => <span data-testid={`icon-${n}`} {...props} />;
  return mocks;
});

// ── Component ────────────────────────────────────────────────────────────────
import LeaveDetailClient from '@/components/leaves/LeaveDetailClient';
import { toast } from 'sonner';

function leave(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    _id: 'leave_1',
    organizationId: 'org-1',
    userId: 'u-emp',
    userName: 'Anna Petrova',
    userDepartment: 'HR',
    type: 'paid',
    startDate: '2026-08-10',
    endDate: '2026-08-12',
    days: 3,
    reason: 'Family event',
    status: 'pending',
    isRead: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    _creationTime: 1_700_000_000_000,
    ...overrides,
  };
}

function admin() {
  return { _id: 'u-admin', name: 'Boss', role: 'admin', organizationId: 'org-1' };
}

function employee() {
  return { _id: 'u-emp', name: 'Anna Petrova', role: 'employee', organizationId: 'org-1' };
}

function supervisor() {
  return { _id: 'u-sup', name: 'Line Manager', role: 'supervisor', organizationId: 'org-1' };
}

/**
 * `seed` mirrors the server: the Approve/Reject buttons follow
 * `leaves.getReviewEligibility` (the reporting line + the head policy), not the
 * caller's role, so the eligibility verdict is seeded explicitly. The default
 * keeps the old expectation for the common cases — staff may review, employees
 * may not.
 */
function seed(
  leaveOverride: Record<string, any> = {},
  currentUser: any = admin(),
  eligibility?: { allowed: boolean; reason: string | null },
) {
  queryResults['getLeaveById'] = leave(leaveOverride);
  queryResults['getUserById'] = currentUser;
  queryResults['getReviewEligibility'] =
    eligibility ??
    (currentUser?.role === 'admin' || currentUser?.role === 'supervisor'
      ? { allowed: true, reason: null }
      : { allowed: false, reason: 'You do not have permission to review leave requests' });
}

function renderPage() {
  return render(<LeaveDetailClient />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'u-admin' };
  queryResults = {};
  for (const key of Object.keys(mutationCalls)) delete mutationCalls[key];
  for (const key of Object.keys(mutationImpl)) delete mutationImpl[key];
  mockPush.mockClear();
});

// ── Loading / not found ──────────────────────────────────────────────────────
describe('LeaveDetailClient — loading and not found', () => {
  it('shows skeletons while the leave is loading', () => {
    queryResults['getLeaveById'] = undefined;
    renderPage();
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('shows the not-found state when the leave is missing', () => {
    queryResults['getLeaveById'] = null;
    renderPage();
    expect(screen.getByTestId('leave-not-found')).toBeInTheDocument();
  });
});

// ── Admin review of a pending request ────────────────────────────────────────
describe('LeaveDetailClient — admin review', () => {
  it('renders the request details for an admin', () => {
    seed();
    renderPage();
    expect(screen.getByText('leave.requestDetails')).toBeInTheDocument();
    expect(screen.getByText('Anna Petrova')).toBeInTheDocument();
    expect(screen.getByText('leaveStatus.pending')).toBeInTheDocument();
  });

  it('approves a pending request and navigates back', async () => {
    seed();
    renderPage();
    fireEvent.click(screen.getByText('common.approve'));
    await waitFor(() => expect(mutationCalls['approveLeave']).toHaveLength(1));
    expect(mutationCalls['approveLeave'][0].args[0]).toEqual({
      leaveId: 'leave_1',
      reviewerId: 'u-admin',
    });
    expect(toast.success).toHaveBeenCalledWith('leave.approvedSuccess');
    expect(mockPush).toHaveBeenCalledWith('/leaves');
  });

  it('shows the approve error toast', async () => {
    mutationImpl['approveLeave'] = jest.fn().mockRejectedValue(new Error('approve boom'));
    seed();
    renderPage();
    fireEvent.click(screen.getByText('common.approve'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('leave.approveFailed'));
  });

  it('rejects a pending request', async () => {
    seed();
    renderPage();
    fireEvent.click(screen.getByText('common.reject'));
    await waitFor(() => expect(mutationCalls['rejectLeave']).toHaveLength(1));
    expect(toast.success).toHaveBeenCalledWith('leave.rejectedSuccess');
  });

  it('hides the approve/reject buttons from employees', () => {
    seed({}, employee());
    renderPage();
    expect(screen.queryByText('common.approve')).not.toBeInTheDocument();
    expect(screen.queryByText('common.reject')).not.toBeInTheDocument();
  });

  // The reporting line decides, so a supervisor who manages the requester gets
  // the buttons the old `role === 'admin'` gate denied them.
  it('shows the approve/reject buttons to the manager in the requester’s line', () => {
    mockUser = { id: 'u-sup' };
    seed({}, supervisor(), { allowed: true, reason: null });
    renderPage();
    expect(screen.getByText('common.approve')).toBeInTheDocument();
    expect(screen.getByText('common.reject')).toBeInTheDocument();
  });

  // An admin outside the decision (their own request, a request they filed for
  // someone else, or the head's auto-approved one) gets an explanation rather
  // than a button that the mutation would refuse.
  it('replaces the buttons with a hint when the server refuses the review', () => {
    seed({}, admin(), {
      allowed: false,
      reason: 'You cannot review your own leave request',
    });
    renderPage();
    expect(screen.queryByText('common.approve')).not.toBeInTheDocument();
    expect(screen.getByText('leave.reviewNotAllowedHint')).toBeInTheDocument();
  });

  it('shows no review hint to an employee looking at a colleague’s request', () => {
    mockUser = { id: 'u-other' };
    seed({}, { _id: 'u-other', name: 'Peer', role: 'employee', organizationId: 'org-1' });
    renderPage();
    expect(screen.queryByText('leave.reviewNotAllowedHint')).not.toBeInTheDocument();
  });
});

// ── Employee requests cancellation → goes to HR ──────────────────────────────
describe('LeaveDetailClient — employee cancellation request', () => {
  it('lets the owner request cancellation of an approved leave', async () => {
    seed({ status: 'approved' }, employee());
    renderPage();
    fireEvent.click(screen.getByText('leave.requestCancellation'));
    await waitFor(() => expect(mutationCalls['requestLeaveCancellation']).toHaveLength(1));
    expect(mutationCalls['requestLeaveCancellation'][0].args[0]).toEqual({ leaveId: 'leave_1' });
    expect(toast.success).toHaveBeenCalledWith('leave.cancelRequestedSuccess');
  });

  it('lets the owner request cancellation of a pending leave', async () => {
    seed({ status: 'pending' }, employee());
    renderPage();
    expect(screen.getByText('leave.requestCancellation')).toBeInTheDocument();
  });

  it('shows the request-cancellation error toast', async () => {
    mutationImpl['requestLeaveCancellation'] = jest.fn().mockRejectedValue(new Error('boom'));
    seed({ status: 'approved' }, employee());
    renderPage();
    fireEvent.click(screen.getByText('leave.requestCancellation'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('leave.cancelRequestFailed'));
  });

  it('hides the cancellation button for an employee viewing someone else’s leave', () => {
    seed({ userId: 'u-other' }, employee());
    renderPage();
    expect(screen.queryByText('leave.requestCancellation')).not.toBeInTheDocument();
  });

  it('gives employees no delete button — cancellation is decided by HR', () => {
    seed({ status: 'approved' }, employee());
    renderPage();
    expect(screen.queryByTestId('icon-Trash2')).not.toBeInTheDocument();
  });

  it('still shows the delete button to HR', () => {
    seed({ status: 'approved' }, admin());
    renderPage();
    expect(screen.getByTestId('icon-Trash2')).toBeInTheDocument();
  });

  it('shows the cancel-pending hint to the owner while HR decides', () => {
    seed({ status: 'cancel_requested', previousStatus: 'approved' }, employee());
    renderPage();
    expect(screen.getByText('leave.cancellationRequested')).toBeInTheDocument();
    expect(screen.getByText('leave.cancelPendingHint')).toBeInTheDocument();
    // No duplicate request button while it is already pending.
    expect(screen.queryByText('leave.requestCancellation')).not.toBeInTheDocument();
  });
});

// ── HR decides on a cancellation request ─────────────────────────────────────
describe('LeaveDetailClient — HR decides on a cancellation request', () => {
  it('approves the cancellation (deletes the leave) and navigates back', async () => {
    seed({ status: 'cancel_requested', previousStatus: 'approved' }, admin());
    renderPage();
    fireEvent.click(screen.getByText('leave.approveCancellation'));
    await waitFor(() => expect(mutationCalls['deleteLeave']).toHaveLength(1));
    expect(toast.success).toHaveBeenCalledWith('leave.cancelApprovedSuccess');
    expect(mockPush).toHaveBeenCalledWith('/leaves');
  });

  it('shows the approve-cancellation error toast', async () => {
    mutationImpl['deleteLeave'] = jest.fn().mockRejectedValue(new Error('boom'));
    seed({ status: 'cancel_requested', previousStatus: 'approved' }, admin());
    renderPage();
    fireEvent.click(screen.getByText('leave.approveCancellation'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('leave.cancelApproveFailed'));
  });

  it('rejects the cancellation request and keeps the leave', async () => {
    seed({ status: 'cancel_requested', previousStatus: 'approved' }, admin());
    renderPage();
    fireEvent.click(screen.getByText('leave.rejectCancellation'));
    await waitFor(() => expect(mutationCalls['rejectLeaveCancellation']).toHaveLength(1));
    expect(mutationCalls['rejectLeaveCancellation'][0].args[0]).toEqual({ leaveId: 'leave_1' });
    expect(toast.success).toHaveBeenCalledWith('leave.cancelRejectedSuccess');
  });

  it('shows the reject-cancellation error toast', async () => {
    mutationImpl['rejectLeaveCancellation'] = jest.fn().mockRejectedValue(new Error('boom'));
    seed({ status: 'cancel_requested', previousStatus: 'approved' }, admin());
    renderPage();
    fireEvent.click(screen.getByText('leave.rejectCancellation'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('leave.cancelRejectFailed'));
  });

  it('hides the HR decision buttons from the employee owner', () => {
    seed({ status: 'cancel_requested', previousStatus: 'approved' }, employee());
    renderPage();
    expect(screen.queryByText('leave.approveCancellation')).not.toBeInTheDocument();
    expect(screen.queryByText('leave.rejectCancellation')).not.toBeInTheDocument();
  });
});
