/**
 * Tests for NewsClient — the news feed page: skeleton / empty / full states,
 * search + category filters, featured (pinned/urgent) cards, regular post
 * cards, the pin/delete menu, the reactions picker and the comment thread.
 *
 * Mocks: convex-typed (queries + mutations), api refs, auth store, selected
 * org, sonner, NewsComposer/NewsScheduleManager, MarkdownMessage, cssMotion
 * and the UI primitives.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';

let mockLanguage: string | undefined = 'en';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string }) =>
      typeof fallback === 'string' ? fallback : key,
    i18n: { language: mockLanguage },
  }),
}));

let queryResults: Record<string, unknown> = {};
const queryCalls: Array<{ name?: string; args: any }> = [];
const mutationCalls: Array<{ name?: string; args: any[] }> = [];
const mutationResults: Record<string, unknown> = {};

jest.mock('@/lib/convex-typed', () => ({
  useQuery: (ref: { _name?: string }, args: any) => {
    queryCalls.push({ name: ref?._name, args });
    return queryResults[ref?._name ?? ''];
  },
  useMutation:
    (ref: { _name?: string }) =>
    (...args: any[]) => {
      mutationCalls.push({ name: ref?._name, args });
      const result = mutationResults[ref?._name ?? ''];
      if (result instanceof Error) return Promise.reject(result);
      // Strings reject with the plain value so the components' `error instanceof
      // Error ? error.message : t('common.error')` fallback branch is exercised.
      if (typeof result === 'string') return Promise.reject(result);
      return Promise.resolve(result);
    },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    news: {
      getNewsFeed: { _name: 'getNewsFeed' },
      getNewsStats: { _name: 'getNewsStats' },
      togglePinAnnouncement: { _name: 'togglePinAnnouncement' },
      deleteAnnouncement: { _name: 'deleteAnnouncement' },
      addReaction: { _name: 'addReaction' },
      addComment: { _name: 'addComment' },
      incrementViewCount: { _name: 'incrementViewCount' },
    },
  },
}));

let mockUser: { role: string; organizationId?: string } | null = {
  role: 'admin',
  organizationId: 'org-1',
};
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector?: any) => (selector ? selector({ user: mockUser }) : { user: mockUser }),
}));

let mockSelectedOrg: string | undefined = 'org-1';
jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => mockSelectedOrg,
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('@/components/MarkdownMessage', () => ({
  MarkdownMessage: ({ content }: any) => <span data-testid="markdown">{content}</span>,
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: { div: ({ children, ...props }: any) => <div {...props}>{children}</div> },
}));

jest.mock('@/components/news/NewsComposer', () => ({
  NewsComposer: ({ open, onClose, organizationId }: any) => (
    <div data-testid="news-composer" data-open={open} data-org={organizationId}>
      <button type="button" onClick={onClose}>
        close-composer
      </button>
    </div>
  ),
}));

jest.mock('@/components/news/NewsScheduleManager', () => ({
  NewsScheduleManager: ({ open, onClose, organizationId }: any) => (
    <div data-testid="news-scheduler" data-open={open} data-org={organizationId}>
      <button type="button" onClick={onClose}>
        close-scheduler
      </button>
    </div>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, variant, ...p }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
      data-variant={variant}
      {...p}
    >
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: any) => <span data-testid="avatar">{children}</span>,
  AvatarFallback: ({ children }: any) => <span>{children}</span>,
  AvatarImage: ({ src }: any) => (src ? <img src={src} alt="" /> : null),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...p }: any) => (
    <span data-testid="badge" {...p}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, ...p }: any) => (
    <div data-testid="card" {...p}>
      {children}
    </div>
  ),
  CardContent: ({ children, ...p }: any) => <div {...p}>{children}</div>,
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonText: () => <div />,
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

import NewsClient from '@/components/news/NewsClient';

// ── Fixtures ────────────────────────────────────────────────────────────────

function makePost(overrides: Record<string, any> = {}) {
  return {
    _id: 'ann_1',
    title: 'Company lunch',
    content: 'We are having lunch at noon in the canteen.',
    category: 'announcement',
    isPinned: false,
    isUrgent: false,
    imageUrl: undefined,
    tags: ['hr'],
    targetDepartment: undefined,
    targetRoles: undefined,
    publishedAt: Date.now() - 60_000,
    viewCount: 12,
    authorName: 'Alice Admin',
    authorAvatar: undefined,
    authorRole: 'admin',
    reactionsByEmoji: [{ emoji: '👍', users: [{ userId: 'u1', userName: 'Bob' }] }],
    comments: [],
    totalComments: 0,
    isUnread: true,
    myReactions: ['👍'],
    canManage: true,
    ...overrides,
  };
}

const defaultStats = {
  unreadCount: 2,
  active: 3,
  byCategory: { announcement: 1, event: 2 },
};

beforeEach(() => {
  jest.clearAllMocks();
  queryResults = {};
  queryCalls.length = 0;
  mutationCalls.length = 0;
  for (const key of Object.keys(mutationResults)) delete mutationResults[key];
  mockUser = { role: 'admin', organizationId: 'org-1' };
  mockSelectedOrg = 'org-1';
  mockLanguage = 'en';
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── Feed states ─────────────────────────────────────────────────────────────

describe('NewsClient feed states', () => {
  it('renders the feed skeleton when not signed in', () => {
    mockUser = null;
    render(<NewsClient />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByText('news.title')).toBeNull();
  });

  it('renders the feed skeleton when no organization is selected', () => {
    mockSelectedOrg = undefined;
    mockUser = { role: 'admin', organizationId: undefined };
    render(<NewsClient />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('renders the feed skeleton while the feed is loading', () => {
    queryResults.getNewsFeed = undefined;
    render(<NewsClient />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('renders the header, unread badge and subtitle', () => {
    queryResults.getNewsFeed = [makePost()];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    expect(screen.getByText('news.title')).toBeTruthy();
    expect(screen.getByText('news.unreadBadge')).toBeTruthy();
    expect(screen.getByText('news.subtitle')).toBeTruthy();
  });

  it('renders featured and regular posts in separate sections', () => {
    queryResults.getNewsFeed = [
      makePost({ _id: 'a', title: 'Pinned news', isPinned: true }),
      makePost({ _id: 'b', title: 'Company lunch' }),
    ];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    expect(screen.getByText('news.featured')).toBeTruthy();
    expect(screen.getByText('news.latest')).toBeTruthy();
    expect(screen.getAllByText('Pinned news').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Company lunch').length).toBeGreaterThan(0);
  });

  it('hides the latest section label when nothing is featured', () => {
    queryResults.getNewsFeed = [makePost({ _id: 'b', title: 'Company lunch' })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    expect(screen.queryByText('news.featured')).toBeNull();
    expect(screen.queryByText('news.latest')).toBeNull();
  });

  it('uses the localized title from titleI18n when present', () => {
    queryResults.getNewsFeed = [
      makePost({ _id: 'a', title: 'Fallback title', titleI18n: { en: 'Translated title' } }),
    ];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    expect(screen.getByText('Translated title')).toBeTruthy();
    expect(screen.queryByText('Fallback title')).toBeNull();
  });

  it('falls back to English when i18n reports no language', () => {
    mockLanguage = undefined;
    queryResults.getNewsFeed = [
      makePost({ _id: 'a', title: 'Fallback title', titleI18n: { en: 'English copy' } }),
    ];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    expect(screen.getByText('English copy')).toBeTruthy();
  });
});

// ── Search ──────────────────────────────────────────────────────────────────

describe('NewsClient search', () => {
  it('filters posts by title', () => {
    queryResults.getNewsFeed = [
      makePost({ _id: 'a', title: 'Company lunch', content: 'Menu for today.' }),
      makePost({ _id: 'b', title: 'Q4 report', content: 'Financial summary for the quarter.' }),
    ];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.change(screen.getByLabelText('news.searchPlaceholder'), {
      target: { value: 'lunch' },
    });
    expect(screen.getByText('Company lunch')).toBeTruthy();
    expect(screen.queryByText('Q4 report')).toBeNull();
  });

  it('filters posts by author name', () => {
    queryResults.getNewsFeed = [
      makePost({ _id: 'a', title: 'Company lunch', content: 'Menu for today.' }),
      makePost({ _id: 'b', title: 'Q4 report', authorName: 'Zoe Z', content: 'Numbers.' }),
    ];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.change(screen.getByLabelText('news.searchPlaceholder'), {
      target: { value: 'zoe' },
    });
    expect(screen.getByText('Q4 report')).toBeTruthy();
    expect(screen.queryByText('Company lunch')).toBeNull();
  });

  it('shows the no-matches empty state while searching', () => {
    queryResults.getNewsFeed = [makePost()];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.change(screen.getByLabelText('news.searchPlaceholder'), {
      target: { value: 'nothing matches' },
    });
    expect(screen.getByText('news.noMatches')).toBeTruthy();
    expect(screen.getByText('news.noMatchesHint')).toBeTruthy();
    // The create-first button is hidden while searching.
    expect(screen.queryByText('news.createFirst')).toBeNull();
  });
});

// ── Empty state ─────────────────────────────────────────────────────────────

describe('NewsClient empty state', () => {
  it('offers the create-first action to publishers', () => {
    queryResults.getNewsFeed = [];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    expect(screen.getByText('news.emptyFeed')).toBeTruthy();
    expect(screen.getByText('news.createFirst')).toBeTruthy();
  });

  it('hides the create-first action for employees', () => {
    mockUser = { role: 'employee', organizationId: 'org-1' };
    queryResults.getNewsFeed = [];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    expect(screen.getByText('news.emptyFeed')).toBeTruthy();
    expect(screen.queryByText('news.createFirst')).toBeNull();
  });

  it('opens the composer from the empty state', () => {
    queryResults.getNewsFeed = [];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.click(screen.getByText('news.createFirst'));
    const composer = screen.getByTestId('news-composer');
    expect(composer.getAttribute('data-open')).toBe('true');
    expect(composer.getAttribute('data-org')).toBe('org-1');
  });
});

// ── Header actions ──────────────────────────────────────────────────────────

describe('NewsClient header actions', () => {
  it('shows schedule and publish buttons for admins', () => {
    queryResults.getNewsFeed = [makePost()];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    expect(screen.getByText('news.schedule.open')).toBeTruthy();
    expect(screen.getByText('news.compose.publish')).toBeTruthy();
  });

  it('hides schedule and publish buttons for employees', () => {
    mockUser = { role: 'employee', organizationId: 'org-1' };
    queryResults.getNewsFeed = [makePost()];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    expect(screen.queryByText('news.schedule.open')).toBeNull();
    expect(screen.queryByText('news.compose.publish')).toBeNull();
  });

  it('opens and closes the schedule manager', () => {
    queryResults.getNewsFeed = [makePost()];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.click(screen.getByText('news.schedule.open'));
    expect(screen.getByTestId('news-scheduler').getAttribute('data-open')).toBe('true');
    fireEvent.click(screen.getByText('close-scheduler'));
    expect(screen.queryByTestId('news-scheduler')).toBeNull();
  });

  it('opens and closes the composer from the header', () => {
    queryResults.getNewsFeed = [makePost()];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.click(screen.getByText('news.compose.publish'));
    expect(screen.getByTestId('news-composer').getAttribute('data-open')).toBe('true');
    fireEvent.click(screen.getByText('close-composer'));
    expect(screen.queryByTestId('news-composer')).toBeNull();
  });
});

// ── Category chips ──────────────────────────────────────────────────────────

describe('NewsClient category chips', () => {
  it('renders only categories with counts and filters the feed on click', () => {
    queryResults.getNewsFeed = [makePost()];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    // The category label appears twice: on the filter chip and on the post badge.
    expect(screen.getAllByText('news.category.announcement').length).toBeGreaterThan(0);
    // Event has a count but no post with that category → exactly one chip element.
    expect(screen.getByText('news.category.event')).toBeTruthy();
    // No count → hidden.
    expect(screen.queryByText('news.category.policy')).toBeNull();

    fireEvent.click(screen.getByText('news.category.event'));
    const chip = screen.getByText('news.category.event').closest('button');
    expect(chip?.getAttribute('aria-pressed')).toBe('true');
    const lastFeedCall = queryCalls.filter((c) => c.name === 'getNewsFeed').slice(-1)[0];
    expect(lastFeedCall?.args.category).toBe('event');
  });

  it('shows a count badge on chips with posts', () => {
    queryResults.getNewsFeed = [makePost()];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    expect(screen.getByText('news.allCategories')).toBeTruthy();
    // 'all' chip shows the active count; event chip shows its own count.
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('hides the active category chip once its count drops to zero but keeps the selection', () => {
    queryResults.getNewsFeed = [makePost()];
    queryResults.getNewsStats = { ...defaultStats, byCategory: { announcement: 1, event: 0 } };
    render(<NewsClient />);
    expect(screen.queryByText('news.category.event')).toBeNull();
  });

  it('resets the filter when the all chip is clicked', () => {
    queryResults.getNewsFeed = [makePost()];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.click(screen.getByText('news.category.event'));
    fireEvent.click(screen.getByText('news.allCategories'));
    const lastFeedCall = queryCalls.filter((c) => c.name === 'getNewsFeed').slice(-1)[0];
    expect(lastFeedCall?.args.category).toBeUndefined();
  });
});

// ── Featured cards ──────────────────────────────────────────────────────────

describe('NewsClient featured cards', () => {
  it('shows urgent, pinned, category and audience badges plus the new dot', () => {
    queryResults.getNewsFeed = [
      makePost({
        _id: 'a',
        isUrgent: true,
        isPinned: true,
        targetDepartment: 'dep_1' as any,
      }),
    ];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    const card = screen.getAllByTestId('card')[0];
    expect(within(card).getByText('news.urgent')).toBeTruthy();
    expect(within(card).getByText('news.pinned')).toBeTruthy();
    expect(within(card).getByText('news.category.announcement')).toBeTruthy();
    expect(within(card).getByText('news.targeted')).toBeTruthy();
    expect(within(card).getByText('news.new')).toBeTruthy();
  });

  it('expands to reveal the body, reactions and comments, then collapses', () => {
    queryResults.getNewsFeed = [makePost({ _id: 'a', isPinned: true })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    const card = screen.getAllByTestId('card')[0];
    fireEvent.click(within(card).getByText('news.readMore'));
    expect(within(card).getByTestId('markdown')).toBeTruthy();
    expect(within(card).getByTitle('Bob')).toBeTruthy();
    expect(within(card).getByText('news.beFirstToComment')).toBeTruthy();
    fireEvent.click(within(card).getByText('news.collapse'));
    expect(within(card).queryByTestId('markdown')).toBeNull();
  });

  it('uses the secondary variant for the read-more button on image posts', () => {
    queryResults.getNewsFeed = [
      makePost({ _id: 'a', isPinned: true, imageUrl: 'https://cdn.example.com/pic.jpg' }),
    ];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    const card = screen.getAllByTestId('card')[0];
    const readMore = within(card).getByText('news.readMore');
    expect(readMore.closest('button')?.getAttribute('data-variant')).toBe('secondary');
  });

  it('uses the outline variant for the read-more button on plain posts', () => {
    queryResults.getNewsFeed = [makePost({ _id: 'a', isPinned: true })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    const card = screen.getAllByTestId('card')[0];
    const readMore = within(card).getByText('news.readMore');
    expect(readMore.closest('button')?.getAttribute('data-variant')).toBe('outline');
  });

  it('renders a featured post without pinned or new badges when only urgent', () => {
    queryResults.getNewsFeed = [
      makePost({ _id: 'a', isUrgent: true, isPinned: false, isUnread: false }),
    ];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    const card = screen.getAllByTestId('card')[0];
    expect(within(card).getByText('news.urgent')).toBeTruthy();
    expect(within(card).queryByText('news.pinned')).toBeNull();
    expect(within(card).queryByText('news.new')).toBeNull();
  });

  it('falls back to the general category config for an unknown category', () => {
    queryResults.getNewsFeed = [makePost({ _id: 'a', category: 'nonsense' })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    expect(screen.getByText('news.category.general')).toBeTruthy();
  });

  it('falls back to the general category config on a featured card', () => {
    queryResults.getNewsFeed = [makePost({ _id: 'a', isPinned: true, category: 'nonsense' })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    const card = screen.getAllByTestId('card')[0];
    expect(within(card).getByText('news.category.general')).toBeTruthy();
  });

  it('omits the role suffix when the author has no role', () => {
    queryResults.getNewsFeed = [makePost({ _id: 'a', authorRole: undefined })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    expect(screen.getByText('Alice Admin')).toBeTruthy();
    expect(screen.queryByText(/· admin/)).toBeNull();
  });
});

// ── Regular post cards ──────────────────────────────────────────────────────

describe('NewsClient post cards', () => {
  it('renders an image when the post has one', () => {
    queryResults.getNewsFeed = [makePost({ imageUrl: 'https://cdn.example.com/pic.jpg' })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    expect(screen.getByRole('img')).toBeTruthy();
  });

  it('expands and collapses long posts', () => {
    const long = 'x'.repeat(500);
    queryResults.getNewsFeed = [makePost({ content: long })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    const card = screen.getAllByTestId('card')[0];
    fireEvent.click(within(card).getByText('news.readMore'));
    expect(within(card).getByText('news.collapse')).toBeTruthy();
    fireEvent.click(within(card).getByText('news.collapse'));
    expect(within(card).getByText('news.readMore')).toBeTruthy();
  });

  it('does not offer read-more for short posts', () => {
    queryResults.getNewsFeed = [makePost({ content: 'Short.' })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    const card = screen.getAllByTestId('card')[0];
    expect(within(card).queryByText('news.readMore')).toBeNull();
  });

  it('renders tags and the unread marker', () => {
    queryResults.getNewsFeed = [makePost({ tags: ['hr', 'lunch', 'culture', 'extra'] })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    const card = screen.getAllByTestId('card')[0];
    expect(within(card).getByText('#hr')).toBeTruthy();
    expect(within(card).getByText('#lunch')).toBeTruthy();
    expect(within(card).getByText('#culture')).toBeTruthy();
    // Only the first three tags are rendered.
    expect(within(card).queryByText('#extra')).toBeNull();
    expect(within(card).getByLabelText('news.new')).toBeTruthy();
  });

  it('shows the author line with avatar initial and role', () => {
    queryResults.getNewsFeed = [makePost()];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    expect(screen.getByText('Alice Admin')).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy();
    // The role is rendered as part of "<relative time> · admin".
    expect(screen.getByText(/admin/)).toBeTruthy();
  });
});

// ── Pin / delete menu ───────────────────────────────────────────────────────

describe('NewsClient post menu', () => {
  it('pins regular posts via mutation and toasts', async () => {
    queryResults.getNewsFeed = [makePost({ _id: 'a' }), makePost({ _id: 'b' })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    const cards = screen.getAllByTestId('card');
    fireEvent.click(within(cards[0]).getByLabelText('news.pin'));
    fireEvent.click(within(cards[1]).getByLabelText('news.pin'));
    const pinCalls = mutationCalls.filter((c) => c.name === 'togglePinAnnouncement');
    expect(pinCalls.length).toBe(2);
    expect(pinCalls[0].args[0]).toEqual({ announcementId: 'a' });
    expect(pinCalls[1].args[0]).toEqual({ announcementId: 'b' });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledTimes(2);
    });
  });

  it('deletes a post when the confirm dialog is accepted', () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    queryResults.getNewsFeed = [makePost({ _id: 'a' })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.click(screen.getByLabelText('common.delete'));
    const delCalls = mutationCalls.filter((c) => c.name === 'deleteAnnouncement');
    expect(delCalls.length).toBe(1);
    expect(delCalls[0].args[0]).toEqual({ announcementId: 'a' });
  });

  it('skips deletion when the confirm dialog is dismissed', () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    queryResults.getNewsFeed = [makePost({ _id: 'a' })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.click(screen.getByLabelText('common.delete'));
    expect(mutationCalls.filter((c) => c.name === 'deleteAnnouncement').length).toBe(0);
  });

  it('hides the menu for readers without manage rights', () => {
    queryResults.getNewsFeed = [makePost({ canManage: false })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    expect(screen.queryByLabelText('news.pin')).toBeNull();
    expect(screen.queryByLabelText('common.delete')).toBeNull();
  });

  it('shows a toast with the error message when a menu mutation fails', async () => {
    mutationResults.togglePinAnnouncement = new Error('pin exploded');
    queryResults.getNewsFeed = [makePost({ _id: 'a' })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.click(screen.getByLabelText('news.pin'));
    await Promise.resolve();
    await Promise.resolve();
    expect(toast.error).toHaveBeenCalledWith('pin exploded');
  });

  it('falls back to the generic error toast for a plain-value mutation failure', async () => {
    mutationResults.togglePinAnnouncement = 'plain failure';
    queryResults.getNewsFeed = [makePost({ _id: 'a' })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.click(screen.getByLabelText('news.pin'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('common.error');
    });
  });
});

// ── Reactions ───────────────────────────────────────────────────────────────

describe('NewsClient reactions', () => {
  it('reacts when an existing reaction group is clicked', async () => {
    queryResults.getNewsFeed = [makePost({ _id: 'a' })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.click(screen.getByTitle('Bob'));
    await Promise.resolve();
    const calls = mutationCalls.filter((c) => c.name === 'addReaction');
    expect(calls.length).toBe(1);
    expect(calls[0].args[0]).toEqual({ announcementId: 'a', emoji: '👍' });
  });

  it('opens the picker and reacts with a fresh emoji', () => {
    queryResults.getNewsFeed = [makePost({ _id: 'a' })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.click(screen.getByLabelText('news.addReaction'));
    fireEvent.click(screen.getByLabelText('❤️'));
    const calls = mutationCalls.filter((c) => c.name === 'addReaction');
    expect(calls.length).toBe(1);
    expect(calls[0].args[0]).toEqual({ announcementId: 'a', emoji: '❤️' });
  });

  it('renders reaction groups the reader has not reacted to', () => {
    queryResults.getNewsFeed = [
      makePost({
        _id: 'a',
        reactionsByEmoji: [
          { emoji: '👍', users: [{ userId: 'u1', userName: 'Bob' }] },
          { emoji: '😮', users: [{ userId: 'u2', userName: 'Carol' }] },
        ],
        myReactions: ['👍'],
      }),
    ];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    expect(screen.getByTitle('Bob')).toBeTruthy();
    expect(screen.getByTitle('Carol')).toBeTruthy();
  });

  it('shows a toast when a reaction mutation fails', async () => {
    mutationResults.addReaction = new Error('reaction failed');
    queryResults.getNewsFeed = [makePost({ _id: 'a' })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.click(screen.getByTitle('Bob'));
    await Promise.resolve();
    await Promise.resolve();
    expect(toast.error).toHaveBeenCalledWith('reaction failed');
  });

  it('falls back to the generic error toast for a plain-value reaction failure', async () => {
    mutationResults.addReaction = 'plain failure';
    queryResults.getNewsFeed = [makePost({ _id: 'a' })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.click(screen.getByTitle('Bob'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('common.error');
    });
  });

  it('renders the view and comment counters', () => {
    queryResults.getNewsFeed = [makePost({ _id: 'a', viewCount: 42, totalComments: 3 })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    const card = screen.getAllByTestId('card')[0];
    expect(within(card).getByText('42')).toBeTruthy();
    expect(within(card).getByText('3')).toBeTruthy();
  });
});

// ── Comments ────────────────────────────────────────────────────────────────

describe('NewsClient comments', () => {
  it('shows the be-first state and the empty thread', () => {
    queryResults.getNewsFeed = [makePost({ _id: 'a' })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    const card = screen.getAllByTestId('card')[0];
    fireEvent.click(within(card).getByText('news.beFirstToComment'));
    expect(within(card).getByText('news.noComments')).toBeTruthy();
  });

  it('records the view when an unread thread is opened', () => {
    queryResults.getNewsFeed = [makePost({ _id: 'a', isUnread: true })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.click(screen.getByText('news.beFirstToComment'));
    const calls = mutationCalls.filter((c) => c.name === 'incrementViewCount');
    expect(calls.length).toBe(1);
    expect(calls[0].args[0]).toEqual({ announcementId: 'a' });
  });

  it('does not record the view for an already-read thread', () => {
    queryResults.getNewsFeed = [makePost({ _id: 'a', isUnread: false })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.click(screen.getByText('news.beFirstToComment'));
    expect(mutationCalls.filter((c) => c.name === 'incrementViewCount').length).toBe(0);
  });

  it('swallows a failure when recording the view', async () => {
    mutationResults.incrementViewCount = new Error('view failed');
    queryResults.getNewsFeed = [makePost({ _id: 'a', isUnread: true })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.click(screen.getByText('news.beFirstToComment'));
    await Promise.resolve();
    await Promise.resolve();
    expect(mutationCalls.filter((c) => c.name === 'incrementViewCount').length).toBe(1);
  });

  it('posts a comment via the send button and clears the draft', async () => {
    queryResults.getNewsFeed = [makePost({ _id: 'a' })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.click(screen.getByText('news.beFirstToComment'));
    const textarea = screen.getByPlaceholderText('news.commentPlaceholder');
    fireEvent.change(textarea, { target: { value: 'Great post!' } });
    fireEvent.click(screen.getByLabelText('news.sendComment'));
    await waitFor(() => {
      const calls = mutationCalls.filter((c) => c.name === 'addComment');
      expect(calls.length).toBe(1);
      expect(calls[0].args[0]).toEqual({ announcementId: 'a', content: 'Great post!' });
    });
    await waitFor(() => {
      expect(
        (screen.getByPlaceholderText('news.commentPlaceholder') as HTMLTextAreaElement).value,
      ).toBe('');
    });
  });

  it('posts a comment on plain Enter but not on Shift+Enter', async () => {
    queryResults.getNewsFeed = [makePost({ _id: 'a' })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.click(screen.getByText('news.beFirstToComment'));
    const textarea = screen.getByPlaceholderText('news.commentPlaceholder');
    fireEvent.change(textarea, { target: { value: 'first' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    await Promise.resolve();
    expect(mutationCalls.filter((c) => c.name === 'addComment').length).toBe(0);
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    await Promise.resolve();
    expect(mutationCalls.filter((c) => c.name === 'addComment').length).toBe(1);
  });

  it('ignores an empty draft', async () => {
    queryResults.getNewsFeed = [makePost({ _id: 'a' })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.click(screen.getByText('news.beFirstToComment'));
    const textarea = screen.getByPlaceholderText('news.commentPlaceholder');
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    await Promise.resolve();
    expect(mutationCalls.filter((c) => c.name === 'addComment').length).toBe(0);
  });

  it('shows a toast when posting a comment fails', async () => {
    mutationResults.addComment = new Error('comment rejected');
    queryResults.getNewsFeed = [makePost({ _id: 'a' })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.click(screen.getByText('news.beFirstToComment'));
    const textarea = screen.getByPlaceholderText('news.commentPlaceholder');
    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.click(screen.getByLabelText('news.sendComment'));
    await Promise.resolve();
    await Promise.resolve();
    expect(toast.error).toHaveBeenCalledWith('comment rejected');
  });

  it('falls back to the generic error toast for a plain-value comment failure', async () => {
    mutationResults.addComment = 'plain failure';
    queryResults.getNewsFeed = [makePost({ _id: 'a' })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.click(screen.getByText('news.beFirstToComment'));
    const textarea = screen.getByPlaceholderText('news.commentPlaceholder');
    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.click(screen.getByLabelText('news.sendComment'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('common.error');
    });
  });

  it('renders existing comments and the showing-latest note', () => {
    const comment = {
      _id: 'c1',
      authorName: 'Bob',
      authorAvatar: undefined,
      content: 'Nice!',
      createdAt: Date.now() - 30_000,
    };
    queryResults.getNewsFeed = [makePost({ _id: 'a', comments: [comment], totalComments: 3 })];
    queryResults.getNewsStats = { ...defaultStats };
    render(<NewsClient />);
    fireEvent.click(screen.getByText('news.commentsCount'));
    expect(screen.getByText('Nice!')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('news.showingLatest')).toBeTruthy();
  });
});
