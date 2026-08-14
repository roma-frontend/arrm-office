/**
 * Tests for SurveysClient (src/components/SurveysClient.tsx): the survey list
 * with status filters and admin actions, the 3-step create wizard (info →
 * questions → review) with dnd-kit reordering and multiple-choice options, the
 * take-survey dialog (rating/nps/multiple_choice/yes_no/text + required
 * validation + anonymity), and the results dialog (distribution bars,
 * optionCounts, yes/no and text responses).
 *
 * Convex queries are dispatched by _name; mutations are captured per name.
 * dnd-kit is mocked: DndContext records its onDragEnd so reorders are driven
 * directly, SortableQuestion's useSortable returns inert values.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { Id } from '../../convex/_generated/dataModel';

// ── Mutable fixtures (declared before jest.mock factories reference them) ─────
let mockUser: any = { id: 'u1', name: 'Anna', role: 'admin', organizationId: 'org-1' };
let mockOrgId: string | null = 'org-1';
let mockSurveys: any = undefined;
let mockTakeSurvey: any = undefined;
let mockResults: any = undefined;
let mockDragEndHandler: ((e: any) => void) | null = null;

// ── Draft (controllable) ─────────────────────────────────────────────────────
let mockDraft: { restored: boolean; restoredStep: number; clearDraft: jest.Mock };
jest.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: (opts: any) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    React.useEffect(() => {
      if (mockDraft.restored) {
        opts.onRestore?.(
          {
            title: 'Restored Survey',
            description: 'desc',
            isAnonymous: false,
            questions: [
              { type: 'rating', text: 'Q1', isRequired: true },
              { type: 'text', text: 'Q2', isRequired: false },
            ],
            newQuestion: { type: 'rating', text: '', isRequired: true },
            newOption: '',
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
  peekWizardDraft: jest.fn(),
  clearWizardDraft: jest.fn(),
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
const mockPush = jest.fn();
const mockScrollTo = jest.fn();
const mockCreateSurvey = jest.fn(async () => undefined);
const mockSubmitResponse = jest.fn(async () => undefined);
const mockPublish = jest.fn(async () => undefined);
const mockClose = jest.fn(async () => undefined);
const mockDelete = jest.fn(async () => undefined);

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) => {
      if (typeof fallback === 'string') return fallback;
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/hooks/useMainRef', () => ({
  useMainRef: () => ({ current: { scrollTo: mockScrollTo } }),
}));

jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => mockOrgId,
}));

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector?: any) => {
    const state = { user: mockUser };
    return selector ? selector(state) : state;
  },
  useAuthUser: () => mockUser,
}));

// ── Convex ───────────────────────────────────────────────────────────────────
jest.mock('../../convex/_generated/api', () => ({
  api: {
    surveys: {
      listSurveys: { _name: 'surveys.listSurveys' },
      getSurveyWithQuestions: { _name: 'surveys.getSurveyWithQuestions' },
      getSurveyResults: { _name: 'surveys.getSurveyResults' },
      createSurvey: { _name: 'surveys.createSurvey' },
      submitResponse: { _name: 'surveys.submitResponse' },
      publishSurvey: { _name: 'surveys.publishSurvey' },
      closeSurvey: { _name: 'surveys.closeSurvey' },
      deleteSurvey: { _name: 'surveys.deleteSurvey' },
    },
  },
}));

jest.mock('convex/react', () => ({
  useQuery: (q: any) => {
    if (!q || q === 'skip') return undefined;
    if (q._name === 'surveys.listSurveys') return mockSurveys;
    if (q._name === 'surveys.getSurveyWithQuestions') return mockTakeSurvey;
    return undefined;
  },
  useMutation: (m: any) => {
    switch (m._name) {
      case 'surveys.createSurvey':
        return mockCreateSurvey;
      case 'surveys.submitResponse':
        return mockSubmitResponse;
      case 'surveys.publishSurvey':
        return mockPublish;
      case 'surveys.closeSurvey':
        return mockClose;
      case 'surveys.deleteSurvey':
        return mockDelete;
      default:
        return jest.fn();
    }
  },
}));

jest.mock('@/lib/convex-typed', () => ({
  useTypedQuery: (q: any) => {
    if (!q || q === 'skip') return undefined;
    if (q._name === 'surveys.getSurveyResults') return mockResults;
    return undefined;
  },
}));

// ── UI primitives ────────────────────────────────────────────────────────────
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...p }: any) => (
    <button onClick={onClick} disabled={disabled} {...p}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, onClick, ...p }: any) => (
    <div data-testid="card" onClick={onClick} {...p}>
      {children}
    </div>
  ),
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: any) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: any) => <div data-testid="card-title">{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...p }: any) => (
    <span data-testid="badge" {...p}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/tabs', () => {
  const Tabs = ({ value, onValueChange, children }: any) => {
    const triggers: any[] = [];
    React.Children.forEach(children, (list: any) => {
      React.Children.forEach(list?.props?.children, (tr: any) => {
        if (tr?.props?.value) triggers.push(tr);
      });
    });
    return (
      <div data-testid="tabs">
        <button data-testid={`tab-current-${value}`}>{value}</button>
        <div data-testid="tab-options">
          {triggers.map((tr) => (
            <button
              key={tr.props.value}
              data-testid={`tab-${tr.props.value}`}
              onClick={() => onValueChange(tr.props.value)}
            >
              {tr.props.children}
            </button>
          ))}
        </div>
      </div>
    );
  };
  return {
    Tabs,
    TabsList: ({ children }: any) => <>{children}</>,
    TabsTrigger: ({ children }: any) => <>{children}</>,
  };
});

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, children, onOpenChange }: any) =>
    open ? (
      <>
        <button data-testid="sheet-close" onClick={() => onOpenChange(false)}>
          close
        </button>
        {children}
      </>
    ) : null,
  SheetContent: ({ children }: any) => <div data-testid="sheet-content">{children}</div>,
  SheetHeader: ({ children }: any) => <div data-testid="sheet-header">{children}</div>,
  SheetBody: ({ children }: any) => <div data-testid="sheet-body">{children}</div>,
  SheetFooter: ({ children }: any) => <div data-testid="sheet-footer">{children}</div>,
  SheetTitle: ({ children }: any) => <h2 data-testid="sheet-title">{children}</h2>,
}));

jest.mock('@/components/ui/wizard-stepper', () => ({
  WizardStepper: ({ steps, current }: any) => (
    <div data-testid="wizard-stepper" data-current={current}>
      {steps.map((s: any) => (
        <span key={s.id}>{s.title}</span>
      ))}
    </div>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, placeholder, ...p }: any) => (
    <input
      data-testid="input-text"
      value={value ?? ''}
      onChange={onChange}
      placeholder={placeholder}
      {...p}
    />
  ),
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: ({ value, onChange, placeholder, ...p }: any) => (
    <textarea
      data-testid="input-textarea"
      value={value ?? ''}
      onChange={onChange}
      placeholder={placeholder}
      {...p}
    />
  ),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <span data-testid="shield-loader" />,
}));

// ── dnd-kit (driven directly through the recorded onDragEnd) ─────────────────
jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }: any) => {
    mockDragEndHandler = onDragEnd;
    return <div data-testid="dnd-context">{children}</div>;
  },
  closestCenter: jest.fn(),
  KeyboardSensor: jest.fn(),
  PointerSensor: jest.fn(),
  useSensor: (s: any) => s,
  useSensors: (...s: any[]) => s,
}));

jest.mock('@dnd-kit/sortable', () => ({
  arrayMove: (arr: any[], from: number, to: number) => {
    const copy = [...arr];
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved);
    return copy;
  },
  SortableContext: ({ children }: any) => <div data-testid="sortable-context">{children}</div>,
  sortableKeyboardCoordinates: jest.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: '',
    isDragging: false,
  }),
  verticalListSortingStrategy: jest.fn(),
}));

jest.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

// ── Icons / toast ────────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const names = [
    'ClipboardList',
    'Plus',
    'BarChart3',
    'Users',
    'CheckCircle',
    'ChevronLeft',
    'ChevronRight',
    'Send',
    'Trash2',
    'Play',
    'Square',
    'Star',
    'MessageSquare',
    'ThumbsUp',
    'ThumbsDown',
    'Hash',
    'GripVertical',
  ];
  const mocks: Record<string, any> = {};
  for (const name of names) {
    mocks[name] = (props: any) => (
      <span data-testid={`icon-${name}`} {...props}>
        {name}
      </span>
    );
  }
  return mocks;
});

const mockToast = jest.fn();
mockToast.error = jest.fn();
mockToast.success = jest.fn();
jest.mock('sonner', () => ({ toast: mockToast }));

// Component import (after the mocks — fixture vars must be initialised first).
// eslint-disable-next-line import/first
import { SurveysClient } from '@/components/SurveysClient';

// ── Fixtures ─────────────────────────────────────────────────────────────────
const draftSurvey = {
  _id: 's1' as Id<'surveys'>,
  title: 'Onboarding feedback',
  status: 'draft',
  isAnonymous: true,
  description: 'How was onboarding?',
  responseCount: 0,
  creator: { name: 'Anna' },
};

const activeSurvey = {
  _id: 's2' as Id<'surveys'>,
  title: 'Engagement pulse',
  status: 'active',
  isAnonymous: false,
  description: 'Monthly check-in',
  responseCount: 7,
  creator: { name: 'Bob' },
};

const closedSurvey = {
  _id: 's3' as Id<'surveys'>,
  title: 'Office snacks',
  status: 'closed',
  isAnonymous: true,
  responseCount: 3,
};

const takeSurvey = {
  _id: 's2' as Id<'surveys'>,
  title: 'Engagement pulse',
  description: 'Monthly check-in',
  isAnonymous: true,
  questions: [
    { _id: 'q1' as Id<'surveyQuestions'>, type: 'rating', text: 'Rate us', isRequired: true },
    { _id: 'q2' as Id<'surveyQuestions'>, type: 'nps', text: 'How likely?', isRequired: true },
    {
      _id: 'q3' as Id<'surveyQuestions'>,
      type: 'multiple_choice',
      text: 'Pick a topic',
      options: ['Salary', 'Remote'],
      isRequired: false,
    },
    {
      _id: 'q4' as Id<'surveyQuestions'>,
      type: 'yes_no',
      text: 'Would you recommend?',
      isRequired: false,
    },
    { _id: 'q5' as Id<'surveyQuestions'>, type: 'text', text: 'Anything else?', isRequired: false },
  ],
};

const results = {
  survey: { title: 'Engagement pulse' },
  totalResponses: 10,
  questionResults: [
    {
      question: { _id: 'q1' as Id<'surveyQuestions'>, type: 'rating', text: 'Rate us' },
      totalResponses: 10,
      average: 4.2,
      distribution: { 3: 2, 5: 8 },
    },
    {
      question: { _id: 'q2' as Id<'surveyQuestions'>, type: 'nps', text: 'How likely?' },
      totalResponses: 10,
      average: 8.1,
      distribution: { 8: 5, 10: 5 },
    },
    {
      question: {
        _id: 'q3' as Id<'surveyQuestions'>,
        type: 'multiple_choice',
        text: 'Pick a topic',
      },
      totalResponses: 10,
      optionCounts: { Salary: 6, Remote: 4 },
    },
    {
      question: {
        _id: 'q4' as Id<'surveyQuestions'>,
        type: 'yes_no',
        text: 'Would you recommend?',
      },
      totalResponses: 10,
      yesCount: 7,
      noCount: 3,
    },
    {
      question: { _id: 'q5' as Id<'surveyQuestions'>, type: 'text', text: 'Anything else?' },
      totalResponses: 1,
      textResponses: ['Great platform'],
    },
    {
      question: { _id: 'q6' as Id<'surveyQuestions'>, type: 'text', text: 'No answers yet' },
      totalResponses: 0,
      textResponses: [],
    },
  ],
};

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

/** The wizard's submit button on the review step (header + title also say it). */
function wizardSubmitButton(): HTMLElement {
  const btn = screen
    .getAllByRole('button')
    .find(
      (b) =>
        b.textContent?.includes('surveys.createSurvey') && b.textContent?.includes('CheckCircle'),
    );
  expect(btn).toBeTruthy();
  return btn!;
}

