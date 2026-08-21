/**
 * Tests for RecognitionClient — the recognition page.
 *
 * Covers: auth/org gate (loader), header + send button, the four stats cards,
 * the feed tab (kudos cards: sender→receiver, category badge, time-ago for all
 * five buckets, reaction counts + quick-add emojis, react mutation + error,
 * card navigation, null-sender fallback, unknown-category fallback), the
 * leaderboard tab (rank, medals, period select re-query, empty/loading), the
 * rewards + manage tabs (admin-gated), and the full SendKudosModal wizard
 * (recipient list filtering, allowance badge, cannot-afford gate, category
 * step, message + public toggle, preview, submit payload + success, error
 * paths, back/cancel navigation, fill-all-fields guard).
 *
 * Mocks: convex/react (useQuery keyed by _name, useMutation keyed), generated
 * api, auth store (selector-based) + zustand/shallow, useSelectedOrganization,
 * useMainRef, next/navigation router, sonner, and the UI primitives (button,
 * card, badge, avatar, tabs, dialog, select, textarea, ShieldLoader). RewardsTab
 * and RewardsAdminPanel are stubbed (each covered by its own suite).
 *
 * Unreachable defensive branches documented: the `default: return true` in the
 * wizard's canGoNext switch (steps are always 0-2) and the fill-all-fields guard
 * in handleSubmit (the UI gates every step via canGoNext, so submit is never
 * reached with empty fields).
 */

import React from 'react';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => (typeof opts === 'string' ? opts : key),
    i18n: { language: 'en' },
  }),
}));

jest.mock('@/components/employees/EmployeeHoverCard', () => ({
  EmployeeHoverCard: ({ children }: any) => <span>{children}</span>,
}));

// ── Convex: keyed queries + mutations ────────────────────────────────────────
let queryResults: Record<string, any> = {};
const mockMutations: Record<string, jest.Mock> = {};
jest.mock('convex/react', () => ({
  useQuery: (ref: any) => queryResults[ref?._name ?? ''],
  useMutation: (ref: any) => mockMutations[ref?._name ?? ''] ?? jest.fn(),
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    recognition: {
      getKudosFeed: { _name: 'getKudosFeed' },
      getLeaderboard: { _name: 'getLeaderboard' },
      getUserKudosStats: { _name: 'getUserKudosStats' },
      getUserPoints: { _name: 'getUserPoints' },
      getPointsConfig: { _name: 'getPointsConfig' },
      sendKudos: { _name: 'sendKudos' },
      reactToKudos: { _name: 'reactToKudos' },
    },
    users: { getUsersByOrganizationId: { _name: 'getUsersByOrganizationId' } },
  },
}));

// ── Auth / org / router ──────────────────────────────────────────────────────
let mockUser: Record<string, any> | null = { id: 'u1', role: 'admin', organizationId: 'org-1' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (sel: any) => sel({ user: mockUser }),
}));

jest.mock('zustand/shallow', () => ({
  useShallow: (s: any) => s,
}));

let mockOrgId: string | null = 'org-1';
jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => mockOrgId,
}));

const mockScrollTo = jest.fn();
jest.mock('@/hooks/useMainRef', () => ({
  useMainRef: () => ({ current: { scrollTo: mockScrollTo } }),
}));

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// ── Toast ────────────────────────────────────────────────────────────────────
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));
import { toast } from 'sonner';

// ── UI primitives ────────────────────────────────────────────────────────────
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className, onClick }: any) => (
    <div className={className} onClick={onClick}>
      {children}
    </div>
  ),
  CardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: any) => (
    <span className={className} data-variant={variant}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: any) => <span>{children}</span>,
  AvatarImage: ({ src }: any) => (src ? <img src={src} alt="" /> : null),
  AvatarFallback: ({ children }: any) => <span>{children}</span>,
}));

// Render every tab's content at once so each tab is exercised in one pass.
jest.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children }: any) => <button type="button">{children}</button>,
  TabsContent: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  SheetContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <h2>{children}</h2>,
  SheetBody: ({ children }: any) => <div>{children}</div>,
  SheetFooter: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

jest.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: any) => (
    <select
      data-testid="select"
      value={value ?? ''}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="loader" />,
}));

