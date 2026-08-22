/**
 * Tests for CustomizeViewMenu — the Customize popover on the task board.
 *
 * Customize is the half of the split that is *not* shareable: everything here
 * is per-device layout. The cases below pin the parts that are easy to get
 * wrong — that a toggle reports the key it belongs to, that the last kanban
 * lane cannot be switched off, that Reset is inert while nothing is customized,
 * and that the most relevant column set is offered first for the current view.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, second?: unknown) => {
      if (typeof second === 'string') return second;
      if (second && typeof second === 'object') {
        const vars = second as Record<string, unknown>;
        return (vars.defaultValue as string) ?? key;
      }
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: any) => <div data-testid="popover">{children}</div>,
  PopoverTrigger: ({ children }: any) => <div data-testid="popover-trigger">{children}</div>,
  PopoverContent: ({ children }: any) => <div data-testid="popover-content">{children}</div>,
}));

// Radix Switch needs pointer capture APIs jsdom lacks; the wrapper is excluded
// from coverage, so a checkbox with the same contract stands in for it.
jest.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, disabled, ...rest }: any) => (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={rest['aria-label']}
      onChange={(event) => onCheckedChange(event.currentTarget.checked)}
    />
  ),
}));

jest.mock('lucide-react', () => {
  const MockIcon = (props: any) => <span data-testid="lucide-icon" {...props} />;
  return new Proxy({}, { get: () => MockIcon });
});

import { CustomizeViewMenu } from '@/components/tasks/CustomizeViewMenu';
import {
  DEFAULT_TASK_VIEW_PREFERENCES,
  type TaskListColumns,
  type TaskViewPreferences,
} from '@/hooks/useTaskViewPreferences';

const setPrefs = jest.fn();
const toggleColumn = jest.fn();
const toggleBoardColumn = jest.fn();
const reset = jest.fn();

/** Prefs patch that may name a single column or lane, as a real caller would not. */
type PrefsOverride = Partial<Omit<TaskViewPreferences, 'columns' | 'board'>> & {
  columns?: Partial<TaskListColumns>;
  board?: Partial<TaskViewPreferences['board']>;
};

function renderMenu(
  overrides: {
    prefs?: PrefsOverride;
    viewMode?: 'kanban' | 'list' | 'timeline';
    isDefault?: boolean;
    hasRecurring?: boolean;
  } = {},
) {
  const prefs: TaskViewPreferences = {
    ...DEFAULT_TASK_VIEW_PREFERENCES,
    ...overrides.prefs,
    columns: { ...DEFAULT_TASK_VIEW_PREFERENCES.columns, ...overrides.prefs?.columns },
    board: { ...DEFAULT_TASK_VIEW_PREFERENCES.board, ...overrides.prefs?.board },
  };
  render(
    <CustomizeViewMenu
      prefs={prefs}
      viewMode={overrides.viewMode ?? 'kanban'}
      setPrefs={setPrefs}
      toggleColumn={toggleColumn}
      toggleBoardColumn={toggleBoardColumn}
      reset={reset}
      isDefault={overrides.isDefault ?? true}
      hasRecurring={overrides.hasRecurring ?? false}
    />,
  );
  return prefs;
}

/** Index of a piece of text in the rendered order, for "which section is first". */
function positionOf(text: string): number {
  return (document.body.textContent ?? '').indexOf(text);
}

describe('CustomizeViewMenu', () => {
  beforeEach(() => {
    setPrefs.mockReset();
    toggleColumn.mockReset();
    toggleBoardColumn.mockReset();
    reset.mockReset();
  });

  it('says the choices are device-local, not part of a shared link', () => {
    renderMenu();
    expect(screen.getByText('Saved on this device — not part of a shared link.')).toBeTruthy();
  });

  it('marks the active density and switches on click', () => {
    renderMenu();
    const comfortable = screen.getByRole('radio', { name: 'Comfortable' });
    const compact = screen.getByRole('radio', { name: 'Compact' });
    expect(comfortable.getAttribute('aria-checked')).toBe('true');
    expect(compact.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(compact);
    expect(setPrefs).toHaveBeenCalledWith({ density: 'compact' });
  });

  it('reflects a stored compact density', () => {
    renderMenu({ prefs: { density: 'compact' } });
    expect(screen.getByRole('radio', { name: 'Compact' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('toggles a list column by its own key', () => {
    renderMenu();
    const project = screen.getByLabelText('Project') as HTMLInputElement;
    expect(project.checked).toBe(true);
    fireEvent.click(project);
    expect(toggleColumn).toHaveBeenCalledWith('project');
    expect(toggleBoardColumn).not.toHaveBeenCalled();
  });

  it('shows a hidden list column as unchecked', () => {
    renderMenu({ prefs: { columns: { project: false } } });
    expect((screen.getByLabelText('Project') as HTMLInputElement).checked).toBe(false);
  });

  it('toggles a board lane by its own key', () => {
    renderMenu();
    const cancelled = screen.getByLabelText('Cancelled') as HTMLInputElement;
    expect(cancelled.checked).toBe(false);
    fireEvent.click(cancelled);
    expect(toggleBoardColumn).toHaveBeenCalledWith('cancelled');
  });

  it('disables the only lane left, rather than letting the click do nothing', () => {
    renderMenu({
      prefs: {
        board: {
          pending: false,
          in_progress: false,
          review: false,
          completed: true,
          cancelled: false,
        },
      },
    });
    expect((screen.getByLabelText('Completed') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Pending') as HTMLInputElement).disabled).toBe(false);
  });

  it('leaves every lane enabled while more than one is on', () => {
    renderMenu();
    for (const lane of ['Pending', 'In progress', 'Review', 'Completed', 'Cancelled']) {
      expect((screen.getByLabelText(lane) as HTMLInputElement).disabled).toBe(false);
    }
  });

  it('offers board lanes before list columns on the kanban', () => {
    renderMenu({ viewMode: 'kanban' });
    expect(positionOf('Board columns')).toBeLessThan(positionOf('List columns'));
  });

  it('offers list columns first in the list view', () => {
    renderMenu({ viewMode: 'list' });
    expect(positionOf('List columns')).toBeLessThan(positionOf('Board columns'));
  });

  it('keeps Reset inert until something has been customized', () => {
    renderMenu({ isDefault: true });
    const button = screen.getByRole('button', { name: /Reset/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('resets on demand once the view is customized', () => {
    renderMenu({ isDefault: false });
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('switches the summary bar off through setPrefs', () => {
    renderMenu();
    fireEvent.click(screen.getByLabelText('Summary bar'));
    expect(setPrefs).toHaveBeenCalledWith({ showStats: false });
  });

  it('switches hide-completed on through setPrefs', () => {
    renderMenu();
    fireEvent.click(screen.getByLabelText('Hide completed'));
    expect(setPrefs).toHaveBeenCalledWith({ hideCompleted: true });
  });

  it('omits the recurring switch when there is no series to hide', () => {
    renderMenu({ hasRecurring: false });
    expect(screen.queryByLabelText('Recurring strip')).toBeNull();
  });

  it('offers the recurring switch when a series exists', () => {
    renderMenu({ hasRecurring: true });
    fireEvent.click(screen.getByLabelText('Recurring strip'));
    expect(setPrefs).toHaveBeenCalledWith({ showRecurring: false });
  });
});
