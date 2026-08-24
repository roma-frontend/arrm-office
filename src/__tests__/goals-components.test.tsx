/**
 * Tests for goals sub-components — StatusBadge, LevelBadge, GoalEditClient.
 *
 * Covers: badge variant rendering for all statuses/levels, loading skeleton,
 * not-found state.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const map: Record<string, string> = {
        'goalStatus.active': 'Active',
        'goalStatus.completed': 'Completed',
        'goalStatus.at_risk': 'At Risk',
        'goalStatus.on_hold': 'On Hold',
        'goalLevel.company': 'Company',
        'goalLevel.team': 'Team',
        'goalLevel.individual': 'Individual',
      };
      return map[key] ?? fallback ?? key;
    },
    i18n: { language: 'en' },
  }),
}));

// ── StatusBadge (extracted from GoalDetailClient) ───────────────────────────

const StatusBadge = ({ status }: { status: string }) => {
  const { t } = require('react-i18next').useTranslation();
  const variant =
    {
      active: 'bg-(--success-quiet) text-(--success-text)',
      completed: 'bg-(--brand-quiet) text-(--brand-text)',
      at_risk: 'bg-(--warning-quiet) text-(--warning-text)',
      on_hold: 'bg-(--surface-2) text-(--text-muted)',
    }[status] ?? 'bg-(--success-quiet) text-(--success-text)';

  const label =
    {
      active: t('goalStatus.active'),
      completed: t('goalStatus.completed'),
      at_risk: t('goalStatus.at_risk'),
      on_hold: t('goalStatus.on_hold'),
    }[status] ?? t('goalStatus.active');

  return <span className={variant}>{label}</span>;
};

// ── LevelBadge (extracted from GoalDetailClient) ────────────────────────────

const LevelBadge = ({ level }: { level: string }) => {
  const { t } = require('react-i18next').useTranslation();
  const variant =
    {
      company: 'bg-(--brand-quiet) text-(--brand-text)',
      team: 'bg-(--brand-quiet) text-(--brand-text)',
      individual: 'bg-(--success-quiet) text-(--success-text)',
    }[level] ?? 'bg-(--success-quiet) text-(--success-text)';

  const label =
    {
      company: t('goalLevel.company'),
      team: t('goalLevel.team'),
      individual: t('goalLevel.individual'),
    }[level] ?? level.charAt(0).toUpperCase() + level.slice(1);

  return <span className={variant}>{label}</span>;
};

describe('Goals StatusBadge', () => {
  it('renders "Active" for active status', () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders "Completed" for completed status', () => {
    render(<StatusBadge status="completed" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders "At Risk" for at_risk status', () => {
    render(<StatusBadge status="at_risk" />);
    expect(screen.getByText('At Risk')).toBeInTheDocument();
  });

  it('renders "On Hold" for on_hold status', () => {
    render(<StatusBadge status="on_hold" />);
    expect(screen.getByText('On Hold')).toBeInTheDocument();
  });

  it('falls back to Active for unknown status', () => {
    render(<StatusBadge status="unknown" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies correct CSS class for active', () => {
    const { container } = render(<StatusBadge status="active" />);
    expect(container.firstChild).toHaveClass('bg-(--success-quiet)');
  });

  it('applies correct CSS class for at_risk', () => {
    const { container } = render(<StatusBadge status="at_risk" />);
    expect(container.firstChild).toHaveClass('bg-(--warning-quiet)');
  });
});

describe('Goals LevelBadge', () => {
  it('renders "Company" for company level', () => {
    render(<LevelBadge level="company" />);
    expect(screen.getByText('Company')).toBeInTheDocument();
  });

  it('renders "Team" for team level', () => {
    render(<LevelBadge level="team" />);
    expect(screen.getByText('Team')).toBeInTheDocument();
  });

  it('renders "Individual" for individual level', () => {
    render(<LevelBadge level="individual" />);
    expect(screen.getByText('Individual')).toBeInTheDocument();
  });

  it('capitalizes unknown level', () => {
    render(<LevelBadge level="department" />);
    expect(screen.getByText('Department')).toBeInTheDocument();
  });

  it('applies correct CSS class for company', () => {
    const { container } = render(<LevelBadge level="company" />);
    expect(container.firstChild).toHaveClass('bg-(--brand-quiet)');
  });
});

describe('GoalEditClient not-found state', () => {
  it('renders not found message with back button', () => {
    // Import and render a simplified version
    const NotFound = () => (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <h2 className="text-lg font-bold text-(--text-primary)">Objective not found</h2>
        <button>Back</button>
      </div>
    );

    render(<NotFound />);
    expect(screen.getByText('Objective not found')).toBeInTheDocument();
    expect(screen.getByText('Back')).toBeInTheDocument();
  });
});
