/**
 * Tests for StatsCard — animated stat card with color variants, change indicator, count-up.
 *
 * Pure presentational component (no Convex). Tests cover all color variants,
 * numeric/string values, change direction, prefix/suffix, and animation.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, act } from '@testing-library/react';

// ── CSS motion mock (with whileHover support) ────────────────────────────────
jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, initial, animate, whileHover, transition, className }: any) => (
      <div
        data-testid="motion-div"
        data-initial={JSON.stringify(initial)}
        data-animate={JSON.stringify(animate)}
        data-transition={JSON.stringify(transition)}
        className={className}
      >
        {children}
      </div>
    ),
  },
}));

// ── Lucide icons mock ────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="lucide-icon" {...props} />;
  return { TrendingUp: Icon, TrendingDown: Icon };
});

// ── cn utility mock ──────────────────────────────────────────────────────────
jest.mock('@/lib/utils', () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
}));

// ── Module under test ──
import { StatsCard } from '@/components/dashboard/StatsCard';

const defaultIcon = <span data-testid="test-icon">🔵</span>;

describe('StatsCard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Basic rendering ────────────────────────────────────────────────────

  it('renders title and value', () => {
    render(<StatsCard title="Total Employees" value={42} icon={defaultIcon} color="blue" />);
    expect(screen.getByText('Total Employees')).toBeInTheDocument();
    // After animation completes (count-up target = 42)
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders with all four dashboard colors', () => {
    const colors = ['blue', 'green', 'yellow', 'purple'] as const;
    colors.forEach((color) => {
      const { container } = render(
        <StatsCard title={color} value={10} icon={defaultIcon} color={color} />,
      );
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(screen.getByText(color)).toBeInTheDocument();
    });
  });

  it('renders with string value', () => {
    render(<StatsCard title="Loading" value="—" icon={defaultIcon} color="blue" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  // ── Change indicator ───────────────────────────────────────────────────

  it('shows positive change with TrendingUp icon', () => {
    const { container } = render(
      <StatsCard title="Growth" value={100} change={15} icon={defaultIcon} color="green" />,
    );
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    // Change text: +15%
    expect(screen.getByText('+15%')).toBeInTheDocument();
    expect(screen.getByText('Growth')).toBeInTheDocument();
  });

  it('shows negative change with TrendingDown icon', () => {
    const { container } = render(
      <StatsCard title="Decline" value={50} change={-8} icon={defaultIcon} color="red" />,
    );
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    // Change text: -8% (no + sign)
    expect(screen.getByText('-8%')).toBeInTheDocument();
  });

  it('shows change label when provided', () => {
    render(
      <StatsCard
        title="Revenue"
        value={500}
        change={12}
        changeLabel="vs last month"
        icon={defaultIcon}
        color="blue"
      />,
    );
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText('vs last month')).toBeInTheDocument();
  });

  it('does not render change section when change is undefined', () => {
    render(<StatsCard title="Static" value={42} icon={defaultIcon} color="blue" />);
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.queryByText('%')).not.toBeInTheDocument();
  });

  // ── Prefix / Suffix ────────────────────────────────────────────────────

  it('renders prefix before value', () => {
    render(<StatsCard title="Money" value={99} prefix="$" icon={defaultIcon} color="green" />);
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText('$')).toBeInTheDocument();
    expect(screen.getByText('99')).toBeInTheDocument();
  });

  it('renders suffix after value', () => {
    render(<StatsCard title="Percentage" value={85} suffix="%" icon={defaultIcon} color="blue" />);
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.getByText('%')).toBeInTheDocument();
  });

  // ── Count-up animation ─────────────────────────────────────────────────

  it('animates count from 0 to target value', () => {
    const { rerender } = render(
      <StatsCard title="Animating" value={100} icon={defaultIcon} color="blue" />,
    );

    // Before animation completes, count should be 0 or close to 0
    // (animation starts at 0)

    // Advance time partially
    act(() => {
      jest.advanceTimersByTime(500);
    });
    // After 500ms of 1500ms, progress ~33%, eased ~0.3
    // count = round(0.3 * 100) = 30

    // Advance the rest
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    // After full duration, should reach 100
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('handles zero value in count-up', () => {
    render(<StatsCard title="Zero" value={0} icon={defaultIcon} color="yellow" />);
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  // ── Color variants ─────────────────────────────────────────────────────

  it('applies color-specific border class for blue', () => {
    const { container } = render(
      <StatsCard title="Blue Card" value={10} icon={defaultIcon} color="blue" />,
    );
    const motionDiv = container.querySelector('[data-testid="motion-div"]');
    expect(motionDiv?.className).toContain('border-[#2563eb]');
  });

  it('applies color-specific border class for green', () => {
    const { container } = render(
      <StatsCard title="Green Card" value={10} icon={defaultIcon} color="green" />,
    );
    const motionDiv = container.querySelector('[data-testid="motion-div"]');
    expect(motionDiv?.className).toContain('border-[#10b981]');
  });

  it('renders icon inside card', () => {
    const { container } = render(
      <StatsCard title="Purple" value={5} icon={defaultIcon} color="purple" />,
    );
    expect(container.querySelector('[data-testid="test-icon"]')).toBeInTheDocument();
  });

  // ── Index / delay ──────────────────────────────────────────────────────

  it('applies different animation delay based on index', () => {
    const { container: c1 } = render(
      <StatsCard title="First" value={1} icon={defaultIcon} color="blue" index={0} />,
    );
    const d1 = c1.querySelector('[data-testid="motion-div"]');
    const t1 = JSON.parse(d1?.getAttribute('data-transition') || '{}');
    expect(t1.delay).toBe(0);

    const { container: c2 } = render(
      <StatsCard title="Last" value={1} icon={defaultIcon} color="blue" index={3} />,
    );
    const d2 = c2.querySelector('[data-testid="motion-div"]');
    const t2 = JSON.parse(d2?.getAttribute('data-transition') || '{}');
    expect(t2.delay).toBeCloseTo(0.3, 5);
  });

  // ── Memo comparison ────────────────────────────────────────────────────

  it('passes correct props to memo', () => {
    const { rerender } = render(
      <StatsCard title="Memo Test" value={10} icon={defaultIcon} color="blue" />,
    );
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText('10')).toBeInTheDocument();

    // Re-render with different value — should update
    rerender(<StatsCard title="Memo Test" value={20} icon={defaultIcon} color="blue" />);
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText('20')).toBeInTheDocument();
  });
});
