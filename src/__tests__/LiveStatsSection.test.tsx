import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import LiveStatsSection from '@/components/landing/LiveStatsSection';

// The section uses IntersectionObserver for the reveal + count-up.
beforeEach(() => {
  (global as any).IntersectionObserver = class {
    observe = jest.fn();
    disconnect = jest.fn();
    unobserve = jest.fn();
  };
});

// useLandingTranslation falls back to react-i18next keys, so without a
// translation provider the raw key is returned — we assert structure,
// not translated copy.
describe('LiveStatsSection', () => {
  it('renders exactly the four honest product metrics', () => {
    render(<LiveStatsSection initialLanguage="en" />);
    expect(screen.getByRole('group', { name: /58 Modules/i })).toBeTruthy();
    expect(screen.getByRole('group', { name: /4 Languages/i })).toBeTruthy();
    expect(screen.getByRole('group', { name: /99.7% Biometric accuracy/i })).toBeTruthy();
    expect(screen.getByRole('group', { name: /<2s Check-in time/i })).toBeTruthy();
  });

  it('does not show the old invented claims', () => {
    render(<LiveStatsSection initialLanguage="en" />);
    expect(screen.queryByText(/10,000/i)).toBeNull();
    expect(screen.queryByText(/4.9/i)).toBeNull();
    expect(screen.queryByText(/500\+/i)).toBeNull();
    expect(screen.queryByText(/1000\+/i)).toBeNull();
    expect(screen.queryByText(/Rated/i)).toBeNull();
  });

  it('does not render the fake live ticker', () => {
    render(<LiveStatsSection initialLanguage="en" />);
    expect(screen.queryByText(/48 teams/i)).toBeNull();
    expect(screen.queryByText(/128 employees/i)).toBeNull();
    expect(screen.queryByText(/87% response/i)).toBeNull();
  });
});
