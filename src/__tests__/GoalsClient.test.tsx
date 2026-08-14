import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GoalsClient, {
  CheckinDialog,
  ObjectiveDetailDialog,
  getPeriodDates,
} from '@/components/GoalsClient';
import { toast } from 'sonner';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => (typeof opts === 'string' ? opts : key),
    i18n: { language: 'en' },
  }),
}));

let queryResults: Record<string, any> = {};
const mutationCalls: Array<{ name?: string; args: any[] }> = [];
const mutationImpls: Record<string, (...args: any[]) => any> = {};

jest.mock('@/lib/convex-typed', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
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
    goals: {
      listObjectives: { _name: 'listObjectives' },
      getMyObjectives: { _name: 'getMyObjectives' },
      getTeamProgress: { _name: 'getTeamProgress' },
      getObjective: { _name: 'getObjective' },
      createObjective: { _name: 'createObjective' },
      checkin: { _name: 'checkin' },
      deleteObjective: { _name: 'deleteObjective' },
      completeObjective: { _name: 'completeObjective' },
    },
  },
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const mockToast = toast as unknown as { success: jest.Mock; error: jest.Mock };

let mockUser: any = {
  id: 'user-1',
  role: 'admin',
  organizationId: 'org-1',
  department: 'Engineering',
};
let mockSelectedOrg: string | null = 'org-1';
jest.mock('@/store/useAuthStore', () => ({
  useAuthUser: () => mockUser,
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
            title: 'Restored Goal',
            description: 'desc',
            level: 'team',
            department: 'Eng',
            periodType: 'Q3',
            periodYear: 2027,
            parentId: '',
            keyResults: [
              {
                title: 'KR1',
                description: '',
                metricType: 'number',
                direction: 'increase',
                startValue: 0,
                targetValue: 100,
                unit: '',
                weight: 100,
              },
            ],
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

jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => mockSelectedOrg,
}));

jest.mock('@/hooks/useMainRef', () => ({
  useMainRef: () => ({ current: { scrollTo: jest.fn() } }),
}));

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/components/ui/button', () => ({
  Button: (props: any) => (
    <button type={props.type || 'button'} {...props}>
      {props.children}
    </button>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: (props: any) => <div {...props}>{props.children}</div>,
  CardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: any) => <span className={className}>{children}</span>,
}));

