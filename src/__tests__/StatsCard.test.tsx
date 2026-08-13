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
  //
  // The tiles used to hard-code hex (`border-[#2563eb]`), which is why they were
  // the one part of the dashboard that kept light-mode colours in dark mode. The
  // colour now comes from the theme, so what is asserted is the icon chip's token
  // pair — the border is deliberately neutral on every variant.

  it('tints the icon chip with the brand token for blue', () => {
    const { container } = render(
      <StatsCard title="Blue Card" value={10} icon={defaultIcon} color="blue" />,
    );
    expect(container.innerHTML).toContain('bg-(--brand-quiet)');
    expect(container.innerHTML).toContain('text-(--brand-text)');
  });

  it('tints the icon chip with the success token for green', () => {
    const { container } = render(
      <StatsCard title="Green Card" value={10} icon={defaultIcon} color="green" />,
    );
    expect(container.innerHTML).toContain('bg-(--success-quiet)');
    expect(container.innerHTML).toContain('text-(--success-text)');
  });

  it('keeps the border neutral so a row of tiles does not compete', () => {
    const { container } = render(
      <StatsCard title="Blue Card" value={10} icon={defaultIcon} color="blue" />,
    );
    const motionDiv = container.querySelector('[data-testid="motion-div"]');
    expect(motionDiv?.className).toContain('border-(--border-subtle)');
  });

  it('maps purple to the purple token, not to sky blue', () => {
    // `purple` was mapped to #0ea5e9 — the "on leave now" tile never looked purple.
    const { container } = render(
      <StatsCard title="Purple" value={5} icon={defaultIcon} color="purple" />,
    );
    expect(container.innerHTML).toContain('bg-(--purple-quiet)');
  });

  it('renders icon inside card', () => {
    const { container } = render(
      <StatsCard title="Purple" value={5} icon={defaultIcon} color="purple" />,
    );
    expect(container.querySelector('[data-testid="test-icon"]')).toBeInTheDocument();
  });

  // ── Context, links and sparkline ───────────────────────────────────────

  it('renders a hint under the number', () => {
    render(
      <StatsCard
        title="On leave"
        value={2}
        hint="25% of the team"
        icon={defaultIcon}
        color="purple"
      />,
    );
    expect(screen.getByText('25% of the team')).toBeInTheDocument();
  });

  it('turns the tile into a link when href is given', () => {
    const { container } = render(
      <StatsCard title="Team" value={4} href="/team" icon={defaultIcon} color="blue" />,
    );
    const link = container.querySelector('a[href="/team"]');
    expect(link).toBeInTheDocument();
    // The whole tile is the target, so the number is inside it.
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(link?.textContent).toContain('4');
  });

  it('stays a plain tile without href', () => {
    const { container } = render(
      <StatsCard title="Team" value={4} icon={defaultIcon} color="blue" />,
    );
    expect(container.querySelector('a')).toBeNull();
  });

  it('draws a sparkline for a series that varies', () => {
    const { container } = render(
      <StatsCard
        title="Approved"
        value={5}
        trend={[1, 4, 2, 5]}
        icon={defaultIcon}
        color="green"
      />,
    );
    expect(container.querySelector('svg path')).toBeInTheDocument();
  });

  it('omits the sparkline when the series is flat or too short', () => {
    // A flat line would read as decoration rather than data.
    const { container: flat } = render(
      <StatsCard title="Flat" value={3} trend={[3, 3, 3]} icon={defaultIcon} color="green" />,
    );
    expect(flat.querySelector('svg')).toBeNull();

    const { container: short } = render(
      <StatsCard title="Short" value={3} trend={[3]} icon={defaultIcon} color="green" />,
    );
    expect(short.querySelector('svg')).toBeNull();
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
