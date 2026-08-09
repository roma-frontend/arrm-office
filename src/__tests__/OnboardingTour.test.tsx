/**
 * Tests for OnboardingTour — the guided tour overlay: visibility gating
 * (authenticated via hasSeenTour query / anonymous via localStorage),
 * step navigation (next/prev/complete/skip), the markTourAsSeen mutation with
 * failure fallback, tooltip placement logic (all directions + flips + clamping),
 * spotlight highlight ring and resize repositioning.
 *
 * Mocks: convex/react (useQuery/useMutation keyed by _name), generated api,
 * react-i18next, @/lib/cssMotion (motion.div/button/rect → plain elements),
 * @/lib/logger, next/image is not used here. lucide-react runs for real.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { OnboardingTour, type TourStep } from '@/components/onboarding/OnboardingTour';

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: any) =>
      typeof fallback === 'string'
        ? fallback
        : fallback && typeof fallback === 'object' && 'defaultValue' in fallback
          ? (fallback.defaultValue ?? key)
          : key,
    i18n: { language: 'en' },
  }),
}));

// ── Convex: query result and mutation recording keyed by _name ───────────────
let queryResults: Record<string, unknown> = {};
const mutationCalls: Array<{ args: any }> = [];
let mockMarkTourAsSeen: jest.Mock;

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation: (ref: { _name?: string }) => {
    expect(ref?._name).toBe('markTourAsSeen');
    return mockMarkTourAsSeen;
  },
}));

jest.mock('../../convex/_generated/api', () => ({
  api: {
    userPreferences: {
      hasSeenTour: { _name: 'hasSeenTour' },
      markTourAsSeen: { _name: 'markTourAsSeen' },
    },
  },
}));

// ── CSS motion / logger ──────────────────────────────────────────────────────
jest.mock('@/lib/cssMotion', () => {
  const ReactMod = require('react');
  const Elem =
    (tag: string) =>
    ({ children, ...props }: any) =>
      ReactMod.createElement(tag, props, children);
  return {
    motion: { div: Elem('div'), button: Elem('button'), rect: Elem('rect') },
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const logger = jest.requireMock('@/lib/logger').logger;

// ── Test helpers ─────────────────────────────────────────────────────────────
const STEP = (placement?: string, extra: Partial<TourStep> = {}): TourStep => ({
  target: '[data-testid="tour-target"]',
  title: 'Step 1',
  description: 'A description',
  placement,
  ...extra,
});

const STEPS = (placement?: string): TourStep[] => [
  STEP(placement),
  { ...STEP(placement), title: 'Step 2', description: 'Second desc' },
];

/** Full DOMRect-shaped object for a sparse partial. */
function rect(p: {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width?: number;
  height?: number;
}): DOMRect {
  const width = p.width ?? p.right - p.left;
  const height = p.height ?? p.bottom - p.top;
  return {
    top: p.top,
    bottom: p.bottom,
    left: p.left,
    right: p.right,
    width,
    height,
    x: p.left,
    y: p.top,
    toJSON: () => ({}),
  } as DOMRect;
}

const VIEWPORT = { width: 1000, height: 800 };

/** Give a target a controlled rect and a no-op scrollIntoView (jsdom lacks it). */
function stubTarget(el: HTMLElement, r: DOMRect) {
  Object.defineProperty(el, 'scrollIntoView', { value: jest.fn(), configurable: true });
  return jest.spyOn(el, 'getBoundingClientRect').mockReturnValue(r);
}

/** Render a visible tour pointing at a target with a controlled rect. */
async function renderVisibleTour(
  opts: {
    rect?: DOMRect;
    placement?: string;
    steps?: TourStep[];
    onComplete?: jest.Mock;
    onSkip?: jest.Mock;
    tourId?: string;
  } = {},
) {
  const first = render(<div data-testid="tour-target" />);
  const target = first.getByTestId('tour-target');
  const rectMock = stubTarget(
    target,
    opts.rect ?? rect({ top: 300, bottom: 340, left: 400, right: 600 }),
  );

  const props = {
    onComplete: opts.onComplete ?? jest.fn(),
    onSkip: opts.onSkip ?? jest.fn(),
  };
  render(
    <OnboardingTour
      tourId={opts.tourId ?? 'test-tour'}
      steps={opts.steps ?? STEPS(opts.placement)}
      {...props}
    />,
  );

  await waitFor(() => expect(screen.getAllByText('Step 1').length).toBeGreaterThan(0));
  const tooltip = screen.getAllByText('Step 1')[0].closest('.fixed') as HTMLElement;
  return { target, rectMock, tooltip, props };
}