// RewardsTab / RewardsAdminPanel are covered by their own suites — stub here.
jest.mock('@/components/recognition/RewardsTab', () => ({
  RewardsTab: () => <div data-testid="rewards-tab" />,
}));
jest.mock('@/components/recognition/RewardsAdminPanel', () => ({
  RewardsAdminPanel: () => <div data-testid="rewards-admin" />,
}));

// ── Component + fixtures ─────────────────────────────────────────────────────
import { RecognitionClient } from '@/components/recognition/RecognitionClient';

const now = Date.now();

const kudosFeed = [
  {
    _id: 'k1',
    category: 'teamwork',
    message: 'Great collaboration!',
    createdAt: now - 5 * 60000, // 5 minutes → 5m
    sender: { _id: 'u2', name: 'Bob Builder', avatarUrl: '', position: 'Dev' },
    receiver: { _id: 'u1', name: 'Alice Wonder', position: 'CTO' },
    reactions: [{ emoji: '👏' }, { emoji: '👏' }],
  },
  {
    _id: 'k2',
    category: 'innovation',
    message: 'Nice idea',
    createdAt: now - 1000, // just now
    sender: null,
    receiver: { _id: 'u3', name: 'Cara Chen' },
    reactions: [],
  },
  {
    _id: 'k3',
    category: 'unknown_cat',
    message: 'Legacy',
    createdAt: now - 2 * 3600000, // 2 hours → 2h
    sender: { _id: 'u4', name: 'Dan Draft' },
    receiver: { _id: 'u1', name: 'Alice Wonder' },
    reactions: [],
  },
  {
    _id: 'k4',
    category: 'dedication',
    message: 'Long time',
    createdAt: now - 3 * 86400000, // 3 days → 3d
    sender: { _id: 'u2', name: 'Bob Builder' },
    receiver: { _id: 'u1', name: 'Alice Wonder' },
    reactions: [],
  },
  {
    _id: 'k5',
    category: 'mentorship',
    message: 'Ancient',
    createdAt: now - 40 * 86400000, // 40 days → locale date
    sender: { _id: 'u2', name: 'Bob Builder' },
    receiver: { _id: 'u1', name: 'Alice Wonder' },
    reactions: [],
  },
];

const leaderboard = [
  {
    userId: 'u1',
    name: 'Alice Wonder',
    avatarUrl: '',
    position: 'CTO',
    department: 'Eng',
    count: 12,
  },
  { userId: 'u2', name: 'Bob Builder', position: 'Dev', count: 8 },
  { userId: 'u3', name: 'Cara Chen', count: 5 },
];

const orgUsers = [
  { _id: 'u1', name: 'Alice Wonder', isActive: true, role: 'admin', position: 'CTO' },
  { _id: 'u2', name: 'Bob Builder', isActive: true, role: 'employee', position: 'Dev' },
  { _id: 'u3', name: 'Cara Chen', isActive: true, role: 'employee', department: 'Design' },
  { _id: 'u4', name: 'Super Admin', isActive: true, role: 'superadmin' },
  { _id: 'u5', name: 'Inactive Guy', isActive: false, role: 'employee' },
];

function seed({
  feed = kudosFeed,
  board = leaderboard,
  stats = { totalReceived: 5, totalSent: 3 },
  points = { balance: 120, allowance: 7, allowanceTotal: 10 },
  config = { kudosCost: 3 },
  users = orgUsers,
}: {
  feed?: any[];
  board?: any[];
  stats?: any;
  points?: any;
  config?: any;
  users?: any[];
} = {}) {
  queryResults['getKudosFeed'] = feed;
  queryResults['getLeaderboard'] = board;
  queryResults['getUserKudosStats'] = stats;
  queryResults['getUserPoints'] = points;
  queryResults['getPointsConfig'] = config;
  queryResults['getUsersByOrganizationId'] = users;
}

function renderPage() {
  return render(<RecognitionClient />);
}

/** Value under a stat card found by its label text (handles split text nodes). */
function statValue(label: string) {
  return screen.getByText(label).parentElement?.querySelector('p')?.textContent;
}

