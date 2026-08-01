/**
 * AI Conflict Check API
 *
 * Проверяет конфликты для запросов AI Ассистента:
 * - Отпуска: проверяет мероприятия и department overlap
 * - Водители: проверяет доступность водителя
 * - Задачи: проверяет дедлайны и отпуска исполнителей
 *
 * Возвращает human-readable сообщения для AI
 */

import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { getServerConvexAuth } from '@/lib/server-convex-auth';
import { logger } from '@/lib/logger';

export const POST = withCsrfProtection(async (req: NextRequest) => {
  try {
    const auth = await getServerConvexAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, organizationId, requestType, startDate, endDate, metadata } =
      (await req.json()) as {
        userId?: string;
        organizationId?: string;
        requestType?: string;
        startDate?: string;
        endDate?: string;
        metadata?: Record<string, unknown>;
      };

    logger.log('[conflict-check] Request:', {
      userId,
      organizationId,
      requestType,
      startDate,
      endDate,
    });

    if (!userId || !organizationId || !requestType || !startDate || !endDate) {
      return NextResponse.json(
        {
          error: 'Missing required fields: userId, organizationId, requestType, startDate, endDate',
        },
        { status: 400 },
      );
    }

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(auth.token);

    // Вызываем Conflict Service
    const conflictResult = await convex.query(api.conflicts.checkConflictsForRequest, {
      organizationId: organizationId as Id<'organizations'>,
      requestType: requestType as 'leave' | 'driver' | 'task' | 'event',
      userId: userId as Id<'users'>,
      startDate: new Date(startDate).getTime(),
      endDate: new Date(endDate).getTime(),
      metadata: metadata || {},
    });

    logger.log('[conflict-check] Result:', conflictResult);

    // Форматируем для AI
    const aiFriendlyMessage = formatConflictsForAI(conflictResult.conflicts, requestType);

    // Извлекаем альтернативные даты из конфликтов
    const alternativeDates = extractAlternativeDates(conflictResult.conflicts, requestType);

    return NextResponse.json({
      success: true,
      hasConflicts: conflictResult.conflicts.length > 0,
      hasCriticalConflicts: conflictResult.hasCritical,
      conflictCount: conflictResult.conflicts.length,
      conflicts: conflictResult.conflicts,
      aiMessage: aiFriendlyMessage,
      alternativeDates,
      canProceed: !conflictResult.hasCritical,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to check conflicts';
    console.error('[conflict-check] Error:', msg);
    return NextResponse.json(
      {
        error: msg,
        success: false,
      },
      { status: 500 },
    );
  }
});

export async function GET(req: NextRequest) {
  // GET для быстрой проверки через query params
  try {
    const auth = await getServerConvexAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const organizationId = searchParams.get('organizationId');
    const requestType = searchParams.get('requestType');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!userId || !organizationId || !requestType || !startDate || !endDate) {
      return NextResponse.json({ error: 'Missing required query params' }, { status: 400 });
    }

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(auth.token);

    // Вызываем Conflict Service
    const conflictResult = await convex.query(api.conflicts.checkConflictsForRequest, {
      organizationId: organizationId as Id<'organizations'>,
      requestType: requestType as 'leave' | 'driver' | 'task' | 'event',
      userId: userId as Id<'users'>,
      startDate: parseInt(startDate),
      endDate: parseInt(endDate),
    });

    const aiFriendlyMessage = formatConflictsForAI(conflictResult.conflicts, requestType);

    return NextResponse.json({
      success: true,
      hasConflicts: conflictResult.conflicts.length > 0,
      hasCriticalConflicts: conflictResult.hasCritical,
      conflictCount: conflictResult.conflicts.length,
      aiMessage: aiFriendlyMessage,
      canProceed: !conflictResult.hasCritical,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to check conflicts';
    console.error('[conflict-check] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Форматирует конфликты в human-readable сообщения для AI
 */
function formatConflictsForAI(
  conflicts: Array<{ severity?: string; title?: string; message?: string; suggestion?: string }>,
  requestType: string,
): string {
  if (conflicts.length === 0) {
    return '✅ Конфликтов не обнаружено. Можно продолжать.';
  }

  const critical = conflicts.filter((c) => c.severity === 'critical');
  const warnings = conflicts.filter((c) => c.severity === 'warning');

  let message = '';

  if (critical.length > 0) {
    message += '🚨 **КРИТИЧЕСКИЕ КОНФЛИКТЫ** (требуют внимания):\n';
    critical.forEach((c) => {
      message += `• ${c.title}: ${c.message} 💡 ${c.suggestion}\n`;
    });
  }

  if (warnings.length > 0) {
    message += '\n⚠️ **ПРЕДУПРЕЖДЕНИЯ**:\n';
    warnings.forEach((c) => {
      message += `• ${c.title}: ${c.message} 💡 ${c.suggestion}\n`;
    });
  }

  if (requestType === 'leave') {
    message += '\n📅 **Рекомендация AI**: ';
    if (critical.length > 0) {
      message += 'Настоятельно рекомендую выбрать другие даты или обсудить с руководителем.';
    } else if (warnings.length > 0) {
      message += 'Можно продолжить, но будьте готовы к возможным сложностям.';
    }
  }

  return message;
}

/**
 * Извлекает альтернативные даты из конфликтов
 */
function extractAlternativeDates(
  conflicts: Array<{ severity?: string; title?: string; message?: string; suggestion?: string }>,
  requestType: string,
): string[] {
  const alternativeDates: string[] = [];

  if (requestType !== 'leave') return alternativeDates;

  // Если есть конфликты, предлагаем даты через 2 недели
  if (conflicts.length > 0) {
    const now = new Date();
    const alternativeStart = new Date(now);
    alternativeStart.setDate(alternativeStart.getDate() + 14);

    const alternativeEnd = new Date(alternativeStart);
    alternativeEnd.setDate(alternativeEnd.getDate() + 7);

    const options = [
      `${alternativeStart.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} - ${alternativeEnd.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`,
    ];

    // Ещё одна опция через 3 недели
    const altStart2 = new Date(now);
    altStart2.setDate(altStart2.getDate() + 21);
    const altEnd2 = new Date(altStart2);
    altEnd2.setDate(altEnd2.getDate() + 7);

    options.push(
      `${altStart2.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} - ${altEnd2.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`,
    );

    return options;
  }

  return alternativeDates;
}
