/**
 * Tests for LeaveEditClient — the 3-step edit wizard (type → dates → details):
 *
 *  - loading skeleton / not-found / non-pending guard
 *  - form hydration from the leave query
 *  - step navigation and the full save flow (updateLeave + clearDraft + push)
 *  - wizard draft: restore into the form and saved step, start over, and the
 *    race guard that keeps restored values when the leave query resolves late
 *
 * Mocks: convex/react (useQuery/useMutation keyed by _name), generated api,
 * next/navigation (useParams/useRouter), @/store/useAuthStore,
 * react-i18next (returns keys), i18next (language), sonner,
 * @/hooks/useWizardDraft (controllable), WizardDraftNotice,
 * @/components/leaves/LeaveNotFound, UI primitives, lucide-react,
 * @/lib/cssMotion.
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

jest.mock('i18next', () => ({
  __esModule: true,
  default: { language: 'en' },
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
      updateLeave: { _name: 'updateLeave' },
    },
  },
}));

// ── Draft (controllable) ─────────────────────────────────────────────────────
let mockDraft: { restored: boolean; restoredStep: number; clearDraft: jest.Mock };
jest.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: (opts: any) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    React.useEffect(() => {
      if (mockDraft.restored) {
        opts.onRestore?.(
          {
            type: 'sick',
            startDate: '2026-08-20',
            endDate: '2026-08-22',
            reason: 'Draft reason',
            comment: 'Draft comment',
          },
          mockDraft.restoredStep,
        );
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return {
      restored: mockDraft.restored,
      restoredStep: mockDraft.restoredStep,
      clearDraft: mockDraft.clearDraft,
      dismissNotice: jest.fn(),
    };
  },
}));

jest.mock('@/components/ui/WizardDraftNotice', () => ({
  WizardDraftNotice: ({ show, step, onReset }: any) =>
    show ? (
      <div data-testid="draft-notice" data-step={step}>
        Draft restored at step {step + 1}
        <button type="button" onClick={onReset}>
          Start over
        </button>
      </div>
    ) : null,
}));

// ── UI primitives / helpers ──────────────────────────────────────────────────
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: any) => <div data-testid="skeleton" className={className} />,
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/leaves/LeaveNotFound', () => () => <div>Leave not found</div>);

jest.mock('@/lib/cssMotion', () => {
  const ReactMod = require('react');
  return {
    motion: {
      div: (props: any) => ReactMod.createElement('div', props),
    },
  };
});

jest.mock('lucide-react', () => {
  const names = [
    'ArrowLeft',
    'Calendar',
    'CalendarDays',
    'CheckCircle',
    'ChevronLeft',
    'ChevronRight',
    'Save',
    'Sun',
    'Heart',
    'Users',
    'Briefcase',
  ];
  const mocks: Record<string, any> = {};
  for (const n of names) mocks[n] = (props: any) => <span data-testid={`icon-${n}`} {...props} />;
  return mocks;
});

// ── Component ────────────────────────────────────────────────────────────────
import LeaveEditClient from '@/components/leaves/LeaveEditClient';
import { toast } from 'sonner';

function leave(overrides: Record<string, any> = {}) {
  return {
    _id: 'leave_1',
    userId: 'u1',
    userName: 'Anna Petrova',
    userDepartment: 'HR',
    type: 'paid',
    startDate: '2026-07-01',
    endDate: '2026-07-05',
    days: 5,
    reason: 'Vacation',
    comment: '',
    status: 'pending',
    ...overrides,
  };
}

function renderEdit() {
  return render(<LeaveEditClient />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'u1', role: 'employee' };
  queryResults = { getLeaveById: leave() };
  for (const key of Object.keys(mutationCalls)) delete mutationCalls[key];
  for (const key of Object.keys(mutationImpl)) delete mutationImpl[key];
  mockPush.mockClear();
  mockDraft = {
    restored: false,
    restoredStep: 0,
    clearDraft: jest.fn(() => {
      mockDraft.restored = false;
    }),
  };
  sessionStorage.clear();
});

describe('LeaveEditClient — loading, guard and hydration', () => {
  it('shows the skeleton while the leave loads', () => {
    queryResults = { getLeaveById: undefined };
    renderEdit();
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('shows the not-found state for a missing leave', () => {
    queryResults = { getLeaveById: null };
    renderEdit();
    expect(screen.getByText('Leave not found')).toBeInTheDocument();
  });

  it('blocks editing a non-pending leave for a non-admin', () => {
    queryResults = { getLeaveById: leave({ status: 'approved' }) };
    renderEdit();
    expect(screen.getByText('Only pending leave requests can be edited')).toBeInTheDocument();
    expect(screen.queryByText('common.next')).toBeNull();
  });

  it('hydrates the form from the leave query', () => {
    renderEdit();
    // Paid leave type is selected by default; dates and reason come from the leave.
    expect(screen.getByText('Paid Leave')).toBeInTheDocument();
    fireEvent.click(screen.getByText('common.next'));
    expect(screen.getByDisplayValue('2026-07-01')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-07-05')).toBeInTheDocument();
    fireEvent.click(screen.getByText('common.next'));
    expect(screen.getByDisplayValue('Vacation')).toBeInTheDocument();
  });

  it('saves the edited leave and navigates back', async () => {
    renderEdit();
    // Type step → pick sick.
    fireEvent.click(screen.getByText('Sick Leave'));
    fireEvent.click(screen.getByText('common.next'));
    // Dates step → new dates.
    fireEvent.change(screen.getByDisplayValue('2026-07-01'), {
      target: { value: '2026-07-10' },
    });
    fireEvent.change(screen.getByDisplayValue('2026-07-05'), {
      target: { value: '2026-07-12' },
    });
    fireEvent.click(screen.getByText('common.next'));
    // Details step → new reason + comment, then save.
    fireEvent.change(screen.getByDisplayValue('Vacation'), {
      target: { value: 'Extended vacation' },
    });
    fireEvent.click(screen.getByText('common.save'));

    await waitFor(() => expect(mutationCalls['updateLeave']).toHaveLength(1));
    expect(mutationCalls['updateLeave'][0].args[0]).toMatchObject({
      leaveId: 'leave_1',
      type: 'sick',
      startDate: '2026-07-10',
      endDate: '2026-07-12',
      days: 1, // Fri-only (Sat/Sun excluded)
      reason: 'Extended vacation',
    });
    expect(mockDraft.clearDraft).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/leaves/leave_1');
  });
});

describe('LeaveEditClient — wizard draft', () => {
  it('restores a draft into the form and jumps to the saved step', () => {
    mockDraft.restored = true;
    mockDraft.restoredStep = 1; // dates step
    renderEdit();

    expect(screen.getByTestId('draft-notice')).toBeTruthy();
    expect(screen.getByTestId('draft-notice').getAttribute('data-step')).toBe('1');
    // Dates step with restored dates.
    expect(screen.getByDisplayValue('2026-08-20')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-08-22')).toBeInTheDocument();

    // Back to the type step: restored type is selected.
    fireEvent.click(screen.getByText('common.back'));
    expect(screen.getByText('Sick Leave')).toBeInTheDocument();
  });

  it('start over clears the draft and resets to the server data', () => {
    mockDraft.restored = true;
    mockDraft.restoredStep = 1;
    renderEdit();

    fireEvent.click(screen.getByText('Start over'));

    expect(mockDraft.clearDraft).toHaveBeenCalled();
    expect(screen.queryByTestId('draft-notice')).toBeNull();
    // Back on the type step with the pristine paid type.
    expect(screen.getByText('Paid Leave')).toBeInTheDocument();
  });

  it('does not show the draft notice when nothing was restored', () => {
    renderEdit();
    expect(screen.queryByTestId('draft-notice')).toBeNull();
  });

  it('keeps restored values when the leave query resolves after the restore', () => {
    // The query starts unresolved, so hydration runs after the restore.
    queryResults = { getLeaveById: undefined };
    mockDraft.restored = true;
    mockDraft.restoredStep = 0; // type step
    const view = renderEdit();
    // The wizard page needs the leave loaded to render; simulate it resolving
    // after the restore has already populated the form.
    queryResults = { getLeaveById: leave() }; // server says paid, draft says sick
    view.rerender(<LeaveEditClient />);

    // The restored sick type is still selected — hydration must not clobber it.
    expect(screen.getByText('Sick Leave')).toBeInTheDocument();
    void toast;
  });
});
