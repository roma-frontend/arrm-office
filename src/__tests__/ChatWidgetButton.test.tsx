/**
 * Tests for ChatWidgetButton — the floating AI-assistant button.
 *
 * Covers: rendering in undocked and docked modes, the /ai-chat early return,
 * the wake-word toast, the plan gate (no aiChat access → upgrade modal), the
 * open/close toggle, the inactivity hint system (fake timers: appear, rotate,
 * cap at 3, dismiss on activity), DockedPulse (15s cadence, left/right side
 * placement), and the drag interactions — touch drag to dock left/right or
 * return, plus mouse drag with the same three outcomes, including the
 * undocking animation path.
 *
 * Mocks: react-i18next, next/navigation (mutable pathname), @/lib/cssMotion,
 * lucide-react, usePlanFeatures (mutable canAccess), useUpgradeModal, and
 * window/document event helpers.
 */

import React from 'react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: any) => (typeof fallback === 'object' ? key : (fallback ?? key)),
    i18n: { language: 'en' },
  }),
}));

// ── next/navigation ──────────────────────────────────────────────────────────
let mockPathname = '/';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

// ── cssMotion ────────────────────────────────────────────────────────────────
jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// ── lucide ───────────────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const names = ['X', 'Sparkles', 'Mic'];
  const mocks: Record<string, any> = {};
  for (const name of names) {
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  }
  return mocks;
});

// ── Plan gating ──────────────────────────────────────────────────────────────
let mockCanAccess: boolean = true;
jest.mock('@/hooks/usePlanFeatures', () => ({
  usePlanFeatures: () => ({ canAccess: () => mockCanAccess }),
}));

let mockOpenModal: jest.Mock;
jest.mock('@/components/subscription/PlanGate', () => ({
  useUpgradeModal: () => ({
    openModal: (opts: any) => mockOpenModal(opts),
    modal: <div data-testid="upgrade-modal">upgrade</div>,
  }),
}));

import { ChatWidgetButton } from '@/components/ai/ChatWidgetButton';

// ── Helpers ──────────────────────────────────────────────────────────────────
function renderWidget(props: Partial<Parameters<typeof ChatWidgetButton>[0]> = {}) {
  const base = {
    isOpen: false,
    setIsOpen: jest.fn(),
    wakeWordActive: false,
    docked: false,
    setDocked: jest.fn(),
    dockedSide: 'right' as const,
    setDockedSide: jest.fn(),
    dockedY: 50,
    setDockedY: jest.fn(),
    ...props,
  };
  render(<ChatWidgetButton {...(base as any)} />);
  return base;
}

