/**
 * Tests for PositionsClient — the positions page with grid/list views,
 * search, stats, delete, and the real 4-step PositionWizard (details →
 * classification → compensation → review) for create and edit.
 *
 * Covers: auth gate, loading skeletons, stats cards, Add-button role gating,
 * search by title/description/level with no-results, grid/list rendering,
 * navigation on card click, delete confirm/cancel/error, the full wizard
 * lifecycle (validation gating, department select, level cards, salary input,
 * review summary, create/update payloads, salary sanity check, cancel,
 * mutation errors) and draft restore/start-over.
 *
 * Mocks: convex/react (useQuery/useMutation keyed by _name), generated api,
 * auth store (selector-based) + zustand/shallow identity, useSelectedOrganization,
 * useMediaQuery, next/navigation router, sonner, the three wizard step
 * components (real controlled inputs wired to stepData), select + dialog,
 * useWizardDraft (controllable), WizardDraftNotice, cssMotion, SkeletonTable,
 * ShieldLoader. The Wizard component itself runs for real.
 */

import React from 'react';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: any) => (typeof fallback === 'string' ? fallback : key),
    i18n: { language: 'en' },
  }),
}));

// ── Convex ───────────────────────────────────────────────────────────────────
const mockMutations: Record<string, jest.Mock> = {};
const mockQueries: Record<string, any> = {};
jest.mock('convex/react', () => ({
  useMutation: (m: any) => mockMutations[m?._name] ?? jest.fn(),
  useQuery: (q: any) => (q?._name in mockQueries ? mockQueries[q._name] : undefined),
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    positions: {
      list: { _name: 'positions.list' },
      create: { _name: 'positions.create' },
      update: { _name: 'positions.update' },
      remove: { _name: 'positions.remove' },
    },
    departments: {
      list: { _name: 'departments.list' },
    },
  },
}));

// ── Auth / org / router ──────────────────────────────────────────────────────
let mockUser: Record<string, unknown> | null = { id: 'u1', role: 'admin' };
let mockIsAuthenticated = true;
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector: any) =>
    selector({ user: mockUser, isAuthenticated: mockIsAuthenticated }),
}));

jest.mock('zustand/shallow', () => ({
  useShallow: (selector: any) => selector,
}));

let mockOrgId: string | null = 'org-1';
jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => mockOrgId,
}));

jest.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}));

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// ── Toast ────────────────────────────────────────────────────────────────────
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));
import { toast } from 'sonner';

