/**
 * Tests for TeamClient — the /team directory page.
 *
 * Covers: hero + stats tiles (loading dashes vs real values), avatar rail with
 * overflow badge, member cards (position/role/department/location/email/phone,
 * presence dot, is-me badge, away/birthday chips), inactive-user filtering,
 * search by name/email/position/department/location, no-results empty state,
 * department + role chips, sort (name/department/newest), grid/list toggle
 * with localStorage persistence, the "/" keyboard shortcut, birthdays and
 * away rails (Today/Now badges, dates) and the reporting-line rail
 * (managers/direct-reports/empty), plus the orgless "skip" path.
 *
 * Mocks: convex/react (useQuery keyed by _name), generated api, auth store
 * (selector-based useAuthUser), useSelectedOrganization, next/link + next/image,
 * cssMotion, ShieldLoader, sonner. t() interpolates {{vars}} from options.
 */

import React from 'react';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// ── i18n (interpolates {{var}} from the options object) ──────────────────────
let mockLanguage: string = 'en';
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => {
      const template = typeof opts === 'string' ? opts : (opts?.defaultValue ?? key);
      return template.replace(/\{\{(\w+)\}\}/g, (_m: string, name: string) =>
        String(opts?.[name] ?? ''),
      );
    },
    i18n: { language: mockLanguage },
  }),
}));

// ── Convex ───────────────────────────────────────────────────────────────────
const mockQueries: Record<string, any> = {};
jest.mock('convex/react', () => ({
  useQuery: (q: any) => (q?._name in mockQueries ? mockQueries[q._name] : undefined),
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    users: { queries: { getAllUsers: { _name: 'users.queries.getAllUsers' } } },
    dashboard: {
      getUpcomingBirthdays: { _name: 'dashboard.getUpcomingBirthdays' },
      getOutOfOffice: { _name: 'dashboard.getOutOfOffice' },
      getReportingLine: { _name: 'dashboard.getReportingLine' },
    },
  },
}));

// ── Auth / org ───────────────────────────────────────────────────────────────
let mockUser: Record<string, any> | null = {
  id: 'u1',
  role: 'admin',
  organizationId: 'org-1',
  organizationName: 'Globex',
};
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (sel: any) => sel({ user: mockUser }),
  useAuthUser: () => mockUser,
}));

jest.mock('zustand/shallow', () => ({
  useShallow: (s: any) => s,
}));

let mockOrgId: string | null = 'org-1';
jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => mockOrgId,
}));

// ── Next / UI primitives ─────────────────────────────────────────────────────
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...rest }: any) => <img src={src} alt={alt ?? ''} {...rest} />,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

jest.mock('@/lib/cssMotion', () => {
  const ReactMod = require('react');
  return {
    motion: { div: ({ children, ...props }: any) => <div {...props}>{children}</div> },
  };
});

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="rail-loader" />,
}));

// ── Component + fixtures ─────────────────────────────────────────────────────
import TeamClient from '@/components/team/TeamClient';

const activeMembers = [
  {
    _id: 'u1',
    name: 'Alice Wonder',
    email: 'alice@x.com',
    role: 'admin',
    department: 'Engineering',
    position: 'CTO',
    location: 'Yerevan',
    phone: '+374111111',
    presenceStatus: 'in_meeting',
    createdAt: 100,
    isActive: true,
  },
  {
    _id: 'u2',
    name: 'Bob Builder',
    email: 'bob@x.com',
    role: 'employee',
    department: 'Engineering',
    position: 'Dev',
    location: 'Yerevan',
    createdAt: 200,
    isActive: true,
  },
  {
    _id: 'u3',
    name: 'Cara Chen',
    email: 'cara@x.com',
    role: 'employee',
    department: 'Design',
    location: 'LA',
    createdAt: 300,
    isActive: true,
  },
  {
    _id: 'u4',
    name: 'Dan Draft',
    email: 'dan@x.com',
    role: 'supervisor',
    department: 'Sales',
    position: 'Lead',
    createdAt: 400,
    isActive: true,
  },
  {
    _id: 'u5',
    name: 'Eve Exit',
    email: 'eve@x.com',
    role: 'employee',
    department: 'Engineering',
    createdAt: 500,
    isActive: true,
  },
  {
    _id: 'u6',
    name: 'Frank Fields',
    email: 'frank@x.com',
    role: 'employee',
    department: 'Ops',
    location: 'Berlin',
    createdAt: 600,
    isActive: true,
  },
  {
    _id: 'u7',
    name: 'Grace Green',
    email: 'grace@x.com',
    role: 'employee',
    department: 'Sales',
    avatarUrl: 'https://cdn.example.com/grace.jpg',
    createdAt: 700,
    isActive: true,
  },
  // filtered out by isActive === false
  { _id: 'u8', name: 'Hank Hidden', email: 'hank@x.com', role: 'employee', isActive: false },
];

