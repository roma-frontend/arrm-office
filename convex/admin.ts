import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Get cost analysis data for admin dashboard
 */
export const getCostAnalysis = query({
  args: {
    period: v.optional(v.union(v.literal("month"), v.literal("quarter"), v.literal("year"))),
  },
  handler: async (ctx, args) => {
    const period = args.period || "month";
    
    // Calculate date range
    const now = new Date();
    let startDate: Date;
    
    if (period === "month") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === "quarter") {
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
    } else {
      startDate = new Date(now.getFullYear(), 0, 1);
    }
    
    const startTimestamp = startDate.getTime();
    
    // Get all approved leave requests in the period
    const leaves = await ctx.db
      .query("leaveRequests")
      .filter((q) => 
        q.and(
          q.eq(q.field("status"), "approved"),
          q.gte(q.field("createdAt"), startTimestamp)
        )
      )
      .collect();
    
    // Get all users
    const users = await ctx.db.query("users").collect();
    const userMap = new Map(users.map(u => [u._id, u]));
    
    // Calculate costs by department
    const departmentCosts = new Map<string, number>();
    const typeCosts = new Map<string, number>();
    let totalCost = 0;
    
    for (const leave of leaves) {
      const user = userMap.get(leave.userId);
      if (!user) continue;
      
      // Simplified cost calculation: assume average daily cost
      // In reality, you'd want to store salary information
      const dailyCost = user.employeeType === "contractor" ? 150 : 200; // USD per day
      const cost = leave.days * dailyCost;
      
      totalCost += cost;
      
      // By department
      const dept = user.department || "Unknown";
      departmentCosts.set(dept, (departmentCosts.get(dept) || 0) + cost);
      
      // By type
      typeCosts.set(leave.type, (typeCosts.get(leave.type) || 0) + cost);
    }
    
    return {
      totalCost,
      byDepartment: Array.from(departmentCosts.entries()).map(([name, cost]) => ({
        name,
        cost,
        percentage: (cost / totalCost) * 100,
      })),
      byType: Array.from(typeCosts.entries()).map(([type, cost]) => ({
        type,
        cost,
        percentage: (cost / totalCost) * 100,
      })),
      totalDays: leaves.reduce((sum, l) => sum + l.days, 0),
      totalLeaves: leaves.length,
    };
  },
});

/**
 * Detect conflicts in leave schedules
 */
export const detectConflicts = query({
  args: {},
  handler: async (ctx) => {
    // Get all approved and pending leaves
    const leaves = await ctx.db
      .query("leaveRequests")
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "approved"),
          q.eq(q.field("status"), "pending")
        )
      )
      .collect();
    
    // Get all users
    const users = await ctx.db.query("users").collect();
    const userMap = new Map(users.map(u => [u._id, u]));
    
    // Group by department and date
    const conflicts: Array<{
      id: string;
      department: string;
      date: string;
      employeesOut: string[];
      severity: "critical" | "warning" | "info";
      recommendation: string;
    }> = [];
    
    // Group leaves by department
    const deptLeaves = new Map<string, typeof leaves>();
    for (const leave of leaves) {
      const user = userMap.get(leave.userId);
      if (!user) continue;
      
      const dept = user.department || "Unknown";
      if (!deptLeaves.has(dept)) {
        deptLeaves.set(dept, []);
      }
      deptLeaves.get(dept)!.push(leave);
    }
    
    // Check each department for conflicts
    for (const [dept, deptLeaveList] of deptLeaves.entries()) {
      // Get department size
      const deptUsers = users.filter(u => (u.department || "Unknown") === dept);
      const deptSize = deptUsers.length;
      
      // Check each day for overlaps
      const dateOverlaps = new Map<string, Set<string>>();
      
      for (const leave of deptLeaveList) {
        const start = new Date(leave.startDate);
        const end = new Date(leave.endDate);
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          if (!dateOverlaps.has(dateStr)) {
            dateOverlaps.set(dateStr, new Set());
          }
          const user = userMap.get(leave.userId);
          if (user) {
            dateOverlaps.get(dateStr)!.add(user.name);
          }
        }
      }
      
      // Identify conflicts
      for (const [date, employeesOut] of dateOverlaps.entries()) {
        const outCount = employeesOut.size;
        const percentage = (outCount / deptSize) * 100;
        
        if (percentage >= 50) {
          conflicts.push({
            id: `${dept}-${date}`,
            department: dept,
            date,
            employeesOut: Array.from(employeesOut),
            severity: "critical",
            recommendation: `Critical: ${outCount}/${deptSize} employees out (${percentage.toFixed(0)}%). Consider rescheduling some leaves.`,
          });
        } else if (percentage >= 30) {
          conflicts.push({
            id: `${dept}-${date}`,
            department: dept,
            date,
            employeesOut: Array.from(employeesOut),
            severity: "warning",
            recommendation: `Warning: ${outCount}/${deptSize} employees out (${percentage.toFixed(0)}%). Monitor workload.`,
          });
        }
      }
    }
    
    return conflicts.sort((a, b) => {
      if (a.severity === b.severity) return a.date.localeCompare(b.date);
      return a.severity === "critical" ? -1 : 1;
    });
  },
});

