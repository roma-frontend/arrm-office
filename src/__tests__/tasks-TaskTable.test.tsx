/**
 * Tests for TaskTable — the ClickUp-style grid.
 *
 * The grid *arranges* and never writes: every mutation arrives as a callback, and
 * that boundary is what lets `/tasks` and a project page share one component with
 * different permissions behind it. So these cases pin the boundary rather than the
 * markup — which callback fires, with what arguments, and when it deliberately
 * does not fire: an unchanged cell must not write, Escape must abandon, and a
 * missing `onAddTask` must take the whole affordance away rather than offer a
 * button that fails.
 *
 * A custom two-status set (UNPAID / PAID) stands in for the organization's own
 * vocabulary, which also pins the rule that a user-entered label is shown
 * verbatim and never translated.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, second?: unknown, third?: unknown) => {
      const fromObject = second && typeof second === 'object' ? second : undefined;
      const template =
        typeof second === 'string'
          ? second
          : (((fromObject as Record<string, unknown> | undefined)?.defaultValue as string) ?? key);
      const vars = (third && typeof third === 'object' ? third : fromObject) as
        | Record<string, unknown>
        | undefined;
      // Interpolated so an assertion can read "1 selected" instead of the raw
      // template — the counts are the part of this UI worth asserting on.
      return vars
        ? template.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
            name in vars ? String(vars[name]) : whole,
          )
        : template;
    },
    i18n: { language: 'en' },
  }),
}));

jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => <div>{children}</div>,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('lucide-react', () => {
  const MockIcon = (props: any) => <span data-testid="lucide-icon" {...props} />;
  return new Proxy({}, { get: () => MockIcon });
});

import { TaskTable, type TaskTableRow, type TaskSeed } from '@/components/tasks/table/TaskTable';
import { DEFAULT_TASK_TABLE_LAYOUT, type TaskTableLayout } from '@/hooks/useTaskViewPreferences';
import { DEFAULT_TASK_VIEW, type TaskViewState } from '@/lib/taskViewState';
import type { TaskGridField } from '@/lib/taskFieldTypes';
import type { TaskStatusDef } from '../../convex/lib/taskStatus';

/** An organization's own vocabulary, not the canonical five. */
const STATUSES: TaskStatusDef[] = [
  { key: 'unpaid', label: 'UNPAID', color: 'red', type: 'todo', order: 0 },
  { key: 'paid', label: 'PAID', color: 'green', type: 'done', order: 1 },
];

const FIELDS: TaskGridField[] = [
  { _id: 'f_contact', name: 'Contact', type: 'text', order: 0 },
  { _id: 'f_amount', name: 'Amount owed', type: 'money', order: 1, config: { currency: 'USD' } },
];

const USERS = [
  { _id: 'u1', name: 'Ada Lovelace' },
  { _id: 'u2', name: 'Grace Hopper' },
];

const TASKS: TaskTableRow[] = [
  {
    _id: 't1',
    title: 'Invoice Acme',
    status: 'pending',
    statusKey: 'unpaid',
    priority: 'high',
    assignedTo: 'u1',
    customFields: { f_contact: 'Acme' },
  },
  { _id: 't2', title: 'Invoice Globex', status: 'pending', statusKey: 'unpaid' },
  { _id: 't3', title: 'Invoice Initech', status: 'completed', statusKey: 'paid' },
];

const onOpenTask = jest.fn();
const onSetStatus = jest.fn();
const onPatchTask = jest.fn();
const onSetField = jest.fn();
const onSort = jest.fn();
const onResizeColumn = jest.fn();
const onReorderColumns = jest.fn();
const onAddTask = jest.fn();
const onBulkPatch = jest.fn();
const onBulkDelete = jest.fn();

interface Overrides {
  tasks?: TaskTableRow[];
  view?: Partial<TaskViewState>;
  layout?: Partial<TaskTableLayout>;
  canEdit?: boolean;
  /** Omit the write callbacks the way a viewer without permission would. */
  readOnlyProps?: boolean;
  emptyState?: React.ReactNode;
}

