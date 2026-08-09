/**
 * Tests for PerformanceClient — the performance-review orchestrator and its
 * internal dialogs: CreateCycleWizard, FillReviewDialog, LaunchCycleDialog,
 * ResultsDialog and CycleSummaryCard.
 *
 * Covers: loading gate, admin/supervisor vs employee chrome, stats cards, the
 * my-reviews list, the full create-cycle wizard (validation, 360° settings,
 * competency editing, submit), the fill-review flow (rating gating, objectives
 * block, submit), the launch dialog (toggle/select-all, guards), cycle actions
 * (launch/close/cancel/delete), and the results tab (summary cards, result
 * dialog with self/manager/peer reviews and the anonymity branch).
 *
 * Mocks: @/lib/convex-typed (useQuery/useMutation keyed by _name), generated
 * api, auth store (selector form + useShallow identity), useMainRef,
 * useSelectedOrganization, react-i18next (fallback strings), sonner,
 * next/image, ui primitives (button/card/badge/tabs/dialog/input/textarea),
 * CustomSelect and ShieldLoader.
 */

import React from 'react';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// ── Fixtures ────────────────────────────────────────────────────────────────
const mockDraftCycle = {
  _id: 'cycle-draft',
  title: 'Q3 Review',
  status: 'draft',
  startDate: 1_750_000_000_000,
  endDate: 1_760_000_000_000,
};
const mockActiveCycle = {
  _id: 'cycle-active',
  title: 'Q2 Review',
  status: 'active',
  startDate: 1_740_000_000_000,
  endDate: 1_750_000_000_000,
};
const mockCompletedCycle = {
  _id: 'cycle-completed',
  title: 'Q1 Review',
  status: 'completed',
  startDate: 1_730_000_000_000,
  endDate: 1_740_000_000_000,
};

const mockPendingAssignment = {
  _id: 'assign-1',
  cycleId: 'cycle-active',
  reviewerId: 'user-1',
  revieweeId: 'user-2',
  organizationId: 'org-1',
  status: 'pending',
  type: 'manager',
  competencies: [
    { id: 'quality', name: 'Quality of Work', description: 'Accuracy', weight: 40 },
    { id: 'teamwork', name: 'Teamwork', description: 'Collaboration', weight: 60 },
  ],
  revieweeName: 'Bob Smith',
  cycleName: 'Q2 Review',
  dueDate: 1_760_000_000_000,
};

const mockSubmittedAssignment = {
  ...mockPendingAssignment,
  _id: 'assign-2',
  status: 'submitted',
  revieweeName: 'Carol Lee',
};

const mockParticipant1 = {
  _id: 'user-2',
  name: 'Bob Smith',
  position: 'Engineer',
  role: 'employee',
  department: 'Engineering',
};
const mockParticipant2 = {
  _id: 'user-3',
  name: 'Alice Brown',
  role: 'employee',
};

const mockResults = {
  reviewee: { name: 'Bob Smith' },
  overallScore: 4.2,
  totalResponses: 3,
  competencyAverages: [
    { id: 'quality', name: 'Quality of Work', average: 4 },
    { id: 'teamwork', name: 'Teamwork', average: 3 },
  ],
  selfReview: { overallScore: 4, strengths: 'Reliable', improvements: 'Speed' },
  managerReviews: [
    { overallScore: 5, strengths: 'Great', improvements: 'None', generalComments: 'Keep it up' },
  ],
  peerReviews: [{ overallScore: 4, strengths: 'Helpful' }],
  peerCount: 1,
  peerThreshold: 3,
};

const mockSummary = {
  revieweeId: 'user-2',
  name: 'Bob Smith',
  averageScore: 4.1,
  reviewCount: 3,
};

const mockObjective = {
  _id: 'obj-1',
  title: 'Ship the platform',
  level: 'company',
  periodType: 'quarterly',
  periodYear: 2026,
  keyResultsCount: 2,
  progress: 80,
  keyResults: [
    { _id: 'kr-1', title: 'Release v2', progress: 90 },
    { _id: 'kr-2', title: 'Docs', progress: 70 },
  ],
  taskCount: 4,
  completedTaskCount: 3,
};

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: any) => (typeof fallback === 'object' ? key : (fallback ?? key)),
    i18n: { language: 'en' },
  }),
}));

