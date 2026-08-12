/**
 * Tests for the analytics StatsCard — animated stat card with trend,
 * color variants and translation of the "vs last month" caption.
 */

import React from 'react';
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, initial, animate, whileHover, transition, ...props }: any) => (
      <div {...props}>{children}</div>
    ),
  },
}));

jest.mock('lucide-react', () => ({
  Users: (props: any) => <span data-testid="icon" {...props} />,
}));

import { StatsCard } from '@/components/analytics/StatsCard';
import { Users } from 'lucide-react';

describe('analytics StatsCard', () => {
  const icon = Users;

  it('renders title and value without a trend', () => {
    render(<StatsCard title="Headcount" value={120} icon={icon} />);
    expect(screen.getByText('Headcount')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.queryByText('analytics.vsLastMonth')).not.toBeInTheDocument();
  });

  it('renders a positive trend with an up arrow', () => {
    render(
      <StatsCard
        title="Revenue"
        value="1.2M"
        icon={icon}
        trend={{ value: 12, isPositive: true }}
      />,
    );
    expect(screen.getByText('↑ 12%')).toBeInTheDocument();
    expect(screen.getByText('analytics.vsLastMonth')).toBeInTheDocument();
  });

  it('renders a negative trend with a down arrow and absolute value', () => {
    render(
      <StatsCard title="Churn" value="3%" icon={icon} trend={{ value: -8, isPositive: false }} />,
    );
    expect(screen.getByText('↓ 8%')).toBeInTheDocument();
  });

  it('applies the color variant classes for all colors', () => {
    const variants = [
      ['blue', 'bg-blue-500/20', 'text-blue-600'],
      ['green', 'bg-green-500/20', 'text-green-600'],
      ['yellow', 'bg-yellow-500/20', 'text-yellow-600'],
      ['red', 'bg-red-500/20', 'text-red-600'],
      ['purple', 'bg-purple-500/20', 'text-purple-600'],
    ] as const;
    const { rerender, container } = render(
      <StatsCard title="A" value={1} icon={icon} color="blue" />,
    );
    for (const [color, bgClass, iconClass] of variants) {
      rerender(<StatsCard title="A" value={1} icon={icon} color={color} />);
      expect(container.querySelector(`[class*="${bgClass}"]`)).not.toBeNull();
      expect(container.querySelector(`[class*="${iconClass}"]`)).not.toBeNull();
    }
  });

  it('renders with the default blue color when color is omitted', () => {
    const { container } = render(<StatsCard title="A" value={1} icon={icon} />);
    expect(container.querySelector('[class*="bg-blue-500/20"]')).not.toBeNull();
  });
});
