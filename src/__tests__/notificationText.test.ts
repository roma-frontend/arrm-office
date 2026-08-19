import {
  notificationMessage,
  notificationSoundType,
  notificationTitle,
} from '@/lib/notificationText';
/**
 * Tests for notification text resolution (src/lib/notificationText.ts).
 *
 * Covers the resolution order: metadata titleKey/messageKey → per-type label →
 * stored English title/message, plus the malformed-metadata fallbacks.
 */
function makeT() {
  return jest.fn((key: string, opts?: { defaultValue?: string }) => {
    const map: Record<string, string> = {
      'notifications.titles.leaveApproved': 'Отпуск одобрен',
      'notifications.messages.leaveApproved': 'Ваш отпуск одобрен',
      'notifications.types.leave_approved': 'Заявка на отпуск',
      'notifications.types.document_shared': 'Документ',
      // A key with no translation resolves to itself in i18next; our helper
      // must treat that as a miss rather than rendering the raw key.
    };
    return map[key] ?? opts?.defaultValue ?? key;
  });
}

describe('notificationTitle', () => {
  it('prefers metadata.titleKey over everything else', () => {
    const t = makeT();
    const title = notificationTitle(t, {
      type: 'leave_approved',
      title: 'Stored English title',
      message: '',
      metadata: JSON.stringify({
        titleKey: 'notifications.titles.leaveApproved',
        params: { name: 'Alice' },
      }),
    });
    expect(title).toBe('Отпуск одобрен');
    expect(t).toHaveBeenCalledWith(
      'notifications.titles.leaveApproved',
      expect.objectContaining({ defaultValue: '' }),
    );
  });

  it('passes interpolation params to the translator', () => {
    const t = makeT();
    notificationTitle(t, {
      type: 'leave_approved',
      title: '',
      message: '',
      metadata: JSON.stringify({
        titleKey: 'notifications.titles.leaveApproved',
        params: { n: 2 },
      }),
    });
    expect(t).toHaveBeenCalledWith(
      'notifications.titles.leaveApproved',
      expect.objectContaining({ n: 2 }),
    );
  });

  it('falls back to the per-type label when no titleKey is stored', () => {
    const t = makeT();
    const title = notificationTitle(t, {
      type: 'document_shared',
      title: 'Doc title',
      message: '',
    });
    expect(title).toBe('Документ');
  });

  it('skips the per-type label for vague catch-all types', () => {
    const t = makeT();
    const title = notificationTitle(t, { type: 'system', title: 'Account locked', message: '' });
    expect(title).toBe('Account locked');
    expect(t).not.toHaveBeenCalledWith('notifications.types.system', expect.anything());
  });

  it('falls back to the stored English title when everything misses', () => {
    const t = makeT();
    const title = notificationTitle(t, {
      type: 'leave_approved',
      title: 'Your leave was approved',
      message: '',
      metadata: JSON.stringify({ titleKey: 'notifications.titles.missing' }),
    });
    expect(title).toBe('Your leave was approved');
  });

  it('handles malformed metadata JSON gracefully', () => {
    const t = makeT();
    const title = notificationTitle(t, {
      type: 'leave_approved',
      title: 'Fallback',
      message: '',
      metadata: '{not json',
    });
    expect(title).toBe('Fallback');
  });

  it('treats empty metadata as no keys', () => {
    const t = makeT();
    const title = notificationTitle(t, {
      type: 'leave_approved',
      title: 'Fallback',
      message: '',
      metadata: undefined,
    });
    expect(title).toBe('Fallback');
  });

  it('treats non-object metadata as empty', () => {
    const t = makeT();
    const title = notificationTitle(t, {
      type: 'leave_approved',
      title: 'Fallback',
      message: '',
      metadata: JSON.stringify('nope'),
    });
    expect(title).toBe('Fallback');
  });
});

describe('notificationMessage', () => {
  it('prefers metadata.messageKey', () => {
    const t = makeT();
    const message = notificationMessage(t, {
      type: 'leave_approved',
      title: '',
      message: 'Stored message',
      metadata: JSON.stringify({ messageKey: 'notifications.messages.leaveApproved' }),
    });
    expect(message).toBe('Ваш отпуск одобрен');
  });

  it('falls back to the stored message', () => {
    const t = makeT();
    const message = notificationMessage(t, {
      type: 'leave_approved',
      title: '',
      message: 'Stored message',
      metadata: JSON.stringify({ messageKey: 'notifications.messages.missing' }),
    });
    expect(message).toBe('Stored message');
  });

  it('never renders a raw i18n key', () => {
    const t = makeT();
    const message = notificationMessage(t, {
      type: 'leave_approved',
      title: '',
      message: 'Stored message',
      metadata: JSON.stringify({ messageKey: 'notifications.messages.unknown' }),
    });
    expect(message).toBe('Stored message');
    expect(message).not.toContain('notifications.messages');
  });
});

describe('notificationSoundType', () => {
  const base = { type: 'status_change', title: '', message: '' };

  it('uses the request sound for a new calendar access request', () => {
    expect(
      notificationSoundType({
        ...base,
        metadata: JSON.stringify({ type: 'calendar_access_request' }),
      }),
    ).toBe('new_request');
  });

  it('uses the approval sound for an accepted calendar request', () => {
    expect(
      notificationSoundType({
        ...base,
        metadata: JSON.stringify({ type: 'calendar_access_response', approved: true }),
      }),
    ).toBe('approved');
  });

  it('uses the rejection sound for a declined calendar request', () => {
    expect(
      notificationSoundType({
        ...base,
        metadata: JSON.stringify({ type: 'calendar_access_response', approved: false }),
      }),
    ).toBe('rejected');
  });
});