jest.mock('@/components/ui/progress', () => ({
  Progress: ({ value, className }: any) => (
    <div data-testid="progress" data-value={value} className={className} />
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

jest.mock('@/components/ui/label', () => ({
  Label: (props: any) => <label {...props} />,
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children, className }: any) => (
    <div data-testid="dialog-content" className={className}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  SheetContent: ({ children, className }: any) => (
    <div data-testid="dialog-content" className={className}>
      {children}
    </div>
  ),
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetBody: ({ children }: any) => <div>{children}</div>,
  SheetFooter: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <div>{children}</div>,
  SheetDescription: ({ children }: any) => <p>{children}</p>,
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

jest.mock('@/components/ui/select', () => {
  const Select = ({ value, onValueChange, children, disabled }: any) => {
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
      <div data-testid="select" data-disabled={!!disabled}>
        <button type="button" data-testid={`select-current-${value}`}>
          {value}
        </button>
        <div data-testid="select-options">
          {options.map((opt) => (
            <button
              key={opt.props.value}
              type="button"
              data-testid={`select-option-${opt.props.value}`}
              onClick={() => onValueChange(opt.props.value)}
            >
              {opt.props.value}
            </button>
          ))}
        </div>
      </div>
    );
  };
  return {
    Select,
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ value, children }: any) => <div value={value}>{children}</div>,
    SelectTrigger: ({ children }: any) => <>{children}</>,
    SelectValue: ({ placeholder }: any) => null,
  };
});

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: ({ size }: any) => <div data-testid="shield-loader">loading</div>,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return new Proxy({}, { get: () => Icon });
});

const objective1 = {
  _id: 'obj-1',
  title: 'Improve NPS',
  description: 'Raise satisfaction',
  level: 'individual',
  periodType: 'Q2',
  periodYear: 2026,
  ownerId: 'user-1',
  ownerName: 'Alice',
  progress: 80,
  status: 'active',
  keyResultsCount: 2,
  taskCount: 3,
  completedTaskCount: 1,
};

const objective2 = {
  _id: 'obj-2',
  title: 'Team velocity',
  description: '',
  level: 'team',
  periodType: 'Q2',
  periodYear: 2026,
  ownerId: 'user-2',
  ownerName: 'Bob',
  progress: 50,
  status: 'completed',
  keyResultsCount: 1,
  taskCount: 0,
  completedTaskCount: 0,
};

const objective3 = {
  _id: 'obj-3',
  title: 'Revenue growth',
  description: '',
  level: 'company',
  periodType: 'FY',
  periodYear: 2026,
  ownerId: 'user-3',
  ownerName: 'Carol',
  progress: 20,
  status: 'draft',
  keyResultsCount: 4,
  taskCount: 5,
  completedTaskCount: 5,
};

const objectives = [objective1, objective2, objective3];
const teamProgress = { total: 10, avgProgress: 65, onTrack: 4, atRisk: 1, behind: 2 };

const detailObjective = {
  _id: 'obj-1',
  title: 'Improve NPS',
  description: 'Raise satisfaction',
  level: 'individual',
  periodType: 'Q2',
  periodYear: 2026,
  ownerId: 'user-1',
  status: 'active',
  progress: 80,
  keyResults: [
    {
      _id: 'kr-1',
      title: 'Reach 95',
      completionPercent: 80,
      startValue: 0,
      currentValue: 76,
      targetValue: 100,
      unit: '%',
      metricType: 'number',
      confidence: 'high',
      checkins: [
        {
          _id: 'c-1',
          createdAt: '2026-03-01T00:00:00Z',
          previousValue: 60,
          newValue: 76,
          note: 'solid',
        },
      ],
    },
    {
      _id: 'kr-2',
      title: 'Sign ups',
      completionPercent: 50,
      startValue: 0,
      currentValue: 5,
      targetValue: 10,
      unit: '',
      metricType: 'number',
      confidence: 'medium',
      checkins: [],
    },
    {
      _id: 'kr-3',
      title: 'Score',
      completionPercent: 20,
      startValue: 100,
      currentValue: 80,
      targetValue: 50,
      unit: '',
      metricType: 'number',
      confidence: 'low',
      checkins: [],
    },
    {
      _id: 'kr-4',
      title: 'Mystery',
      completionPercent: 40,
      startValue: 0,
      currentValue: 0,
      targetValue: 1,
      unit: '',
      metricType: 'boolean',
      confidence: 'unknown',
      checkins: [],
    },
  ],
  children: [{ _id: 'child-1', title: 'Team goal', progress: 50 }],
};

const seed = () => {
  queryResults = {
    listObjectives: objectives,
    getMyObjectives: [objective1],
    getTeamProgress: teamProgress,
    getObjective: undefined,
  };
  mutationCalls.length = 0;
  Object.keys(mutationImpls).forEach((key) => delete mutationImpls[key]);
  mockPush.mockClear();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  mockUser = {
    id: 'user-1',
    role: 'admin',
    organizationId: 'org-1',
    department: 'Engineering',
  };
  mockSelectedOrg = 'org-1';
  mockDraft = {
    restored: false,
    restoredStep: 0,
    clearDraft: jest.fn(() => {
      mockDraft.restored = false;
    }),
  };
  sessionStorage.clear();
};

beforeEach(seed);

describe('getPeriodDates', () => {
  it('computes the date range for every period type', () => {
    expect(getPeriodDates('Q1', 2026)).toEqual({
      start: new Date(2026, 0, 1).getTime(),
      end: new Date(2026, 2, 31).getTime(),
    });
    expect(getPeriodDates('Q2', 2026)).toEqual({
      start: new Date(2026, 3, 1).getTime(),
      end: new Date(2026, 5, 30).getTime(),
    });
    expect(getPeriodDates('Q3', 2026)).toEqual({
      start: new Date(2026, 6, 1).getTime(),
      end: new Date(2026, 8, 30).getTime(),
    });
    expect(getPeriodDates('Q4', 2026)).toEqual({
      start: new Date(2026, 9, 1).getTime(),
      end: new Date(2026, 11, 31).getTime(),
    });
    expect(getPeriodDates('H1', 2026)).toEqual({
      start: new Date(2026, 0, 1).getTime(),
      end: new Date(2026, 5, 30).getTime(),
    });
    expect(getPeriodDates('H2', 2026)).toEqual({
      start: new Date(2026, 6, 1).getTime(),
      end: new Date(2026, 11, 31).getTime(),
    });
    expect(getPeriodDates('FY', 2026)).toEqual({
      start: new Date(2026, 0, 1).getTime(),
      end: new Date(2026, 11, 31).getTime(),
    });
  });
});

describe('GoalsClient', () => {
  it('shows the loader without a user', () => {
    mockUser = null;
    render(<GoalsClient />);
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('shows the loader without an organization', () => {
    mockSelectedOrg = null;
    mockUser = { id: 'user-1' };
    render(<GoalsClient />);
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('renders the header, stats and my objectives', () => {
    render(<GoalsClient />);
    expect(screen.getByText('OKR & Goals')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('Total Objectives')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Improve NPS')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Q2 2026')).toBeInTheDocument();
    expect(screen.getByText('2 KRs')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('filters objectives by tab', () => {
    render(<GoalsClient />);
    expect(screen.getByText('Improve NPS')).toBeInTheDocument();
    expect(screen.queryByText('Team velocity')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Team'));
    expect(screen.getByText('Team velocity')).toBeInTheDocument();
    expect(screen.queryByText('Improve NPS')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Company'));
    expect(screen.getByText('Revenue growth')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
  });

  it('renders progress colors for all thresholds', () => {
    const { container } = render(<GoalsClient />);
    expect(container.querySelector('[class*="text-(--success-text)"]')).not.toBeNull();
    fireEvent.click(screen.getByText('Team'));
    expect(container.querySelector('[class*="text-(--warning-text)"]')).not.toBeNull();
    fireEvent.click(screen.getByText('Company'));
    expect(container.querySelector('[class*="text-(--danger-text)"]')).not.toBeNull();
  });

  it('renders the completed status badge on the team tab', () => {
    render(<GoalsClient />);
    fireEvent.click(screen.getByText('Team'));
    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  it('shows the empty state and opens the wizard from it', () => {
    queryResults.listObjectives = [];
    const scrollSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(<GoalsClient />);
    expect(screen.getByText('No objectives yet')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('New Objective')[1]);
    expect(screen.getByText('Create Objective')).toBeInTheDocument();
    expect(scrollSpy).toHaveBeenCalled();
    scrollSpy.mockRestore();
  });

  it('opens the wizard from the header and scrolls to top', () => {
    const scrollSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(<GoalsClient />);
    fireEvent.click(screen.getByText('New Objective'));
    expect(screen.getByText('Create Objective')).toBeInTheDocument();
    expect(scrollSpy).toHaveBeenCalled();
    scrollSpy.mockRestore();
  });

  it('navigates to the objective page on card click', () => {
    render(<GoalsClient />);
    fireEvent.click(screen.getByText('Improve NPS'));
    expect(mockPush).toHaveBeenCalledWith('/goals/obj-1');
  });

  it('changes the year and period filters', () => {
    render(<GoalsClient />);
    fireEvent.click(screen.getByTestId('select-option-2027'));
    expect(screen.getByTestId('select-current-2027')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('select-option-Q1'));
    expect(screen.getByTestId('select-current-Q1')).toBeInTheDocument();
  });

  it('shows the my-goals count badge', () => {
    render(<GoalsClient />);
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  it('handles undefined objective queries', () => {
    queryResults.listObjectives = undefined;
    queryResults.getTeamProgress = undefined;
    render(<GoalsClient />);
    expect(screen.getAllByTestId('shield-loader').length).toBeGreaterThan(0);
  });
});

describe('CreateObjectiveWizard', () => {
  const openWizard = () => {
    render(<GoalsClient />);
    fireEvent.click(screen.getByText('New Objective'));
    return screen.getByTestId('dialog-content');
  };

  it('creates an individual objective through all three steps', async () => {
    const dialog = openWizard();
    expect(screen.getByText('Next').closest('button')).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('e.g. Increase customer satisfaction'), {
      target: { value: '  NPS boost  ' },
    });
    fireEvent.change(screen.getByPlaceholderText('What does achieving this look like?'), {
      target: { value: 'Raise' },
    });
    expect(screen.getByText('Next').closest('button')).not.toBeDisabled();
    fireEvent.click(screen.getByText('Next'));

    fireEvent.change(screen.getByPlaceholderText('e.g. Reach 95% NPS score'), {
      target: { value: 'Reach 95' },
    });
    fireEvent.click(screen.getByText('Next'));

    expect(within(dialog).getByText('NPS boost')).toBeInTheDocument();
    expect(within(dialog).getByText('Raise')).toBeInTheDocument();
    expect(within(dialog).getByText('individual')).toBeInTheDocument();
    expect(within(dialog).getByText('Q2 2026')).toBeInTheDocument();
    expect(within(dialog).getByText('100%')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('Create Objective')[1]);
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'createObjective',
        args: [
          expect.objectContaining({
            organizationId: 'org-1',
            title: 'NPS boost',
            description: 'Raise',
            ownerId: 'user-1',
            level: 'individual',
            department: undefined,
            periodType: 'Q2',
            periodYear: 2026,
            periodStart: new Date(2026, 3, 1).getTime(),
            periodEnd: new Date(2026, 5, 30).getTime(),
            parentObjectiveId: undefined,
            createdBy: 'user-1',
            keyResults: [
              {
                title: 'Reach 95',
                description: undefined,
                metricType: 'number',
                direction: 'increase',
                startValue: 0,
                targetValue: 100,
                unit: undefined,
                weight: 100,
              },
            ],
          }),
        ],
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('goals.wizard.success');
    expect(screen.queryAllByText('Create Objective')).toHaveLength(0);
  });

  it('requires a key result title before submitting', async () => {
    openWizard();
    fireEvent.change(screen.getByPlaceholderText('e.g. Increase customer satisfaction'), {
      target: { value: 'NPS boost' },
    });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getAllByText('Create Objective')[1]);
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('goals.wizard.fillRequired'));
    expect(mutationCalls.filter((call) => call.name === 'createObjective')).toHaveLength(0);
  });

  it('warns when weights do not sum to 100', () => {
    const dialog = openWizard();
    fireEvent.change(screen.getByPlaceholderText('e.g. Increase customer satisfaction'), {
      target: { value: 'NPS boost' },
    });
    fireEvent.click(screen.getByText('Next'));
    expect(screen.queryByText('goals.wizard.weightWarning')).not.toBeInTheDocument();
    const spinbuttons = within(dialog).getAllByRole('spinbutton');
    fireEvent.change(spinbuttons[2], { target: { value: '50' } });
    expect(screen.getByText(/Weights must sum to 100/)).toBeInTheDocument();
  });

  it('adds and removes key results', () => {
    const dialog = openWizard();
    fireEvent.change(screen.getByPlaceholderText('e.g. Increase customer satisfaction'), {
      target: { value: 'NPS boost' },
    });
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getAllByPlaceholderText('e.g. Reach 95% NPS score').length).toBe(1);
    fireEvent.click(screen.getByText('Add Key Result'));
    expect(screen.getAllByPlaceholderText('e.g. Reach 95% NPS score').length).toBe(2);
    fireEvent.click(within(dialog).getAllByText('×')[0]);
    expect(screen.getAllByPlaceholderText('e.g. Reach 95% NPS score').length).toBe(1);
  });

  it('edits key result fields and submits the full payload', async () => {
    const dialog = openWizard();
    fireEvent.change(screen.getByPlaceholderText('e.g. Increase customer satisfaction'), {
      target: { value: 'NPS boost' },
    });
    fireEvent.click(screen.getByText('Next'));

    fireEvent.change(screen.getByPlaceholderText('e.g. Reach 95% NPS score'), {
      target: { value: 'Score' },
    });
    fireEvent.click(within(dialog).getByTestId('select-option-percentage'));
    fireEvent.click(within(dialog).getByTestId('select-option-decrease'));
    const spinbuttons = within(dialog).getAllByRole('spinbutton');
    fireEvent.change(spinbuttons[0], { target: { value: '10' } });
    fireEvent.change(spinbuttons[1], { target: { value: '90' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. %, $, users'), {
      target: { value: '%' },
    });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getAllByText('Create Objective')[1]);
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'createObjective',
        args: [
          expect.objectContaining({
            keyResults: [
              {
                title: 'Score',
                description: undefined,
                metricType: 'percentage',
                direction: 'decrease',
                startValue: 10,
                targetValue: 90,
                unit: '%',
                weight: 100,
              },
            ],
          }),
        ],
      }),
    );
  });

  it('creates a team objective with department and parent alignment', async () => {
    const dialog = openWizard();
    fireEvent.click(within(dialog).getByTestId('select-option-team'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Engineering'), {
      target: { value: 'Sales' },
    });
    fireEvent.click(within(dialog).getByTestId('select-option-obj-2'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Increase customer satisfaction'), {
      target: { value: 'Team speed' },
    });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Reach 95% NPS score'), {
      target: { value: 'Ship 10' },
    });
    fireEvent.click(screen.getByText('Next'));
    expect(within(dialog).getByText('Sales')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Create Objective')[1]);
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'createObjective',
        args: [
          expect.objectContaining({
            level: 'team',
            department: 'Sales',
            parentObjectiveId: 'obj-2',
            keyResults: [
              expect.objectContaining({
                title: 'Ship 10',
                unit: undefined,
                weight: 100,
              }),
            ],
          }),
        ],
      }),
    );
  });

  it('restricts level options by role', () => {
    const openFor = (role: string) => {
      mockUser.role = role;
      const view = render(<GoalsClient />);
      fireEvent.click(screen.getAllByText('New Objective')[0]);
      return { view, dialog: screen.getByTestId('dialog-content') };
    };

    let { view, dialog } = openFor('employee');
    expect(within(dialog).queryByTestId('select-option-company')).not.toBeInTheDocument();
    expect(within(dialog).queryByTestId('select-option-team')).not.toBeInTheDocument();
    expect(within(dialog).getByTestId('select-option-individual')).toBeInTheDocument();
    view.unmount();

    ({ view, dialog } = openFor('supervisor'));
    expect(within(dialog).queryByTestId('select-option-company')).not.toBeInTheDocument();
    expect(within(dialog).getByTestId('select-option-team')).toBeInTheDocument();
    view.unmount();

    ({ view, dialog } = openFor('admin'));
    expect(within(dialog).getByTestId('select-option-company')).toBeInTheDocument();
    expect(within(dialog).getByTestId('select-option-team')).toBeInTheDocument();
    view.unmount();
  });

  it('changes the period and year inside the wizard', async () => {
    const dialog = openWizard();
    fireEvent.click(within(dialog).getByTestId('select-option-FY'));
    fireEvent.click(within(dialog).getByTestId('select-option-2027'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Increase customer satisfaction'), {
      target: { value: 'Annual plan' },
    });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Reach 95% NPS score'), {
      target: { value: 'Ship 10' },
    });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getAllByText('Create Objective')[1]);
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'createObjective',
        args: [
          expect.objectContaining({
            periodType: 'FY',
            periodYear: 2027,
            periodStart: new Date(2027, 0, 1).getTime(),
            periodEnd: new Date(2027, 11, 31).getTime(),
          }),
        ],
      }),
    );
  });

  it('goes back from the review step', () => {
    const dialog = openWizard();
    fireEvent.change(screen.getByPlaceholderText('e.g. Increase customer satisfaction'), {
      target: { value: 'NPS boost' },
    });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Reach 95% NPS score'), {
      target: { value: 'Reach 95' },
    });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Add Key Result')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByPlaceholderText('e.g. Increase customer satisfaction')).toBeInTheDocument();
  });

  it('cancels the wizard from the first step', () => {
    openWizard();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Create Objective')).not.toBeInTheDocument();
  });

  it('restores a draft into the form and jumps to the saved step', () => {
    mockDraft.restored = true;
    mockDraft.restoredStep = 1; // key-results step
    const dialog = openWizard();

    expect(screen.getByTestId('draft-notice')).toBeTruthy();
    expect(screen.getByTestId('draft-notice').getAttribute('data-step')).toBe('1');
    // Jumped to the key-results step with the restored KR title.
    expect(screen.getByPlaceholderText('e.g. Reach 95% NPS score')).toBeInTheDocument();
    expect(screen.getByDisplayValue('KR1')).toBeTruthy();

    // Back on the first step: title and level are restored.
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByDisplayValue('Restored Goal')).toBeTruthy();
    expect(within(dialog).getByTestId('select-current-team')).toBeTruthy();
  });

  it('start over clears the draft and resets the form', () => {
    mockDraft.restored = true;
    mockDraft.restoredStep = 1;
    openWizard();

    fireEvent.click(screen.getByText('Start over'));

    expect(mockDraft.clearDraft).toHaveBeenCalled();
    expect(screen.queryByTestId('draft-notice')).toBeNull();
    // First step, empty title.
    expect(screen.getByPlaceholderText('e.g. Increase customer satisfaction')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Increase customer satisfaction')).toHaveValue('');
  });

  it('clears the draft after a successful save', async () => {
    const dialog = openWizard();
    fireEvent.change(screen.getByPlaceholderText('e.g. Increase customer satisfaction'), {
      target: { value: 'NPS boost' },
    });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Reach 95% NPS score'), {
      target: { value: 'Reach 95' },
    });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getAllByText('Create Objective')[1]);
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({ name: 'createObjective', args: [expect.anything()] }),
    );
    expect(mockDraft.clearDraft).toHaveBeenCalled();
    void dialog;
  });

  it('does not show the draft notice when nothing was restored', () => {
    openWizard();
    expect(screen.queryByTestId('draft-notice')).toBeNull();
  });

  it('handles create errors', async () => {
    mutationImpls.createObjective = jest.fn().mockRejectedValue('boom');
    openWizard();
    fireEvent.change(screen.getByPlaceholderText('e.g. Increase customer satisfaction'), {
      target: { value: 'NPS boost' },
    });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Reach 95% NPS score'), {
      target: { value: 'Reach 95' },
    });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getAllByText('Create Objective')[1]);
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('boom'));
  });
});

