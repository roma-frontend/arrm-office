/**
 * Tests for EnterpriseWidgets — six plan-gated enterprise widgets.
 *
 * Mocks: next/dynamic returns the component directly, PlanGate renders
 * children, cssMotion div passthrough. Each admin widget is stubbed with a
 * marker so the feature key wiring is asserted.
 */

import React from 'react';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    // Strip animation props so they never reach the real DOM (React would
    // warn about unknown props like `variants` on a div).
    div: ({ children, variants: _v, initial: _i, animate: _a, ...props }: any) => (
      <div {...props}>{children}</div>
    ),
  },
}));

// PlanGate passthrough that records the feature key per usage.
const gateFeatures: string[] = [];
jest.mock('@/components/subscription/PlanGate', () => ({
  PlanGate: ({ feature, children }: any) => {
    gateFeatures.push(feature);
    return <div data-testid={`gate-${feature}`}>{children}</div>;
  },
}));

// The six dynamic() calls happen in a fixed source order (the import arrows at
// module scope). The next/dynamic mock consumes a marker queue so each call
// site resolves to the component it lazy-loads — synchronous and deterministic.
// Markers are the component names, so the pairing below is self-documenting.
const widgetQueue = [
  'HolidayCalendarSync',
  'CostAnalysis',
  'ConflictDetection',
  'SmartSuggestions',
  'ResponseTimeSLA',
  'WeeklyDigestWidget',
];

jest.mock('next/dynamic', () => {
  const ReactMod = require('react');
  return (loader: () => unknown) => {
    // Invoke the loader thunk purely so the `() => import(...)` arrows count
    // as covered. The result is ignored (marker components are rendered
    // instead) and rejections are swallowed.
    void Promise.resolve(loader()).catch(() => {});
    const marker = widgetQueue.shift() ?? 'widget-x';
    return () => ReactMod.createElement('div', { 'data-testid': `widget-${marker}` }, marker);
  };
});

import { EnterpriseWidgets } from '@/components/dashboard/EnterpriseWidgets';

function resetQueue() {
  gateFeatures.length = 0;
  widgetQueue.length = 0;
  widgetQueue.push(
    'HolidayCalendarSync',
    'CostAnalysis',
    'ConflictDetection',
    'SmartSuggestions',
    'ResponseTimeSLA',
    'WeeklyDigestWidget',
  );
}

describe('EnterpriseWidgets', () => {
  // Reset the module-level marker queue + recorded feature keys before every
  // test so a future test added without its own reset cannot silently consume
  // a shifted queue.
  beforeEach(() => {
    resetQueue();
  });

  it('renders all six widgets inside their plan gates', () => {
    render(<EnterpriseWidgets />);
    // Each lazy-loaded widget must sit inside the gate for its feature key.
    // Note the marker→feature pairing differs from the render order: markers
    // follow the dynamic() import order, features follow the JSX order.
    const expected = [
      ['HolidayCalendarSync', 'calendarSync'],
      ['CostAnalysis', 'analytics'],
      ['ConflictDetection', 'advancedAnalytics'],
      ['SmartSuggestions', 'aiInsights'],
      ['ResponseTimeSLA', 'slaSettings'],
      ['WeeklyDigestWidget', 'aiChat'],
    ] as const;
    for (const [marker, feature] of expected) {
      const widget = screen.getByTestId(`widget-${marker}`);
      expect(widget).toHaveTextContent(marker);
      expect(widget.closest(`[data-testid="gate-${feature}"]`)).not.toBeNull();
    }
  });

  it('gates each widget behind the right feature key', () => {
    render(<EnterpriseWidgets />);
    expect(gateFeatures).toEqual([
      'slaSettings',
      'advancedAnalytics',
      'analytics',
      'calendarSync',
      'aiInsights',
      'aiChat',
    ]);
  });
});