// ── Convex (typed wrapper) ───────────────────────────────────────────────────
const mockQueries: Record<string, any> = {};
const mockMutations: Record<string, jest.Mock> = {};
jest.mock('@/lib/convex-typed', () => ({
  useQuery: (ref: { _name?: string }) => mockQueries[ref?._name ?? ''],
  useMutation: (ref: { _name?: string }) => mockMutations[ref?._name ?? ''] ?? jest.fn(),
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    performance: {
      listCycles: { _name: 'listCycles' },
      getMyAssignments: { _name: 'getMyAssignments' },
      createCycle: { _name: 'createCycle' },
      closeCycle: { _name: 'closeCycle' },
      cancelCycle: { _name: 'cancelCycle' },
      deleteCycle: { _name: 'deleteCycle' },
      getEligibleParticipants: { _name: 'getEligibleParticipants' },
      launchCycle: { _name: 'launchCycle' },
      getRevieweeResults: { _name: 'getRevieweeResults' },
      submitReview: { _name: 'submitReview' },
      getCycleSummary: { _name: 'getCycleSummary' },
    },
    goals: {
      getRevieweeObjectivesWithReviews: { _name: 'getRevieweeObjectivesWithReviews' },
    },
  },
}));

// ── Auth / hooks ─────────────────────────────────────────────────────────────
let mockUser: Record<string, unknown> | null = {
  id: 'user-1',
  role: 'admin',
  organizationId: 'org-1',
};
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector: any) => selector({ user: mockUser }),
}));
jest.mock('zustand/shallow', () => ({
  useShallow: (fn: any) => fn,
}));

let mockOrg: string | null = 'org-1';
jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => mockOrg,
}));

jest.mock('@/hooks/useMainRef', () => ({
  useMainRef: () => ({ current: { scrollTo: jest.fn() } }),
}));

// ── Toast / ui ───────────────────────────────────────────────────────────────
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, ...rest }: any) => <img alt={alt ?? ''} {...rest} />,
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, ...props }: any) => (
    <button type="button" onClick={onClick} disabled={disabled} data-variant={variant} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: any) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/tabs', () => {
  const ReactMod = require('react');
  const TabsCtx = ReactMod.createContext({ value: '', setValue: (_v: string) => {} });
  return {
    Tabs: ({ defaultValue, value, onValueChange, children }: any) => {
      const [internal, setInternal] = ReactMod.useState(value ?? defaultValue ?? '');
      const active = value !== undefined ? value : internal;
      const setValue = (v: string) => {
        setInternal(v);
        onValueChange?.(v);
      };
      return <TabsCtx.Provider value={{ value: active, setValue }}>{children}</TabsCtx.Provider>;
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

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children, onOpenChange }: any) =>
    open ? (
      <div data-testid="dialog">
        <button type="button" data-testid="dialog-close" onClick={() => onOpenChange(false)}>
          x
        </button>
        {children}
      </div>
    ) : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