beforeEach(() => {
  mockUser = { id: 'u1', name: 'Anna', role: 'admin', organizationId: 'org-1' };
  mockOrgId = 'org-1';
  mockSurveys = undefined;
  mockTakeSurvey = undefined;
  mockResults = undefined;
  mockDragEndHandler = null;
  mockPush.mockClear();
  mockScrollTo.mockClear();
  mockCreateSurvey.mockClear();
  mockSubmitResponse.mockClear();
  mockPublish.mockClear();
  mockClose.mockClear();
  mockDelete.mockClear();
  (mockCreateSurvey as jest.Mock).mockResolvedValue(undefined);
  (mockSubmitResponse as jest.Mock).mockResolvedValue(undefined);
  (mockPublish as jest.Mock).mockResolvedValue(undefined);
  (mockClose as jest.Mock).mockResolvedValue(undefined);
  (mockDelete as jest.Mock).mockResolvedValue(undefined);
  mockToast.mockClear();
  mockToast.error.mockClear();
  mockToast.success.mockClear();
  mockDraft = {
    restored: false,
    restoredStep: 0,
    clearDraft: jest.fn(() => {
      mockDraft.restored = false;
    }),
  };
  sessionStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('SurveysClient — loading & list', () => {
  it('shows the loader when there is no user', async () => {
    mockUser = null;
    render(<SurveysClient />);
    await flush();
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('shows the loader when there is no organization', async () => {
    mockUser = { id: 'u1', name: 'Anna', role: 'admin' };
    mockOrgId = null;
    render(<SurveysClient />);
    await flush();
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('renders the empty state with the create-first action for admins', async () => {
    mockSurveys = [];
    render(<SurveysClient />);
    await flush();
    expect(screen.getByText('surveys.empty')).toBeInTheDocument();
    fireEvent.click(screen.getByText('surveys.createFirst'));
    await flush();
    // the wizard opened ("create survey" also labels the header button)
    expect(screen.getByText('surveys.wizard.surveyInfo')).toBeInTheDocument();
    expect(mockScrollTo).toHaveBeenCalled();
  });

  it('renders surveys with status, anonymous and creator meta', async () => {
    mockSurveys = [draftSurvey, activeSurvey, closedSurvey];
    render(<SurveysClient />);
    await flush();

    expect(screen.getByText('Onboarding feedback')).toBeInTheDocument();
    expect(screen.getByText('Engagement pulse')).toBeInTheDocument();
    expect(screen.getByText('Office snacks')).toBeInTheDocument();
    // status + anonymous badges (t returns the key)
    expect(screen.getByText('surveys.status.draft')).toBeInTheDocument();
    expect(screen.getByText('surveys.status.active')).toBeInTheDocument();
    expect(screen.getByText('surveys.status.closed')).toBeInTheDocument();
    expect(screen.getAllByText('surveys.anonymous').length).toBeGreaterThanOrEqual(2);
    // creator + response count (createdBy is rendered inline with the name)
    expect(screen.getAllByText(/surveys.createdBy/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/surveys.responses/).length).toBeGreaterThanOrEqual(2);
  });

  it('filters the list by status', async () => {
    mockSurveys = [draftSurvey, activeSurvey];
    render(<SurveysClient />);
    await flush();

    fireEvent.click(screen.getByTestId('tab-active'));
    await flush();
    // listSurveys is re-queried with the status — re-render reflects the mock
    expect(screen.getByTestId('tab-current-active')).toBeInTheDocument();
  });

  it('navigates to the survey detail on card click', async () => {
    mockSurveys = [draftSurvey];
    render(<SurveysClient />);
    await flush();

    fireEvent.click(screen.getByText('Onboarding feedback').closest('[data-testid="card"]')!);
    await flush();
    expect(mockPush).toHaveBeenCalledWith('/surveys/s1');
  });

  it('hides admin actions and the create button for non-admin users', async () => {
    mockUser = { id: 'u1', name: 'Anna', role: 'employee', organizationId: 'org-1' };
    mockSurveys = [draftSurvey, activeSurvey];
    render(<SurveysClient />);
    await flush();

    expect(screen.queryByText('surveys.createSurvey')).toBeNull();
    expect(screen.queryByTestId('icon-BarChart3')).toBeNull();
    expect(screen.queryByTestId('icon-Play')).toBeNull();
    expect(screen.queryByTestId('icon-Trash2')).toBeNull();
    // the take action on an active survey is still available
    expect(screen.getByText('surveys.take')).toBeInTheDocument();
  });
});

describe('SurveysClient — admin actions', () => {
  it('publishes a draft survey', async () => {
    mockSurveys = [draftSurvey];
    render(<SurveysClient />);
    await flush();

    fireEvent.click(screen.getByTestId('icon-Play'));
    await flush();
    await waitFor(() => expect(mockPublish).toHaveBeenCalled());
    expect(mockPublish).toHaveBeenCalledWith({ surveyId: 's1', organizationId: 'org-1' });
    expect(mockToast.success).toHaveBeenCalledWith('surveys.published');
  });

  it('closes an active survey', async () => {
    mockSurveys = [activeSurvey];
    render(<SurveysClient />);
    await flush();

    fireEvent.click(screen.getByTestId('icon-Square'));
    await flush();
    await waitFor(() => expect(mockClose).toHaveBeenCalled());
    expect(mockClose).toHaveBeenCalledWith({ surveyId: 's2', organizationId: 'org-1' });
    expect(mockToast.success).toHaveBeenCalledWith('surveys.closed');
  });

  it('deletes a draft survey', async () => {
    mockSurveys = [draftSurvey];
    render(<SurveysClient />);
    await flush();

    fireEvent.click(screen.getByTestId('icon-Trash2'));
    await flush();
    await waitFor(() => expect(mockDelete).toHaveBeenCalled());
    expect(mockDelete).toHaveBeenCalledWith({ surveyId: 's1', organizationId: 'org-1' });
    expect(mockToast.success).toHaveBeenCalledWith('surveys.deleted');
  });

  it('surfaces an error when publishing fails', async () => {
    mockSurveys = [draftSurvey];
    (mockPublish as jest.Mock).mockRejectedValueOnce(new Error('publish boom'));
    render(<SurveysClient />);
    await flush();

    fireEvent.click(screen.getByTestId('icon-Play'));
    await flush();
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('publish boom'));
  });

  it('surfaces an error when closing fails', async () => {
    mockSurveys = [activeSurvey];
    (mockClose as jest.Mock).mockRejectedValueOnce(new Error('close boom'));
    render(<SurveysClient />);
    await flush();

    fireEvent.click(screen.getByTestId('icon-Square'));
    await flush();
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('close boom'));
  });

  it('surfaces an error when deleting fails', async () => {
    mockSurveys = [draftSurvey];
    (mockDelete as jest.Mock).mockRejectedValueOnce(new Error('delete boom'));
    render(<SurveysClient />);
    await flush();

    fireEvent.click(screen.getByTestId('icon-Trash2'));
    await flush();
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('delete boom'));
  });

  it('opens the wizard from the sticky header button', async () => {
    mockSurveys = [activeSurvey];
    render(<SurveysClient />);
    await flush();

    const headerBtn = screen
      .getAllByRole('button')
      .find(
        (b) => b.textContent?.includes('surveys.createSurvey') && b.textContent?.includes('Plus'),
      );
    expect(headerBtn).toBeTruthy();
    fireEvent.click(headerBtn!);
    await flush();
    expect(screen.getByText('surveys.wizard.surveyInfo')).toBeInTheDocument();
    expect(mockScrollTo).toHaveBeenCalled();
  });
});

describe('SurveysClient — create wizard', () => {
  async function openWizard() {
    mockSurveys = [];
    render(<SurveysClient />);
    await flush();
    fireEvent.click(screen.getByText('surveys.createFirst'));
    await flush();
  }

  it('requires a title before leaving the info step', async () => {
    await openWizard();
    expect(screen.getByText('surveys.wizard.surveyInfo')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('surveys.form.titlePlaceholder')).toBeInTheDocument();
    // Next is disabled without a title
    expect(screen.getByText('common.next').closest('button')).toBeDisabled();

    fireEvent.change(screen.getByTestId('input-text'), { target: { value: 'Pulse' } });
    await flush();
    expect(screen.getByText('common.next').closest('button')).toBeEnabled();

    // anonymous is checked by default; unchecking updates the draft
    const anonymous = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(anonymous.checked).toBe(true);
    fireEvent.click(anonymous);
    await flush();
    expect(anonymous.checked).toBe(false);

    // cancel on the first step closes the wizard
    fireEvent.click(screen.getByText('common.cancel'));
    await flush();
    expect(screen.queryByText('surveys.wizard.surveyInfo')).toBeNull();
  });

  it('requires at least one question on the questions step', async () => {
    await openWizard();
    fireEvent.change(screen.getByTestId('input-text'), { target: { value: 'Pulse' } });
    await flush();
    fireEvent.click(screen.getByText('common.next'));
    await flush();

    expect(screen.getByText('surveys.wizard.questions')).toBeInTheDocument();
    // Next disabled without questions
    expect(screen.getByText('common.next').closest('button')).toBeDisabled();

    // back returns to the info step
    fireEvent.click(screen.getByText('common.back'));
    await flush();
    expect(screen.getByPlaceholderText('surveys.form.titlePlaceholder')).toBeInTheDocument();
    fireEvent.click(screen.getByText('common.next'));
    await flush();

    // add-question button disabled without text
    expect(screen.getByText('surveys.form.addQuestionBtn').closest('button')).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('surveys.form.questionTextPlaceholder'), {
      target: { value: 'How are you?' },
    });
    // uncheck the required flag (the anonymous checkbox lives on step 1)
    const requiredCheckbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(requiredCheckbox);
    await flush();
    fireEvent.click(screen.getByText('surveys.form.addQuestionBtn'));
    await flush();
    expect(screen.getByText('How are you?')).toBeInTheDocument();
    expect(screen.getByText('common.next').closest('button')).toBeEnabled();
  });

  it('builds multiple-choice options via the button and Enter', async () => {
    await openWizard();
    fireEvent.change(screen.getByTestId('input-text'), { target: { value: 'Pulse' } });
    await flush();
    fireEvent.click(screen.getByText('common.next'));
    await flush();

    // switch the question type to multiple choice
    fireEvent.click(screen.getByText('surveys.questionType.multipleChoice'));
    await flush();
    const optionInput = screen.getByPlaceholderText('surveys.form.addOption');

    fireEvent.change(optionInput, { target: { value: 'Salary' } });
    await flush();
    // the add-option button is the sibling of the option input
    const addOptionBtn = optionInput.parentElement!.querySelector('button')!;
    fireEvent.click(addOptionBtn);
    await flush();
    expect(screen.getByText('Salary')).toBeInTheDocument();

    // Enter adds another option
    fireEvent.change(optionInput, { target: { value: 'Remote' } });
    fireEvent.keyDown(optionInput, { key: 'Enter', code: 'Enter' });
    await flush();
    expect(screen.getByText('Remote')).toBeInTheDocument();

    // add the question with its options
    fireEvent.change(screen.getByPlaceholderText('surveys.form.questionTextPlaceholder'), {
      target: { value: 'Pick one' },
    });
    await flush();
    fireEvent.click(screen.getByText('surveys.form.addQuestionBtn'));
    await flush();
    expect(screen.getByText('Pick one')).toBeInTheDocument();
    expect(
      screen.getAllByText('surveys.questionType.multipleChoice').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('removes a question from the list', async () => {
    await openWizard();
    fireEvent.change(screen.getByTestId('input-text'), { target: { value: 'Pulse' } });
    await flush();
    fireEvent.click(screen.getByText('common.next'));
    await flush();

    fireEvent.change(screen.getByTestId('input-text'), { target: { value: 'Q1' } });
    await flush();
    fireEvent.click(screen.getByText('surveys.form.addQuestionBtn'));
    await flush();
    expect(screen.getByText('Q1')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('icon-Trash2'));
    await flush();
    expect(screen.queryByText('Q1')).toBeNull();
  });

  it('reorders questions via drag-and-drop', async () => {
    await openWizard();
    fireEvent.change(screen.getByTestId('input-text'), { target: { value: 'Pulse' } });
    await flush();
    fireEvent.click(screen.getByText('common.next'));
    await flush();

    for (const text of ['First', 'Second']) {
      fireEvent.change(screen.getByTestId('input-text'), { target: { value: text } });
      await flush();
      fireEvent.click(screen.getByText('surveys.form.addQuestionBtn'));
      await flush();
    }
    // move question 0 below question 1
    await act(async () => {
      mockDragEndHandler!({ active: { id: 'question-0' }, over: { id: 'question-1' } });
    });
    await flush();
    // a drag referencing a missing question id leaves the list unchanged
    await act(async () => {
      mockDragEndHandler!({ active: { id: 'question-99' }, over: { id: 'question-0' } });
    });
    await flush();

    fireEvent.click(screen.getByText('common.next'));
    await flush();
    // the review step lists questions in the new order: Second first (the step
    // label "surveys.wizard.questions" also appears in the stepper above)
    const reviewList = screen.getAllByText('surveys.wizard.questions')[1].parentElement!;
    expect(reviewList.textContent).toContain('Second');
    expect(reviewList.textContent!.indexOf('Second')).toBeLessThan(
      reviewList.textContent!.indexOf('First'),
    );
  });

  it('submits the survey with questions and closes the wizard', async () => {
    await openWizard();
    fireEvent.change(screen.getByTestId('input-text'), { target: { value: 'Pulse 2026' } });
    fireEvent.change(screen.getByTestId('input-textarea'), {
      target: { value: 'Quarterly check-in' },
    });
    await flush();
    fireEvent.click(screen.getByText('common.next'));
    await flush();

    fireEvent.change(screen.getByTestId('input-text'), { target: { value: 'How are you?' } });
    await flush();
    fireEvent.click(screen.getByText('surveys.form.addQuestionBtn'));
    await flush();
    fireEvent.click(screen.getByText('common.next'));
    await flush();

    // review step shows the title and question
    expect(screen.getByText('Pulse 2026')).toBeInTheDocument();
    expect(screen.getByText('How are you?')).toBeInTheDocument();
    expect(screen.getByText('surveys.anonymous')).toBeInTheDocument();

    fireEvent.click(wizardSubmitButton());
    await flush();
    await waitFor(() => expect(mockCreateSurvey).toHaveBeenCalled());
    expect(mockCreateSurvey).toHaveBeenCalledWith({
      organizationId: 'org-1',
      createdBy: 'u1',
      title: 'Pulse 2026',
      description: 'Quarterly check-in',
      isAnonymous: true,
      questions: [
        {
          type: 'rating',
          text: 'How are you?',
          description: undefined,
          options: undefined,
          isRequired: true,
        },
      ],
    });
    expect(mockToast.success).toHaveBeenCalledWith('surveys.created');
    // wizard closed
    expect(screen.queryByText('surveys.form.titlePlaceholder')).toBeNull();
  });

  it('surfaces an error when creating fails', async () => {
    await openWizard();
    (mockCreateSurvey as jest.Mock).mockRejectedValueOnce(new Error('create boom'));
    fireEvent.change(screen.getByTestId('input-text'), { target: { value: 'Pulse' } });
    await flush();
    fireEvent.click(screen.getByText('common.next'));
    await flush();
    fireEvent.change(screen.getByTestId('input-text'), { target: { value: 'Q?' } });
    await flush();
    fireEvent.click(screen.getByText('surveys.form.addQuestionBtn'));
    await flush();
    fireEvent.click(screen.getByText('common.next'));
    await flush();
    fireEvent.click(wizardSubmitButton());
    await flush();
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('create boom'));
  });

  it('restores a draft into the form and jumps to the saved step', async () => {
    mockDraft.restored = true;
    mockDraft.restoredStep = 1; // questions step
    await openWizard();

    expect(screen.getByTestId('draft-notice')).toBeTruthy();
    expect(screen.getByTestId('draft-notice').getAttribute('data-step')).toBe('1');
    // Questions step: both restored questions are listed.
    expect(screen.getByText('Q1')).toBeTruthy();
    expect(screen.getByText('Q2')).toBeTruthy();

    // Back on the info step: restored title and anonymity.
    fireEvent.click(screen.getByText('common.back'));
    await flush();
    expect(screen.getByDisplayValue('Restored Survey')).toBeTruthy();
    const anonymous = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(anonymous.checked).toBe(false);
  });

  it('start over clears the draft and resets the form', async () => {
    mockDraft.restored = true;
    mockDraft.restoredStep = 1;
    await openWizard();

    fireEvent.click(screen.getByText('Start over'));
    await flush();

    expect(mockDraft.clearDraft).toHaveBeenCalled();
    expect(screen.queryByTestId('draft-notice')).toBeNull();
    expect(screen.getByTestId('input-text')).toHaveValue('');
  });

  it('clears the draft after a successful save', async () => {
    await openWizard();
    fireEvent.change(screen.getByTestId('input-text'), { target: { value: 'Pulse' } });
    await flush();
    fireEvent.click(screen.getByText('common.next'));
    await flush();
    fireEvent.change(screen.getByTestId('input-text'), { target: { value: 'Q?' } });
    await flush();
    fireEvent.click(screen.getByText('surveys.form.addQuestionBtn'));
    await flush();
    fireEvent.click(screen.getByText('common.next'));
    await flush();
    fireEvent.click(wizardSubmitButton());
    await flush();
    await waitFor(() => expect(mockCreateSurvey).toHaveBeenCalled());
    expect(mockDraft.clearDraft).toHaveBeenCalled();
  });

  it('does not show the draft notice when nothing was restored', async () => {
    await openWizard();
    expect(screen.queryByTestId('draft-notice')).toBeNull();
  });
});

describe('SurveysClient — take survey dialog', () => {
  async function openTakeDialog() {
    mockSurveys = [activeSurvey];
    mockTakeSurvey = takeSurvey;
    render(<SurveysClient />);
    await flush();
    fireEvent.click(screen.getByText('surveys.take'));
    await flush();
  }

  it('validates required questions before submitting', async () => {
    await openTakeDialog();
    expect(screen.getByText('Rate us')).toBeInTheDocument();
    expect(screen.getByText('How likely?')).toBeInTheDocument();

    fireEvent.click(screen.getByText('surveys.submit'));
    await flush();
    expect(mockToast.error).toHaveBeenCalledWith('surveys.errors.requiredFields');
    expect(mockSubmitResponse).not.toHaveBeenCalled();
  });

  it('answers every question type and submits the formatted payload', async () => {
    await openTakeDialog();

    // rating
    fireEvent.click(screen.getAllByText('Star')[4]);
    // nps
    fireEvent.click(screen.getByText('9'));
    // multiple choice (multi-select toggle)
    fireEvent.click(screen.getByText('Salary'));
    fireEvent.click(screen.getByText('Remote'));
    // toggle Salary off again — multi-select removal
    fireEvent.click(screen.getByText('Salary'));
    // yes/no → click Yes first, then switch to No
    fireEvent.click(screen.getByText('surveys.yes'));
    fireEvent.click(screen.getByText('surveys.no'));
    // text
    fireEvent.change(screen.getByTestId('input-textarea'), { target: { value: 'All good' } });
    await flush();

    fireEvent.click(screen.getByText('surveys.submit'));
    await flush();
    await waitFor(() => expect(mockSubmitResponse).toHaveBeenCalled());
    expect(mockSubmitResponse).toHaveBeenCalledWith({
      organizationId: 'org-1',
      surveyId: 's2',
      respondentId: undefined,
      answers: expect.arrayContaining([
        { questionId: 'q1', ratingValue: 5 },
        { questionId: 'q2', ratingValue: 9 },
        { questionId: 'q3', selectedOptions: ['Remote'] },
        { questionId: 'q4', booleanValue: false },
        { questionId: 'q5', textValue: 'All good' },
      ]),
    });
    expect(mockToast.success).toHaveBeenCalledWith('surveys.responseSubmitted');
  });

  it('sends the respondent id for named surveys', async () => {
    mockSurveys = [activeSurvey];
    mockTakeSurvey = { ...takeSurvey, isAnonymous: false };
    render(<SurveysClient />);
    await flush();
    fireEvent.click(screen.getByText('surveys.take'));
    await flush();

    fireEvent.click(screen.getAllByText('Star')[0]);
    fireEvent.click(screen.getByText('7')); // required nps question
    await flush();
    fireEvent.click(screen.getByText('surveys.submit'));
    await flush();
    await waitFor(() => expect(mockSubmitResponse).toHaveBeenCalled());
    expect(mockSubmitResponse).toHaveBeenCalledWith(
      expect.objectContaining({ respondentId: 'u1' }),
    );
  });

  it('surfaces a submit error', async () => {
    await openTakeDialog();
    (mockSubmitResponse as jest.Mock).mockRejectedValueOnce(new Error('submit boom'));
    fireEvent.click(screen.getAllByText('Star')[0]);
    fireEvent.click(screen.getByText('7')); // required nps question
    await flush();
    fireEvent.click(screen.getByText('surveys.submit'));
    await flush();
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('submit boom'));
  });
});

describe('SurveysClient — results dialog', () => {
  async function openResults() {
    mockSurveys = [activeSurvey];
    mockResults = results;
    render(<SurveysClient />);
    await flush();
    fireEvent.click(screen.getByTestId('icon-BarChart3'));
    await flush();
  }

  it('renders the results header with totals', async () => {
    await openResults();
    expect(screen.getByText('Engagement pulse — surveys.results')).toBeInTheDocument();
    // the total also appears as a per-question footer, so multiple matches
    expect(screen.getAllByText('10 surveys.responses').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('6 surveys.questions')).toBeInTheDocument();
  });

  it('renders rating/nps averages, distributions, options, yes/no and text', async () => {
    await openResults();

    // rating average + distribution sorted ascending (3 then 5)
    expect(screen.getByText('4.2')).toBeInTheDocument();
    expect(screen.getByText('/ 5 avg')).toBeInTheDocument();
    expect(screen.getByText('2 (20%)')).toBeInTheDocument();
    expect(screen.getByText('8 (80%)')).toBeInTheDocument();
    // nps scale label
    expect(screen.getByText('/ 10 avg')).toBeInTheDocument();

    // multiple choice bars sorted descending
    expect(screen.getByText('6 (60%)')).toBeInTheDocument();
    expect(screen.getByText('4 (40%)')).toBeInTheDocument();

    // yes/no percentages
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText('7 votes')).toBeInTheDocument();
    expect(screen.getByText('3 votes')).toBeInTheDocument();

    // text responses + empty state
    expect(screen.getByText('Great platform')).toBeInTheDocument();
    expect(screen.getByText('No text responses yet')).toBeInTheDocument();

    // closing the dialog unmounts it
    fireEvent.click(screen.getByTestId('sheet-close'));
    await flush();
    expect(screen.queryByText('Engagement pulse — surveys.results')).toBeNull();
  });
});
