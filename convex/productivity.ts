import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ─────────────────────────────────────────────────────────────────────────────
// GET TODAY'S STATS FOR USER
// ─────────────────────────────────────────────────────────────────────────────
export const getTodayStats = query({
  args: { userId: v.id("users") },
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
      .query("timeTracking")
      .filter((q) => 
        q.and(
          q.eq(q.field("userId"), userId),
          q.gte(q.field("checkInTime"), todayStartMs)
        )
      )
      .order("desc")
      .first();

    // Calculate hours worked today
    let hoursWorkedToday = 0;
    if (todayTracking && todayTracking.totalWorkedMinutes) {
      hoursWorkedToday = todayTracking.totalWorkedMinutes / 60;
    }

    // Get week's time tracking for weekly hours
    const weekTracking = await ctx.db
      .query("timeTracking")
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), userId),
          q.gte(q.field("checkInTime"), weekStartMs)
        )
      )
      .collect();

    let hoursWorkedWeek = 0;
    weekTracking.forEach((tt) => {
      if (tt.totalWorkedMinutes) {
        hoursWorkedWeek += tt.totalWorkedMinutes / 60;
      }
    });

    // Get tasks
    const allTasks = await ctx.db
      .query("tasks")
      .filter((q) => q.eq(q.field("assignedTo"), userId))
      .collect();

    const completedTasksToday = allTasks.filter(
      (t) => t.status === "completed" && t.updatedAt && t.updatedAt >= todayStartMs
    ).length;

    const completedTasksWeek = allTasks.filter(
      (t) => t.status === "completed" && t.updatedAt && t.updatedAt >= weekStartMs
    ).length;

    const totalTasksWeek = allTasks.filter(
      (t) => t.createdAt && t.createdAt >= weekStartMs
    ).length;

    // Get today's deadlines
    const todayEnd = todayStart.getTime() + 24 * 60 * 60 * 1000;
    const todayDeadlines = allTasks.filter(
      (t) => 
        t.deadline && 
        t.deadline >= todayStartMs && 
        t.deadline < todayEnd &&
        t.status !== "completed"
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
      isClockedIn: !!todayTracking && todayTracking.status === "checked_in",
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET TODAY'S PRIORITY TASKS (Top 3)
// ─────────────────────────────────────────────────────────────────────────────
export const getTodayTasks = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const tasks = await ctx.db
      .query("tasks")
      .filter((q) => 
        q.and(
          q.eq(q.field("assignedTo"), userId),
          q.neq(q.field("status"), "completed")
        )
      )
      .collect();

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
  args: { requesterId: v.id("users") },
  handler: async (ctx, { requesterId }) => {
    const requester = await ctx.db.get(requesterId);
    if (!requester) throw new Error("Requester not found");

    const SUPERADMIN_EMAIL = "romangulanyan@gmail.com";
    const isSuperadmin = requester.email.toLowerCase() === SUPERADMIN_EMAIL;

    let users = await ctx.db.query("users").collect();
    
    // Filter by organization if not superadmin
    if (!isSuperadmin) {
      if (!requester.organizationId) {
        throw new Error("User does not belong to an organization");
      }
      users = users.filter(u => u.organizationId === requester.organizationId);
    }

    // Get only active users with presence status
    const onlineUsers = users
      .filter(u => u.isActive && u.presenceStatus)
      .map(u => ({
        _id: u._id,
        name: u.name,
        avatarUrl: u.avatarUrl,
        presenceStatus: u.presenceStatus!,
        department: u.department,
        role: u.role,
      }))
      .slice(0, 10); // Limit to 10 for performance

    return onlineUsers;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// POMODORO TIMER TRACKING
// ─────────────────────────────────────────────────────────────────────────────
export const startPomodoroSession = mutation({
  args: {
    userId: v.id("users"),
    duration: v.number(), // in minutes
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, { userId, duration, taskId }) => {
    const sessionId = await ctx.db.insert("pomodoroSessions", {
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
  args: { sessionId: v.id("pomodoroSessions") },
  handler: async (ctx, { sessionId }) => {
    await ctx.db.patch(sessionId, {
      completed: true,
      actualEndTime: Date.now(),
    });
  },
});

export const interruptPomodoroSession = mutation({
  args: { sessionId: v.id("pomodoroSessions") },
  handler: async (ctx, { sessionId }) => {
    await ctx.db.patch(sessionId, {
      interrupted: true,
      actualEndTime: Date.now(),
    });
  },
});

export const getActivePomodoroSession = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const session = await ctx.db
      .query("pomodoroSessions")
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), userId),
          q.eq(q.field("completed"), false),
          q.eq(q.field("interrupted"), false)
        )
      )
      .order("desc")
      .first();

    return session;
  },
});
