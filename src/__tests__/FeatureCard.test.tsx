/**
 * Tests for the landing FeatureCard — reveal-on-scroll card with hover glow.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: 'en' },
  }),
}));

// ── next/link mock ───────────────────────────────────────────────────────────
jest.mock('next/link', () => {
  return ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
});

// ── IntersectionObserver mock ────────────────────────────────────────────────
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) {
    this.callback = cb;
    MockIntersectionObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = '';
  thresholds = [];
  trigger(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting, target: document.createElement('div') } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}
(globalThis as any).IntersectionObserver = MockIntersectionObserver;

import FeatureCard from '@/components/landing/FeatureCard';

const baseProps = {
  icon: <span data-testid="feature-icon">🚀</span>,
  title: 'Leave Management',
  description: 'Track requests',
  gradient: 'linear-gradient(blue, purple)',
  accentColor: '#2563eb',
};

beforeEach(() => {
  MockIntersectionObserver.instances = [];
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('FeatureCard', () => {
  it('renders the title, description and icon', () => {
    render(<FeatureCard {...baseProps} />);
    expect(screen.getByText('Leave Management')).toBeInTheDocument();
    expect(screen.getByText('Track requests')).toBeInTheDocument();
    expect(screen.getByTestId('feature-icon')).toBeInTheDocument();
  });

  it('is hidden until the IntersectionObserver reports it visible', () => {
    const { container } = render(<FeatureCard {...baseProps} />);
    const card = container.firstChild as HTMLElement;
    expect(card.style.opacity).toBe('0');

    act(() => {
      MockIntersectionObserver.instances[0]?.trigger(true);
    });
    expect(card.style.opacity).toBe('1');
  });

  it('renders the badge when provided', () => {
    render(<FeatureCard {...baseProps} badge="New" />);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('renders the learn-more link with the default href', () => {
    render(<FeatureCard {...baseProps} />);
    expect(screen.getByText('landing.learnMore').closest('a')).toHaveAttribute(
      'href',
      '/features/leave-types',
    );
  });

  it('uses a custom href when provided', () => {
    render(<FeatureCard {...baseProps} href="/custom" />);
    expect(screen.getByText('landing.learnMore').closest('a')).toHaveAttribute('href', '/custom');
  });

  it('tracks the mouse position on hover', () => {
    const { container } = render(<FeatureCard {...baseProps} />);
    act(() => {
      MockIntersectionObserver.instances[0]?.trigger(true);
    });
    const card = container.firstChild as HTMLElement;
    fireEvent.mouseEnter(card);
    fireEvent.mouseMove(card, { clientX: 50, clientY: 60 });
    // the glow overlay appears once hovered
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});
