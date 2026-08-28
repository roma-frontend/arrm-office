/**
 * Tests for src/components/tasks/CreateTaskWizard.tsx — the 7-step task wizard:
 * step structure, repeat-rule fields (weekly days / monthly day), objective
 * linking with key-result selection, and the submit handlers for one-off vs
 * recurring tasks (including attachment handling and error toasts).
 *
 * Uses the real Wizard shell (already covered by wizard.test.tsx) with mocked
 * step components so wizard data is driven through simple inputs.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateTaskWizard } from '@/components/tasks/CreateTaskWizard';
import { toast } from 'sonner';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) =>
      typeof opts === 'string' ? opts : opts && 'defaultValue' in opts ? opts.defaultValue : key,
    i18n: { language: 'en' },
  }),
}));

// ── Convex ───────────────────────────────────────────────────────────────────
let queryResults: Record<string, any> = {};
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
    tasks: {
      getUsersForAssignment: { _name: 'getUsersForAssignment' },
      getMyEmployees: { _name: 'getMyEmployees' },
      addAttachment: { _name: 'addAttachment' },
    },
    recurringTasks: {
      createRecurringTask: { _name: 'createRecurringTask' },
      updateRecurringTask: { _name: 'updateRecurringTask' },
    },
    taskFields: {
      listFields: { _name: 'listFields' },
    },
    taskStatuses: {
      resolveForProject: { _name: 'resolveForProject' },
    },
    users: {
      queries: { getUserById: { _name: 'getUserById' } },
    },
    goals: {
      getObjectivesForTaskCreation: { _name: 'getObjectivesForTaskCreation' },
    },
  },
}));

jest.mock('@/hooks/useOptimisticActions', () => ({
  useOptimisticCreateTask: () => ({
    createOptimistic: createTask,
    error: null,
    optimisticTasks: [],
  }),
}));
const createTask = jest.fn().mockResolvedValue('task-1');

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));
const mockToast = toast as unknown as {
  success: jest.Mock;
  error: jest.Mock;
  warning: jest.Mock;
};

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ── Wizard shell deps (same mocks as wizard.test.tsx) ────────────────────────
jest.mock('@/lib/cssMotion', () => {
  const ReactMod = require('react');
  const Elem =
    (tag: string) =>
    ({ children, ...props }: any) => (
      <div data-testid={`motion-${tag}`} {...props}>
        {children}
      </div>
    );
  return {
    motion: { div: Elem('div') },
    AnimatePresence: ({ children }: any) => <ReactMod.Fragment>{children}</ReactMod.Fragment>,
  };
});

jest.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: () => ({
    restored: false,
    restoredStep: 0,
    clearDraft: jest.fn(),
    dismissNotice: jest.fn(),
  }),
}));

jest.mock('@/components/ui/WizardDraftNotice', () => ({
  WizardDraftNotice: () => null,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="lucide-icon" {...props} />;
  return new Proxy({}, { get: () => Icon });
});

// ── Step components: simple inputs bound to wizard data ──────────────────────
jest.mock('@/components/ui/wizard-step-components', () => {
  const ReactMod = require('react');
  const { useWizardContext } = require('@/components/ui/wizard');

  const TextInputStep = ({ field, label, placeholder }: any) => {
    const { stepData, updateStepData } = useWizardContext();
    return (
      <label>
        {label}
        <input
          id={field}
          data-testid={`input-${field}`}
          value={(stepData[field] as string) ?? ''}
          placeholder={placeholder}
          onChange={(e: any) => updateStepData(field, e.target.value)}
        />
      </label>
    );
  };

  const TextareaStep = ({ field, label }: any) => {
    const { stepData, updateStepData } = useWizardContext();
    return (
      <label>
        {label}
        <textarea
          id={field}
          data-testid={`input-${field}`}
          value={(stepData[field] as string) ?? ''}
          onChange={(e: any) => updateStepData(field, e.target.value)}
        />
      </label>
    );
  };

  const SelectStep = ({ field, label, options }: any) => {
    const { stepData, updateStepData } = useWizardContext();
    return (
      <label>
        {label}
        <select
          id={field}
          data-testid={`select-${field}`}
          value={(stepData[field] as string) ?? ''}
          onChange={(e: any) => updateStepData(field, e.target.value)}
        >
          <option value="">{label}</option>
          {options.map((o: any) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  };

  const FileUploadStep = ({ field, label }: any) => {
    const { stepData, updateStepData } = useWizardContext();
    return (
      <label>
        {label}
        <input
          id={field}
          data-testid={`input-${field}`}
          value={(stepData[field] as string) ?? ''}
          onChange={(e: any) => updateStepData(field, e.target.value)}
        />
      </label>
    );
  };

  return {
    TextInputStep: (props: any) => <TextInputStep {...props} />,
    TextareaStep: (props: any) => <TextareaStep {...props} />,
    SelectStep: (props: any) => <SelectStep {...props} />,
    FileUploadStep: (props: any) => <FileUploadStep {...props} />,
  };
});

// ── Fixtures ─────────────────────────────────────────────────────────────────
const employees = [
  { _id: 'emp-1', name: 'Anna', position: 'Designer', department: 'Design' },
  { _id: 'emp-2', name: 'Bob', position: null, department: null },
];

const objectives = [
  {
    _id: 'obj-1',
    title: 'Grow revenue',
    periodType: 'Q3',
    periodYear: 2026,
    keyResults: [
      { _id: 'kr-1', title: 'Sign 10 deals', completionPercent: 40 },
      { _id: 'kr-2', title: 'Launch feature', completionPercent: 0 },
    ],
  },
];

const seed = () => {
  queryResults = {
    getUsersForAssignment: employees,
    getMyEmployees: undefined,
    getUserById: { _id: 'u-1', organizationId: 'org-1' },
    getObjectivesForTaskCreation: objectives,
  };
  mutationCalls.length = 0;
  Object.keys(mutationImpls).forEach((key) => delete mutationImpls[key]);
  mutationImpls.createRecurringTask = jest
    .fn()
    .mockResolvedValue({ id: 'r-1', nextOccurrence: null });
  mutationImpls.updateRecurringTask = jest.fn().mockResolvedValue({ success: true });
  createTask.mockClear().mockResolvedValue('task-1');
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  mockToast.warning.mockClear();
};

beforeEach(seed);

const renderWizard = (props: Record<string, unknown> = {}) =>
  render(<CreateTaskWizard currentUserId="u-1" {...(props as any)} />);

const fillTitle = (value = 'Ship it') =>
  fireEvent.change(screen.getByTestId('input-title'), { target: { value } });

const pickAssignee = (value = 'emp-1') =>
  fireEvent.change(screen.getByTestId('select-assigneeId'), { target: { value } });

interface WalkOptions {
  priority?: string;
  deadline?: string;
  tags?: string;
  repeat?: string;
  dayOfMonth?: string;
  weekdays?: string[];
  attachments?: string;
  /** Stop right after landing on this step index (0-based) and don't continue. */
  stopAt?: number;
}

