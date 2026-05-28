import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireRole } from './lib/rbac';
import { withAuth } from './lib/withAuth';
import { MAX_PAGE_SIZE } from './pagination';
import { DEFAULT_LIST_CAP, XLARGE_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';

/**
 * Get cost analysis data for admin dashboard
 */
export const getCostAnalysis = query({
  args: {
    period: v.optional(v.union(v.literal('month'), v.literal('quarter'), v.literal('year'))),
    organizationId: v.optional(v.id('organizations')),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const period = args.period || 'month';

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'quarter') {
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
    } else {
      startDate = new Date(now.getFullYear(), 0, 1);
    }

    const startTimestamp = startDate.getTime();

    // Get all approved leave requests in the period
    let leaves = await ctx.db
      .query('leaveRequests')
      .filter((q: any) =>
        q.and(q.eq(q.field('status'), 'approved'), q.gte(q.field('createdAt'), startTimestamp)),
      )
      .order('desc')
      .take(MAX_PAGE_SIZE);

    // Filter by organization if provided
    if (args.organizationId) {
      leaves = leaves.filter((l: any) => l.organizationId === args.organizationId);
    }

    // Get all users
    const users = (await ctx.db.query('users').order('desc').take(MAX_PAGE_SIZE)).filter(
      (u) => u.role !== 'superadmin',
    );
    const userMap = new Map(users.map((u: any) => [u._id, u]));

    // Load profiles in parallel
    const profiles = await Promise.all(users.map((u: any) => getProfile(ctx, u._id)));
    const profileMap = new Map(users.map((u, i) => [u._id, profiles[i]]));

    // Calculate costs by department
    const departmentCosts = new Map<string, number>();
    const typeCosts = new Map<string, number>();
    let totalCost = 0;

    for (const leave of leaves) {
      const user = userMap.get(leave.userId);
      if (!user) continue;
      const profile = profileMap.get(leave.userId);

      // Simplified cost calculation: assume average daily cost
      // In reality, you'd want to store salary information
      const employeeType = profile?.employeeType ?? user.employeeType;
      const dailyCost = employeeType === 'contractor' ? 150 : 200; // USD per day
      const cost = leave.days * dailyCost;

      totalCost += cost;

      // By department
      const dept = profile?.department ?? user.department ?? 'Unknown';
      departmentCosts.set(dept, (departmentCosts.get(dept) || 0) + cost);

      // By type
      typeCosts.set(leave.type, (typeCosts.get(leave.type) || 0) + cost);
    }

    return {
      totalCost,
      byDepartment: Array.from(departmentCosts.entries()).map(([name, cost]) => ({
        name,
        cost,
        percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0,
      })),
      byType: Array.from(typeCosts.entries()).map(([type, cost]) => ({
        type,
        cost,
        percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0,
      })),
      totalDays: leaves.reduce((sum: any, l: any) => sum + l.days, 0),
      totalLeaves: leaves.length,
    };
  }),
});

/**
 * Detect conflicts in leave schedules
 * OPTIMIZED: Uses interval-based approach instead of daily iteration
 */
