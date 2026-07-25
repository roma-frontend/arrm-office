/**
 * Tests for calendar-sync.ts — iCal generation, auth URLs, color mapping.
 */
import {
  generateICalendar,
  downloadICalFile,
  getGoogleCalendarAuthUrl,
  getOutlookAuthUrl,
  createGoogleCalendarEvent,
  createOutlookCalendarEvent,
  exchangeCodeForTokens,
} from '@/lib/calendar-sync';
import type { CalendarEvent } from '@/lib/calendar-sync';

const sampleEvents: CalendarEvent[] = [
  {
    id: 'evt-1',
    title: 'Annual Leave',
    startDate: '2026-07-15',
    endDate: '2026-07-20',
    description: 'Vacation',
    userName: 'John Doe',
    department: 'Engineering',
    type: 'paid',
  },
  {
    id: 'evt-2',
    title: 'Sick Leave',
    startDate: '2026-08-01',
    endDate: '2026-08-02',
    description: 'Doctor appointment',
    userName: 'Jane Smith',
    department: 'HR',
    type: 'sick',
  },
];

describe('generateICalendar', () => {
  it('generates iCal with correct header', () => {
    const ics = generateICalendar(sampleEvents);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('contains event UIDs', () => {
    const ics = generateICalendar(sampleEvents);
    expect(ics).toContain('UID:evt-1@office.company.com');
    expect(ics).toContain('UID:evt-2@office.company.com');
  });

  it('contains DTSTART/DTEND', () => {
    const ics = generateICalendar(sampleEvents);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260715');
    expect(ics).toContain('DTEND;VALUE=DATE:20260720');
  });

  it('contains SUMMARY and DESCRIPTION', () => {
    const ics = generateICalendar(sampleEvents);
    expect(ics).toContain('SUMMARY:Annual Leave');
    expect(ics).toContain('DESCRIPTION:Vacation');
  });

  it('has VEVENT blocks', () => {
    const ics = generateICalendar(sampleEvents);
    const veventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
    expect(veventCount).toBe(2);
  });

  it('returns empty VEVENT for empty events', () => {
    const ics = generateICalendar([]);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('escapes special characters through generateICalendar', () => {
    const events: CalendarEvent[] = [
      {
        ...sampleEvents[0],
        title: 'Test; Comma and Newline',
        description: 'Semi;colon',
      },
    ];
    const ics = generateICalendar(events);
    // The iCal output escapes ; and ,
    expect(ics).toContain('SUMMARY:Test\\;');
    expect(ics).toContain('DESCRIPTION:Semi\\;colon');
  });
});

// escapeICalText is private (not exported), tested indirectly via generateICalendar

describe('downloadICalFile', () => {
  beforeEach(() => {
    global.URL.createObjectURL = jest.fn(() => 'blob:test');
    global.URL.revokeObjectURL = jest.fn();
    document.body.appendChild = jest.fn();
    document.body.removeChild = jest.fn();
    document.createElement = jest.fn().mockReturnValue({
      setAttribute: jest.fn(),
      click: jest.fn(),
      href: '',
      download: '',
      style: {},
    });
  });

  it('creates a blob and triggers download', () => {
    downloadICalFile('BEGIN:VCALENDAR', 'test.ics');
    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(document.body.appendChild).toHaveBeenCalled();
    expect(document.body.removeChild).toHaveBeenCalled();
  });
});

describe('getGoogleCalendarAuthUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'google-client-123' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns auth URL with correct params', () => {
    const url = getGoogleCalendarAuthUrl('https://app.com/callback');
    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('client_id=google-client-123');
    expect(url).toContain('redirect_uri=https%3A%2F%2Fapp.com%2Fcallback');
    expect(url).toContain(
      'scope=' + encodeURIComponent('https://www.googleapis.com/auth/calendar.events'),
    );
    expect(url).toContain('access_type=offline');
    expect(url).toContain('prompt=consent');
  });

  it('throws when client ID is missing', () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    expect(() => getGoogleCalendarAuthUrl('https://app.com/callback')).toThrow('Google Client ID');
  });
});

describe('getOutlookAuthUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NEXT_PUBLIC_MICROSOFT_CLIENT_ID: 'ms-client-456' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns Outlook auth URL', () => {
    const url = getOutlookAuthUrl('https://app.com/callback');
    expect(url).toContain('login.microsoftonline.com');
    expect(url).toContain('client_id=ms-client-456');
    expect(url).toContain('redirect_uri=https%3A%2F%2Fapp.com%2Fcallback');
  });

  it('throws when client ID is missing', () => {
    delete process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID;
    expect(() => getOutlookAuthUrl('https://app.com/callback')).toThrow('Microsoft Client ID');
  });
});

describe('createGoogleCalendarEvent', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('sends POST to Google Calendar API', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'event-1' }),
    });
    await createGoogleCalendarEvent('token-123', sampleEvents[0]);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      }),
    );
  });

  it('includes colorId based on leave type', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });

    // paid → colorId '9' (Blue)
    await createGoogleCalendarEvent('t', sampleEvents[0]);
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.colorId).toBe('9');
  });

  it('throws on non-ok response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    await expect(createGoogleCalendarEvent('t', sampleEvents[0])).rejects.toThrow(
      'Failed to create',
    );
  });
});

describe('createOutlookCalendarEvent', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('sends POST to Microsoft Graph API', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'evt-1' }),
    });
    await createOutlookCalendarEvent('token-456', sampleEvents[0]);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me/events',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sets isAllDay to true', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    await createOutlookCalendarEvent('t', sampleEvents[0]);
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.isAllDay).toBe(true);
  });

  it('throws on non-ok', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    await expect(createOutlookCalendarEvent('t', sampleEvents[0])).rejects.toThrow(
      'Failed to create',
    );
  });
});

describe('exchangeCodeForTokens', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('throws when Google credentials missing', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    await expect(exchangeCodeForTokens('code', 'google')).rejects.toThrow('Google OAuth');
  });

  it('throws when Microsoft credentials missing', async () => {
    delete process.env.MICROSOFT_CLIENT_ID;
    await expect(exchangeCodeForTokens('code', 'outlook')).rejects.toThrow('Microsoft OAuth');
  });

  it('exchanges Google code for tokens', async () => {
    process.env.GOOGLE_CLIENT_ID = 'g-id';
    process.env.GOOGLE_CLIENT_SECRET = 'g-secret';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.com';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'access-123', refresh_token: 'refresh-456' }),
    });

    const tokens = await exchangeCodeForTokens('auth-code', 'google');
    expect(tokens.access_token).toBe('access-123');
    expect(tokens.refresh_token).toBe('refresh-456');
  });

  it('exchanges Outlook code for tokens', async () => {
    process.env.MICROSOFT_CLIENT_ID = 'ms-id';
    process.env.MICROSOFT_CLIENT_SECRET = 'ms-secret';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.com';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'outlook-access' }),
    });

    const tokens = await exchangeCodeForTokens('auth-code', 'outlook');
    expect(tokens.access_token).toBe('outlook-access');
  });

  it('throws on Google exchange failure', async () => {
    process.env.GOOGLE_CLIENT_ID = 'g-id';
    process.env.GOOGLE_CLIENT_SECRET = 'g-secret';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.com';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      text: async () => 'invalid_grant',
    });

    await expect(exchangeCodeForTokens('bad-code', 'google')).rejects.toThrow('Failed to exchange');
  });
});
