/**
 * Tests for MobilePageTransition — mobile-only page wrapper that replays a CSS
 * enter animation on route change (and never fades the outgoing page out).
 *
 * Mocks: next/navigation (mutable usePathname).
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';

// ── next/navigation: mutable pathname per test ───────────────────────────────
let mockPathname = '/home';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

import { MobilePageTransition } from '@/components/ui/mobile-page-transition';

const wrapperOf = () => screen.getByText('Page content').parentElement as HTMLElement;

describe('MobilePageTransition', () => {
  beforeEach(() => {
    mockPathname = '/home';
  });

  it('renders children with the enter animation class', () => {
    render(
      <MobilePageTransition>
        <span>Page content</span>
      </MobilePageTransition>,
    );
    expect(screen.getByText('Page content')).toBeInTheDocument();
    expect(wrapperOf().className).toContain('mobile-page-enter');
  });

  it('keeps the enter class (never hides the page) across a route change', () => {
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

    // The effect replays the keyframe; the class is present again afterwards and
    // no opacity-0 state is ever applied to already-painted content.
    expect(wrapperOf().className).toContain('mobile-page-enter');
    expect(wrapperOf().className).not.toContain('opacity-0');
  });

  it('does not remount children on route change', () => {
    const { rerender } = render(
      <MobilePageTransition>
        <input defaultValue="" aria-label="field" />
        <span>Page content</span>
      </MobilePageTransition>,
    );

    const field = screen.getByLabelText('field') as HTMLInputElement;
    field.value = 'typed';

    mockPathname = '/contact';
    rerender(
      <MobilePageTransition>
        <input defaultValue="" aria-label="field" />
        <span>Page content</span>
      </MobilePageTransition>,
    );

    expect((screen.getByLabelText('field') as HTMLInputElement).value).toBe('typed');
  });

  it('applies the passed className alongside the animation class', () => {
    render(
      <MobilePageTransition className="pt-4">
        <span>Page content</span>
      </MobilePageTransition>,
    );
    expect(wrapperOf().className).toContain('pt-4');
    expect(wrapperOf().className).toContain('mobile-page-enter');
  });

  it('unmounts cleanly mid-transition', () => {
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

    expect(() => unmount()).not.toThrow();
  });
});
