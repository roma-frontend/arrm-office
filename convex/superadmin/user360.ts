import { v } from 'convex/values';
import { query } from '../_generated/server';
import { Id } from '../_generated/dataModel';
import { MAX_PAGE_SIZE } from '../pagination';
import { getProfile } from '../lib/userProfile';

// ─── USER 360 PROFILE ────────────────────────────────────────────────────────
/**
 * Get complete 360° view of a user
 * All data related to a single user in one place
 */
export const getUser360 = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('User not found');

    // Parallel fetch all related data
    const [
      leaves,
      tasks,
      driverRequests,
      notifications,
      loginAttempts,
      supportTickets,
      ticketComments,
      chatMessages,
      org,
    ] = await Promise.all([
      // Leave requests
      ctx.db
        .query('leaveRequests')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .take(MAX_PAGE_SIZE),

      // Tasks (assigned to user)
      ctx.db
        .query('tasks')
        .filter((q) => q.eq(q.field('assignedTo'), args.userId))
        .take(MAX_PAGE_SIZE),

      // Driver requests
      ctx.db
        .query('driverRequests')
        .withIndex('by_requester', (q) => q.eq('requesterId', args.userId))
        .take(MAX_PAGE_SIZE),

      // Notifications (last 50)
      ctx.db
        .query('notifications')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .order('desc')
        .take(50),

      // Login attempts (last 20)
      ctx.db
        .query('loginAttempts')
        .filter((q) => q.eq(q.field('userId'), args.userId))
        .order('desc')
        .take(20),

      // Support tickets (created or assigned)
      ctx.db
        .query('supportTickets')
        .filter((q) =>
          q.or(q.eq(q.field('createdBy'), args.userId), q.eq(q.field('assignedTo'), args.userId)),
        )
        .take(MAX_PAGE_SIZE),

      // Ticket comments
      ctx.db
        .query('ticketComments')
        .filter((q) => q.eq(q.field('authorId'), args.userId))
        .take(MAX_PAGE_SIZE),

      // Chat messages (last 100)
      ctx.db
        .query('chatMessages')
        .filter((q) => q.eq(q.field('senderId'), args.userId))
        .order('desc')
        .take(100),

      // Organization
      user.organizationId ? ctx.db.get(user.organizationId) : null,
    ]);

    // Enrich leaves with reviewer info
    const enrichedLeaves = await Promise.all(
      leaves.map(async (leave) => {
        const reviewer = leave.reviewedBy ? await ctx.db.get(leave.reviewedBy) : null;
        return {
          ...leave,
          reviewerName: reviewer?.name || null,
        };
      }),
    );

    // Enrich tasks with creator info (using assignedBy as creator)
    const enrichedTasks = await Promise.all(
      tasks.map(async (task) => {
        const creator = await ctx.db.get(task.assignedBy);
        return {
          ...task,
          creatorName: creator?.name || null,
        };
      }),
    );

    // Enrich driver requests with driver info
    const enrichedDriverRequests = await Promise.all(
      driverRequests.map(async (req) => {
        const driver = await ctx.db.get(req.driverId);
        const driverUser = driver ? await ctx.db.get(driver.userId) : null;
        const driverProfile = driver ? await getProfile(ctx, driver.userId) : null;
        return {
          ...req,
          driverName: driverUser?.name || null,
          driverPhone: (driverProfile?.phone ?? driverUser?.phone) || null,
        };
      }),
    );

    // Enrich support tickets
    const enrichedTickets = await Promise.all(
      supportTickets.map(async (ticket) => {
        const assignee = ticket.assignedTo ? await ctx.db.get(ticket.assignedTo) : null;
        return {
          ...ticket,
          assigneeName: assignee?.name || null,
        };
      }),
    );

    // Calculate statistics
    const stats = {
      totalLeaves: leaves.length,
      pendingLeaves: leaves.filter((l) => l.status === 'pending').length,
      approvedLeaves: leaves.filter((l) => l.status === 'approved').length,
      totalTasks: tasks.length,
      completedTasks: tasks.filter((t) => t.status === 'completed').length,
      totalDriverRequests: driverRequests.length,
      totalTickets: supportTickets.length,
      openTickets: supportTickets.filter((t) => t.status !== 'closed' && t.status !== 'resolved')
        .length,
      totalLoginAttempts: loginAttempts.length,
      failedLoginAttempts: loginAttempts.filter((l) => !l.success).length,
    };

    return {
      user,
      organization: org,
      leaves: enrichedLeaves.sort((a, b) => b.createdAt - a.createdAt),
      tasks: enrichedTasks.sort((a, b) => b.createdAt - a.createdAt),
      driverRequests: enrichedDriverRequests.sort((a, b) => b.startTime - a.startTime),
      notifications,
      loginAttempts,
      supportTickets: enrichedTickets.sort((a, b) => b.createdAt - a.createdAt),
      ticketComments: ticketComments.sort((a, b) => b.createdAt - a.createdAt),
      chatMessages: chatMessages.sort((a, b) => b.createdAt - a.createdAt),
      stats,
    };
  },
});