/**
 * Get smart suggestions for leave scheduling
 */
export const getSmartSuggestions = query({
  args: {},
  handler: async (ctx) => {
    const suggestions: Array<{
      id: string;
      title: string;
      description: string;
      impact: "high" | "medium" | "low";
      category: "optimization" | "cost" | "conflict" | "policy";
    }> = [];
    
    // Get all users and leaves
    const users = await ctx.db.query("users").collect();
    const leaves = await ctx.db
      .query("leaveRequests")
      .filter((q) => q.eq(q.field("status"), "approved"))
      .collect();
    
    // Suggestion 1: Users with high leave balances
    const highBalanceUsers = users.filter(u => {
      const totalBalance = u.paidLeaveBalance + u.sickLeaveBalance + u.familyLeaveBalance;
      return totalBalance > 30; // More than 30 days total
    });
    
    if (highBalanceUsers.length > 0) {
      suggestions.push({
        id: "high-balance",
        title: "Encourage Leave Usage",
        description: `${highBalanceUsers.length} employees have high leave balances (>30 days). Encourage them to use their leave to avoid year-end issues.`,
        impact: "medium",
        category: "policy",
      });
    }
    
    // Suggestion 2: Users with low balances
    const lowBalanceUsers = users.filter(u => {
      const totalBalance = u.paidLeaveBalance + u.sickLeaveBalance + u.familyLeaveBalance;
      return totalBalance < 5; // Less than 5 days total
    });
    
    if (lowBalanceUsers.length > 0) {
      suggestions.push({
        id: "low-balance",
        title: "Review Leave Policies",
        description: `${lowBalanceUsers.length} employees have very low leave balances (<5 days). Consider reviewing workload distribution.`,
        impact: "high",
        category: "policy",
      });
    }
    
    // Suggestion 3: Departments with no planned leaves
    const deptLeaves = new Map<string, number>();
    for (const leave of leaves) {
      const user = users.find(u => u._id === leave.userId);
      if (user) {
        const dept = user.department || "Unknown";
        deptLeaves.set(dept, (deptLeaves.get(dept) || 0) + 1);
      }
    }
    
    const allDepts = new Set(users.map(u => u.department || "Unknown"));
    const deptsWithoutLeaves = Array.from(allDepts).filter(d => !deptLeaves.has(d));
    
    if (deptsWithoutLeaves.length > 0) {
      suggestions.push({
        id: "no-planned-leaves",
        title: "Departments Without Planned Leaves",
        description: `${deptsWithoutLeaves.join(", ")} have no upcoming leaves. This might indicate burnout risk.`,
        impact: "medium",
        category: "optimization",
      });
    }
    
    // Suggestion 4: Cost optimization
    const contractorLeaves = leaves.filter(l => {
      const user = users.find(u => u._id === l.userId);
      return user?.employeeType === "contractor";
    });
    
    if (contractorLeaves.length > 0) {
      const totalDays = contractorLeaves.reduce((sum, l) => sum + l.days, 0);
      const estimatedCost = totalDays * 150; // $150/day for contractors
      
      suggestions.push({
        id: "contractor-costs",
        title: "Contractor Leave Costs",
        description: `${contractorLeaves.length} contractor leaves totaling ${totalDays} days. Estimated cost: $${estimatedCost.toLocaleString()}.`,
        impact: "high",
        category: "cost",
      });
    }
    
    return suggestions;
  },
});

/**
 * Get calendar export data
 */