export const detectConflicts = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId } = args;
    // Get all approved and pending leaves
    let leaves = await ctx.db
      .query('leaveRequests')
      .filter((q: any) =>
        q.or(q.eq(q.field('status'), 'approved'), q.eq(q.field('status'), 'pending')),
      )
      .order('desc')
      .take(MAX_PAGE_SIZE);

    // Filter by organization if provided
    if (organizationId) {
      leaves = leaves.filter((l: any) => l.organizationId === organizationId);
    }

    // Get all users
    const users = (await ctx.db.query('users').order('desc').take(MAX_PAGE_SIZE)).filter(
      (u) => u.role !== 'superadmin',
    );
    const userMap = new Map(users.map((u: any) => [u._id, u]));

    // Load profiles in parallel
    const dcProfiles = await Promise.all(users.map((u: any) => getProfile(ctx, u._id)));
    const dcProfileMap = new Map(users.map((u, i) => [u._id, dcProfiles[i]]));

    // Group leaves by department
    const deptLeaves = new Map<string, typeof leaves>();
    for (const leave of leaves) {
      const user = userMap.get(leave.userId);
      if (!user) continue;
      const profile = dcProfileMap.get(leave.userId);
      const dept = profile?.department ?? user.department ?? 'Unknown';
      if (!deptLeaves.has(dept)) deptLeaves.set(dept, []);
      deptLeaves.get(dept)!.push(leave);
    }

    const conflicts: Array<{
      id: string;
      department: string;
      date: string;
      employeesOut: string[];
      severity: 'critical' | 'warning' | 'info';
      recommendationKey: string;
      recommendationParams: Record<string, string | number>;
    }> = [];

    // OPTIMIZED: Use interval-based approach for each department
    for (const [dept, deptLeaveList] of deptLeaves.entries()) {
      const deptUsers = users.filter((u: any) => {
        const p = dcProfileMap.get(u._id);
        return (p?.department ?? u.department ?? 'Unknown') === dept;
      });
      const deptSize = deptUsers.length;
      if (deptSize === 0) continue;

      // Collect all interval events (start/end dates)
      const events: { date: number; type: 'start' | 'end'; employeeName: string }[] = [];

      for (const leave of deptLeaveList) {
        const user = userMap.get(leave.userId);
        if (!user) continue;
        const start = new Date(leave.startDate).getTime();
        const end = new Date(leave.endDate).getTime() + 86400000; // +1 day for inclusive end

        events.push({ date: start, type: 'start', employeeName: user.name });
        events.push({ date: end, type: 'end', employeeName: user.name });
      }

      // Sort events by date
      events.sort((a: any, b: any) => a.date - b.date);

      // Process events at each unique date
      const uniqueDates = [...new Set(events.map((e: any) => e.date))].sort(
        (a: any, b: any) => a - b,
      );
      const activeEmployees = new Set<string>();
      let eventIndex = 0;

      for (const date of uniqueDates) {
        // Process all events at this date
        while (eventIndex < events.length && events[eventIndex]!.date === date) {
          const event = events[eventIndex]!;
          if (event.type === 'start') {
            activeEmployees.add(event.employeeName);
          } else {
            activeEmployees.delete(event.employeeName);
          }
          eventIndex++;
        }

        // Check if this date falls within a reasonable range (last 365 days to next 365 days)
        const now = Date.now();
        const oneYearAgo = now - 365 * 86400000;
        const oneYearFromNow = now + 365 * 86400000;
        if (date < oneYearAgo || date > oneYearFromNow) continue;

        const outCount = activeEmployees.size;
        const percentage = deptSize > 0 ? (outCount / deptSize) * 100 : 0;

        if (percentage >= 50) {
          const dateStr = new Date(date).toISOString().split('T')[0];
          if (!dateStr) continue;
          conflicts.push({
            id: `${dept}-${dateStr}`,
            department: dept,
            date: dateStr,
            employeesOut: Array.from(activeEmployees),
            severity: 'critical',
            recommendationKey: 'conflicts.criticalRecommendation',
            recommendationParams: { outCount, total: deptSize, percentage: percentage.toFixed(0) },
          });
        } else if (percentage >= 30) {
          const dateStr = new Date(date).toISOString().split('T')[0];
          if (!dateStr) continue;
          conflicts.push({
            id: `${dept}-${dateStr}`,
            department: dept,
            date: dateStr,
            employeesOut: Array.from(activeEmployees),
            severity: 'warning',
            recommendationKey: 'conflicts.warningRecommendation',
            recommendationParams: { outCount, total: deptSize, percentage: percentage.toFixed(0) },
          });
        }
      }
    }

    return conflicts.sort((a: any, b: any) => {
      if (a.severity === b.severity) return a.date.localeCompare(b.date);
      return a.severity === 'critical' ? -1 : 1;
    });
  }),
});

/**
 * Get smart suggestions for leave scheduling
 */
