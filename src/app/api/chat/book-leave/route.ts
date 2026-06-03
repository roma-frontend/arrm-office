import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { getServerConvexAuth } from '@/lib/server-convex-auth';
import { cookies } from 'next/headers';
import { getServerTranslation } from '@/lib/i18n/server-translation';

export const POST = withCsrfProtection(async (req: Request) => {
  try {
    const auth = await getServerConvexAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cookieStore = await cookies();
    const locale = cookieStore.get('i18nextLng')?.value || 'en';
    const { t } = await getServerTranslation('common', locale);

    const { type, startDate, endDate, days, reason } = await req.json();

    if (!type || !startDate || !endDate || !days || !reason) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Identity is derived from the trusted session — never from the request body
    const userId = auth.payload.userId as Id<'users'>;
    const organizationId = auth.payload.organizationId as Id<'organizations'> | undefined;
    if (!organizationId) {
      return NextResponse.json(
        { error: 'User does not belong to an organization' },
        { status: 400 },
      );
    }

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(auth.token);

    // ═══════════════════════════════════════════════════════════════
    // CONFLICT DETECTION — Unified Conflict Service
    // ═══════════════════════════════════════════════════════════════
    const conflictResult = await convex.query(api.conflicts.checkConflictsForRequest, {
      organizationId: organizationId,
      requestType: 'leave' as const,
      userId: userId,
      startDate: new Date(startDate).getTime(),
      endDate: new Date(endDate).getTime(),
      metadata: { leaveType: type },
    });

    // Если есть критические конфликты — возвращаем ошибку
    if (conflictResult.hasCritical) {
      const criticalConflicts = conflictResult.conflicts.filter((c) => c.severity === 'critical');

      return NextResponse.json({
        success: false,
        conflict: true,
        hasCriticalConflicts: true,
        conflictCount: conflictResult.conflicts.length,
        message: buildConflictMessage(criticalConflicts, type, startDate, endDate, t),
        conflicts: conflictResult.conflicts,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // LEGACY CHECK — personal leave overlap
    // ═══════════════════════════════════════════════════════════════
    const userLeaves = await convex.query(api.leaves.getUserLeaves, { userId });
    const personalConflict = userLeaves.find((leave: any) => {
      if (leave.status === 'rejected') return false;
      const existStart = new Date(leave.startDate);
      const existEnd = new Date(leave.endDate);
      const newStart = new Date(startDate);
      const newEnd = new Date(endDate);
      return newStart <= existEnd && newEnd >= existStart;
    });

    if (personalConflict) {
      const conflictEnd = new Date(personalConflict.endDate);
      conflictEnd.setDate(conflictEnd.getDate() + 1);
      const suggestedStart = conflictEnd.toISOString().split('T')[0];
      const suggestedEnd = new Date(conflictEnd);
      suggestedEnd.setDate(suggestedEnd.getDate() + days - 1);
      const suggestedEndStr = suggestedEnd.toISOString().split('T')[0];

      return NextResponse.json({
        success: false,
        conflict: true,
        message: t('aiMessages.leaveConflict', {
          type: personalConflict.type ?? '',
          start: personalConflict.startDate ?? '',
          end: personalConflict.endDate ?? '',
          status: personalConflict.status ?? '',
          sugStart: suggestedStart ?? '',
          sugEnd: suggestedEndStr ?? '',
        }),
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // CHECK LEAVE BALANCE
    // ═══════════════════════════════════════════════════════════════
    const user = await convex.query(api.users.queries.getUserById, { userId });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (type === 'paid' && (user.paidLeaveBalance ?? 0) < days) {
      return NextResponse.json({
        success: false,
        conflict: true,
        message: t('aiMessages.insufficientBalance', {
          type: 'paid',
          available: String(user.paidLeaveBalance ?? 0),
          requested: String(days),
        }),
      });
    }
    if (type === 'sick' && (user.sickLeaveBalance ?? 0) < days) {
      return NextResponse.json({
        success: false,
        conflict: true,
        message: t('aiMessages.insufficientBalance', {
          type: 'sick',
          available: String(user.sickLeaveBalance ?? 0),
          requested: String(days),
        }),
      });
    }
    if (type === 'family' && (user.familyLeaveBalance ?? 0) < days) {
      return NextResponse.json({
        success: false,
        conflict: true,
        message: t('aiMessages.insufficientBalance', {
          type: 'family',
          available: String(user.familyLeaveBalance ?? 0),
          requested: String(days),
        }),
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // CREATE LEAVE REQUEST
    // ═══════════════════════════════════════════════════════════════
    const leaveId = await convex.mutation(api.leaves.createLeave, {
      userId,
      type,
      startDate,
      endDate,
      days,
      reason,
      comment: 'Submitted via AI Assistant',
    });

    // Формируем ответ с учётом предупреждений
    const warnings = conflictResult.conflicts.filter((c) => c.severity === 'warning');
    let message = t('aiMessages.leaveSubmitted', {
      type,
      days: String(days),
      start: startDate,
      end: endDate,
    });

    if (warnings.length > 0) {
      message +=
        '\n\n' +
        t('aiMessages.conflictWarning', { warnings: warnings.map((w) => w.message).join(' ') });
    }

    return NextResponse.json({
      success: true,
      leaveId,
      message,
      hasWarnings: warnings.length > 0,
      conflicts: conflictResult.conflicts,
    });
  } catch (error) {
    console.error('Book leave error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create leave request' },
      { status: 500 },
    );
  }
});

/**
 * Build human-readable conflict message for AI
 */
function buildConflictMessage(
  conflicts: any[],
  leaveType: string,
  startDate: string,
  endDate: string,
  t: (key: string, params?: Record<string, string>) => string,
): string {
  if (conflicts.length === 0) return '';

  let message =
    t('aiMessages.conflictDetected', { type: leaveType, start: startDate, end: endDate }) + '\n\n';

  conflicts.forEach((conflict, i) => {
    message += `${i + 1}. **${conflict.title}**\n`;
    message += `   ${conflict.message}\n`;
    message += `   💡 ${conflict.suggestion}\n\n`;
  });

  message += t('aiMessages.conflictAdvice');

  return message;
}
