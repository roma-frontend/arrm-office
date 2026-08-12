/**
 * Tests for OutOfOfficeWidget — dashboard widget listing who is away soon.
 *
 * Mocks: convex/react useQuery keyed by ref name, i18next (mutable language
 * getter), react-i18next (fallback-string t), UI primitives (Card/Badge),
 * lucide icons, generated api. date-fns format + locales and the leave-type
 * helpers run real so date strings and labels are exercised.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === 'string' ? fallback : key,
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
      getOutOfOffice: { _name: 'getOutOfOffice' },
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
  return { PalmtreeIcon: Icon, UserCheck: Icon };
});

import { OutOfOfficeWidget } from '@/components/dashboard/widgets/OutOfOfficeWidget';

const DAY = 24 * 60 * 60 * 1000;
const iso = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

const entry = (overrides: Record<string, unknown> = {}) => ({
  _id: 'e1',
  name: 'John Doe',
  avatarUrl: null,
  startDate: iso(1),
  endDate: iso(5),
  type: 'paid',
  isOutToday: false,
  ...overrides,
});

describe('OutOfOfficeWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockI18nLang = 'en';
    queryResults = {};
  });

  // ── Loading & empty ─────────────────────────────────────────────────────

  it('shows skeletons while entries load', () => {
    render(<OutOfOfficeWidget />);
    expect(document.querySelectorAll('.animate-pulse').length).toBe(3);
  });

  it('shows the everyone-in empty state', () => {
    queryResults.getOutOfOffice = [];
    render(<OutOfOfficeWidget />);
    expect(screen.getByText('Everyone is in this week')).toBeInTheDocument();
  });

  // ── Rendering entries ───────────────────────────────────────────────────

  it('renders the header title', () => {
    queryResults.getOutOfOffice = [entry()];
    render(<OutOfOfficeWidget />);
    expect(screen.getByText('Out of Office')).toBeInTheDocument();
  });

  it('renders names and the date range with the active locale', () => {
    queryResults.getOutOfOffice = [entry()];
    render(<OutOfOfficeWidget />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    const expected = `${format(new Date(iso(1)), 'MMM d', { locale: enUS })} – ${format(
      new Date(iso(5)),
      'MMM d',
      { locale: enUS },
    )}`;
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('renders initials when the entry has no avatar', () => {
    queryResults.getOutOfOffice = [entry({ name: 'Jane Smith' })];
    render(<OutOfOfficeWidget />);
    expect(screen.getByText('JS')).toBeInTheDocument();
  });

  it('renders an image avatar when avatarUrl is present', () => {
    queryResults.getOutOfOffice = [entry({ avatarUrl: 'https://cdn.example/a.png' })];
    render(<OutOfOfficeWidget />);
    const img = screen.getByAltText('John Doe');
    expect(img).toHaveAttribute('src', 'https://cdn.example/a.png');
  });

  it('renders the leave type label through getLeaveTypeLabel', () => {
    queryResults.getOutOfOffice = [entry({ type: 'sick' })];
    render(<OutOfOfficeWidget />);
    expect(screen.getByText('leaveTypes.sick')).toBeInTheDocument();
  });

  it('applies a color accent from LEAVE_TYPE_COLORS', () => {
    queryResults.getOutOfOffice = [entry({ type: 'family' })];
    render(<OutOfOfficeWidget />);
    const label = screen.getByText('leaveTypes.family');
    expect(label.getAttribute('style')).toContain('color:');
  });

  it('falls back to the default color for unknown leave types', () => {
    queryResults.getOutOfOffice = [entry({ type: 'weird' })];
    const { container } = render(<OutOfOfficeWidget />);
    // getLeaveTypeLabel('weird') → t(undefined) → renders an empty label, so
    // the color style is the only queryable signal for the unknown-type fallback.
    // React serializes the style attribute to normalized rgb() values;
    // slate-500 is rgb(100, 116, 139).
    const label = Array.from(container.querySelectorAll('span')).find(
      (el) => el.style.color === 'rgb(100, 116, 139)',
    );
    expect(label).not.toBeUndefined();
  });

  // ── Out-now badge ───────────────────────────────────────────────────────

  it('shows the out-now badge when the entry is out today', () => {
    queryResults.getOutOfOffice = [entry({ isOutToday: true })];
    render(<OutOfOfficeWidget />);
    const badge = screen.getByTestId('badge');
    expect(badge.textContent).toBe('Out now');
    expect(badge.getAttribute('data-variant')).toBe('warning');
  });

  it('omits the out-now badge when the entry is not out today', () => {
    queryResults.getOutOfOffice = [entry({ isOutToday: false })];
    render(<OutOfOfficeWidget />);
    expect(screen.queryByTestId('badge')).not.toBeInTheDocument();
  });

  // ── Locales & slicing ───────────────────────────────────────────────────

  it('formats dates in Russian', () => {
    mockI18nLang = 'ru';
    queryResults.getOutOfOffice = [entry()];
    render(<OutOfOfficeWidget />);
    const expected = `${format(new Date(iso(1)), 'MMM d', { locale: ru })} – ${format(
      new Date(iso(5)),
      'MMM d',
      { locale: ru },
    )}`;
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('formats dates in Armenian', () => {
    mockI18nLang = 'hy';
    queryResults.getOutOfOffice = [entry()];
    render(<OutOfOfficeWidget />);
    const expected = `${format(new Date(iso(1)), 'MMM d', { locale: hy })} – ${format(
      new Date(iso(5)),
      'MMM d',
      { locale: hy },
    )}`;
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('falls back to English when i18next has no language', () => {
    mockI18nLang = '';
    queryResults.getOutOfOffice = [entry()];
    render(<OutOfOfficeWidget />);
    const expected = `${format(new Date(iso(1)), 'MMM d', { locale: enUS })} – ${format(
      new Date(iso(5)),
      'MMM d',
      { locale: enUS },
    )}`;
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('slices the entry list to 6', () => {
    const many = Array.from({ length: 8 }, (_, i) => entry({ _id: `e${i}`, name: `P ${i}` }));
    queryResults.getOutOfOffice = many;
    render(<OutOfOfficeWidget />);
    // names of the first 6 are rendered, the last 2 are not
    expect(screen.getByText('P 0')).toBeInTheDocument();
    expect(screen.getByText('P 5')).toBeInTheDocument();
    expect(screen.queryByText('P 6')).not.toBeInTheDocument();
    expect(screen.queryByText('P 7')).not.toBeInTheDocument();
  });
});
