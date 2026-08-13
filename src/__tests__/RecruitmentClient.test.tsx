/**
 * Tests for RecruitmentClient — vacancy management, hiring pipeline and
 * candidate workflows.
 *
 * Mocks: convex-typed (queries keyed by ref name, mutations, actions),
 * auth store, selected org, toast, UI primitives, lucide.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

let queryResults: Record<string, unknown> = {};
const mutationCalls: Array<{ name?: string; args: any[] }> = [];
const actionCalls: Array<{ name?: string; args: any[] }> = [];
let actionResults: Record<string, unknown> = {};

jest.mock('@/lib/convex-typed', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation:
    (ref: { _name?: string }) =>
    (...args: any[]) => {
      mutationCalls.push({ name: ref?._name, args });
      return Promise.resolve();
    },
  useAction:
    (ref: { _name?: string }) =>
    async (...args: any[]) => {
      actionCalls.push({ name: ref?._name, args });
      const res = actionResults[ref?._name ?? ''];
      return typeof res === 'function' ? (res as any)(...args) : res;
    },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    recruitment: {
      listVacancies: { _name: 'listVacancies' },
      getPipelineStats: { _name: 'getPipelineStats' },
      getMyInterviews: { _name: 'getMyInterviews' },
      getCandidate: { _name: 'getCandidate' },
      listCandidatesByVacancy: { _name: 'listCandidatesByVacancy' },
      getVacancy: { _name: 'getVacancy' },
      createVacancy: { _name: 'createVacancy' },
      addCandidate: { _name: 'addCandidate' },
      moveCandidate: { _name: 'moveCandidate' },
      rejectCandidate: { _name: 'rejectCandidate' },
      deleteCandidate: { _name: 'deleteCandidate' },
      deleteVacancy: { _name: 'deleteVacancy' },
      updateVacancy: { _name: 'updateVacancy' },
    },
    recruitmentAI: { generateVacancyDescription: { _name: 'generateVacancyDescription' } },
    emailValidation: { validateEmail: { _name: 'validateEmail' } },
  },
}));

let mockUser: any = { id: 'user-1', organizationId: 'org-1', role: 'admin' };
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
            title: 'Restored Vacancy',
            department: 'Eng',
            location: 'Yerevan',
            employmentType: 'part_time',
            description: 'desc',
            requirements: 'req',
            salaryMin: '1000',
            salaryMax: '2000',
            currency: 'USD',
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

jest.mock('@/hooks/useMainRef', () => ({
  useMainRef: () => ({ current: null }),
}));

jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => 'org-1',
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

jest.mock('@/components/ui/label', () => ({
  Label: ({ children }: any) => <label>{children}</label>,
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
    'Briefcase',
    'Plus',
    'Users',
    'ChevronRight',
    'ChevronLeft',
    'CheckCircle',
    'Check',
    'XCircle',
    'Calendar',
    'Star',
    'ArrowRight',
    'Mail',
    'Phone',
    'MapPin',
    'Clock',
    'FileText',
    'UserPlus',
    'TrendingUp',
    'Pencil',
    'Trash2',
    'Sparkles',
  ];
  const mocks: Record<string, any> = {};
  for (const name of icons) {
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  }
  return mocks;
});

import RecruitmentClient from '@/components/RecruitmentClient';
import { toast } from 'sonner';

const VACANCIES = [
  {
    _id: 'vac-1',
    title: 'Senior Frontend Developer',
    status: 'open',
    department: 'Engineering',
    location: 'Yerevan',
    candidateCount: 3,
    stageCounts: { applied: 1, screening: 1, interview: 1, offer: 0, hired: 0 },
  },
  {
    _id: 'vac-2',
    title: 'Product Manager',
    status: 'paused',
    department: 'Product',
    candidateCount: 0,
    stageCounts: { applied: 0, screening: 0, interview: 0, offer: 0, hired: 0 },
  },
];

const STATS = {
  openVacancies: 1,
  totalCandidates: 3,
  pipeline: { hired: 1, interview: 1 },
};

const MY_INTERVIEWS = [
  {
    _id: 'int-1',
    candidateName: 'Anna Petrova',
    vacancyTitle: 'Senior Frontend Developer',
    type: 'technical',
    scheduledAt: '2026-02-01T10:00:00Z',
    duration: 60,
  },
];

const CANDIDATES = [
  { _id: 'app-1', stage: 'applied', candidate: { name: 'Anna Petrova' }, avgScore: 4.5 },
];

const CANDIDATE_DETAIL = {
  candidate: {
    name: 'Anna Petrova',
    email: 'anna@example.com',
    phone: '+374 55 123 456',
    resumeText: 'Senior frontend developer with 6 years of experience.',
  },
  vacancy: { title: 'Senior Frontend Developer' },
  interviews: [],
  scorecards: [],
  events: [],
  stage: 'applied',
};

const VACANCY_DETAIL = {
  _id: 'vac-1',
  title: 'Senior Frontend Developer',
  department: 'Engineering',
  location: 'Yerevan',
  employmentType: 'full_time',
  description: 'Build great UI',
  requirements: 'React, TypeScript',
  salary: { min: 100, max: 200, currency: 'USD' },
  status: 'open',
};

describe('RecruitmentClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mutationCalls.length = 0;
    actionCalls.length = 0;
    actionResults = {};
    mockUser = { id: 'user-1', organizationId: 'org-1', role: 'admin' };
    queryResults = {
      listVacancies: VACANCIES,
      getPipelineStats: STATS,
      getMyInterviews: MY_INTERVIEWS,
    };
    // jsdom lacks window.scrollTo
    window.scrollTo = jest.fn() as any;
    mockDraft = {
      restored: false,
      restoredStep: 0,
      clearDraft: jest.fn(() => {
        mockDraft.restored = false;
      }),
    };
    sessionStorage.clear();
  });

  it('shows a loader when there is no user', () => {
    mockUser = null;
    render(<RecruitmentClient />);
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('shows a loader while vacancies are loading', () => {
    queryResults = { listVacancies: undefined, getPipelineStats: STATS, getMyInterviews: [] };
    render(<RecruitmentClient />);
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('renders the header and stats', () => {
    render(<RecruitmentClient />);
    expect(screen.getByText('Recruitment')).toBeInTheDocument();
    expect(
      screen.getByText('Manage vacancies, candidates, and hiring pipeline'),
    ).toBeInTheDocument();
    expect(screen.getByText('Open Vacancies')).toBeInTheDocument();
    expect(screen.getByText('Total Candidates')).toBeInTheDocument();
    expect(screen.getByText('Hired')).toBeInTheDocument();
    expect(screen.getByText('In Interview')).toBeInTheDocument();
  });

  it('renders each vacancy with title, status and candidate count', () => {
    render(<RecruitmentClient />);
    expect(screen.getByText('Senior Frontend Developer')).toBeInTheDocument();
    expect(screen.getByText('Product Manager')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('3 candidates')).toBeInTheDocument();
  });

  it('shows an empty state when there are no vacancies', () => {
    queryResults = { listVacancies: [], getPipelineStats: STATS, getMyInterviews: [] };
    render(<RecruitmentClient />);
    expect(screen.getByText('No vacancies yet')).toBeInTheDocument();
    expect(screen.getAllByText('New Vacancy').length).toBeGreaterThan(0);
  });

  it('hides admin-only controls for non-admin users', () => {
    mockUser = { id: 'user-1', organizationId: 'org-1', role: 'employee' };
    render(<RecruitmentClient />);
    expect(screen.queryByText('New Vacancy')).not.toBeInTheDocument();
  });

  it('creates a vacancy through the wizard', async () => {
    render(<RecruitmentClient />);
    fireEvent.click(screen.getByText('New Vacancy'));

    // Step 1: title required before Next
    const nextButton = () => screen.getByText('Next');
    expect((nextButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('e.g. Senior Frontend Developer'), {
      target: { value: 'Backend Engineer' },
    });
    fireEvent.click(nextButton());

    // Step 2: fill description + requirements
    fireEvent.change(screen.getByPlaceholderText('Describe the role, responsibilities...'), {
      target: { value: 'Build APIs' },
    });
    fireEvent.change(screen.getByPlaceholderText('Skills, experience, education...'), {
      target: { value: 'Node.js' },
    });
    fireEvent.click(screen.getByText('Next'));

    // Step 3: review shows the title, then create
    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Create Vacancy')[1]); // submit button (0 = dialog title)

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'createVacancy',
            args: [
              expect.objectContaining({
                organizationId: 'org-1',
                title: 'Backend Engineer',
                description: 'Build APIs',
                requirements: 'Node.js',
                employmentType: 'full_time',
              }),
            ],
          }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Vacancy created');
  });

  it('restores a draft into the form and jumps to the saved step', () => {
    mockDraft.restored = true;
    mockDraft.restoredStep = 1; // description step
    render(<RecruitmentClient />);
    fireEvent.click(screen.getByText('New Vacancy'));

    expect(screen.getByTestId('draft-notice')).toBeTruthy();
    expect(screen.getByTestId('draft-notice').getAttribute('data-step')).toBe('1');
    // Description step with the restored content and salary range.
    expect(screen.getByDisplayValue('desc')).toBeTruthy();
    expect(screen.getByDisplayValue('req')).toBeTruthy();
    expect(screen.getByDisplayValue('1000')).toBeTruthy();
    expect(screen.getByDisplayValue('2000')).toBeTruthy();

    // Back on the job-info step: restored title and location.
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByDisplayValue('Restored Vacancy')).toBeTruthy();
    expect(screen.getByDisplayValue('Yerevan')).toBeTruthy();
  });

  it('start over clears the draft and resets the form', () => {
    mockDraft.restored = true;
    mockDraft.restoredStep = 1;
    render(<RecruitmentClient />);
    fireEvent.click(screen.getByText('New Vacancy'));

    fireEvent.click(screen.getByText('Start over'));

    expect(mockDraft.clearDraft).toHaveBeenCalled();
    expect(screen.queryByTestId('draft-notice')).toBeNull();
    expect(screen.getByPlaceholderText('e.g. Senior Frontend Developer')).toHaveValue('');
  });

  it('clears the draft after a successful save', async () => {
    render(<RecruitmentClient />);
    fireEvent.click(screen.getByText('New Vacancy'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Senior Frontend Developer'), {
      target: { value: 'Backend Engineer' },
    });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.change(screen.getByPlaceholderText('Describe the role, responsibilities...'), {
      target: { value: 'Build APIs' },
    });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getAllByText('Create Vacancy')[1]);

    await waitFor(() =>
      expect(mutationCalls).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'createVacancy' })]),
      ),
    );
    expect(mockDraft.clearDraft).toHaveBeenCalled();
  });

  it('does not show the draft notice when nothing was restored', () => {
    render(<RecruitmentClient />);
    fireEvent.click(screen.getByText('New Vacancy'));
    expect(screen.queryByTestId('draft-notice')).toBeNull();
  });

  it('keeps the Next button disabled until a title is entered', () => {
    render(<RecruitmentClient />);
    fireEvent.click(screen.getByText('New Vacancy'));
    expect((screen.getByText('Next') as HTMLButtonElement).disabled).toBe(true);
  });

  it('generates a description with AI when a title is present', async () => {
    actionResults['generateVacancyDescription'] = {
      description: 'AI generated description',
      requirements: 'AI generated requirements',
    };
    render(<RecruitmentClient />);
    fireEvent.click(screen.getByText('New Vacancy'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Senior Frontend Developer'), {
      target: { value: 'Backend Engineer' },
    });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Generate with AI'));

    await waitFor(() => {
      expect(actionCalls).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'generateVacancyDescription' })]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Description generated!');
    expect(screen.getByDisplayValue('AI generated description')).toBeInTheDocument();
    expect(screen.getByDisplayValue('AI generated requirements')).toBeInTheDocument();
  });

  it('validates the email before adding a candidate', async () => {
    actionResults['validateEmail'] = { valid: false, reason: 'invalid_format' };
    render(<RecruitmentClient />);
    fireEvent.click(screen.getAllByText('Add')[0]);

    fireEvent.change(screen.getByPlaceholderText('John Doe'), {
      target: { value: 'Anna Petrova' },
    });
    fireEvent.change(screen.getByPlaceholderText('john@example.com'), {
      target: { value: 'bad-email' },
    });
    const submit = within(screen.getByTestId('dialog-content')).getByText('Add');
    fireEvent.click(submit);

    await waitFor(() => {
      expect(screen.getByText('Invalid email format')).toBeInTheDocument();
    });
    expect(mutationCalls.filter((c) => c.name === 'addCandidate').length).toBe(0);
  });

  it('adds a candidate when the email is valid', async () => {
    actionResults['validateEmail'] = { valid: true };
    render(<RecruitmentClient />);
    fireEvent.click(screen.getAllByText('Add')[0]);

    fireEvent.change(screen.getByPlaceholderText('John Doe'), {
      target: { value: 'Anna Petrova' },
    });
    fireEvent.change(screen.getByPlaceholderText('john@example.com'), {
      target: { value: 'anna@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Brief summary or paste resume...'), {
      target: { value: 'Strong React developer' },
    });
    const submit = within(screen.getByTestId('dialog-content')).getByText('Add');
    fireEvent.click(submit);

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'addCandidate',
            args: [
              expect.objectContaining({
                vacancyId: 'vac-1',
                name: 'Anna Petrova',
                email: 'anna@example.com',
                resumeText: 'Strong React developer',
                source: 'manual',
              }),
            ],
          }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Candidate added');
  });

  it('deletes a vacancy after confirmation', async () => {
    render(<RecruitmentClient />);
    fireEvent.click(screen.getAllByTestId('icon-Trash2')[0]); // trash icon on first vacancy row
    expect(screen.getByText('Confirm Deletion')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'deleteVacancy',
            args: [{ vacancyId: 'vac-1' }],
          }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Vacancy deleted');
  });

  it('shows the pipeline tab with open vacancies and a kanban board', () => {
    queryResults['listCandidatesByVacancy'] = CANDIDATES;
    render(<RecruitmentClient />);
    fireEvent.click(screen.getByText('Pipeline'));

    expect(screen.getByText('Select a vacancy to view pipeline:')).toBeInTheDocument();
    // Only open vacancies are listed
    fireEvent.click(screen.getByText('Senior Frontend Developer'));

    expect(screen.getByText('Anna Petrova')).toBeInTheDocument();
    expect(screen.getByText('4.5')).toBeInTheDocument();
  });

  it('moves a candidate forward in the pipeline', async () => {
    queryResults['listCandidatesByVacancy'] = CANDIDATES;
    render(<RecruitmentClient />);
    fireEvent.click(screen.getByText('Pipeline'));
    fireEvent.click(screen.getByText('Senior Frontend Developer'));

    fireEvent.click(screen.getAllByTestId('icon-ArrowRight')[0]); // move arrow on the card
    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'moveCandidate',
            args: [{ applicationId: 'app-1', newStage: 'screening', userId: 'user-1' }],
          }),
        ]),
      );
    });
  });

  it('opens the candidate detail dialog and shows candidate info', () => {
    queryResults['listCandidatesByVacancy'] = CANDIDATES;
    queryResults['getCandidate'] = CANDIDATE_DETAIL;
    render(<RecruitmentClient />);
    fireEvent.click(screen.getByText('Pipeline'));
    fireEvent.click(screen.getByText('Senior Frontend Developer'));

    fireEvent.click(screen.getByText('Anna Petrova'));
    const dialog = screen.getByTestId('dialog');
    expect(within(dialog).getByText('anna@example.com')).toBeInTheDocument();
    expect(within(dialog).getByText(/Applied to/)).toBeInTheDocument();
    expect(within(dialog).getByText('screening')).toBeInTheDocument(); // next-stage button
  });

  it('rejects a candidate from the detail dialog', async () => {
    queryResults['listCandidatesByVacancy'] = CANDIDATES;
    queryResults['getCandidate'] = CANDIDATE_DETAIL;
    render(<RecruitmentClient />);
    fireEvent.click(screen.getByText('Pipeline'));
    fireEvent.click(screen.getByText('Senior Frontend Developer'));
    fireEvent.click(screen.getByText('Anna Petrova'));

    fireEvent.click(screen.getByText('Reject'));
    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'rejectCandidate',
            args: [{ applicationId: 'app-1', userId: 'user-1' }],
          }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Candidate rejected');
  });

  it('removes a candidate from the detail dialog', async () => {
    queryResults['listCandidatesByVacancy'] = CANDIDATES;
    queryResults['getCandidate'] = CANDIDATE_DETAIL;
    render(<RecruitmentClient />);
    fireEvent.click(screen.getByText('Pipeline'));
    fireEvent.click(screen.getByText('Senior Frontend Developer'));
    fireEvent.click(screen.getByText('Anna Petrova'));

    fireEvent.click(screen.getByText('Remove'));
    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'deleteCandidate',
            args: [{ applicationId: 'app-1' }],
          }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Candidate removed');
  });

  it('shows my interviews in the interviews tab', () => {
    render(<RecruitmentClient />);
    fireEvent.click(screen.getByText('My Interviews'));
    expect(screen.getByText('Anna Petrova')).toBeInTheDocument();
    expect(screen.getByText('Senior Frontend Developer')).toBeInTheDocument();
  });

  it('shows an empty interviews state', () => {
    queryResults['getMyInterviews'] = [];
    render(<RecruitmentClient />);
    fireEvent.click(screen.getByText('My Interviews'));
    expect(screen.getByText('No upcoming interviews')).toBeInTheDocument();
  });

  it('loads and saves an edited vacancy', async () => {
    queryResults['getVacancy'] = VACANCY_DETAIL;
    render(<RecruitmentClient />);

    // The pencil (edit) button on the first vacancy row
    fireEvent.click(screen.getAllByTestId('icon-Pencil')[0]);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Build great UI')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByDisplayValue('Build great UI'), {
      target: { value: 'Build excellent UI' },
    });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'updateVacancy',
            args: [
              expect.objectContaining({
                vacancyId: 'vac-1',
                title: 'Senior Frontend Developer',
                description: 'Build excellent UI',
              }),
            ],
          }),
        ]),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Vacancy updated');
  });
});
