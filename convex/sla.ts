import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP, XLARGE_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';

// ── Helper: Calculate response time in hours ──────────────────────────────
function calculateResponseTime(
  submittedAt: number,
  respondedAt: number,
  businessHoursOnly: boolean,
  businessStartHour: number,
  businessEndHour: number,
  excludeWeekends: boolean,
): number {
  if (!businessHoursOnly) {
    // Simple calculation: total hours
    return (respondedAt - submittedAt) / (1000 * 60 * 60);
  }

  // Calculate business hours only
  let totalHours = 0;
  const start = new Date(submittedAt);
  const end = new Date(respondedAt);

  let current = new Date(start);

  while (current < end) {
    const dayOfWeek = current.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (excludeWeekends && isWeekend) {
      // Skip to next day
      current.setDate(current.getDate() + 1);
      current.setHours(businessStartHour, 0, 0, 0);
      continue;
    }

    const currentHour = current.getHours();
    const currentMinutes = current.getMinutes();

    if (currentHour < businessStartHour) {
      // Before business hours - skip to start
      current.setHours(businessStartHour, 0, 0, 0);
    } else if (currentHour >= businessEndHour) {
      // After business hours - skip to next day
      current.setDate(current.getDate() + 1);
      current.setHours(businessStartHour, 0, 0, 0);
    } else {
      // During business hours - count this hour
      const nextHour = new Date(current);
      nextHour.setHours(currentHour + 1, 0, 0, 0);

      if (nextHour > end) {
        // Last partial hour
        totalHours += (end.getTime() - current.getTime()) / (1000 * 60 * 60);
        break;
      } else if (nextHour.getHours() > businessEndHour) {
        // Don't count beyond business hours
        const businessEnd = new Date(current);
        businessEnd.setHours(businessEndHour, 0, 0, 0);
        totalHours += (businessEnd.getTime() - current.getTime()) / (1000 * 60 * 60);
        current.setDate(current.getDate() + 1);
        current.setHours(businessStartHour, 0, 0, 0);
      } else {
        totalHours += 1;
        current = nextHour;
      }
    }
  }

  return totalHours;
}

// ── Helper: Calculate SLA score (0-100) ───────────────────────────────────
function calculateSLAScore(responseTimeHours: number, targetHours: number): number {
  if (responseTimeHours <= targetHours) {
    // On time: scale from 100 (instant) to 80 (at target)
    const ratio = responseTimeHours / targetHours;
    return Math.max(80, 100 - ratio * 20);
  } else {
    // Breached: scale from 79 (just over) to 0 (3x target)
    const overageRatio = (responseTimeHours - targetHours) / targetHours;
    const penalty = Math.min(79, overageRatio * 40);
    return Math.max(0, 79 - penalty);
  }
}

// ── Get SLA Config (for UI) ──────────────────────────────────────────────
export const getSLAConfig = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query('slaConfig').first();
    if (!config) {
      // Return default config without creating
      return {
        targetResponseTimeHours: 24,
        warningThresholdPercent: 75,
        criticalThresholdPercent: 90,
      };
    }
    return {
      targetResponseTimeHours: config.targetResponseTime,
      warningThresholdPercent: config.warningThreshold,
      criticalThresholdPercent: config.criticalThreshold,
    };
  },
});

// ── Get or Create Default SLA Config ──────────────────────────────────────
export const getOrCreateSLAConfig = query({
  args: {},
  handler: async (ctx) => {
    const configs = await ctx.db.query('slaConfig').take(SMALL_LIST_CAP);

    if (configs.length > 0) {
      return configs[0];
    }

    // Return default config (will be created on first update)
    return {
      targetResponseTime: 24, // 24 hours
      warningThreshold: 18, // 75% of target
      criticalThreshold: 22, // 90% of target
      businessHoursOnly: false,
      businessStartHour: 9,
      businessEndHour: 17,
      excludeWeekends: false,
      notifyOnWarning: true,
      notifyOnCritical: true,
      notifyOnBreach: true,
    };
  },
});

// ── Update SLA Configuration ──────────────────────────────────────────────
export const updateSLAConfig = mutation({
  args: {
    userId: v.id('users'),
    targetResponseTime: v.number(),
    warningThreshold: v.number(),
    criticalThreshold: v.number(),
    businessHoursOnly: v.boolean(),
    businessStartHour: v.number(),
    businessEndHour: v.number(),
    excludeWeekends: v.boolean(),
    notifyOnWarning: v.boolean(),
    notifyOnCritical: v.boolean(),
    notifyOnBreach: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId, ...config } = args;

    const existing = await ctx.db.query('slaConfig').first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...config,
        updatedBy: userId,
        updatedAt: Date.now(),
      });
      return existing._id;
    } else {
      return await ctx.db.insert('slaConfig', {
        ...config,
        updatedBy: userId,
        updatedAt: Date.now(),
      });
    }
  },
});