// ── Draft (controllable) ─────────────────────────────────────────────────────
let mockDraft: { restored: boolean; restoredStep: number; clearDraft: jest.Mock } = {
  restored: false,
  restoredStep: 0,
  clearDraft: jest.fn(),
};
jest.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: (opts: any) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    React.useEffect(() => {
      if (mockDraft.restored) {
        opts.onRestore?.(
          {
            title: 'Restored Role',
            description: '',
            departmentId: 'd1',
            level: 'Mid',
            salaryMin: '',
            salaryMax: '',
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
  WizardDraftNotice: ({ show, onReset }: any) =>
    show ? (
      <div data-testid="draft-notice">
        <button type="button" onClick={onReset}>
          Start over
        </button>
      </div>
    ) : null,
}));

// ── Wizard step components (real controlled inputs) ───────────────────────────
jest.mock('@/components/ui/wizard-step-components', () => ({
  TextInputStep: ({ stepData, updateStepData, field, label, placeholder, type, required }: any) => (
    <div>
      <label htmlFor={`step-${field}`}>
        {label}
        {required && ' *'}
      </label>
      <input
        id={`step-${field}`}
        data-testid={`step-${field}`}
        type={type || 'text'}
        placeholder={placeholder}
        value={String(stepData?.[field] ?? '')}
        onChange={(e: any) => updateStepData(field, e.target.value)}
      />
    </div>
  ),
  TextareaStep: ({ stepData, updateStepData, field, label, placeholder, required }: any) => (
    <div>
      <label htmlFor={`step-${field}`}>
        {label}
        {required && ' *'}
      </label>
      <textarea
        id={`step-${field}`}
        data-testid={`step-${field}`}
        placeholder={placeholder}
        value={String(stepData?.[field] ?? '')}
        onChange={(e: any) => updateStepData(field, e.target.value)}
      />
    </div>
  ),
  CardSelectionStep: ({ stepData, updateStepData, field, label, options }: any) => (
    <div>
      <label>{label}</label>
      <div>
        {options.map((opt: any) => (
          <button
            key={opt.value}
            type="button"
            data-testid={`step-${field}-${opt.value}`}
            onClick={() => updateStepData(field, opt.value)}
          >
            {opt.title}
          </button>
        ))}
      </div>
    </div>
  ),
}));

// ── Select / Dialog / motion / skeleton ──────────────────────────────────────
jest.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: any) => (
    <select
      data-testid="ui-select"
      data-value={value ?? ''}
      value={value ?? ''}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder ?? ''}</span>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, children }: any) =>
    open ? <div data-testid="wizard-dialog">{children}</div> : null,
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <h2>{children}</h2>,
  SheetDescription: ({ children }: any) => <p>{children}</p>,
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: { div: ({ children, ...props }: any) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

jest.mock('@/components/ui/skeleton', () => ({
  SkeletonTable: ({ rows }: any) => <div data-testid="skeleton-table">{String(rows)}</div>,
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: ({ message }: any) => <div data-testid="shield-loader">{message}</div>,
}));

// ── Component + fixtures ─────────────────────────────────────────────────────
import PositionsClient from '@/components/employees/PositionsClient';

const makePos = (overrides: Record<string, any> = {}) => ({
  _id: 'pos-1',
  title: 'Backend Engineer',
  description: 'Build APIs and services',
  departmentId: 'd1',
  level: 'Senior',
  salaryMin: 50000,
  salaryMax: 80000,
  employeeCount: 3,
  ...overrides,
});

const makeDept = (overrides: Record<string, any> = {}) => ({
  _id: 'd1',
  name: 'Engineering',
  description: 'Eng',
  color: '#10b981',
  ...overrides,
});

function seed({
  positions = [makePos()],
  departments = [makeDept()],
}: { positions?: any[]; departments?: any[] } = {}) {
  mockQueries['positions.list'] = positions;
  mockQueries['departments.list'] = departments;
}

function renderPage() {
  return render(<PositionsClient />);
}

/** Finds a page button by its lucide icon class, e.g. the edit/delete/list toggles.
 *  Edit2 renders as "lucide-pen" in the pinned lucide-react version. */
function actionButton(iconClass: string) {
  return screen.getAllByRole('button').find((b) => b.querySelector(`svg.${iconClass}`))!;
}

describe('PositionsClient — auth & loading', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', role: 'admin' };
    mockIsAuthenticated = true;
    mockOrgId = 'org-1';
    mockDraft = { restored: false, restoredStep: 0, clearDraft: jest.fn() };
    seed();
  });

  it('shows the login-required loader when not authenticated', () => {
    mockIsAuthenticated = false;
    renderPage();
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('shows skeletons while positions/departments are loading', () => {
    mockQueries['positions.list'] = undefined;
    mockQueries['departments.list'] = undefined;
    renderPage();
    expect(screen.getAllByTestId('skeleton-table').length).toBeGreaterThan(0);
  });

  it('renders header, stats cards and positions count for admin', () => {
    seed({
      positions: [
        makePos({ salaryMin: 60000, salaryMax: 100000 }),
        makePos({
          _id: 'pos-2',
          title: 'QA',
          salaryMin: 40000,
          salaryMax: 60000,
          employeeCount: 2,
        }),
      ],
    });
    renderPage();
    // header title + stats card title
    expect(screen.getAllByText('nav.employees.positions').length).toBeGreaterThan(0);
    // total positions card + header count
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    // total employees = 3 + 2 = 5
    expect(screen.getByText('5')).toBeInTheDocument();
    // avg salary = ((60000+100000)/2 + (40000+60000)/2) / 2 = (80000+50000)/2 = 65000 → $65k
    expect(screen.getByText('$65k')).toBeInTheDocument();
  });

  it('hides the Add button for employee role', () => {
    mockUser = { id: 'u1', role: 'employee' };
    renderPage();
    expect(screen.queryByText('common.add')).not.toBeInTheDocument();
  });

  it('queries with an empty org payload for superadmin without org selection', () => {
    mockOrgId = null;
    mockUser = { id: 's1', role: 'superadmin' };
    renderPage();
    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
  });

  it('renders empty state when no positions exist', () => {
    seed({ positions: [] });
    renderPage();
    expect(screen.getByText('common.noResults')).toBeInTheDocument();
  });
});