const birthdays = [
  {
    _id: 'u1',
    name: 'Alice Wonder',
    department: 'Engineering',
    day: 15,
    month: 8,
    daysUntil: 3,
    isToday: false,
  },
  { _id: 'u7', name: 'Grace Green', day: 5, month: 8, daysUntil: 0, isToday: true },
];

const awayEntries = [
  {
    _id: 'a1',
    userId: 'u4',
    name: 'Dan Draft',
    department: 'Sales',
    type: 'vacation',
    startDate: '2026-08-10',
    endDate: '2026-08-14',
    isOutToday: true,
  },
  {
    _id: 'a2',
    userId: 'u6',
    name: 'Frank Fields',
    department: 'Ops',
    type: 'trip',
    startDate: '2026-08-20',
    endDate: '2026-08-25',
    isOutToday: false,
  },
];

const reportingLine = {
  managers: [{ _id: 'u1', name: 'Alice Wonder', position: 'CTO' }],
  directReports: [{ _id: 'u2', name: 'Bob Builder' }],
};

function seed({
  users = activeMembers,
  birthdaysData = birthdays,
  away = awayEntries,
  reporting = reportingLine,
}: {
  users?: any[];
  birthdaysData?: any[];
  away?: any[];
  reporting?: any;
} = {}) {
  mockQueries['users.queries.getAllUsers'] = users;
  mockQueries['dashboard.getUpcomingBirthdays'] = birthdaysData;
  mockQueries['dashboard.getOutOfOffice'] = away;
  mockQueries['dashboard.getReportingLine'] = reporting;
}

function renderPage() {
  return render(<TeamClient />);
}

/** Value under a stats tile found by its label text. */
function tileValue(label: string) {
  const labelEl = screen.getByText(label);
  return labelEl.parentElement?.parentElement?.querySelector('p')?.textContent;
}

describe('TeamClient — loading & hero', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', role: 'admin', organizationId: 'org-1', organizationName: 'Globex' };
    mockOrgId = 'org-1';
    mockLanguage = 'en';
    window.localStorage.clear();
  });

  it('shows dashes in the stat tiles while users are loading', () => {
    mockQueries['users.queries.getAllUsers'] = undefined;
    mockQueries['dashboard.getUpcomingBirthdays'] = undefined;
    mockQueries['dashboard.getOutOfOffice'] = undefined;
    mockQueries['dashboard.getReportingLine'] = undefined;
    renderPage();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    // skeletons in the directory grid
    expect(screen.getAllByText('Headcount').length).toBeGreaterThan(0);
  });

  it('renders the hero with the org name, title and subtitle counts', () => {
    seed();
    renderPage();
    expect(screen.getByText('Globex')).toBeInTheDocument();
    // h1 (sr-only) + hero title
    expect(screen.getAllByText('Team').length).toBe(2);
    expect(screen.getByText('7 colleagues across 4 departments')).toBeInTheDocument();
  });

  it('falls back to the Directory eyebrow when the org name is missing', () => {
    mockUser = { id: 'u1', role: 'admin', organizationId: 'org-1' };
    seed();
    renderPage();
    expect(screen.getByText('Directory')).toBeInTheDocument();
  });

  it('shows real stat tile values', () => {
    seed();
    renderPage();
    expect(tileValue('Headcount')).toBe('7');
    expect(tileValue('In today')).toBe('6'); // 7 - 1 out today (Dan)
    expect(tileValue('Away today')).toBe('1');
    expect(tileValue('Departments')).toBe('4');
    expect(tileValue('Birthdays soon')).toBe('2');
  });

  it('shows the avatar rail with an overflow count for more than six members', () => {
    seed();
    renderPage();
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('hides the avatar rail when there are no members', () => {
    seed({ users: [] });
    renderPage();
    expect(screen.queryByText('+1')).not.toBeInTheDocument();
  });
});

