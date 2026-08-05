/**
 * Tests for ProjectBadge — the clickable project chip shown on task cards.
 *
 * Mocks: next/navigation (useRouter), react-i18next (useTranslation).
 * Pattern follows ProjectsClient.test.tsx.
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

// ── Module under test ──
import { ProjectBadge } from '@/components/tasks/ProjectBadge';

describe('ProjectBadge', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('renders the project name when both projectId and projectName are present', () => {
    render(<ProjectBadge projectId="proj-1" projectName="Q4 Launch" />);
    expect(screen.getByText('📁 Q4 Launch')).toBeInTheDocument();
    expect(screen.getByRole('link')).toBeInTheDocument();
  });

  it('sets a descriptive tooltip title', () => {
    render(<ProjectBadge projectId="proj-1" projectName="Q4 Launch" />);
    expect(screen.getByRole('link')).toHaveAttribute('title', 'Q4 Launch — Open project');
  });

  it('renders nothing when projectId is missing', () => {
    const { container } = render(<ProjectBadge projectName="Q4 Launch" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when projectName is missing (e.g. project deleted)', () => {
    const { container } = render(<ProjectBadge projectId="proj-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('navigates to the project page on click and stops propagation', () => {
    const onCardClick = jest.fn();
    render(
      <div onClick={onCardClick}>
        <ProjectBadge projectId="proj-1" projectName="Q4 Launch" />
      </div>,
    );
    fireEvent.click(screen.getByRole('link'));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/projects/proj-1');
    // The parent card's open-task handler must NOT fire.
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it('navigates on Enter key', () => {
    render(<ProjectBadge projectId="proj-1" projectName="Q4 Launch" />);
    fireEvent.keyDown(screen.getByRole('link'), { key: 'Enter' });
    expect(mockPush).toHaveBeenCalledWith('/projects/proj-1');
  });

  it('navigates on Space key', () => {
    render(<ProjectBadge projectId="proj-1" projectName="Q4 Launch" />);
    fireEvent.keyDown(screen.getByRole('link'), { key: ' ' });
    expect(mockPush).toHaveBeenCalledWith('/projects/proj-1');
  });

  it('does not navigate on other keys', () => {
    render(<ProjectBadge projectId="proj-1" projectName="Q4 Launch" />);
    fireEvent.keyDown(screen.getByRole('link'), { key: 'Tab' });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('applies the extra className to the badge', () => {
    render(<ProjectBadge projectId="proj-1" projectName="Q4 Launch" className="max-w-[160px]" />);
    expect(screen.getByRole('link').className).toContain('max-w-[160px]');
  });
});
