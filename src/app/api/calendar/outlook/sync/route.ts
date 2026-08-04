import { NextRequest, NextResponse } from 'next/server';
import { createOutlookCalendarEvent, type CalendarEvent } from '@/lib/calendar-sync';
import { validateRestrictedOrgFromRequest } from '@/lib/restricted-org';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { logger } from '@/lib/logger';

export const POST = withCsrfProtection(async (request: NextRequest) => {
  try {
    const validation = await validateRestrictedOrgFromRequest(request);

    if (!validation.allowed) {
      return NextResponse.json(validation.body, { status: validation.status });
    }

    const accessToken = request.cookies.get('outlook_access_token')?.value;

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated with Outlook Calendar' },
        { status: 401 },
      );
    }

    const { events } = (await request.json()) as { events?: CalendarEvent[] };

    if (!Array.isArray(events)) {
      return NextResponse.json({ error: 'Invalid events data' }, { status: 400 });
    }

    // Create events in Outlook Calendar
    const results: Array<{
      success: boolean;
      eventId: string;
      outlookEventId?: string;
      error?: string;
    }> = [];
    for (const event of events) {
      try {
        const result = await createOutlookCalendarEvent(accessToken, event);
        results.push({ success: true, eventId: event.id, outlookEventId: result.id });
      } catch (error) {
        results.push({ success: false, eventId: event.id, error: String(error) });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      message: `Synced ${successCount} events, ${failureCount} failed`,
      results,
    });
  } catch (error) {
    logger.error('Outlook Calendar sync error:', error);
    return NextResponse.json({ error: 'Failed to sync with Outlook Calendar' }, { status: 500 });
  }
});