export const getSmartSuggestions = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId } = args;
    const suggestions: Array<{
      id: string;
      titleKey: string;
      descriptionKey: string;
      descriptionParams: Record<string, string | number>;
      impact: 'high' | 'medium' | 'low';
      category: 'optimization' | 'cost' | 'conflict' | 'policy';
    }> = [];

    // Get all users and leaves
    let users = (await ctx.db.query('users').order('desc').take(MAX_PAGE_SIZE)).filter(
      (u) => u.role !== 'superadmin',
    );
    let leaves = await ctx.db
      .query('leaveRequests')
      .filter((q: any) => q.eq(q.field('status'), 'approved'))
      .order('desc')
      .take(MAX_PAGE_SIZE);

    // Filter by organization if provided
    if (organizationId) {
      users = users.filter((u: any) => u.organizationId === organizationId);
      leaves = leaves.filter((l: any) => l.organizationId === organizationId);
    }

    // Load profiles in parallel
    const ssProfiles = await Promise.all(users.map((u: any) => getProfile(ctx, u._id)));
    const ssProfileMap = new Map(users.map((u, i) => [u._id, ssProfiles[i]]));

    // Suggestion 1: Users with high leave balances
    const highBalanceUsers = users.filter((u: any) => {
      const p = ssProfileMap.get(u._id);
      const totalBalance =
        (p?.paidLeaveBalance ?? u.paidLeaveBalance) +
        (p?.sickLeaveBalance ?? u.sickLeaveBalance) +
        (p?.familyLeaveBalance ?? u.familyLeaveBalance);
      return totalBalance > 30; // More than 30 days total
    });

    if (highBalanceUsers.length > 0) {
      suggestions.push({
        id: 'high-balance',
        titleKey: 'suggestion.highBalanceTitle',
        descriptionKey: 'suggestion.highBalanceDesc',
        descriptionParams: { count: highBalanceUsers.length },
        impact: 'medium',
        category: 'policy',
      });
    }

    // Suggestion 2: Users with low balances
    const lowBalanceUsers = users.filter((u: any) => {
      const p = ssProfileMap.get(u._id);
      const totalBalance =
        (p?.paidLeaveBalance ?? u.paidLeaveBalance) +
        (p?.sickLeaveBalance ?? u.sickLeaveBalance) +
        (p?.familyLeaveBalance ?? u.familyLeaveBalance);
      return totalBalance < 5; // Less than 5 days total
    });

    if (lowBalanceUsers.length > 0) {
      suggestions.push({
        id: 'low-balance',
        titleKey: 'suggestion.lowBalanceTitle',
        descriptionKey: 'suggestion.lowBalanceDesc',
        descriptionParams: { count: lowBalanceUsers.length },
        impact: 'high',
        category: 'policy',
      });
    }

    // Suggestion 3: Departments with no planned leaves
    const userMap = new Map(users.map((u: any) => [u._id, u]));
    const deptLeaves = new Map<string, number>();
    for (const leave of leaves) {
      const user = userMap.get(leave.userId);
      if (user) {
        const p = ssProfileMap.get(user._id);
        const dept = p?.department ?? user.department ?? 'Unknown';
        deptLeaves.set(dept, (deptLeaves.get(dept) || 0) + 1);
      }
    }

    const allDepts = new Set(
      users.map((u: any) => {
        const p = ssProfileMap.get(u._id);
        return p?.department ?? u.department ?? 'Unknown';
      }),
    );
    const deptsWithoutLeaves = Array.from(allDepts).filter((d: any) => !deptLeaves.has(d));

    if (deptsWithoutLeaves.length > 0) {
      suggestions.push({
        id: 'no-planned-leaves',
        titleKey: 'suggestion.noPlannedLeavesTitle',
        descriptionKey: 'suggestion.noPlannedLeavesDesc',
        descriptionParams: { departments: deptsWithoutLeaves.join(', ') },
        impact: 'medium',
        category: 'optimization',
      });
    }

    // Suggestion 4: Cost optimization
    const contractorLeaves = leaves.filter((l: any) => {
      const user = users.find((u: any) => u._id === l.userId);
      if (!user) return false;
      const p = ssProfileMap.get(user._id);
      return (p?.employeeType ?? user?.employeeType) === 'contractor';
    });

    if (contractorLeaves.length > 0) {
      const totalDays = contractorLeaves.reduce((sum: any, l: any) => sum + l.days, 0);
      const estimatedCost = totalDays * 150; // $150/day for contractors

      suggestions.push({
        id: 'contractor-costs',
        titleKey: 'suggestion.contractorCostsTitle',
        descriptionKey: 'suggestion.contractorCostsDesc',
        descriptionParams: {
          count: contractorLeaves.length,
          totalDays,
          cost: estimatedCost.toLocaleString(),
        },
        impact: 'high',
        category: 'cost',
      });
    }

    return suggestions;
  }),
});