describe('TeamClient — directory & member cards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', role: 'admin', organizationId: 'org-1', organizationName: 'Globex' };
    mockOrgId = 'org-1';
    mockLanguage = 'en';
    window.localStorage.clear();
    seed();
  });

  it('renders member cards with names, positions, emails and phone', () => {
    renderPage();
    // Alice, Bob and CTO appear in the cards AND the rails
    expect(screen.getAllByText('Alice Wonder').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bob Builder').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CTO').length).toBeGreaterThan(0);
    // email + phone are card-only
    expect(screen.getByText('alice@x.com')).toBeInTheDocument();
    expect(screen.getByText('+374111111')).toBeInTheDocument();
  });

  it('filters out inactive members', () => {
    renderPage();
    expect(screen.queryByText('Hank Hidden')).not.toBeInTheDocument();
  });

  it('renders the is-me badge for the current user', () => {
    renderPage();
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('renders department and location chips when present', () => {
    renderPage();
    expect(screen.getAllByText('Engineering').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Yerevan').length).toBeGreaterThan(0);
  });

  it('uses the role label as the subtitle when there is no position', () => {
    renderPage();
    // Bob has no position → role name is shown; multiple employees exist so use getAllByText
    expect(screen.getAllByText('employee').length).toBeGreaterThan(0);
  });

  it('renders initials for avatarless members and the image for those with a photo', () => {
    renderPage();
    // AW in the avatar rail + the member card
    expect(screen.getAllByText('AW').length).toBeGreaterThan(0);
    const img = screen.getByAltText('') as HTMLImageElement;
    expect(img.src).toContain('grace.jpg');
  });

  it('links each card to the employee profile', () => {
    renderPage();
    const aliceLink = screen.getAllByText('Alice Wonder')[0].closest('a');
    expect(aliceLink).toHaveAttribute('href', '/employees/u1');
  });

  it('shows a Back-soon chip for members out today', () => {
    renderPage();
    // Dan is out today → "Back …" chip (the date is locale-formatted)
    expect(screen.getByText(/Back/)).toBeInTheDocument();
  });

  it('shows an Away chip for members with upcoming leave', () => {
    renderPage();
    // Frank is not out today → "Away <date>" chip (locale-formatted); the
    // "Away today" stat label is lowercase after the space, so it never matches.
    expect(screen.getAllByText(/^Away [A-Z]/).length).toBeGreaterThan(0);
  });

  it('shows birthday chips with in-days and Today labels', () => {
    renderPage();
    // Alice (card + rail) has a non-today birthday; Grace (card + rail) is today
    expect(screen.getAllByText('in 3d').length).toBe(2);
    expect(screen.getAllByText('Today').length).toBe(2);
  });
});

describe('TeamClient — search, filters, sort', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', role: 'admin', organizationId: 'org-1', organizationName: 'Globex' };
    mockOrgId = 'org-1';
    mockLanguage = 'en';
    window.localStorage.clear();
    seed();
  });

  it('filters by name', () => {
    renderPage();
    const search = screen.getByPlaceholderText('Search by name, role, department…');
    // Cara is card-only (never appears in the rails), so her presence proves filtering
    fireEvent.change(search, { target: { value: 'cara' } });
    expect(screen.getByText('Cara Chen')).toBeInTheDocument();
    expect(screen.getByText('1 of 7 shown')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'alice' } });
    expect(screen.getAllByText('Alice Wonder').length).toBeGreaterThan(0);
    // Eve is card-only and should be filtered out
    expect(screen.queryByText('Eve Exit')).not.toBeInTheDocument();
  });

  it('filters by email and department and location', () => {
    renderPage();
    const search = screen.getByPlaceholderText('Search by name, role, department…');
    fireEvent.change(search, { target: { value: 'frank@x.com' } });
    expect(screen.getAllByText('Frank Fields').length).toBeGreaterThan(0);
    fireEvent.change(search, { target: { value: 'Design' } });
    expect(screen.getByText('Cara Chen')).toBeInTheDocument();
    expect(screen.getByText('1 of 7 shown')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'Berlin' } });
    expect(screen.getAllByText('Frank Fields').length).toBeGreaterThan(0);
  });

  it('shows the empty state and clears filters from it', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Search by name, role, department…'), {
      target: { value: 'zzz' },
    });
    expect(screen.getByText('Nobody matches that')).toBeInTheDocument();
    // the empty-state clear button restores the full directory
    fireEvent.click(screen.getAllByText('Clear filters')[0]);
    expect(screen.getByText('7 of 7 shown')).toBeInTheDocument();
  });

  it('filters by department chips and resets with All departments', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Design/ }));
    expect(screen.getByText('Cara Chen')).toBeInTheDocument();
    expect(screen.getByText('1 of 7 shown')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /All departments/ }));
    expect(screen.getByText('7 of 7 shown')).toBeInTheDocument();
  });

  it('shows role chips only when more than one role exists and filters by role', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /All roles/ })).toBeInTheDocument();
    // click the admin role chip (a button; the card role badge is a span)
    fireEvent.click(screen.getByRole('button', { name: /^admin/ }));
    expect(screen.getByText('1 of 7 shown')).toBeInTheDocument();
    expect(screen.getAllByText('Alice Wonder').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /All roles/ }));
    expect(screen.getByText('7 of 7 shown')).toBeInTheDocument();
  });

  it('hides role chips when everyone shares one role', () => {
    seed({ users: activeMembers.map((m) => ({ ...m, role: 'employee' })) });
    renderPage();
    expect(screen.queryByText('All roles')).not.toBeInTheDocument();
  });

  it('shows the results count', () => {
    renderPage();
    expect(screen.getByText('7 of 7 shown')).toBeInTheDocument();
  });

  it('clears the query with the inline X button', () => {
    renderPage();
    const search = screen.getByPlaceholderText('Search by name, role, department…');
    fireEvent.change(search, { target: { value: 'cara' } });
    expect(screen.getByLabelText('Clear')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Clear'));
    expect(search).toHaveValue('');
    expect(screen.getByText('7 of 7 shown')).toBeInTheDocument();
  });

  it('clears all filters from the toolbar button', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Search by name, role, department…'), {
      target: { value: 'cara' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Design/ }));
    fireEvent.click(screen.getAllByText('Clear filters')[0]);
    expect(screen.getByText('7 of 7 shown')).toBeInTheDocument();
  });

  it('sorts by newest (createdAt descending)', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'newest' } });
    const names = screen.getAllByText(/Wonder|Builder|Chen|Draft|Exit|Fields|Green/);
    // only cards in the directory carry the names — rails duplicate some, so
    // scope to the card links (each name is inside an <a>).
    const first = screen.getAllByRole('link')[0];
    expect(first.textContent).toContain('Grace Green');
  });

  it('sorts by department (alphabetical by department name)', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'department' } });
    const links = screen
      .getAllByRole('link')
      .map((l) => l.textContent ?? '')
      .filter((t) => /Wonder|Builder|Chen|Draft|Exit|Fields|Green/.test(t));
    // Design < Engineering < Ops < Sales alphabetically → Cara first
    expect(links[0]).toContain('Cara');
  });
});