export const getCalendarExportData = query({
  args: {
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get all approved leaves
    const leaves = await ctx.db
      .query("leaveRequests")
      .filter((q) => q.eq(q.field("status"), "approved"))
      .collect();
    
    // Get all users
    const users = await ctx.db.query("users").collect();
    const userMap = new Map(users.map(u => [u._id, u]));
    
    // Filter by date range if provided
    let filteredLeaves = leaves;
    if (args.startDate || args.endDate) {
      filteredLeaves = leaves.filter(leave => {
        if (args.startDate && leave.endDate < args.startDate) return false;
        if (args.endDate && leave.startDate > args.endDate) return false;
        return true;
      });
    }
    
    // Format for calendar export
    return filteredLeaves.map(leave => {
      const user = userMap.get(leave.userId);
      return {
        id: leave._id,
        title: `${user?.name || 'Unknown'} - ${leave.type} leave`,
        startDate: leave.startDate,
        endDate: leave.endDate,
        description: leave.reason,
        userName: user?.name || 'Unknown',
        department: user?.department || 'Unknown',
        type: leave.type,
      };
    });
  },
});

// ─── SERVICE BROADCASTS ────────────────────────────────────────────────────────

/**
 * Send a service broadcast message from superadmin to all users in an organization.
 * Creates a system announcements channel if it doesn't exist.
 */