/**
 * Get calendar export data
 */
export const getCalendarExportData = query({
  args: {
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    organizationId: v.optional(v.id('organizations')),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    // Get all approved leaves
    let leaves = await ctx.db
      .query('leaveRequests')
      .filter((q: any) => q.eq(q.field('status'), 'approved'))
      .order('desc')
      .take(MAX_PAGE_SIZE);

    // Filter by organization if provided
    if (args.organizationId) {
      leaves = leaves.filter((l: any) => l.organizationId === args.organizationId);
    }

    // Get all users
    const users = (await ctx.db.query('users').order('desc').take(MAX_PAGE_SIZE)).filter(
      (u) => u.role !== 'superadmin',
    );
    const userMap = new Map(users.map((u: any) => [u._id, u]));

    // Load profiles in parallel
    const ceProfiles = await Promise.all(users.map((u: any) => getProfile(ctx, u._id)));
    const ceProfileMap = new Map(users.map((u, i) => [u._id, ceProfiles[i]]));

    // Filter by date range if provided
    let filteredLeaves = leaves;
    if (args.startDate || args.endDate) {
      filteredLeaves = leaves.filter((leave: any) => {
        if (args.startDate && leave.endDate < args.startDate) return false;
        if (args.endDate && leave.startDate > args.endDate) return false;
        return true;
      });
    }

    // Format for calendar export
    return filteredLeaves.map((leave: any) => {
      const user = userMap.get(leave.userId);
      const profile = ceProfileMap.get(leave.userId);
      return {
        id: leave._id,
        title: `${user?.name || 'Unknown'} - ${leave.type} leave`,
        startDate: leave.startDate,
        endDate: leave.endDate,
        description: leave.reason,
        userName: user?.name || 'Unknown',
        department: profile?.department ?? user?.department ?? 'Unknown',
        type: leave.type,
      };
    });
  }),
});

// ─── SERVICE BROADCASTS ────────────────────────────────────────────────────────

/**
 * Send a service broadcast message from superadmin to all users in an organization.
 * Creates a system announcements channel if it doesn't exist.
 */
