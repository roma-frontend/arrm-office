/**
 * Tests for UpcomingBirthdaysWidget — dashboard widget listing birthdays in
 * the next 30 days.
 *
 * Mocks: convex/react useQuery keyed by ref name, i18next (mutable language
 * getter), react-i18next (interpolating t), UI primitives (Card/Badge),
 * lucide icons, generated api. date-fns format + locales run real so the
 * displayed month/day strings are exercised against the active locale.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Interpolates {{placeholders}} from the options object, then falls back.
    t: (key: string, fallback?: unknown, opts?: Record<string, unknown>) => {
      let out = typeof fallback === 'string' ? fallback : key;
      if (opts && typeof opts === 'object') {
        for (const [k, v] of Object.entries(opts)) out = out.replace(`{{${k}}}`, String(v));
      }
      return out;
    },
  }),
}));

let mockI18nLang = 'en';
jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    get language() {
      return mockI18nLang;
    },
  },
}));

let queryResults: Record<string, unknown> = {};
jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
}));

jest.mock('../../convex/_generated/api', () => ({
  api: {
    dashboard: {
      getUpcomingBirthdays: { _name: 'getUpcomingBirthdays' },
    },
  },
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: any) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return { Cake: Icon, Gift: Icon };
});

import { UpcomingBirthdaysWidget } from '@/components/dashboard/widgets/UpcomingBirthdaysWidget';

const entry = (overrides: Record<string, unknown> = {}) => ({
  _id: 'b1',
  name: 'Anna Petrova',
  avatarUrl: null,
  month: 5,
  day: 15,
  daysUntil: 10,
  isToday: false,
  ...overrides,
});

describe('UpcomingBirthdaysWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockI18nLang = 'en';
    queryResults = {};
  });

  // ── Loading & empty ─────────────────────────────────────────────────────

  it('shows skeletons while birthdays load', () => {
    render(<UpcomingBirthdaysWidget />);
    expect(document.querySelectorAll('.animate-pulse').length).toBe(3);
  });

  it('shows the empty state when nobody has a birthday soon', () => {
    queryResults.getUpcomingBirthdays = [];
    render(<UpcomingBirthdaysWidget />);
    expect(screen.getByText('No birthdays in the next 30 days')).toBeInTheDocument();
  });

  // ── Rendering entries ───────────────────────────────────────────────────

  it('renders the header title', () => {
    queryResults.getUpcomingBirthdays = [entry()];
    render(<UpcomingBirthdaysWidget />);
    expect(screen.getByText('Upcoming Birthdays')).toBeInTheDocument();
  });

  it('renders names and the formatted month/day', () => {
    queryResults.getUpcomingBirthdays = [entry()];
    render(<UpcomingBirthdaysWidget />);
    expect(screen.getByText('Anna Petrova')).toBeInTheDocument();
    const expected = format(new Date(2000, 5 - 1, 15), 'MMMM d', { locale: enUS });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('appends the department to the date line', () => {
    queryResults.getUpcomingBirthdays = [entry({ department: 'Engineering' })];
    render(<UpcomingBirthdaysWidget />);
    const expected = format(new Date(2000, 5 - 1, 15), 'MMMM d', { locale: enUS });
    expect(screen.getByText(`${expected} · Engineering`)).toBeInTheDocument();
  });

  it('omits the department separator when there is none', () => {
    queryResults.getUpcomingBirthdays = [entry({ department: undefined })];
    render(<UpcomingBirthdaysWidget />);
    const expected = format(new Date(2000, 5 - 1, 15), 'MMMM d', { locale: enUS });
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  // ── Avatars ─────────────────────────────────────────────────────────────

  it('renders initials when there is no avatar', () => {
    queryResults.getUpcomingBirthdays = [entry({ name: 'John Smith' })];
    render(<UpcomingBirthdaysWidget />);
    expect(screen.getByText('JS')).toBeInTheDocument();
  });

  it('renders an image avatar when avatarUrl is present', () => {
    queryResults.getUpcomingBirthdays = [entry({ avatarUrl: 'https://cdn.example/b.png' })];
    render(<UpcomingBirthdaysWidget />);
    const img = screen.getByAltText('Anna Petrova');
    expect(img).toHaveAttribute('src', 'https://cdn.example/b.png');
  });

  // ── Today / Tomorrow / countdown ────────────────────────────────────────

  it('shows the Today badge for todays birthdays', () => {
    queryResults.getUpcomingBirthdays = [entry({ isToday: true })];
    render(<UpcomingBirthdaysWidget />);
    const badge = screen.getByTestId('badge');
    expect(badge.textContent).toBe('🎉 Today');
    expect(badge.getAttribute('data-variant')).toBe('success');
  });

  it('shows Tomorrow for a birthday in one day', () => {
    queryResults.getUpcomingBirthdays = [entry({ daysUntil: 1, isToday: false })];
    render(<UpcomingBirthdaysWidget />);
    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
  });

  it('shows the day countdown for birthdays further out', () => {
    queryResults.getUpcomingBirthdays = [entry({ daysUntil: 10, isToday: false })];
    render(<UpcomingBirthdaysWidget />);
    expect(screen.getByText('in 10d')).toBeInTheDocument();
  });

  // ── Locales & slicing ───────────────────────────────────────────────────

  it('formats dates in Russian', () => {
    mockI18nLang = 'ru';
    queryResults.getUpcomingBirthdays = [entry()];
    render(<UpcomingBirthdaysWidget />);
    const expected = format(new Date(2000, 5 - 1, 15), 'MMMM d', { locale: ru });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('formats dates in Armenian', () => {
    mockI18nLang = 'hy';
    queryResults.getUpcomingBirthdays = [entry()];
    render(<UpcomingBirthdaysWidget />);
    const expected = format(new Date(2000, 5 - 1, 15), 'MMMM d', { locale: hy });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('falls back to English when i18next has no language', () => {
    mockI18nLang = '';
    queryResults.getUpcomingBirthdays = [entry()];
    render(<UpcomingBirthdaysWidget />);
    const expected = format(new Date(2000, 5 - 1, 15), 'MMMM d', { locale: enUS });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('slices the birthday list to 6', () => {
    const many = Array.from({ length: 8 }, (_, i) => entry({ _id: `b${i}`, name: `P ${i}` }));
    queryResults.getUpcomingBirthdays = many;
    render(<UpcomingBirthdaysWidget />);
    expect(screen.getByText('P 0')).toBeInTheDocument();
    expect(screen.getByText('P 5')).toBeInTheDocument();
    expect(screen.queryByText('P 6')).not.toBeInTheDocument();
    expect(screen.queryByText('P 7')).not.toBeInTheDocument();
  });
});
