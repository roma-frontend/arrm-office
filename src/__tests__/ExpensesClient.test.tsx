/**
 * Tests for ExpensesClient — the expense management dashboard.
 *
 * Mocks: convex/react (useQuery keyed by ref _name with args recording,
 * useMutation lazily creating jest.fn()s), react-i18next with a tMode flag
 * ('fallback' returns the fallback-string or key, 'empty' returns '' so the
 * `||` fallback branches in getStatusBadge/getCategoryLabel execute), theme
 * (mutable resolvedTheme), auth store (mutable user), selected-org hook,
 * generated api, UI primitives (Card/Badge/Button/Input/StatsCard + context
 * Tabs and Select mocks), sonner-free (no toasts used), lucide icons keyed by
 * name, dynamic-imports chart stubs (invoking label/formatter/legend props),
 * and the four wizards as prop-capturing stubs.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { getChartTheme } from '@/lib/chart-theme';

let tMode: 'fallback' | 'empty' = 'fallback';
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => {
      if (tMode === 'empty') return '';
      return typeof fallback === 'string' ? fallback : key;
    },
  }),
}));

let mockTheme: string = 'light';
jest.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ resolvedTheme: mockTheme }),
}));

let mockUser: any = { id: 'u1', role: 'admin', organizationId: 'org-1' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

let mockSelectedOrg: string | null = null;
jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => mockSelectedOrg,
}));

let queryResults: Record<string, unknown> = {};
let queryCalls: Record<string, unknown[]> = {};
let mutationImpls: Record<string, jest.Mock> = {};
jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }, args?: unknown) => {
    const name = ref?._name ?? '';
    queryCalls[name] = [...(queryCalls[name] ?? []), args];
    return queryResults[name];
  },
  useMutation: (ref: { _name?: string }) => {
    const name = ref?._name ?? '';
    mutationImpls[name] = mutationImpls[name] ?? jest.fn();
    return mutationImpls[name];
  },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    expenses: {
      listExpenses: { _name: 'listExpenses' },
      getExpenseSummary: { _name: 'getExpenseSummary' },
      listExpenseCategories: { _name: 'listExpenseCategories' },
      getExpensePolicy: { _name: 'getExpensePolicy' },
      listExpenseReports: { _name: 'listExpenseReports' },
      approveExpense: { _name: 'approveExpense' },
      rejectExpense: { _name: 'rejectExpense' },
      deleteExpense: { _name: 'deleteExpense' },
    },
  },
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  CardContent: ({ children, className }: any) => (
    <div data-testid="card-content" className={className}>
      {children}
    </div>
  ),
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span data-testid="badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/dashboard/StatsCard', () => ({
  StatsCard: ({ title, value, color }: any) => (
    <div data-testid="stats-card" data-color={color}>
      {title}: {value}
    </div>
  ),
}));

jest.mock('lucide-react', () => {
  const names = [
    'DollarSign',
    'AlertCircle',
    'CheckCircle',
    'Clock',
    'Plus',
    'Filter',
    'Search',
    'BarChart3',
    'Receipt',
    'FileText',
    'Calendar',
    'X',
  ];
  const out: Record<string, (props: any) => React.ReactElement> = {};
  names.forEach((n) => {
    out[n] = (props: any) => <span data-testid={`icon-${n}`} {...props} />;
  });
  return out;
});

// ── Context-based Tabs mock ────────────────────────────────────────────────
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
      const ctx = ReactMod.useContext(TabsCtx);
      return (
        <button type="button" onClick={() => ctx.setValue(value)} data-value={value}>
          {children}
        </button>
      );
    },
    TabsContent: ({ value, children }: any) => {
      const ctx = ReactMod.useContext(TabsCtx);
      return ctx.value === value ? <div data-testid={`tab-${value}`}>{children}</div> : null;
    },
  };
});

// ── Context-based Select mock ──────────────────────────────────────────────
jest.mock('@/components/ui/select', () => {
  const ReactMod = require('react');
  const SelCtx = ReactMod.createContext({ value: '', setValue: (_v: string) => {} });
  return {
    Select: ({ value, onValueChange, children }: any) => {
      const [internal, setInternal] = ReactMod.useState(value ?? '');
      const active = value !== undefined ? value : internal;
      const setValue = (v: string) => {
        setInternal(v);
        onValueChange?.(v);
      };
      return <SelCtx.Provider value={{ value: active, setValue }}>{children}</SelCtx.Provider>;
    },
    SelectTrigger: ({ children }: any) => <button type="button">{children}</button>,
    SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
    SelectContent: ({ children }: any) => <div data-testid="select-content">{children}</div>,
    SelectItem: ({ value, children }: any) => {
      const ctx = ReactMod.useContext(SelCtx);
      return (
        <button type="button" data-value={value} onClick={() => ctx.setValue(value)}>
          {children}
        </button>
      );
    },
  };
});

// ── Chart mocks: invoke label / formatter / legend props so branches run ───
jest.mock('@/lib/dynamic-imports', () => {
  const MockResponsiveContainer = ({ children, ...props }: any) => (
    <div data-testid="responsive-container" {...props}>
      {children}
    </div>
  );
  const MockBarChart = ({ data, ...props }: any) => (
    <div data-testid="bar-chart" data-chart={JSON.stringify(data)} {...props} />
  );
  const MockPieChart = ({ children }: any) => <div data-testid="pie-chart">{children}</div>;
  const MockBar = () => <div data-testid="bar" />;
  const MockPie = ({ data, label, children }: any) => {
    // Cover both label branches: value > 0 and value === 0, plus the
    // `??` nullish sides (entry without value/name/percent).
    label?.({ name: 'A', value: 5, percent: 0.25 });
    label?.({ name: 'B', value: 0, percent: 0 });
    label?.({ name: 'C' }); // no value → covers `entry.value ?? 0` nullish side
    label?.({ value: 7 }); // no name/percent → covers both `??` nullish sides
    return (
      <div data-testid="pie" data-chart={JSON.stringify(data)}>
        {children}
      </div>
    );
  };
  const MockCell = (props: any) => <div data-testid="cell" {...props} />;
  const MockXAxis = () => <div data-testid="x-axis" />;
  const MockYAxis = () => <div data-testid="y-axis" />;
  const MockCartesianGrid = () => <div data-testid="grid" />;
  const MockTooltip = ({ contentStyle, formatter }: any) => {
    formatter?.(42, 'value');
    return (
      <div data-testid="tooltip" data-bg={contentStyle?.backgroundColor}>
        tooltip
      </div>
    );
  };
  const MockLegend = ({ formatter }: any) => {
    formatter?.('Approved');
    return <div data-testid="legend">legend</div>;
  };
  return {
    ResponsiveContainer: MockResponsiveContainer,
    BarChart: MockBarChart,
    Bar: MockBar,
    XAxis: MockXAxis,
    YAxis: MockYAxis,
    CartesianGrid: MockCartesianGrid,
    Tooltip: MockTooltip,
    PieChart: MockPieChart,
    Pie: MockPie,
    Cell: MockCell,
    Legend: MockLegend,
  };
});

let wizardProps: Record<string, any> = {};
jest.mock('@/components/expenses/ExpenseWizard', () => ({
  __esModule: true,
  // onSuccess is invoked at render time purely to execute the component's
  // `onSuccess={() => {}}` arrow (FNDA coverage). Safe today because the
  // component passes a no-op; keep it a no-op in the component.
  default: (props: any) => {
    wizardProps.expense = props;
    props.onSuccess?.();
    return <div data-testid="expense-wizard">expense wizard</div>;
  },
}));
jest.mock('@/components/expenses/CategoryWizard', () => ({
  __esModule: true,
  default: (props: any) => {
    wizardProps.category = props;
    props.onSuccess?.();
    return <div data-testid="category-wizard">category wizard</div>;
  },
}));
jest.mock('@/components/expenses/ReportWizard', () => ({
  __esModule: true,
  default: (props: any) => {
    wizardProps.report = props;
    props.onSuccess?.();
    return <div data-testid="report-wizard">report wizard</div>;
  },
}));
jest.mock('@/components/expenses/PolicyWizard', () => ({
  __esModule: true,
  default: (props: any) => {
    wizardProps.policy = props;
    props.onSuccess?.();
    return <div data-testid="policy-wizard">policy wizard</div>;
  },
}));

import ExpensesClient from '@/components/expenses/ExpensesClient';

const EXPENSES: any[] = [
  {
    _id: 'e1',
    title: 'Taxi to airport',
    category: 'transport',
    amount: 5000,
    currency: 'AMD',
    expenseDate: 1755000000000,
    status: 'submitted',
    createdBy: 'u2',
    userName: 'Bob',
  },
  {
    _id: 'e2',
    title: 'Team lunch',
    category: 'meals',
    amount: 12000,
    currency: 'AMD',
    expenseDate: 1754000000000,
    status: 'approved',
    createdBy: 'u1',
    userName: 'Alice',
  },
  {
    _id: 'e3',
    title: 'Hotel stay',
    category: 'accommodation',
    amount: 60000,
    currency: 'AMD',
    expenseDate: 1753000000000,
    status: 'draft',
    createdBy: 'u2',
    userName: 'Bob',
  },
  {
    _id: 'e4',
    title: 'Software license',
    category: 'software',
    amount: 99,
    currency: 'USD',
    expenseDate: 1752000000000,
    status: 'under_review',
    createdBy: 'u3',
    userName: 'Carol',
  },
  {
    _id: 'e5',
    title: 'Rejected flight',
    category: 'travel',
    amount: 20000,
    currency: 'AMD',
    expenseDate: 1751000000000,
    status: 'rejected',
    createdBy: 'u1',
    userName: 'Alice',
  },
  {
    _id: 'e6',
    title: 'Reimbursed taxi',
    category: 'other',
    amount: 3000,
    currency: 'AMD',
    expenseDate: 1750000000000,
    status: 'reimbursed',
    createdBy: 'u1',
    userName: 'Alice',
  },
  {
    _id: 'e7',
    title: 'Cancelled course',
    category: 'training',
    amount: 1000,
    currency: 'AMD',
    expenseDate: 1749000000000,
    status: 'cancelled',
    createdBy: 'u1',
    userName: 'Alice',
  },
  {
    _id: 'e8',
    title: 'Mystery expense',
    category: 'unknown_cat',
    amount: 700,
    currency: 'AMD',
    expenseDate: 1748000000000,
    status: 'mystery',
    createdBy: 'u1',
    userName: 'Alice',
  },
];

const SUMMARY = {
  totalExpenses: 12,
  totalAmount: 150000,
  pendingApproval: 3,
  byStatus: { approved: 4, rejected: 0, draft: 5, submitted: 3 },
  byCategory: { travel: 2, meals: 1 },
};

const CATEGORIES: any[] = [
  {
    _id: 'c1',
    key: 'travel',
    description: 'Flights and hotels',
    isActive: true,
    dailyLimit: 30000,
    monthlyLimit: 200000,
    requiresReceipt: true,
    requiresApproval: false,
  },
  {
    _id: 'c2',
    key: 'meals',
    description: 'Food and drink',
    isActive: false,
    requiresReceipt: false,
    requiresApproval: true,
  },
];

const POLICY: any = {
  _id: 'p1',
  name: 'Travel Policy',
  description: 'Standard rules',
  isActive: true,
  autoApprovalLimit: 10000,
  managerApprovalLimit: 50000,
  directorApprovalLimit: 100000,
  receiptRequiredAbove: 25000,
  submissionDeadlineDays: 7,
};

const REPORTS: any[] = [
  {
    _id: 'r1',
    name: 'August Report',
    userName: 'Alice',
    expenseCount: 5,
    totalAmount: 100000,
    currency: 'AMD',
    periodStart: 1755000000000,
    periodEnd: 1758000000000,
    status: 'submitted',
  },
];

describe('ExpensesClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tMode = 'fallback';
    mockTheme = 'light';
    mockUser = { id: 'u1', role: 'admin', organizationId: 'org-1' };
    mockSelectedOrg = null;
    queryResults = {
      listExpenses: EXPENSES,
      getExpenseSummary: SUMMARY,
      listExpenseCategories: CATEGORIES,
      getExpensePolicy: POLICY,
      listExpenseReports: REPORTS,
    };
    queryCalls = {};
    mutationImpls = {};
    wizardProps = {};
  });

  const lastArgs = (name: string) => {
    const calls = queryCalls[name] ?? [];
    return calls[calls.length - 1];
  };

  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const rowOf = (title: string) => {
    const row = screen.getByText(title).closest('div')!.parentElement!.parentElement!;
    return row;
  };

  // ── Header & org gate ────────────────────────────────────────────────────

  it('renders the header for an admin with an organization', () => {
    render(<ExpensesClient />);
    expect(screen.getByText('Expense Management')).toBeInTheDocument();
    expect(screen.getByText('Track and manage company expenses')).toBeInTheDocument();
  });

  it('shows the select-organization card and skips queries without an org', () => {
    mockUser = { id: 'u1', role: 'admin' };
    render(<ExpensesClient />);
    expect(screen.getByText('common.selectOrganization')).toBeInTheDocument();
    expect(lastArgs('listExpenses')).toBe('skip');
    expect(lastArgs('getExpenseSummary')).toBe('skip');
    expect(lastArgs('listExpenseReports')).toBe('skip');
    expect(lastArgs('getExpensePolicy')).toBe('skip');
    expect(lastArgs('listExpenseCategories')).toBe('skip');
  });

  it('queries with an undefined org id for superadmins', () => {
    mockUser = { id: 'u1', role: 'superadmin', organizationId: 'org-1' };
    render(<ExpensesClient />);
    const args = lastArgs('listExpenses') as any;
    expect(args).toEqual({ organizationId: undefined });
  });

  it('prefers the selected organization over the user organization', () => {
    mockSelectedOrg = 'org-2';
    mockUser = { id: 'u1', role: 'admin', organizationId: 'org-1' };
    render(<ExpensesClient />);
    expect((lastArgs('listExpenses') as any).organizationId).toBe('org-2');
  });

  it('hides the whole dashboard body for non-admin employees', () => {
    mockUser = { id: 'u1', role: 'employee', organizationId: 'org-1' };
    render(<ExpensesClient />);
    expect(screen.getByText('Expense Management')).toBeInTheDocument();
    expect(screen.queryByText('expenses.totalExpenses')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tab-expenses')).not.toBeInTheDocument();
    expect(screen.queryByText('expenses.newExpense')).not.toBeInTheDocument();
  });

  // ── Stats cards ──────────────────────────────────────────────────────────

  it('renders the four stat cards with formatted currency', () => {
    render(<ExpensesClient />);
    expect(screen.getByText('expenses.totalExpenses: 12')).toBeInTheDocument();
    expect(screen.getByText('expenses.totalAmount: AMD 150,000')).toBeInTheDocument();
    expect(screen.getByText('expenses.pendingApproval: 3')).toBeInTheDocument();
    expect(screen.getByText('expenses.approved: 4')).toBeInTheDocument();
    expect(screen.getAllByTestId('stats-card').length).toBe(4);
  });

  it('defaults stat values to zero when the summary is pending', () => {
    queryResults.getExpenseSummary = undefined;
    render(<ExpensesClient />);
    expect(screen.getByText('expenses.totalExpenses: 0')).toBeInTheDocument();
    expect(screen.getByText('expenses.totalAmount: AMD 0')).toBeInTheDocument();
  });

  // ── Expenses list & filters ──────────────────────────────────────────────

  it('renders expense rows with currency, date, category label and status badge', () => {
    render(<ExpensesClient />);
    expect(screen.getByText('Taxi to airport')).toBeInTheDocument();
    expect(screen.getByText('AMD 5,000')).toBeInTheDocument();
    expect(screen.getByText(fmtDate(1755000000000))).toBeInTheDocument();
    // Appears in the expense row and in the category filter select.
    expect(screen.getAllByText('🚗 expenses.categoryNames.transport').length).toBeGreaterThan(0);
    expect(screen.getByText('$99')).toBeInTheDocument();
    // Status badges render the translated key with the matching variant.
    const badge = screen
      .getAllByTestId('badge')
      .find((b) => b.textContent === 'expenses.submitted');
    expect(badge?.getAttribute('data-variant')).toBe('warning');
    expect(
      screen
        .getAllByTestId('badge')
        .find((b) => b.textContent === 'expenses.rejected')
        ?.getAttribute('data-variant'),
    ).toBe('destructive');
    expect(
      screen
        .getAllByTestId('badge')
        .find((b) => b.textContent === 'expenses.draft')
        ?.getAttribute('data-variant'),
    ).toBe('secondary');
    expect(
      screen
        .getAllByTestId('badge')
        .find((b) => b.textContent === 'expenses.reimbursed')
        ?.getAttribute('data-variant'),
    ).toBe('success');
  });

  it('filters expenses by search query (title and user, case-insensitive)', () => {
    render(<ExpensesClient />);
    fireEvent.change(screen.getByPlaceholderText('expenses.searchPlaceholder'), {
      target: { value: 'bob' },
    });
    expect(screen.getByText('Taxi to airport')).toBeInTheDocument();
    expect(screen.getByText('Hotel stay')).toBeInTheDocument();
    expect(screen.queryByText('Team lunch')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('expenses.searchPlaceholder'), {
      target: { value: 'TEAM' },
    });
    expect(screen.getByText('Team lunch')).toBeInTheDocument();
    expect(screen.queryByText('Taxi to airport')).not.toBeInTheDocument();
  });

  it('filters expenses by category and status selects', () => {
    const { container } = render(<ExpensesClient />);
    const categorySelect = container.querySelectorAll('[data-testid="select-content"]')[0];
    const statusSelect = container.querySelectorAll('[data-testid="select-content"]')[1];

    // Category → travel.
    fireEvent.click(categorySelect.querySelector('[data-value="travel"]')!);
    expect(screen.getByText('Rejected flight')).toBeInTheDocument();
    expect(screen.queryByText('Team lunch')).not.toBeInTheDocument();

    // Status → approved (still under travel filter: none match).
    fireEvent.click(statusSelect.querySelector('[data-value="approved"]')!);
    expect(screen.queryByText('Rejected flight')).not.toBeInTheDocument();

    // Back to all categories (scoped to the category select), status approved.
    fireEvent.click(categorySelect.querySelector('[data-value="all"]')!);
    expect(screen.getByText('Team lunch')).toBeInTheDocument();
    expect(screen.queryByText('Taxi to airport')).not.toBeInTheDocument();
  });

  it('shows the empty state when filters match nothing', () => {
    queryResults.listExpenses = [];
    render(<ExpensesClient />);
    expect(screen.getByText('expenses.noExpenses')).toBeInTheDocument();
  });

  it('shows the empty state while expenses are pending', () => {
    queryResults.listExpenses = undefined;
    render(<ExpensesClient />);
    expect(screen.getByText('expenses.noExpenses')).toBeInTheDocument();
  });

  it('renders all ten category icons in the category filter', () => {
    const { container } = render(<ExpensesClient />);
    ['✈️', '🍽️', '🏨', '🚗', '📦', '💻', '📚', '🏥', '📱', '📋'].forEach((icon) => {
      expect(container.textContent).toContain(icon);
    });
  });

  // ── Approve / reject / delete ────────────────────────────────────────────

  it('approves a submitted expense owned by someone else', async () => {
    render(<ExpensesClient />);
    const row = rowOf('Taxi to airport');
    fireEvent.click(row.querySelector('button[data-variant="outline"]')!);
    await waitFor(() => {
      expect(mutationImpls.approveExpense).toHaveBeenCalledWith({
        expenseId: 'e1',
        reviewedBy: 'u1',
        reviewNotes: '',
      });
    });
  });

  it('rejects an under-review expense owned by someone else', async () => {
    render(<ExpensesClient />);
    const row = rowOf('Software license');
    fireEvent.click(row.querySelector('button[data-variant="destructive"]')!);
    await waitFor(() => {
      expect(mutationImpls.rejectExpense).toHaveBeenCalledWith({
        expenseId: 'e4',
        reviewedBy: 'u1',
        reviewNotes: 'Rejected',
      });
    });
  });

  it('deletes a draft expense', async () => {
    render(<ExpensesClient />);
    const row = rowOf('Hotel stay');
    fireEvent.click(row.querySelector('button[data-variant="outline"]')!);
    await waitFor(() => {
      expect(mutationImpls.deleteExpense).toHaveBeenCalledWith({ expenseId: 'e3' });
    });
  });

  it('hides approve/reject/delete controls for supervisors', () => {
    mockUser = { id: 'u1', role: 'supervisor', organizationId: 'org-1' };
    render(<ExpensesClient />);
    // Supervisor is admin-level (sees the dashboard) but cannot manage.
    expect(screen.getByText('expenses.totalExpenses: 12')).toBeInTheDocument();
    const row = rowOf('Taxi to airport');
    expect(row.querySelector('button[data-variant="outline"]')).toBeNull();
    // Wizard buttons on other tabs are canManage-gated.
    expect(screen.queryByText('expenses.newReport')).not.toBeInTheDocument();
  });

  it('hides approve/reject for expenses owned by the current user', () => {
    render(<ExpensesClient />);
    const row = rowOf('Team lunch'); // createdBy u1 == current user
    expect(row.querySelector('button')).toBeNull();
  });

  // ── Reports tab ──────────────────────────────────────────────────────────

  it('renders report cards on the reports tab', () => {
    render(<ExpensesClient />);
    fireEvent.click(screen.getByText('expenses.reports'));
    expect(screen.getByText('August Report')).toBeInTheDocument();
    expect(screen.getByText('Alice - 5 expenses.expenses')).toBeInTheDocument();
    expect(screen.getByText('AMD 100,000')).toBeInTheDocument();
    expect(
      screen.getByText(`${fmtDate(1755000000000)} - ${fmtDate(1758000000000)}`),
    ).toBeInTheDocument();
    expect(screen.getByText('expenses.newReport')).toBeInTheDocument();
  });

  it('shows the empty reports state', () => {
    queryResults.listExpenseReports = [];
    render(<ExpensesClient />);
    fireEvent.click(screen.getByText('expenses.reports'));
    expect(screen.getByText('expenses.noReports')).toBeInTheDocument();
  });

  // ── Categories tab ───────────────────────────────────────────────────────

  it('renders category cards with limits and active/inactive badges', () => {
    render(<ExpensesClient />);
    fireEvent.click(screen.getByText('expenses.categories'));
    expect(screen.getByText('Flights and hotels')).toBeInTheDocument();
    expect(screen.getByText('✈️ expenses.categoryNames.travel')).toBeInTheDocument();
    expect(screen.getByText('expenses.dailyLimit')).toBeInTheDocument();
    expect(screen.getByText('AMD 30,000')).toBeInTheDocument();
    expect(screen.getByText('expenses.monthlyLimit')).toBeInTheDocument();
    expect(screen.getByText('AMD 200,000')).toBeInTheDocument();
    // Rendered once per category card.
    expect(screen.getAllByText('expenses.requiresReceipt').length).toBeGreaterThan(0);
    expect(screen.getAllByText('expenses.requiresApproval').length).toBeGreaterThan(0);
    // Active and inactive badges both render.
    expect(
      screen
        .getAllByTestId('badge')
        .find((b) => b.textContent === 'common.active')
        ?.getAttribute('data-variant'),
    ).toBe('success');
    expect(
      screen
        .getAllByTestId('badge')
        .find((b) => b.textContent === 'common.inactive')
        ?.getAttribute('data-variant'),
    ).toBe('secondary');
    expect(screen.getByText('expenses.newCategory')).toBeInTheDocument();
  });

  it('hides limit rows when a category has no limits', () => {
    render(<ExpensesClient />);
    fireEvent.click(screen.getByText('expenses.categories'));
    // The inactive meals category has no daily/monthly limit rows.
    const mealsCard = screen.getByText('Food and drink').closest('[data-testid="card"]')!;
    expect(within(mealsCard as HTMLElement).queryByText('expenses.dailyLimit')).toBeNull();
  });

  it('shows the empty categories state', () => {
    queryResults.listExpenseCategories = [];
    render(<ExpensesClient />);
    fireEvent.click(screen.getByText('expenses.categories'));
    expect(screen.getByText('expenses.noCategories')).toBeInTheDocument();
  });

  // ── Policies tab ─────────────────────────────────────────────────────────

  it('renders the policy with limits and deadlines', () => {
    render(<ExpensesClient />);
    fireEvent.click(screen.getByText('expenses.policies'));
    expect(screen.getByText('Travel Policy')).toBeInTheDocument();
    expect(screen.getByText('Standard rules')).toBeInTheDocument();
    expect(screen.getByText('expenses.approvalLimits')).toBeInTheDocument();
    expect(screen.getByText('expenses.autoApprovalLimit')).toBeInTheDocument();
    expect(screen.getByText('AMD 10,000')).toBeInTheDocument();
    expect(screen.getByText('expenses.managerApprovalLimit')).toBeInTheDocument();
    expect(screen.getByText('AMD 50,000')).toBeInTheDocument();
    expect(screen.getByText('expenses.directorApprovalLimit')).toBeInTheDocument();
    expect(screen.getByText('AMD 100,000')).toBeInTheDocument();
    expect(screen.getByText('expenses.receiptPolicy')).toBeInTheDocument();
    expect(screen.getByText('expenses.receiptRequiredAbove')).toBeInTheDocument();
    expect(screen.getByText('AMD 25,000')).toBeInTheDocument();
    expect(screen.getByText('expenses.submissionDeadline')).toBeInTheDocument();
    expect(screen.getByText('7 common.days')).toBeInTheDocument();
    expect(screen.getByText('expenses.newPolicy')).toBeInTheDocument();
  });

  it('hides optional policy rows when absent', () => {
    queryResults.getExpensePolicy = {
      _id: 'p1',
      name: 'Minimal Policy',
      isActive: false,
    };
    render(<ExpensesClient />);
    fireEvent.click(screen.getByText('expenses.policies'));
    expect(screen.getByText('Minimal Policy')).toBeInTheDocument();
    expect(screen.queryByText('expenses.autoApprovalLimit')).not.toBeInTheDocument();
    expect(screen.queryByText('expenses.receiptRequiredAbove')).not.toBeInTheDocument();
    expect(screen.queryByText('expenses.submissionDeadline')).not.toBeInTheDocument();
  });

  it('shows the empty policy state', () => {
    queryResults.getExpensePolicy = null;
    render(<ExpensesClient />);
    fireEvent.click(screen.getByText('expenses.policies'));
    expect(screen.getByText('expenses.noPolicies')).toBeInTheDocument();
  });

  // ── Charts ───────────────────────────────────────────────────────────────

  it('renders category and status charts from the summary', () => {
    const { container } = render(<ExpensesClient />);
    const barChart = container.querySelector('[data-testid="bar-chart"]')!;
    const chart = barChart.getAttribute('data-chart') ?? '';
    expect(chart).toContain('travel');
    expect(chart).toContain('meals');

    const pie = container.querySelector('[data-testid="pie"]')!;
    const pieChart = pie.getAttribute('data-chart') ?? '';
    expect(pieChart).toContain('approved');
    expect(pieChart).toContain('draft');
    expect(pieChart).not.toContain('rejected'); // value 0 filtered out

    // One cell per non-zero status, cycling through the palette.
    expect(container.querySelectorAll('[data-testid="cell"]').length).toBe(3);
  });

  // Asserted against the shared resolver rather than a literal: the tooltip
  // surface is a design token, and a second copy of its value in a test is how
  // the two drift apart.
  it('uses the dark theme tooltip colors when the theme is dark', () => {
    mockTheme = 'dark';
    render(<ExpensesClient />);
    const tooltips = screen.getAllByTestId('tooltip');
    expect(tooltips.length).toBe(2);
    tooltips.forEach((el) =>
      expect(el.getAttribute('data-bg')).toBe(getChartTheme(true).tooltipBg),
    );
  });

  it('uses light tooltip colors in light mode', () => {
    render(<ExpensesClient />);
    screen.getAllByTestId('tooltip').forEach((el) => {
      expect(el.getAttribute('data-bg')).toBe(getChartTheme(false).tooltipBg);
    });
  });

  it('hides charts when the summary is not available', () => {
    queryResults.getExpenseSummary = undefined;
    render(<ExpensesClient />);
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument();
  });

  // ── Wizards ──────────────────────────────────────────────────────────────

  it('opens the expense wizard and passes org and user', () => {
    render(<ExpensesClient />);
    fireEvent.click(screen.getByText('expenses.newExpense'));
    expect(screen.getByTestId('expense-wizard')).toBeInTheDocument();
    expect(wizardProps.expense.organizationId).toBe('org-1');
    expect(wizardProps.expense.userId).toBe('u1');
    expect(wizardProps.expense.open).toBe(true);

    act(() => wizardProps.expense.onOpenChange(false));
    expect(screen.queryByTestId('expense-wizard')).not.toBeInTheDocument();
  });

  it('opens the category wizard', () => {
    render(<ExpensesClient />);
    fireEvent.click(screen.getByText('expenses.categories'));
    fireEvent.click(screen.getByText('expenses.newCategory'));
    expect(screen.getByTestId('category-wizard')).toBeInTheDocument();
    expect(wizardProps.category.organizationId).toBe('org-1');
  });

  it('opens the report wizard', () => {
    render(<ExpensesClient />);
    fireEvent.click(screen.getByText('expenses.reports'));
    fireEvent.click(screen.getByText('expenses.newReport'));
    expect(screen.getByTestId('report-wizard')).toBeInTheDocument();
    expect(wizardProps.report.organizationId).toBe('org-1');
  });

  it('opens the policy wizard', () => {
    render(<ExpensesClient />);
    fireEvent.click(screen.getByText('expenses.policies'));
    fireEvent.click(screen.getByText('expenses.newPolicy'));
    expect(screen.getByTestId('policy-wizard')).toBeInTheDocument();
    expect(wizardProps.policy.organizationId).toBe('org-1');
  });

  // ── English fallback literals (t returns '') ─────────────────────────────

  it('renders raw status text and default badge variant for unknown statuses', () => {
    tMode = 'empty';
    render(<ExpensesClient />);
    const badge = screen.getAllByTestId('badge').find((b) => b.textContent === 'mystery');
    expect(badge?.getAttribute('data-variant')).toBe('secondary');
  });

  it('renders the raw category label fallback for unknown categories', () => {
    tMode = 'empty';
    render(<ExpensesClient />);
    expect(screen.getByText('📋 unknown_cat')).toBeInTheDocument();
  });
});