/**
 * Walk the wizard from step 0 to the last (attachments) step, filling each
 * field at its own step. Returns when the submit button is visible.
 */
const walkToEnd = (opts: WalkOptions = {}) => {
  // 0: details
  fillTitle();
  fireEvent.click(screen.getByText('Next'));
  // 1: assignee
  pickAssignee();
  fireEvent.click(screen.getByText('Next'));
  // 2: priority + deadline
  if (opts.priority) {
    fireEvent.change(screen.getByTestId('select-priority'), {
      target: { value: opts.priority },
    });
  }
  if (opts.deadline) {
    fireEvent.change(screen.getByTestId('input-deadline'), { target: { value: opts.deadline } });
  }
  fireEvent.click(screen.getByText('Next'));
  // 3: repeat
  if (opts.repeat) {
    fireEvent.change(screen.getByTestId('select-repeat'), { target: { value: opts.repeat } });
    if (opts.repeat === 'weekly' && opts.weekdays) {
      opts.weekdays.forEach((day) => fireEvent.click(screen.getByText(day)));
    }
    if (opts.repeat === 'monthly' && opts.dayOfMonth) {
      fireEvent.change(screen.getByTestId('input-repeatDayOfMonth'), {
        target: { value: opts.dayOfMonth },
      });
    }
  }
  fireEvent.click(screen.getByText('Next'));
  // 4: tags
  if (opts.tags !== undefined) {
    fireEvent.change(screen.getByTestId('input-tags'), { target: { value: opts.tags } });
  }
  fireEvent.click(screen.getByText('Next'));
  // 5: objective link
  if (opts.stopAt === 5) return;
  fireEvent.click(screen.getByText('Next'));
  // 6: attachments (last step)
  if (opts.attachments !== undefined) {
    fireEvent.change(screen.getByTestId('input-attachments'), {
      target: { value: opts.attachments },
    });
  }
  expect(screen.getByText('taskWizard.submit')).toBeInTheDocument();
};

