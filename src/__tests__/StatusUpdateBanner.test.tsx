/**
 * Tests for StatusUpdateBanner — status change notification banner.
 */

import React from 'react';
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Context mock ─────────────────────────────────────────────────────────────
let mockNotification: { statusKey: string; statusLabel: string; timestamp: number } | null = null;
const mockHide = jest.fn();
jest.mock('@/context/StatusUpdateContext', () => ({
  useStatusUpdate: () => ({ notification: mockNotification, hideNotification: mockHide }),
}));

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) =>
      key === 'status.available.notification' ? 'You are available' : (fallback ?? key),
    i18n: { language: 'en' },
  }),
}));

// ── Lucide icons mock ────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    X: Icon,
    CheckCircle2: Icon,
    Clock: Icon,
    Phone: Icon,
    Zap: Icon,
    AlertTriangle: Icon,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useStatusUpdate } = require('@/context/StatusUpdateContext') as {
  useStatusUpdate: () => any;
};

import { StatusUpdateBanner } from '@/components/StatusUpdateBanner';

describe('StatusUpdateBanner', () => {
  it('renders nothing when there is no notification', () => {
    mockNotification = null;
    const { container } = render(<StatusUpdateBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the status label and title for a known status', () => {
    mockNotification = { statusKey: 'available', statusLabel: 'Available', timestamp: 1 };
    render(<StatusUpdateBanner />);
    expect(screen.getByText(/Status Updated/)).toBeInTheDocument();
    expect(screen.getByText(/Available/)).toBeInTheDocument();
    expect(screen.getByText('You are available')).toBeInTheDocument();
  });

  it('falls back to the default config for unknown status keys', () => {
    mockNotification = { statusKey: 'mystery_status', statusLabel: 'Mystery', timestamp: 1 };
    render(<StatusUpdateBanner />);
    expect(screen.getByText(/Mystery/)).toBeInTheDocument();
  });

  it('hides the banner when the close button is clicked', () => {
    mockNotification = { statusKey: 'busy', statusLabel: 'Busy', timestamp: 1 };
    render(<StatusUpdateBanner />);
    fireEvent.click(screen.getByRole('button'));
    expect(mockHide).toHaveBeenCalled();
  });
});
