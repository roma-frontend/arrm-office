import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { logger } from '@/lib/logger';
import { cookies } from 'next/headers';
import { getServerTranslation } from '@/lib/i18n/server-translation';
import { getServerConvexAuth } from '@/lib/server-convex-auth';

export const POST = withCsrfProtection(async (req: NextRequest) => {
  try {
    const auth = await getServerConvexAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cookieStore = await cookies();
    const locale = cookieStore.get('i18nextLng')?.value || 'en';
    const { t } = await getServerTranslation('common', locale);

    const { driverId, startTime, endTime, tripInfo } = await req.json();

    // Identity comes from the verified session, never from the request body
    const userId = auth.payload.userId as Id<'users'>;
    const organizationId = auth.payload.organizationId as Id<'organizations'> | undefined;

    logger.log('[book-driver] Received request:', {
      userId,
      organizationId,
      driverId,
      startTime,
      endTime,
      tripInfo,
    });

    if (!organizationId || !driverId || !startTime || !endTime || !tripInfo) {
      console.error('[book-driver] Missing required fields');
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate driverId is a proper Convex ID
    if (!driverId.startsWith('jn')) {
      console.error('[book-driver] Invalid driverId:', driverId);
      return NextResponse.json(
        { error: `Invalid driverId format. Must start with "jn", got: "${driverId}"` },
        { status: 400 },
      );
    }

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(auth.token);

    // ═══════════════════════════════════════════════════════════════
    // CONFLICT DETECTION — Check driver availability
    // ═══════════════════════════════════════════════════════════════
    const conflictResult = await convex.query(api.conflicts.checkConflictsForRequest, {
      organizationId: organizationId,
      requestType: 'driver' as const,
      userId: userId,
      startDate: new Date(startTime).getTime(),
      endDate: new Date(endTime).getTime(),
      metadata: { driverId: driverId as Id<'drivers'> },
    });

    // Если есть критические конфликты (водитель занят)
    if (conflictResult.hasCritical) {
      const criticalConflicts = conflictResult.conflicts.filter((c) => c.severity === 'critical');

      return NextResponse.json({
        success: false,
        conflict: true,
        hasCriticalConflicts: true,
        conflictCount: conflictResult.conflicts.length,
        message: buildDriverConflictMessage(criticalConflicts, startTime, endTime),
        conflicts: conflictResult.conflicts,
        suggestion: 'Please choose a different time or select another driver.',
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // CREATE DRIVER REQUEST
    // ═══════════════════════════════════════════════════════════════
    const requestId = await convex.mutation(api.drivers.requests_mutations.requestDriver, {
      organizationId: organizationId,
      driverId: driverId as Id<'drivers'>,
      startTime,
      endTime,
      tripInfo: {
        from: tripInfo.from || 'Not specified',
        to: tripInfo.to || 'Not specified',
        purpose: tripInfo.purpose || 'AI Booking',
        passengerCount: tripInfo.passengerCount || 1,
        notes: tripInfo.notes || 'Booked via AI Assistant',
      },
    });

    logger.log('[book-driver] Request created:', requestId);

    return NextResponse.json({
      message: t('aiMessages.driverSubmitted'),
      success: true,
      requestId,
      hasWarnings: conflictResult.conflicts.filter((c) => c.severity === 'warning').length > 0,
    });
  } catch (error: unknown) {
    console.error('[book-driver] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to book driver' },
      { status: 500 },
    );
  }
});

/**
 * Build human-readable conflict message for driver booking
 */
function buildDriverConflictMessage(
  conflicts: Array<{ severity?: string; title?: string; message?: string; suggestion?: string }>,
  startTime: string,
  endTime: string,
): string {
  if (conflicts.length === 0) return '';

  const startDate = new Date(startTime).toLocaleString();
  const endDate = new Date(endTime).toLocaleString();

  let message = `🚨 **Driver unavailable for requested time** (${startDate} → ${endDate}):\n\n`;

  conflicts.forEach((conflict, i) => {
    message += `${i + 1}. **${conflict.title}**\n`;
    message += `   ${conflict.message}\n`;
    message += `   💡 ${conflict.suggestion}\n\n`;
  });

  return message;
}
