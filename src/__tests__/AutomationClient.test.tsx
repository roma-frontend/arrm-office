/**
 * Tests for AutomationClient — superadmin automation dashboard.
 *
 * Mocks: convex/react (useQuery keyed by ref name, useMutation, useAction),
 * auth store (mutable user for the superadmin gate), react-i18next
 * (fallback-string t), generated api, cssMotion, UI primitives
 * (Card/Badge/Button/ShieldLoader + a context-based Tabs mock),
 * sonner toast, lucide icons, and WorkflowBuilderClient (heavy child).
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// 'fallback' (default) returns the fallback string or key; 'empty' returns ''
// so the component's `|| 'English literal'` fallback branches execute.
let tMode: 'fallback' | 'empty' = 'fallback';
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => {
      if (tMode === 'empty') return '';
      return typeof fallback === 'string' ? fallback : key;
    },
  }),
}));

let mockUser: any = { id: 'u1', role: 'superadmin' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

let queryResults: Record<string, unknown> = {};
let mutationImpls: Record<string, jest.Mock> = {};
let actionImpls: Record<string, jest.Mock> = {};
jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation: (ref: { _name?: string }) => {
    const name = ref?._name ?? '';
    mutationImpls[name] = mutationImpls[name] ?? jest.fn();
    return mutationImpls[name];
  },
  useAction: (ref: { _name?: string }) => {
    const name = ref?._name ?? '';
    actionImpls[name] = actionImpls[name] ?? jest.fn();
    return actionImpls[name];
  },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    automation: {
      getStats: { _name: 'getStats' },
      getRecentTasks: { _name: 'getRecentTasks' },
      getActiveWorkflows: { _name: 'getActiveWorkflows' },
    },
    automationActions: {
      runAutomation: { _name: 'runAutomation' },
    },
    automationMutations: {
      toggleWorkflow: { _name: 'toggleWorkflow' },
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
  Badge: ({ children, variant }: any) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <span data-testid="loader" />,
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    Zap: Icon,
    Activity: Icon,
    FileText: Icon,
    CheckCircle: Icon,
    Clock: Icon,
    AlertTriangle: Icon,
    TrendingUp: Icon,
    Play: Icon,
    Pause: Icon,
  };
});

// ── Context-based Tabs mock (from OffboardingClient pattern) ────────────────
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

jest.mock('@/components/workflow/WorkflowBuilderClient', () => ({
  __esModule: true,
  default: () => <div data-testid="workflow-builder">builder</div>,
}));

import AutomationClient from '@/components/automation/AutomationClient';
import { toast } from 'sonner';

const STATS = {
  totalTasks: 120,
  tasksTrend: 5,
  completedTasks: 80,
  completedTrend: 10,
  pendingTasks: 30,
  pendingTrend: -2,
  failedTasks: 10,
  failedTrend: 0,
};

const WORKFLOWS = [
  { _id: 'wf1', isActive: true, name: 'Daily Digest', description: 'Sends the morning digest' },
  { _id: 'wf2', isActive: false, name: 'Payroll Run', description: 'Weekly payroll' },
];

const TASKS = [
  { _id: 't1', status: 'completed', name: 'Digest sent', createdAt: '2026-08-10T09:00:00Z' },
  { _id: 't2', status: 'failed', name: 'Payroll failed', createdAt: 1755000000000 },
  {
    _id: 't3',
    status: 'running',
    name: 'Sync in progress',
    createdAt: new Date('2026-08-11T12:00:00Z'),
  },
];

describe('AutomationClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tMode = 'fallback';
    mockUser = { id: 'u1', role: 'superadmin' };
    queryResults = { getStats: STATS, getRecentTasks: TASKS, getActiveWorkflows: WORKFLOWS };
    mutationImpls = {};
    actionImpls = {};
  });

  // ── Superadmin gate ─────────────────────────────────────────────────────

  it('shows the access-denied UI for non-superadmin roles', () => {
    mockUser = { id: 'u1', role: 'admin' };
    render(<AutomationClient />);
    expect(screen.getByText('common.accessDenied')).toBeInTheDocument();
    expect(screen.getByText('common.onlySuperadminAccess')).toBeInTheDocument();
    expect(screen.queryByText('superadmin.automation.title')).not.toBeInTheDocument();
  });

  it('shows the access-denied UI when there is no user', () => {
    mockUser = null;
    render(<AutomationClient />);
    expect(screen.getByText('common.accessDenied')).toBeInTheDocument();
  });

  it('renders the dashboard for superadmins', () => {
    render(<AutomationClient />);
    expect(screen.getByText('superadmin.automation.title')).toBeInTheDocument();
    expect(screen.queryByText('common.accessDenied')).not.toBeInTheDocument();
  });

  // ── Stats cards ─────────────────────────────────────────────────────────

  it('renders the four stat cards with values and trends', () => {
    render(<AutomationClient />);
    expect(screen.getByText('automation.stats.totalTasks')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('5%')).toBeInTheDocument();
    expect(screen.getByText('automation.stats.completed')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.getByText('automation.stats.pending')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    // negative trend renders the absolute value + rotated icon
    expect(screen.getByText('2%')).toBeInTheDocument();
    const rotated = screen
      .getAllByTestId('icon')
      .filter((el) => el.className.includes('rotate-180'));
    expect(rotated.length).toBe(1);
    expect(screen.getByText('automation.stats.failed')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    // zero trend is hidden
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('defaults stats to zero while the query is pending', () => {
    queryResults.getStats = undefined;
    render(<AutomationClient />);
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(4);
  });

  // ── Run automation ──────────────────────────────────────────────────────

  it('runs the automation action and shows a success toast', async () => {
    actionImpls.runAutomation = jest.fn().mockResolvedValue(undefined);
    render(<AutomationClient />);

    fireEvent.click(screen.getByText('automation.runNow'));

    expect(screen.getByText('automation.running')).toBeInTheDocument();
    expect(screen.getByText('automation.running').closest('button')).toBeDisabled();
    await waitFor(() => {
      expect(actionImpls.runAutomation).toHaveBeenCalledTimes(1);
      expect(toast.success).toHaveBeenCalledWith('automation.runSuccess');
    });
    await waitFor(() => {
      expect(screen.getByText('automation.runNow')).toBeInTheDocument();
      expect(screen.getByText('automation.runNow').closest('button')).toBeEnabled();
    });
  });

  it('shows an error toast when the automation action fails', async () => {
    actionImpls.runAutomation = jest.fn().mockRejectedValue(new Error('boom'));
    render(<AutomationClient />);

    fireEvent.click(screen.getByText('automation.runNow'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('automation.runError');
    });
    await waitFor(() => {
      expect(screen.getByText('automation.runNow')).toBeInTheDocument();
    });
  });

  // ── Active workflows ────────────────────────────────────────────────────

  it('renders active workflows with status dots', () => {
    render(<AutomationClient />);
    expect(screen.getByText('Daily Digest')).toBeInTheDocument();
    expect(screen.getByText('Sends the morning digest')).toBeInTheDocument();
    expect(screen.getByText('Payroll Run')).toBeInTheDocument();
  });

  it('shows the no-workflows message when the list is empty', () => {
    queryResults.getActiveWorkflows = [];
    render(<AutomationClient />);
    expect(screen.getByText('automation.noWorkflows')).toBeInTheDocument();
  });

  // ── English fallback literals (t returns '') ───────────────────────────

  it('renders English fallbacks in the denial UI', () => {
    tMode = 'empty';
    mockUser = { id: 'u1', role: 'admin' };
    render(<AutomationClient />);
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText('Only superadmin can access this page')).toBeInTheDocument();
  });

  it('renders English fallbacks in the dashboard chrome with data', async () => {
    tMode = 'empty';
    render(<AutomationClient />);
    expect(screen.getByText('Automation Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Monitor and manage your automation workflows')).toBeInTheDocument();
    expect(screen.getByText('Total Tasks')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Active Workflows')).toBeInTheDocument();
    expect(screen.getByText('Recent Tasks')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Run Now'));
    expect(screen.getByText('Running...')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Run Now')).toBeInTheDocument();
      expect(toast.success).toHaveBeenCalledWith('Automation started successfully');
    });
  });

  it('renders the English no-data fallbacks and error toast literal', async () => {
    tMode = 'empty';
    queryResults.getActiveWorkflows = [];
    queryResults.getRecentTasks = [];
    actionImpls.runAutomation = jest.fn().mockRejectedValue(new Error('boom'));
    render(<AutomationClient />);
    expect(screen.getByText('No active workflows')).toBeInTheDocument();
    expect(screen.getByText('No recent tasks')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Run Now'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to run automation');
    });
  });

  it('toggles a workflow on click', async () => {
    mutationImpls.toggleWorkflow = jest.fn().mockResolvedValue(undefined);
    render(<AutomationClient />);

    // The toggle button is a sibling of the name/description wrapper inside the row.
    const row = screen.getByText('Daily Digest').closest('div')!.parentElement!.parentElement!;
    fireEvent.click(row.querySelector('button')!);

    await waitFor(() => {
      expect(mutationImpls.toggleWorkflow).toHaveBeenCalledWith({
        workflowId: 'wf1',
      });
    });
  });

  // ── Recent tasks ────────────────────────────────────────────────────────

  it('renders recent tasks with formatted dates and status badges', () => {
    render(<AutomationClient />);
    expect(screen.getByText('Digest sent')).toBeInTheDocument();
    expect(screen.getByText('Payroll failed')).toBeInTheDocument();
    expect(screen.getByText('Sync in progress')).toBeInTheDocument();

    const badges = screen.getAllByTestId('badge');
    expect(badges[0].textContent).toBe('completed');
    expect(badges[0].getAttribute('data-variant')).toBe('success');
    expect(badges[1].textContent).toBe('failed');
    expect(badges[1].getAttribute('data-variant')).toBe('destructive');
    expect(badges[2].textContent).toBe('running');
    expect(badges[2].getAttribute('data-variant')).toBe('secondary');
  });

  it('shows the no-tasks message when the list is empty', () => {
    queryResults.getRecentTasks = [];
    render(<AutomationClient />);
    expect(screen.getByText('automation.noTasks')).toBeInTheDocument();
  });

  // ── Tabs & builder ──────────────────────────────────────────────────────

  it('switches to the workflow builder tab', () => {
    render(<AutomationClient />);
    expect(screen.getByTestId('tab-dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('tab-builder')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('automation.builder.title'));

    expect(screen.getByTestId('tab-builder')).toBeInTheDocument();
    expect(screen.queryByTestId('tab-dashboard')).not.toBeInTheDocument();
    expect(screen.getByTestId('workflow-builder')).toBeInTheDocument();
  });
});