export const sendServiceBroadcast = mutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'), // the superadmin making the request
    title: v.string(), // e.g. "System Maintenance"
    content: v.string(), // the announcement message
    icon: v.optional(v.string()), // emoji e.g. "⚠️", "ℹ️", "🔧", "🎉"
    scheduledFor: v.optional(v.number()), // optional timestamp for scheduling
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    await requireRole(ctx, args.userId, 'superadmin');
    // Get or create the "System Announcements" group chat for this organization
    let announcementConv = await ctx.db
      .query('chatConversations')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .filter((q: any) =>
        q.and(
          q.eq(q.field('type'), 'group'),
          q.eq(q.field('name'), 'System Announcements'),
          q.eq(q.field('isDeleted'), false),
        ),
      )
      .first();

    // If system announcements channel doesn't exist, create it
    if (!announcementConv) {
      const now = Date.now();
      const convId = await ctx.db.insert('chatConversations', {
        organizationId: args.organizationId,
        type: 'group',
        name: 'System Announcements',
        description: 'Official company-wide announcements and service messages',
        createdBy: args.userId,
        createdAt: now,
        updatedAt: now,
        isArchived: false,
        isDeleted: false,
      });

      console.warn(
        `[sendServiceBroadcast] Created new System Announcements conversation: ${convId}`,
      );

      // Add all active, approved users to this channel
      // NOTE: Capped at DEFAULT_LIST_CAP — sufficient for all expected org sizes.
      const users = await ctx.db
        .query('users')
        .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
        .take(DEFAULT_LIST_CAP);

      console.warn(`[sendServiceBroadcast] Initial creation: Found ${users.length} total users`);

      let addedCount = 0;
      for (const u of users) {
        if (u.isActive && u.isApproved) {
          console.warn(
            `[sendServiceBroadcast] Adding initial member: ${u.name} (active:${u.isActive}, approved:${u.isApproved})`,
          );
          await ctx.db.insert('chatMembers', {
            conversationId: convId,
            userId: u._id,
            organizationId: args.organizationId,
            role: u._id === args.userId ? 'owner' : 'member',
            unreadCount: 1, // Mark as unread for new members
            isMuted: false,
            joinedAt: now,
          });
          addedCount++;
        } else {
          console.warn(
            `[sendServiceBroadcast] Skipping user ${u.name} - active:${u.isActive}, approved:${u.isApproved}`,
          );
        }
      }

      // IMPORTANT: Always add the superadmin who created the channel as owner, even if not approved
      const superadminUser = (await ctx.db.get(args.userId)) as any as any;
      if (superadminUser) {
        const superadminAlreadyAdded = users.some(
          (u) => u._id === args.userId && u.isActive && u.isApproved,
        );
        if (!superadminAlreadyAdded) {
          console.warn(
            `[sendServiceBroadcast] Adding superadmin to channel as owner: ${superadminUser.name}`,
          );
          await ctx.db.insert('chatMembers', {
            conversationId: convId,
            userId: args.userId,
            organizationId: args.organizationId,
            role: 'owner',
            unreadCount: 0, // Superadmin already saw it
            isMuted: false,
            joinedAt: now,
          });
          addedCount++;
        }
      }

      console.warn(
        `[sendServiceBroadcast] Added ${addedCount} members to newly created System Announcements`,
      );

      // Create the conversation object to use
      announcementConv = {
        _id: convId,
        _creationTime: now,
        organizationId: args.organizationId,
        type: 'group' as const,
        name: 'System Announcements',
        description: 'Official company-wide announcements and service messages',
        createdBy: args.userId,
        createdAt: now,
        updatedAt: now,
        isArchived: false,
        isDeleted: false,
      };
    }

    // Verify we have the conversation
    if (!announcementConv) {
      throw new Error('Failed to create or find system announcements channel');
    }

    console.warn(
      `[sendServiceBroadcast] Organization ${args.organizationId} - System Announcements conversation: ${announcementConv._id}`,
    );

    // Ensure all active, approved users are members of System Announcements channel
    // (needed for new users who joined after the channel was created)
    const allUsers = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    console.warn(`[sendServiceBroadcast] Total users in org: ${allUsers.length}`);
    const activeApprovedUsers = allUsers.filter((u: any) => u.isActive && u.isApproved);
    console.warn(`[sendServiceBroadcast] Active & approved users: ${activeApprovedUsers.length}`);
    activeApprovedUsers.forEach((u: any) =>
      console.warn(`  - ${u.name} (${u.email}) - active:${u.isActive}, approved:${u.isApproved}`),
    );

    const existingMembers = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation', (q) => q.eq('conversationId', announcementConv._id))
      .take(DEFAULT_LIST_CAP);

    const existingMemberIds = new Set(existingMembers.map((m: any) => m.userId.toString()));
    const newMemberIds: Id<'users'>[] = [];

    console.warn(
      `[sendServiceBroadcast] Existing members: ${existingMembers.length}, Active users: ${allUsers.filter((u: any) => u.isActive && u.isApproved).length}`,
    );

    // Add active, approved users
    for (const u of allUsers) {
      if (u.isActive && u.isApproved) {
        const userIdStr = u._id.toString();

        if (!existingMemberIds.has(userIdStr)) {
          console.warn(`[sendServiceBroadcast] Adding new member: ${u.name} (${u._id})`);
          await ctx.db.insert('chatMembers', {
            conversationId: announcementConv._id,
            userId: u._id,
            organizationId: args.organizationId,
            role: u._id === args.userId ? 'owner' : 'member',
            unreadCount: 1,
            isMuted: false,
            joinedAt: Date.now(),
          });
          newMemberIds.push(u._id);
        } else {
          console.warn(`[sendServiceBroadcast] User ${u.name} already a member`);
        }
      }
    }

    // IMPORTANT: Always ensure superadmin is a member as owner
    const superadminIdStr = args.userId.toString();
    if (!existingMemberIds.has(superadminIdStr)) {
      const superadminUser = (await ctx.db.get(args.userId)) as any as any;
      if (superadminUser) {
        console.warn(
          `[sendServiceBroadcast] Ensuring superadmin is member: ${superadminUser.name}`,
        );
        await ctx.db.insert('chatMembers', {
          conversationId: announcementConv._id,
          userId: args.userId,
          organizationId: args.organizationId,
          role: 'owner',
          unreadCount: 0, // Superadmin already saw it
          isMuted: false,
          joinedAt: Date.now(),
        });
        newMemberIds.push(args.userId);
      }
    }

    console.warn(
      `[sendServiceBroadcast] Added ${newMemberIds.length} new members to System Announcements`,
    );

    // Send the service broadcast message
    const now = Date.now();
    const broadcastMessage = {
      conversationId: announcementConv._id,
      organizationId: args.organizationId,
      senderId: args.userId,
      type: 'system' as const,
      content: args.content,
      isServiceBroadcast: true,
      broadcastTitle: args.title,
      broadcastIcon: args.icon || 'ℹ️',
      createdAt: now,
      // Include optional fields to ensure message is complete
      readBy: [] as Array<{ userId: Id<'users'>; readAt: number }>,
      reactions: undefined,
      mentionedUserIds: undefined,
      threadCount: 0,
      isEdited: false,
      isDeleted: false,
      isPinned: false,
    };

    const msgId = await ctx.db.insert('chatMessages', broadcastMessage);

    console.warn(
      `[sendServiceBroadcast] Message created: ${msgId} in conversation ${announcementConv._id}`,
    );

    // Update conversation last message
    const preview = args.content.length > 100 ? args.content.slice(0, 100) + '…' : args.content;
    await ctx.db.patch(announcementConv._id, {
      lastMessageAt: now,
      lastMessageText: `[${args.title}] ${preview}`,
      lastMessageSenderId: args.userId,
      updatedAt: now,
    });

    // Mark as unread for existing members (except the sender)
    // New members already have unreadCount=1 from being added above
    const newMemberIdSet = new Set(newMemberIds.map((id: any) => id.toString()));

    for (const member of existingMembers) {
      // Skip new members (they were just added with unreadCount=1)
      if (newMemberIdSet.has(member.userId.toString())) continue;
      // Skip the sender
      if (member.userId === args.userId) continue;

      await ctx.db.patch(member._id, {
        unreadCount: (member.unreadCount || 0) + 1,
      });
    }

    console.warn(
      `[sendServiceBroadcast] ===== BROADCAST COMPLETE FOR ORG: ${args.organizationId} =====\n`,
    );

    return {
      messageId: msgId,
      conversationId: announcementConv._id,
      title: args.title,
      content: args.content,
      issuedAt: now,
    };
  }),
});

