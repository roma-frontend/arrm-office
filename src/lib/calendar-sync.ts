/**
 * Calendar Sync Utilities
 * Provides functions for syncing with Google Calendar and Outlook
 */

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  description: string;
  userName: string;
  department: string;
  type: string;
}

/**
 * Generate iCal format from events
 */
export function generateICalendar(events: CalendarEvent[]): string {
  let icsContent = 'BEGIN:VCALENDAR\n';
  icsContent += 'VERSION:2.0\n';
  icsContent += 'PRODID:-//Office Leave Management//EN\n';
  icsContent += 'CALSCALE:GREGORIAN\n';
  icsContent += 'METHOD:PUBLISH\n';
  icsContent += 'X-WR-CALNAME:Company Leaves\n';
  icsContent += 'X-WR-TIMEZONE:UTC\n';
  icsContent += 'X-WR-CALDESC:Employee leave schedule\n';

  events.forEach((event) => {
    const startDate = event.startDate.replace(/-/g, '');
    const endDate = event.endDate.replace(/-/g, '');
    const uid = `${event.id}@office.company.com`;
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    icsContent += 'BEGIN:VEVENT\n';
    icsContent += `UID:${uid}\n`;
    icsContent += `DTSTAMP:${timestamp}\n`;
    icsContent += `DTSTART;VALUE=DATE:${startDate}\n`;
    icsContent += `DTEND;VALUE=DATE:${endDate}\n`;
    icsContent += `SUMMARY:${escapeICalText(event.title)}\n`;
    icsContent += `DESCRIPTION:${escapeICalText(event.description)}\\nDepartment: ${escapeICalText(event.department)}\\nType: ${escapeICalText(event.type)}\n`;
    icsContent += `LOCATION:${escapeICalText(event.department)}\n`;
    icsContent += 'STATUS:CONFIRMED\n';
    icsContent += 'TRANSP:OPAQUE\n';
    icsContent += 'END:VEVENT\n';
  });

  icsContent += 'END:VCALENDAR';
  return icsContent;
}

/**
 * Escape special characters for iCal format
 */
function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Download iCal file
 */
export function downloadICalFile(icsContent: string, filename: string) {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * Get Google Calendar authorization URL
 */
export function getGoogleCalendarAuthUrl(redirectUri: string): string {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('Google Client ID not configured');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline',
    prompt: 'consent',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Get Microsoft Outlook authorization URL
 */
export function getOutlookAuthUrl(redirectUri: string): string {
  const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID;
  if (!clientId) {
    throw new Error('Microsoft Client ID not configured');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'Calendars.ReadWrite offline_access',
    response_mode: 'query',
  });

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

/**
 * Create Google Calendar event
 */
export async function createGoogleCalendarEvent(accessToken: string, event: CalendarEvent) {
  const calendarEvent = {
    summary: event.title,
    description: `${event.description}\n\nDepartment: ${event.department}\nType: ${event.type}\nEmployee: ${event.userName}`,
    start: {
      date: event.startDate,
    },
    end: {
      date: event.endDate,
    },
    colorId: getColorIdForLeaveType(event.type),
  };

  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(calendarEvent),
  });

  if (!response.ok) {
    throw new Error('Failed to create Google Calendar event');
  }
  const eventResponse = (await response.json()) as { id: string };
  return eventResponse;
}

/**
 * Create Outlook Calendar event
 */
export async function createOutlookCalendarEvent(accessToken: string, event: CalendarEvent) {
  const calendarEvent = {
    subject: event.title,
    body: {
      contentType: 'Text',
      content: `${event.description}\n\nDepartment: ${event.department}\nType: ${event.type}\nEmployee: ${event.userName}`,
    },
    start: {
      dateTime: `${event.startDate}T00:00:00`,
      timeZone: 'UTC',
    },
    end: {
      dateTime: `${event.endDate}T23:59:59`,
      timeZone: 'UTC',
    },
    isAllDay: true,
  };

  const response = await fetch('https://graph.microsoft.com/v1.0/me/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(calendarEvent),
  });

  if (!response.ok) {
    throw new Error('Failed to create Outlook Calendar event');
  }
  const eventResponse = (await response.json()) as { id: string };
  return eventResponse;
}

/**
 * Get color ID for leave type (Google Calendar)
 */
function getColorIdForLeaveType(type: string): string {
  const colorMap: Record<string, string> = {
    paid: '9', // Blue
    sick: '11', // Red
    family: '5', // Yellow
    unpaid: '8', // Gray
  };
  return colorMap[type.toLowerCase()] || '1'; // Default: Lavender
}

/**
 * Exchange authorization code for access tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  provider: 'google' | 'outlook',
  callbackRedirectUri?: string,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  if (provider === 'google') {
    const tokenEndpoint = 'https://oauth2.googleapis.com/token';
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri =
      callbackRedirectUri || `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/google/callback`;

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not configured');
    }

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange Google code for tokens: ${error}`);
    }

    const tokenResponse = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    return tokenResponse;
  } else {
    // Outlook
    const tokenEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const redirectUri =
      callbackRedirectUri || `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/outlook/callback`;

    if (!clientId || !clientSecret) {
      throw new Error('Microsoft OAuth credentials not configured');
    }

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange Outlook code for tokens: ${error}`);
    }

    const tokenResponse = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    return tokenResponse;
  }
}