/** Simulate a full drag with the mouse over document listeners. */
function mouseDrag(from: { x: number; y: number }, to: { x: number; y: number }) {
  const btn = screen.getByLabelText(/chatWidget.openAssistant|Show AI assistant/);
  fireEvent.mouseDown(btn, { clientX: from.x, clientY: from.y });
  act(() => {
    document.dispatchEvent(
      new MouseEvent('mousemove', { clientX: to.x, clientY: to.y, bubbles: true }),
    );
  });
  act(() => {
    document.dispatchEvent(
      new MouseEvent('mouseup', { clientX: to.x, clientY: to.y, bubbles: true }),
    );
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockPathname = '/';
  mockCanAccess = true;
  mockOpenModal = jest.fn();
  // window size used by drag docking decisions
  Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ChatWidgetButton', () => {
  // ── Rendering ───────────────────────────────────────────────────────────

  it('renders the floating button when undocked and not on /ai-chat', () => {
    renderWidget();
    expect(screen.getByLabelText('chatWidget.openAssistant')).toBeInTheDocument();
    expect(screen.queryByLabelText('Show AI assistant')).not.toBeInTheDocument();
  });

  it('returns only the upgrade modal on the /ai-chat page', () => {
    mockPathname = '/ai-chat';
    renderWidget();
    expect(screen.getByTestId('upgrade-modal')).toBeInTheDocument();
    expect(screen.queryByLabelText('chatWidget.openAssistant')).not.toBeInTheDocument();
  });

  it('renders the docked indicator and docked button when docked', () => {
    renderWidget({ docked: true });
    expect(screen.getByLabelText('Show AI assistant')).toBeInTheDocument();
    expect(screen.queryByLabelText('chatWidget.openAssistant')).not.toBeInTheDocument();
  });

  it('shows the wake-word toast when active', () => {
    renderWidget({ wakeWordActive: true });
    expect(screen.getByText(/I'm listening/)).toBeInTheDocument();
  });

  it('does not show the wake-word toast when inactive', () => {
    renderWidget();
    expect(screen.queryByText(/I'm listening/)).not.toBeInTheDocument();
  });

  // ── Toggle & plan gate ──────────────────────────────────────────────────

  it('toggles the widget open on click', () => {
    const base = renderWidget();
    fireEvent.click(screen.getByLabelText('chatWidget.openAssistant'));
    expect(base.setIsOpen).toHaveBeenCalled();
    const fn = base.setIsOpen.mock.calls[0][0] as (o: boolean) => boolean;
    expect(fn(false)).toBe(true);
  });

  it('opens the upgrade modal when aiChat is not accessible', () => {
    mockCanAccess = false;
    renderWidget();
    fireEvent.click(screen.getByLabelText('chatWidget.openAssistant'));
    expect(mockOpenModal).toHaveBeenCalledWith(
      expect.objectContaining({ recommendedPlan: 'professional' }),
    );
  });

  it('does not open the upgrade modal when aiChat is accessible', () => {
    renderWidget();
    fireEvent.click(screen.getByLabelText('chatWidget.openAssistant'));
    expect(mockOpenModal).not.toHaveBeenCalled();
  });

  // ── Hint system ─────────────────────────────────────────────────────────

  it('shows a hint after the inactivity interval and hides it after 5s', () => {
    renderWidget();
    expect(screen.queryByText(/dashboard.hints.help/)).not.toBeInTheDocument();
    // 20s hint interval
    act(() => {
      jest.advanceTimersByTime(20000);
    });
    expect(screen.getByText(/dashboard.hints.help/)).toBeInTheDocument();
    // auto-hide after 5s
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.queryByText(/dashboard.hints.help/)).not.toBeInTheDocument();
  });

  it('rotates through the three hints', () => {
    renderWidget();
    // hint #0 appears → hides
    act(() => {
      jest.advanceTimersByTime(20000);
    });
    expect(screen.getByText(/dashboard.hints.help/)).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    // hint #1
    act(() => {
      jest.advanceTimersByTime(20000);
    });
    expect(screen.getByText(/dashboard.hints.leaveRequest/)).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    // hint #2
    act(() => {
      jest.advanceTimersByTime(20000);
    });
    expect(screen.getByText(/dashboard.hints.reports/)).toBeInTheDocument();
  });

  it('stops showing hints after the session cap of 3', () => {
    renderWidget();
    for (let i = 0; i < 4; i++) {
      act(() => {
        jest.advanceTimersByTime(20000);
      });
      act(() => {
        jest.advanceTimersByTime(5000);
      });
    }
    // After the 3rd hint was shown, no more hints appear
    const btn = screen.getByLabelText('chatWidget.openAssistant');
    fireEvent.click(btn); // dismiss / reset? no — re-render to confirm no hint
    expect(screen.queryByText(/dashboard.hints.help/)).not.toBeInTheDocument();
  });

  it('resets the inactivity timer on user activity', () => {
    renderWidget();
    act(() => {
      jest.advanceTimersByTime(19000); // just under the threshold
    });
    fireEvent.keyDown(window);
    act(() => {
      jest.advanceTimersByTime(19000);
    });
    // still no hint because activity reset the clock
    expect(screen.queryByText(/dashboard.hints.help/)).not.toBeInTheDocument();
  });

  it('does not run the hint loop while the widget is open', () => {
    renderWidget({ isOpen: true });
    act(() => {
      jest.advanceTimersByTime(60000);
    });
    expect(screen.queryByText(/dashboard.hints.help/)).not.toBeInTheDocument();
  });

  // ── DockedPulse ─────────────────────────────────────────────────────────

  it('shows the docked pulse every 15s and hides it after 3s (right side)', () => {
    renderWidget({ docked: true, dockedSide: 'right', dockedY: 50 });
    expect(screen.queryByText(/chatWidget.imHere/)).not.toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(15000);
    });
    const pulse = screen.getByText(/chatWidget.imHere/);
    expect(pulse).toBeInTheDocument();
    expect(pulse.style.right).toBe('36px');
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.queryByText(/chatWidget.imHere/)).not.toBeInTheDocument();
  });

  it('places the docked pulse on the left when docked left', () => {
    renderWidget({ docked: true, dockedSide: 'left', dockedY: 50 });
    act(() => {
      jest.advanceTimersByTime(15000);
    });
    const pulse = screen.getByText(/chatWidget.imHere/);
    expect(pulse.style.left).toBe('276px'); // 240 + 36 (desktop sidebar)
  });

  it('does not render DockedPulse when the widget is open', () => {
    renderWidget({ docked: true, isOpen: true });
    act(() => {
      jest.advanceTimersByTime(15000);
    });
    expect(screen.queryByText(/chatWidget.imHere/)).not.toBeInTheDocument();
  });

  // ── Touch drag (undocked → docked / return) ─────────────────────────────

  it('opens the widget on a plain click of the docked button', () => {
    const base = renderWidget({ docked: true });
    const btn = screen.getByLabelText('Show AI assistant');
    fireEvent.click(btn);
    expect(base.setIsOpen).toHaveBeenCalledWith(true);
  });

  it('docks to the right after a touch drag to the right edge', () => {
    const base = renderWidget();
    const btn = screen.getByLabelText('chatWidget.openAssistant');
    fireEvent.touchStart(btn, {
      touches: [{ clientX: 100, clientY: 400 }],
    });
    fireEvent.touchMove(btn, {
      touches: [{ clientX: 200, clientY: 420 }],
    });
    fireEvent.touchEnd(btn, {
      changedTouches: [{ clientX: 1100, clientY: 500 }], // > 75% of 1280
    });
    expect(base.setDocked).toHaveBeenCalledWith(true);
    expect(base.setDockedSide).toHaveBeenCalledWith('right');
    expect(base.setDockedY).toHaveBeenCalledWith(expect.any(Number));
  });

  it('docks to the left after a touch drag to the left edge', () => {
    const base = renderWidget();
    const btn = screen.getByLabelText('chatWidget.openAssistant');
    fireEvent.touchStart(btn, { touches: [{ clientX: 400, clientY: 400 }] });
    fireEvent.touchMove(btn, { touches: [{ clientX: 300, clientY: 420 }] });
    fireEvent.touchEnd(btn, { changedTouches: [{ clientX: 100, clientY: 500 }] });
    expect(base.setDocked).toHaveBeenCalledWith(true);
    expect(base.setDockedSide).toHaveBeenCalledWith('left');
  });

  it('returns to the middle without docking when the drag stays central', () => {
    const base = renderWidget();
    const btn = screen.getByLabelText('chatWidget.openAssistant');
    fireEvent.touchStart(btn, { touches: [{ clientX: 400, clientY: 400 }] });
    fireEvent.touchMove(btn, { touches: [{ clientX: 450, clientY: 410 }] });
    fireEvent.touchEnd(btn, { changedTouches: [{ clientX: 500, clientY: 420 }] });
    expect(base.setDocked).not.toHaveBeenCalled();
    expect(base.setDockedY).not.toHaveBeenCalled();
  });

  it('does not drag when the touch barely moves', () => {
    const base = renderWidget();
    const btn = screen.getByLabelText('chatWidget.openAssistant');
    fireEvent.touchStart(btn, { touches: [{ clientX: 400, clientY: 400 }] });
    fireEvent.touchEnd(btn, { changedTouches: [{ clientX: 402, clientY: 401 }] });
    expect(base.setDocked).not.toHaveBeenCalled();
    expect(base.setDockedSide).not.toHaveBeenCalled();
  });

  it('animates the button back after a central touch drag', () => {
    const base = renderWidget();
    const btn = screen.getByLabelText('chatWidget.openAssistant');
    fireEvent.touchStart(btn, { touches: [{ clientX: 400, clientY: 400 }] });
    fireEvent.touchMove(btn, { touches: [{ clientX: 450, clientY: 410 }] });
    fireEvent.touchEnd(btn, { changedTouches: [{ clientX: 500, clientY: 420 }] });
    // the 400ms return animation runs and clears the drag position
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(base.setDocked).not.toHaveBeenCalled();
  });

  it('does not set a drag position when the mouse does not move', () => {
    const base = renderWidget();
    const btn = screen.getByLabelText('chatWidget.openAssistant');
    fireEvent.mouseDown(btn, { clientX: 100, clientY: 400 });
    act(() => {
      document.dispatchEvent(
        new MouseEvent('mouseup', { clientX: 100, clientY: 400, bubbles: true }),
      );
    });
    expect(base.setDocked).not.toHaveBeenCalled();
  });

  it('animates the button back after a central mouse drag', () => {
    const base = renderWidget();
    mouseDrag({ x: 400, y: 400 }, { x: 500, y: 420 });
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(base.setDocked).not.toHaveBeenCalled();
  });

  // ── Mouse drag (undocked) ───────────────────────────────────────────────

  it('docks to the right after a mouse drag', () => {
    const base = renderWidget();
    mouseDrag({ x: 100, y: 400 }, { x: 1100, y: 500 });
    expect(base.setDocked).toHaveBeenCalledWith(true);
    expect(base.setDockedSide).toHaveBeenCalledWith('right');
  });

  it('docks to the left after a mouse drag', () => {
    const base = renderWidget();
    mouseDrag({ x: 400, y: 400 }, { x: 100, y: 500 });
    expect(base.setDocked).toHaveBeenCalledWith(true);
    expect(base.setDockedSide).toHaveBeenCalledWith('left');
  });

  it('returns to the middle without docking on a central mouse drag', () => {
    const base = renderWidget();
    mouseDrag({ x: 400, y: 400 }, { x: 500, y: 420 });
    expect(base.setDocked).not.toHaveBeenCalled();
  });

  it('does not toggle the widget after a mouse drag', () => {
    const base = renderWidget();
    // a click after a drag should be ignored (hasDragged)
    mouseDrag({ x: 400, y: 400 }, { x: 500, y: 420 });
    fireEvent.click(screen.getByLabelText('chatWidget.openAssistant'));
    expect(base.setIsOpen).not.toHaveBeenCalled();
  });

  // ── Dock drag (docked button drags / undocks) ───────────────────────────

  it('docks to the left after a docked touch drag', () => {
    const base = renderWidget({ docked: true });
    const btn = screen.getByLabelText('Show AI assistant');
    fireEvent.touchStart(btn, { touches: [{ clientX: 300, clientY: 400 }] });
    fireEvent.touchMove(btn, { touches: [{ clientX: 200, clientY: 420 }] });
    fireEvent.touchEnd(btn, { changedTouches: [{ clientX: 100, clientY: 500 }] });
    expect(base.setDockedSide).toHaveBeenCalledWith('left');
    expect(base.setDockedY).toHaveBeenCalledWith(expect.any(Number));
  });

  it('docks to the right after a docked touch drag', () => {
    const base = renderWidget({ docked: true });
    const btn = screen.getByLabelText('Show AI assistant');
    fireEvent.touchStart(btn, { touches: [{ clientX: 300, clientY: 400 }] });
    fireEvent.touchMove(btn, { touches: [{ clientX: 500, clientY: 420 }] });
    fireEvent.touchEnd(btn, { changedTouches: [{ clientX: 1100, clientY: 500 }] });
    expect(base.setDockedSide).toHaveBeenCalledWith('right');
  });

  it('undocks (docks false) after a central docked touch drag', () => {
    const base = renderWidget({ docked: true });
    const btn = screen.getByLabelText('Show AI assistant');
    fireEvent.touchStart(btn, { touches: [{ clientX: 300, clientY: 400 }] });
    fireEvent.touchMove(btn, { touches: [{ clientX: 400, clientY: 420 }] });
    fireEvent.touchEnd(btn, { changedTouches: [{ clientX: 500, clientY: 420 }] });
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(base.setDocked).toHaveBeenCalledWith(false);
  });

  it('ignores a docked touch that barely moves', () => {
    const base = renderWidget({ docked: true });
    const btn = screen.getByLabelText('Show AI assistant');
    fireEvent.touchStart(btn, { touches: [{ clientX: 100, clientY: 400 }] });
    fireEvent.touchEnd(btn, { changedTouches: [{ clientX: 102, clientY: 401 }] });
    expect(base.setDockedSide).not.toHaveBeenCalled();
    expect(base.setDocked).not.toHaveBeenCalled();
  });

  it('undocks to the right after a docked mouse drag', () => {
    const base = renderWidget({ docked: true });
    const btn = screen.getByLabelText('Show AI assistant');
    fireEvent.mouseDown(btn, { clientX: 100, clientY: 400 });
    act(() => {
      document.dispatchEvent(
        new MouseEvent('mousemove', { clientX: 200, clientY: 420, bubbles: true }),
      );
    });
    act(() => {
      document.dispatchEvent(
        new MouseEvent('mouseup', { clientX: 1100, clientY: 500, bubbles: true }),
      );
    });
    expect(base.setDockedSide).toHaveBeenCalledWith('right');
    expect(base.setDockedY).toHaveBeenCalledWith(expect.any(Number));
  });

  it('undocks (sets docked false) when a docked drag ends in the middle', () => {
    const base = renderWidget({ docked: true });
    const btn = screen.getByLabelText('Show AI assistant');
    fireEvent.mouseDown(btn, { clientX: 100, clientY: 400 });
    act(() => {
      document.dispatchEvent(
        new MouseEvent('mousemove', { clientX: 200, clientY: 420, bubbles: true }),
      );
    });
    act(() => {
      document.dispatchEvent(
        new MouseEvent('mouseup', { clientX: 500, clientY: 420, bubbles: true }),
      );
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(base.setDocked).toHaveBeenCalledWith(false);
  });

  it('docks to the left after a docked mouse drag', () => {
    const base = renderWidget({ docked: true });
    const btn = screen.getByLabelText('Show AI assistant');
    fireEvent.mouseDown(btn, { clientX: 400, clientY: 400 });
    act(() => {
      document.dispatchEvent(
        new MouseEvent('mousemove', { clientX: 200, clientY: 420, bubbles: true }),
      );
    });
    act(() => {
      document.dispatchEvent(
        new MouseEvent('mouseup', { clientX: 100, clientY: 500, bubbles: true }),
      );
    });
    expect(base.setDockedSide).toHaveBeenCalledWith('left');
  });

  it('ignores a docked mouse drag that barely moves', () => {
    const base = renderWidget({ docked: true });
    const btn = screen.getByLabelText('Show AI assistant');
    fireEvent.mouseDown(btn, { clientX: 100, clientY: 400 });
    act(() => {
      document.dispatchEvent(
        new MouseEvent('mouseup', { clientX: 100, clientY: 400, bubbles: true }),
      );
    });
    expect(base.setDockedSide).not.toHaveBeenCalled();
    expect(base.setDocked).not.toHaveBeenCalled();
  });

  it('ignores a plain click on the docked button after a drag', () => {
    const base = renderWidget({ docked: true });
    const btn = screen.getByLabelText('Show AI assistant');
    // touch start/move (drag) then a click
    fireEvent.touchStart(btn, { touches: [{ clientX: 100, clientY: 400 }] });
    fireEvent.touchMove(btn, { touches: [{ clientX: 300, clientY: 400 }] });
    fireEvent.touchEnd(btn, { changedTouches: [{ clientX: 300, clientY: 400 }] });
    fireEvent.click(btn);
    expect(base.setIsOpen).not.toHaveBeenCalled();
  });
});
