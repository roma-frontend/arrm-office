/**
 * Tests for TaskSheet — verifies the internal edit-mode toggle:
 *  - Shows TaskDetailClient when not editing
 *  - Switches to TaskEditClient when onEdit fires
 *  - Returns to TaskDetailClient when edit is done/cancelled
 *  - Shows correct title in each mode
 *  - Does not render when taskId is null
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React, { Suspense } from 'react';

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => {
      if (typeof fallback === 'string') return fallback;
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

// ── TaskDetailClient mock ────────────────────────────────────────────────────
jest.mock('@/components/tasks/TaskDetailClient', () => ({
  __esModule: true,
  default: ({ taskId, onDone, onEdit }: any) => (
    <div data-testid="task-detail">
      <span data-testid="detail-task-id">{taskId}</span>
      <button data-testid="edit-button" onClick={() => onEdit?.(taskId)}>
        Edit
      </button>
      <button data-testid="done-button" onClick={() => onDone?.()}>
        Done
      </button>
    </div>
  ),
}));

// ── TaskEditClient mock ──────────────────────────────────────────────────────
jest.mock('@/components/tasks/TaskEditClient', () => ({
  __esModule: true,
  default: ({ taskId, onClose }: any) => (
    <div data-testid="task-edit">
      <span data-testid="edit-task-id">{taskId}</span>
      <button data-testid="close-edit-button" onClick={() => onClose?.()}>
        Close
      </button>
    </div>
  ),
}));

// ── UI component mocks ───────────────────────────────────────────────────────
jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader">Loading…</div>,
}));

jest.mock('@/components/ui/detail-sheet', () => ({
  DetailSheet: ({ open, onClose, title, children }: any) =>
    open ? (
      <div data-testid="detail-sheet">
        <span data-testid="sheet-title">{title}</span>
        <button data-testid="close-sheet" onClick={onClose}>
          Close
        </button>
        {children}
      </div>
    ) : null,
}));

// ── next/dynamic mock ────────────────────────────────────────────────────────
// Replace dynamic() with React.lazy.  In Jest, the mocked import() resolves
// immediately, so React.lazy receives a settled Promise and renders the
// component after a single micro-task flush (handled by act/waitFor).
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: (factory: () => Promise<{ default: React.ComponentType<any> }>) => {
    return React.lazy(factory);
  },
}));

// ── Module under test ────────────────────────────────────────────────────────
import { TaskSheet } from '@/components/tasks/TaskSheet';

// ── Fixtures ─────────────────────────────────────────────────────────────────
const TASK_ID = 'sn7gms9x9h6hm93brmnykbweth8d0055' as any;

// ── Helper ───────────────────────────────────────────────────────────────────
function renderSheet(ui: React.ReactElement) {
  return render(<Suspense fallback={<div data-testid="suspense-fallback" />}>{ui}</Suspense>);
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('TaskSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when taskId is null', () => {
    const { container } = renderSheet(<TaskSheet taskId={null} onClose={jest.fn()} />);
    expect(container.querySelector('[data-testid="detail-sheet"]')).toBeNull();
  });

  it('shows TaskDetailClient in view mode', async () => {
    renderSheet(<TaskSheet taskId={TASK_ID} taskTitle="My Task" onClose={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('task-detail')).toBeTruthy();
    });
    expect(screen.queryByTestId('task-edit')).toBeNull();
  });

  it('passes taskId to TaskDetailClient', async () => {
    renderSheet(<TaskSheet taskId={TASK_ID} taskTitle="My Task" onClose={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('detail-task-id').textContent).toBe(TASK_ID);
    });
  });

  it('shows the task title in view mode', async () => {
    renderSheet(<TaskSheet taskId={TASK_ID} taskTitle="My Task" onClose={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('sheet-title').textContent).toBe('My Task');
    });
  });

  it('shows fallback title when taskTitle is not provided', async () => {
    renderSheet(<TaskSheet taskId={TASK_ID} onClose={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('sheet-title').textContent).toBe('Tasks');
    });
  });

  it('switches to TaskEditClient when Edit is clicked', async () => {
    renderSheet(<TaskSheet taskId={TASK_ID} taskTitle="My Task" onClose={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('task-detail')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('edit-button'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('task-edit')).toBeTruthy();
    });
    expect(screen.queryByTestId('task-detail')).toBeNull();
    expect(screen.getByTestId('edit-task-id').textContent).toBe(TASK_ID);
  });

  it('changes title to "Edit task" in edit mode', async () => {
    renderSheet(<TaskSheet taskId={TASK_ID} taskTitle="My Task" onClose={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('task-detail')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('edit-button'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('sheet-title').textContent).toBe('Edit task');
    });
  });

  it('returns to detail view when edit is cancelled', async () => {
    renderSheet(<TaskSheet taskId={TASK_ID} taskTitle="My Task" onClose={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('task-detail')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('edit-button'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('task-edit')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('close-edit-button'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('task-detail')).toBeTruthy();
    });
    expect(screen.queryByTestId('task-edit')).toBeNull();
  });

  it('restores title after exiting edit mode', async () => {
    renderSheet(<TaskSheet taskId={TASK_ID} taskTitle="Important Task" onClose={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('task-detail')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('edit-button'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('sheet-title').textContent).toBe('Edit task');
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('close-edit-button'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('sheet-title').textContent).toBe('Important Task');
    });
  });

  it('calls onClose when clicking close in view mode', async () => {
    const onClose = jest.fn();
    renderSheet(<TaskSheet taskId={TASK_ID} taskTitle="My Task" onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByTestId('task-detail')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('close-sheet'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking close in edit mode', async () => {
    const onClose = jest.fn();
    renderSheet(<TaskSheet taskId={TASK_ID} taskTitle="My Task" onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByTestId('task-detail')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('edit-button'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('task-edit')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('close-sheet'));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