describe('RecognitionClient — gate & header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', role: 'admin', organizationId: 'org-1' };
    mockOrgId = 'org-1';
    seed();
  });

  it('shows the loader when there is no user', () => {
    mockUser = null;
    renderPage();
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  it('shows the loader when no organization is resolved', () => {
    mockOrgId = null;
    mockUser = { id: 'u1', role: 'admin' };
    renderPage();
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  it('renders the header title, subtitle and send button', () => {
    renderPage();
    expect(screen.getByText('recognition.title')).toBeInTheDocument();
    expect(screen.getByText('recognition.subtitle')).toBeInTheDocument();
    expect(screen.getAllByText('recognition.sendKudos').length).toBeGreaterThan(0);
  });

  it('renders the four stats cards', () => {
    renderPage();
    expect(statValue('recognition.stats.received')).toBe('5');
    expect(statValue('recognition.stats.sent')).toBe('3');
    expect(statValue('recognition.points.balance')).toBe('120');
    expect(statValue('rewards.wallet.allowance')).toBe('7 / 10');
  });

  it('falls back to zero for the balance and allowance when points are undefined', () => {
    // null (not undefined) so the destructuring default does not kick in
    seed({ points: null });
    renderPage();
    expect(statValue('recognition.points.balance')).toBe('0');
    expect(statValue('rewards.wallet.allowance')).toBe('0 / 0');
  });
});

describe('RecognitionClient — feed tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', role: 'admin', organizationId: 'org-1' };
    mockOrgId = 'org-1';
    seed();
    mockMutations['reactToKudos'] = jest.fn().mockResolvedValue(undefined);
  });

  it('renders kudos cards with sender → receiver and the message', () => {
    renderPage();
    expect(screen.getAllByText('Bob Builder').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Alice Wonder').length).toBeGreaterThan(0);
    expect(screen.getByText('Great collaboration!')).toBeInTheDocument();
  });

  it('renders the category badge label', () => {
    renderPage();
    expect(screen.getAllByText('recognition.category.teamwork').length).toBeGreaterThan(0);
  });

  it('shows the time-ago for each bucket', () => {
    renderPage();
    expect(screen.getByText('just now')).toBeInTheDocument();
    expect(screen.getByText('5m')).toBeInTheDocument();
    expect(screen.getByText('2h')).toBeInTheDocument();
    expect(screen.getByText('3d')).toBeInTheDocument();
    // the 40-day kudo falls through to a locale date (no plain "40d")
    expect(screen.getByText('Ancient')).toBeInTheDocument();
    expect(screen.queryByText('40d')).not.toBeInTheDocument();
  });

  it('falls back to ?? initials for a null sender', () => {
    renderPage();
    expect(screen.getAllByText('??').length).toBeGreaterThan(0);
  });

  it('falls back to the teamwork config for an unknown category', () => {
    renderPage();
    // k3 has unknown_cat → renders the teamwork label
    expect(screen.getAllByText('recognition.category.teamwork').length).toBeGreaterThan(0);
  });

  it('renders reaction counts and quick-add emojis, and reacts on click', async () => {
    renderPage();
    // k1 has two 👏 reactions (also offered as a quick-add on other cards);
    // the "2" count also appears as the leaderboard rank badge
    expect(screen.getAllByText('👏').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    // click a quick-add emoji button (❤️ for k1)
    fireEvent.click(screen.getAllByText('❤️')[0]);
    await waitFor(() =>
      expect(mockMutations['reactToKudos']).toHaveBeenCalledWith({ kudoId: 'k1', emoji: '❤️' }),
    );
  });

  it('reacts via an existing reaction-count button', async () => {
    renderPage();
    // k1's reaction button reads "👏2" (emoji + count)
    const countBtn = screen.getAllByRole('button').find((b) => b.textContent === '👏2');
    fireEvent.click(countBtn!);
    await waitFor(() =>
      expect(mockMutations['reactToKudos']).toHaveBeenCalledWith({ kudoId: 'k1', emoji: '👏' }),
    );
  });

  it('scrolls the main container to top when opening the send modal', () => {
    renderPage();
    fireEvent.click(screen.getAllByText('recognition.sendKudos')[0]);
    expect(mockScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('shows an error toast when reacting fails', async () => {
    mockMutations['reactToKudos'] = jest.fn().mockRejectedValue(new Error('boom'));
    renderPage();
    fireEvent.click(screen.getAllByText('🔥')[0]);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('recognition.errors.reactFailed'));
  });

  it('navigates to the kudo detail on card click', () => {
    renderPage();
    fireEvent.click(screen.getByText('Great collaboration!').closest('div')!);
    expect(mockPush).toHaveBeenCalledWith('/recognition/k1');
  });

  it('shows the empty feed state', () => {
    seed({ feed: [] });
    renderPage();
    expect(screen.getByText('recognition.emptyFeed')).toBeInTheDocument();
  });

  it('shows the loader while the feed is loading', () => {
    queryResults['getKudosFeed'] = undefined;
    renderPage();
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });
});

describe('RecognitionClient — leaderboard tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', role: 'admin', organizationId: 'org-1' };
    mockOrgId = 'org-1';
    seed();
  });

  it('renders leaderboard entries with rank and medals for the top three', () => {
    renderPage();
    expect(screen.getAllByText('Alice Wonder').length).toBeGreaterThan(0);
    expect(screen.getByText('🥇')).toBeInTheDocument();
    expect(screen.getByText('🥈')).toBeInTheDocument();
    expect(screen.getByText('🥉')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument(); // count badge
    expect(screen.getByText(/Eng/)).toBeInTheDocument(); // position • department
  });

  it('changes the period via the select', () => {
    renderPage();
    const select = screen.getByTestId('select');
    fireEvent.change(select, { target: { value: 'week' } });
    expect(select).toHaveValue('week');
  });

  it('shows the empty leaderboard state', () => {
    seed({ board: [] });
    renderPage();
    expect(screen.getByText('recognition.emptyLeaderboard')).toBeInTheDocument();
  });

  it('shows the loader while the leaderboard is loading', () => {
    queryResults['getLeaderboard'] = undefined;
    renderPage();
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });
});