// ── Create SLA Metric (when leave request is created) ────────────────────
export const createSLAMetric = mutation({
  args: {
    leaveRequestId: v.id('leaveRequests'),
  },
  handler: async (ctx, args) => {
    const { leaveRequestId } = args;
    const leave = await ctx.db.get(leaveRequestId);
    if (!leave) throw new Error('Leave request not found');

    const config = await ctx.db.query('slaConfig').first();
    const targetResponseTime = config?.targetResponseTime ?? 24;

    return await ctx.db.insert('slaMetrics', {
      leaveRequestId,
      submittedAt: leave.createdAt,
      targetResponseTime,
      status: 'pending',
      warningTriggered: false,
      criticalTriggered: false,
      createdAt: Date.now(),
    });
  },
});

// ── Update SLA Metric (when leave is approved/rejected) ──────────────────
export const updateSLAMetric = mutation({
  args: {
    leaveRequestId: v.id('leaveRequests'),
  },
  handler: async (ctx, args) => {
    const { leaveRequestId } = args;
    const leave = await ctx.db.get(leaveRequestId);
    if (!leave || !leave.reviewedAt) throw new Error('Leave not reviewed');

    const metric = await ctx.db
      .query('slaMetrics')
      .withIndex('by_leave', (q) => q.eq('leaveRequestId', leaveRequestId))
      .first();

    if (!metric) throw new Error('SLA metric not found');

    const config = await ctx.db.query('slaConfig').first();

    const responseTimeHours = calculateResponseTime(
      metric.submittedAt,
      leave.reviewedAt,
      config?.businessHoursOnly ?? false,
      config?.businessStartHour ?? 9,
      config?.businessEndHour ?? 17,
      config?.excludeWeekends ?? false,
    );

    const slaScore = calculateSLAScore(responseTimeHours, metric.targetResponseTime);
    const status = responseTimeHours <= metric.targetResponseTime ? 'on_time' : 'breached';

    await ctx.db.patch(metric._id, {
      respondedAt: leave.reviewedAt,
      responseTimeHours,
      slaScore,
      status,
    });

    return metric._id;
  },
});

// ── Get SLA Dashboard Stats ───────────────────────────────────────────────
export const getSLAStats = query({
  args: {
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const { startDate, endDate, organizationId } = args;
    let metrics = await ctx.db.query('slaMetrics').take(XLARGE_LIST_CAP);

    // Filter by organization if provided
    if (organizationId) {
      metrics = metrics.filter((m) => m.organizationId === organizationId);
    }

    // Filter by date range if provided
    if (startDate) {
      metrics = metrics.filter((m) => m.submittedAt >= startDate);
    }
    if (endDate) {
      metrics = metrics.filter((m) => m.submittedAt <= endDate);
    }
    if (endDate) {
      metrics = metrics.filter((m) => m.submittedAt <= endDate);
    }

    const total = metrics.length;
    const pending = metrics.filter((m) => m.status === 'pending').length;
    const onTime = metrics.filter((m) => m.status === 'on_time').length;
    const breached = metrics.filter((m) => m.status === 'breached').length;

    const completed = metrics.filter((m) => m.responseTimeHours !== undefined);
    const avgResponseTime =
      completed.length > 0
        ? completed.reduce((sum, m) => sum + (m.responseTimeHours ?? 0), 0) / completed.length
        : 0;

    const avgSLAScore =
      completed.length > 0
        ? completed.reduce((sum, m) => sum + (m.slaScore ?? 0), 0) / completed.length
        : 0;

    const complianceRate = total > 0 ? (onTime / (onTime + breached)) * 100 : 100;

    // Get config
    const config = await ctx.db.query('slaConfig').first();
    const targetResponseTime = config?.targetResponseTime ?? 24;

    // Check pending requests for warnings
    const now = Date.now();
    const warningCount = metrics.filter((m) => {
      if (m.status !== 'pending') return false;
      const elapsed = (now - m.submittedAt) / (1000 * 60 * 60);
      return elapsed >= (config?.warningThreshold ?? 18);
    }).length;

    const criticalCount = metrics.filter((m) => {
      if (m.status !== 'pending') return false;
      const elapsed = (now - m.submittedAt) / (1000 * 60 * 60);
      return elapsed >= (config?.criticalThreshold ?? 22);
    }).length;

    return {
      total,
      pending,
      onTime,
      breached,
      avgResponseTime: Math.round(avgResponseTime * 10) / 10,
      avgSLAScore: Math.round(avgSLAScore * 10) / 10,
      complianceRate: Math.round(complianceRate * 10) / 10,
      targetResponseTime,
      warningCount,
      criticalCount,
    };
  },
});