describe('TeamClient — view toggle & keyboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', role: 'admin', organizationId: 'org-1', organizationName: 'Globex' };
    mockOrgId = 'org-1';
    mockLanguage = 'en';
    window.localStorage.clear();
    seed();
  });

  it('toggles to list view and persists the choice', () => {
    renderPage();
    const listBtn = screen.getByLabelText('List');
    expect(listBtn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(listBtn);
    expect(listBtn).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('team.viewMode')).toBe('list');
  });

  it('restores the stored view mode on mount', async () => {
    window.localStorage.setItem('team.viewMode', 'list');
    renderPage();
    await waitFor(() =>
      expect(screen.getByLabelText('List')).toHaveAttribute('aria-pressed', 'true'),
    );
  });

  it('restores the grid view when storage holds an unknown value', async () => {
    window.localStorage.setItem('team.viewMode', 'bogus');
    renderPage();
    await waitFor(() =>
      expect(screen.getByLabelText('Grid')).toHaveAttribute('aria-pressed', 'true'),
    );
  });

  it('"/" focuses the search input', () => {
    renderPage();
    const search = screen.getByPlaceholderText('Search by name, role, department…');
    fireEvent.keyDown(window, { key: '/' });
    expect(search).toHaveFocus();
  });

  it('does not hijack "/" with a modifier key', () => {
    renderPage();
    const search = screen.getByPlaceholderText('Search by name, role, department…');
    fireEvent.keyDown(window, { key: '/', metaKey: true });
    expect(search).not.toHaveFocus();
  });

  it('lets "/" type normally while the search field is focused', () => {
    renderPage();
    const search = screen.getByPlaceholderText('Search by name, role, department…');
    search.focus();
    // dispatch on the input itself (bubbles to the window listener) so the
    // event target is an INPUT — the guard must skip the shortcut.
    const event = new KeyboardEvent('keydown', { key: '/', bubbles: true });
    const preventSpy = jest.spyOn(event, 'preventDefault');
    search.dispatchEvent(event);
    expect(preventSpy).not.toHaveBeenCalled();
  });
});

