/**
 * Tests for TimelineView — specifically the clickable project link in the
 * task hover tooltip.
 *
 * Mocks: next/navigation (useRouter), react-i18next, @/hooks/useNow (fixed
 * clock), lucide-react icons. Pattern follows ProjectBadge.test.tsx.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key),
    i18n: { language: 'en' },
  }),
}));

// ── Router mock ──────────────────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ── useNow mock: fixed clock so tooltip/overdue logic is deterministic ──────
jest.mock('@/hooks/useNow', () => ({
  useNow: () => 1_750_000_000_000,
}));

// ── Icons mock ───────────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const MockIcon = (props: any) => <span data-testid="lucide-icon" {...props} />;
  return {
    Calendar: MockIcon,
    AlertTriangle: MockIcon,
    CheckCircle2: MockIcon,
    Clock: MockIcon,
    Circle: MockIcon,
  };
});

// ── Module under test ──
import TimelineView from '@/components/tasks/TimelineView';

const BASE_TASK = {
  _id: 'task-1',
  title: 'Build landing page',
  status: 'in_progress' as const,
  priority: 'high' as const,
  createdAt: 1_749_136_000_000, // 1 day before the fixed "now"
  deadline: 1_750_086_400_000, // 1 day after the fixed "now"
  assignedToUser: { name: 'Alice' },
};

describe('TimelineView project tooltip link', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('renders a clickable project link in the tooltip when project is present', () => {
    render(
      <TimelineView
        tasks={[{ ...BASE_TASK, projectId: 'proj-1', projectName: 'Q4 Launch' }]}
        onOpen={() => {}}
      />,
    );
    const projectLink = screen.getByRole('button', { name: /Q4 Launch/ });
    expect(projectLink).toBeInTheDocument();
  });

  it('navigates to the project page on click and stops propagation to the task bar', () => {
    const onOpen = jest.fn();
    render(
      <TimelineView
        tasks={[{ ...BASE_TASK, projectId: 'proj-1', projectName: 'Q4 Launch' }]}
        onOpen={onOpen}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Q4 Launch/ }));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/projects/proj-1');
    // The task bar's onOpen (open task) must NOT fire.
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('does not render the project link when projectName is missing', () => {
    render(
      <TimelineView
        tasks={[{ ...BASE_TASK, projectId: 'proj-1', projectName: null }]}
        onOpen={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /Q4 Launch/ })).toBeNull();
  });

  it('does not render the project link when projectId is missing (e.g. project deleted)', () => {
    render(<TimelineView tasks={[{ ...BASE_TASK, projectName: 'Q4 Launch' }]} onOpen={() => {}} />);
    expect(screen.queryByRole('button', { name: /Q4 Launch/ })).toBeNull();
  });
});