// ── Get Pending Requests with SLA Info ────────────────────────────────────
export const getPendingWithSLA = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const { organizationId } = args;
    let pendingLeaves = await ctx.db
      .query('leaveRequests')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .take(DEFAULT_LIST_CAP);

    // Filter by organization if provided
    if (organizationId) {
      pendingLeaves = pendingLeaves.filter((l) => l.organizationId === organizationId);
    }

    const config = await ctx.db.query('slaConfig').first();
    const now = Date.now();

    // Batch-load all unique user IDs upfront to avoid N+1 queries
    const uniqueUserIds = [...new Set(pendingLeaves.map((l) => l.userId))];
    const usersBatch = await Promise.all(uniqueUserIds.map((id) => ctx.db.get(id)));
    const profilesBatch = await Promise.all(uniqueUserIds.map((id) => getProfile(ctx, id)));
    const userMap = new Map(
      usersBatch.filter((u): u is NonNullable<typeof u> => u !== null).map((u) => [u._id, u]),
    );
    const profileMap = new Map(uniqueUserIds.map((id, i) => [id, profilesBatch[i]]));

    // Batch-load all SLA metrics for the pending leaves
    const allMetrics = await ctx.db.query('slaMetrics').take(XLARGE_LIST_CAP);
    const metricsByLeave = new Map(allMetrics.map((m) => [m.leaveRequestId, m]));

    return pendingLeaves.map((leave) => {
      const user = userMap.get(leave.userId);
      const profile = profileMap.get(leave.userId);
      const metric = metricsByLeave.get(leave._id);

      const elapsedHours = (now - leave.createdAt) / (1000 * 60 * 60);
      const targetHours = metric?.targetResponseTime ?? config?.targetResponseTime ?? 24;
      const remainingHours = Math.max(0, targetHours - elapsedHours);
      const progressPercent = Math.min(100, (elapsedHours / targetHours) * 100);

      let slaStatus: 'normal' | 'warning' | 'critical' | 'breached';
      if (elapsedHours >= targetHours) {
        slaStatus = 'breached';
      } else if (elapsedHours >= (config?.criticalThreshold ?? 22)) {
        slaStatus = 'critical';
      } else if (elapsedHours >= (config?.warningThreshold ?? 18)) {
        slaStatus = 'warning';
      } else {
        slaStatus = 'normal';
      }

      return {
        ...leave,
        userName: user?.name ?? 'Unknown',
        userEmail: user?.email ?? '',
        userDepartment: profile?.department ?? user?.department ?? '',
        userAvatarUrl: profile?.avatarUrl ?? user?.avatarUrl,
        sla: {
          elapsedHours: Math.round(elapsedHours * 10) / 10,
          remainingHours: Math.round(remainingHours * 10) / 10,
          targetHours,
          progressPercent: Math.round(progressPercent),
          status: slaStatus,
        },
      };
    });
  },
});

// ── Get SLA Trend Data (for charts) ───────────────────────────────────────
export const getSLATrend = query({
  args: {
    days: v.number(), // Last N days
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const { days, organizationId } = args;
    const startDate = Date.now() - days * 24 * 60 * 60 * 1000;
    let metrics = await ctx.db
      .query('slaMetrics')
      .withIndex('by_submitted')
      .filter((q) => q.gte(q.field('submittedAt'), startDate))
      .take(DEFAULT_LIST_CAP);

    // Filter by organization if provided
    if (organizationId) {
      metrics = metrics.filter((m) => m.organizationId === organizationId);
    }

    // Group by day
    const dailyData: Record<
      string,
      { date: string; onTime: number; breached: number; avgResponseTime: number; count: number }
    > = {};

    metrics.forEach((metric) => {
      const date = new Date(metric.submittedAt).toISOString().split('T')[0] || '';
      if (!date) return;

      if (!dailyData[date]) {
        dailyData[date] = { date, onTime: 0, breached: 0, avgResponseTime: 0, count: 0 };
      }

      if (metric.status === 'on_time') {
        dailyData[date]!.onTime++;
      } else if (metric.status === 'breached') {
        dailyData[date]!.breached++;
      }

      if (metric.responseTimeHours !== undefined) {
        dailyData[date]!.avgResponseTime += metric.responseTimeHours;
        dailyData[date]!.count++;
      }
    });

    // Calculate averages and convert to array
    return Object.values(dailyData)
      .map((day) => ({
        date: day.date,
        onTime: day.onTime,
        breached: day.breached,
        avgResponseTime:
          day.count > 0 ? Math.round((day.avgResponseTime / day.count) * 10) / 10 : 0,
        complianceRate:
          day.onTime + day.breached > 0
            ? Math.round((day.onTime / (day.onTime + day.breached)) * 100)
            : 100,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  },
});

('// �� Get All SLA Metrics (for dashboard) �����������������������������������');
('export const getAllSLAMetrics = query({');
('  args: {},');
('  handler: async (ctx) => {');
('    const metrics = await ctx.db.query("slaMetrics").take(DEFAULT_LIST_CAP);');
('    return metrics;');
('  },');
('});');
