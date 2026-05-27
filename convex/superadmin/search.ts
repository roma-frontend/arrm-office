// @ts-nocheck — masks real type errors that need narrowing:
//   * unionised search results across different tables are accessed
//     uniformly via `.name`/`.email`/`.avatarUrl`, but some tables lack
//     those fields. A `type` discriminator + per-branch narrowing is needed.
// TODO(types): remove this directive once results are narrowed by table.
import { v } from 'convex/values';
import { query } from '../_generated/server';
import { Id } from '../_generated/dataModel';
import { api } from '../_generated/api';
import { MAX_PAGE_SIZE } from '../pagination';
import { getProfile } from '../lib/userProfile';

// Isolate API references at module level
const superadminApi = api.superadmin;

// ─── GLOBAL SEARCH ───────────────────────────────────────────────────────────
export const globalSearch = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const searchQuery = args.query.toLowerCase().trim();
    const limit = args.limit || 10;

    if (searchQuery.length < 2) {
      return {
        users: [],
        organizations: [],
        leaveRequests: [],
        driverRequests: [],
        tasks: [],
        supportTickets: [],
        total: 0,
      };
    }

    // OPTIMIZED: Add org-scoping when available to reduce dataset size
    const orgFilter = args.organizationId;

    // Parallel search across all tables
    const [users, organizations, leaveRequests, driverRequests, tasks, supportTickets] =
      await Promise.all([
        // Search users by email and name
        ctx.db
          .query('users')
          .withIndex('by_email')
          .filter((q) => q.eq(q.field('email'), searchQuery))
          .take(MAX_PAGE_SIZE),

        // Search organizations by slug and name
        ctx.db
          .query('organizations')
          .withIndex('by_slug')
          .filter((q) => q.eq(q.field('slug'), searchQuery))
          .take(MAX_PAGE_SIZE),

        // OPTIMIZED: Filter leave requests by org if provided
        orgFilter
          ? ctx.db
              .query('leaveRequests')
              .withIndex('by_org', (q) => q.eq('organizationId', orgFilter))
              .take(MAX_PAGE_SIZE)
          : ctx.db.query('leaveRequests').withIndex('by_status').take(MAX_PAGE_SIZE),

        // OPTIMIZED: Filter driver requests by org if provided
        orgFilter
          ? ctx.db
              .query('driverRequests')
              .withIndex('by_org', (q) => q.eq('organizationId', orgFilter))
              .take(MAX_PAGE_SIZE)
          : ctx.db.query('driverRequests').take(MAX_PAGE_SIZE),

        // OPTIMIZED: Filter tasks by org if provided
        orgFilter
          ? ctx.db
              .query('tasks')
              .withIndex('by_org', (q) => q.eq('organizationId', orgFilter))
              .take(MAX_PAGE_SIZE)
          : ctx.db.query('tasks').take(MAX_PAGE_SIZE),

        // Search support tickets
        ctx.db
          .query('supportTickets')
          .withIndex('by_ticket_number')
          .filter((q) => q.eq(q.field('ticketNumber'), args.query))
          .take(MAX_PAGE_SIZE),
      ]);

    // Filter and enrich results
    const filteredUsers = users
      .filter(
        (u) =>
          u.email.toLowerCase().includes(searchQuery) || u.name.toLowerCase().includes(searchQuery),
      )
      .slice(0, limit);

    const filteredOrgs = organizations
      .filter(
        (o) =>
          o.name.toLowerCase().includes(searchQuery) || o.slug.toLowerCase().includes(searchQuery),
      )
      .slice(0, limit);

    // OPTIMIZED: Batch load all user IDs needed for enrichment
    const leaveUserIds = [...new Set(leaveRequests.map((l) => l.userId))];
    const driverUserIds = [
      ...new Set(driverRequests.flatMap((d) => [d.requesterId, d.driverId]).filter(Boolean)),
    ];
    const taskUserIds = [
      ...new Set(tasks.flatMap((t) => [t.assignedTo, t.assignedBy]).filter(Boolean)),
    ];
    const ticketUserIds = [
      ...new Set(supportTickets.flatMap((t) => [t.createdBy, t.assignedTo]).filter(Boolean)),
    ];

    const allUserIdsToLoad = [...leaveUserIds, ...driverUserIds, ...taskUserIds, ...ticketUserIds];
    const uniqueUserIds = [...new Set(allUserIdsToLoad)];

    // Batch load all users at once
    const allUsers = await Promise.all(uniqueUserIds.map((id) => ctx.db.get(id)));
    const userEnrichmentMap = new Map(allUsers.filter(Boolean).map((u) => [u._id, u]));

    // Enrich leave requests
    const enrichedLeaves = leaveRequests
      .filter((l) => {
        const startDate = l.startDate.includes(searchQuery);
        const endDate = l.endDate.includes(searchQuery);
        return startDate || endDate;
      })
      .slice(0, limit)
      .map((leave) => {
        const user = userEnrichmentMap.get(leave.userId);
        return {
          ...leave,
          userName: user?.name || 'Unknown',
          userEmail: user?.email || '',
          userAvatar: user?.avatarUrl,
        };
      });

    // Enrich driver requests
    const enrichedDrivers = driverRequests
      .filter((d) => {
        const from = d.tripInfo?.from?.toLowerCase().includes(searchQuery);
        const to = d.tripInfo?.to?.toLowerCase().includes(searchQuery);
        const purpose = d.tripInfo?.purpose?.toLowerCase().includes(searchQuery);
        return from || to || purpose;
      })
      .slice(0, limit)
      .map((request) => {
        const requester = userEnrichmentMap.get(request.requesterId);
        const driver = userEnrichmentMap.get(request.driverId);
        return {
          ...request,
          requesterName: requester?.name || 'Unknown',
          requesterEmail: requester?.email || '',
          driverName: driver?.name || 'Unknown',
        };
      });

    // Enrich tasks
    const enrichedTasks = tasks
      .filter(
        (t) =>
          t.title.toLowerCase().includes(searchQuery) ||
          t.description?.toLowerCase().includes(searchQuery),
      )
      .slice(0, limit)
      .map((task) => {
        const assignee = task.assignedTo ? userEnrichmentMap.get(task.assignedTo) : null;
        const creator = userEnrichmentMap.get(task.assignedBy);
        return {
          ...task,
          assigneeName: assignee?.name || 'Unknown',
          creatorName: creator?.name || 'Unknown',
        };
      });

    // Enrich tickets
    const enrichedTickets = supportTickets
      .filter(
        (t) =>
          t.title.toLowerCase().includes(searchQuery) ||
          t.description.toLowerCase().includes(searchQuery) ||
          t.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase()),
      )
      .slice(0, limit)
      .map((ticket) => {
        const creator = userEnrichmentMap.get(ticket.createdBy);
        const assignee = ticket.assignedTo ? userEnrichmentMap.get(ticket.assignedTo) : null;
        return {
          ...ticket,
          creatorName: creator?.name || 'Unknown',
          creatorEmail: creator?.email || '',
          assigneeName: assignee?.name || null,
        };
      });

    return {
      users: filteredUsers,
      organizations: filteredOrgs,
      leaveRequests: enrichedLeaves,
      driverRequests: enrichedDrivers,
      tasks: enrichedTasks,
      supportTickets: enrichedTickets,
      total:
        filteredUsers.length +
        filteredOrgs.length +
        enrichedLeaves.length +
        enrichedDrivers.length +
        enrichedTasks.length +
        enrichedTickets.length,
    };
  },
});