jest.mock('@/components/ui/CustomSelect', () => ({
  CustomSelect: ({ value, onChange, options }: any) => (
    <select data-testid="custom-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

jest.mock('lucide-react', () => {
  const names = [
    'Target',
    'Plus',
    'BarChart3',
    'Users',
    'CheckCircle',
    'ChevronDown',
    'ChevronLeft',
    'ChevronRight',
    'Send',
    'Eye',
    'Trash2',
    'Play',
    'XCircle',
    'Star',
    'Clock',
    'TrendingUp',
    'Calendar',
    'UserCheck',
  ];
  const mocks: Record<string, any> = {};
  for (const name of names) {
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  }
  return mocks;
});

import { PerformanceClient } from '@/components/PerformanceClient';
import { toast } from 'sonner';

// ── Helpers ──────────────────────────────────────────────────────────────────
const openCreateWizard = () => {
  fireEvent.click(screen.getByText('performance.createCycle'));
  expect(screen.getByTestId('dialog')).toBeInTheDocument();
};

const fillCycleBasics = () => {
  const dialog = screen.getByTestId('dialog') as HTMLElement;
  const textboxes = dialog.querySelectorAll('input:not([type="date"]), textarea');
  fireEvent.change(textboxes[0] as HTMLElement, { target: { value: 'Annual Review 2026' } });
  const dates = dialog.querySelectorAll('input[type="date"]');
  fireEvent.change(dates[0] as HTMLElement, { target: { value: '2026-01-01' } });
  fireEvent.change(dates[1] as HTMLElement, { target: { value: '2026-12-31' } });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'user-1', role: 'admin', organizationId: 'org-1' };
  mockOrg = 'org-1';
  (global as any).scrollTo = jest.fn();
  mockQueries.listCycles = [mockDraftCycle, mockActiveCycle, mockCompletedCycle];
  mockQueries.getMyAssignments = [mockPendingAssignment, mockSubmittedAssignment];
  mockQueries.getEligibleParticipants = [mockParticipant1, mockParticipant2];
  mockQueries.getRevieweeResults = mockResults;
  mockQueries.getCycleSummary = { summaries: [mockSummary] };
  mockQueries.getRevieweeObjectivesWithReviews = [mockObjective];
  mockMutations.createCycle = jest.fn().mockResolvedValue('cycle-new');
  mockMutations.closeCycle = jest.fn().mockResolvedValue(undefined);
  mockMutations.cancelCycle = jest.fn().mockResolvedValue(undefined);
  mockMutations.deleteCycle = jest.fn().mockResolvedValue(undefined);
  mockMutations.launchCycle = jest.fn().mockResolvedValue(undefined);
  mockMutations.submitReview = jest.fn().mockResolvedValue(undefined);
});

describe('PerformanceClient', () => {
  // ── Loading & roles ─────────────────────────────────────────────────────

  it('shows a loader when there is no current user', () => {
    mockUser = null;
    render(<PerformanceClient />);
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('shows a loader when there is no organization', () => {
    mockUser = { id: 'user-1', role: 'admin' };
    mockOrg = null;
    render(<PerformanceClient />);
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('hides cycle-management chrome for plain employees', () => {
    mockUser = { id: 'user-1', role: 'employee', organizationId: 'org-1' };
    render(<PerformanceClient />);
    expect(screen.getByText('performance.title')).toBeInTheDocument();
    expect(screen.queryByText('performance.createCycle')).not.toBeInTheDocument();
    expect(screen.queryByText('performance.tabs.cycles')).not.toBeInTheDocument();
    expect(screen.queryByText('performance.tabs.results')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tab-cycles')).not.toBeInTheDocument();
  });

  it('shows the create button and management tabs for admins', () => {
    render(<PerformanceClient />);
    expect(screen.getByText('performance.createCycle')).toBeInTheDocument();
    expect(screen.getByText('performance.tabs.cycles')).toBeInTheDocument();
    expect(screen.getByText('performance.tabs.results')).toBeInTheDocument();
  });

  it('renders the stats cards with computed counts', () => {
    render(<PerformanceClient />);
    // pending=1 (one pending), submitted=1, active cycles=1 → three '1' values
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('performance.stats.pending')).toBeInTheDocument();
    expect(screen.getByText('performance.stats.completed')).toBeInTheDocument();
    expect(screen.getByText('performance.stats.activeCycles')).toBeInTheDocument();
  });

  // ── My reviews ──────────────────────────────────────────────────────────

  it('lists pending assignments with the review button', () => {
    render(<PerformanceClient />);
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(screen.getByText(/Q2 Review/)).toBeInTheDocument();
    expect(screen.getByText('performance.fillReview')).toBeInTheDocument();
  });

  it('shows the empty state when there are no pending reviews', () => {
    mockQueries.getMyAssignments = [mockSubmittedAssignment];
    render(<PerformanceClient />);
    expect(screen.getByText('performance.noReviewsPending')).toBeInTheDocument();
  });

  // ── Fill review ─────────────────────────────────────────────────────────

  it('opens the fill review dialog and gates the submit until all are rated', async () => {
    render(<PerformanceClient />);
    fireEvent.click(screen.getByText('performance.fillReview'));
    const dialog = screen.getByTestId('dialog');
    expect(within(dialog).getByText(/Bob Smith/)).toBeInTheDocument();

    // submit disabled until every competency is rated
    const submitBtn = within(dialog)
      .getAllByText('performance.submitReview')
      .map((el) => el.closest('button') as HTMLButtonElement)[0];
    expect(submitBtn.disabled).toBe(true);

    // rate both competencies
    const ratingButtons = within(dialog)
      .getAllByRole('button')
      .filter((b) => /^[1-5]$/.test(b.textContent ?? ''));
    ratingButtons.forEach((b) => fireEvent.click(b));
    expect(submitBtn.disabled).toBe(false);

    fireEvent.click(submitBtn);
    await waitFor(() => expect(mockMutations.submitReview).toHaveBeenCalled());
    expect(mockMutations.submitReview).toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentId: 'assign-1',
        ratings: expect.arrayContaining([
          expect.objectContaining({ competencyId: 'quality', score: expect.any(Number) }),
        ]),
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('performance.reviewSubmitted');
  });

  it('sends strengths, improvements and general comments with the review', async () => {
    render(<PerformanceClient />);
    fireEvent.click(screen.getByText('performance.fillReview'));
    const dialog = screen.getByTestId('dialog') as HTMLElement;
    const textareas = dialog.querySelectorAll('textarea');
    // [0] and [1] are per-competency comments, [2..4] are overall feedback
    fireEvent.change(textareas[0] as HTMLElement, { target: { value: 'Accurate' } });
    fireEvent.change(textareas[2] as HTMLElement, { target: { value: 'Great collaborator' } });
    fireEvent.change(textareas[3] as HTMLElement, { target: { value: 'Needs speed' } });
    fireEvent.change(textareas[4] as HTMLElement, { target: { value: 'Overall solid' } });
    dialog.querySelectorAll('button').forEach((b) => {
      if (/^[1-5]$/.test(b.textContent ?? '')) fireEvent.click(b);
    });
    const submitBtn = within(dialog)
      .getAllByText('performance.submitReview')
      .map((el) => el.closest('button') as HTMLButtonElement)[0];
    fireEvent.click(submitBtn);
    await waitFor(() => expect(mockMutations.submitReview).toHaveBeenCalled());
    expect(mockMutations.submitReview).toHaveBeenCalledWith(
      expect.objectContaining({
        strengths: 'Great collaborator',
        improvements: 'Needs speed',
        generalComments: 'Overall solid',
      }),
    );
  });

  it('shows an error toast when the review submission fails', async () => {
    mockMutations.submitReview = jest.fn().mockRejectedValue(new Error('db down'));
    render(<PerformanceClient />);
    fireEvent.click(screen.getByText('performance.fillReview'));
    const dialog = screen.getByTestId('dialog');
    within(dialog)
      .getAllByRole('button')
      .filter((b) => /^[1-5]$/.test(b.textContent ?? ''))
      .forEach((b) => fireEvent.click(b));
    const submitBtn = within(dialog)
      .getAllByText('performance.submitReview')
      .map((el) => el.closest('button') as HTMLButtonElement)[0];
    fireEvent.click(submitBtn);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('db down'));
  });

  it('expands the aligned-objectives block with progress bars and key results', () => {
    render(<PerformanceClient />);
    fireEvent.click(screen.getByText('performance.fillReview'));
    const dialog = screen.getByTestId('dialog');
    expect(within(dialog).getByText(/goals.title/)).toBeInTheDocument();

    // collapsed first — key results hidden
    expect(within(dialog).queryByText('Release v2')).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog)
        .getByText(/goals.title/)
        .closest('button') as HTMLElement,
    );
    expect(within(dialog).getByText('Ship the platform')).toBeInTheDocument();
    expect(within(dialog).getByText('Release v2')).toBeInTheDocument();
    expect(within(dialog).getByText('90%')).toBeInTheDocument();
    expect(within(dialog).getByText(/3\/4/)).toBeInTheDocument();
    // high progress → emerald class
    expect(within(dialog).getByText('80%').className).toContain('text-emerald-600');
  });

  it('hides the objectives block when there are none', () => {
    mockQueries.getRevieweeObjectivesWithReviews = [];
    render(<PerformanceClient />);
    fireEvent.click(screen.getByText('performance.fillReview'));
    const dialog = screen.getByTestId('dialog');
    expect(within(dialog).queryByText(/goals.title/)).not.toBeInTheDocument();
  });

  // ── Create cycle wizard ─────────────────────────────────────────────────

  it('walks the create wizard through all steps and submits', async () => {
    render(<PerformanceClient />);
    openCreateWizard();

    // Step 0: Next is disabled until title + dates are filled
    const dialog = screen.getByTestId('dialog');
    let nextBtn = within(dialog)
      .getAllByText('common.next')
      .map((el) => el.closest('button') as HTMLButtonElement)[0];
    expect(nextBtn.disabled).toBe(true);

    fillCycleBasics();
    nextBtn = within(dialog)
      .getAllByText('common.next')
      .map((el) => el.closest('button') as HTMLButtonElement)[0];
    expect(nextBtn.disabled).toBe(false);
    fireEvent.click(nextBtn);

    // Step 1: review types — toggle direct report + peer threshold input
    expect(within(dialog).getByText('performance.wizard.reviewTypes')).toBeInTheDocument();
    const checkboxes = within(dialog).getAllByRole('checkbox');
    // last one is direct-report, off by default
    fireEvent.click(checkboxes[checkboxes.length - 1]);
    const threshold = (dialog as HTMLElement).querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;
    expect(threshold).toBeTruthy();
    fireEvent.change(threshold, { target: { value: '4' } });

    fireEvent.click(
      within(dialog)
        .getAllByText('common.next')
        .map((el) => el.closest('button') as HTMLButtonElement)[0],
    );

    // Step 2: competencies — add + remove, then submit
    expect(within(dialog).getByText('performance.wizard.competencies')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText('performance.addCompetency'));
    expect(within(dialog).getByText(/100%/)).toBeInTheDocument();

    const removeButtons = within(dialog)
      .getAllByRole('button')
      .filter((b) => b.querySelector('[data-testid="icon-Trash2"]'));
    fireEvent.click(removeButtons[0]);
    expect(within(dialog).getByText(/80%/)).toBeInTheDocument();

    const submitBtn = within(dialog)
      .getAllByText('performance.createCycle')
      .map((el) => el.closest('button') as HTMLButtonElement)
      .filter((b) => b)[0];
    fireEvent.click(submitBtn);
    await waitFor(() => expect(mockMutations.createCycle).toHaveBeenCalled());
    expect(mockMutations.createCycle).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        title: 'Annual Review 2026',
        type: 'quarterly',
        includesDirectReport: true,
        peerAnonymityThreshold: 4,
        showPeerIdentity: false,
        createdBy: 'user-1',
        competencies: expect.any(Array),
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('performance.cycleCreated');
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('captures the description and changes the cycle type', async () => {
    render(<PerformanceClient />);
    openCreateWizard();
    const dialog = screen.getByTestId('dialog') as HTMLElement;
    const textboxes = dialog.querySelectorAll('input:not([type="date"]), textarea');
    fireEvent.change(textboxes[0] as HTMLElement, { target: { value: 'Annual Review 2026' } });
    // description textarea
    fireEvent.change(textboxes[1] as HTMLElement, { target: { value: 'Company-wide cycle' } });
    // type select → annual
    fireEvent.change(dialog.querySelector('[data-testid="custom-select"]') as HTMLElement, {
      target: { value: 'annual' },
    });
    const dates = dialog.querySelectorAll('input[type="date"]');
    fireEvent.change(dates[0] as HTMLElement, { target: { value: '2026-01-01' } });
    fireEvent.change(dates[1] as HTMLElement, { target: { value: '2026-12-31' } });
    fireEvent.click(
      within(dialog)
        .getAllByText('common.next')
        .map((el) => el.closest('button') as HTMLButtonElement)[0],
    );
    fireEvent.click(
      within(dialog)
        .getAllByText('common.next')
        .map((el) => el.closest('button') as HTMLButtonElement)[0],
    );
    fireEvent.click(
      within(dialog)
        .getAllByText('performance.createCycle')
        .map((el) => el.closest('button') as HTMLButtonElement)
        .filter((b) => b)[0],
    );
    await waitFor(() => expect(mockMutations.createCycle).toHaveBeenCalled());
    expect(mockMutations.createCycle).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Annual Review 2026',
        description: 'Company-wide cycle',
        type: 'annual',
      }),
    );
  });

  it('edits a competency name and weight, then goes back a step', () => {
    render(<PerformanceClient />);
    openCreateWizard();
    fillCycleBasics();
    const dialog = screen.getByTestId('dialog') as HTMLElement;
    fireEvent.click(
      within(dialog)
        .getAllByText('common.next')
        .map((el) => el.closest('button') as HTMLButtonElement)[0],
    );
    fireEvent.click(
      within(dialog)
        .getAllByText('common.next')
        .map((el) => el.closest('button') as HTMLButtonElement)[0],
    );
    // first competency row: name input, description input, weight input
    const nameInputs = dialog.querySelectorAll('input');
    fireEvent.change(nameInputs[0] as HTMLElement, { target: { value: 'Craft' } });
    fireEvent.change(nameInputs[1] as HTMLElement, { target: { value: 'Precision' } });
    const weightInputs = dialog.querySelectorAll('input[type="number"]');
    fireEvent.change(weightInputs[0] as HTMLElement, { target: { value: '30' } });
    // back → step 1
    fireEvent.click(within(dialog).getByText('common.back'));
    expect(within(dialog).getByText('performance.wizard.reviewTypes')).toBeInTheDocument();
  });

  it('cannot proceed past the review-types step when every type is off', () => {
    render(<PerformanceClient />);
    openCreateWizard();
    fillCycleBasics();
    const dialog = screen.getByTestId('dialog');
    fireEvent.click(
      within(dialog)
        .getAllByText('common.next')
        .map((el) => el.closest('button') as HTMLButtonElement)[0],
    );
    // turn all four checkboxes off
    within(dialog)
      .getAllByRole('checkbox')
      .forEach((c) => {
        if ((c as HTMLInputElement).checked) fireEvent.click(c);
      });
    const nextBtn = within(dialog)
      .getAllByText('common.next')
      .map((el) => el.closest('button') as HTMLButtonElement)[0];
    expect(nextBtn.disabled).toBe(true);
  });

  it('shows an error toast when the cycle creation fails', async () => {
    mockMutations.createCycle = jest.fn().mockRejectedValue(new Error('cycle boom'));
    render(<PerformanceClient />);
    openCreateWizard();
    fillCycleBasics();
    const dialog = screen.getByTestId('dialog');
    fireEvent.click(
      within(dialog)
        .getAllByText('common.next')
        .map((el) => el.closest('button') as HTMLButtonElement)[0],
    );
    fireEvent.click(
      within(dialog)
        .getAllByText('common.next')
        .map((el) => el.closest('button') as HTMLButtonElement)[0],
    );
    const submitBtn = within(dialog)
      .getAllByText('performance.createCycle')
      .map((el) => el.closest('button') as HTMLButtonElement)
      .filter((b) => b && !b.disabled)
      .slice(-1)[0];
    fireEvent.click(submitBtn);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('cycle boom'));
  });

  it('cancels the wizard from step 0', () => {
    render(<PerformanceClient />);
    openCreateWizard();
    const dialog = screen.getByTestId('dialog');
    fireEvent.click(within(dialog).getByText('common.cancel'));
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  // ── Launch & cycle actions ──────────────────────────────────────────────

  it('opens the launch dialog, toggles participants and launches', async () => {
    render(<PerformanceClient />);
    fireEvent.click(screen.getByText('performance.tabs.cycles'));
    fireEvent.click(screen.getByText('performance.launch'));

    const dialog = screen.getByTestId('dialog');
    const launchBtn = within(dialog)
      .getAllByText('performance.launchCycle')
      .map((el) => el.closest('button') as HTMLButtonElement)[1];
    expect(launchBtn.disabled).toBe(true);

    // toggle one participant
    fireEvent.click(within(dialog).getByText('Bob Smith'));
    expect(launchBtn.disabled).toBe(false);
    fireEvent.click(launchBtn);
    await waitFor(() => expect(mockMutations.launchCycle).toHaveBeenCalled());
    expect(mockMutations.launchCycle).toHaveBeenCalledWith(
      expect.objectContaining({
        cycleId: 'cycle-draft',
        launchedBy: 'user-1',
        participants: ['user-2'],
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('performance.cycleLaunched');
  });

  it('shows an error toast when the launch fails', async () => {
    mockMutations.launchCycle = jest.fn().mockRejectedValue(new Error('launch boom'));
    render(<PerformanceClient />);
    fireEvent.click(screen.getByText('performance.tabs.cycles'));
    fireEvent.click(screen.getByText('performance.launch'));
    const dialog = screen.getByTestId('dialog');
    fireEvent.click(within(dialog).getByText('Bob Smith'));
    const launchBtn = within(dialog)
      .getAllByText('performance.launchCycle')
      .map((el) => el.closest('button') as HTMLButtonElement)[1];
    fireEvent.click(launchBtn);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('launch boom'));
  });

  it('selects all participants in the launch dialog', () => {
    render(<PerformanceClient />);
    fireEvent.click(screen.getByText('performance.tabs.cycles'));
    fireEvent.click(screen.getByText('performance.launch'));
    const dialog = screen.getByTestId('dialog');
    fireEvent.click(within(dialog).getByText('common.selectAll'));
    const launchBtn = within(dialog)
      .getAllByText('performance.launchCycle')
      .map((el) => el.closest('button') as HTMLButtonElement)[1];
    expect(launchBtn.disabled).toBe(false);
    expect(within(dialog).getByText(/2/)).toBeInTheDocument();
  });

  it('deletes a draft cycle', async () => {
    render(<PerformanceClient />);
    fireEvent.click(screen.getByText('performance.tabs.cycles'));
    fireEvent.click(screen.getByText('performance.tabs.cycles')); // stays
    const deleteBtn = screen
      .getAllByRole('button')
      .find((b) => b.querySelector('[data-testid="icon-Trash2"]')) as HTMLElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => expect(mockMutations.deleteCycle).toHaveBeenCalled());
    expect(mockMutations.deleteCycle).toHaveBeenCalledWith({ cycleId: 'cycle-draft' });
    expect(toast.success).toHaveBeenCalledWith('common.deleted');
  });

  it('closes and cancels an active cycle', async () => {
    render(<PerformanceClient />);
    fireEvent.click(screen.getByText('performance.tabs.cycles'));
    fireEvent.click(screen.getByText('performance.close'));
    await waitFor(() =>
      expect(mockMutations.closeCycle).toHaveBeenCalledWith({ cycleId: 'cycle-active' }),
    );
    expect(toast.success).toHaveBeenCalledWith('performance.cycleClosed');

    fireEvent.click(screen.getByText('performance.tabs.cycles'));
    const cancelBtn = screen
      .getAllByRole('button')
      .find((b) => b.querySelector('[data-testid="icon-XCircle"]')) as HTMLElement;
    fireEvent.click(cancelBtn);
    await waitFor(() =>
      expect(mockMutations.cancelCycle).toHaveBeenCalledWith({ cycleId: 'cycle-active' }),
    );
    expect(toast.success).toHaveBeenCalledWith('performance.cycleCancelled');
  });

  it('shows cycle status badges for every known status', () => {
    render(<PerformanceClient />);
    fireEvent.click(screen.getByText('performance.tabs.cycles'));
    const badges = screen.getAllByTestId('badge');
    const labels = badges.map((b) => b.textContent);
    expect(labels).toContain('performance.status.draft');
    expect(labels).toContain('performance.status.active');
    expect(labels).toContain('performance.status.completed');
  });

  // ── Results tab ─────────────────────────────────────────────────────────

  it('lists completed and active cycles with summary cards', () => {
    render(<PerformanceClient />);
    fireEvent.click(screen.getByText('performance.tabs.results'));
    const resultsTab = screen.getByTestId('tab-results');
    expect(within(resultsTab).getByText('Q1 Review')).toBeInTheDocument();
    expect(within(resultsTab).getByText('Q2 Review')).toBeInTheDocument();
    expect(within(resultsTab).queryByText('Q3 Review')).not.toBeInTheDocument(); // draft excluded
    expect(within(resultsTab).getAllByText('Bob Smith').length).toBeGreaterThan(0);
    expect(within(resultsTab).getAllByText(/4.1\/5/).length).toBeGreaterThan(0);
  });

  it('shows the empty-summaries hint in a summary card', () => {
    mockQueries.getCycleSummary = { summaries: [] };
    render(<PerformanceClient />);
    fireEvent.click(screen.getByText('performance.tabs.results'));
    const resultsTab = screen.getByTestId('tab-results');
    // one hint per summary card (completed + active)
    expect(within(resultsTab).getAllByText('performance.noResults').length).toBeGreaterThan(0);
  });

  it('opens the results dialog from a summary row', () => {
    render(<PerformanceClient />);
    fireEvent.click(screen.getByText('performance.tabs.results'));
    const resultsTab = screen.getByTestId('tab-results');
    fireEvent.click(within(resultsTab).getAllByText('Bob Smith')[0]);
    const dialog = screen.getByTestId('dialog');
    expect(within(dialog).getByText('4.2')).toBeInTheDocument();
    expect(within(dialog).getByText('Quality of Work')).toBeInTheDocument();
    expect(within(dialog).getByText('performance.reviewType.self')).toBeInTheDocument();
    expect(within(dialog).getByText('performance.reviewType.manager')).toBeInTheDocument();
    expect(within(dialog).getByText(/performance.reviewType.peer/)).toBeInTheDocument();
  });

  it('shows the peer-anonymity notice when the peer threshold is not met', () => {
    mockQueries.getRevieweeResults = {
      ...mockResults,
      peerReviews: null,
      peerCount: 2,
      peerThreshold: 3,
    };
    render(<PerformanceClient />);
    fireEvent.click(screen.getByText('performance.tabs.results'));
    const resultsTab = screen.getByTestId('tab-results');
    fireEvent.click(within(resultsTab).getAllByText('Bob Smith')[0]);
    const dialog = screen.getByTestId('dialog');
    expect(within(dialog).getByText('performance.peerAnonymityNotMet')).toBeInTheDocument();
    expect(within(dialog).queryByText('performance.reviewType.peer')).not.toBeInTheDocument();
  });

  it('renders nothing when the results query is still loading', () => {
    mockQueries.getRevieweeResults = undefined;
    render(<PerformanceClient />);
    fireEvent.click(screen.getByText('performance.tabs.results'));
    const resultsTab = screen.getByTestId('tab-results');
    fireEvent.click(within(resultsTab).getAllByText('Bob Smith')[0]);
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('closes the results dialog', () => {
    render(<PerformanceClient />);
    fireEvent.click(screen.getByText('performance.tabs.results'));
    const resultsTab = screen.getByTestId('tab-results');
    fireEvent.click(within(resultsTab).getAllByText('Bob Smith')[0]);
    fireEvent.click(screen.getByTestId('dialog-close'));
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });
});