beforeEach(() => {
  jest.restoreAllMocks();
  // Clear factory-created mocks (logger etc.) so toHaveBeenCalled* assertions
  // never see calls recorded by an earlier test.
  jest.clearAllMocks();
  queryResults = {};
  mutationCalls.length = 0;
  mockMarkTourAsSeen = jest.fn().mockResolvedValue(undefined);
  localStorage.clear();
  // Authenticated user who has not seen the tour — default visible state.
  localStorage.setItem('hr-auth-storage', JSON.stringify({ state: { sessionToken: 'tok-1' } }));
  queryResults['hasSeenTour'] = false;
  // Synchronous RAF: the tour appears as soon as shouldShowTour is true.
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
    cb(1);
    return 1;
  });
  Object.defineProperty(window, 'innerWidth', {
    value: VIEWPORT.width,
    configurable: true,
  });
  Object.defineProperty(window, 'innerHeight', {
    value: VIEWPORT.height,
    configurable: true,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── Visibility gating ────────────────────────────────────────────────────────
describe('visibility gating', () => {
  it('stays hidden for an authenticated user who has seen the tour', async () => {
    queryResults['hasSeenTour'] = true;
    render(<OnboardingTour tourId="test-tour" steps={STEPS()} />);
    expect(screen.queryByText('Step 1')).toBeNull();
  });

  it('stays hidden while the hasSeenTour query is still loading', async () => {
    queryResults['hasSeenTour'] = undefined;
    render(<OnboardingTour tourId="test-tour" steps={STEPS()} />);
    expect(screen.queryByText('Step 1')).toBeNull();
  });

  it('shows for an authenticated user who has not seen the tour', async () => {
    await renderVisibleTour();
    expect(screen.getByText('Step 1')).toBeTruthy();
    expect(screen.getByText('A description')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();
  });

  it('shows for an anonymous user who has not seen the tour in localStorage', async () => {
    localStorage.removeItem('hr-auth-storage');
    localStorage.setItem('tour_seen_test-tour', 'false');
    await renderVisibleTour();
    expect(screen.getByText('Step 1')).toBeTruthy();
  });

  it('stays hidden for an anonymous user who already saw the tour', async () => {
    localStorage.removeItem('hr-auth-storage');
    localStorage.setItem('tour_seen_test-tour', 'true');
    render(<OnboardingTour tourId="test-tour" steps={STEPS()} />);
    expect(screen.queryByText('Step 1')).toBeNull();
  });

  it('logs and falls back to anonymous mode when auth storage is corrupt', async () => {
    localStorage.setItem('hr-auth-storage', '{not-json');
    localStorage.setItem('tour_seen_test-tour', 'false');
    await renderVisibleTour();
    expect(logger.error).toHaveBeenCalled();
    expect(screen.getByText('Step 1')).toBeTruthy();
  });
});

// ── Step navigation ──────────────────────────────────────────────────────────
describe('step navigation', () => {
  it('advances on Next and completes with mutation + localStorage on the last step', async () => {
    const onComplete = jest.fn();
    await renderVisibleTour({ onComplete });

    expect(screen.queryByText('Back')).toBeNull();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Step 2')).toBeTruthy();
    expect(screen.getByText('2/2')).toBeTruthy();
    expect(screen.getByText('Back')).toBeTruthy();
    expect(screen.getByText('Got it!')).toBeTruthy();

    fireEvent.click(screen.getByText('Got it!'));
    await waitFor(() => expect(mockMarkTourAsSeen).toHaveBeenCalledTimes(1));
    expect(mockMarkTourAsSeen).toHaveBeenCalledWith({ tourId: 'test-tour', sessionToken: 'tok-1' });
    expect(localStorage.getItem('tour_seen_test-tour')).toBe('true');
    expect(onComplete).toHaveBeenCalledTimes(1);
    // Tour is gone after completion.
    expect(screen.queryByText('Step 2')).toBeNull();
  });

  it('goes back with the Back button', async () => {
    await renderVisibleTour();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Step 2')).toBeTruthy();
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Step 1')).toBeTruthy();
  });

  it('skips the tour via the X button', async () => {
    const onSkip = jest.fn();
    await renderVisibleTour({ onSkip });

    fireEvent.click(screen.getByLabelText('Skip tour'));
    await waitFor(() => expect(mockMarkTourAsSeen).toHaveBeenCalledTimes(1));
    expect(mockMarkTourAsSeen).toHaveBeenCalledWith({ tourId: 'test-tour', sessionToken: 'tok-1' });
    expect(localStorage.getItem('tour_seen_test-tour')).toBe('true');
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Step 1')).toBeNull();
  });

  it('still completes when the mark-as-seen mutation fails', async () => {
    mockMarkTourAsSeen = jest.fn().mockRejectedValue(new Error('offline'));
    const onComplete = jest.fn();
    await renderVisibleTour({ onComplete });

    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Got it!'));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(logger.log).toHaveBeenCalledWith(
      'Failed to save to database, using localStorage',
      expect.any(Error),
    );
    expect(localStorage.getItem('tour_seen_test-tour')).toBe('true');
  });

  it('skips without the mutation when there is no session token', async () => {
    localStorage.removeItem('hr-auth-storage');
    localStorage.setItem('tour_seen_test-tour', 'false');
    const onSkip = jest.fn();
    await renderVisibleTour({ onSkip, tourId: 'anon-tour' });

    fireEvent.click(screen.getByLabelText('Skip tour'));
    await waitFor(() => expect(onSkip).toHaveBeenCalledTimes(1));
    expect(mockMarkTourAsSeen).not.toHaveBeenCalled();
    expect(localStorage.getItem('tour_seen_anon-tour')).toBe('true');
  });

  it('still skips when the mark-as-seen mutation fails', async () => {
    mockMarkTourAsSeen = jest.fn().mockRejectedValue(new Error('offline'));
    const onSkip = jest.fn();
    await renderVisibleTour({ onSkip });

    fireEvent.click(screen.getByLabelText('Skip tour'));
    await waitFor(() => expect(onSkip).toHaveBeenCalledTimes(1));
    expect(logger.log).toHaveBeenCalledWith(
      'Failed to save to database, using localStorage',
      expect.any(Error),
    );
    expect(localStorage.getItem('tour_seen_test-tour')).toBe('true');
  });

  it('completes without the mutation when there is no session token', async () => {
    localStorage.removeItem('hr-auth-storage');
    localStorage.setItem('tour_seen_test-tour', 'false');
    const onComplete = jest.fn();
    await renderVisibleTour({ onComplete });

    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Got it!'));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(mockMarkTourAsSeen).not.toHaveBeenCalled();
    expect(localStorage.getItem('tour_seen_test-tour')).toBe('true');
  });
});

// ── Tooltip placement ────────────────────────────────────────────────────────
describe('tooltip placement', () => {
  async function expectPosition(placement: string, r: DOMRect, x: number, y: number) {
    const { tooltip } = await renderVisibleTour({ placement, rect: r });
    expect(tooltip.style.left).toBe(`${x}px`);
    expect(tooltip.style.top).toBe(`${y}px`);
  }

  it('places the tooltip below a target when space allows', async () => {
    await expectPosition(
      'bottom',
      rect({ top: 300, bottom: 340, left: 400, right: 600 }),
      360,
      360,
    );
  });

  it('flips top placement to bottom when the top is too tight', async () => {
    await expectPosition('top', rect({ top: 50, bottom: 90, left: 400, right: 600 }), 360, 110);
  });

  it('keeps top placement when there is room above', async () => {
    await expectPosition('top', rect({ top: 300, bottom: 340, left: 400, right: 600 }), 360, 120);
  });

  it('flips bottom placement to top when the bottom is too tight', async () => {
    await expectPosition(
      'bottom',
      rect({ top: 750, bottom: 790, left: 400, right: 600 }),
      360,
      570,
    );
  });

  it('flips top to right when neither top nor bottom fits', async () => {
    await expectPosition('top', rect({ top: 150, bottom: 610, left: 200, right: 400 }), 420, 300);
  });

  it('flips top to left when right is also too tight', async () => {
    await expectPosition('top', rect({ top: 150, bottom: 610, left: 650, right: 690 }), 350, 300);
  });

  it('flips right to left near the right edge', async () => {
    await expectPosition('right', rect({ top: 150, bottom: 610, left: 900, right: 990 }), 600, 300);
  });

  it('flips left to right when the left side is too tight', async () => {
    await expectPosition('left', rect({ top: 300, bottom: 340, left: 20, right: 40 }), 60, 240);
  });

  it('flips bottom to right when there is no room above', async () => {
    await expectPosition(
      'bottom',
      rect({ top: 300, bottom: 780, left: 200, right: 400 }),
      420,
      620,
    );
  });

  it('flips bottom to left when right is also too tight', async () => {
    await expectPosition(
      'bottom',
      rect({ top: 300, bottom: 780, left: 650, right: 690 }),
      350,
      620,
    );
  });

  it('aligns right placement to the bottom for low elements', async () => {
    await expectPosition('right', rect({ top: 500, bottom: 740, left: 500, right: 700 }), 700, 580);
  });

  it('aligns right placement to the top for high elements', async () => {
    await expectPosition('right', rect({ top: 60, bottom: 100, left: 500, right: 700 }), 700, 60);
  });

  it('keeps right placement when both sides are too tight', async () => {
    await expectPosition('right', rect({ top: 300, bottom: 340, left: 320, right: 990 }), 700, 240);
  });

  it('keeps top placement when no alternative fits', async () => {
    await expectPosition('top', rect({ top: 150, bottom: 610, left: 600, right: 690 }), 505, 20);
  });

  it('keeps bottom placement when no alternative fits', async () => {
    await expectPosition(
      'bottom',
      rect({ top: 350, bottom: 790, left: 600, right: 690 }),
      505,
      620,
    );
  });

  it('keeps left placement and aligns to the bottom for low elements', async () => {
    await expectPosition('left', rect({ top: 700, bottom: 740, left: 340, right: 540 }), 40, 580);
  });

  it('keeps left placement and aligns to the top for high elements', async () => {
    await expectPosition('left', rect({ top: 60, bottom: 100, left: 340, right: 540 }), 40, 60);
  });

  it('centers the tooltip for the center placement', async () => {
    await expectPosition('center', rect({ top: 10, bottom: 50, left: 10, right: 50 }), 360, 320);
  });

  it('clamps the tooltip inside the viewport', async () => {
    // Rect far left: raw x would be -120, clamped to 20.
    await expectPosition('bottom', rect({ top: 300, bottom: 340, left: 0, right: 40 }), 20, 360);
  });

  it('clamps a tiny viewport vertically', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 100, configurable: true });
    await expectPosition('center', rect({ top: 10, bottom: 50, left: 10, right: 50 }), 360, 20);
  });

  it('keeps left placement when neither side has room', async () => {
    // leftSpace < 20 and rightSpace <= 20: keep 'left' (clamped to 20).
    await expectPosition('left', rect({ top: 300, bottom: 340, left: 20, right: 990 }), 20, 240);
  });
});