describe('CheckinDialog', () => {
  const onClose = jest.fn();
  const renderCheckin = (props: any = {}) =>
    render(
      <CheckinDialog
        krId="kr-1"
        krTitle="Reach 95"
        currentValue={40}
        targetValue={100}
        unit="%"
        metricType="number"
        onClose={onClose}
        {...props}
      />,
    );

  beforeEach(() => onClose.mockClear());

  it('renders the current and target values', () => {
    renderCheckin();
    expect(screen.getByText('Check-in')).toBeInTheDocument();
    expect(screen.getByText('Reach 95')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('medium')).toBeInTheDocument();
  });

  it('submits a check-in with a note', async () => {
    renderCheckin();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '55' } });
    fireEvent.change(screen.getByPlaceholderText('What progress was made?'), {
      target: { value: 'On track' },
    });
    fireEvent.click(screen.getByText('Submit Check-in'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'checkin',
        args: [
          {
            keyResultId: 'kr-1',
            userId: 'user-1',
            newValue: 55,
            note: 'On track',
            confidence: 'medium',
          },
        ],
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('Check-in recorded');
    expect(onClose).toHaveBeenCalled();
  });

  it('trims an empty note to undefined', async () => {
    renderCheckin();
    fireEvent.click(screen.getByText('Submit Check-in'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'checkin',
        args: [
          {
            keyResultId: 'kr-1',
            userId: 'user-1',
            newValue: 40,
            note: undefined,
            confidence: 'medium',
          },
        ],
      }),
    );
  });

  it('uses a boolean select for boolean metrics', async () => {
    renderCheckin({ currentValue: 0, metricType: 'boolean' });
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('select-option-1'));
    fireEvent.click(screen.getByText('Submit Check-in'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'checkin',
        args: [expect.objectContaining({ newValue: 1 })],
      }),
    );
  });

  it('switches the confidence level', async () => {
    renderCheckin();
    fireEvent.click(screen.getByText('high'));
    fireEvent.click(screen.getByText('Submit Check-in'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'checkin',
        args: [expect.objectContaining({ confidence: 'high' })],
      }),
    );
  });

  it('does nothing without a user', async () => {
    mockUser = null;
    renderCheckin();
    fireEvent.click(screen.getByText('Submit Check-in'));
    expect(mutationCalls).toHaveLength(0);
  });

  it('handles check-in errors', async () => {
    mutationImpls.checkin = jest.fn().mockRejectedValue('boom');
    renderCheckin();
    fireEvent.click(screen.getByText('Submit Check-in'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('boom'));
  });

  it('cancels the check-in', () => {
    renderCheckin();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ObjectiveDetailDialog', () => {
  const onClose = jest.fn();
  const onCheckin = jest.fn();
  const renderDetail = (overrides: any = {}) =>
    render(
      <ObjectiveDetailDialog
        objectiveId="obj-1"
        onClose={onClose}
        onCheckin={onCheckin}
        {...overrides}
      />,
    );

  beforeEach(() => {
    onClose.mockClear();
    onCheckin.mockClear();
    queryResults.getObjective = detailObjective;
  });

  it('shows the loader while the objective loads', () => {
    queryResults.getObjective = undefined;
    renderDetail();
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('renders objective details with key results and check-ins', () => {
    renderDetail();
    expect(screen.getByText('Improve NPS')).toBeInTheDocument();
    expect(screen.getByText('individual')).toBeInTheDocument();
    expect(screen.getByText('Q2 2026')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('Raise satisfaction')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Recent Check-ins')).toBeInTheDocument();
    expect(screen.getByText('solid')).toBeInTheDocument();
    expect(screen.getByText('Team goal')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('calls onCheckin for the owner of an active objective', () => {
    renderDetail();
    const buttons = screen.getAllByText('Check-in');
    expect(buttons.length).toBe(4);
    fireEvent.click(buttons[0]);
    expect(onCheckin).toHaveBeenCalledWith(detailObjective.keyResults[0]);
  });

  it('hides actions for non-owners', () => {
    mockUser = { id: 'user-2', role: 'admin', organizationId: 'org-1' };
    renderDetail();
    expect(screen.queryByText('Check-in')).not.toBeInTheDocument();
    expect(screen.queryByText('Mark Complete')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('hides actions for inactive objectives', () => {
    queryResults.getObjective = { ...detailObjective, status: 'completed' };
    renderDetail();
    expect(screen.queryByText('Check-in')).not.toBeInTheDocument();
    expect(screen.queryByText('Mark Complete')).not.toBeInTheDocument();
  });

  it('completes the objective', async () => {
    renderDetail();
    fireEvent.click(screen.getByText('Mark Complete'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'completeObjective',
        args: [{ objectiveId: 'obj-1' }],
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('Objective completed!');
    expect(onClose).toHaveBeenCalled();
  });

  it('deletes the objective', async () => {
    renderDetail();
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'deleteObjective',
        args: [{ objectiveId: 'obj-1' }],
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('Objective deleted');
    expect(onClose).toHaveBeenCalled();
  });

  it('handles complete and delete errors', async () => {
    mutationImpls.completeObjective = jest.fn().mockRejectedValue('boom');
    mutationImpls.deleteObjective = jest.fn().mockRejectedValue('crash');
    renderDetail();
    fireEvent.click(screen.getByText('Mark Complete'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('boom'));
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('crash'));
  });
});
