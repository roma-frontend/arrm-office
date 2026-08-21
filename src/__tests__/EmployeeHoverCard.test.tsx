/**
 * Tests for EmployeeHoverCard — hover mini-profile with Convex user data,
 * avatar, role badge, detail rows and "View Profile" link.
 */

import React from 'react';
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      if (typeof fallback === 'string') return fallback;
      if (fallback && typeof fallback === 'object' && 'defaultValue' in fallback)
        return fallback.defaultValue ?? key;
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

// ── Convex query mock ────────────────────────────────────────────────────────
let queryResults: Record<string, unknown> = {};

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation: () => jest.fn(),
}));

// ── API mock ─────────────────────────────────────────────────────────────────
jest.mock('../../convex/_generated/api', () => ({
  api: {
    users: {
      queries: {
        getUserById: { _name: 'users.queries.getUserById' },
      },
    },
  },
}));

// ── Router mock ──────────────────────────────────────────────────────────────
const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, back: jest.fn(), prefetch: jest.fn() }),
}));

// ── Avatar mock ──────────────────────────────────────────────────────────────
jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: any) => <div>{children}</div>,
  AvatarImage: ({ src, alt }: any) =>
    src ? <img data-testid="avatar-image" src={src} alt={alt} /> : null,
  AvatarFallback: ({ children }: any) => <span data-testid="avatar-fallback">{children}</span>,
}));

jest.mock('@/lib/stringUtils', () => ({
  getInitials: (name: string) =>
    name
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2),
}));

// ── EmployeeSheet mock ───────────────────────────────────────────────────────
jest.mock('@/components/employees/EmployeeSheet', () => ({
  EmployeeSheet: ({ employeeId, onClose }: any) =>
    employeeId ? (
      <div data-testid="employee-sheet">
        <button onClick={onClose}>close</button>
      </div>
    ) : null,
}));

// ── Import after mocks ───────────────────────────────────────────────────────

import { EmployeeHoverCard } from '@/components/employees/EmployeeHoverCard';

// Helper: render and trigger hover to open the card
function renderAndHover(ui: React.ReactElement) {
  const result = render(ui);
  const trigger = result.container.querySelector('.inline') as HTMLElement;
  if (trigger) {
    act(() => {
      fireEvent.mouseEnter(trigger);
      jest.advanceTimersByTime(500);
    });
  }
  return result;
}

beforeEach(() => {
  jest.useFakeTimers();
  queryResults = {};
  push.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('EmployeeHoverCard', () => {
  it('renders children as the trigger', () => {
    render(
      <EmployeeHoverCard userId="user-1" name="John Doe">
        <span data-testid="trigger">John Doe</span>
      </EmployeeHoverCard>,
    );
    expect(screen.getByTestId('trigger')).toBeTruthy();
  });

  it('shows employeeData directly without query', () => {
    renderAndHover(
      <EmployeeHoverCard
        userId="user-1"
        name="John Doe"
        employeeData={{
          name: 'John Doe',
          email: 'john@example.com',
          role: 'admin',
          department: 'Engineering',
          position: 'Senior Developer',
          phone: '+1234567890',
        }}
      >
        <span>John Doe</span>
      </EmployeeHoverCard>,
    );

    expect(screen.getByText('john@example.com')).toBeTruthy();
    expect(screen.getByText('Engineering')).toBeTruthy();
    expect(screen.getByText('Senior Developer')).toBeTruthy();
    expect(screen.getByText('+1234567890')).toBeTruthy();
  });

  it('opens EmployeeSheet on "View Profile" click', () => {
    renderAndHover(
      <EmployeeHoverCard userId="user-1" name="Jane Smith">
        <span>Jane Smith</span>
      </EmployeeHoverCard>,
    );

    const viewProfile = screen.getByText('View Profile');
    act(() => {
      fireEvent.click(viewProfile);
      // Advance timers and flush rAF
      jest.advanceTimersByTime(50);
    });

    expect(screen.getByTestId('employee-sheet')).toBeTruthy();
  });

  it('shows avatar image when avatarUrl is present', () => {
    renderAndHover(
      <EmployeeHoverCard
        userId="user-1"
        name="John Doe"
        employeeData={{ avatarUrl: 'https://example.com/avatar.jpg' }}
      >
        <span>John Doe</span>
      </EmployeeHoverCard>,
    );

    expect(screen.getByTestId('avatar-image')).toBeTruthy();
  });

  it('shows avatar fallback with initials when no avatarUrl', () => {
    renderAndHover(
      <EmployeeHoverCard userId="user-1" name="John Doe">
        <span>John Doe</span>
      </EmployeeHoverCard>,
    );

    expect(screen.getByTestId('avatar-fallback')).toBeTruthy();
    expect(screen.getByTestId('avatar-fallback').textContent).toBe('JD');
  });

  it('renders without crashing when no userId', () => {
    renderAndHover(
      <EmployeeHoverCard name="No ID User">
        <span>No ID User</span>
      </EmployeeHoverCard>,
    );

    expect(screen.getAllByText('No ID User').length).toBeGreaterThanOrEqual(1);
  });
});
