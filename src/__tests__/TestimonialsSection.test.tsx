/**
 * Tests for the landing TestimonialsSection — the marquee wall of reviews.
 * Verifies the i18n placeholder fallback (no curated data yet) and that
 * curated showcase testimonials from Convex win over the placeholders.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: 'en' },
  }),
}));

// ── convex mock — return the row set supplied per test ──────────────────────
let mockShowcase: { logos: unknown[]; testimonials: unknown[] } | undefined;
jest.mock('convex/react', () => ({
  useQuery: () => mockShowcase,
}));

// ── IntersectionObserver mock (useReveal) ───────────────────────────────────
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
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  trigger(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting, target: document.createElement('div') } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}
(globalThis as any).IntersectionObserver = MockIntersectionObserver;

beforeEach(() => {
  mockShowcase = undefined;
  MockIntersectionObserver.instances = [];
  jest.clearAllMocks();
});

import TestimonialsSection from '@/components/landing/TestimonialsSection';

describe('TestimonialsSection', () => {
  it('renders the i18n placeholder wall when no curated testimonials exist', () => {
    mockShowcase = { logos: [], testimonials: [] };
    render(<TestimonialsSection />);
    // Placeholder cards render i18n keys (the mock returns the key itself),
    // wrapped in the card's typographic quotes (separate aria-hidden spans, so
    // the quote text node stays clean for the landing editor). The marquee
    // duplicates the track, so every card appears twice — assert on the
    // collection with a regex that matches inside the quote spans.
    expect(screen.getAllByText(/testimonials\.testimonial1\.text/).length).toBeGreaterThan(0);
    // Placeholder metric keys have no value in this mock (t returns the ''
    // fallback), so no metric chip renders — real curated rows carry their own.
  });

  it('renders curated testimonials instead of i18n placeholders', () => {
    mockShowcase = {
      logos: [],
      testimonials: [
        {
          id: 'row1',
          company: 'Acme Corp',
          quote: 'Strata cut our HR admin time in half.',
          authorName: 'Jane Doe',
          authorRole: 'Head of People',
          metric: '$70k',
          metricLabel: 'saved in year one',
          order: 0,
        },
      ],
    };
    render(<TestimonialsSection />);
    expect(screen.getAllByText(/Strata cut our HR admin time in half\./).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0);
    // Role and company render as separate spans (each maps to its own i18n
    // key in the editor), so assert the parts individually.
    expect(screen.getAllByText('Head of People').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$70k').length).toBeGreaterThan(0);
  });

  it('renders the i18n fallback while the showcase is still loading (undefined)', () => {
    mockShowcase = undefined;
    render(<TestimonialsSection />);
    expect(screen.getAllByText(/testimonials\.testimonial1\.text/).length).toBeGreaterThan(0);
  });

  it('renders the play/pause control and toggles the marquee state', () => {
    mockShowcase = { logos: [], testimonials: [] };
    render(<TestimonialsSection />);
    // The control renders its i18n fallback label (mock t returns the fallback).
    const button = screen.getByRole('button', { name: 'Pause' });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });
});