export const sendServiceBroadcast = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),  // the superadmin making the request
    title: v.string(),       // e.g. "System Maintenance"
    content: v.string(),     // the announcement message
    icon: v.optional(v.string()),  // emoji e.g. "⚠️", "ℹ️", "🔧", "🎉"
    scheduledFor: v.optional(v.number()), // optional timestamp for scheduling
  },
  handler: async (ctx, args) => {
    console.log(`\n[sendServiceBroadcast] ===== STARTING BROADCAST FOR ORG: ${args.organizationId} =====\n`);
    
    // Verify user is superadmin
    const user = await ctx.db.get(args.userId);
    if (!user || user.role !== "superadmin") {
      throw new Error("Only superadmin can send service broadcasts");
    }

    console.log(`[sendServiceBroadcast] Superadmin: ${user.name} (${user.email})`);

    // Get or create the "System Announcements" group chat for this organization
    let announcementConv = await ctx.db
      .query("chatConversations")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .filter((q) => 
        q.and(
          q.eq(q.field("type"), "group"),
          q.eq(q.field("name"), "System Announcements"),
          q.eq(q.field("isDeleted"), false)
        )
      )
      .first();

    // If system announcements channel doesn't exist, create it
    if (!announcementConv) {
      const now = Date.now();
      const convId = await ctx.db.insert("chatConversations", {
        organizationId: args.organizationId,
        type: "group",
        name: "System Announcements",
        description: "Official company-wide announcements and service messages",
        createdBy: args.userId,
        createdAt: now,
        updatedAt: now,
        isArchived: false,
        isDeleted: false,
      });

      console.log(`[sendServiceBroadcast] Created new System Announcements conversation: ${convId}`);

      // Add all active, approved users to this channel
      const users = await ctx.db
        .query("users")
        .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
        .collect();

      console.log(`[sendServiceBroadcast] Initial creation: Found ${users.length} total users`);
      
      let addedCount = 0;
      for (const u of users) {
        if (u.isActive && u.isApproved) {
          console.log(`[sendServiceBroadcast] Adding initial member: ${u.name} (active:${u.isActive}, approved:${u.isApproved})`);
          await ctx.db.insert("chatMembers", {
            conversationId: convId,
            userId: u._id,
            organizationId: args.organizationId,
            role: u._id === args.userId ? "owner" : "member",
            unreadCount: 1, // Mark as unread for new members
            isMuted: false,
            joinedAt: now,
          });
          addedCount++;
        } else {
          console.log(`[sendServiceBroadcast] Skipping user ${u.name} - active:${u.isActive}, approved:${u.isApproved}`);
        }
      }

      // IMPORTANT: Always add the superadmin who created the channel as owner, even if not approved
      const superadminUser = await ctx.db.get(args.userId);
      if (superadminUser) {
        const superadminAlreadyAdded = users.some(u => u._id === args.userId && u.isActive && u.isApproved);
        if (!superadminAlreadyAdded) {
          console.log(`[sendServiceBroadcast] Adding superadmin to channel as owner: ${superadminUser.name}`);
          await ctx.db.insert("chatMembers", {
            conversationId: convId,
            userId: args.userId,
            organizationId: args.organizationId,
            role: "owner",
            unreadCount: 0, // Superadmin already saw it
            isMuted: false,
            joinedAt: now,
          });
          addedCount++;
        }
      }

      console.log(`[sendServiceBroadcast] Added ${addedCount} members to newly created System Announcements`);

      // Create the conversation object to use
      announcementConv = {
        _id: convId,
        _creationTime: now,
        organizationId: args.organizationId,
        type: "group",
        name: "System Announcements",
        description: "Official company-wide announcements and service messages",
        createdBy: args.userId,
        createdAt: now,
        updatedAt: now,
      } as any;
    }

    // Verify we have the conversation
    if (!announcementConv) {
      throw new Error("Failed to create or find system announcements channel");
    }

    console.log(`[sendServiceBroadcast] Organization ${args.organizationId} - System Announcements conversation: ${announcementConv._id}`);

    // Ensure all active, approved users are members of System Announcements channel
    // (needed for new users who joined after the channel was created)
    const allUsers = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    console.log(`[sendServiceBroadcast] Total users in org: ${allUsers.length}`);
    const activeApprovdUser = allUsers.filter(u => u.isActive && u.isApproved);
    console.log(`[sendServiceBroadcast] Active & approved users: ${activeApprovdUser.length}`);
    activeApprovdUser.forEach(u => console.log(`  - ${u.name} (${u.email}) - active:${u.isActive}, approved:${u.isApproved}`));

    const existingMembers = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversation", (q) => q.eq("conversationId", announcementConv._id))
      .collect();

    const existingMemberIds = new Set(existingMembers.map(m => m.userId.toString()));
    const newMemberIds: Id<"users">[] = [];

    console.log(`[sendServiceBroadcast] Existing members: ${existingMembers.length}, Active users: ${allUsers.filter(u => u.isActive && u.isApproved).length}`);

    // Add active, approved users
    for (const u of allUsers) {
      if (u.isActive && u.isApproved) {
        const userIdStr = u._id.toString();
        
        if (!existingMemberIds.has(userIdStr)) {
          console.log(`[sendServiceBroadcast] Adding new member: ${u.name} (${u._id})`);
          await ctx.db.insert("chatMembers", {
            conversationId: announcementConv._id,
            userId: u._id,
            organizationId: args.organizationId,
            role: u._id === args.userId ? "owner" : "member",
            unreadCount: 1,
            isMuted: false,
            joinedAt: Date.now(),
          });
          newMemberIds.push(u._id);
        } else {
          console.log(`[sendServiceBroadcast] User ${u.name} already a member`);
        }
      }
    }

    // IMPORTANT: Always ensure superadmin is a member as owner
    const superadminIdStr = args.userId.toString();
    if (!existingMemberIds.has(superadminIdStr)) {
      const superadminUser = await ctx.db.get(args.userId);
      if (superadminUser) {
        console.log(`[sendServiceBroadcast] Ensuring superadmin is member: ${superadminUser.name}`);
        await ctx.db.insert("chatMembers", {
          conversationId: announcementConv._id,
          userId: args.userId,
          organizationId: args.organizationId,
          role: "owner",
          unreadCount: 0, // Superadmin already saw it
          isMuted: false,
          joinedAt: Date.now(),
        });
        newMemberIds.push(args.userId);
      }
    }

    console.log(`[sendServiceBroadcast] Added ${newMemberIds.length} new members to System Announcements`);

    // Send the service broadcast message
    const now = Date.now();
    const broadcastMessage = {
      conversationId: announcementConv._id,
      organizationId: args.organizationId,
      senderId: args.userId,
      type: "system" as const,
      content: args.content,
      isServiceBroadcast: true,
      broadcastTitle: args.title,
      broadcastIcon: args.icon || "ℹ️",
      createdAt: now,
      // Include optional fields to ensure message is complete
      readBy: [] as any[],
      reactions: undefined,
      mentionedUserIds: undefined,
      threadCount: 0,
      isEdited: false,
      isDeleted: false,
      isPinned: false,
    };
    
    const msgId = await ctx.db.insert("chatMessages", broadcastMessage);
    
    console.log(`[sendServiceBroadcast] Message created: ${msgId} in conversation ${announcementConv._id}`);

    // Update conversation last message
    const preview = args.content.length > 100 ? args.content.slice(0, 100) + "…" : args.content;
    await ctx.db.patch(announcementConv._id, {
      lastMessageAt: now,
      lastMessageText: `[${args.title}] ${preview}`,
      lastMessageSenderId: args.userId,
      updatedAt: now,
    });

    // Mark as unread for existing members (except the sender)
    // New members already have unreadCount=1 from being added above
    const newMemberIdSet = new Set(newMemberIds.map(id => id.toString()));
    
    for (const member of existingMembers) {
      // Skip new members (they were just added with unreadCount=1)
      if (newMemberIdSet.has(member.userId.toString())) continue;
      // Skip the sender
      if (member.userId === args.userId) continue;
      
      await ctx.db.patch(member._id, {
        unreadCount: (member.unreadCount || 0) + 1,
      });
    }

    console.log(`[sendServiceBroadcast] ===== BROADCAST COMPLETE FOR ORG: ${args.organizationId} =====\n`);

    return {
      messageId: msgId,
      conversationId: announcementConv._id,
      title: args.title,
      content: args.content,
      issuedAt: now,
    };
  },
});