function renderTable(overrides: Overrides = {}) {
  // `group: 'none'` unless a case says otherwise: with sections there is one
  // "Add Task" per status and the queries stop being about what is being tested.
  const view: TaskViewState = {
    ...DEFAULT_TASK_VIEW,
    view: 'table',
    group: 'none',
    ...overrides.view,
  };
  return render(
    <TaskTable
      tasks={overrides.tasks ?? TASKS}
      statuses={STATUSES}
      fields={FIELDS}
      users={USERS}
      view={view}
      layout={{ ...DEFAULT_TASK_TABLE_LAYOUT, ...overrides.layout }}
      density="comfortable"
      canEdit={overrides.canEdit ?? true}
      lang="en"
      orgCurrency="USD"
      projectName={(id) => (id === 'p1' ? 'Payables' : undefined)}
      onOpenTask={onOpenTask}
      onSetStatus={onSetStatus}
      onPatchTask={onPatchTask}
      onSetField={onSetField}
      onSort={onSort}
      onResizeColumn={onResizeColumn}
      onReorderColumns={onReorderColumns}
      {...(overrides.readOnlyProps ? {} : { onAddTask, onBulkPatch, onBulkDelete })}
      {...(overrides.emptyState ? { emptyState: overrides.emptyState } : {})}
    />,
  );
}

/** The row checkboxes, in render order. The first is the header's "select all". */
function selectionBoxes(): HTMLElement[] {
  return screen.getAllByRole('checkbox', { name: 'Select task' });
}

