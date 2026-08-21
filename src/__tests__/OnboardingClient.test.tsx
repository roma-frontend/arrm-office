/**
 * Tests for OnboardingClient — onboarding programs, templates, my-onboarding
 * progress, and the start/template wizards.
 *
 * Mocks: convex/react (queries keyed by ref name, mutations), auth store,
 * selected org, UserPicker, toast, UI primitives, lucide.
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

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }, args?: any) =>
    args === 'skip' ? undefined : queryResults[ref?._name ?? ''],
  useMutation:
    (ref: { _name?: string }) =>
    (...args: any[]) => {
      mutationCalls.push({ name: ref?._name, args });
      return Promise.resolve();
    },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    onboarding: {
      listPrograms: { _name: 'listPrograms' },
      listTemplates: { _name: 'listTemplates' },
      getMyOnboarding: { _name: 'getMyOnboarding' },
      getMyMenteePrograms: { _name: 'getMyMenteePrograms' },
      getProgram: { _name: 'getProgram' },
      completeTask: { _name: 'completeTask' },
      skipTask: { _name: 'skipTask' },
      completeProgram: { _name: 'completeProgram' },
      startOnboarding: { _name: 'startOnboarding' },
      createTemplate: { _name: 'createTemplate' },
    },
    users: {
      queries: {
        getUserById: { _name: 'users.queries.getUserById' },
      },
    },
  },
}));

let mockUser: any = { id: 'user-1', organizationId: 'org-1', role: 'admin' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

jest.mock('@/hooks/useMainRef', () => ({
  useMainRef: () => ({ current: null }),
}));

jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => 'org-1',
}));

jest.mock('@/components/ui/UserPicker', () => ({
  UserPicker: ({ onChange, label }: any) => (
    <button type="button" data-testid="user-picker" onClick={() => onChange('u-2')}>
      {label}
    </button>
  ),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
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
  Select: ({ children }: any) => <div data-testid="select">{children}</div>,
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
    'Plus',
    'Rocket',
    'CheckCircle2',
    'Check',
    'Circle',
    'SkipForward',
    'Users',
    'ClipboardList',
    'FileText',
    'Pencil',
    'ChevronRight',
    'ChevronLeft',
  ];
  const mocks: Record<string, any> = {};
  for (const name of icons) {
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  }
  return mocks;
});

import OnboardingClient from '@/components/OnboardingClient';
import { toast } from 'sonner';

const PROGRAMS = [
  {
    _id: 'p-1',
    employeeName: 'Anna Petrova',
    status: 'active',
    buddyName: 'Bob Smith',
    startDate: '2026-01-10T00:00:00Z',
    progress: 60,
    completedTasks: 3,
    totalTasks: 5,
  },
  {
    _id: 'p-2',
    employeeName: 'Carlos',
    status: 'completed',
    startDate: '2026-01-01T00:00:00Z',
    progress: 100,
    completedTasks: 5,
    totalTasks: 5,
  },
];

const TEMPLATES = [
  {
    _id: 'tpl-1',
    name: 'Engineering Onboarding',
    description: 'For new engineers',
    department: 'Engineering',
    isActive: true,
    tasks: [{ _id: 't-1' }, { _id: 't-2' }],
  },
];

const MY_ONBOARDING = {
  _id: 'my-1',
  progress: 40,
  completedTasks: 2,
  totalTasks: 5,
  buddyName: 'Bob Smith',
  tasks: [
    { _id: 'task-1', status: 'completed', title: 'Set up laptop', category: 'equipment' },
    {
      _id: 'task-2',
      status: 'pending',
      title: 'Intro meeting',
      description: 'Meet the team',
      category: 'intro',
    },
  ],
};

const PROGRAM_DETAIL = {
  _id: 'p-1',
  employeeName: 'Anna Petrova',
  managerName: 'HR Lead',
  buddyName: 'Bob Smith',
  startDate: '2026-01-10T00:00:00Z',
  status: 'active',
  progress: 90,
  completedTasks: 4,
  totalTasks: 5,
  tasks: [
    {
      _id: 'task-1',
      status: 'completed',
      title: 'Set up laptop',
      assigneeType: 'it',
      category: 'equipment',
    },
    {
      _id: 'task-2',
      status: 'pending',
      title: 'Intro meeting',
      assigneeType: 'manager',
      assigneeName: 'HR Lead',
      category: 'intro',
    },
  ],
};

describe('OnboardingClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mutationCalls.length = 0;
    mockUser = { id: 'user-1', organizationId: 'org-1', role: 'admin' };
    queryResults = {
      listPrograms: PROGRAMS,
      listTemplates: TEMPLATES,
      getMyOnboarding: undefined,
      getMyMenteePrograms: [],
    };
    window.scrollTo = jest.fn() as any;
  });

  it('shows a loader while programs are loading', () => {
    queryResults = { listPrograms: undefined, listTemplates: TEMPLATES };
    render(<OnboardingClient />);
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('renders the header and stats', () => {
    render(<OnboardingClient />);
    expect(screen.getByText('Onboarding')).toBeInTheDocument();
    expect(screen.getByText('Manage new hire onboarding workflows')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getAllByText('Templates').length).toBeGreaterThan(0);
    expect(screen.getByText('My Mentees')).toBeInTheDocument();
  });

  it('renders program cards with progress', () => {
    render(<OnboardingClient />);
    expect(screen.getByText('Anna Petrova')).toBeInTheDocument();
    expect(screen.getByText('Carlos')).toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('shows an empty state when there are no programs', () => {
    queryResults = { listPrograms: [], listTemplates: TEMPLATES };
    render(<OnboardingClient />);
    expect(screen.getByText('No onboarding programs yet')).toBeInTheDocument();
    expect(screen.getAllByText('Start Onboarding').length).toBeGreaterThan(0);
  });

  it('hides admin-only header buttons for non-admin users', () => {
    mockUser = { id: 'user-1', organizationId: 'org-1', role: 'employee' };
    render(<OnboardingClient />);
    expect(screen.queryByText('New Template')).not.toBeInTheDocument();
    expect(screen.queryByText('Start Onboarding')).not.toBeInTheDocument();
  });

  it('renders my onboarding progress and tasks, completing a task', async () => {
    queryResults['getMyOnboarding'] = MY_ONBOARDING;
    render(<OnboardingClient />);

    expect(screen.getByText('Your Progress')).toBeInTheDocument();
    expect(screen.getByText('Set up laptop')).toBeInTheDocument();
    expect(screen.getByText('Intro meeting')).toBeInTheDocument();

    // Circle button on the pending task
    fireEvent.click(screen.getAllByTestId('icon-Circle')[0]);

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'completeTask',
            args: [{ taskId: 'task-2' }],
          }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Task completed!');
  });

  it('renders templates in the templates tab', () => {
    render(<OnboardingClient />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Templates' })[0]);
    expect(screen.getByText('Engineering Onboarding')).toBeInTheDocument();
    expect(screen.getByText('For new engineers')).toBeInTheDocument();
    expect(screen.getByText('2 tasks')).toBeInTheDocument();
  });

  it('opens an existing organization template for editing', () => {
    render(<OnboardingClient />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Templates' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit onboarding template' }));

    expect(screen.getByText('Edit Template')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Engineering Onboarding')).toBeInTheDocument();
  });

  it('starts onboarding through the wizard', async () => {
    render(<OnboardingClient />);
    fireEvent.click(screen.getByText('Start Onboarding'));

    // Step 1: pick employee
    const next = () => screen.getByText('Next');
    expect((next() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getAllByTestId('user-picker')[0]);
    fireEvent.click(next());

    // Step 2: template + start date
    fireEvent.click(next());

    // Step 3: manager + buddy pickers, then Start
    fireEvent.click(screen.getAllByTestId('user-picker')[0]);
    fireEvent.click(screen.getByText('Start'));

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'startOnboarding',
            args: [
              expect.objectContaining({
                organizationId: 'org-1',
                employeeId: 'u-2',
                managerId: 'u-2',
              }),
            ],
          }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Onboarding started!');
  });

  it('creates a template with tasks through the wizard', async () => {
    render(<OnboardingClient />);
    fireEvent.click(screen.getByText('New Template'));

    // Step 1: name
    const next = () => screen.getByText('Next');
    expect((next() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('e.g. Engineering Onboarding'), {
      target: { value: 'Design Onboarding' },
    });
    fireEvent.click(next());

    // Step 2: add a task (Next disabled without tasks)
    expect((next() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('Task title'), {
      target: { value: 'Set up Figma' },
    });
    fireEvent.click(screen.getByText('Add Task'));
    fireEvent.click(next());

    // Step 3: create
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'createTemplate',
            args: [
              expect.objectContaining({
                organizationId: 'org-1',
                name: 'Design Onboarding',
                tasks: [expect.objectContaining({ title: 'Set up Figma', dayOffset: 0 })],
              }),
            ],
          }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Template created!');
  });

  it('opens program details and lets an admin skip a task', async () => {
    queryResults['getProgram'] = PROGRAM_DETAIL;
    render(<OnboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));

    expect(screen.getByText(/Anna Petrova — Onboarding/)).toBeInTheDocument();
    expect(screen.getByText('HR Lead')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();

    fireEvent.click(screen.getAllByTestId('icon-SkipForward')[0]);

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'skipTask', args: [{ taskId: 'task-2' }] }),
        ]),
      );
    });
  });

  it('completes a program at >= 80% progress', async () => {
    queryResults['getProgram'] = PROGRAM_DETAIL;
    render(<OnboardingClient />);
    fireEvent.click(screen.getByText('Anna Petrova'));

    fireEvent.click(screen.getByText('Complete Onboarding'));

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'completeProgram',
            args: [{ programId: 'p-1' }],
          }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Onboarding completed!');
  });
});