/**
 * Quick search for Command Palette (Cmd+K)
 * Returns top 5 results for each category
 */
export const quickSearch = query({
  args: { query: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const fullResults = await ctx.runQuery(superadminApi.globalSearch, {
      query: args.query,
      limit: 5,
    });

    // Format for quick display
    return {
      users: fullResults.users.map((u: any) => ({
        id: u._id,
        type: 'user' as const,
        title: u.name,
        subtitle: u.email,
        organization: u.organizationId,
        icon: '👤',
      })),
      organizations: fullResults.organizations.map((o: any) => ({
        id: o._id,
        type: 'organization' as const,
        title: o.name,
        subtitle: `${o.plan} • ${o.slug}`,
        icon: '🏢',
      })),
      leaveRequests: fullResults.leaveRequests.map((l: any) => ({
        id: l._id,
        type: 'leave' as const,
        title: `${l.userName} - ${l.type}`,
        subtitle: `${l.startDate} → ${l.endDate} • ${l.status}`,
        icon: '📅',
      })),
      tasks: fullResults.tasks.map((t: any) => ({
        id: t._id,
        type: 'task' as const,
        title: t.title,
        subtitle: `${t.status} • ${t.priority}`,
        icon: '✅',
      })),
      tickets: fullResults.supportTickets.map((t: any) => ({
        id: t._id,
        type: 'ticket' as const,
        title: t.ticketNumber,
        subtitle: t.title,
        icon: '🎫',
      })),
    };
  },
});

/**
 * Search users by email prefix (for typeahead)
 */
export const searchUsersByPrefix = query({
  args: { prefix: v.string(), organizationId: v.optional(v.id('organizations')) },
  handler: async (ctx, args) => {
    const prefix = args.prefix.toLowerCase();

    if (args.organizationId) {
      const users = await ctx.db
        .query('users')
        .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
        .take(MAX_PAGE_SIZE);

      return users
        .filter(
          (u) =>
            u.email.toLowerCase().startsWith(prefix) || u.name.toLowerCase().startsWith(prefix),
        )
        .slice(0, 10)
        .map((u) => ({
          id: u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          avatarUrl: u.avatarUrl,
        }));
    } else {
      // Global search for superadmin
      const allUsers = await ctx.db.query('users').order('desc').take(MAX_PAGE_SIZE);

      return allUsers
        .filter(
          (u) =>
            u.email.toLowerCase().startsWith(prefix) || u.name.toLowerCase().startsWith(prefix),
        )
        .slice(0, 10)
        .map((u) => ({
          id: u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          organizationId: u.organizationId,
          avatarUrl: u.avatarUrl,
        }));
    }
  },
});
