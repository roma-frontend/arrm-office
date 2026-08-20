/**
 * Tests for EmployeeHoverCard — hover mini-profile with Convex user data,
 * avatar, role badge, detail rows and "View Profile" link.
 */

import React from 'react';
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

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

// ── HoverCard mock (Radix opens on hover; in tests we render content directly) ──
jest.mock('@/components/ui/hover-card', () => ({
  HoverCard: ({ children }: any) => <>{children}</>,
  HoverCardTrigger: ({ children }: any) => <>{children}</>,
  HoverCardContent: ({ children }: any) => (
    <div data-testid="hover-card-content">{children}</div>
  ),
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

// ── Import after mocks ───────────────────────────────────────────────────────
import { EmployeeHoverCard } from '@/components/employees/EmployeeHoverCard';

// ── Tests ────────────────────────────────────────────────────────────────────
describe('EmployeeHoverCard', () => {
  beforeEach(() => {
    queryResults = {};
    push.mockClear();
  });

  it('renders children as the trigger', () => {
    render(
      <EmployeeHoverCard userId="user-1" name="John Doe">
        <span data-testid="trigger">John Doe</span>
      </EmployeeHoverCard>,
    );
    expect(screen.getByTestId('trigger')).toBeTruthy();
  });

  it('shows Convex user data in the card', () => {
    queryResults = {
      'users.queries.getUserById': {
        name: 'John Doe',
        email: 'john@example.com',
        role: 'admin',
        department: 'Engineering',
        position: 'Senior Developer',
        phone: '+1234567890',
        avatarUrl: 'https://example.com/avatar.jpg',
      },
    };

    render(
      <EmployeeHoverCard userId="user-1" name="John Doe">
        <span>John Doe</span>
      </EmployeeHoverCard>,
    );

    expect(screen.getByText('john@example.com')).toBeTruthy();
    expect(screen.getByText('Engineering')).toBeTruthy();
    expect(screen.getByText('Senior Developer')).toBeTruthy();
    expect(screen.getByText('+1234567890')).toBeTruthy();
    expect(screen.getByText('admin')).toBeTruthy();
  });

  it('navigates to profile on "View Profile" click', () => {
    queryResults = {
      'users.queries.getUserById': {
        name: 'Jane Smith',
        email: 'jane@example.com',
        role: 'employee',
      },
    };

    render(
      <EmployeeHoverCard userId="user-2" name="Jane Smith">
        <span>Jane Smith</span>
      </EmployeeHoverCard>,
    );

    fireEvent.click(screen.getByText('View Profile'));
    expect(push).toHaveBeenCalledWith('/employees/user-2');
  });

  it('shows avatar image when avatarUrl is present', () => {
    queryResults = {
      'users.queries.getUserById': {
        name: 'Alice Brown',
        email: 'alice@example.com',
        role: 'supervisor',
        avatarUrl: 'https://cdn.example.com/alice.png',
      },
    };

    render(
      <EmployeeHoverCard userId="user-3" name="Alice Brown">
        <span>Alice Brown</span>
      </EmployeeHoverCard>,
    );

    const img = screen.getByTestId('avatar-image');
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/alice.png');
  });

  it('shows avatar fallback with initials when no avatarUrl', () => {
    queryResults = {
      'users.queries.getUserById': {
        name: 'Bob Wilson',
        email: 'bob@example.com',
        role: 'employee',
      },
    };

    render(
      <EmployeeHoverCard userId="user-4" name="Bob Wilson">
        <span>Bob Wilson</span>
      </EmployeeHoverCard>,
    );

    expect(screen.getByTestId('avatar-fallback')).toBeTruthy();
  });

  it('renders without crashing when no userId', () => {
    render(
      <EmployeeHoverCard name="No ID User">
        <span>No ID User</span>
      </EmployeeHoverCard>,
    );
    expect(screen.getAllByText('No ID User').length).toBeGreaterThanOrEqual(1);
  });
});
