/**
 * Tests for OffboardingClient — offboarding programs list, retention insights,
 * program detail dialog (tasks, assets, exit interview, settlement), and the
 * start-offboarding wizard.
 *
 * Mocks: convex/react (queries keyed by ref name, mutations), auth store,
 * selected org, main ref, UserPicker, SettlementPreviewDialog, toast, UI
 * primitives, lucide.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

let queryResults: Record<string, unknown> = {};
const mutationCalls: Array<{ name?: string; args: any[] }> = [];
const mutationImpls: Record<string, (...args: any[]) => any> = {};

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }, args?: any) =>
    args === 'skip' ? undefined : queryResults[ref?._name ?? ''],
  useMutation:
    (ref: { _name?: string }) =>
    (...args: any[]) => {
      mutationCalls.push({ name: ref?._name, args });
      const impl = mutationImpls[ref?._name ?? ''];
      return impl ? impl(...args) : Promise.resolve();
    },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    offboarding: {
      listPrograms: { _name: 'listPrograms' },
      getRetentionInsights: { _name: 'getRetentionInsights' },
      getProgram: { _name: 'getProgram' },
      completeTask: { _name: 'completeTask' },
      skipTask: { _name: 'skipTask' },
      completeProgram: { _name: 'completeProgram' },
      submitExitInterview: { _name: 'submitExitInterview' },
      startOffboarding: { _name: 'startOffboarding' },
    },
    assets: {
      checkActiveAssignmentsForEmployee: { _name: 'checkActiveAssignmentsForEmployee' },
    },
  },
}));

let mockUser: any = { id: 'user-1', organizationId: 'org-1', role: 'admin' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

let mockMainEl: any = null;
jest.mock('@/hooks/useMainRef', () => ({
  useMainRef: () => ({ current: mockMainEl }),
}));

let mockSelectedOrg: string | null = 'org-1';
jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => mockSelectedOrg,
}));

let mockUserPick: { id: string; name: string } | undefined = { id: 'u-2', name: 'User Two' };
jest.mock('@/components/ui/UserPicker', () => ({
  UserPicker: ({ onChange, onSelectUser, label }: any) => (
    <button
      type="button"
      data-testid="user-picker"
      onClick={() => {
        onChange('u-2');
        onSelectUser?.(mockUserPick);
      }}
    >
      {label}
    </button>
  ),
}));

jest.mock('@/components/settlement/SettlementPreviewDialog', () => ({
  __esModule: true,
  default: ({ employeeName, open, onClose }: any) =>
    open ? (
      <div data-testid="settlement-preview">
        Settlement for {employeeName}
        <button type="button" onClick={onClose}>
          close-preview
        </button>
      </div>
    ) : null,
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, className, ...props }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      className={className}
      {...props}
    >
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className, onClick }: any) => (
    <div data-testid="card" className={className} onClick={onClick}>
      {children}
    </div>
  ),
  CardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: any) => <span className={className}>{children}</span>,
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: any) => (open ? <div data-testid="sheet">{children}</div> : null),
  SheetContent: ({ children, className }: any) => (
    <div data-testid="sheet-content" className={className}>
      {children}
    </div>
  ),
  SheetHeader: ({ children }: any) => <div data-testid="sheet-header">{children}</div>,
  SheetBody: ({ children }: any) => <div data-testid="sheet-body">{children}</div>,
  SheetFooter: ({ children }: any) => <div data-testid="sheet-footer">{children}</div>,
  SheetTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange }: any) => (
    <div
      data-testid="select"
      onClick={() => {
        onValueChange?.('no');
      }}
    >
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('@/components/ui/tabs', () => {
  const ReactMod = require('react');
  const TabsCtx = ReactMod.createContext({ value: '', setValue: (_v: string) => {} });
  return {
    Tabs: ({ defaultValue, children }: any) => {
      const [value, setValue] = ReactMod.useState(defaultValue);
      return <TabsCtx.Provider value={{ value, setValue }}>{children}</TabsCtx.Provider>;
    },
    TabsList: ({ children }: any) => <div>{children}</div>,
    TabsTrigger: ({ value, children }: any) => {
      const { setValue } = ReactMod.useContext(TabsCtx);
      return (
        <button type="button" onClick={() => setValue(value)}>
          {children}
        </button>
      );
    },
    TabsContent: ({ value, children }: any) => {
      const { value: active } = ReactMod.useContext(TabsCtx);
      return active === value ? <div data-testid={`tab-${value}`}>{children}</div> : null;
    },
  };
});

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('lucide-react', () => {
  const icons = [
    'UserMinus',
    'CheckCircle2',
    'Check',
    'Circle',
    'SkipForward',
    'TrendingDown',
    'ChevronRight',
    'ChevronLeft',
    'Star',
    'BarChart3',
    'Package',
    'ArrowDownLeft',
    'Calculator',
  ];
  const mocks: Record<string, any> = {};
  for (const name of icons) {
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  }
  return mocks;
});

import OffboardingClient from '@/components/OffboardingClient';
import { toast } from 'sonner';

const PROGRAMS = [
  {
    _id: 'p-1',
    employeeName: 'Anna Petrova',
    status: 'active',
    reason: 'resignation',
    lastDay: '2026-03-31T00:00:00Z',
    progress: 60,
    completedTasks: 3,
    totalTasks: 5,
  },
  {
    _id: 'p-2',
    employeeName: 'Carlos',
    status: 'completed',
    reason: 'retirement',
    lastDay: '2026-01-15T00:00:00Z',
    progress: 100,
    completedTasks: 5,
    totalTasks: 5,
  },
];

const INSIGHTS = {
  avgExperience: 4,
  recommendRate: 80,
  totalExits: 3,
  reasons: { resignation: 2, retirement: 1 },
};

const PROGRAM_DETAIL = {
  _id: 'p-1',
  employeeName: 'Anna Petrova',
  managerName: 'HR Lead',
  organizationId: 'org-1',
  employeeId: 'emp-1',
  status: 'active',
  progress: 90,
  completedTasks: 4,
  totalTasks: 5,
  reason: 'resignation',
  lastDay: '2026-03-31T00:00:00Z',
  exitInterview: {
    _id: 'iv-1',
    status: 'scheduled',
    overallExperience: null,
    feedback: null,
  },
  tasks: [
    {
      _id: 'task-1',
      status: 'completed',
      title: 'Return laptop',
      assigneeType: 'it',
      assigneeName: null,
      category: 'equipment',
    },
    {
      _id: 'task-2',
      status: 'pending',
      title: 'Exit interview',
      assigneeType: 'manager',
      assigneeName: 'HR Lead',
      category: 'hr',
    },
  ],
};

const ASSETS = [
  {
    assignmentId: 'a-1',
    assetName: 'MacBook',
    icon: '💻',
    category: 'laptop',
    assignedAt: '2025-06-01T00:00:00Z',
  },
];

describe('OffboardingClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mutationCalls.length = 0;
    Object.keys(mutationImpls).forEach((k) => delete mutationImpls[k]);
    mockUser = { id: 'user-1', organizationId: 'org-1', role: 'admin' };
    queryResults = {
      listPrograms: PROGRAMS,
      getRetentionInsights: INSIGHTS,
    };
    window.scrollTo = jest.fn() as any;
    global.confirm = jest.fn(() => true) as any;
    mockSelectedOrg = 'org-1';
    mockMainEl = null;
    mockUserPick = { id: 'u-2', name: 'User Two' };
  });

  it('shows a loader while programs are loading', () => {
    queryResults = { listPrograms: undefined, getRetentionInsights: INSIGHTS };
    render(<OffboardingClient />);
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('renders the header, stats and program cards', () => {
    render(<OffboardingClient />);
    expect(screen.getByText('Offboarding')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument(); // avg experience
    expect(screen.getByText('80%')).toBeInTheDocument(); // recommend rate
    expect(screen.getByText('Anna Petrova')).toBeInTheDocument();
    expect(screen.getByText('Carlos')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getAllByText((c: string) => c.includes('3/5')).length).toBeGreaterThan(0);
  });

  it('shows an empty state when there are no programs', () => {
    queryResults = { listPrograms: [], getRetentionInsights: INSIGHTS };
    render(<OffboardingClient />);
    expect(screen.getByText('No offboarding programs')).toBeInTheDocument();
  });

  it('hides admin-only controls for non-admin users', () => {
    mockUser = { id: 'user-1', organizationId: 'org-1', role: 'employee' };
    render(<OffboardingClient />);
    expect(screen.queryByText('Start Offboarding')).toBeNull();
    expect(screen.queryByText('Insights')).toBeNull();
  });

  it('renders departure reasons in the insights tab', () => {
    render(<OffboardingClient />);
    fireEvent.click(screen.getByRole('button', { name: 'Insights' }));
    expect(screen.getByText('Departure Reasons')).toBeInTheDocument();
    expect(screen.getAllByText('resignation').length).toBeGreaterThan(0);
    expect(screen.getAllByText('retirement').length).toBeGreaterThan(0);
    expect(screen.getByText('3')).toBeInTheDocument(); // total exits
    expect(screen.getByText('4/5')).toBeInTheDocument(); // avg experience card
  });

  it('shows the no-data message when insights have no reasons', () => {
    queryResults.getRetentionInsights = { ...INSIGHTS, reasons: {} };
    render(<OffboardingClient />);
    fireEvent.click(screen.getByRole('button', { name: 'Insights' }));
    expect(screen.getByText('No data yet')).toBeInTheDocument();
  });

  it('shows a loader in the insights tab while loading', () => {
    queryResults.getRetentionInsights = undefined;
    render(<OffboardingClient />);
    fireEvent.click(screen.getByRole('button', { name: 'Insights' }));
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('opens program details, completes a task and skips a pending one', async () => {
    queryResults.getProgram = PROGRAM_DETAIL;
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));

    expect(screen.getByText(/Anna Petrova — Offboarding/)).toBeInTheDocument();
    expect(screen.getByText('HR Lead')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();

    // complete pending task
    fireEvent.click(screen.getAllByTestId('icon-Circle')[0]);
    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'completeTask', args: [{ taskId: 'task-2' }] }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Task completed');

    // skip pending task
    fireEvent.click(screen.getAllByTestId('icon-SkipForward')[0]);
    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'skipTask', args: [{ taskId: 'task-2' }] }),
        ]),
      );
    });
  });

  it('renders assigned assets in the program dialog', () => {
    queryResults.getProgram = PROGRAM_DETAIL;
    queryResults.checkActiveAssignmentsForEmployee = ASSETS;
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));
    expect(screen.getByText(/Assets to Return/)).toBeInTheDocument();
    expect(screen.getByText('MacBook')).toBeInTheDocument();
  });

  it('conducts and submits an exit interview', async () => {
    queryResults.getProgram = PROGRAM_DETAIL;
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));

    fireEvent.click(screen.getByText('Conduct'));
    expect(screen.getByText('Exit Interview Form')).toBeInTheDocument();

    // Fill the form
    const numberInputs = screen.getAllByRole('spinbutton');
    fireEvent.change(numberInputs[0], { target: { value: '5' } });
    const textInputs = screen.getAllByRole('textbox');
    fireEvent.change(textInputs[0], { target: { value: 'Low pay' } });
    fireEvent.change(textInputs[1], { target: { value: 'Great team, but...' } });
    fireEvent.change(textInputs[2], { target: { value: 'More bonuses' } });

    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'submitExitInterview',
            args: [
              expect.objectContaining({
                interviewId: 'iv-1',
                overallExperience: 5,
                wouldRecommend: true,
                primaryReason: 'Low pay',
                feedback: 'Great team, but...',
                improvements: 'More bonuses',
              }),
            ],
          }),
        ]),
      );
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Exit interview submitted'));
    await waitFor(() => expect(screen.queryByText('Exit Interview Form')).toBeNull());
  });

  it('shows a completed exit interview with feedback', () => {
    queryResults.getProgram = {
      ...PROGRAM_DETAIL,
      exitInterview: {
        _id: 'iv-1',
        status: 'completed',
        overallExperience: 4,
        feedback: 'Loved the culture',
      },
    };
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));
    expect(screen.getByText(/Experience:/)).toBeInTheDocument();
    expect(screen.getByText(/⭐⭐⭐⭐/)).toBeInTheDocument();
    expect(screen.getByText('Loved the culture')).toBeInTheDocument();
  });

  it('completes a program at >= 80% progress', async () => {
    queryResults.getProgram = PROGRAM_DETAIL;
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));

    fireEvent.click(screen.getByText('Complete Offboarding'));

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'completeProgram', args: [{ programId: 'p-1' }] }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Offboarding completed');
  });

  it('warns about approved future leaves after completing a program', async () => {
    mutationImpls.completeProgram = jest
      .fn()
      .mockResolvedValue({ deactivated: true, approvedFutureLeaves: 2 });
    queryResults.getProgram = PROGRAM_DETAIL;
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));
    fireEvent.click(screen.getByText('Complete Offboarding'));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Offboarding completed — account deactivated');
    });
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('approved leave'));
  });

  it('offers a force-complete flow when equipment is still assigned', async () => {
    mutationImpls.completeProgram = jest
      .fn()
      .mockRejectedValueOnce(new Error('Equipment is still assigned'))
      .mockResolvedValueOnce({ deactivated: true, approvedFutureLeaves: 0 });
    queryResults.getProgram = PROGRAM_DETAIL;
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));
    fireEvent.click(screen.getByText('Complete Offboarding'));

    await waitFor(() => {
      expect(global.confirm).toHaveBeenCalledWith(
        expect.stringContaining('Equipment is still assigned'),
      );
    });
    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'completeProgram',
            args: [{ programId: 'p-1', force: true }],
          }),
        ]),
      );
    });
  });

  it('toasts an error for other program completion failures', async () => {
    mutationImpls.completeProgram = jest.fn().mockRejectedValue(new Error('boom'));
    queryResults.getProgram = PROGRAM_DETAIL;
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));
    fireEvent.click(screen.getByText('Complete Offboarding'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('boom'));
  });

  it('declines the force-complete confirm and keeps the program open', async () => {
    global.confirm = jest.fn(() => false) as any;
    mutationImpls.completeProgram = jest
      .fn()
      .mockRejectedValueOnce(new Error('Equipment is still assigned'));
    queryResults.getProgram = PROGRAM_DETAIL;
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));
    fireEvent.click(screen.getByText('Complete Offboarding'));

    await waitFor(() => expect(global.confirm).toHaveBeenCalled());
    // No force re-submit after declining.
    expect(mutationImpls.completeProgram).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Complete Offboarding')).toBeInTheDocument();
  });

  it('opens the final settlement dialog from the program dialog', () => {
    queryResults.getProgram = PROGRAM_DETAIL;
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));
    fireEvent.click(screen.getByText('Final Settlement'));
    expect(screen.getByTestId('settlement-preview')).toBeInTheDocument();
    expect(screen.getByText(/Settlement for Anna Petrova/)).toBeInTheDocument();
  });

  it('closes the settlement preview dialog', () => {
    queryResults.getProgram = PROGRAM_DETAIL;
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));
    fireEvent.click(screen.getByText('Final Settlement'));
    expect(screen.getByTestId('settlement-preview')).toBeInTheDocument();
    fireEvent.click(screen.getByText('close-preview'));
    expect(screen.queryByTestId('settlement-preview')).toBeNull();
  });

  it('cancels the exit interview form without submitting', () => {
    queryResults.getProgram = PROGRAM_DETAIL;
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));
    fireEvent.click(screen.getByText('Conduct'));
    expect(screen.getByText('Exit Interview Form')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Exit Interview Form')).toBeNull();
    expect(mutationCalls.filter((c) => c.name === 'submitExitInterview')).toHaveLength(0);
  });

  it('starts offboarding through the wizard', async () => {
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Start Offboarding'));

    // Step 1: pick employee and manager
    const next = () => screen.getByText('Next');
    expect((next() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getAllByTestId('user-picker')[0]);
    fireEvent.click(screen.getAllByTestId('user-picker')[1]);
    fireEvent.click(next());

    // Step 2: last day + reason + note
    fireEvent.change(document.querySelector('input[type="date"]')!, {
      target: { value: '2026-05-01' },
    });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Good luck!' } });
    fireEvent.click(next());

    // Step 3: confirm + start
    fireEvent.click(screen.getByText('Start'));

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'startOffboarding',
            args: [
              expect.objectContaining({
                organizationId: 'org-1',
                employeeId: 'u-2',
                managerId: 'u-2',
                reason: 'resignation',
                reasonNote: 'Good luck!',
                lastDay: expect.any(Number),
              }),
            ],
          }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Offboarding started');
  });

  it('toasts an error when starting offboarding fails', async () => {
    mutationImpls.startOffboarding = jest.fn().mockRejectedValue(new Error('start boom'));
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Start Offboarding'));
    fireEvent.click(screen.getAllByTestId('user-picker')[0]);
    fireEvent.click(screen.getAllByTestId('user-picker')[1]);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.change(document.querySelector('input[type="date"]')!, {
      target: { value: '2026-05-01' },
    });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Start'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('start boom'));
  });

  it('disables Next on step 2 until a last day is set', () => {
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Start Offboarding'));
    fireEvent.click(screen.getAllByTestId('user-picker')[0]);
    fireEvent.click(screen.getAllByTestId('user-picker')[1]);
    fireEvent.click(screen.getByText('Next'));
    expect((screen.getByText('Next') as HTMLButtonElement).disabled).toBe(true);
  });

  it('scrolls the main element when opening the wizard', () => {
    const scrollTo = jest.fn();
    mockMainEl = { scrollTo };
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Start Offboarding'));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(window.scrollTo).toHaveBeenCalled();
  });

  it('falls back to the user organization when the selector returns null', () => {
    mockSelectedOrg = null;
    render(<OffboardingClient />);
    // Queries still run against the user's org.
    expect(screen.getByText('Anna Petrova')).toBeInTheDocument();
    // The wizard resolves orgId the same way.
    fireEvent.click(screen.getByText('Start Offboarding'));
    expect(screen.getByTestId('sheet-content')).toBeInTheDocument();
  });

  it('skips queries and guards the wizard submit without an organization', async () => {
    mockSelectedOrg = null;
    mockUser = { id: 'user-1', role: 'admin' }; // no organizationId
    render(<OffboardingClient />);
    // No org → listPrograms queried with 'skip' → loader.
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Start Offboarding'));
    fireEvent.click(screen.getAllByTestId('user-picker')[0]);
    fireEvent.click(screen.getAllByTestId('user-picker')[1]);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.change(document.querySelector('input[type="date"]')!, {
      target: { value: '2026-05-01' },
    });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Start'));

    // handleSubmit guard: no user.organizationId → nothing submitted, no toast.
    expect(mutationCalls.filter((c) => c.name === 'startOffboarding')).toHaveLength(0);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows a non-active/completed status badge', () => {
    queryResults.listPrograms = [
      { ...PROGRAMS[0], _id: 'p-3', status: 'hold', employeeName: 'Zoe' },
    ];
    render(<OffboardingClient />);
    expect(screen.getByText('hold')).toBeInTheDocument();
  });

  it('shows admin controls to supervisors in the program dialog', () => {
    mockUser = { id: 'user-1', organizationId: 'org-1', role: 'supervisor' };
    queryResults.getProgram = PROGRAM_DETAIL;
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));
    expect(screen.getByText('Final Settlement')).toBeInTheDocument();
    expect(screen.getByText('Complete Offboarding')).toBeInTheDocument();
    expect(screen.getAllByTestId('icon-SkipForward').length).toBeGreaterThan(0);
  });

  it('skips the assets query when the program has no employee id', () => {
    queryResults.getProgram = { ...PROGRAM_DETAIL, employeeId: undefined };
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));
    expect(screen.queryByText(/Assets to Return/)).toBeNull();
  });

  it('guards task actions when the user has no id', () => {
    mockUser = { role: 'admin' };
    queryResults.getProgram = PROGRAM_DETAIL;
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));

    fireEvent.click(screen.getAllByTestId('icon-Circle')[0]);
    fireEvent.click(screen.getAllByTestId('icon-SkipForward')[0]);
    expect(mutationCalls.filter((c) => c.name === 'completeTask')).toHaveLength(0);
    expect(mutationCalls.filter((c) => c.name === 'skipTask')).toHaveLength(0);
  });

  it('toasts the generic error when completion fails with a non-Error', async () => {
    mutationImpls.completeProgram = jest.fn().mockRejectedValue('string boom');
    queryResults.getProgram = PROGRAM_DETAIL;
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));
    fireEvent.click(screen.getByText('Complete Offboarding'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Error'));
  });

  it('toasts the generic error when starting offboarding fails with a non-Error', async () => {
    mutationImpls.startOffboarding = jest.fn().mockRejectedValue('string boom');
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Start Offboarding'));
    fireEvent.click(screen.getAllByTestId('user-picker')[0]);
    fireEvent.click(screen.getAllByTestId('user-picker')[1]);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.change(document.querySelector('input[type="date"]')!, {
      target: { value: '2026-05-01' },
    });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Start'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Error'));
  });

  it('renders a skipped task with the skip icon', () => {
    queryResults.getProgram = {
      ...PROGRAM_DETAIL,
      tasks: [{ ...PROGRAM_DETAIL.tasks[1], _id: 'task-3', status: 'skipped' }],
    };
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));
    expect(screen.getAllByTestId('icon-SkipForward').length).toBeGreaterThan(0);
  });

  it('renders a completed interview with null experience and feedback', () => {
    queryResults.getProgram = {
      ...PROGRAM_DETAIL,
      exitInterview: { _id: 'iv-1', status: 'completed', overallExperience: null, feedback: null },
    };
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));
    expect(screen.getByText(/Experience:/)).toBeInTheDocument();
    expect(screen.queryByText('Loved the culture')).toBeNull();
  });

  it('submits an empty exit interview with default values', async () => {
    queryResults.getProgram = PROGRAM_DETAIL;
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));
    fireEvent.click(screen.getByText('Conduct'));

    // Toggle the recommend select (mock fires 'no') and clear the experience.
    fireEvent.click(screen.getByTestId('select'));
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '' } });

    fireEvent.click(screen.getByText('Submit'));
    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'submitExitInterview',
            args: [
              expect.objectContaining({
                interviewId: 'iv-1',
                overallExperience: 3,
                wouldRecommend: false,
                primaryReason: undefined,
                feedback: undefined,
                improvements: undefined,
              }),
            ],
          }),
        ]),
      );
    });
  });

  it('shows a loader in the program dialog while the program is loading', () => {
    queryResults.getProgram = undefined;
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));
    expect(screen.getByText(/— Offboarding/)).toBeInTheDocument();
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('navigates the wizard back and cancels from the first step', () => {
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Start Offboarding'));

    // Cancel from step 0 closes the wizard.
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('sheet-content')).toBeNull();

    // Back from step 1 returns to step 0.
    fireEvent.click(screen.getByText('Start Offboarding'));
    fireEvent.click(screen.getAllByTestId('user-picker')[0]);
    fireEvent.click(screen.getAllByTestId('user-picker')[1]);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Departing employee')).toBeInTheDocument();
  });

  it('shows the picked names and custom reason on the confirm step', () => {
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Start Offboarding'));
    fireEvent.click(screen.getAllByTestId('user-picker')[0]);
    fireEvent.click(screen.getAllByTestId('user-picker')[1]);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.change(document.querySelector('input[type="date"]')!, {
      target: { value: '2026-05-01' },
    });
    fireEvent.click(screen.getByTestId('select')); // reason select fires 'no'
    fireEvent.click(screen.getByText('Next'));

    expect(screen.getAllByText('User Two').length).toBeGreaterThan(0);
    expect(screen.getByText('2026-05-01')).toBeInTheDocument();
    expect(screen.getByText('no')).toBeInTheDocument();
  });

  it('shows the placeholder when no user was picked', () => {
    mockUserPick = undefined;
    render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Start Offboarding'));
    fireEvent.click(screen.getAllByTestId('user-picker')[0]);
    fireEvent.click(screen.getAllByTestId('user-picker')[1]);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.change(document.querySelector('input[type="date"]')!, {
      target: { value: '2026-05-01' },
    });
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('guards the exit interview submit when the interview disappears', async () => {
    queryResults.getProgram = PROGRAM_DETAIL;
    const { rerender } = render(<OffboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));
    fireEvent.click(screen.getByText('Conduct'));

    // The interview is removed server-side while the form is open.
    queryResults.getProgram = { ...PROGRAM_DETAIL, exitInterview: undefined };
    rerender(<OffboardingClient />);

    fireEvent.click(screen.getByText('Submit'));
    expect(mutationCalls.filter((c) => c.name === 'submitExitInterview')).toHaveLength(0);
    expect(toast.success).not.toHaveBeenCalled();
  });
});
