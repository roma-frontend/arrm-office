/**
 * Tests for MobilePageTransition — mobile-only page wrapper that fades out on
 * route change and slides back in after a short delay.
 *
 * Mocks: next/navigation (mutable usePathname).
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, act } from '@testing-library/react';

// ── next/navigation: mutable pathname per test ───────────────────────────────
let mockPathname = '/home';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

import { MobilePageTransition } from '@/components/ui/mobile-page-transition';

const wrapperOf = () => screen.getByText('Page content').parentElement as HTMLElement;

describe('MobilePageTransition', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPathname = '/home';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders children and starts visible', () => {
    render(
      <MobilePageTransition>
        <span>Page content</span>
      </MobilePageTransition>,
    );
    expect(screen.getByText('Page content')).toBeInTheDocument();
    expect(wrapperOf().className).toContain('opacity-100');
    expect(wrapperOf().className).toContain('translate-x-0');
  });

  it('fades out on route change then slides back in after the delay', () => {
    const { rerender } = render(
      <MobilePageTransition>
        <span>Page content</span>
      </MobilePageTransition>,
    );

    mockPathname = '/about';
    rerender(
      <MobilePageTransition>
        <span>Page content</span>
      </MobilePageTransition>,
    );

    // Fade-out applied synchronously on the route change
    expect(wrapperOf().className).toContain('opacity-0');
    expect(wrapperOf().className).toContain('translate-x-4');

    // After the 50ms delay the page slides back in
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(wrapperOf().className).toContain('opacity-100');
    expect(wrapperOf().className).toContain('translate-x-0');
  });

  it('stays visible when the pathname does not change', () => {
    const { rerender } = render(
      <MobilePageTransition>
        <span>Page content</span>
      </MobilePageTransition>,
    );

    rerender(
      <MobilePageTransition>
        <span>Page content</span>
      </MobilePageTransition>,
    );

    expect(wrapperOf().className).toContain('opacity-100');
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(wrapperOf().className).toContain('opacity-100');
  });

  it('applies the passed className and the desktop overrides', () => {
    render(
      <MobilePageTransition className="pt-4">
        <span>Page content</span>
      </MobilePageTransition>,
    );
    expect(wrapperOf().className).toContain('pt-4');
    expect(wrapperOf().className).toContain('lg:!opacity-100');
    expect(wrapperOf().className).toContain('lg:!translate-x-0');
  });

  it('clears the pending timer on unmount mid-transition', () => {
    const { rerender, unmount } = render(
      <MobilePageTransition>
        <span>Page content</span>
      </MobilePageTransition>,
    );

    mockPathname = '/contact';
    rerender(
      <MobilePageTransition>
        <span>Page content</span>
      </MobilePageTransition>,
    );
    expect(wrapperOf().className).toContain('opacity-0');

    expect(() => unmount()).not.toThrow();
    act(() => {
      jest.advanceTimersByTime(50);
    });
  });
});