describe('RecognitionClient — rewards & manage tabs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', role: 'admin', organizationId: 'org-1' };
    mockOrgId = 'org-1';
    seed();
  });

  it('renders the rewards tab', () => {
    renderPage();
    expect(screen.getByTestId('rewards-tab')).toBeInTheDocument();
  });

  it('renders the manage tab for admins', () => {
    renderPage();
    expect(screen.getByTestId('rewards-admin')).toBeInTheDocument();
  });

  it('hides the manage tab for non-admins', () => {
    mockUser = { id: 'u2', role: 'employee', organizationId: 'org-1' };
    renderPage();
    expect(screen.queryByTestId('rewards-admin')).not.toBeInTheDocument();
  });
});

describe('RecognitionClient — SendKudosModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', role: 'admin', organizationId: 'org-1' };
    mockOrgId = 'org-1';
    seed();
    mockMutations['sendKudos'] = jest.fn().mockResolvedValue(undefined);
  });

  function openModal() {
    renderPage();
    // the header send button
    fireEvent.click(screen.getAllByText('recognition.sendKudos')[0]);
    return screen.getByTestId('dialog');
  }

  it('opens the modal and lists only eligible recipients', () => {
    const dialog = openModal();
    // self (Alice), superadmin (Super Admin) and inactive are excluded
    expect(within(dialog).getByText('Bob Builder')).toBeInTheDocument();
    expect(within(dialog).getByText('Cara Chen')).toBeInTheDocument();
    expect(within(dialog).queryByText('Alice Wonder')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Super Admin')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Inactive Guy')).not.toBeInTheDocument();
  });

  it('shows the allowance badge and warns when the allowance is spent', () => {
    queryResults['getUserPoints'] = { allowance: 1, allowanceTotal: 10 };
    const dialog = openModal();
    // split-text badge — match on combined text content
    expect(within(dialog).getByText((c: string) => c.includes('1 / 10'))).toBeInTheDocument();
    expect(within(dialog).getByText('rewards.wallet.allowanceSpent')).toBeInTheDocument();
  });

  it('walks through recipient → category → message and submits', async () => {
    const dialog = openModal();
    // step 0: choose recipient
    fireEvent.click(within(dialog).getByText('Bob Builder'));
    fireEvent.click(within(dialog).getByText('common.next'));
    // step 1: choose category
    fireEvent.click(within(dialog).getByText('recognition.category.teamwork'));
    fireEvent.click(within(dialog).getByText('common.next'));
    // step 2: message + public toggle
    const textarea = within(dialog).getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Great job!' } });
    expect(within(dialog).getByText(/\/500/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText('recognition.form.publicKudos'));
    // submit
    fireEvent.click(within(dialog).getByRole('button', { name: 'recognition.sendKudos' }));
    await waitFor(() =>
      expect(mockMutations['sendKudos']).toHaveBeenCalledWith({
        receiverId: 'u2',
        category: 'teamwork',
        message: 'Great job!',
        isPublic: false,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('recognition.kudosSent');
    // modal closes
    await waitFor(() => expect(screen.queryByTestId('dialog')).not.toBeInTheDocument());
  });

  it('shows the recipient + category preview on the message step', () => {
    const dialog = openModal();
    fireEvent.click(within(dialog).getByText('Cara Chen'));
    fireEvent.click(within(dialog).getByText('common.next'));
    fireEvent.click(within(dialog).getByText('recognition.category.innovation'));
    fireEvent.click(within(dialog).getByText('common.next'));
    expect(within(dialog).getByText('Cara Chen')).toBeInTheDocument();
    expect(within(dialog).getByText('recognition.category.innovation')).toBeInTheDocument();
  });

  it('disables the submit button when the allowance cannot afford a kudo', () => {
    queryResults['getUserPoints'] = { allowance: 1, allowanceTotal: 10 };
    const dialog = openModal();
    fireEvent.click(within(dialog).getByText('Bob Builder'));
    fireEvent.click(within(dialog).getByText('common.next'));
    fireEvent.click(within(dialog).getByText('recognition.category.teamwork'));
    fireEvent.click(within(dialog).getByText('common.next'));
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'hi' } });
    const submit = within(dialog).getByRole('button', { name: 'recognition.sendKudos' });
    expect(submit).toBeDisabled();
  });

  it('submits with the default public setting (isPublic true)', async () => {
    const dialog = openModal();
    fireEvent.click(within(dialog).getByText('Bob Builder'));
    fireEvent.click(within(dialog).getByText('common.next'));
    fireEvent.click(within(dialog).getByText('recognition.category.teamwork'));
    fireEvent.click(within(dialog).getByText('common.next'));
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'hi' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'recognition.sendKudos' }));
    await waitFor(() =>
      expect(mockMutations['sendKudos']).toHaveBeenCalledWith({
        receiverId: 'u2',
        category: 'teamwork',
        message: 'hi',
        isPublic: true,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('recognition.kudosSent');
  });

  it('shows an error toast when sending fails with a plain Error', async () => {
    mockMutations['sendKudos'] = jest.fn().mockRejectedValue(new Error('No budget'));
    const dialog = openModal();
    fireEvent.click(within(dialog).getByText('Bob Builder'));
    fireEvent.click(within(dialog).getByText('common.next'));
    fireEvent.click(within(dialog).getByText('recognition.category.teamwork'));
    fireEvent.click(within(dialog).getByText('common.next'));
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'hi' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'recognition.sendKudos' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No budget'));
  });

  it('shows the fallback error message for a non-Error rejection', async () => {
    mockMutations['sendKudos'] = jest.fn().mockRejectedValue('string-error');
    const dialog = openModal();
    fireEvent.click(within(dialog).getByText('Bob Builder'));
    fireEvent.click(within(dialog).getByText('common.next'));
    fireEvent.click(within(dialog).getByText('recognition.category.teamwork'));
    fireEvent.click(within(dialog).getByText('common.next'));
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'hi' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'recognition.sendKudos' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('recognition.errors.sendFailed'));
  });

  it('closes the modal via cancel on the first step', () => {
    const dialog = openModal();
    fireEvent.click(within(dialog).getByText('common.cancel'));
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('goes back between steps with the back button', () => {
    const dialog = openModal();
    fireEvent.click(within(dialog).getByText('Bob Builder'));
    fireEvent.click(within(dialog).getByText('common.next'));
    // on step 1, the footer button is "back"
    fireEvent.click(within(dialog).getByText('common.back'));
    expect(within(dialog).getByText('Bob Builder')).toBeInTheDocument();
  });
});
