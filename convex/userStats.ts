import { v } from 'convex/values';
import { query } from './_generated/server';
import { MAX_PAGE_SIZE } from './pagination';
import { getProfile } from './lib/userProfile';

/**
 * Get user statistics - UNIFIED VERSION matching mobile
 */
export const getUserStats = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const { userId } = args;
    const user = await ctx.db.get(userId);
    if (!user) {
      // User not found - return null instead of throwing
      return null;
    }

    const profile = await getProfile(ctx, userId);

    // Get user's leaves
    const userLeaves = await ctx.db
      .query('leaveRequests')
      .filter((q: any) => q.eq(q.field('userId'), userId))
      .order('desc')
      .take(MAX_PAGE_SIZE);

    // Calculate leave statistics
    const approved = userLeaves.filter((l: any) => l.status === 'approved');
    const pending = userLeaves.filter((l: any) => l.status === 'pending');
    const rejected = userLeaves.filter((l: any) => l.status === 'rejected');

    const totalDaysUsed = approved.reduce((sum, l) => sum + (l.days ?? 0), 0);
    const totalDaysPending = pending.reduce((sum, l) => sum + (l.days ?? 0), 0);

    // Get user's tasks
    const userTasks = await ctx.db
      .query('tasks')
      .filter((q: any) => q.eq(q.field('assignedTo'), userId))
      .order('desc')
      .take(MAX_PAGE_SIZE);

    const completedTasks = userTasks.filter((t: any) => t.status === 'completed').length;
    const totalTasks = userTasks.length;
    const taskCompletionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    // Get user's messages/activity
    const userMessages = await ctx.db
      .query('chatMessages')
      .filter((q: any) => q.eq(q.field('senderId'), userId))
      .order('desc')
      .take(MAX_PAGE_SIZE);

    // Get attendance records if available
    const attendanceStats = {
      presentDays: 0,
      absentDays: 0,
      leaveDays: totalDaysUsed,
      totalWorkingDays: 0,
    };

    // Attendance table not available in this schema
    // Attendance data would be tracked through timeTracking or other modules

    // Calculate leave balances
    const leaveBalances = {
      paid: profile?.paidLeaveBalance ?? user.paidLeaveBalance ?? 20,
      sick: profile?.sickLeaveBalance ?? user.sickLeaveBalance ?? 10,
      family: profile?.familyLeaveBalance ?? user.familyLeaveBalance ?? 5,
    };

    // Count projects from tasks
    const projects = new Set(
      userTasks.filter((t: any) => t.projectId).map((t: any) => t.projectId),
    );

    return {
      userId: user._id,
      userName: user.name,
      department: profile?.department ?? user.department,
      position: profile?.position ?? user.position ?? 'N/A',
      avatar: profile?.avatarUrl ?? user.avatarUrl,
      joinDate: user.createdAt,

      leaveStats: {
        totalDaysUsed,
        totalDaysPending,
        approvedLeaves: approved.length,
        pendingLeaves: pending.length,
        rejectedLeaves: rejected.length,
        balances: leaveBalances,
      },

      taskStats: {
        totalTasks,
        completedTasks,
        completionRate: Math.round(taskCompletionRate),
        pendingTasks: userTasks.filter((t: any) => t.status !== 'completed').length,
      },

      activityStats: {
        totalMessages: userMessages.length,
        lastActive:
          userMessages.length > 0
            ? Math.max(...userMessages.map((m: any) => m.createdAt ?? 0))
            : null,
      },

      attendanceStats,

      // Legacy fields for backward compatibility
      daysActive: Math.floor((Date.now() - (user.createdAt ?? Date.now())) / (1000 * 60 * 60 * 24)),
      tasksCompleted: completedTasks,
      leavesTaken: approved.length,
      projects: projects.size,

      // Overall productivity score (0-100)
      productivityScore: Math.round(
        taskCompletionRate * 0.4 +
          Math.min(userMessages.length / 100, 1) * 100 * 0.3 +
          (attendanceStats.presentDays > 0
            ? (attendanceStats.presentDays /
                (attendanceStats.presentDays + attendanceStats.absentDays)) *
              100 *
              0.3
            : 0),
      ),
    };
  },
});
