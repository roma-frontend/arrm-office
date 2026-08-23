/**
 * Tests for `@/lib/notificationText` — notification text resolution.
 */
import { describe, it, expect } from '@jest/globals';
import {
  notificationTitle,
  notificationMessage,
  notificationSoundType,
  parseNotificationMeta,
  type NotificationTextSource,
} from '@/lib/notificationText';

// Mock TFunction: returns key when found, else key itself (i18next default behavior)
const t = ((key: string, opts?: Record<string, unknown>) => {
  const translations: Record<string, string> = {
    'notifications.titles.leaveApproved': 'Leave Approved',
    'notifications.messages.leaveApproved': 'Your leave request has been approved.',
    'notifications.types.leave_request': 'New Leave Request',
  };
  const val = translations[key];
  return val ?? (opts?.defaultValue as string) ?? key;
}) as any;

const source = (overrides: Partial<NotificationTextSource> = {}): NotificationTextSource => ({
  type: 'leave_request',
  title: 'Leave Request',
  message: 'A leave request was submitted.',
  ...overrides,
});

describe('parseNotificationMeta', () => {
  it('parses valid JSON metadata', () => {
    const meta = parseNotificationMeta(
      JSON.stringify({ titleKey: 'foo.bar', params: { name: 'Alice' } }),
    );
    expect(meta.titleKey).toBe('foo.bar');
    expect(meta.params?.name).toBe('Alice');
  });

  it('returns {} for undefined', () => {
    expect(parseNotificationMeta(undefined)).toEqual({});
  });

  it('returns {} for invalid JSON', () => {
    expect(parseNotificationMeta('{broken')).toEqual({});
  });

  it('returns {} for non-object JSON', () => {
    expect(parseNotificationMeta('"string"')).toEqual({});
  });

  it('returns the parsed value for array JSON', () => {
    // parseMeta checks typeof === 'object', array passes, returns as-is
    const result = parseNotificationMeta('[1,2]');
    expect(result).toEqual([1, 2]);
  });
});

describe('notificationTitle', () => {
  it('uses stored titleKey from metadata when available', () => {
    const n = source({
      metadata: JSON.stringify({ titleKey: 'notifications.titles.leaveApproved' }),
    });
    expect(notificationTitle(t, n)).toBe('Leave Approved');
  });

  it('falls back to stored title for self-written types', () => {
    const n = source({ type: 'leave_request', title: 'My Leave Request' });
    expect(notificationTitle(t, n)).toBe('My Leave Request');
  });

  it('uses stored title for self-written types (leave_request)', () => {
    const n = source({ type: 'leave_request', title: 'My Leave' });
    expect(notificationTitle(t, n)).toBe('My Leave');
  });

  it('uses type key for legacy types (not in NOTIFICATION_TYPES)', () => {
    // For types not in NOTIFICATION_TYPES, the function tries notifications.types.<type>
    // Our mock t returns the key itself (no translation), so it falls through to stored title
    const n = source({ type: 'legacy_custom', title: 'Stored Title' });
    expect(notificationTitle(t, n)).toBe('Stored Title');
  });

  it('returns stored title when no key resolves', () => {
    const n = source({ type: 'unknown_type', title: 'Stored Title', metadata: undefined });
    expect(notificationTitle(t, n)).toBe('Stored Title');
  });
});

describe('notificationMessage', () => {
  it('uses stored messageKey from metadata', () => {
    const n = source({
      metadata: JSON.stringify({ messageKey: 'notifications.messages.leaveApproved' }),
    });
    expect(notificationMessage(t, n)).toBe('Your leave request has been approved.');
  });

  it('falls back to stored message', () => {
    const n = source({ message: 'Custom message' });
    expect(notificationMessage(t, n)).toBe('Custom message');
  });
});

describe('notificationSoundType', () => {
  it('returns approved for calendar_access_response with approved=true', () => {
    const n = source({
      metadata: JSON.stringify({ type: 'calendar_access_response', approved: true }),
    });
    expect(notificationSoundType(n)).toBe('approved');
  });

  it('returns rejected for calendar_access_response with approved=false', () => {
    const n = source({
      metadata: JSON.stringify({ type: 'calendar_access_response', approved: false }),
    });
    expect(notificationSoundType(n)).toBe('rejected');
  });

  it('returns new_request for normal notifications', () => {
    const n = source({ type: 'leave_request' });
    expect(notificationSoundType(n)).toBe('new_request');
  });

  it('returns new_request when metadata has no type', () => {
    const n = source({ metadata: JSON.stringify({}) });
    expect(notificationSoundType(n)).toBe('new_request');
  });
});
