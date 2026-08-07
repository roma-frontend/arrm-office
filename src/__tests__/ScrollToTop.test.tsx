/**
 * Tests for ScrollToTop — shows the button after scrolling, scrolls back up.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// ── Hooks + icons mocks ──────────────────────────────────────────────────────
jest.mock('@/hooks/useHydrated', () => ({
  useHydrated: () => true,
}));
jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="arrow-up" {...props} />;
  return { ArrowUp: Icon };
});

import ScrollToTop from '@/components/landing/ScrollToTop';

const originalScrollY = (globalThis as any).scrollY;
const originalScrollTo = (globalThis as any).scrollTo;

beforeEach(() => {
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
  (globalThis as any).scrollTo = jest.fn();
});

afterEach(() => {
  (globalThis as any).scrollTo = originalScrollTo;
  Object.defineProperty(window, 'scrollY', {
    value: originalScrollY ?? 0,
    configurable: true,
    writable: true,
  });
});

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', { value, configurable: true, writable: true });
}

describe('ScrollToTop', () => {
  it('renders nothing while near the top of the page', () => {
    setScrollY(100);
    render(<ScrollToTop />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('appears after scrolling past 300px', async () => {
    setScrollY(500);
    render(<ScrollToTop />);
    // the scroll handler runs on mount and on the scroll event
    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Scroll to top')).toBeInTheDocument();
  });

  it('disappears when scrolling back up', async () => {
    setScrollY(500);
    render(<ScrollToTop />);
    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    setScrollY(50);
    fireEvent.scroll(window);
    await waitFor(() => {
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  it('scrolls to the top when clicked', async () => {
    setScrollY(500);
    render(<ScrollToTop />);
    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button'));
    expect((globalThis as any).scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
});
