/**
 * Tests for landing/ScrollStorySection — the scroll-driven phone storytelling
 * section.
 *
 * Regression focus: `useScroll({ container })` must only ever receive a ref
 * that actually points at a scrollable element. Passing a ref whose `.current`
 * is null (the public-landing case, where the window scrolls) makes
 * framer-motion throw "Container ref is defined but not hydrated" in its
 * passive effect, which crashes the section. The fix gates `container` on
 * whether a real scroll container was detected.
 *
 * Mocks: framer-motion (motion.div → div, useScroll/useTransform/
 * useMotionValueEvent → stubs), plus a deterministic matchMedia so the
 * reduced-motion branch is off.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render } from '@testing-library/react';
import ScrollStorySection from '@/components/landing/ScrollStorySection';
import { useScroll } from 'framer-motion';

jest.mock('framer-motion', () => {
  const makeMV = (v: number) => ({ get: () => v, set: () => {}, getVelocity: () => 0 });
  return {
    motion: {
      // Drop motion-only props so React doesn't warn about unknown DOM attrs,
      // and strip transform motion-values from style (they'd otherwise be set
      // as raw objects on the DOM node in jsdom).
      div: ({ children, animate, transition, initial, style, ...props }: any) => {
        if (style) {
          const {
            x: _x,
            y: _y,
            scale: _scale,
            scaleX: _scaleX,
            scaleY: _scaleY,
            rotate: _rotate,
            ...rest
          } = style;
          style = rest;
        }
        return (
          <div style={style} {...props}>
            {children}
          </div>
        );
      },
    },
    useScroll: jest.fn(() => ({ scrollYProgress: makeMV(0) })),
    useTransform: jest.fn(() => makeMV(0)),
    useMotionValueEvent: jest.fn(),
  };
});

const mockUseScroll = useScroll as unknown as jest.Mock;

type ScrollOptions = { container?: { current: unknown } | undefined };

beforeEach(() => {
  mockUseScroll.mockClear();
  // Deterministic: reduced motion OFF so the pinned (non-reduced) branch
  // renders and the section ref is attached.
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
});

describe('ScrollStorySection', () => {
  it('does not pass a null-current container ref when the window scrolls', () => {
    // Public landing: no scrollable ancestor → the window scrolls. The
    // regression this guards: `container` used to be a ref left at null, which
    // framer-motion rejects as "defined but not hydrated". It must be
    // `undefined` so useScroll falls back to the window.
    render(<ScrollStorySection initialLanguage="en" />);

    const calls = mockUseScroll.mock.calls as unknown as [ScrollOptions][];
    expect(calls.length).toBeGreaterThan(0);
    for (const [options] of calls) {
      expect(options.container).toBeUndefined();
    }
  });

  it('passes the detected scroll container ref inside a scrollable shell', () => {
    // App shell / landing editor: a `.main-scrollable`-style ancestor scrolls
    // instead of the window, so useScroll must receive a ref pointing at it.
    const { container } = render(
      <div style={{ overflowY: 'auto' }} data-testid="scroll-shell">
        <ScrollStorySection initialLanguage="en" />
      </div>,
    );
    const shell = container.firstChild as HTMLElement;

    const calls = mockUseScroll.mock.calls as unknown as [ScrollOptions][];
    expect(calls.some(([options]) => options.container?.current === shell)).toBe(true);
  });
});