describe('PositionsClient — search & views', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', role: 'admin' };
    mockOrgId = 'org-1';
    seed({
      positions: [
        makePos(),
        makePos({
          _id: 'pos-2',
          title: 'QA Engineer',
          description: 'Manual testing',
          level: 'Mid',
          salaryMin: 30000,
          salaryMax: 45000,
          employeeCount: 2,
        }),
      ],
    });
  });

  it('filters by title (case-insensitive)', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('common.search'), { target: { value: 'qa' } });
    expect(screen.getByText('QA Engineer')).toBeInTheDocument();
    expect(screen.queryByText('Backend Engineer')).not.toBeInTheDocument();
  });

  it('filters by description', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('common.search'), { target: { value: 'APIs' } });
    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
    expect(screen.queryByText('QA Engineer')).not.toBeInTheDocument();
  });

  it('filters by level', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('common.search'), { target: { value: 'senior' } });
    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
    expect(screen.queryByText('QA Engineer')).not.toBeInTheDocument();
  });

  it('shows the no-results block for an unmatched query', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('common.search'), { target: { value: 'zzz' } });
    expect(screen.getByText('common.noResults')).toBeInTheDocument();
  });

  it('clearing the query restores the full list', () => {
    renderPage();
    const search = screen.getByPlaceholderText('common.search');
    fireEvent.change(search, { target: { value: 'qa' } });
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText('QA Engineer')).toBeInTheDocument();
  });

  it('renders grid cards with dept name, level, salary and employee count', () => {
    renderPage();
    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
    expect(screen.getAllByText('Engineering').length).toBeGreaterThan(0);
    expect(screen.getByText('Senior')).toBeInTheDocument();
    expect(screen.getByText('$50k - $80k')).toBeInTheDocument();
  });

  it('navigates to the position detail on card click', () => {
    renderPage();
    fireEvent.click(screen.getByText('Backend Engineer').closest('div')!);
    expect(mockPush).toHaveBeenCalledWith('/employees/positions/pos-1');
  });

  it('switches to list view', () => {
    renderPage();
    fireEvent.click(actionButton('lucide-list'));
    expect(screen.getByText('QA Engineer')).toBeInTheDocument();
    // list rows render the salary compactly and dept · level line
    expect(screen.getByText(/Engineering · Mid/)).toBeInTheDocument();
    expect(screen.getByText('$30k')).toBeInTheDocument();
    expect(screen.getByText('QA Engineer').closest('div')).not.toBeNull();
  });

  it('switches back to grid view with the grid toggle', () => {
    renderPage();
    fireEvent.click(actionButton('lucide-list'));
    expect(screen.getByText(/Engineering · Mid/)).toBeInTheDocument();
    fireEvent.click(actionButton('lucide-layout-grid'));
    // grid cards show the full salary range format
    expect(screen.getByText('$50k - $80k')).toBeInTheDocument();
  });

  it('navigates to the detail page from a list row', () => {
    renderPage();
    fireEvent.click(actionButton('lucide-list'));
    fireEvent.click(screen.getByText('QA Engineer').closest('div')!);
    expect(mockPush).toHaveBeenCalledWith('/employees/positions/pos-2');
  });

  it('opens the update wizard from the list view edit button', () => {
    renderPage();
    fireEvent.click(actionButton('lucide-list'));
    fireEvent.click(actionButton('lucide-pen'));
    expect(screen.getByTestId('wizard-dialog')).toBeInTheDocument();
    expect(screen.getByText('Update Position')).toBeInTheDocument();
  });

  it('deletes a position from the list view', async () => {
    window.confirm = jest.fn(() => true);
    mockMutations['positions.remove'] = jest.fn().mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(actionButton('lucide-list'));
    fireEvent.click(actionButton('lucide-trash-2'));
    await waitFor(() => expect(mockMutations['positions.remove']).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalled();
  });

  it('renders card without level/salary rows when fields are missing', () => {
    seed({
      positions: [makePos({ level: null, salaryMin: null, salaryMax: null, departmentId: null })],
      departments: [],
    });
    renderPage();
    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
    // default color fallback — no crash, dept name empty
    expect(screen.queryByText('Engineering')).not.toBeInTheDocument();
  });

  it('falls back for missing departments, colors and employee counts', () => {
    seed({
      positions: [makePos({ _id: 'pos-x', departmentId: 'ghost', employeeCount: undefined })],
      departments: [makeDept({ _id: 'd2', color: undefined, description: undefined })],
    });
    renderPage();
    // employee count falls back to 0 in the stats row and the card row
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    // ghost department id → empty dept name, default gray color — no crash
    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
    expect(screen.queryByText('Engineering')).not.toBeInTheDocument();
    // same fallbacks in list view
    fireEvent.click(actionButton('lucide-list'));
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });
});