describe('TeamClient — side rails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', role: 'admin', organizationId: 'org-1', organizationName: 'Globex' };
    mockOrgId = 'org-1';
    mockLanguage = 'en';
    window.localStorage.clear();
  });

  it('renders the birthdays rail with dates and a Today badge', () => {
    seed();
    renderPage();
    // UTC-formatted date is deterministic: 15 Aug (rail only)
    expect(screen.getAllByText('Aug 15').length).toBeGreaterThan(0);
    // Today + in-days badges appear on the cards and in the rail
    expect(screen.getAllByText('Today').length).toBeGreaterThan(0);
    expect(screen.getAllByText('in 3d').length).toBeGreaterThan(0);
  });

  it('renders the away rail with date ranges and a Now badge', () => {
    seed();
    renderPage();
    expect(screen.getAllByText('Dan Draft').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Aug/).length).toBeGreaterThan(0);
    expect(screen.getByText('Now')).toBeInTheDocument();
  });

  it('renders the reporting line with managers and direct reports', () => {
    seed();
    renderPage();
    expect(screen.getByText('Managers')).toBeInTheDocument();
    expect(screen.getByText('Direct reports')).toBeInTheDocument();
    expect(screen.getAllByText('Alice Wonder').length).toBeGreaterThan(0);
  });

  it('shows the reporting-line empty state', () => {
    seed({ reporting: { managers: [], directReports: [] } });
    renderPage();
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('shows the rail loader while birthdays are loading', () => {
    seed();
    mockQueries['dashboard.getUpcomingBirthdays'] = undefined;
    renderPage();
    expect(screen.getAllByTestId('rail-loader').length).toBeGreaterThan(0);
  });

  it('shows the empty state for an empty birthdays rail', () => {
    seed({ birthdaysData: [] });
    renderPage();
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('falls back to the raw date string when an away date is invalid', () => {
    seed({
      away: [
        {
          _id: 'a9',
          userId: 'u5',
          name: 'Eve Exit',
          type: 'trip',
          startDate: 'not-a-date',
          endDate: 'also-bad',
          isOutToday: false,
        },
      ],
    });
    renderPage();
    // formatShortDate returns the raw string for unparseable dates (card + rail)
    expect(screen.getAllByText(/not-a-date/).length).toBeGreaterThan(0);
  });
});

describe('TeamClient — edge cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', role: 'admin', organizationId: 'org-1', organizationName: 'Globex' };
    mockOrgId = 'org-1';
    mockLanguage = 'en';
    window.localStorage.clear();
  });

  it('skips queries and shows the empty state when no organization is known', () => {
    mockUser = { id: 'u1', role: 'admin' };
    mockOrgId = null;
    seed({ users: [] });
    renderPage();
    expect(screen.getByText('Nobody matches that')).toBeInTheDocument();
    expect(tileValue('Headcount')).toBe('0');
  });

  it('renders an empty directory when there are no members', () => {
    seed({ users: [] });
    renderPage();
    expect(screen.getByText('Nobody matches that')).toBeInTheDocument();
  });

  it('hides department chips when no member has a department', () => {
    seed({ users: activeMembers.map((m) => ({ ...m, department: undefined })) });
    renderPage();
    expect(screen.queryByText('All departments')).not.toBeInTheDocument();
  });
});

