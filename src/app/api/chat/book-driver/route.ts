import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { logger } from '@/lib/logger';
import { cookies } from 'next/headers';
import { getServerTranslation } from '@/lib/i18n/server-translation';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export const POST = withCsrfProtection(async (req: NextRequest) => {
  try {
    const cookieStore = await cookies();
    const locale = cookieStore.get('i18nextLng')?.value || 'en';
    const { t } = await getServerTranslation('common', locale);

    const { userId, organizationId, driverId, startTime, endTime, tripInfo } = await req.json();

    logger.log('[book-driver] Received request:', {
      userId,
      organizationId,
      driverId,
      startTime,
      endTime,
      tripInfo,
    });

    if (!userId || !organizationId || !driverId || !startTime || !endTime || !tripInfo) {
      console.error('[book-driver] Missing required fields');
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate IDs are proper Convex IDs
    if (!userId || !userId.startsWith('jn')) {
      console.error('[book-driver] Invalid userId:', userId);
      return NextResponse.json({ error: 'Invalid userId format' }, { status: 400 });
    }
    if (!organizationId || (!organizationId.startsWith('jn') && !organizationId.startsWith('n5'))) {
      console.error('[book-driver] Invalid organizationId:', organizationId);
      return NextResponse.json({ error: 'Invalid organizationId format' }, { status: 400 });
    }
    if (!driverId || !driverId.startsWith('jn')) {
      console.error('[book-driver] Invalid driverId:', driverId);
      return NextResponse.json(
        { error: `Invalid driverId format. Must start with "jn", got: "${driverId}"` },
        { status: 400 },
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // CONFLICT DETECTION — Check driver availability
    // ═══════════════════════════════════════════════════════════════
    const conflictResult = await convex.query(api.conflicts.checkConflictsForRequest, {
      organizationId: organizationId as Id<'organizations'>,
      requestType: 'driver' as const,
      userId: userId as Id<'users'>,
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
      organizationId: organizationId as Id<'organizations'>,
      requesterId: userId as Id<'users'>,
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
  } catch (error: any) {
    console.error('[book-driver] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to book driver' }, { status: 500 });
  }
});

/**
 * Build human-readable conflict message for driver booking
 */
function buildDriverConflictMessage(conflicts: any[], startTime: string, endTime: string): string {
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
