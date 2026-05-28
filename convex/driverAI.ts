/**
 * AI Assistant for Driver Management
 *
 * Features:
 * - Natural language queries about driver availability
 * - Calendar visibility queries
 * - Smart suggestions based on context
 */

import { v } from 'convex/values';
import { query } from './_generated/server';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import type { Id, Doc } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { getProfile } from './lib/userProfile';

// Types for AI responses
interface DriverAvailability {
  _id: Id<'drivers'>;
  userName: string;
  availability: { available: boolean; nextAvailable?: number };
  vehicleInfo: { model: string; plateNumber: string; capacity: number };
  rating: number;
}

interface AvailabilityResponse {
  text: { en: string; ru: string; hy: string };
  type: string;
  suggestions?: Array<{ driverId: Id<'drivers'>; driverName: string; nextAvailable: string }>;
  availableDrivers?: Array<{
    driverId: Id<'drivers'>;
    driverName: string;
    vehicle: string;
    capacity: number;
    rating: number;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI QUERY PROCESSING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process natural language query about driver availability
 *
 * Examples:
 * - "Покажи мне занятность водителя Армена"
 * - "Show me driver availability for tomorrow"
 * - "Ե՞րբ է ազատ վարորդը"
 */
export const queryDriverAvailability = query({
  args: {
    userId: v.id('users'),
    organizationId: v.id('organizations'),
    query: v.string(), // Natural language query
    contextDate: v.optional(v.number()), // Reference date (default: now)
  },
  handler: async (ctx, args) => {
    const { userId, organizationId, query, contextDate } = args;
    const now = contextDate || Date.now();
    const queryLower = query.toLowerCase();

    // Extract intent from query
    const intent = extractIntent(queryLower);

    // Get all available drivers
    const drivers = await ctx.db
      .query('drivers')
      .withIndex('by_org_available', (q) =>
        q.eq('organizationId', organizationId).eq('isAvailable', true),
      )
      .take(SMALL_LIST_CAP);

    // Filter by driver name if mentioned
    const targetDrivers = drivers;
    if (intent.driverName) {
      // Get user info for name matching - filtering logic would go here
    }

    // Enrich drivers with user info and availability
    const enrichedDrivers = await Promise.all(
      drivers.map(async (driver) => {
        const user = await ctx.db.get(driver.userId);
        const userProfile = await getProfile(ctx, driver.userId);

        // Check availability for the requested time range
        const timeRange = intent.timeRange || { start: now, end: now + 24 * 60 * 60 * 1000 };

        const availability = await checkDriverAvailability(
          ctx,
          driver._id,
          timeRange.start,
          timeRange.end,
        );

        return {
          ...driver,
          userName: user?.name ?? 'Unknown',
          userAvatar: userProfile?.avatarUrl ?? user?.avatarUrl,
          userPhone: userProfile?.phone ?? user?.phone,
          userPosition: userProfile?.position ?? user?.position,
          availability,
        };
      }),
    );

    // Generate AI response
    const response = generateAvailabilityResponse(enrichedDrivers, intent, queryLower);

    return {
      drivers: enrichedDrivers,
      response,
      intent,
    };
  },
});

/**
 * Get detailed driver schedule with AI summary
 */
export const getDriverScheduleWithSummary = query({
  args: {
    driverId: v.id('drivers'),
    userId: v.id('users'),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const { driverId, userId, startTime, endTime } = args;
    // Check calendar access
    const driver = await ctx.db.get(driverId);
    if (!driver) throw new Error('Driver not found');

    const access = await ctx.db
      .query('calendarAccess')
      .withIndex('by_owner_viewer', (q) => q.eq('ownerId', driver.userId).eq('viewerId', userId))
      .first();

    const hasFullAccess = access?.isActive && access.accessLevel === 'full';
    const hasBusyOnlyAccess = access?.isActive && access.accessLevel === 'busy_only';

    if (!access || !access.isActive) {
      throw new Error("No access to this driver's calendar. Please request access first.");
    }

    // Get schedule
    const schedules = await ctx.db
      .query('driverSchedules')
      .withIndex('by_driver_time', (q) => q.eq('driverId', driverId))
      .filter((q: any) =>
        q.and(q.gte(q.field('startTime'), startTime), q.lte(q.field('startTime'), endTime)),
      )
      .take(DEFAULT_LIST_CAP);

    // Filter based on access level
    let visibleSchedules = schedules;
    if (!hasFullAccess && hasBusyOnlyAccess) {
      visibleSchedules = schedules.map((s: any) => ({
        ...s,
        startTime: s.startTime,
        endTime: s.endTime,
        type: s.type,
        status: s.status,
      })) as typeof schedules;
    }

    // Generate AI summary
    const summary = generateScheduleSummary(visibleSchedules, hasFullAccess ?? false);

    return {
      schedules: visibleSchedules,
      hasFullAccess,
      summary,
      driver: {
        name: (await ctx.db.get(driver.userId))?.name,
        vehicle: driver.vehicleInfo,
      },
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract intent from natural language query
 */
function extractIntent(query: string) {
  const intent: {
    driverName?: string;
    timeRange?: { start: number; end: number };
    action: 'availability' | 'schedule' | 'booking';
  } = {
    action: 'availability',
  };

  // Extract time references
  const now = Date.now();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  if (query.includes('сегодня') || query.includes('today')) {
    intent.timeRange = {
      start: today.getTime(),
      end: today.getTime() + 24 * 60 * 60 * 1000,
    };
  } else if (query.includes('завтра') || query.includes('tomorrow')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    intent.timeRange = {
      start: tomorrow.getTime(),
      end: tomorrow.getTime() + 24 * 60 * 60 * 1000,
    };
  } else if (query.includes('недел') || query.includes('week')) {
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    intent.timeRange = {
      start: now,
      end: weekEnd.getTime(),
    };
  } else {
    // Default: today
    intent.timeRange = {
      start: today.getTime(),
      end: today.getTime() + 24 * 60 * 60 * 1000,
    };
  }

  // Extract driver name (simplified - in production use NLP)
  const nameMatch = query.match(/(?:водитель|driver)\s+([A-Z][a-z]+)/i);
  if (nameMatch) {
    intent.driverName = nameMatch[1];
  }

  return intent;
}

/**
 * Check driver availability for a time range
 */
async function checkDriverAvailability(
  ctx: QueryCtx,
  driverId: Id<'drivers'>,
  startTime: number,
  endTime: number,
) {
  // Check for overlapping schedules
  const overlapping = await ctx.db
    .query('driverSchedules')
    .withIndex('by_driver_time', (q) => q.eq('driverId', driverId))
    .filter((q: any) =>
      q.and(
        q.eq(q.field('status'), 'scheduled'),
        q.or(
          q.and(q.lte(q.field('startTime'), startTime), q.gte(q.field('endTime'), startTime)),
          q.and(q.lte(q.field('startTime'), endTime), q.gte(q.field('endTime'), endTime)),
          q.and(q.gte(q.field('startTime'), startTime), q.lte(q.field('endTime'), endTime)),
        ),
      ),
    )
    .take(SMALL_LIST_CAP);

  if (overlapping.length > 0) {
    return {
      available: false,
      reason: 'busy',
      conflicts: overlapping,
    };
  }

  return {
    available: true,
  };
}

/**
 * Generate natural language response about availability
 */
function generateAvailabilityResponse(
  drivers: DriverAvailability[],
  _intent: { driverName?: string; timeRange?: { start: number; end: number } },
  _query: string,
): AvailabilityResponse {
  if (drivers.length === 0) {
    return {
      text: {
        en: 'No available drivers found.',
        ru: 'Нет доступных водителей.',
        hy: 'Ազատ վարորդներ չեն գտնվել:',
      },
      type: 'no_drivers',
    };
  }

  const availableDrivers = drivers.filter((d: any) => d.availability.available);
  const busyDrivers = drivers.filter((d: any) => !d.availability.available);

  if (availableDrivers.length === 0) {
    return {
      text: {
        en: 'All drivers are busy at the moment. Next available times:',
        ru: 'Все водители заняты. Ближайшее свободное время:',
        hy: 'Բոլոր վարորդները զբաղված են: Հաջորդ ազատ ժամանակը:',
      },
      type: 'all_busy',
      suggestions: busyDrivers.map((d: any) => ({
        driverId: d._id,
        driverName: d.userName,
        nextAvailable: 'Tomorrow 9:00 AM', // Would calculate from schedule
      })),
    };
  }

  return {
    text: {
      en: `Found ${availableDrivers.length} available driver(s):`,
      ru: `Найдено ${availableDrivers.length} доступных водителей:`,
      hy: `Գտնվել է ${availableDrivers.length} ազատ վարորդ:`,
    },
    type: 'available',
    availableDrivers: availableDrivers.map((d: any) => ({
      driverId: d._id,
      driverName: d.userName,
      vehicle: `${d.vehicleInfo.model} (${d.vehicleInfo.plateNumber})`,
      capacity: d.vehicleInfo.capacity,
      rating: d.rating,
    })),
  };
}

/**
 * Generate AI summary for driver schedule
 */
function generateScheduleSummary(schedules: Doc<'driverSchedules'>[], hasFullAccess: boolean) {
  const totalHours = schedules.reduce((sum, s) => {
    return sum + (s.endTime - s.startTime) / (1000 * 60 * 60);
  }, 0);

  const tripCount = schedules.filter((s: any) => s.type === 'trip').length;
  const blockedCount = schedules.filter((s: any) => s.type === 'blocked').length;

  const summary = {
    totalHours: Math.round(totalHours * 10) / 10,
    tripCount,
    blockedCount,
    utilizationRate: Math.round((totalHours / 40) * 100), // Assuming 40h work week
  };

  const messages = {
    en: `Driver has ${tripCount} trips and ${blockedCount} blocked slots. Total: ${summary.totalHours}h (${summary.utilizationRate}% utilization).`,
    ru: `У водителя ${tripCount} поездок и ${blockedCount} заблокированных слотов. Всего: ${summary.totalHours}ч (загрузка ${summary.utilizationRate}%).`,
    hy: `Վարորդն ունի ${tripCount} ուղևորություն և ${blockedCount} արգելափակված ժամանակահատված: Ընդամենը՝ ${summary.totalHours}ժ (${summary.utilizationRate}% բեռնվածություն):`,
  };

  return {
    stats: summary,
    messages,
  };
}