describe('TaskTable', () => {
  beforeEach(() => {
    for (const mock of [
      onOpenTask,
      onSetStatus,
      onPatchTask,
      onSetField,
      onSort,
      onResizeColumn,
      onReorderColumns,
      onAddTask,
      onBulkPatch,
      onBulkDelete,
    ]) {
      mock.mockReset();
    }
  });

  it('renders one row per task plus the header, and a column per custom field', () => {
    renderTable();
    expect(screen.getByRole('grid', { name: 'Tasks' })).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(TASKS.length + 1);
    expect(screen.getByRole('columnheader', { name: /Contact/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Amount owed/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Invoice Acme' })).toBeTruthy();
  });

  it('shows the organization status label verbatim — a name its author typed is not translated', () => {
    renderTable();
    expect(screen.getAllByText('UNPAID').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PAID').length).toBeGreaterThan(0);
  });

  it('opens a task rather than editing it when the name is clicked', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Invoice Acme' }));
    expect(onOpenTask).toHaveBeenCalledWith('t1');
  });

  it('reports the column that was clicked, and leaves the direction to the caller', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: /^Status/ }));
    expect(onSort).toHaveBeenCalledWith('status');
    fireEvent.click(screen.getByRole('button', { name: /^Name/ }));
    expect(onSort).toHaveBeenLastCalledWith('name');
  });

  // ── Inline editing ───────────────────────────────────────────────────────
  it('commits a custom field on Enter, naming the field rather than the column', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Acme' }));
    const input = screen.getByRole('textbox', { name: 'Contact' });
    fireEvent.change(input, { target: { value: 'Globex Ltd' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSetField).toHaveBeenCalledWith('t1', 'f_contact', 'Globex Ltd');
  });

  it('commits on blur too — clicking away is how a grid is normally left', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Acme' }));
    const input = screen.getByRole('textbox', { name: 'Contact' });
    fireEvent.change(input, { target: { value: 'Initech' } });
    fireEvent.blur(input);
    expect(onSetField).toHaveBeenCalledWith('t1', 'f_contact', 'Initech');
  });

  it('writes nothing when the value was not changed — tabbing through a row is free', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Acme' }));
    fireEvent.blur(screen.getByRole('textbox', { name: 'Contact' }));
    expect(onSetField).not.toHaveBeenCalled();
  });

  it('abandons the edit on Escape and puts the old value back', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Acme' }));
    const input = screen.getByRole('textbox', { name: 'Contact' });
    fireEvent.change(input, { target: { value: 'typed by mistake' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onSetField).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Acme' })).toBeTruthy();
  });

  it('clears a cell to null rather than to an empty string', () => {
    // The two mean different things to `validateFieldValue`: one unsets the cell,
    // the other stores a blank the formatter would then render as content.
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Acme' }));
    const input = screen.getByRole('textbox', { name: 'Contact' });
    fireEvent.change(input, { target: { value: '  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSetField).toHaveBeenCalledWith('t1', 'f_contact', null);
  });

  it('does not let a viewer without edit rights open a cell', () => {
    renderTable({ canEdit: false });
    const trigger = screen.getByRole('button', { name: 'Acme' });
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(trigger);
    expect(screen.queryByRole('textbox', { name: 'Contact' })).toBeNull();
  });

  // ── Selection ────────────────────────────────────────────────────────────
  it('shows the bulk toolbar with a live count once a row is ticked', () => {
    renderTable();
    expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).toBeNull();
    fireEvent.click(selectionBoxes()[0]!);
    const toolbar = screen.getByRole('toolbar', { name: 'Bulk actions' });
    expect(within(toolbar).getByText('1 selected')).toBeTruthy();
    fireEvent.click(selectionBoxes()[1]!);
    expect(within(toolbar).getByText('2 selected')).toBeTruthy();
  });

  it('ticks and unticks every row from the header', () => {
    renderTable();
    const selectAll = screen.getByRole('checkbox', { name: 'Select all tasks' });
    fireEvent.click(selectAll);
    expect(screen.getByText(`${TASKS.length} selected`)).toBeTruthy();
    fireEvent.click(selectAll);
    expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).toBeNull();
  });

  it('extends the selection to a range on shift-click', () => {
    renderTable();
    fireEvent.click(selectionBoxes()[0]!);
    fireEvent.click(selectionBoxes()[2]!, { shiftKey: true });
    expect(screen.getByText('3 selected')).toBeTruthy();
  });

  it('clears the selection on Escape', () => {
    renderTable();
    fireEvent.click(selectionBoxes()[0]!);
    fireEvent.keyDown(screen.getByRole('grid', { name: 'Tasks' }), { key: 'Escape' });
    expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).toBeNull();
  });

  it('passes the ticked ids to a bulk patch and then clears the selection', async () => {
    renderTable();
    fireEvent.click(selectionBoxes()[0]!);
    fireEvent.click(selectionBoxes()[1]!);
    const toolbar = screen.getByRole('toolbar', { name: 'Bulk actions' });
    fireEvent.click(within(toolbar).getByRole('button', { name: 'PAID' }));
    expect(onBulkPatch).toHaveBeenCalledWith(['t1', 't2'], { statusKey: 'paid' });
    await waitFor(() => expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).toBeNull());
  });

  it('asks before deleting, and deletes only after the second click', async () => {
    renderTable();
    fireEvent.click(selectionBoxes()[0]!);
    const toolbar = screen.getByRole('toolbar', { name: 'Bulk actions' });
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Delete' }));
    expect(onBulkDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete 1' }));
    expect(onBulkDelete).toHaveBeenCalledWith(['t1']);
    await waitFor(() => expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).toBeNull());
  });

  // ── Inline creation ──────────────────────────────────────────────────────
  // `submit` awaits the caller's create before clearing the field, so the Enter
  // that starts it has to be flushed inside `act` — otherwise the state update
  // that lands after the await happens outside React's control.
  const pressEnter = (input: HTMLElement) =>
    act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

  it('creates a task from the row at the foot of the list', async () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Add Task' }));
    const input = screen.getByRole('textbox', { name: 'Task name' });
    fireEvent.change(input, { target: { value: '  Chase invoice  ' } });
    await pressEnter(input);
    expect(onAddTask).toHaveBeenCalledWith('Chase invoice', {});
  });

  it('stays open and empty after a create — tasks are entered in runs', async () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Add Task' }));
    const input = screen.getByRole('textbox', { name: 'Task name' });
    fireEvent.change(input, { target: { value: 'First' } });
    await pressEnter(input);
    await waitFor(() =>
      expect((screen.getByRole('textbox', { name: 'Task name' }) as HTMLInputElement).value).toBe(
        '',
      ),
    );
  });

  it('closes on Escape, and on an empty title, without creating anything', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Add Task' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Task name' }), { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Task name' })).toBeNull();
    expect(onAddTask).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Add Task' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Task name' }), { key: 'Enter' });
    expect(onAddTask).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add Task' })).toBeTruthy();
  });

  it('inherits the section a task was created in', async () => {
    // Adding a task to PAID and getting an unpaid one is the small betrayal that
    // makes people stop using inline creation.
    renderTable({ view: { group: 'status' } });
    const adders = screen.getAllByRole('button', { name: 'Add Task' });
    // UNPAID is the first section, so its header "+" comes first in the DOM.
    fireEvent.click(adders[0]!);
    const input = screen.getByRole('textbox', { name: 'Task name' });
    fireEvent.change(input, { target: { value: 'Ping accounts' } });
    await pressEnter(input);
    expect(onAddTask).toHaveBeenCalledWith('Ping accounts', { statusKey: 'unpaid' } as TaskSeed);
  });

  it('offers no way to add a task when the caller passes no handler', () => {
    renderTable({ readOnlyProps: true });
    expect(screen.queryByRole('button', { name: 'Add Task' })).toBeNull();
  });

  it('offers no bulk actions when the caller passes no handlers', () => {
    renderTable({ readOnlyProps: true });
    fireEvent.click(selectionBoxes()[0]!);
    const toolbar = screen.getByRole('toolbar', { name: 'Bulk actions' });
    // The toolbar still counts the selection — it is the actions that are absent.
    expect(within(toolbar).getByText('1 selected')).toBeTruthy();
    expect(within(toolbar).queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  // ── Sections ─────────────────────────────────────────────────────────────
  it('groups into the status set, keeping an empty status as a section', () => {
    renderTable({ tasks: [TASKS[0]!], view: { group: 'status' } });
    // Both statuses get a section: a column with nothing in it is still where a
    // task is dragged to, and its count says zero.
    expect(screen.getAllByText('UNPAID').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PAID').length).toBeGreaterThan(0);
  });

  it('collapses a section without losing the others', () => {
    renderTable({ view: { group: 'status' } });
    expect(screen.getByRole('button', { name: 'Invoice Acme' })).toBeTruthy();
    // "UNPAID 2" — the section header carries its count, which is what tells it
    // apart from the UNPAID option inside every row's status picker.
    fireEvent.click(screen.getByRole('button', { name: 'UNPAID 2' }));
    expect(screen.queryByRole('button', { name: 'Invoice Acme' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Invoice Initech' })).toBeTruthy();
  });

  it('renders the caller empty state instead of an empty grid', () => {
    renderTable({ tasks: [], emptyState: <p>Nothing due</p> });
    expect(screen.getByText('Nothing due')).toBeTruthy();
    expect(screen.queryByRole('grid')).toBeNull();
  });

  // ── Columns ──────────────────────────────────────────────────────────────
  it('honours a stored order and hidden set, and ignores a key that no longer exists', () => {
    renderTable({
      layout: { hidden: ['deadline'], order: ['cf:f_contact', 'status', 'cf:deleted_field'] },
    });
    const headers = screen
      .getAllByRole('columnheader')
      .map((header) => header.textContent ?? '')
      .filter((text) => text !== '');
    expect(headers[0]).toContain('Name');
    expect(headers[1]).toContain('Contact');
    expect(headers[2]).toContain('Status');
    expect(headers.some((text) => text.includes('Due date'))).toBe(false);
  });
});
