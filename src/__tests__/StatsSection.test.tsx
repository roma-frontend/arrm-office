/**
 * Tests for the landing StatsSection — stat cards grid.
 */

import React from 'react';
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: 'en' },
  }),
}));

// ── StatsCard mock ───────────────────────────────────────────────────────────
jest.mock('@/components/landing/StatsCard', () => {
  return {
    __esModule: true,
    default: ({ value, label, delay }: any) => (
      <div data-testid="stat-card" data-value={value} data-label={label} data-delay={delay}>
        {value} · {label}
      </div>
    ),
  };
});

import StatsSection from '@/components/landing/StatsSection';

describe('StatsSection', () => {
  it('renders the section heading', () => {
    render(<StatsSection />);
    expect(screen.getByText('landing.byTheNumbers')).toBeInTheDocument();
    expect(screen.getByText('landing.trustedAt')).toBeInTheDocument();
  });

  it('renders four stat cards with staggered delays', () => {
    render(<StatsSection />);
    const cards = screen.getAllByTestId('stat-card');
    expect(cards).toHaveLength(4);
    expect(cards[0]).toHaveAttribute('data-delay', '0');
    // i * 0.1 in floating point can be 0.30000000000000004
    expect(Number(cards[3].getAttribute('data-delay'))).toBeCloseTo(0.3, 5);
  });

  it('labels the section with an aria-label', () => {
    const { container } = render(<StatsSection />);
    expect(container.querySelector('[aria-label="Platform statistics"]')).toBeInTheDocument();
  });
});