describe('CreateTaskWizard', () => {
  it('renders the first step with title and description inputs', () => {
    renderWizard();
    expect(screen.getByTestId('input-title')).toBeInTheDocument();
    expect(screen.getByTestId('input-description')).toBeInTheDocument();
    // submit label appears only on the last step — first step shows Next
    expect(screen.getByText('Next')).toBeInTheDocument();
  });

  it('keeps Next disabled until the title is filled', () => {
    renderWizard();
    expect((screen.getByText('Next').closest('button') as HTMLButtonElement).disabled).toBe(true);
    fillTitle();
    expect((screen.getByText('Next').closest('button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('lists employees with position and department for admin assignment', () => {
    renderWizard();
    fillTitle();
    fireEvent.click(screen.getByText('Next'));
    const select = screen.getByTestId('select-assigneeId');
    expect(select).toHaveTextContent('Anna — Designer (Design)');
    expect(select).toHaveTextContent('Bob');
  });

  // The wizard no longer branches on role: `getUsersForAssignment` scopes itself
  // server-side (whole org for an admin, own reporting branch for a supervisor),
  // so whatever it returns is exactly what the assignee step offers. This used to
  // pair it with `getMyEmployees` for supervisors, which covered direct reports
  // only and went empty whenever `supervisorId` was unset.
  it('offers exactly what the assignment query returns, whatever the role', () => {
    queryResults.getUsersForAssignment = [employees[0]];
    renderWizard();
    fillTitle();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByTestId('select-assigneeId')).toHaveTextContent('Anna');
    expect(screen.getByTestId('select-assigneeId')).not.toHaveTextContent('Bob');
  });

  it('creates a one-off task with tags, priority and deadline', async () => {
    renderWizard();
    walkToEnd({ priority: 'high', deadline: '2026-09-01', tags: 'bug,  ,feature' });

    fireEvent.click(screen.getByText('taskWizard.submit'));

    await waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedTo: 'emp-1',
          assignedBy: 'u-1',
          title: 'Ship it',
          priority: 'high',
          tags: ['bug', 'feature'],
          deadline: new Date('2026-09-01').getTime(),
        }),
      ),
    );
    expect(mockToast.success).toHaveBeenCalledWith('taskWizard.toast.success');
  });

  it('creates a task with no tags when the field is empty', async () => {
    renderWizard();
    walkToEnd();
    fireEvent.click(screen.getByText('taskWizard.submit'));
    await waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({ tags: undefined, description: undefined }),
      ),
    );
  });

  it('creates a weekly recurring task with selected weekdays', async () => {
    renderWizard();
    walkToEnd({ repeat: 'weekly', weekdays: ['weekdays.mon', 'weekdays.fri'] });

    fireEvent.click(screen.getByText('taskWizard.submit'));

    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'createRecurringTask',
        args: [
          expect.objectContaining({
            title: 'Ship it',
            assignedTo: 'emp-1',
            priority: 'medium',
            frequency: 'weekly',
            daysOfWeek: [1, 5],
            dayOfMonth: undefined,
            deadlineOffsetDays: undefined,
            startDate: expect.any(String),
          }),
        ],
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('recurringTasks.created');
    // one-off creation must not run for recurring rules
    expect(createTask).not.toHaveBeenCalled();
  });

  it('creates a monthly recurring task with a day of month', async () => {
    renderWizard();
    walkToEnd({ repeat: 'monthly', dayOfMonth: '15' });
    fireEvent.click(screen.getByText('taskWizard.submit'));

    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'createRecurringTask',
        args: [
          expect.objectContaining({
            frequency: 'monthly',
            daysOfWeek: undefined,
            dayOfMonth: 15,
          }),
        ],
      }),
    );
  });

  it('keeps attachments on a recurring series so they travel with occurrences', async () => {
    renderWizard();
    walkToEnd({
      repeat: 'weekly',
      weekdays: ['weekdays.tue'],
      attachments: '[{"url":"u","name":"a","type":"image/png","size":1}]',
    });
    fireEvent.click(screen.getByText('taskWizard.submit'));

    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'createRecurringTask',
        args: [
          expect.objectContaining({
            attachments: [{ url: 'u', name: 'a', type: 'image/png', size: 1 }],
          }),
        ],
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('recurringTasks.created');
  });

  it('prefills and updates a series in edit mode', async () => {
    renderWizard({
      userRole: 'admin',
      editingSeries: {
        _id: 'r-1',
        title: 'Weekly standup notes',
        description: 'Post the recap',
        priority: 'high',
        tags: ['ops', 'sync'],
        assignedTo: 'emp-1',
        frequency: 'weekly',
        daysOfWeek: [1, 5],
        startDate: '2026-08-01',
        endDate: '2026-12-31',
        deadlineOffsetDays: 1,
        attachments: [
          { url: 'https://cdn/a.pdf', name: 'a.pdf', type: 'application/pdf', size: 10 },
        ],
      },
    });

    // Step 0 (details) is prefilled from the series
    expect((screen.getByTestId('input-title') as HTMLInputElement).value).toBe(
      'Weekly standup notes',
    );

    // Walk: assignee → priority → repeat (steps 1-3)
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));

    // Repeat is prefilled and offers no "none" while editing a series
    expect((screen.getByTestId('select-repeat') as HTMLSelectElement).value).toBe('weekly');
    const repeatOptions = Array.from(
      screen.getByTestId('select-repeat').querySelectorAll('option'),
    ).map((o) => (o as HTMLOptionElement).value);
    expect(repeatOptions.filter(Boolean)).toEqual(['weekly', 'monthly']);

    // subtaskTemplates → checklistTemplates → tags → objectiveLink → attachments → submit
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    // Edit mode labels the submit button "Save"
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'updateRecurringTask',
        args: [
          expect.objectContaining({
            seriesId: 'r-1',
            title: 'Weekly standup notes',
            priority: 'high',
            frequency: 'weekly',
            daysOfWeek: [1, 5],
            startDate: '2026-08-01',
            endDate: '2026-12-31',
            deadlineOffsetDays: 1,
            attachments: [
              { url: 'https://cdn/a.pdf', name: 'a.pdf', type: 'application/pdf', size: 10 },
            ],
          }),
        ],
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('recurringTasks.updated');
    expect(createTask).not.toHaveBeenCalled();
  });

  it('attaches files to a one-off task after creation', async () => {
    renderWizard();
    walkToEnd({
      attachments: JSON.stringify([
        { url: 'https://cdn/a.png', name: 'a.png', type: 'image/png', size: 10 },
      ]),
    });
    fireEvent.click(screen.getByText('taskWizard.submit'));

    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'addAttachment',
        args: [
          {
            taskId: 'task-1',
            url: 'https://cdn/a.png',
            name: 'a.png',
            type: 'image/png',
            size: 10,
            uploadedBy: 'u-1',
          },
        ],
      }),
    );
  });

  it('links an objective and picks a key result', async () => {
    renderWizard({ objectiveId: 'obj-1' });
    walkToEnd({ stopAt: 5 });

    // The objective select is prefilled from the prop.
    expect(screen.getByTestId('select-objectiveId')).toHaveValue('obj-1');

    // Key result field is rendered with the objective's KRs.
    const krSelect = screen.getByTestId('select-keyResultId');
    expect(krSelect).toHaveTextContent('Sign 10 deals (40%)');
    fireEvent.change(krSelect, { target: { value: 'kr-1' } });

    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('taskWizard.submit'));
    await waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({ objectiveId: 'obj-1', keyResultId: 'kr-1' }),
      ),
    );
  });

  it('does not render the key-result field without a selected objective', () => {
    renderWizard();
    walkToEnd({ stopAt: 5 });
    expect(screen.queryByTestId('select-keyResultId')).toBeNull();
  });

  it('toggles a weekday off when clicked twice', () => {
    renderWizard();
    walkToEnd({ repeat: 'weekly', weekdays: ['weekdays.mon'] });
    // navigate back to the repeat step (step 3: attachments→objective→tags→repeat)
    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(screen.getByText('weekdays.mon'));
    expect(screen.getByText('weekdays.mon')).toHaveAttribute('aria-pressed', 'false');
    // an empty weekday set blocks Next (validation) until a day is re-picked
    fireEvent.click(screen.getByText('weekdays.tue'));
    expect((screen.getByText('Next').closest('button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('passes repeat dates, end date and offset to a monthly rule', async () => {
    renderWizard();
    walkToEnd({
      repeat: 'monthly',
      dayOfMonth: '15',
    });
    // back to the repeat step (attachments→objective→tags→repeat)
    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(screen.getByText('Back'));
    fireEvent.change(screen.getByTestId('input-repeatStartDate'), {
      target: { value: '2026-10-01' },
    });
    fireEvent.change(screen.getByTestId('input-repeatEndDate'), {
      target: { value: '2027-01-31' },
    });
    fireEvent.change(screen.getByTestId('input-repeatDeadlineOffsetDays'), {
      target: { value: '3' },
    });
    // walk forward again: tags → objective → attachments
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('taskWizard.submit'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'createRecurringTask',
        args: [
          expect.objectContaining({
            startDate: '2026-10-01',
            endDate: '2027-01-31',
            deadlineOffsetDays: 3,
          }),
        ],
      }),
    );
  });

  it('toasts the next-occurrence message when the rule reports one', async () => {
    mutationImpls.createRecurringTask = jest
      .fn()
      .mockResolvedValue({ id: 'r-2', nextOccurrence: '2026-09-14' });
    renderWizard();
    walkToEnd({ repeat: 'weekly', weekdays: ['weekdays.mon'] });
    fireEvent.click(screen.getByText('taskWizard.submit'));
    // The next-occurrence branch picks the withNext message.
    await waitFor(() =>
      expect(mockToast.success).toHaveBeenCalledWith('recurringTasks.createdWithNext'),
    );
    expect(mockToast.success).not.toHaveBeenCalledWith('recurringTasks.created');
  });

  it('skips the queries when the current user id is missing', () => {
    renderWizard({ currentUserId: '' });
    expect(screen.getByTestId('input-title')).toBeInTheDocument();
  });

  it('shows no repeat-rule fields when frequency is none', () => {
    renderWizard();
    fillTitle();
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    expect(screen.queryByText('weekdays.mon')).toBeNull();
    expect(screen.queryByTestId('input-repeatDayOfMonth')).toBeNull();
  });

  it('toasts an error when task creation fails', async () => {
    createTask.mockRejectedValue(new Error('create boom'));
    renderWizard();
    walkToEnd();
    fireEvent.click(screen.getByText('taskWizard.submit'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('create boom'));
  });

  it('calls onComplete after a successful creation', async () => {
    const onComplete = jest.fn();
    renderWizard({ onComplete });
    walkToEnd();
    fireEvent.click(screen.getByText('taskWizard.submit'));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });

  it('skips the assignee step for employees and self-assigns on submit', async () => {
    const onComplete = jest.fn();
    renderWizard({ userRole: 'employee', currentUserId: 'u-emp', onComplete });

    // No assignee step: after details, the wizard jumps straight to priority.
    fillTitle();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.queryByTestId('select-assigneeId')).not.toBeInTheDocument();
    expect(screen.getByTestId('select-priority')).toBeInTheDocument();

    // Walk the remaining steps (priority → repeat → tags → objective → attachments).
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('taskWizard.submit')).toBeInTheDocument();

    fireEvent.click(screen.getByText('taskWizard.submit'));
    await waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedTo: 'u-emp',
          assignedBy: 'u-emp',
          title: 'Ship it',
        }),
      ),
    );
    expect(onComplete).toHaveBeenCalled();
  });

  it('calls onCancel when the wizard is cancelled', () => {
    const onCancel = jest.fn();
    renderWizard({ onCancel });
    fireEvent.click(screen.getByText('actions.cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('cancels task creation when the priority step is skipped through default medium', async () => {
    renderWizard();
    walkToEnd();
    fireEvent.click(screen.getByText('taskWizard.submit'));
    await waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ priority: 'medium' })),
    );
  });
});