// ─── MAINTENANCE MODE ──────────────────────────────────────────────────────────

/**
 * Enable maintenance mode for an organization
 * Site becomes inaccessible except for superadmin
 */
export const enableMaintenanceMode = mutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    title: v.string(),
    message: v.string(),
    startTime: v.number(),
    endTime: v.optional(v.number()),
    estimatedDuration: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    await requireRole(ctx, args.userId, 'superadmin');

    const now = Date.now();

    // Check if maintenance mode already exists
    const existing = await ctx.db
      .query('maintenanceMode')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
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
        icon: args.icon || '🔧',
        enabledBy: args.userId,
        updatedAt: now,
      });
      return existing._id;
    }

    // Create new maintenance mode
    const maintenanceId = await ctx.db.insert('maintenanceMode', {
      organizationId: args.organizationId,
      isActive: true,
      title: args.title,
      message: args.message,
      startTime: args.startTime,
      endTime: args.endTime,
      estimatedDuration: args.estimatedDuration,
      icon: args.icon || '🔧',
      enabledBy: args.userId,
      createdAt: now,
      updatedAt: now,
    });

    return maintenanceId;
  }),
});

/**
 * Disable maintenance mode for an organization
 */
export const disableMaintenanceMode = mutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    await requireRole(ctx, args.userId, 'superadmin');

    const maintenance = await ctx.db
      .query('maintenanceMode')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .first();

    if (!maintenance) {
      throw new Error('Maintenance mode not found');
    }

    await ctx.db.patch(maintenance._id, {
      isActive: false,
      updatedAt: Date.now(),
    });

    return maintenance._id;
  }),
});

