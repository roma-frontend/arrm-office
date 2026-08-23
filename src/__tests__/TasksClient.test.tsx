/**
 * Tests for TasksClient — focus on the project filter: option building from
 * loaded tasks, filtering in kanban/list views, the "Without project" option,
 * and the guards that reset a stale selection when the chosen project (or the
 * "without project" group) disappears from the available options.
 *
 * Mocks: convex/react, next/navigation, i18n, hooks, dnd-kit (as thin
 * wrappers), UI components. Pattern follows ProjectsClient.test.tsx.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string }) => {
      if (typeof fallback === 'string') return fallback;
      if (fallback && typeof fallback === 'object' && 'defaultValue' in fallback) {
        return fallback.defaultValue ?? key;
      }
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

// ── Convex mock ──────────────────────────────────────────────────────────────
let queryResults: Record<string, unknown> = {};

jest.mock('@/components/employees/EmployeeHoverCard', () => ({
  EmployeeHoverCard: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation: () => jest.fn(),
}));

jest.mock('../../convex/_generated/api', () => ({
  api: {
    tasks: {
      getVisibleTasks: { _name: 'getVisibleTasks' },
    },
    recurringTasks: {
      listRecurringTasks: { _name: 'listRecurringTasks' },
    },
    taskStatuses: {
      resolveForProject: { _name: 'resolveForProject' },
    },
    taskFields: {
      listFields: { _name: 'listFields' },
    },
    taskViews: {
      listViews: { _name: 'listViews' },
    },
  },
}));

// ── Router mock ──────────────────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ── Hooks mocks ──────────────────────────────────────────────────────────────
jest.mock('@/hooks/useMainRef', () => ({
  useMainRef: () => ({ current: null }),
}));

jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => null,
}));

jest.mock('@/hooks/useOptimisticActions', () => ({
  useOptimisticTaskStatus: () => ({
    updateOptimistic: jest.fn().mockResolvedValue(undefined),
  }),
  useRecurringTaskStatus: () => ({
    updateRecurringOptimistic: jest.fn().mockResolvedValue(undefined),
  }),
}));

// ── dnd-kit mock (thin wrappers — we test filtering, not drag-and-drop) ─────
jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: any) => <div data-testid="dnd-context">{children}</div>,
  PointerSensor: class PointerSensor {},
  TouchSensor: class TouchSensor {},
  useSensor: (s: any) => s,
  useSensors: (...s: any[]) => s,
  useDroppable: () => ({ isOver: false, setNodeRef: () => {} }),
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    isDragging: false,
  }),
}));

jest.mock('@dnd-kit/utilities', () => ({
  CSS: { Translate: { toString: () => '' } },
}));

// Mock CustomSelect to render a native <select> so project filter tests work
jest.mock('@/components/ui/CustomSelect', () => ({
  CustomSelect: ({ value, onChange, options, placeholder }: any) => (
    <select data-testid="custom-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

// ── Icon mock ────────────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const MockIcon = (props: any) => <span data-testid="lucide-icon" {...props} />;
  return new Proxy(
    {},
    {
      get: () => MockIcon,
    },
  );
});

// ── UI component mocks ───────────────────────────────────────────────────────
jest.mock('@/components/ui/CustomSelect', () => ({
  CustomSelect: ({ value, onChange, options, triggerClassName }: any) => (
    <select
      value={value}
      onChange={(e: any) => onChange(e.target.value)}
      data-testid="custom-select"
      className={triggerClassName}
    >
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: any) => <div data-testid="dialog-title">{children}</div>,
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader">Loading...</div>,
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

// ── Module under test ──
import TasksClient from '@/components/tasks/TasksClient';

// ── Fixtures ─────────────────────────────────────────────────────────────────
interface MockTask {
  _id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  projectId?: string;
  projectName?: string | null;
  assignedToUser?: { _id: string; name: string } | null;
  commentCount: number;
}

const alphaTask: MockTask = {
  _id: 'task-1',
  title: 'Alpha task',
  status: 'pending',
  priority: 'high',
  projectId: 'proj-1',
  projectName: 'Q4 Launch',
  assignedToUser: { _id: 'user-1', name: 'Alice' },
  commentCount: 0,
};

const betaTask: MockTask = {
  _id: 'task-2',
  title: 'Beta task',
  status: 'in_progress',
  priority: 'medium',
  projectId: 'proj-1',
  projectName: 'Q4 Launch',
  assignedToUser: { _id: 'user-1', name: 'Alice' },
  commentCount: 0,
};

const gammaTask: MockTask = {
  _id: 'task-3',
  title: 'Gamma task',
  status: 'pending',
  priority: 'low',
  projectId: 'proj-2',
  projectName: 'API',
  assignedToUser: { _id: 'user-1', name: 'Alice' },
  commentCount: 0,
};

const deltaTask: MockTask = {
  _id: 'task-4',
  title: 'Delta task',
  status: 'pending',
  priority: 'medium',
  assignedToUser: { _id: 'user-1', name: 'Alice' },
  commentCount: 0,
};

const ALL_TASKS = [alphaTask, betaTask, gammaTask, deltaTask];

function getProjectSelect(container: HTMLElement): HTMLSelectElement | null {
  const selects = container.querySelectorAll('select');
  for (const sel of Array.from(selects)) {
    const values = Array.from(sel.options).map((o) => o.value);
    if (values.includes('none') || values.some((v) => v.startsWith('proj-'))) {
      return sel as HTMLSelectElement;
    }
  }
  return null;
}

function selectProject(container: HTMLElement, value: string) {
  const select = getProjectSelect(container);
  if (!select) throw new Error('Project filter select not found');
  fireEvent.change(select, { target: { value } });
}

describe('TasksClient project filter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryResults = {};
    queryResults.getVisibleTasks = ALL_TASKS;
  });

  it('builds project filter options from loaded tasks with counts', () => {
    const { container } = render(<TasksClient userId="user-1" userRole="admin" />);

    const select = getProjectSelect(container);
    expect(select).not.toBeNull();

    const labels = Array.from(select!.options).map((o) => o.textContent);
    expect(labels).toContain('Project');
    expect(labels).toContain('Q4 Launch (2)');
    expect(labels).toContain('API (1)');
    expect(labels).toContain('Without project (1)');
  });

  it('omits the "Without project" option when every task has a project', () => {
    queryResults.getVisibleTasks = [alphaTask, betaTask, gammaTask];
    const { container } = render(<TasksClient userId="user-1" userRole="admin" />);

    const select = getProjectSelect(container);
    expect(select).not.toBeNull();
    const labels = Array.from(select!.options).map((o) => o.textContent);
    expect(labels).toContain('Q4 Launch (2)');
    expect(labels).toContain('API (1)');
    expect(labels.some((l) => l?.startsWith('Without project'))).toBe(false);
  });

  it('filters the kanban board by project', () => {
    const { container } = render(<TasksClient userId="user-1" userRole="admin" />);

    selectProject(container, 'proj-1');

    expect(screen.getAllByText('Alpha task').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Beta task').length).toBeGreaterThan(0);
    expect(screen.queryByText('Gamma task')).toBeNull();
    expect(screen.queryByText('Delta task')).toBeNull();
  });

  it('filters tasks without a project via the "none" option', () => {
    const { container } = render(<TasksClient userId="user-1" userRole="admin" />);

    selectProject(container, 'none');

    expect(screen.getAllByText('Delta task').length).toBeGreaterThan(0);
    expect(screen.queryByText('Alpha task')).toBeNull();
    expect(screen.queryByText('Beta task')).toBeNull();
    expect(screen.queryByText('Gamma task')).toBeNull();
  });

  it('applies the project filter in list view too', () => {
    const { container } = render(<TasksClient userId="user-1" userRole="admin" />);

    // Switch to list view
    fireEvent.click(screen.getByText('tasksClient.list'));

    selectProject(container, 'proj-2');

    expect(screen.getAllByText('Gamma task').length).toBeGreaterThan(0);
    expect(screen.queryByText('Alpha task')).toBeNull();
    expect(screen.queryByText('Beta task')).toBeNull();
    expect(screen.queryByText('Delta task')).toBeNull();
  });

  it('resets a stale project filter to "all" when the project disappears', () => {
    const { container, rerender } = render(<TasksClient userId="user-1" userRole="admin" />);

    selectProject(container, 'proj-1');
    expect(screen.getAllByText('Alpha task').length).toBeGreaterThan(0);

    // All tasks of proj-1 get unlinked — proj-1 is no longer an option.
    queryResults.getVisibleTasks = [
      { ...alphaTask, projectId: undefined, projectName: null },
      { ...betaTask, projectId: undefined, projectName: null },
      gammaTask,
      deltaTask,
    ];
    // Changing a prop forces re-render even though TasksClient is memoized.
    rerender(<TasksClient userId="user-1" userRole="superadmin" />);

    const select = getProjectSelect(container);
    expect(select!.value).toBe('all');
    expect(screen.getAllByText('Alpha task').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Gamma task').length).toBeGreaterThan(0);
  });

  it('resets a stale "none" filter when no tasks remain without a project', () => {
    const { container, rerender } = render(<TasksClient userId="user-1" userRole="admin" />);

    selectProject(container, 'none');
    expect(screen.getAllByText('Delta task').length).toBeGreaterThan(0);

    // Delta gets a project — the "without project" group disappears.
    queryResults.getVisibleTasks = [
      alphaTask,
      betaTask,
      gammaTask,
      { ...deltaTask, projectId: 'proj-3', projectName: 'New' },
    ];
    rerender(<TasksClient userId="user-1" userRole="superadmin" />);

    const select = getProjectSelect(container);
    expect(select!.value).toBe('all');
    expect(screen.getAllByText('Delta task').length).toBeGreaterThan(0);
  });

  it('shows the project filter for employee role as well', () => {
    queryResults.getVisibleTasks = [alphaTask];
    const { container } = render(<TasksClient userId="user-1" userRole="employee" />);

    const select = getProjectSelect(container);
    expect(select).not.toBeNull();
    const labels = Array.from(select!.options).map((o) => o.textContent);
    expect(labels).toContain('Q4 Launch (1)');
  });

  it('renders the loading state while tasks are not loaded', () => {
    queryResults.getVisibleTasks = undefined;
    const { container } = render(<TasksClient userId="user-1" userRole="admin" />);
    expect(container.querySelector('[data-testid="shield-loader"]')).toBeInTheDocument();
  });
});
