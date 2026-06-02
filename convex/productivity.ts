import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { isSuperadmin } from './lib/auth';
import { DEFAULT_LIST_CAP, XLARGE_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';
import { getAuthCaller } from './lib/getAuthCaller';

// ─────────────────────────────────────────────────────────────────────────────
// GET TODAY'S STATS FOR USER
// ─────────────────────────────────────────────────────────────────────────────
export const getTodayStats = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekStartMs = weekStart.getTime();

    // Get today's time tracking
    const todayTracking = await ctx.db
      .query('timeTracking')
      .filter((q) =>
        q.and(q.eq(q.field('userId'), userId), q.gte(q.field('checkInTime'), todayStartMs)),
      )
      .order('desc')
      .first();

    // Calculate hours worked today
    let hoursWorkedToday = 0;
    if (todayTracking && todayTracking.totalWorkedMinutes) {
      hoursWorkedToday = todayTracking.totalWorkedMinutes / 60;
    }

    // Get week's time tracking for weekly hours (S refactor: use by_user index)
    const weekTracking = await ctx.db
      .query('timeTracking')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .filter((q) => q.gte(q.field('checkInTime'), weekStartMs))
      .take(DEFAULT_LIST_CAP);

    let hoursWorkedWeek = 0;
    weekTracking.forEach((tt) => {
      if (tt.totalWorkedMinutes) {
        hoursWorkedWeek += tt.totalWorkedMinutes / 60;
      }
    });

    // Get tasks (S refactor: use by_assigned_to index)
    const allTasks = await ctx.db
      .query('tasks')
      .withIndex('by_assigned_to', (q) => q.eq('assignedTo', userId))
      .take(DEFAULT_LIST_CAP);

    const completedTasksToday = allTasks.filter(
      (t) => t.status === 'completed' && t.updatedAt && t.updatedAt >= todayStartMs,
    ).length;

    const completedTasksWeek = allTasks.filter(
      (t) => t.status === 'completed' && t.updatedAt && t.updatedAt >= weekStartMs,
    ).length;

    const totalTasksWeek = allTasks.filter((t) => t.createdAt && t.createdAt >= weekStartMs).length;

    // Get today's deadlines
    const todayEnd = todayStart.getTime() + 24 * 60 * 60 * 1000;
    const todayDeadlines = allTasks.filter(
      (t) =>
        t.deadline &&
        t.deadline >= todayStartMs &&
        t.deadline < todayEnd &&
        t.status !== 'completed',
    ).length;

    // Weekly goal progress (target: 40 hours)
    const weeklyGoalTarget = 40;
    const weeklyGoalProgress = Math.min(100, (hoursWorkedWeek / weeklyGoalTarget) * 100);

    return {
      hoursWorkedToday: Math.round(hoursWorkedToday * 10) / 10,
      hoursWorkedWeek: Math.round(hoursWorkedWeek * 10) / 10,
      completedTasksToday,
      completedTasksWeek,
      totalTasksWeek,
      todayDeadlines,
      weeklyGoalProgress: Math.round(weeklyGoalProgress),
      isClockedIn: !!todayTracking && todayTracking.status === 'checked_in',
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET TODAY'S PRIORITY TASKS (Top 3)
// ─────────────────────────────────────────────────────────────────────────────
export const getTodayTasks = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_assigned_to', (q) => q.eq('assignedTo', userId))
      .filter((q) => q.neq(q.field('status'), 'completed'))
      .take(DEFAULT_LIST_CAP);

    // Sort by priority and deadline
    const priorityMap: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
    const sorted = tasks.sort((a, b) => {
      const priorityDiff = (priorityMap[b.priority] || 0) - (priorityMap[a.priority] || 0);
      if (priorityDiff !== 0) return priorityDiff;

      if (a.deadline && b.deadline) return a.deadline - b.deadline;
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return 0;
    });

    return sorted.slice(0, 3);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET TEAM PRESENCE (who's online)
// ─────────────────────────────────────────────────────────────────────────────
export const getTeamPresence = query({
  args: {},
  handler: async (ctx) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) return [];

    const userIsSuperadmin = isSuperadmin(requester);

    // S refactor: scope by org via by_org index when not superadmin; XLARGE fallback.
    let users =
      !userIsSuperadmin && requester.organizationId
        ? await ctx.db
            .query('users')
            .withIndex('by_org', (q) => q.eq('organizationId', requester.organizationId!))
            .take(DEFAULT_LIST_CAP)
        : await ctx.db.query('users').take(XLARGE_LIST_CAP);

    // Filter by organization if not superadmin
    if (!userIsSuperadmin) {
      if (!requester.organizationId) {
        throw new Error('User does not belong to an organization');
      }
      users = users.filter((u) => u.organizationId === requester.organizationId);
    }

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0] || '';

    // Get only active users with presence status (exclude superadmins)
    const onlineUsers = await Promise.all(
      users
        .filter((u) => u.isActive && u.presenceStatus && u.role !== 'superadmin')
        .map(async (u) => {
          const profile = await getProfile(ctx, u._id);
          // Check if user has an approved leave today
          let effectivePresenceStatus = profile?.presenceStatus ?? u.presenceStatus!;

          const approvedLeaves = await ctx.db
            .query('leaveRequests')
            .withIndex('by_user', (q) => q.eq('userId', u._id))
            .filter((q) => q.eq(q.field('status'), 'approved'))
            .take(DEFAULT_LIST_CAP);

          const hasActiveLeave = approvedLeaves.some((leave) => {
            return leave.startDate <= today && today <= leave.endDate;
          });

          if (hasActiveLeave) {
            effectivePresenceStatus = 'out_of_office';
          }

          return {
            _id: u._id,
            name: u.name,
            avatarUrl: profile?.avatarUrl ?? u.avatarUrl,
            presenceStatus: effectivePresenceStatus,
            department: profile?.department ?? u.department,
            role: u.role,
          };
        }),
    );

    return onlineUsers.slice(0, 10); // Limit to 10 for performance
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// POMODORO TIMER TRACKING
// ─────────────────────────────────────────────────────────────────────────────
export const startPomodoroSession = mutation({
  args: {
    userId: v.id('users'),
    duration: v.number(), // in minutes
    taskId: v.optional(v.id('tasks')),
  },
  handler: async (ctx, { userId, duration, taskId }) => {
    const sessionId = await ctx.db.insert('pomodoroSessions', {
      userId,
      taskId,
      startTime: Date.now(),
      duration: duration * 60 * 1000,
      endTime: Date.now() + duration * 60 * 1000,
      completed: false,
      interrupted: false,
    });

    return sessionId;
  },
});

export const completePomodoroSession = mutation({
  args: { sessionId: v.id('pomodoroSessions') },
  handler: async (ctx, { sessionId }) => {
    await ctx.db.patch(sessionId, {
      completed: true,
      actualEndTime: Date.now(),
    });
  },
});

export const interruptPomodoroSession = mutation({
  args: { sessionId: v.id('pomodoroSessions') },
  handler: async (ctx, { sessionId }) => {
    await ctx.db.patch(sessionId, {
      interrupted: true,
      actualEndTime: Date.now(),
    });
  },
});

export const getActivePomodoroSession = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const session = await ctx.db
      .query('pomodoroSessions')
      .filter((q) =>
        q.and(
          q.eq(q.field('userId'), userId),
          q.eq(q.field('completed'), false),
          q.eq(q.field('interrupted'), false),
        ),
      )
      .order('desc')
      .first();

    return session;
  },
});
