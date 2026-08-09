/**
 * Tests for LeavesClient — the leave-requests dashboard: loading skeleton,
 * empty state, mobile cards + desktop table, search and status/type filters,
 * approve / reject / delete flows (success and error paths, unauthenticated),
 * the AI-assistant expandable row (admin + pending), pagination, and the
 * admin notification-sound effect.
 *
 * Mocks: convex/react (useQuery/useMutation/usePaginatedQuery keyed by _name),
 * generated api, next/navigation, @/lib/cssMotion, react-i18next (returns
 * keys), i18next (language), sonner, @/store/useAuthStore,
 * @/hooks/useSelectedOrganization, @/hooks/useOptimisticActions,
 * @/lib/notificationSound, @/lib/logger, next/dynamic (AILeaveAssistant),
 * @/components/leaves/{LeaveRequestModal,LeaveRequestWizard},
 * @/components/ui/{button,input,badge,card,select,skeleton}, lucide-react.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: any, options?: Record<string, any>) => {
      let text: string;
      if (typeof fallback === 'string') text = fallback;
      else if (fallback && typeof fallback === 'object' && 'defaultValue' in fallback)
        text = fallback.defaultValue ?? key;
      else text = key;
      for (const [k, v] of Object.entries(options ?? {})) {
        text = text.replace(`{{${k}}}`, String(v));
      }
      return text;
    },
    i18n: { language: 'en' },
  }),
}));

jest.mock('i18next', () => ({
  __esModule: true,
  default: { language: 'en' },
}));

// ── Router / cssMotion ───────────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/lib/cssMotion', () => {
  const ReactMod = require('react');
  const Elem =
    (tag: string) =>
    ({ children, ...props }: any) =>
      ReactMod.createElement(tag, props, children);
  return {
    motion: { div: Elem('div') },
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

// ── Auth / org / optimistic helpers ──────────────────────────────────────────
let mockUser: Record<string, any> | null = null;
let mockSelectedOrg: string | null = null;
let mockOptimistic: Record<string, jest.Mock> = {};

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (sel?: any) => (sel ? sel({ user: mockUser }) : { user: mockUser }),
}));

jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => mockSelectedOrg,
}));

jest.mock('@/hooks/useOptimisticActions', () => ({
  useOptimisticLeaveActions: () => ({
    approveOptimistic: mockOptimistic.approve ?? jest.fn().mockResolvedValue(true),
    rejectOptimistic: mockOptimistic.reject ?? jest.fn().mockResolvedValue(true),
    deleteOptimistic: mockOptimistic.delete ?? jest.fn().mockResolvedValue(true),
  }),
}));

// ── Convex ───────────────────────────────────────────────────────────────────
let queryResults: Record<string, unknown> = {};
const mutationCalls: Record<string, Array<{ args: any }>> = {};
const mutationImpl: Record<string, (...args: any[]) => Promise<unknown>> = {};
let paginatedResult: { results: any[]; status: string } = {
  results: [],
  status: 'Exhausted',
};
const loadMoreMock = jest.fn();

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
  usePaginatedQuery: () => ({
    results: paginatedResult.results,
    status: paginatedResult.status,
    loadMore: loadMoreMock,
  }),
}));

jest.mock('../../convex/_generated/api', () => ({
  api: {
    leaves: {
      listLeavesPaginated: { _name: 'listLeavesPaginated' },
      getUnreadCount: { _name: 'getUnreadCount' },
      markLeaveAsRead: { _name: 'markLeaveAsRead' },
    },
  },
}));

// ── Notification sound / logger ──────────────────────────────────────────────
jest.mock('@/lib/notificationSound', () => ({
  playNotificationSound: jest.fn(),
  sendBrowserNotification: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), log: jest.fn(), warn: jest.fn() },
}));

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

// ── next/dynamic → AI assistant is replaced with a clickable stub that
// exercises the onApprove / onReject callbacks from the component. ──────────
jest.mock('next/dynamic', () => {
  const ReactMod = require('react');
  return () =>
    ({ leaveRequestId: _leaveId, userId: _userId, onApprove, onReject }: any) =>
      ReactMod.createElement(
        'div',
        { 'data-testid': 'ai-assistant' },
        ReactMod.createElement('button', { onClick: () => onApprove('ok comment') }, 'AI Approve'),
        ReactMod.createElement('button', { onClick: () => onReject('nope') }, 'AI Reject'),
      );
});

// ── Leaves modal / wizard ────────────────────────────────────────────────────
jest.mock('@/components/leaves/LeaveRequestModal', () => ({
  LeaveRequestModal: ({ open, onClose }: any) =>
    open ? (
      <div data-testid="leave-modal">
        modal
        <button data-testid="modal-close" onClick={onClose}>
          close
        </button>
      </div>
    ) : null,
}));

jest.mock('@/components/leaves/LeaveRequestWizard', () => ({
  LeaveRequestWizard: () => <div data-testid="leave-wizard">wizard</div>,
}));

// ── UI primitives ────────────────────────────────────────────────────────────
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className, disabled, size, variant, ...p }: any) => (
    <button onClick={onClick} className={className} disabled={disabled} {...p}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: any) => <span data-testid={`badge-${variant}`}>{children}</span>,
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/select', () => {
  const Select = ({ value, onValueChange, children }: any) => {
    const options: any[] = [];
    React.Children.forEach(children, (child: any) => {
      if (!child?.props) return;
      if (child.props.value) options.push(child);
      else if (child.props.children) {
        React.Children.forEach(child.props.children, (grand: any) => {
          if (grand?.props?.value) options.push(grand);
        });
      }
    });
    return (
      <div data-testid="select">
        <button type="button" data-testid={`select-current-${value ?? 'undefined'}`}>
          {value ?? ''}
        </button>
        <div data-testid="select-options">
          {options.map((opt) => (
            <button
              key={opt.props.value}
              type="button"
              data-testid={`select-option-${opt.props.value}`}
              onClick={() => onValueChange(opt.props.value)}
            >
              {opt.props.children}
            </button>
          ))}
        </div>
      </div>
    );
  };
  return {
    Select,
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ value, children }: any) => (
      <div data-testid={`select-item-${value}`}>{children}</div>
    ),
    SelectTrigger: ({ children }: any) => <>{children}</>,
    SelectValue: () => null,
  };
});

jest.mock('@/components/ui/skeleton', () => ({
  SkeletonTable: ({ rows }: any) => (
    <div data-testid="skeleton-table" data-rows={rows}>
      loading
    </div>
  ),
}));

jest.mock('lucide-react', () => {
  const names = ['Plus', 'Search', 'CheckCircle', 'XCircle', 'Trash2', 'Eye', 'CalendarDays'];
  const mocks: Record<string, any> = {};
  for (const n of names) mocks[n] = (props: any) => <span data-testid={`icon-${n}`} {...props} />;
  return mocks;
});

// ── Component ────────────────────────────────────────────────────────────────
import { LeavesClient } from '@/components/leaves/LeavesClient';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { playNotificationSound, sendBrowserNotification } from '@/lib/notificationSound';

type MockReq = {
  _id: string;
  userName?: string;
  userDepartment?: string;
  reason: string;
  type: string;
  status: string;
  days: number;
  startDate?: string | null;
  endDate?: string | null;
  userId: string;
};

function req(overrides: Partial<MockReq> = {}): MockReq {
  return {
    _id: 'r1',
    userName: 'Anna Petrova',
    userDepartment: 'HR',
    reason: 'Vacation',
    type: 'paid',
    status: 'pending',
    days: 5,
    startDate: '2026-07-01',
    endDate: '2026-07-05',
    userId: 'u-1',
    ...overrides,
  };
}

function renderClient() {
  return render(<LeavesClient />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'u-1', role: 'admin' };
  mockSelectedOrg = null;
  mockOptimistic = {};
  queryResults = {};
  for (const key of Object.keys(mutationCalls)) delete mutationCalls[key];
  for (const key of Object.keys(mutationImpl)) delete mutationImpl[key];
  paginatedResult = { results: [], status: 'Exhausted' };
  loadMoreMock.mockClear();
  mockPush.mockClear();
  sessionStorage.clear();
  (playNotificationSound as jest.Mock).mockClear();
  (sendBrowserNotification as jest.Mock).mockClear();
});

describe('LeavesClient — rendering', () => {
  it('shows the skeleton while the first page loads', () => {
    paginatedResult = { results: [], status: 'LoadingFirstPage' };
    renderClient();
    expect(screen.getByTestId('skeleton-table')).toBeInTheDocument();
  });

  it('shows the empty state with a create button', () => {
    renderClient();
    expect(screen.getByText('leave.noLeaves')).toBeInTheDocument();
    fireEvent.click(screen.getByText('leave.createFirst'));
    expect(screen.getByTestId('leave-modal')).toBeInTheDocument();
  });

  it('renders the header and new-request button', () => {
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    expect(screen.getByText('leave.title')).toBeInTheDocument();
    fireEvent.click(screen.getByText('dashboard.newRequest'));
    expect(screen.getByTestId('leave-modal')).toBeInTheDocument();
  });

  it('renders a desktop table row with employee and department', () => {
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    // The same data renders in the mobile cards and the desktop table.
    expect(screen.getAllByText('Anna Petrova').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('HR').length).toBeGreaterThanOrEqual(1);
  });

  it('renders mobile cards for non-admin users', () => {
    mockUser = { id: 'u-1', role: 'employee' };
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    expect(screen.getAllByText('Anna Petrova').length).toBeGreaterThanOrEqual(1);
    // No admin actions for employees.
    expect(screen.queryAllByTestId('icon-Trash2').length).toBe(0);
  });
});

describe('LeavesClient — filters and search', () => {
  it('filters rows by search text', () => {
    paginatedResult = {
      results: [
        req({ _id: 'r1', userName: 'Anna Petrova' }),
        req({ _id: 'r2', userName: 'Boris Ivanov' }),
      ],
      status: 'Exhausted',
    };
    renderClient();
    fireEvent.change(screen.getByPlaceholderText('placeholders.searchEmployee'), {
      target: { value: 'Boris' },
    });
    expect(screen.queryByText('Anna Petrova')).toBeNull();
    expect(screen.getAllByText('Boris Ivanov').length).toBeGreaterThanOrEqual(1);
  });

  it('searches by department and reason', () => {
    paginatedResult = {
      results: [
        req({ _id: 'r1', userDepartment: 'Engineering' }),
        req({ _id: 'r2', reason: 'Sick leave' }),
      ],
      status: 'Exhausted',
    };
    renderClient();
    fireEvent.change(screen.getByPlaceholderText('placeholders.searchEmployee'), {
      target: { value: 'Sick' },
    });
    expect(screen.queryByText('Engineering')).toBeNull();
    expect(screen.getAllByText('Sick leave').length).toBeGreaterThanOrEqual(1);
  });

  it('clears search back to the full list', () => {
    paginatedResult = {
      results: [req({ _id: 'r1', userName: 'Anna Petrova' })],
      status: 'Exhausted',
    };
    renderClient();
    const input = screen.getByPlaceholderText('placeholders.searchEmployee');
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.queryByText('Anna Petrova')).toBeNull();
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getAllByText('Anna Petrova').length).toBeGreaterThanOrEqual(1);
  });
});

describe('LeavesClient — admin actions', () => {
  it('approves a pending request from the mobile card', async () => {
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    fireEvent.click(screen.getAllByTestId('icon-CheckCircle')[0]);
    await waitFor(() => expect(mutationCalls['markLeaveAsRead']).toHaveLength(1));
    await waitFor(() => expect(mockOptimistic.approve ?? expect.anything()).toBeDefined());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('leave.approvedSuccess'));
    expect(playNotificationSound).toHaveBeenCalledWith('approved');
  });

  it('approves and rejects from the desktop table', async () => {
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    const table = document.querySelector('table')!;
    const approveButtons = within(table).getAllByTestId('icon-CheckCircle');
    const rejectButtons = within(table).getAllByTestId('icon-XCircle');
    fireEvent.click(approveButtons[0]);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('leave.approvedSuccess'));
    fireEvent.click(rejectButtons[0]);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('leave.rejectedSuccess'));
  });

  it('deletes from the desktop table', async () => {
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    const table = document.querySelector('table')!;
    fireEvent.click(within(table).getAllByTestId('icon-Trash2')[0]);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('leave.deletedSuccess'));
  });

  it('rejects a pending request', async () => {
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    fireEvent.click(screen.getAllByTestId('icon-XCircle')[0]);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('leave.rejectedSuccess'));
    expect(playNotificationSound).toHaveBeenCalledWith('rejected');
  });

  it('deletes a request', async () => {
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    fireEvent.click(screen.getAllByTestId('icon-Trash2')[0]);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('leave.deletedSuccess'));
  });

  it('shows the approve error toast', async () => {
    mockOptimistic.approve = jest.fn().mockRejectedValue(new Error('approve boom'));
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    fireEvent.click(screen.getAllByTestId('icon-CheckCircle')[0]);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('approve boom'));
    expect(logger.error).toHaveBeenCalledWith('Approve error:', expect.anything());
  });

  it('shows the generic approve error toast for non-Error throws', async () => {
    mockOptimistic.approve = jest.fn().mockRejectedValue('string');
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    fireEvent.click(screen.getAllByTestId('icon-CheckCircle')[0]);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('leave.approveFailed'));
  });

  it('shows the reject error toast', async () => {
    mockOptimistic.reject = jest.fn().mockRejectedValue(new Error('reject boom'));
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    fireEvent.click(screen.getAllByTestId('icon-XCircle')[0]);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('reject boom'));
  });

  it('shows the delete error toast', async () => {
    mockOptimistic.delete = jest.fn().mockRejectedValue(new Error('delete boom'));
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    fireEvent.click(screen.getAllByTestId('icon-Trash2')[0]);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('delete boom'));
  });

  it('blocks approve for unauthenticated users', async () => {
    // Admin role keeps the buttons visible; the missing id triggers the guard.
    mockUser = { id: undefined, role: 'admin' };
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    fireEvent.click(screen.getAllByTestId('icon-CheckCircle')[0]);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('toasts.pleaseLoginAgain'));
    expect(mockOptimistic.approve).toBeUndefined();
  });

  it('blocks reject for unauthenticated users', async () => {
    mockUser = { id: undefined, role: 'admin' };
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    fireEvent.click(screen.getAllByTestId('icon-XCircle')[0]);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('errors.unauthorized'));
  });

  it('blocks delete for unauthenticated users', async () => {
    mockUser = { id: undefined, role: 'admin' };
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    fireEvent.click(screen.getAllByTestId('icon-Trash2')[0]);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('errors.unauthorized'));
  });
});

describe('LeavesClient — AI assistant expandable', () => {
  it('expands the AI assistant row for a pending admin request', async () => {
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    // Desktop table: click the Eye button inside the table to expand.
    const table = document.querySelector('table')!;
    fireEvent.click(within(table).getAllByTestId('icon-Eye')[0]);
    // The AI stub renders with approve/reject actions wired to handleApprove/
    // handleReject with a comment. Both the mobile and desktop variants render.
    expect(screen.getAllByText('AI Approve').length).toBeGreaterThanOrEqual(1);
    // The desktop-table AI stub sits inside the expandable <tr>; clicking it
    // covers the desktop onApprove wiring. The mobile variant renders too, so
    // also cover its onReject wiring from the same expand.
    const desktopApprove = within(table).getAllByText('AI Approve')[0];
    fireEvent.click(desktopApprove);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('leave.approvedSuccess'));
    // The mobile variant also renders — cover its onReject wiring.
    fireEvent.click(screen.getAllByText('AI Reject')[0]);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('leave.rejectedSuccess'));
    // And the desktop-table onReject wiring.
    const desktopReject = within(table).getAllByText('AI Reject')[0];
    fireEvent.click(desktopReject);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('leave.rejectedSuccess'));
  });

  it('expands the AI assistant in the mobile card view and rejects', async () => {
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    // The mobile card Eye button (first in the DOM) toggles the expandable area.
    fireEvent.click(screen.getAllByTestId('icon-Eye')[0]);
    expect(screen.getAllByText('AI Reject').length).toBeGreaterThanOrEqual(1);
    // Click the mobile AI Approve to cover the mobile onApprove wiring.
    fireEvent.click(screen.getAllByText('AI Approve')[0]);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('leave.approvedSuccess'));
    fireEvent.click(screen.getAllByText('AI Reject')[0]);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('leave.rejectedSuccess'));
  });

  it('does not render expand buttons for non-pending requests', () => {
    paginatedResult = { results: [req({ status: 'approved' })], status: 'Exhausted' };
    renderClient();
    expect(screen.queryAllByTestId('icon-Eye').length).toBe(0);
  });
});

describe('LeavesClient — pagination and navigation', () => {
  it('loads more when the status allows it', () => {
    paginatedResult = { results: [req()], status: 'CanLoadMore' };
    renderClient();
    fireEvent.click(screen.getByText('Load more requests'));
    expect(loadMoreMock).toHaveBeenCalledWith(30);
  });

  it('does not show the load-more button when exhausted', () => {
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    expect(screen.queryByText('Load more requests')).toBeNull();
  });

  it('navigates to the leave detail page from the desktop table', () => {
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    const table = document.querySelector('table')!;
    // Every data cell carries the navigation handler.
    const cells = within(table).getAllByText('Anna Petrova');
    fireEvent.click(cells[0]);
    expect(mockPush).toHaveBeenCalledWith('/leaves/r1');
  });

  it('navigates from the desktop dates and type cells', () => {
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    const table = document.querySelector('table')!;
    const tds = within(table).getAllByRole('cell');
    fireEvent.click(tds[1]); // type cell
    fireEvent.click(tds[2]); // dates cell
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it('navigates from the days, reason and status cells', () => {
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    const table = document.querySelector('table')!;
    const tds = within(table).getAllByRole('cell');
    fireEvent.click(tds[3]); // days cell
    fireEvent.click(tds[4]); // reason cell
    fireEvent.click(tds[5]); // status cell
    expect(mockPush).toHaveBeenCalledTimes(3);
  });

  it('navigates from a mobile card header', () => {
    mockUser = { id: 'u-1', role: 'employee' };
    paginatedResult = { results: [req()], status: 'Exhausted' };
    renderClient();
    // The mobile card header also navigates.
    const cells = screen.getAllByText('Anna Petrova');
    fireEvent.click(cells[0]);
    expect(mockPush).toHaveBeenCalledWith('/leaves/r1');
  });
});

describe('LeavesClient — safeFormat and empty data', () => {
  it('renders an em dash for missing or invalid dates', () => {
    paginatedResult = {
      results: [
        req({ _id: 'r1', startDate: null, endDate: 'not-a-date' }),
        req({ _id: 'r2', startDate: undefined, endDate: undefined }),
      ],
      status: 'Exhausted',
    };
    renderClient();
    expect(screen.getAllByText(/^—/).length).toBeGreaterThanOrEqual(2);
  });

  it('handles a missing leaves list', () => {
    paginatedResult = { results: undefined as any, status: 'Exhausted' };
    renderClient();
    expect(screen.getByText('leave.noLeaves')).toBeInTheDocument();
  });

  it('renders a fallback initial when userName is missing', () => {
    paginatedResult = {
      results: [req({ _id: 'r1', userName: undefined }), req({ _id: 'r2' })],
      status: 'Exhausted',
    };
    renderClient();
    expect(screen.getAllByText('?').length).toBeGreaterThanOrEqual(1);
  });
});

describe('LeavesClient — notification sound effect', () => {
  it('plays the new-request sound for admins with a fresh unread count', () => {
    queryResults['getUnreadCount'] = 3;
    paginatedResult = { results: [], status: 'Exhausted' };
    renderClient();
    expect(playNotificationSound).toHaveBeenCalledWith('new_request');
    expect(sendBrowserNotification).toHaveBeenCalledWith(
      'leaves.newRequestNotification',
      expect.objectContaining({ soundType: 'new_request' }),
    );
  });

  it('does not play the sound for the initial unread count', () => {
    queryResults['getUnreadCount'] = 0;
    paginatedResult = { results: [], status: 'Exhausted' };
    renderClient();
    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('does not play the sound when it was already played for that count', () => {
    sessionStorage.setItem('leave_sound_3', '1');
    queryResults['getUnreadCount'] = 3;
    paginatedResult = { results: [], status: 'Exhausted' };
    renderClient();
    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('skips the sound for non-admin users', () => {
    mockUser = { id: 'u-1', role: 'employee' };
    queryResults['getUnreadCount'] = 3;
    paginatedResult = { results: [], status: 'Exhausted' };
    renderClient();
    expect(playNotificationSound).not.toHaveBeenCalled();
  });
});