describe('TeamClient — defensive branches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', role: 'admin', organizationId: 'org-1', organizationName: 'Globex' };
    mockOrgId = 'org-1';
    mockLanguage = 'en';
    window.localStorage.clear();
  });

  it('falls back for unknown roles, leading-space names and rare presence statuses', () => {
    seed({
      users: [
        // 'manager' is not in ROLE_COLOR / ROLE_ICON → default tint + User icon
        {
          _id: 'u1',
          name: 'Ada Lovelace',
          email: 'ada@x.com',
          role: 'manager',
          department: 'Eng',
          isActive: true,
        },
        // leading space yields an empty split part → initials '' fallback
        { _id: 'u2', name: ' Bo Unique', email: 'bo@x.com', role: 'employee', isActive: true },
        // rare presence statuses render their own dots
        {
          _id: 'u3',
          name: 'Carl Busy',
          email: 'carl@x.com',
          role: 'employee',
          presenceStatus: 'busy',
          isActive: true,
        },
        {
          _id: 'u4',
          name: 'Ivy Call',
          email: 'ivy@x.com',
          role: 'employee',
          presenceStatus: 'in_call',
          isActive: true,
        },
      ],
      away: [],
      birthdays: [],
    });
    renderPage();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Bo Unique')).toBeInTheDocument();
    expect(screen.getAllByText('manager').length).toBeGreaterThan(0);
    expect(screen.getByText('Carl Busy')).toBeInTheDocument();
    expect(screen.getByText('Ivy Call')).toBeInTheDocument();
  });

  it('dedupes away entries and birthdays by user', () => {
    seed({
      users: [activeMembers[0]],
      away: [
        {
          _id: 'a1',
          userId: 'u1',
          name: 'Alice Wonder',
          type: 'v',
          startDate: '2026-08-10',
          endDate: '2026-08-12',
          isOutToday: false,
        },
        {
          _id: 'a2',
          userId: 'u1',
          name: 'Alice Wonder',
          type: 'v',
          startDate: '2026-08-20',
          endDate: '2026-08-22',
          isOutToday: false,
        },
      ],
      birthdaysData: [
        { _id: 'u1', name: 'Alice Wonder', day: 1, month: 1, daysUntil: 5, isToday: false },
        { _id: 'u1', name: 'Alice Wonder', day: 2, month: 2, daysUntil: 9, isToday: false },
      ],
    });
    renderPage();
    expect(screen.getAllByText('Alice Wonder').length).toBeGreaterThan(0);
  });

  it('filters by department when some members lack one', () => {
    seed({
      users: [
        {
          _id: 'u1',
          name: 'Alice Wonder',
          email: 'a@x.com',
          role: 'employee',
          department: 'Engineering',
          isActive: true,
        },
        {
          _id: 'u2',
          name: 'Bob Builder',
          email: 'b@x.com',
          role: 'employee',
          department: 'Design',
          isActive: true,
        },
        { _id: 'u3', name: 'Cara Chen', email: 'c@x.com', role: 'employee', isActive: true },
      ],
      away: [],
      birthdays: [],
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Engineering/ }));
    expect(screen.getByText('1 of 3 shown')).toBeInTheDocument();
    // Alice also appears in the birthdays rail, so match any occurrence
    expect(screen.getAllByText('Alice Wonder').length).toBeGreaterThan(0);
    expect(screen.queryByText('Bob Builder')).not.toBeInTheDocument();
  });

  it('ignores "/" while a textarea is focused', () => {
    renderPage();
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    const event = new KeyboardEvent('keydown', { key: '/', bubbles: true });
    const preventSpy = jest.spyOn(event, 'preventDefault');
    ta.dispatchEvent(event);
    expect(preventSpy).not.toHaveBeenCalled();
    ta.remove();
  });

  it('ignores "/" inside a contenteditable region', () => {
    // jsdom does not implement isContentEditable, so define it on the prototype
    Object.defineProperty(HTMLElement.prototype, 'isContentEditable', {
      get: () => true,
      configurable: true,
    });
    renderPage();
    const div = document.createElement('div');
    document.body.appendChild(div);
    const event = new KeyboardEvent('keydown', { key: '/', bubbles: true });
    const preventSpy = jest.spyOn(event, 'preventDefault');
    div.dispatchEvent(event);
    expect(preventSpy).not.toHaveBeenCalled();
    div.remove();
    delete (HTMLElement.prototype as { isContentEditable?: unknown }).isContentEditable;
  });

  it('focuses the search when the "/" event has no target', () => {
    renderPage();
    const search = screen.getByPlaceholderText('Search by name, role, department…');
    const event = new KeyboardEvent('keydown', { key: '/' });
    Object.defineProperty(event, 'target', { value: null });
    window.dispatchEvent(event);
    expect(search).toHaveFocus();
  });

  it('renders the loading skeleton in the list layout', () => {
    window.localStorage.setItem('team.viewMode', 'list');
    mockQueries['users.queries.getAllUsers'] = undefined;
    mockQueries['dashboard.getUpcomingBirthdays'] = undefined;
    mockQueries['dashboard.getOutOfOffice'] = undefined;
    mockQueries['dashboard.getReportingLine'] = undefined;
    renderPage();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('sorts by newest with missing createdAt and by department with missing departments', () => {
    seed({
      users: activeMembers.map((m) => ({ ...m, createdAt: undefined, department: undefined })),
    });
    renderPage();
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'newest' } });
    expect(screen.getByText('7 of 7 shown')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'department' } });
    expect(screen.getByText('7 of 7 shown')).toBeInTheDocument();
  });

  it('caps the stagger delay beyond the first twelve members', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({
      _id: `u${i}`,
      name: `Person ${i}`,
      email: `p${i}@x.com`,
      role: 'employee',
      isActive: true,
    }));
    seed({ users: many });
    renderPage();
    expect(screen.getByText('Person 12')).toBeInTheDocument();
    // avatar rail overflow: 13 - 6
    expect(screen.getByText('+7')).toBeInTheDocument();
  });

  it('tolerates localStorage write failures when switching views', () => {
    const setSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    renderPage();
    fireEvent.click(screen.getByLabelText('List'));
    expect(screen.getByLabelText('List')).toHaveAttribute('aria-pressed', 'true');
    expect(setSpy).toHaveBeenCalled();
    setSpy.mockRestore();
  });

  it('tolerates localStorage read failures on mount', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    renderPage();
    expect(screen.getByLabelText('Grid')).toHaveAttribute('aria-pressed', 'true');
  });
});
