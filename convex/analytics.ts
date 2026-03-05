import { query } from "./_generated/server";
import { v } from "convex/values";

// ── Get analytics overview ─────────────────────────────────────────────────
export const getAnalyticsOverview = query({
  args: { organizationId: v.optional(v.id("organizations")) },
  handler: async (ctx, { organizationId }) => {
    let users, leaves;

    if (organizationId) {
      // Get organization-specific data
      users = await ctx.db
        .query("users")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect();
      
      leaves = await ctx.db
        .query("leaveRequests")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect();
    } else {
      // Get all data
      users = await ctx.db.query("users").collect();
      leaves = await ctx.db.query("leaveRequests").collect();
    }

    const totalEmployees = users.filter(u => u.isActive).length;
    const pendingApprovals = users.filter(u => !u.isApproved && u.isActive).length;
    
    const totalLeaves = leaves.length;
    const pendingLeaves = leaves.filter(l => l.status === "pending").length;
    const approvedLeaves = leaves.filter(l => l.status === "approved").length;
    
    // Calculate average approval time (in hours)
    const approvedWithTime = leaves.filter(l => 
      l.status === "approved" && l.reviewedAt && l.createdAt
    );
    const avgApprovalTime = approvedWithTime.length > 0
      ? approvedWithTime.reduce((sum, l) => 
          sum + ((l.reviewedAt! - l.createdAt) / (1000 * 60 * 60)), 0
        ) / approvedWithTime.length
      : 0;

    // Department breakdown
    const departments = users.reduce((acc, user) => {
      const dept = user.department || "Unassigned";
      acc[dept] = (acc[dept] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalEmployees,
      pendingApprovals,
      totalLeaves,
      pendingLeaves,
      approvedLeaves,
      avgApprovalTime: Math.round(avgApprovalTime * 10) / 10,
      departments,
      users,
      leaves,
    };
  },
});

// ── Get department statistics ──────────────────────────────────────────────
export const getDepartmentStats = query({
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
    
    const stats = users.reduce((acc, user) => {
      const dept = user.department || "Unassigned";
      if (!acc[dept]) {
        acc[dept] = {
          department: dept,
          employees: 0,
          totalPaidLeave: 0,
          totalSickLeave: 0,
          totalFamilyLeave: 0,
          avgPaidLeave: 0,
          avgSickLeave: 0,
          avgFamilyLeave: 0,
        };
      }
      acc[dept].employees += 1;
      acc[dept].totalPaidLeave += user.paidLeaveBalance;
      acc[dept].totalSickLeave += user.sickLeaveBalance;
      acc[dept].totalFamilyLeave += user.familyLeaveBalance;
      return acc;
    }, {} as Record<string, any>);

    // Calculate averages
    Object.values(stats).forEach((dept: any) => {
      dept.avgPaidLeave = Math.round(dept.totalPaidLeave / dept.employees);
      dept.avgSickLeave = Math.round(dept.totalSickLeave / dept.employees);
      dept.avgFamilyLeave = Math.round(dept.totalFamilyLeave / dept.employees);
    });

    return Object.values(stats);
  },
});

// ── Get leave trends (last 6 months) ───────────────────────────────────────
export const getLeaveTrends = query({
  args: { requesterId: v.id("users") },
  handler: async (ctx, { requesterId }) => {
    const requester = await ctx.db.get(requesterId);
    if (!requester) throw new Error("Requester not found");

    const SUPERADMIN_EMAIL = "romangulanyan@gmail.com";
    const isSuperadmin = requester.email.toLowerCase() === SUPERADMIN_EMAIL;

    let leaves = await ctx.db.query("leaveRequests").collect();
    
    // Filter by organization if not superadmin
    if (!isSuperadmin) {
      if (!requester.organizationId) {
        throw new Error("User does not belong to an organization");
      }
      leaves = leaves.filter(l => l.organizationId === requester.organizationId);
    }
    
    const now = Date.now();
    const sixMonthsAgo = now - (6 * 30 * 24 * 60 * 60 * 1000);
    
    const recentLeaves = leaves.filter(l => l.createdAt >= sixMonthsAgo);

    return recentLeaves;
  },
});

// ── Get user personal analytics ────────────────────────────────────────────
export const getUserAnalytics = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const userLeaves = await ctx.db
      .query("leaveRequests")
      .filter(q => q.eq(q.field("userId"), userId))
      .collect();

    const totalDaysTaken = userLeaves
      .filter(l => l.status === "approved")
      .reduce((sum, l) => sum + l.days, 0);

    const pendingDays = userLeaves
      .filter(l => l.status === "pending")
      .reduce((sum, l) => sum + l.days, 0);

    const leavesByType = userLeaves.reduce((acc, leave) => {
      acc[leave.type] = (acc[leave.type] || 0) + (leave.status === "approved" ? leave.days : 0);
      return acc;
    }, {} as Record<string, number>);

    return {
      user,
      totalDaysTaken,
      pendingDays,
      leavesByType,
      userLeaves,
      balances: {
        paid: user.paidLeaveBalance,
        sick: user.sickLeaveBalance,
        family: user.familyLeaveBalance,
      },
    };
  },
});

// ── Get team calendar (who's on leave) ────────────────────────────────────
export const getTeamCalendar = query({
  args: { requesterId: v.id("users") },
  handler: async (ctx, { requesterId }) => {
    const requester = await ctx.db.get(requesterId);
    if (!requester) throw new Error("Requester not found");

    const SUPERADMIN_EMAIL = "romangulanyan@gmail.com";
    const isSuperadmin = requester.email.toLowerCase() === SUPERADMIN_EMAIL;

    let leaves = await ctx.db
      .query("leaveRequests")
      .filter(q => q.eq(q.field("status"), "approved"))
      .collect();

    // Filter by organization if not superadmin
    if (!isSuperadmin) {
      if (!requester.organizationId) {
        throw new Error("User does not belong to an organization");
      }
      leaves = leaves.filter(l => l.organizationId === requester.organizationId);
    }

    const now = Date.now();
    const thirtyDaysFromNow = now + (30 * 24 * 60 * 60 * 1000);

    // Get leaves in the next 30 days
    const upcomingLeaves = leaves.filter(l => {
      const startDate = new Date(l.startDate).getTime();
      const endDate = new Date(l.endDate).getTime();
      return (startDate <= thirtyDaysFromNow && endDate >= now);
    });

    // Enrich with user data
    const enrichedLeaves = await Promise.all(
      upcomingLeaves.map(async (leave) => {
        const user = await ctx.db.get(leave.userId);
        return {
          ...leave,
          userName: user?.name || "Unknown",
          userDepartment: user?.department,
        };
      })
    );

    return enrichedLeaves;
  },
});