// ─── MAINTENANCE MODE ──────────────────────────────────────────────────────────

/**
 * Enable maintenance mode for an organization
 * Site becomes inaccessible except for superadmin
 */
export const enableMaintenanceMode = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    title: v.string(),
    message: v.string(),
    startTime: v.number(),
    endTime: v.optional(v.number()),
    estimatedDuration: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Verify user is superadmin
    const user = await ctx.db.get(args.userId);
    if (!user || user.role !== "superadmin") {
      throw new Error("Only superadmin can enable maintenance mode");
    }

    const now = Date.now();

    // Check if maintenance mode already exists
    let existing = await ctx.db
      .query("maintenanceMode")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .first();

    if (existing) {
      // Update existing maintenance mode
      await ctx.db.patch(existing._id, {
        isActive: true,
        title: args.title,
        message: args.message,
        startTime: args.startTime,
        endTime: args.endTime,
        estimatedDuration: args.estimatedDuration,
        icon: args.icon || "🔧",
        enabledBy: args.userId,
        updatedAt: now,
      });
      return existing._id;
    }

    // Create new maintenance mode
    const maintenanceId = await ctx.db.insert("maintenanceMode", {
      organizationId: args.organizationId,
      isActive: true,
      title: args.title,
      message: args.message,
      startTime: args.startTime,
      endTime: args.endTime,
      estimatedDuration: args.estimatedDuration,
      icon: args.icon || "🔧",
      enabledBy: args.userId,
      createdAt: now,
      updatedAt: now,
    });

    return maintenanceId;
  },
});

/**
 * Disable maintenance mode for an organization
 */
export const disableMaintenanceMode = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify user is superadmin
    const user = await ctx.db.get(args.userId);
    if (!user || user.role !== "superadmin") {
      throw new Error("Only superadmin can disable maintenance mode");
    }

    const maintenance = await ctx.db
      .query("maintenanceMode")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .first();

    if (!maintenance) {
      throw new Error("Maintenance mode not found");
    }

    await ctx.db.patch(maintenance._id, {
      isActive: false,
      updatedAt: Date.now(),
    });

    return maintenance._id;
  },
});

/**
 * Get current maintenance mode status for organization
 */
export const getMaintenanceMode = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("maintenanceMode")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .first();
  },
});

/**
 * SUPERADMIN: Assign a user as admin of an organization
 * Used when a user signs up via Google without selecting an organization
 */
export const assignUserAsOrgAdmin = mutation({
  args: {
    superadminUserId: v.id("users"),
    userEmail: v.string(),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    // Verify caller is superadmin
    const superadmin = await ctx.db.get(args.superadminUserId);
    if (!superadmin || superadmin.email.toLowerCase() !== "romangulanyan@gmail.com") {
      throw new Error("Only superadmin can assign organization admins");
    }

    // Find user by email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail.toLowerCase()))
      .unique();

    if (!user) {
      throw new Error(`User with email ${args.userEmail} not found`);
    }

    // Verify org exists
    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    // Update user
    await ctx.db.patch(user._id, {
      organizationId: args.organizationId,
      role: "admin",
      updatedAt: Date.now(),
    });

    console.log(`[assignUserAsOrgAdmin] User ${args.userEmail} assigned as admin of org ${org.name}`);

    return {
      userId: user._id,
      email: args.userEmail,
      role: "admin",
      organizationId: args.organizationId,
    };
  },
});