describe('PositionsClient — delete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', role: 'admin' };
    mockOrgId = 'org-1';
    seed();
    mockMutations['positions.remove'] = jest.fn().mockResolvedValue(undefined);
  });

  it('deletes after confirm and shows success toast', async () => {
    window.confirm = jest.fn(() => true);
    renderPage();
    fireEvent.click(actionButton('lucide-trash-2'));
    await waitFor(() =>
      expect(mockMutations['positions.remove']).toHaveBeenCalledWith({ id: 'pos-1' }),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it('does not delete when confirm is declined', () => {
    window.confirm = jest.fn(() => false);
    renderPage();
    fireEvent.click(actionButton('lucide-trash-2'));
    expect(mockMutations['positions.remove']).not.toHaveBeenCalled();
  });

  it('shows error toast when deletion fails', async () => {
    window.confirm = jest.fn(() => true);
    mockMutations['positions.remove'] = jest.fn().mockRejectedValue(new Error('boom'));
    renderPage();
    fireEvent.click(actionButton('lucide-trash-2'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});

describe('PositionsClient — wizard (create)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', role: 'admin' };
    mockOrgId = 'org-1';
    mockDraft = { restored: false, restoredStep: 0, clearDraft: jest.fn() };
    seed();
    mockMutations['positions.create'] = jest.fn().mockResolvedValue('pos-new');
    mockMutations['positions.update'] = jest.fn().mockResolvedValue('pos-1');
  });

  it('opens the create wizard with Next disabled until a title is entered', () => {
    renderPage();
    fireEvent.click(screen.getByText('common.add'));
    const dialog = screen.getByTestId('wizard-dialog');
    expect(within(dialog).getByText('Create Position')).toBeInTheDocument();
    const next = within(dialog).getByRole('button', { name: /Next/ });
    expect(next).toBeDisabled();
    fireEvent.change(screen.getByTestId('step-title'), { target: { value: 'DevOps' } });
    expect(within(dialog).getByRole('button', { name: /Next/ })).toBeEnabled();
  });

  it('walks through classification, compensation and submits the create payload', async () => {
    renderPage();
    fireEvent.click(screen.getByText('common.add'));
    const dialog = screen.getByTestId('wizard-dialog');

    fireEvent.change(screen.getByTestId('step-title'), { target: { value: 'DevOps Engineer' } });
    fireEvent.change(screen.getByTestId('step-description'), {
      target: { value: 'Infra automation' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));

    // classification: department select + level card
    fireEvent.change(screen.getByTestId('ui-select'), { target: { value: 'd1' } });
    fireEvent.click(screen.getByTestId('step-level-Senior'));
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));

    // compensation
    fireEvent.change(screen.getByTestId('step-salaryMin'), { target: { value: '60000' } });
    fireEvent.change(screen.getByTestId('step-salaryMax'), { target: { value: '90000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));

    // review summary (page behind the dialog also shows the same dept/level)
    expect(screen.getByText('DevOps Engineer')).toBeInTheDocument();
    expect(screen.getByText('Infra automation')).toBeInTheDocument();
    expect(screen.getAllByText('Engineering').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Senior').length).toBeGreaterThan(0);
    expect(screen.getByText('$60,000 - $90,000')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Position' }));

    await waitFor(() =>
      expect(mockMutations['positions.create']).toHaveBeenCalledWith({
        organizationId: 'org-1',
        title: 'DevOps Engineer',
        description: 'Infra automation',
        level: 'Senior',
        salaryMin: 60000,
        salaryMax: 90000,
        departmentId: 'd1',
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('positionWizard.toast.createSuccess');
    await waitFor(() => expect(screen.queryByTestId('wizard-dialog')).not.toBeInTheDocument());
  });

  it('submits with empty optional fields as undefined and review shows not-specified', async () => {
    renderPage();
    fireEvent.click(screen.getByText('common.add'));
    const dialog = screen.getByTestId('wizard-dialog');
    fireEvent.change(screen.getByTestId('step-title'), { target: { value: 'Junior' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));
    fireEvent.change(screen.getByTestId('step-salaryMin'), { target: { value: '30000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));
    // dept, level and salary rows all show not-specified
    expect(screen.getAllByText('positionWizard.steps.review.notSpecified').length).toBeGreaterThan(
      0,
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Position' }));
    await waitFor(() =>
      expect(mockMutations['positions.create']).toHaveBeenCalledWith({
        organizationId: 'org-1',
        title: 'Junior',
        description: undefined,
        level: undefined,
        salaryMin: 30000,
        salaryMax: undefined,
        departmentId: undefined,
      }),
    );
  });

  it('blocks submit when salary max is not greater than min', async () => {
    renderPage();
    fireEvent.click(screen.getByText('common.add'));
    const dialog = screen.getByTestId('wizard-dialog');
    fireEvent.change(screen.getByTestId('step-title'), { target: { value: 'Weird' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));
    fireEvent.change(screen.getByTestId('step-salaryMin'), { target: { value: '90000' } });
    fireEvent.change(screen.getByTestId('step-salaryMax'), { target: { value: '50000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Position' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('positionWizard.toast.salaryInvalid'),
    );
    expect(mockMutations['positions.create']).not.toHaveBeenCalled();
  });

  it('closes via cancel', () => {
    renderPage();
    fireEvent.click(screen.getByText('common.add'));
    const dialog = screen.getByTestId('wizard-dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('wizard-dialog')).not.toBeInTheDocument();
  });

  it('aborts the submit without an organization selected', async () => {
    mockOrgId = null;
    renderPage();
    fireEvent.click(screen.getByText('common.add'));
    const dialog = screen.getByTestId('wizard-dialog');
    fireEvent.change(screen.getByTestId('step-title'), { target: { value: 'Orphan Role' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Position' }));
    // guard: handleSubmit returns early when no org is selected
    await waitFor(() => expect(mockMutations['positions.create']).not.toHaveBeenCalled());
    expect(mockMutations['positions.create']).not.toHaveBeenCalled();
  });

  it('shows error toast when create fails', async () => {
    mockMutations['positions.create'] = jest.fn().mockRejectedValue(new Error('boom'));
    renderPage();
    fireEvent.click(screen.getByText('common.add'));
    const dialog = screen.getByTestId('wizard-dialog');
    fireEvent.change(screen.getByTestId('step-title'), { target: { value: 'Ops' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Position' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('positionWizard.toast.error'));
  });

  it('restores a draft and start-over resets to the first step', () => {
    mockDraft = { restored: true, restoredStep: 1, clearDraft: jest.fn() };
    renderPage();
    fireEvent.click(screen.getByText('common.add'));
    const dialog = screen.getByTestId('wizard-dialog');
    // draft notice shown, restored data lands on classification step
    expect(within(dialog).getByTestId('draft-notice')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Start over/ }));
    expect(mockDraft.clearDraft).toHaveBeenCalled();
    // back on the details step — title input empty again
    expect(screen.getByTestId('step-title')).toHaveValue('');
  });
});

describe('PositionsClient — wizard (edit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', role: 'admin' };
    mockOrgId = 'org-1';
    mockDraft = { restored: false, restoredStep: 0, clearDraft: jest.fn() };
    seed();
    mockMutations['positions.update'] = jest.fn().mockResolvedValue('pos-1');
  });

  it('prefills the form and submits the update payload', async () => {
    renderPage();
    fireEvent.click(actionButton('lucide-pen'));
    const dialog = screen.getByTestId('wizard-dialog');
    expect(within(dialog).getByText('Update Position')).toBeInTheDocument();
    expect(screen.getByTestId('step-title')).toHaveValue('Backend Engineer');

    // Next is enabled immediately (prefilled title) → walk to review
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));
    expect(screen.getByText('$50,000 - $80,000')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Update Position' }));
    await waitFor(() =>
      expect(mockMutations['positions.update']).toHaveBeenCalledWith({
        id: 'pos-1',
        title: 'Backend Engineer',
        description: 'Build APIs and services',
        level: 'Senior',
        salaryMin: 50000,
        salaryMax: 80000,
        departmentId: 'd1',
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('positionWizard.toast.updateSuccess');
    await waitFor(() => expect(screen.queryByTestId('wizard-dialog')).not.toBeInTheDocument());
  });

  it('updates with blank optional fields as undefined', async () => {
    seed({
      positions: [
        makePos({
          description: undefined,
          departmentId: undefined,
          level: undefined,
          salaryMin: undefined,
          salaryMax: undefined,
        }),
      ],
    });
    renderPage();
    fireEvent.click(actionButton('lucide-pen'));
    const dialog = screen.getByTestId('wizard-dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update Position' }));
    await waitFor(() =>
      expect(mockMutations['positions.update']).toHaveBeenCalledWith({
        id: 'pos-1',
        title: 'Backend Engineer',
        description: undefined,
        level: undefined,
        salaryMin: undefined,
        salaryMax: undefined,
        departmentId: undefined,
      }),
    );
  });

  it('shows error toast when update fails', async () => {
    mockMutations['positions.update'] = jest.fn().mockRejectedValue(new Error('boom'));
    renderPage();
    fireEvent.click(actionButton('lucide-pen'));
    const dialog = screen.getByTestId('wizard-dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Next/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update Position' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('positionWizard.toast.error'));
  });
});