/**
 * Get current maintenance mode status for organization
 */
export const getMaintenanceMode = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    return await ctx.db
      .query('maintenanceMode')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .first();
  }),
});

/**
 * SUPERADMIN: Assign a user as admin of an organization
 * Used when a user signs up via Google without selecting an organization
 */
export const assignUserAsOrgAdmin = mutation({
  args: {
    superadminUserId: v.id('users'),
    userEmail: v.string(),
    organizationId: v.id('organizations'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    await requireRole(ctx, args.superadminUserId, 'superadmin');

    // Find user by email
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.userEmail.toLowerCase()))
      .unique();

    if (!user) {
      throw new Error(`User with email ${args.userEmail} not found`);
    }

    // Verify org exists
    const org = (await ctx.db.get(args.organizationId)) as any as any;
    if (!org) {
      throw new Error('Organization not found');
    }

    // Update user
    await ctx.db.patch(user._id, {
      organizationId: args.organizationId,
      role: 'admin',
      updatedAt: Date.now(),
    });

    return {
      userId: user._id,
      email: args.userEmail,
      role: 'admin',
      organizationId: args.organizationId,
    };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPERADMIN DASHBOARD — All organizations statistics
// NOTE: Uses XLARGE caps for superadmin global view. If org count or user count
// grows beyond XLARGE_LIST_CAP, migrate to aggregated materialized views or pagination.
// ─────────────────────────────────────────────────────────────────────────────
export const getSuperadminDashboard = query({
  handler: async (ctx) => {
    // Get all organizations
    const orgs = await ctx.db.query('organizations').take(XLARGE_LIST_CAP);

    // Batch load all data (superadmin needs global view)
    const allUsers = (await ctx.db.query('users').take(XLARGE_LIST_CAP)).filter(
      (u) => u.role !== 'superadmin',
    );
    const allLeaves = await ctx.db.query('leaveRequests').take(XLARGE_LIST_CAP);
    const allSubscriptions = await ctx.db.query('subscriptions').take(XLARGE_LIST_CAP);

    // Create lookup maps
    const usersByOrg = new Map<
      string,
      Array<{
        _id: Id<'users'>;
        organizationId?: Id<'organizations'>;
        isActive: boolean;
        isApproved: boolean;
      }>
    >();
    const leavesByOrg = new Map<
      string,
      Array<{
        _id: Id<'leaveRequests'>;
        organizationId?: Id<'organizations'>;
        status: string;
      }>
    >();
    const subscriptionByOrg = new Map<
      string,
      {
        plan: string;
        status: string;
        currentPeriodEnd?: number;
        organizationId: Id<'organizations'>;
      }
    >();

    allUsers.forEach((user: any) => {
      // Skip superadmins from organization counts
      if (user.role === 'superadmin') return;

      const orgId = user.organizationId?.toString() || 'no-org';
      if (!usersByOrg.has(orgId)) usersByOrg.set(orgId, []);
      usersByOrg.get(orgId)!.push(user);
    });

    allLeaves.forEach((leave: any) => {
      const orgId = leave.organizationId?.toString() || 'no-org';
      if (!leavesByOrg.has(orgId)) leavesByOrg.set(orgId, []);
      leavesByOrg.get(orgId)!.push(leave);
    });

    allSubscriptions.forEach((sub: any) => {
      if (!sub.organizationId) return; // Skip subscriptions without organization
      subscriptionByOrg.set(sub.organizationId.toString(), {
        plan: sub.plan,
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd,
        organizationId: sub.organizationId,
      });
    });

    // Build dashboard data
    const dashboard = orgs.map((org: any) => {
      const orgId = org._id.toString();
      const orgUsers = usersByOrg.get(orgId) || [];
      const orgLeaves = leavesByOrg.get(orgId) || [];
      const subscription = subscriptionByOrg.get(orgId);

      const activeUsers = orgUsers.filter((u: any) => u.isActive && u.isApproved);
      const pendingUsers = orgUsers.filter((u: any) => !u.isApproved);
      const pendingLeaves = orgLeaves.filter((l: any) => l.status === 'pending');
      const approvedLeaves = orgLeaves.filter((l: any) => l.status === 'approved');

      // Calculate revenue based on plan
      const monthlyRevenue =
        subscription?.plan === 'starter'
          ? 29
          : subscription?.plan === 'professional'
            ? 79
            : subscription?.plan === 'enterprise'
              ? 199
              : 0;

      // Calculate utilization
      const utilization =
        org.employeeLimit > 0 ? Math.round((activeUsers.length / org.employeeLimit) * 100) : 0;

      return {
        organization: {
          _id: org._id,
          name: org.name,
          slug: org.slug,
          plan: org.plan,
          isActive: org.isActive,
          createdAt: org.createdAt,
        },
        stats: {
          totalUsers: orgUsers.length,
          activeUsers: activeUsers.length,
          pendingUsers: pendingUsers.length,
          employeeLimit: org.employeeLimit,
          utilization,
        },
        leaves: {
          total: orgLeaves.length,
          pending: pendingLeaves.length,
          approved: approvedLeaves.length,
          rejected: orgLeaves.filter((l: any) => l.status === 'rejected').length,
        },
        subscription: subscription
          ? {
              plan: subscription.plan,
              status: subscription.status,
              monthlyRevenue,
              currentPeriodEnd: subscription.currentPeriodEnd,
            }
          : null,
      };
    });

    // Sort by revenue (highest first)
    dashboard.sort((a: any, b: any) => {
      const aRevenue = a.subscription?.monthlyRevenue || 0;
      const bRevenue = b.subscription?.monthlyRevenue || 0;
      return bRevenue - aRevenue;
    });

    // Calculate totals
    const totalStats = {
      organizations: orgs.length,
      activeOrganizations: orgs.filter((o: any) => o.isActive).length,
      totalUsers: allUsers.filter((u: any) => u.organizationId).length,
      totalRevenue: dashboard.reduce(
        (sum: any, d: any) => sum + (d.subscription?.monthlyRevenue || 0),
        0,
      ),
      pendingLeaves: dashboard.reduce((sum: any, d: any) => sum + d.leaves.pending, 0),
    };

    return {
      organizations: dashboard,
      totalStats,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECURED MUTATIONS — use ctx.auth.getUserIdentity() (no client userId trust)
// ═══════════════════════════════════════════════════════════════════════════════

export const secureAssignUserAsOrgAdmin = mutation({
  args: { userEmail: v.string(), organizationId: v.id('organizations') },
  handler: withAuth<
    MutationCtx,
    { userEmail: string; organizationId: Id<'organizations'> },
    Id<'users'>
  >({ minimumRole: 'superadmin' }, async (ctx, { userEmail, organizationId }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', userEmail.toLowerCase()))
      .unique();
    if (!user) throw new Error(`User with email ${userEmail} not found`);

    const org = (await ctx.db.get(organizationId)) as any as any;
    if (!org) throw new Error('Organization not found');

    await ctx.db.patch(user._id, { organizationId, role: 'admin', updatedAt: Date.now() });
    return user._id;
  }),
});

export const secureEnableMaintenanceMode = mutation({
  args: { organizationId: v.id('organizations'), reason: v.optional(v.string()) },
  handler: withAuth<MutationCtx, { organizationId: Id<'organizations'>; reason?: string }, void>(
    { minimumRole: 'superadmin' },
    async (ctx, { organizationId, reason }, caller) => {
      const now = Date.now();
      await ctx.db.insert('maintenanceMode', {
        organizationId,
        isActive: true,
        title: 'Scheduled Maintenance',
        message: reason ?? 'System maintenance in progress',
        startTime: now,
        enabledBy: caller._id,
        createdAt: now,
        updatedAt: now,
      });
    },
  ),
});

export const secureDisableMaintenanceMode = mutation({
  args: { organizationId: v.id('organizations') },
  handler: withAuth<MutationCtx, { organizationId: Id<'organizations'> }, void>(
    { minimumRole: 'superadmin' },
    async (ctx, { organizationId }) => {
      const active = await ctx.db
        .query('maintenanceMode')
        .filter((q: any) =>
          q.and(q.eq(q.field('organizationId'), organizationId), q.eq(q.field('isActive'), true)),
        )
        .first();
      if (active) {
        await ctx.db.patch(active._id, { isActive: false, updatedAt: Date.now() });
      }
    },
  ),
});
