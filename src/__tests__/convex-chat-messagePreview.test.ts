// Message preview logic from convex/messenger/messages.ts and conversations.ts.
// The preview is truncated to 60 chars for conversation list display.

function truncatePreview(content: string, maxLength: number = 60): string {
  return content.length > maxLength ? content.slice(0, maxLength) + '…' : content;
}

describe('Message preview truncation', () => {
  it('returns short messages unchanged', () => {
    expect(truncatePreview('Hello')).toBe('Hello');
  });

  it('truncates messages longer than 60 chars', () => {
    const long = 'a'.repeat(100);
    expect(truncatePreview(long)).toBe('a'.repeat(60) + '…');
  });

  it('preserves messages of exactly 60 chars', () => {
    const exact = 'b'.repeat(60);
    expect(truncatePreview(exact)).toBe(exact);
  });

  it('handles empty string', () => {
    expect(truncatePreview('')).toBe('');
  });

  it('handles custom maxLength', () => {
    expect(truncatePreview('abcdefghij', 5)).toBe('abcde…');
  });

  it('handles unicode correctly', () => {
    // Each emoji is multiple chars but we slice by char count
    const msg = '🎉'.repeat(10); // 20 JS chars
    const result = truncatePreview(msg, 10);
    expect(result.endsWith('…')).toBe(true);
  });
});

// Conversation sorting: pinned first, then by lastMessageAt
interface TestConversation {
  _id: string;
  isPinned?: boolean;
  lastMessageAt?: number;
  createdAt: number;
}

function sortConversations(convs: TestConversation[]): TestConversation[] {
  return [...convs].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return (b.lastMessageAt ?? b.createdAt) - (a.lastMessageAt ?? a.createdAt);
  });
}

describe('Conversation sorting (pinned first, then by recency)', () => {
  it('puts pinned conversations first', () => {
    const convs = [
      { _id: '1', isPinned: false, lastMessageAt: 100, createdAt: 1 },
      { _id: '2', isPinned: true, lastMessageAt: 50, createdAt: 2 },
    ];
    const sorted = sortConversations(convs);
    expect(sorted[0]._id).toBe('2');
    expect(sorted[1]._id).toBe('1');
  });

  it('sorts by lastMessageAt when both are pinned', () => {
    const convs = [
      { _id: '1', isPinned: true, lastMessageAt: 100, createdAt: 1 },
      { _id: '2', isPinned: true, lastMessageAt: 200, createdAt: 2 },
    ];
    const sorted = sortConversations(convs);
    expect(sorted[0]._id).toBe('2');
  });

  it('sorts by lastMessageAt when neither is pinned', () => {
    const convs = [
      { _id: '1', isPinned: false, lastMessageAt: 100, createdAt: 1 },
      { _id: '2', isPinned: false, lastMessageAt: 200, createdAt: 2 },
    ];
    const sorted = sortConversations(convs);
    expect(sorted[0]._id).toBe('2');
  });

  it('falls back to createdAt when lastMessageAt is absent', () => {
    const convs = [
      { _id: '1', createdAt: 100 },
      { _id: '2', createdAt: 200 },
    ];
    const sorted = sortConversations(convs);
    expect(sorted[0]._id).toBe('2');
  });

  it('handles empty array', () => {
    expect(sortConversations([])).toEqual([]);
  });
});

// Unread count aggregation: sum unreadCount from memberships, excluding muted/deleted
interface TestMembership {
  unreadCount: number;
  isMuted: boolean;
  isDeleted: boolean;
}

function aggregateUnread(memberships: TestMembership[]): number {
  return memberships
    .filter((m) => !m.isMuted && !m.isDeleted)
    .reduce((sum, m) => sum + m.unreadCount, 0);
}

describe('Unread count aggregation', () => {
  it('sums unread counts from non-muted memberships', () => {
    const memberships = [
      { unreadCount: 5, isMuted: false, isDeleted: false },
      { unreadCount: 3, isMuted: false, isDeleted: false },
    ];
    expect(aggregateUnread(memberships)).toBe(8);
  });

  it('excludes muted memberships', () => {
    const memberships = [
      { unreadCount: 5, isMuted: false, isDeleted: false },
      { unreadCount: 10, isMuted: true, isDeleted: false },
    ];
    expect(aggregateUnread(memberships)).toBe(5);
  });

  it('excludes deleted memberships', () => {
    const memberships = [
      { unreadCount: 5, isMuted: false, isDeleted: false },
      { unreadCount: 10, isMuted: false, isDeleted: true },
    ];
    expect(aggregateUnread(memberships)).toBe(5);
  });

  it('returns 0 for empty array', () => {
    expect(aggregateUnread([])).toBe(0);
  });

  it('returns 0 when all are muted', () => {
    expect(aggregateUnread([{ unreadCount: 99, isMuted: true, isDeleted: false }])).toBe(0);
  });
});

// Typing indicator cutoff: ignore typing indicators older than 5 seconds
const TYPING_TTL_MS = 5000;

function getActiveTypingUsers(
  typingIndicators: { userId: string; updatedAt: number }[],
  currentUserId: string,
  now: number,
): string[] {
  return typingIndicators
    .filter((t) => t.userId !== currentUserId && t.updatedAt > now - TYPING_TTL_MS)
    .map((t) => t.userId);
}

describe('Typing indicator cutoff', () => {
  const now = 1_700_000_000_000;

  it('includes users typing within last 5 seconds', () => {
    const indicators = [{ userId: 'u1', updatedAt: now - 2000 }];
    expect(getActiveTypingUsers(indicators, 'me', now)).toEqual(['u1']);
  });

  it('excludes users who stopped typing more than 5 seconds ago', () => {
    const indicators = [{ userId: 'u1', updatedAt: now - 6000 }];
    expect(getActiveTypingUsers(indicators, 'me', now)).toEqual([]);
  });

  it('excludes the current user', () => {
    const indicators = [{ userId: 'me', updatedAt: now - 1000 }];
    expect(getActiveTypingUsers(indicators, 'me', now)).toEqual([]);
  });

  it('handles multiple active typists', () => {
    const indicators = [
      { userId: 'u1', updatedAt: now - 1000 },
      { userId: 'u2', updatedAt: now - 3000 },
      { userId: 'u3', updatedAt: now - 7000 }, // expired
    ];
    expect(getActiveTypingUsers(indicators, 'me', now)).toEqual(['u1', 'u2']);
  });

  it('returns empty for empty array', () => {
    expect(getActiveTypingUsers([], 'me', now)).toEqual([]);
  });
});