// ── Visuals ──────────────────────────────────────────────────────────────────
describe('visuals', () => {
  it('renders one progress dot per step and marks the active one', async () => {
    const { tooltip } = await renderVisibleTour();
    // Dots carry an inline opacity (1 active / 0.5 inactive); the buttons do not.
    const dots = Array.from(tooltip.querySelectorAll('div')).filter(
      (d) => (d as HTMLElement).style.opacity === '1' || (d as HTMLElement).style.opacity === '0.5',
    );
    expect(dots).toHaveLength(2);
    expect((dots[0] as HTMLElement).style.background).toBe('rgb(59, 130, 246)');
  });

  it('renders the highlight ring around the target by default', async () => {
    const first = render(<div data-testid="tour-target" />);
    const target = first.getByTestId('tour-target');
    stubTarget(target, rect({ top: 300, bottom: 340, left: 400, right: 600 }));
    render(<OnboardingTour tourId="test-tour" steps={STEPS()} />);
    await waitFor(() => expect(screen.getByText('Step 1')).toBeTruthy());
    expect(document.querySelector('.ring-4')).toBeTruthy();
    expect(document.querySelector('rect[rx="12"]')).toBeTruthy();
  });

  it('omits the spotlight and ring when the step disables highlighting', async () => {
    const steps = STEPS().map((s) => ({ ...s, highlight: false }));
    const first = render(<div data-testid="tour-target" />);
    const target = first.getByTestId('tour-target');
    stubTarget(target, rect({ top: 300, bottom: 340, left: 400, right: 600 }));
    render(<OnboardingTour tourId="test-tour" steps={steps} />);
    await waitFor(() => expect(screen.getByText('Step 1')).toBeTruthy());
    expect(document.querySelector('.ring-4')).toBeNull();
    expect(document.querySelector('rect[rx="12"]')).toBeNull();
  });

  it('still shows the tooltip when the target selector matches nothing', async () => {
    render(
      <OnboardingTour
        tourId="test-tour"
        steps={[{ target: '[data-testid="does-not-exist"]', title: 'Orphan', description: 'D' }]}
      />,
    );
    await waitFor(() => expect(screen.getByText('Orphan')).toBeTruthy());
    // No ring since there is no target rect.
    expect(document.querySelector('.ring-4')).toBeNull();
  });
});

// ── Resize ───────────────────────────────────────────────────────────────────
describe('resize repositioning', () => {
  it('repositions the tooltip after a window resize', async () => {
    const { target, tooltip } = await renderVisibleTour();
    expect(tooltip.style.left).toBe('360px');

    // Move the target to a different spot and resize to trigger repositioning.
    jest
      .spyOn(target, 'getBoundingClientRect')
      .mockReturnValue(rect({ top: 100, bottom: 140, left: 100, right: 300 }));
    fireEvent(window, new Event('resize'));

    await waitFor(() => expect(tooltip.style.left).toBe('60px'));
  });
});

// ── Sanity: component accepts zero steps gracefully ──────────────────────────
describe('edge cases', () => {
  it('does not crash with an empty steps array', async () => {
    queryResults['hasSeenTour'] = false;
    render(<OnboardingTour tourId="test-tour" steps={[]} />);
    // The step guard in updateTargetPosition returns early; the tooltip still
    // opens on the (empty) current step with a Next button.
    await waitFor(() => expect(screen.getByText('Next')).toBeTruthy());
  });
});
